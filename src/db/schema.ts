export const SCHEMA_VERSION = 1;

export type WatchStatus = "watching" | "planning" | "completed" | "dropped";

export type WatchEntry = {
  anilistId: number;
  title: string;
  cover: string | null;
  totalEpisodes: number | null;
  status: WatchStatus;
  lastEpisode: number; // last fully completed episode, 0 if none
  resumeEpisode: number | null;
  positionSeconds: number;
  durationSeconds: number;
  playerQuery: string;
  updatedAt: string; // ISO
};

export type HistoryEvent = {
  anilistId: number;
  episode: number;
  watchedAt: string; // ISO
  secondsWatched: number;
};

export type Playlist = {
  id: string;
  name: string;
  animeIds: number[];
  createdAt: string;
  updatedAt: string;
};

export type Profile = {
  name: string | null;
  genres: string[];
  favorites: number[]; // anilist ids
  onboarded: boolean;
  updatedAt: string;
};

export type LibraryDocument = {
  version: number;
  profile: Profile;
  entries: Record<number, WatchEntry>;
  history: HistoryEvent[];
  playlists: Playlist[];
};

export function createEmptyLibrary(): LibraryDocument {
  const now = new Date().toISOString();
  return {
    version: SCHEMA_VERSION,
    profile: { name: null, genres: [], favorites: [], onboarded: false, updatedAt: now },
    entries: {},
    history: [],
    playlists: [],
  };
}

// bump SCHEMA_VERSION and add a branch here whenever LibraryDocument's shape
// changes. each migration takes the previous shape and returns the next one.
// unversioned/unrecognized files are treated as fresh rather than guessed at.
export function migrate(doc: any): LibraryDocument {
  if (!doc?.version || doc.version < 1) {
    return createEmptyLibrary();
  }
  return doc as LibraryDocument;
}
