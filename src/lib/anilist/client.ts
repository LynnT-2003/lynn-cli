import {
  AnilistAnime,
  AnilistAnimeDetail,
  CategoryRow,
  BrowsePageData,
  SearchPageResponse,
  CategoriesResponse,
  DetailResponse,
  SearchResponse,
  AiringSchedule,
  ScheduleResponse,
} from "./models.js";
import {
  QUERY,
  CATEGORIES_QUERY,
  SEARCH_PAGE_QUERY,
  DETAIL_QUERY,
  SCHEDULE_QUERY,
  buildGenresQuery,
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

  public async fetchCategories(): Promise<BrowsePageData> {
    const json = await this.fetchGraphQL<CategoriesResponse>(CATEGORIES_QUERY);
    const d = json.data;
    return {
      topAiring: d.topAiring.media,
      mostPopular: d.mostPopular.media,
      mostFavorite: d.mostFavorite.media,
      latestCompleted: d.latestCompleted.media,
      rows: [
        { label: "action", items: d.action.media },
        { label: "romance", items: d.romance.media },
      ],
    };
  }

  public async fetchCategoriesByGenres(genres: string[]): Promise<BrowsePageData> {
    if (!genres || genres.length === 0) {
      return this.fetchCategories();
    }
    const query = buildGenresQuery(genres);
    const json = await this.fetchGraphQL<{ data: Record<string, { media: AnilistAnime[] }> }>(query);
    const d = json.data;
    const rows: CategoryRow[] = [];
    genres.forEach((g, i) => {
      if (d[`g${i}`] && d[`g${i}`].media.length > 0) {
        rows.push({ label: g.toLowerCase(), items: d[`g${i}`].media });
      }
    });
    return {
      topAiring: d.topAiring.media,
      mostPopular: d.mostPopular.media,
      mostFavorite: d.mostFavorite.media,
      latestCompleted: d.latestCompleted.media,
      rows,
    };
  }

  public async fetchAnimeDetail(id: number): Promise<AnilistAnimeDetail> {
    const json = await this.fetchGraphQL<DetailResponse>(DETAIL_QUERY, { id });
    return json.data.Media;
  }

  public async fetchSchedule(start: number, end: number): Promise<AiringSchedule[]> {
    const json = await this.fetchGraphQL<ScheduleResponse>(SCHEDULE_QUERY, { start, end });
    return json.data.Page.airingSchedules;
  }
}

export const anilistClient = new AnilistClient();
