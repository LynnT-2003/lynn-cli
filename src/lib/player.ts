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
  onLog?: (msg: string) => void;
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

async function resolvePlayerBin(onLog?: (msg: string) => void): Promise<string> {
  const players = ["mpv", "iina", "vlc"];
  for (const p of players) {
    onLog?.(`Looking for ${p}...`);
    try {
      await execa("sh", ["-c", `command -v ${p}`]);
      onLog?.(`Found ${p}!`);
      return p;
    } catch {
      onLog?.(`${p} not found.`);
      continue;
    }
  }
  
  if (process.platform === "darwin") {
    onLog?.(`Looking for IINA.app...`);
    try {
      await execa("sh", ["-c", 'command -v "/Applications/IINA.app/Contents/MacOS/iina-cli"']);
      onLog?.(`Found IINA.app!`);
      return "/Applications/IINA.app/Contents/MacOS/iina-cli";
    } catch {
      onLog?.(`IINA.app not found.`);
    }
  }
  
  throw new PlayerError("No player found (mpv, vlc, iina). Please install one.");
}

export async function getPlayerInfo(): Promise<{ bin: string, tracks: boolean } | null> {
  try {
    const bin = await resolvePlayerBin();
    return {
      bin: bin.includes("iina") ? "iina" : bin,
      tracks: bin === "mpv" || bin.includes("iina"),
    };
  } catch {
    return null;
  }
}

export async function launchPlayer(opts: PlayerOptions, extraArgs: string[] = [], onLog?: (msg: string) => void) {
  const selectedPlayer = await resolvePlayerBin(onLog);
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
  return { cp };
}

export async function playWithTracking(opts: PlayTrackingOptions): Promise<PlayTrackingResult> {
  const selectedPlayer = await resolvePlayerBin(opts.onLog);

  opts.onLog?.("Searching stream provider for anime...");
  const anime = await findHianimeAnime(opts.query);
  if (!anime) throw new PlayerError("Anime not found on stream provider");
  
  opts.onLog?.("Fetching episodes...");
  const eps = await hianimeEpisodes(anime.id);
  const targetEp = eps.find(e => e.epNo === String(opts.episode));
  if (!targetEp) throw new PlayerError(`Episode ${opts.episode} not found`);
  
  opts.onLog?.("Extracting stream URL...");
  const streamInfo = await hianimeGetStreamUrl(targetEp.dataId, "sub");

  const playerOpts: PlayerOptions = {
    videoUrl: streamInfo.videoUrl,
    subtitleUrl: streamInfo.subtitleUrl,
    referer: streamInfo.referer,
    title: anime.title,
    episodeNo: String(opts.episode),
  };

  opts.onLog?.(`Preparing to launch ${selectedPlayer.includes('iina') ? 'iina' : selectedPlayer}...`);

  // We now enable IPC tracking for IINA as well
  if (selectedPlayer !== "mpv" && !selectedPlayer.includes("iina")) {
    opts.onLog?.("Player does not support IPC tracking. Launching without tracking.");
    await launchPlayer(playerOpts, [], opts.onLog);
    return { pos: 0, dur: 0, finished: false };
  }

  const sockPath = path.join("/tmp", `lynn-mpv-${Date.now()}.sock`);
  const extraArgs: string[] = [];
  
  if (selectedPlayer.includes("iina")) {
    extraArgs.push(`--mpv-input-ipc-server=${sockPath}`);
  } else {
    extraArgs.push(`--input-ipc-server=${sockPath}`);
  }
  
  if (opts.startAt !== undefined && opts.startAt > 5) {
    extraArgs.push(selectedPlayer.includes("iina") ? `--mpv-start=${Math.floor(opts.startAt)}` : `--start=${Math.floor(opts.startAt)}`);
  }

  opts.onLog?.("Starting player process...");
  const { cp } = await launchPlayer(playerOpts, extraArgs, opts.onLog);
  
  opts.onLog?.(`Waiting for IPC socket connection at ${sockPath}...`);

  let socket: net.Socket | null = null;
  let pos = 0;
  let dur = 0;

  try {
    let connected = false;
    
    // Check if the process exited early
    let processExited = false;
    cp.on("exit", () => { processExited = true; });
    
    for (let i = 0; i < 30; i++) {
      if (processExited) break;
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
      if (processExited) {
        opts.onLog?.("Player exited before socket could connect. Tracking disabled for this session.");
        return { pos: 0, dur: 0, finished: false };
      }
      throw new PlayerError("Timeout waiting for MPV IPC socket");
    }
    
    opts.onLog?.("IPC Connected! Tracking progress...");

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
