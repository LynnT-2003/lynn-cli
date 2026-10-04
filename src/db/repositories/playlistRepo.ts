import { client } from "../client.js";
import { Playlist } from "../schema.js";
import crypto from "node:crypto";

export const playlistRepo = {
  async list(): Promise<Playlist[]> {
    const data = await client.get();
    return data.playlists;
  },
  
  async create(name: string): Promise<Playlist> {
    const data = await client.get();
    const p: Playlist = {
      id: crypto.randomUUID(),
      name,
      animeIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.playlists.push(p);
    await client.save();
    return p;
  },

  async addAnime(playlistId: string, anilistId: number): Promise<void> {
    const data = await client.get();
    const p = data.playlists.find(x => x.id === playlistId);
    if (p && !p.animeIds.includes(anilistId)) {
      p.animeIds.push(anilistId);
      p.updatedAt = new Date().toISOString();
      await client.save();
    }
  },

  async removeAnime(playlistId: string, anilistId: number): Promise<void> {
    const data = await client.get();
    const p = data.playlists.find(x => x.id === playlistId);
    if (p) {
      p.animeIds = p.animeIds.filter(id => id !== anilistId);
      p.updatedAt = new Date().toISOString();
      await client.save();
    }
  },

  async rename(playlistId: string, name: string): Promise<void> {
    const data = await client.get();
    const p = data.playlists.find(x => x.id === playlistId);
    if (p) {
      p.name = name;
      p.updatedAt = new Date().toISOString();
      await client.save();
    }
  },

  async remove(playlistId: string): Promise<void> {
    const data = await client.get();
    data.playlists = data.playlists.filter(x => x.id !== playlistId);
    await client.save();
  }
};
