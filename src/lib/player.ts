import { execa } from "execa";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { findHianimeAnime, hianimeEpisodes, hianimeGetStreamUrl } from "./hianime.js";

export type PlayerOptions = {
  videoUrl: string;
  referer: string;
  subtitleUrl: string | null;
  title: string;
  episodeNo: string;
};

export type PlayTrackingOptions = {
  query: string;
  episode: number;
  startAt?: number;
};

export type PlayTrackingResult = {
  pos: number;
  dur: number;
  finished: boolean;
};

export class PlayerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerError";
  }
}

async function resolvePlayerBin(): Promise<string> {
  const players = ["mpv", "iina", "vlc"];
  for (const p of players) {
    try {
      await execa("sh", ["-c", `command -v ${p}`]);
      return p;
    } catch {
      continue;
    }
  }
  
  if (process.platform === "darwin") {
    try {
      await execa("sh", ["-c", 'command -v "/Applications/IINA.app/Contents/MacOS/iina-cli"']);
      return "/Applications/IINA.app/Contents/MacOS/iina-cli";
    } catch {
      // ignore
    }
  }
  
  throw new PlayerError("No player found (mpv, vlc, iina). Please install one.");
}

export async function getPlayerInfo(): Promise<{ bin: string, tracks: boolean } | null> {
  try {
    const bin = await resolvePlayerBin();
    return {
      bin: bin.includes("iina") ? "iina" : bin,
      tracks: bin === "mpv",
    };
  } catch {
    return null;
  }
}

export async function launchPlayer(opts: PlayerOptions, extraArgs: string[] = []) {
  const selectedPlayer = await resolvePlayerBin();
  const mediaTitle = `${opts.title} Episode ${opts.episodeNo}`;
  let args: string[] = [];

  if (selectedPlayer.includes("iina")) {
    const subArg = opts.subtitleUrl ? opts.subtitleUrl.replace(/:/g, "\\:") : null;
    args = [
      `--mpv-referrer=${opts.referer}`,
      ...(subArg ? [`--mpv-sub-files=${subArg}`] : []),
      `--mpv-force-media-title=${mediaTitle}`,
      "--no-stdin",
      "--keep-running",
      ...extraArgs.filter(a => a.startsWith("--mpv-")).map(a => a),
      opts.videoUrl
    ];
  } else if (selectedPlayer === "mpv") {
    args = [
      `--referrer=${opts.referer}`,
      ...(opts.subtitleUrl ? [`--sub-file=${opts.subtitleUrl}`] : []),
      `--force-media-title=${mediaTitle}`,
      ...extraArgs,
      opts.videoUrl
    ];
  } else if (selectedPlayer === "vlc") {
    args = [
      `--http-referrer=${opts.referer}`,
      `--meta-title=${mediaTitle}`,
      opts.videoUrl,
      ...(opts.subtitleUrl ? [`:input-slave=${opts.subtitleUrl}`] : [])
    ];
  }

  const cp = execa(selectedPlayer, args, { detached: true, stdio: "ignore" });
  cp.unref();
  return cp;
}

export async function playWithTracking(opts: PlayTrackingOptions): Promise<PlayTrackingResult> {
  const selectedPlayer = await resolvePlayerBin();

  const anime = await findHianimeAnime(opts.query);
  if (!anime) throw new PlayerError("Anime not found on stream provider");
  const eps = await hianimeEpisodes(anime.id);
  const targetEp = eps.find(e => e.epNo === String(opts.episode));
  if (!targetEp) throw new PlayerError(`Episode ${opts.episode} not found`);
  const streamInfo = await hianimeGetStreamUrl(targetEp.dataId, "sub");

  const playerOpts: PlayerOptions = {
    videoUrl: streamInfo.videoUrl,
    subtitleUrl: streamInfo.subtitleUrl,
    referer: streamInfo.referer,
    title: anime.title,
    episodeNo: String(opts.episode),
  };

  if (selectedPlayer !== "mpv") {
    await launchPlayer(playerOpts);
    return { pos: 0, dur: 0, finished: false };
  }

  const sockPath = path.join(os.tmpdir(), `mpv-lynn-${Date.now()}-${Math.random().toString(36).slice(2)}.sock`);
  const extraArgs: string[] = [`--input-ipc-server=${sockPath}`];
  
  if (opts.startAt !== undefined && opts.startAt > 5) {
    extraArgs.push(`--start=${Math.floor(opts.startAt)}`);
  }

  await launchPlayer(playerOpts, extraArgs);

  let socket: net.Socket | null = null;
  let pos = 0;
  let dur = 0;

  try {
    let connected = false;
    for (let i = 0; i < 20; i++) {
      try {
        await fs.access(sockPath);
        socket = net.connect(sockPath);
        await new Promise<void>((resolve, reject) => {
          socket!.once("connect", resolve);
          socket!.once("error", reject);
        });
        connected = true;
        break;
      } catch {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    if (!connected || !socket) {
      throw new PlayerError("Timeout waiting for MPV IPC socket");
    }

    socket.write(JSON.stringify({ command: ["observe_property", 1, "time-pos"] }) + "\n");
    socket.write(JSON.stringify({ command: ["observe_property", 2, "duration"] }) + "\n");

    let buffer = "";
    socket.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.event === "property-change") {
            if (msg.name === "time-pos" && typeof msg.data === "number") {
              pos = msg.data;
            } else if (msg.name === "duration" && typeof msg.data === "number") {
              dur = msg.data;
            }
          }
        } catch {}
      }
    });

    socket.on("error", () => {}); // Handle connection dropped gracefully

    await new Promise<void>((resolve) => {
      socket!.once("close", () => resolve());
    });

    const finished = dur > 0 && (pos / dur > 0.9 || dur - pos < 90);
    return { pos, dur, finished };
  } finally {
    if (socket && !socket.destroyed) {
      socket.destroy();
    }
    try {
      await fs.unlink(sockPath);
    } catch {}
  }
}
