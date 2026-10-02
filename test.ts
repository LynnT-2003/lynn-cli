import { hianimeSearch, hianimeEpisodes, hianimeGetStreamUrl } from "./src/lib/hianime.js";

const r = await hianimeSearch("naruto");
console.log("search:", r.length, r[0]);

const eps = await hianimeEpisodes(r[0]!.id);
console.log("episodes:", eps.length, eps[0]);

const s = await hianimeGetStreamUrl(eps[0]!.dataId);
console.log("stream:", s.videoUrl, s.referer, s.allQualities.length);