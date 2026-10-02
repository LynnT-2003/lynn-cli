// shared selection set so search + category queries stay in sync
export const FIELDS = `
  id
  title {
    romaji
    english
  }
  episodes
  status
  description(asHtml: false)
  format
  duration
  seasonYear
  coverImage {
    medium
    large
  }
  bannerImage
`;

export const QUERY = `
  query ($search: String) {
    Media(search: $search, type: ANIME) {
      ${FIELDS}
    }
  }
`;

// one round trip, four aliased Page queries. anilist allows this natively.
export const CATEGORIES_QUERY = `
  query {
    trending: Page(perPage: 15) {
      media(sort: TRENDING_DESC, type: ANIME) { ${FIELDS} }
    }
    popular: Page(perPage: 15) {
      media(sort: POPULARITY_DESC, type: ANIME) { ${FIELDS} }
    }
    action: Page(perPage: 15) {
      media(genre: "Action", sort: POPULARITY_DESC, type: ANIME) { ${FIELDS} }
    }
    romance: Page(perPage: 15) {
      media(genre: "Romance", sort: POPULARITY_DESC, type: ANIME) { ${FIELDS} }
    }
  }
`;

// paginated search — used by search overlay (page 1, perPage 5) and
// search grid (page N, perPage 20+).
export const SEARCH_PAGE_QUERY = `
  query ($search: String, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        hasNextPage
      }
      media(search: $search, type: ANIME) {
        ${FIELDS}
      }
    }
  }
`;

export const DETAIL_QUERY = `
  query ($id: Int) {
    Media(id: $id) {
      id
      title { romaji english native }
      format
      status
      description(asHtml: false)
      startDate { year month day }
      endDate { year month day }
      season
      seasonYear
      episodes
      duration
      source
      coverImage { large medium color }
      bannerImage
      genres
      synonyms
      averageScore
      meanScore
      popularity
      favourites
      isAdult
      siteUrl
      tags { name rank isMediaSpoiler }
      studios { edges { isMain node { name } } }
      nextAiringEpisode { airingAt episode timeUntilAiring }
      externalLinks { url site type }
      streamingEpisodes { title url site }
      relations {
        edges {
          relationType(version: 2)
          node { id title { romaji english } format status }
        }
      }
      characters(sort: ROLE, perPage: 12) {
        edges { role node { name { full } } }
      }
      staff(perPage: 10) {
        edges { role node { name { full } } }
      }
      recommendations(perPage: 6) {
        nodes { mediaRecommendation { id title { romaji english } format } }
      }
    }
  }
`;
