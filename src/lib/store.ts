import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type WatchStatus = "watching" | "planning" | "completed" | "dropped";

export type StoreEntry = {
  title: string;
  cover: string;
  totalEpisodes: number | null;
  status: WatchStatus;
  lastEpisode: number;
  resumeEpisode: number | null;
  positionSeconds: number;
  durationSeconds: number;
  playerQuery: string;
  updatedAt: string;
};

export type HistoryEntry = {
  id: number;
  ep: number;
  at: string;
  secondsWatched: number;
};

export type StoreData = {
  version: 1;
  entries: Record<number, StoreEntry>;
  history: HistoryEntry[];
};

let storeData: StoreData = {
  version: 1,
  entries: {},
  history: [],
};

function getStoreDir(): string {
  if (process.env.XDG_DATA_HOME) {
    return path.join(process.env.XDG_DATA_HOME, "lynn-cli");
  }
  return path.join(os.homedir(), ".local", "share", "lynn-cli");
}

function getStorePath(): string {
  return path.join(getStoreDir(), "library.json");
}

export function loadLibrary(): void {
  const dir = getStoreDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const p = getStorePath();
  if (!fs.existsSync(p)) return;

  try {
    const text = fs.readFileSync(p, "utf-8");
    const data = JSON.parse(text);
    if (data.version === 1) {
      storeData = data;
    }
  } catch (err) {
    try {
      fs.copyFileSync(p, p + ".bak");
    } catch {}
    storeData = { version: 1, entries: {}, history: [] };
  }
}

function saveStore(): void {
  const p = getStorePath();
  const tempP = p + ".tmp" + Date.now();
  try {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tempP, JSON.stringify(storeData, null, 2), "utf-8");
    fs.renameSync(tempP, p);
  } catch (err) {
    try { fs.unlinkSync(tempP); } catch {}
  }
}

export function getEntry(id: number): StoreEntry | undefined {
  return storeData.entries[id];
}

export function setStatus(id: number, status: WatchStatus): void {
  if (storeData.entries[id]) {
    storeData.entries[id].status = status;
    storeData.entries[id].updatedAt = new Date().toISOString();
    saveStore();
  }
}

export function saveProgress(
  anime: { id: number; title: string; cover: string; totalEpisodes: number | null; playerQuery: string },
  ep: number,
  pos: number,
  dur: number
): void {
  if (!storeData.entries[anime.id]) {
    storeData.entries[anime.id] = {
      title: anime.title,
      cover: anime.cover,
      totalEpisodes: anime.totalEpisodes,
      status: "watching",
      lastEpisode: 0,
      resumeEpisode: ep,
      positionSeconds: pos,
      durationSeconds: dur,
      playerQuery: anime.playerQuery,
      updatedAt: new Date().toISOString(),
    };
  } else {
    const entry = storeData.entries[anime.id];
    entry.status = "watching";
    entry.resumeEpisode = ep;
    entry.positionSeconds = pos;
    entry.durationSeconds = dur;
    entry.totalEpisodes = anime.totalEpisodes ?? entry.totalEpisodes;
    entry.updatedAt = new Date().toISOString();
  }
  saveStore();
}

export function markEpisodeCompleted(
  anime: { id: number; title: string; cover: string; totalEpisodes: number | null; playerQuery: string },
  ep: number
): void {
  if (!storeData.entries[anime.id]) {
    storeData.entries[anime.id] = {
      title: anime.title,
      cover: anime.cover,
      totalEpisodes: anime.totalEpisodes,
      status: "watching",
      lastEpisode: ep,
      resumeEpisode: null,
      positionSeconds: 0,
      durationSeconds: 0,
      playerQuery: anime.playerQuery,
      updatedAt: new Date().toISOString(),
    };
  } else {
    const entry = storeData.entries[anime.id];
    entry.lastEpisode = Math.max(entry.lastEpisode, ep);
    entry.resumeEpisode = null;
    entry.positionSeconds = 0;
    entry.durationSeconds = 0;
    entry.totalEpisodes = anime.totalEpisodes ?? entry.totalEpisodes;
    entry.updatedAt = new Date().toISOString();

    if (entry.totalEpisodes && entry.lastEpisode >= entry.totalEpisodes) {
      entry.status = "completed";
    }
  }
  
  storeData.history.push({
    id: anime.id,
    ep,
    at: new Date().toISOString(),
    secondsWatched: 0,
  });

  saveStore();
}

export function getContinueWatching(): (StoreEntry & { id: number })[] {
  return Object.entries(storeData.entries)
    .map(([id, entry]) => ({ id: Number(id), ...entry }))
    .filter(e => e.status === "watching")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}
