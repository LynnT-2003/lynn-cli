export * from "./models.js";
export * from "./client.js";
export * from "./queries.js";

// Export the singleton instance's methods as standalone functions to maintain backward compatibility
import { anilistClient } from "./client.js";

export const searchAnime = (title: string) => anilistClient.searchAnime(title);
export const searchAnimePage = (query: string, page?: number, perPage?: number) => anilistClient.searchAnimePage(query, page, perPage);
export const fetchCategories = () => anilistClient.fetchCategories();
export const fetchCategoriesByGenres = (genres: string[]) => anilistClient.fetchCategoriesByGenres(genres);
export const fetchAnimeDetail = (id: number) => anilistClient.fetchAnimeDetail(id);
export const fetchSchedule = (start: number, end: number) => anilistClient.fetchSchedule(start, end);
