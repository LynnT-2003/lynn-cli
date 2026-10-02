import { execa } from "execa";

const BASE_API = "https://hianime.at";
const AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const CIPHERS = "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305";
const TLS13_CIPHERS = "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256";

import { gotScraping } from "got-scraping";

async function curl(url: string, extraArgs: string[] = []) {
  const headers: Record<string, string> = {};
  for (let i = 0; i < extraArgs.length; i++) {
    if (extraArgs[i] === "-H" && extraArgs[i+1]) {
      const parts = extraArgs[i+1].split(":");
      headers[parts[0].trim()] = parts.slice(1).join(":").trim();
      i++;
    } else if (extraArgs[i] === "-e" && extraArgs[i+1]) {
      headers["referer"] = extraArgs[i+1];
      i++;
    }
  }

  try {
    const { body } = await gotScraping.get(url, { headers, timeout: { request: 15000 } });
    if (body.toLowerCase().includes("just a moment")) {
      throw new Error(`Cloudflare blocked or request failed (HTTP 403)`);
    }
    return body;
  } catch (err: any) {
    if (err.response?.statusCode >= 400) {
      throw new Error(`Cloudflare blocked or request failed (HTTP ${err.response.statusCode})`);
    }
    throw new Error(`Failed to fetch from hianime.at: ${err.message}`);
  }
}

export type HianimeResult = { id: string; title: string };
export async function hianimeSearch(query: string): Promise<HianimeResult[]> {
  const html = await curl(`${BASE_API}/search?keyword=${encodeURIComponent(query)}`);

  const main = html.split('id="main-sidebar"')[0] || html;

  const results: HianimeResult[] = [];
  const regex = /<h3 class="film-name">\s*<a href="[^"]*\/([^"/]*)"\s*title="([^"]*)"/g;
  let m;
  while ((m = regex.exec(main)) !== null) {
    const id = m[1]!;
    const title = m[2]!.replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    results.push({ id, title });
  }
  return results;
}

export type HianimeEpisode = { dataId: string; epNo: string };
export async function hianimeEpisodes(animeId: string): Promise<HianimeEpisode[]> {
  const numericId = animeId.split('-').pop();
  const res = await curl(`${BASE_API}/api/theme/episode/list/${numericId}`);
  const html = JSON.parse(res).html;

  const results: HianimeEpisode[] = [];
  const regex = /data-number="([^"]*)"[\s\S]*?data-id="([0-9]+)"/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    results.push({ epNo: m[1]!, dataId: m[2]! });
  }
  return results;
}

function b64Decode(str: string): Buffer {
  return Buffer.from(str, "base64");
}

function deobfuscateBlob(b64: string): string {
  const bytes = b64Decode(b64);
  const key = Buffer.from("otaku-embed-v1");
  const out = Buffer.alloc(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i]! ^ key[i % key.length]!;
  }
  return out.toString("utf8");
}

export type StreamData = {
  videoUrl: string;
  subtitleUrl: string | null;
  referer: string;
  allQualities: { resolution: string; url: string }[];
};

export async function hianimeGetStreamUrl(epDataId: string, mode: "sub" | "dub" = "sub"): Promise<StreamData> {
  const res = await curl(`${BASE_API}/api/theme/episode/servers?episodeId=${epDataId}`);
  const serversHtml = JSON.parse(res).html;

  const modeRegex = new RegExp(`data-type="${mode}"[\\s\\S]*?data-server-name="ZokoAnime"[\\s\\S]*?data-hash="([^"]*)"`);
  const hashMatch = serversHtml.match(modeRegex);
  if (!hashMatch) throw new Error(`No ZokoAnime server found for mode ${mode}`);

  const embedUrl = b64Decode(hashMatch[1]!).toString("utf8");
  const refererMatch = embedUrl.match(/^(https?:\/\/[^/]*)/);
  const referer = refererMatch ? refererMatch[1] + "/" : "";

  console.error("embedUrl:", JSON.stringify(embedUrl));
  const embedHtml = await curl(embedUrl);
  const blobMatch = embedHtml.match(/window\.__P="([^"]*)"/);
  if (!blobMatch) throw new Error("Could not find obfuscated blob in embed page");

  const jsonStr = deobfuscateBlob(blobMatch[1]!);
  const json = JSON.parse(jsonStr);

  const masterUrl = json.src;
  if (!masterUrl || !masterUrl.includes(".m3u8")) throw new Error("Invalid master m3u8 url");

  const subMatch = json.subtitles?.find((s: any) => s.default === true)?.src ||
    json.subtitles?.find((s: any) => s.lang === "English")?.src || null;

  const m3u8Content = await curl(masterUrl, ["-e", referer]);

  const qualities: { resolution: string; url: string }[] = [];
  const lines = m3u8Content.split('\n');
  let currentRes = "";
  const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      const resMatch = line.match(/RESOLUTION=\d+x(\d+)/);
      currentRes = resMatch ? `${resMatch[1]}p` : "unknown";
    } else if (line && !line.startsWith('#')) {
      let url = line;
      if (!url.startsWith('http')) {
        url = baseUrl + url;
      }
      if (currentRes) {
        qualities.push({ resolution: currentRes, url });
        currentRes = "";
      }
    }
  }

  return {
    videoUrl: masterUrl,
    subtitleUrl: subMatch,
    referer,
    allQualities: qualities.sort((a, b) => parseInt(b.resolution) - parseInt(a.resolution))
  };
}

export async function findHianimeAnime(title: string): Promise<HianimeResult | null> {
  const results = await hianimeSearch(title);
  if (results.length > 0) return results[0]!;

  const words = title.split(' ');
  if (words.length > 2) {
    const fallback = await hianimeSearch(words.slice(0, 2).join(' '));
    if (fallback.length > 0) return fallback[0]!;
  }
  return null;
}
