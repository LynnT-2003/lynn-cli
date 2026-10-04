import { client } from "../client.js";
import { WatchEntry, WatchStatus, HistoryEvent } from "../schema.js";

export const watchRepo = {
  async getEntry(anilistId: number): Promise<WatchEntry | null> {
    const data = await client.get();
    return data.entries[anilistId] || null;
  },

  async saveProgress(
    entryProps: { anilistId: number; title: string; cover: string | null; totalEpisodes: number | null; playerQuery: string },
    episode: number,
    positionSeconds: number,
    durationSeconds: number
  ): Promise<void> {
    const data = await client.get();
    let entry = data.entries[entryProps.anilistId];
    
    if (!entry) {
      entry = {
        anilistId: entryProps.anilistId,
        title: entryProps.title,
        cover: entryProps.cover,
        totalEpisodes: entryProps.totalEpisodes,
        status: "watching",
        lastEpisode: 0,
        resumeEpisode: episode,
        positionSeconds,
        durationSeconds,
        playerQuery: entryProps.playerQuery,
        updatedAt: new Date().toISOString(),
      };
      data.entries[entryProps.anilistId] = entry;
    } else {
      entry.resumeEpisode = episode;
      entry.positionSeconds = positionSeconds;
      entry.durationSeconds = durationSeconds;
      entry.updatedAt = new Date().toISOString();
      if (entryProps.totalEpisodes !== null) {
        entry.totalEpisodes = entryProps.totalEpisodes;
      }
    }

    await client.save();
  },

  async markEpisodeCompleted(anilistId: number, episode: number): Promise<void> {
    const data = await client.get();
    const entry = data.entries[anilistId];
    if (!entry) return;

    entry.lastEpisode = Math.max(entry.lastEpisode, episode);
    entry.resumeEpisode = null;
    entry.positionSeconds = 0;
    entry.durationSeconds = 0;
    entry.updatedAt = new Date().toISOString();

    if (entry.totalEpisodes && entry.lastEpisode >= entry.totalEpisodes) {
      entry.status = "completed";
    }

    data.history.push({
      anilistId,
      episode,
      watchedAt: new Date().toISOString(),
      secondsWatched: 0,
    });

    await client.save();
  },

  async setStatus(anilistId: number, status: WatchStatus): Promise<void> {
    const data = await client.get();
    const entry = data.entries[anilistId];
    if (entry) {
      entry.status = status;
      entry.updatedAt = new Date().toISOString();
      await client.save();
    }
  },

  async all(): Promise<WatchEntry[]> {
    const data = await client.get();
    return Object.values(data.entries);
  },

  async history(): Promise<HistoryEvent[]> {
    const data = await client.get();
    return [...data.history];
  },

  async continueWatching(): Promise<WatchEntry[]> {
    const data = await client.get();
    return Object.values(data.entries)
      .filter((e) => e.status === "watching")
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
};
