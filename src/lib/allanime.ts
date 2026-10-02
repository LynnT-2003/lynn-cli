const API = "https://api.allanime.day/api";

export async function allanimeSearch(query: string) {
  const body = {
    variables: { search: { allowAdult: false, allowUnknown: false, query }, limit: 40, page: 1 },
    query: "query($search:SearchInput,$limit:Int,$page:Int){shows(search:$search,limit:$limit,page:$page,countryOrigin:ALL){edges{_id name englishName availableEpisodesDetail}}}"
  };
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Referer": "https://allanime.to/" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  return data.data.shows.edges.map((e: any) => ({
    id: e._id,
    title: e.englishName || e.name
  }));
}

export async function allanimeEpisodes(animeId: string) {
  const body = {
    variables: { search: { _id: animeId }, limit: 1, page: 1 },
    query: "query($search:SearchInput,$limit:Int,$page:Int){shows(search:$search,limit:$limit,page:$page,countryOrigin:ALL){edges{_id availableEpisodesDetail}}}"
  };
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Referer": "https://allanime.to/" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  const eps = data.data.shows.edges[0].availableEpisodesDetail.sub;
  return eps.map((ep: string) => ({ epNo: ep, dataId: ep })).reverse();
}
