import { profileRepo } from "./repositories/profileRepo.js";
import { playlistRepo } from "./repositories/playlistRepo.js";
import { watchRepo } from "./repositories/watchRepo.js";

export const db = {
  profile: profileRepo,
  playlist: playlistRepo,
  watch: watchRepo,
};

export { profileRepo, playlistRepo, watchRepo };
