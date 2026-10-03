import * as http from "node:http";
import * as os from "node:os";
import { URL } from "node:url";
import { gotScraping } from "got-scraping";
import { findHianimeAnime, hianimeEpisodes, hianimeGetStreamUrl } from "./hianime.js";
import { watchRepo } from "../db/repositories/watchRepo.js";
import { client } from "../db/client.js";
import * as net from "node:net";

// prefer a real LAN address the phone can reach. VPN tunnels (tailscale/warp
// utun*, 100.64/10 CGNAT) come first in some orders and are unreachable from
// the phone. 172.20.10.x is the iOS Personal Hotspot subnet.
function getLanIp() {
  const candidates: { name: string; address: string }[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === "IPv4" && !iface.internal) candidates.push({ name, address: iface.address });
    }
  }
  const isTunnel = (c: { name: string; address: string }) =>
    /^(utun|tun|tap|ipsec|ppp|bridge|awdl|llw)/.test(c.name) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(c.address);
  const isPrivate = (a: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a);
  const lan = candidates.filter(c => !isTunnel(c));
  return (
    lan.find(c => c.address.startsWith("172.20.10."))?.address ??
    lan.find(c => isPrivate(c.address))?.address ??
    lan[0]?.address ??
    null
  );
}

export async function startCastServer(
  hianimeId: string, // used as search query for findHianimeAnime
  anilistId: number,
  startEpisode: number,
  totalEpisodes: number | null
): Promise<{ url: string; stop: () => void }> {
  const lanIp = getLanIp();
  if (!lanIp) throw new Error("No LAN IP found");

  const anime = await findHianimeAnime(hianimeId);
  if (!anime) throw new Error("Anime not found on stream provider");

  const eps = await hianimeEpisodes(anime.id);

  const dbData = await client.get();
  const existingEntry = dbData.entries[anilistId];
  const cover = existingEntry?.cover || null;

  const streamCache = new Map<number, any>();

  // Fetch hls.js once at server start so Chrome works fully offline (no CDN needed).
  // Falls back to empty string — the page already guards with `typeof Hls !== 'undefined'`.
  let hlsJsBundle = "";
  try {
    const r = await gotScraping.get("https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js");
    hlsJsBundle = r.body;
  } catch {
    // No internet — hls.js unavailable; iOS Safari plays natively anyway.
  }

  let lastActive = Date.now();
  let server: http.Server;
  let idleInterval: NodeJS.Timeout;

  const stop = () => {
    clearInterval(idleInterval);
    server.close();
  };

  idleInterval = setInterval(() => {
    if (Date.now() - lastActive > 15 * 60 * 1000) {
      stop();
    }
  }, 60 * 1000);

  const parseBody = (req: http.IncomingMessage): Promise<any> => {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", chunk => { body += chunk.toString(); });
      req.on("end", () => {
        try { resolve(JSON.parse(body)); } catch (e) { resolve({}); }
      });
      req.on("error", reject);
    });
  };

  /**
   * Proxy a binary segment (ts/mp4 frag) through to the response.
   * Key invariants:
   *   - decompress: false → raw bytes flow through, no mismatch with content-encoding
   *   - Only content-type and content-length are forwarded; everything else
   *     (transfer-encoding, content-encoding, keep-alive, etc.) is dropped.
   *   - CORS header is always set so browsers don't block the XHR.
   */
  function proxySegment(upstream: string, referer: string, res: http.ServerResponse) {
    try {
      const stream = gotScraping.stream(upstream, {
        headers: { referer },
        decompress: false,
      });
      stream.once("response", (r: any) => {
        const headers: http.OutgoingHttpHeaders = {
          "access-control-allow-origin": "*",
          "content-type": (r.headers["content-type"] as string) || "video/mp2t",
        };
        if (r.headers["content-length"]) {
          headers["content-length"] = r.headers["content-length"] as string;
        }
        res.writeHead(r.statusCode || 200, headers);
      });
      stream.on("error", () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      // phone seeks or closes the tab → stop downloading from the CDN
      res.on("close", () => stream.destroy());
      stream.pipe(res);
    } catch {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    }
  }

  /** Rewrite all URI lines in an m3u8 through the /seg proxy. */
  function rewriteM3u8(content: string, referer: string, baseUrl: string): string {
    // Normalise CRLF so line splitting always works.
    const lines = content.replace(/\r\n/g, "\n").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (line && !line.startsWith("#")) {
        let url = line;
        if (!url.startsWith("http")) url = baseUrl + url;
        lines[i] = `/seg?u=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`;
      }
    }
    return lines.join("\n");
  }

  server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url || "/", `http://${req.headers.host}`);
      const pathname = parsedUrl.pathname;

      // CORS headers just in case
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.method === "GET" && pathname === "/") {
        lastActive = Date.now();
        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <title>Casting: ${anime.title}</title>
  <style>
    body { background: #000; color: #fff; font-family: sans-serif; margin: 0; padding: 0; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
    #header { padding: 15px; text-align: center; background: #111; flex-shrink: 0; }
    #title { font-weight: bold; font-size: 1.2em; margin-bottom: 5px; }
    #ep-title { color: #aaa; font-size: 0.9em; }
    #video-container { flex-grow: 1; display: flex; align-items: center; justify-content: center; background: #000; position: relative; }
    video { width: 100%; height: 100%; max-height: 100%; object-fit: contain; }
    #controls { display: flex; padding: 15px; background: #111; flex-shrink: 0; gap: 10px; }
    button { flex: 1; padding: 15px; border: none; border-radius: 8px; background: #333; color: white; font-size: 1.1em; cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    button:active:not(:disabled) { background: #555; }
    #message { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.8); z-index: 10; font-size: 1.2em; text-align: center; padding: 20px; display: none; }
  </style>
  <!-- hls.js served locally — no CDN, works on hotspot / offline -->
  <script src="/hls.js"></script>
</head>
<body>
  <div id="header">
    <div id="title">${anime.title}</div>
    <div id="ep-title">Loading...</div>
  </div>
  <div id="video-container">
    <video id="video" controls autoplay playsinline></video>
    <div id="message"></div>
  </div>
  <div id="controls">
    <button id="prev-btn" disabled>Previous</button>
    <button id="next-btn" disabled>Next</button>
  </div>
  <script>
    const video = document.getElementById("video");
    const prevBtn = document.getElementById("prev-btn");
    const nextBtn = document.getElementById("next-btn");
    const epTitle = document.getElementById("ep-title");
    const message = document.getElementById("message");

    let currentEp = ${startEpisode};
    let isLastEp = false;
    let hls = null;

    async function loadEpisode(ep) {
      try {
        epTitle.textContent = "Loading Episode " + ep + "...";
        const res = await fetch("/episode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ episode: ep })
        });
        const data = await res.json();
        
        currentEp = ep;
        isLastEp = data.isLast;
        epTitle.textContent = data.title;
        prevBtn.disabled = currentEp <= 1;
        nextBtn.disabled = isLastEp;

        if (data.subUrl) {
          const track = document.createElement("track");
          track.kind = "captions";
          track.label = "English";
          track.srclang = "en";
          track.src = data.subUrl;
          track.default = true;
          video.innerHTML = "";
          video.appendChild(track);
        } else {
          video.innerHTML = "";
        }

        if (hls) {
          hls.destroy();
          hls = null;
        }

        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          // Native HLS — iOS Safari, no internet required.
          video.src = data.url;
        } else if (typeof Hls !== 'undefined' && Hls.isSupported()) {
          // Fallback via hls.js CDN — requires internet, best-effort only.
          hls = new Hls();
          hls.loadSource(data.url);
          hls.attachMedia(video);
        } else {
          message.textContent = "HLS not supported on this browser.";
          message.style.display = "flex";
        }
        
        video.load();
        video.play().catch(e => console.log("Autoplay blocked", e));
      } catch (err) {
        epTitle.textContent = "Error loading episode";
        console.error(err);
      }
    }

    // Initial load
    loadEpisode(currentEp);

    // Auto-advance
    video.addEventListener("ended", () => {
      if (isLastEp) {
        fetch("/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ episode: currentEp })
        });
        message.textContent = "Season Complete";
        message.style.display = "flex";
      } else {
        loadEpisode(currentEp + 1);
      }
    });

    // Buttons
    prevBtn.addEventListener("click", () => {
      if (currentEp > 1) loadEpisode(currentEp - 1);
    });
    nextBtn.addEventListener("click", () => {
      if (!isLastEp) loadEpisode(currentEp + 1);
    });

    // Progress reporting
    // sendProgress always fires regardless of paused state (used for pause/seeked events).
    // reportProgress only fires when playing (used by the interval to avoid stale pings while paused).
    function sendProgress() {
      if (!video.duration) return;
      fetch("/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episode: currentEp, pos: video.currentTime, dur: video.duration })
      }).catch(() => {});
    }
    function reportProgress() {
      if (video.paused || !video.duration) return;
      sendProgress();
    }

    setInterval(reportProgress, 10000);
    // Pause fires when the user locks their phone — save immediately, not waiting for interval.
    video.addEventListener("pause", () => {
      if (video.duration && video.currentTime < video.duration) {
        sendProgress();
      }
    });
    video.addEventListener("seeked", sendProgress);

    // Last-attempt flush: beacon fires even if the tab is force-killed.
    // Browsers don't guarantee delivery, but it works in the common case.
    function beaconProgress() {
      if (!video.duration) return;
      navigator.sendBeacon("/progress", JSON.stringify({
        episode: currentEp,
        pos: video.currentTime,
        dur: video.duration
      }));
    }
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") beaconProgress();
    });
    window.addEventListener("pagehide", beaconProgress);
  </script>
</body>
</html>
`;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
        return;
      }

      if (req.method === "POST" && pathname === "/episode") {
        lastActive = Date.now();
        const body = await parseBody(req);
        let ep = body.episode;
        if (typeof ep !== "number") {
          res.writeHead(400); res.end("Bad Request"); return;
        }

        if (totalEpisodes !== null) {
          ep = Math.max(1, Math.min(ep, totalEpisodes));
        }

        const targetEp = eps.find(e => e.epNo === String(ep));
        if (!targetEp) {
          res.writeHead(404); res.end("Episode not found"); return;
        }

        try {
          let streamInfo = streamCache.get(ep);
          if (!streamInfo) {
            streamInfo = await hianimeGetStreamUrl(targetEp.dataId, "sub");
            streamCache.set(ep, streamInfo);
          }
          const playlistUrl = `/playlist.m3u8?ep=${ep}`;
          const subUrl = streamInfo.subtitleUrl ? `/subs.vtt?ep=${ep}` : null;
          
          let isLast = false;
          if (totalEpisodes !== null) {
            isLast = ep >= totalEpisodes;
          } else {
            // max epNo from eps
            const maxEp = Math.max(...eps.map(e => parseInt(e.epNo) || 0));
            isLast = ep >= maxEp;
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            url: playlistUrl,
            subUrl,
            title: `Episode ${ep}`,
            isLast
          }));
        } catch (e) {
          res.writeHead(500); res.end("Failed to fetch stream");
        }
        return;
      }

      if (req.method === "POST" && pathname === "/progress") {
        lastActive = Date.now();
        const body = await parseBody(req);
        if (typeof body.episode === "number" && typeof body.pos === "number" && typeof body.dur === "number") {
          await watchRepo.saveProgress(
            { anilistId, title: anime.title, cover, totalEpisodes, playerQuery: hianimeId },
            body.episode, body.pos, body.dur
          );
        }
        res.writeHead(200); res.end("OK");
        return;
      }

      if (req.method === "POST" && pathname === "/complete") {
        lastActive = Date.now();
        const body = await parseBody(req);
        if (typeof body.episode === "number") {
          await watchRepo.markEpisodeCompleted(anilistId, body.episode);
        }
        res.writeHead(200); res.end("OK");
        return;
      }

      if (req.method === "GET" && pathname === "/hls.js") {
        res.writeHead(200, { "content-type": "application/javascript", "cache-control": "public, max-age=86400" });
        res.end(hlsJsBundle);
        return;
      }

      if (req.method === "GET" && pathname === "/playlist.m3u8") {
        const epStr = parsedUrl.searchParams.get("ep");
        if (!epStr) { res.writeHead(400); res.end(); return; }
        
        const targetEp = eps.find(e => e.epNo === epStr);
        if (!targetEp) { res.writeHead(404); res.end(); return; }

        try {
          const epNum = parseInt(epStr, 10);
          let streamInfo = streamCache.get(epNum);
          if (!streamInfo) {
            streamInfo = await hianimeGetStreamUrl(targetEp.dataId, "sub");
            streamCache.set(epNum, streamInfo);
          }
          const m3u8Res = await gotScraping.get(streamInfo.videoUrl, { headers: { referer: streamInfo.referer } });
          const baseUrl = streamInfo.videoUrl.substring(0, streamInfo.videoUrl.lastIndexOf('/') + 1);
          const rewritten = rewriteM3u8(m3u8Res.body, streamInfo.referer, baseUrl);
          res.writeHead(200, {
            "content-type": "application/vnd.apple.mpegurl",
            "access-control-allow-origin": "*",
          });
          res.end(rewritten);
        } catch (e) {
          res.writeHead(500); res.end();
        }
        return;
      }

      if (req.method === "GET" && pathname === "/seg") {
        const u = parsedUrl.searchParams.get("u");
        const ref = parsedUrl.searchParams.get("referer") || "";
        if (!u) { res.writeHead(400); res.end(); return; }

        // Variant playlists need URL rewriting; raw segments are passed through as-is.
        if (u.includes(".m3u8")) {
          try {
            const m3u8Res = await gotScraping.get(u, { headers: { referer: ref } });
            const baseUrl = u.substring(0, u.lastIndexOf("/") + 1);
            const rewritten = rewriteM3u8(m3u8Res.body, ref, baseUrl);
            res.writeHead(200, {
              "content-type": "application/vnd.apple.mpegurl",
              "access-control-allow-origin": "*",
            });
            res.end(rewritten);
          } catch {
            res.writeHead(502); res.end();
          }
          return;
        }

        // Binary segment — proxy with clean headers (decompress:false avoids content-encoding mismatch).
        proxySegment(u, ref, res);
        return;
      }

      if (req.method === "GET" && pathname === "/subs.vtt") {
        const epStr = parsedUrl.searchParams.get("ep");
        if (!epStr) { res.writeHead(400); res.end(); return; }

        const targetEp = eps.find(e => e.epNo === epStr);
        if (!targetEp) { res.writeHead(404); res.end(); return; }

        try {
          const epNum = parseInt(epStr, 10);
          let streamInfo = streamCache.get(epNum);
          if (!streamInfo) {
            streamInfo = await hianimeGetStreamUrl(targetEp.dataId, "sub");
            streamCache.set(epNum, streamInfo);
          }
          if (!streamInfo.subtitleUrl) {
            res.writeHead(404); res.end(); return;
          }
          proxySegment(streamInfo.subtitleUrl, streamInfo.referer, res);
        } catch {
          if (!res.headersSent) res.writeHead(500);
          res.end();
        }
        return;
      }

      res.writeHead(404); res.end("Not Found");
    } catch (err) {
      console.error("Cast server error", err);
      if (!res.headersSent) {
        res.writeHead(500); res.end();
      }
    }
  });

  return new Promise((resolve) => {
    server.listen(0, "0.0.0.0", () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({
        url: `http://${lanIp}:${port}/`,
        stop
      });
    });
  });
}
