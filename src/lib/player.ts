import net from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { execa } from "execa";

export type PlayEpisodeOptions = {
  query: string;
  episode: number;
  startAt?: number;
  onPositionUpdate: (pos: number, dur: number) => void;
};

export type PlayEpisodeResult = {
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

export async function playEpisode({
  query,
  episode,
  startAt,
  onPositionUpdate
}: PlayEpisodeOptions): Promise<PlayEpisodeResult> {
  try {
    await execa("which", ["mpv"]);
  } catch {
    throw new PlayerError("install with: brew install mpv");
  }

  try {
    await execa("which", ["ani-cli"]);
  } catch {
    throw new PlayerError("ani-cli not found in PATH");
  }

  const sockPath = path.join(os.tmpdir(), `mpv-lynn-${Date.now()}-${Math.random().toString(36).slice(2)}.sock`);
  
  let playerFlags = `--input-ipc-server=${sockPath}`;
  if (startAt !== undefined && startAt > 5) {
    playerFlags += ` --start=${Math.floor(startAt)}`;
  }

  const env = {
    ...process.env,
    ANI_CLI_PLAYER: "mpv",
    ANI_CLI_PLAYER_FLAGS: playerFlags,
  };

  const cp = execa("ani-cli", ["--exit-after-play", "-S", "1", "-e", String(episode), query], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    reject: false,
  });

  let socket: net.Socket | null = null;
  let pos = 0;
  let dur = 0;
  let saveTimer: NodeJS.Timeout | null = null;

  try {
    let attempts = 0;
    let cpExited = false;
    cp.then(() => { cpExited = true; });

    while (attempts < 60 && !cpExited) {
      if (fs.existsSync(sockPath)) {
        try {
          socket = net.connect(sockPath);
          break;
        } catch {
          // Socket might not be ready to accept connections yet
        }
      }
      await new Promise(r => setTimeout(r, 500));
      attempts++;
    }

    if (socket) {
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

      saveTimer = setInterval(() => {
        if (pos > 0) onPositionUpdate(pos, dur);
      }, 10000);
    } else if (!cpExited) {
      throw new PlayerError("Timeout waiting for mpv IPC socket");
    }

    await cp;

    const finished = dur > 0 && (pos / dur > 0.9 || dur - pos < 90);
    return { pos, dur, finished };
  } finally {
    if (saveTimer) clearInterval(saveTimer);
    if (socket) socket.destroy();
    if (fs.existsSync(sockPath)) {
      try {
        fs.unlinkSync(sockPath);
      } catch {}
    }
  }
}
