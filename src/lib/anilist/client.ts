import {
  AnilistAnime,
  AnilistAnimeDetail,
  CategoryRow,
  SearchPageResponse,
  CategoriesResponse,
  DetailResponse,
  SearchResponse,
} from "./models.js";
import {
  QUERY,
  CATEGORIES_QUERY,
  SEARCH_PAGE_QUERY,
  DETAIL_QUERY,
} from "./queries.js";

const ANILIST_URL = "https://graphql.anilist.co";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

export class AnilistClient {
  /**
   * anilist occasionally returns transient 500s — retry a couple times before giving up
   */
  private async fetchGraphQL<T>(
    query: string,
    variables?: Record<string, any>
  ): Promise<T> {
    const body = { query, variables };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch(ANILIST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        return (await res.json()) as T;
      }

      if (res.status < 500 || attempt === MAX_RETRIES) {
        throw new Error(`anilist request failed: ${res.status} ${res.statusText}`);
      }

      // wait before retrying on 5xx
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
    }

    // unreachable, but typescript needs it
    throw new Error("anilist: retries exhausted");
  }

  public async searchAnime(title: string): Promise<AnilistAnime | null> {
    const json = await this.fetchGraphQL<SearchResponse>(QUERY, { search: title });
    return json.data.Media;
  }

  public async searchAnimePage(
    query: string,
    page: number = 1,
    perPage: number = 15
  ): Promise<{ results: AnilistAnime[]; hasNextPage: boolean }> {
    const json = await this.fetchGraphQL<SearchPageResponse>(SEARCH_PAGE_QUERY, {
      search: query,
      page,
      perPage,
    });
    return {
      results: json.data.Page.media,
      hasNextPage: json.data.Page.pageInfo.hasNextPage,
    };
  }

  public async fetchCategories(): Promise<CategoryRow[]> {
    const json = await this.fetchGraphQL<CategoriesResponse>(CATEGORIES_QUERY);
    const d = json.data;
    return [
      { label: "trending now", items: d.trending.media },
      { label: "popular", items: d.popular.media },
      { label: "action", items: d.action.media },
      { label: "romance", items: d.romance.media },
    ];
  }

  public async fetchAnimeDetail(id: number): Promise<AnilistAnimeDetail> {
    const json = await this.fetchGraphQL<DetailResponse>(DETAIL_QUERY, { id });
    return json.data.Media;
  }
}

export const anilistClient = new AnilistClient();
