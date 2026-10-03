const fs = require('fs');

let code = fs.readFileSync('src/lib/castServer.ts', 'utf8');

// Add a stream cache map
code = code.replace(
  `  const cover = existingEntry?.cover || null;`,
  `  const cover = existingEntry?.cover || null;\n\n  const streamCache = new Map<number, any>();`
);

// In POST /episode
code = code.replace(
  `          const streamInfo = await hianimeGetStreamUrl(targetEp.dataId, "sub");`,
  `          let streamInfo = streamCache.get(ep);\n          if (!streamInfo) {\n            streamInfo = await hianimeGetStreamUrl(targetEp.dataId, "sub");\n            streamCache.set(ep, streamInfo);\n          }`
);

// In GET /playlist.m3u8
code = code.replace(
  `        try {
          const streamInfo = await hianimeGetStreamUrl(targetEp.dataId, "sub");`,
  `        try {
          const epNum = parseInt(epStr, 10);
          let streamInfo = streamCache.get(epNum);
          if (!streamInfo) {
            streamInfo = await hianimeGetStreamUrl(targetEp.dataId, "sub");
            streamCache.set(epNum, streamInfo);
          }`
);

// In GET /subs.vtt
code = code.replace(
  `        try {
          const streamInfo = await hianimeGetStreamUrl(targetEp.dataId, "sub");`,
  `        try {
          const epNum = parseInt(epStr, 10);
          let streamInfo = streamCache.get(epNum);
          if (!streamInfo) {
            streamInfo = await hianimeGetStreamUrl(targetEp.dataId, "sub");
            streamCache.set(epNum, streamInfo);
          }`
);

fs.writeFileSync('src/lib/castServer.ts', code);
