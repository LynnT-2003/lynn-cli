export type AnilistAnime = {
  id: number;
  title: {
    romaji: string | null;
    english: string | null;
  };
  episodes: number | null;
  status: string | null;
  description: string | null;
  format: string | null;
  duration: number | null;
  seasonYear: number | null;
  coverImage: {
    medium: string | null;
    large: string | null;
  };
  bannerImage: string | null;
};

export type CategoryRow = {
  label: string;
  items: AnilistAnime[];
};

export type SearchPageResponse = {
  data: {
    Page: {
      pageInfo: { hasNextPage: boolean };
      media: AnilistAnime[];
    };
  };
};

export type CategoriesResponse = {
  data: {
    trending: { media: AnilistAnime[] };
    popular: { media: AnilistAnime[] };
    action: { media: AnilistAnime[] };
    romance: { media: AnilistAnime[] };
  };
};

export type AnilistAnimeDetail = {
  id: number;
  title: {
    romaji: string | null;
    english: string | null;
    native: string | null;
  };
  format: string | null;
  status: string | null;
  description: string | null;
  startDate: { year: number | null; month: number | null; day: number | null } | null;
  endDate: { year: number | null; month: number | null; day: number | null } | null;
  season: string | null;
  seasonYear: number | null;
  episodes: number | null;
  duration: number | null;
  source: string | null;
  coverImage: {
    large: string | null;
    medium: string | null;
    color: string | null;
  };
  bannerImage: string | null;
  genres: string[];
  synonyms: string[];
  averageScore: number | null;
  meanScore: number | null;
  popularity: number | null;
  favourites: number | null;
  isAdult: boolean | null;
  siteUrl: string | null;
  tags: Array<{ name: string; rank: number; isMediaSpoiler: boolean }>;
  studios: {
    edges: Array<{ isMain: boolean; node: { name: string } }>;
  };
  nextAiringEpisode: {
    airingAt: number;
    episode: number;
    timeUntilAiring: number;
  } | null;
  externalLinks: Array<{
    url: string | null;
    site: string;
    type: string | null;
  }>;
  streamingEpisodes: Array<{
    title: string | null;
    url: string | null;
    site: string | null;
  }>;
  relations: {
    edges: Array<{
      relationType: string;
      node: {
        id: number;
        title: { romaji: string | null; english: string | null };
        format: string | null;
        status: string | null;
      };
    }>;
  };
  characters: {
    edges: Array<{
      role: string;
      node: { name: { full: string | null } };
    }>;
  };
  staff: {
    edges: Array<{
      role: string;
      node: { name: { full: string | null } };
    }>;
  };
  recommendations: {
    nodes: Array<{
      mediaRecommendation: {
        id: number;
        title: { romaji: string | null; english: string | null };
        format: string | null;
      } | null;
    }>;
  };
};

export type DetailResponse = {
  data: {
    Media: AnilistAnimeDetail;
  };
};

export type SearchResponse = {
  data: {
    Media: AnilistAnime | null;
  };
};
