import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Thumbnail } from "../components/Thumbnail.js";
import { db } from "../db/index.js";
import { useLayout } from "../lib/useLayout.js";
import { theme } from "../lib/theme.js";
import { bigText } from "../lib/bigText.js";
import type { Profile, WatchEntry, Playlist, HistoryEvent } from "../db/schema.js";

type Props = {
  isFocused?: boolean;
  onFocusSidebar?: () => void;
  onOpenPlaylist?: (playlist: Playlist) => void;
  onOpenAnime?: (anime: any) => void;
};

type Pane = "watching" | "playlists";

// ── levels ─────────────────────────────────────────────────
// episodes needed to reach each rank
const LEVELS = [
  { at: 0, name: "Fresh Spawn" },
  { at: 10, name: "Rookie Watcher" },
  { at: 25, name: "Binge Apprentice" },
  { at: 50, name: "Arc Chaser" },
  { at: 100, name: "Seasoned Otaku" },
  { at: 200, name: "Filler Survivor" },
  { at: 400, name: "Anime Sage" },
  { at: 800, name: "Isekai'd" },
];

function levelFor(episodes: number) {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (episodes >= LEVELS[i]!.at) idx = i;
  const cur = LEVELS[idx]!;
  const next = LEVELS[idx + 1] ?? null;
  const pct = next ? (episodes - cur.at) / (next.at - cur.at) : 1;
  return { level: idx + 1, name: cur.name, next, pct };
}

// ── activity heatmap ───────────────────────────────────────
const HEAT = ["#30363d", "#0e4429", "#006d32", "#26a641", "#39d353"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function heatLevel(n: number) {
  return n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 5 ? 3 : 4;
}

function streaks(counts: Map<string, number>) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // current streak may start yesterday if nothing watched yet today
  let current = 0;
  const cursor = new Date(today);
  if (!counts.get(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (counts.get(dayKey(cursor))) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }
  // best streak over all days with activity
  const days = [...counts.keys()]
    .map(k => { const [y, m, d] = k.split("-").map(Number); return new Date(y!, m!, d!).getTime(); })
    .sort((a, b) => a - b);
  let best = 0, run = 0, prev = 0;
  for (const t of days) {
    run = prev && t - prev <= 26 * 3600 * 1000 ? run + 1 : 1; // tolerate DST
    best = Math.max(best, run);
    prev = t;
  }
  return { current, best };
}

function Heatmap({ history, weeks }: { history: HistoryEvent[]; weeks: number }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of history) {
      const k = dayKey(new Date(h.watchedAt));
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [history]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // columns are weeks starting Monday; last column holds today
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - mondayOffset - (weeks - 1) * 7);

  const monthRow: string[] = Array(weeks * 2).fill(" ");
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const d = new Date(start);
    d.setDate(start.getDate() + w * 7);
    if (d.getMonth() !== lastMonth && w * 2 + 3 <= weeks * 2) {
      MONTHS[d.getMonth()]!.split("").forEach((c, i) => { monthRow[w * 2 + i] = c; });
      lastMonth = d.getMonth();
    }
  }

  const DAY_LABELS = ["Mon", "   ", "Wed", "   ", "Fri", "   ", "   "];
  const { current, best } = streaks(counts);
  const recent = history.filter(h => Date.now() - new Date(h.watchedAt).getTime() < weeks * 7 * 86400 * 1000).length;

  return (
    <Box flexDirection="column" flexShrink={0}>
      <Text>
        <Text color={theme.text.highlight} bold>ACTIVITY</Text>
        <Text dimColor>  {recent} {recent === 1 ? "episode" : "episodes"} in the last {weeks} weeks</Text>
      </Text>
      <Text dimColor>{"    "}{monthRow.join("")}</Text>
      {DAY_LABELS.map((label, row) => (
        <Text key={row}>
          <Text dimColor>{label} </Text>
          {Array.from({ length: weeks }, (_, w) => {
            const d = new Date(start);
            d.setDate(start.getDate() + w * 7 + row);
            if (d > today) return <Text key={w}>{"  "}</Text>;
            const n = counts.get(dayKey(d)) ?? 0;
            return <Text key={w} color={HEAT[heatLevel(n)]}>■ </Text>;
          })}
        </Text>
      ))}
      <Text>
        <Text dimColor>{"    "}less </Text>
        {HEAT.map((c, i) => <Text key={i} color={c}>■ </Text>)}
        <Text dimColor>more</Text>
        <Text>{"   "}</Text>
        <Text color={current > 0 ? "#ff9f43" : "gray"}>🔥 {current}d streak</Text>
        <Text dimColor>  ·  best {best}d</Text>
      </Text>
    </Box>
  );
}

// ── small pieces ───────────────────────────────────────────
function Bar({ pct, width, color, track = "#3a3f47" }: { pct: number; width: number; color: string; track?: string }) {
  const filled = Math.max(0, Math.min(width, Math.round(pct * width)));
  return (
    <Text>
      <Text color={color}>{"━".repeat(filled)}</Text>
      <Text color={track}>{"━".repeat(width - filled)}</Text>
    </Text>
  );
}

function StatTile({ label, value, sub, color = theme.text.normal }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border.default} paddingX={2} marginRight={1} flexShrink={0}>
      <Text dimColor>{label}</Text>
      <Text>
        <Text color={color} bold>{value}</Text>
        {sub ? <Text dimColor> {sub}</Text> : null}
      </Text>
    </Box>
  );
}

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return `${Math.floor(s / (86400 * 30))}mo ago`;
}

function mmss(sec: number) {
  return `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, "0")}`;
}

const ROW_THUMB_COLS = 6;
const ROW_THUMB_ROWS = 4;
const ROW_HEIGHT = ROW_THUMB_ROWS + 1;

function FocusBar({ on }: { on: boolean }) {
  return (
    <Box width={2} flexShrink={0} flexDirection="column">
      {Array.from({ length: ROW_THUMB_ROWS }, (_, i) => (
        <Text key={i} color={theme.text.highlight}>{on ? "▌" : " "}</Text>
      ))}
    </Box>
  );
}

// ── screen ─────────────────────────────────────────────────
export function ProfileScreen({ isFocused = true, onFocusSidebar, onOpenPlaylist, onOpenAnime }: Props) {
  const { contentColumns: columns, rows: termRows } = useLayout();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [entries, setEntries] = useState<WatchEntry[]>([]);
  const [watching, setWatching] = useState<WatchEntry[]>([]);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [covers, setCovers] = useState<Record<number, string>>({});

  const [pane, setPane] = useState<Pane>("watching");
  const [watchIdx, setWatchIdx] = useState(0);
  const [playlistIdx, setPlaylistIdx] = useState(0);
  const [watchScroll, setWatchScroll] = useState(0);
  const [playlistScroll, setPlaylistScroll] = useState(0);

  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [openingAnime, setOpeningAnime] = useState(false);

  const reload = () => {
    db.profile.get().then(setProfile);
    db.watch.all().then(setEntries);
    db.watch.continueWatching().then(setWatching);
    db.watch.history().then(setHistory);
    db.playlist.list().then(setPlaylists);
  };
  useEffect(reload, []);

  // covers: playlists only store ids, and some watch entries were saved without a cover
  useEffect(() => {
    const ids = Array.from(new Set([
      ...playlists.flatMap(p => p.animeIds.slice(0, 3)),
      ...watching.filter(w => !w.cover).map(w => w.anilistId),
    ])).slice(0, 50);
    if (ids.length === 0) return;
    fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { id coverImage { medium } } } }`,
        variables: { ids },
      }),
    })
      .then(r => r.json())
      .then((data: any) => {
        const map: Record<number, string> = {};
        for (const m of data.data.Page.media) map[m.id] = m.coverImage.medium;
        setCovers(prev => ({ ...prev, ...map }));
      })
      .catch(() => {});
  }, [playlists, watching]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── stats ──
  const stats = useMemo(() => {
    const episodes = entries.reduce((n, e) => n + e.lastEpisode, 0);
    const minutes = episodes * 24; // AniList median episode length; history doesn't record real watch time
    const completed = entries.filter(e => e.status === "completed").length;
    const perShow = new Map<number, number>();
    for (const h of history) perShow.set(h.anilistId, (perShow.get(h.anilistId) ?? 0) + 1);
    let topId: number | null = null;
    for (const [id, n] of perShow) if (topId === null || n > perShow.get(topId)!) topId = id;
    const top = topId !== null ? entries.find(e => e.anilistId === topId) ?? null : null;
    const firstSeen = [...history.map(h => h.watchedAt), ...entries.map(e => e.updatedAt)].sort()[0] ?? null;
    return { episodes, minutes, completed, top, topCount: topId !== null ? perShow.get(topId)! : 0, firstSeen };
  }, [entries, history]);
  const lvl = levelFor(stats.episodes);

  // ── layout ──
  const innerWidth = Math.max(60, columns - 4);
  const heatWeeks = Math.max(8, Math.min(26, Math.floor((innerWidth * 0.45 - 6) / 2)));
  const nameLines = useMemo(
    () => bigText(profile?.name || "Anonymous", Math.max(20, innerWidth - heatWeeks * 2 - 10)),
    [profile?.name, innerWidth, heatWeeks],
  );
  const headerHeight = Math.max(nameLines.length + 4, 10);
  const showTiles = termRows >= 40;
  const paneHeight = Math.max(ROW_HEIGHT + 2, termRows - 1 - headerHeight - (showTiles ? 4 : 0) - 1 - 2 - 1);
  const visibleRows = Math.max(1, Math.floor((paneHeight - 2) / ROW_HEIGHT));
  const paneWidth = Math.floor((innerWidth - 3) / 2);

  const keepInView = (idx: number, scroll: number) =>
    idx < scroll ? idx : idx >= scroll + visibleRows ? idx - visibleRows + 1 : scroll;
  useEffect(() => setWatchScroll(s => keepInView(watchIdx, s)), [watchIdx, visibleRows]);
  useEffect(() => setPlaylistScroll(s => keepInView(playlistIdx, s)), [playlistIdx, visibleRows]);

  // ── input ──
  const textInput = (input: string, key: any, value: string, set: (v: string) => void, onDone: () => void, onCancel: () => void) => {
    if (key.escape) return onCancel();
    if (key.return) return onDone();
    if (key.backspace || key.delete) return set(value.slice(0, -1));
    if (input && !key.ctrl && !key.meta && input.length === 1) set(value + input);
  };

  useInput((input, key) => {
    if (!isFocused) return;

    if (editingName) {
      textInput(input, key, editName, setEditName, () => {
        db.profile.update({ name: editName.trim() }).then(() => {
          db.profile.get().then(setProfile);
          setEditingName(false);
        });
      }, () => setEditingName(false));
      return;
    }

    if (creatingPlaylist) {
      textInput(input, key, playlistName, setPlaylistName, () => {
        if (!playlistName.trim()) return;
        db.playlist.create(playlistName.trim()).then(() => {
          db.playlist.list().then(ps => {
            setPlaylists(ps);
            setPlaylistIdx(ps.length - 1);
          });
          setCreatingPlaylist(false);
          setToast(`created "${playlistName.trim()}"`);
        });
      }, () => setCreatingPlaylist(false));
      return;
    }

    if (input === "e") {
      setEditName(profile?.name || "");
      setEditingName(true);
      return;
    }
    if (input === "c") {
      setPane("playlists");
      setPlaylistName("");
      setCreatingPlaylist(true);
      return;
    }
    if (input === "s" && pane === "playlists" && playlists[playlistIdx]) {
      const p = playlists[playlistIdx]!;
      const shareStr = `lynn:playlist:${Buffer.from(JSON.stringify({ name: p.name, animeIds: p.animeIds })).toString("base64")}`;
      import("execa").then(({ execa }) =>
        execa("pbcopy", [], { input: shareStr })
          .then(() => setToast(`share code for "${p.name}" copied to clipboard`))
          .catch(() => import("node:fs").then(fs => {
            fs.writeFileSync("lynn-playlist.txt", shareStr);
            setToast("share code saved to lynn-playlist.txt");
          })),
      );
      return;
    }

    if (key.tab) {
      setPane(p => (p === "watching" ? "playlists" : "watching"));
      return;
    }
    if (key.leftArrow) {
      if (pane === "playlists") setPane("watching");
      else onFocusSidebar?.();
      return;
    }
    if (key.rightArrow) {
      setPane("playlists");
      return;
    }

    const up = key.upArrow || input === "k";
    const down = key.downArrow || input === "j";
    if (pane === "watching") {
      if (up) setWatchIdx(i => Math.max(0, i - 1));
      if (down) setWatchIdx(i => Math.min(watching.length - 1, i + 1));
      if (key.return && watching[watchIdx] && onOpenAnime && !openingAnime) {
        setOpeningAnime(true);
        import("../lib/anilist.js").then(({ fetchAnimeDetail }) =>
          fetchAnimeDetail(watching[watchIdx]!.anilistId)
            .then(anime => { setOpeningAnime(false); onOpenAnime(anime); })
            .catch(() => { setOpeningAnime(false); setToast("couldn't load that show"); }),
        );
      }
    } else {
      if (up) setPlaylistIdx(i => Math.max(0, i - 1));
      if (down) setPlaylistIdx(i => Math.min(playlists.length - 1, i + 1));
      if (key.return && playlists[playlistIdx]) onOpenPlaylist?.(playlists[playlistIdx]!);
    }
  }, { isActive: isFocused });

  if (!profile) {
    return <Box padding={2}><Text dimColor>Loading profile...</Text></Box>;
  }

  const paneTitle = (p: Pane, label: string, count: number, hint: string) => (
    <Box justifyContent="space-between" flexShrink={0}>
      <Text>
        <Text color={pane === p ? theme.text.highlight : theme.text.dim} bold>{pane === p ? "▸ " : "  "}{label}</Text>
        <Text dimColor>  {count}</Text>
      </Text>
      <Text dimColor>{hint}</Text>
    </Box>
  );

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={2} paddingTop={1}>
      {/* ── HERO ── */}
      <Box flexDirection="row" justifyContent="space-between" height={headerHeight} flexShrink={0}>
        <Box flexDirection="column" flexShrink={1}>
          {editingName ? (
            <Box flexDirection="column" marginBottom={1}>
              <Text dimColor>YOUR NAME</Text>
              <Text color={theme.text.highlight} bold>{editName}<Text inverse> </Text></Text>
              <Text dimColor>ENTER save · ESC cancel</Text>
            </Box>
          ) : (
            nameLines.map((l, i) => <Text key={i} color={theme.text.highlight} wrap="truncate">{l}</Text>)
          )}
          <Box marginTop={1}>
            <Text>
              <Text backgroundColor={theme.bg.highlight} color={theme.bg.black} bold> LV {lvl.level} </Text>
              <Text color={theme.text.highlight} bold>  {lvl.name.toUpperCase()}</Text>
            </Text>
          </Box>
          <Text wrap="truncate">
            <Bar pct={lvl.pct} width={28} color={theme.text.highlight} />
            <Text dimColor>
              {"  "}{lvl.next ? `${stats.episodes} / ${lvl.next.at} eps to ${lvl.next.name}` : `${stats.episodes} eps · max rank`}
            </Text>
          </Text>
          <Text wrap="truncate">
            {profile.genres.length
              ? profile.genres.map((g, i) => <Text key={g} color={theme.text.accent}>{i ? "   " : ""}♥ {g}</Text>)
              : <Text dimColor>no favourite genres yet</Text>}
            {stats.firstSeen && <Text dimColor>{"   ·   "}watching since {MONTHS[new Date(stats.firstSeen).getMonth()]} {new Date(stats.firstSeen).getFullYear()}</Text>}
          </Text>
        </Box>
        <Heatmap history={history} weeks={heatWeeks} />
      </Box>

      {/* ── STATS ── */}
      {showTiles && (
        <Box flexDirection="row" marginTop={1} flexShrink={0} overflow="hidden">
          <StatTile label="SHOWS" value={String(entries.length)} sub={stats.completed ? `${stats.completed} done` : undefined} />
          <StatTile label="EPISODES" value={String(stats.episodes)} color={theme.text.highlight} />
          <StatTile label="TIME WATCHED" value={stats.minutes >= 60 ? `≈${(stats.minutes / 60).toFixed(1)}h` : `≈${stats.minutes}m`} />
          <StatTile label="PLAYLISTS" value={String(playlists.length)} />
          {stats.top && (
            <StatTile label="MOST BINGED" value={stats.top.title.length > 28 ? stats.top.title.slice(0, 27) + "…" : stats.top.title} sub={`${stats.topCount} eps`} color={theme.text.accent} />
          )}
        </Box>
      )}

      {/* ── PANES ── */}
      <Box flexDirection="row" marginTop={1} height={paneHeight} flexShrink={0}>
        {/* continue watching */}
        <Box flexDirection="column" width={paneWidth} borderStyle="round" borderColor={pane === "watching" ? theme.border.hero : theme.border.default} paddingX={1}>
          {paneTitle("watching", "CONTINUE WATCHING", watching.length, "enter resume")}
          <Box flexDirection="column" marginTop={1}>
            {watching.length === 0 && <Text dimColor>  Nothing in progress. Press w on any show to start.</Text>}
            {watching.slice(watchScroll, watchScroll + visibleRows).map((w, i) => {
              const idx = watchScroll + i;
              const on = pane === "watching" && idx === watchIdx;
              const nextEp = w.resumeEpisode ?? w.lastEpisode + 1;
              const seriesPct = w.totalEpisodes ? w.lastEpisode / w.totalEpisodes : 0;
              const where = w.resumeEpisode && w.positionSeconds > 0
                ? `Ep ${nextEp} · paused at ${mmss(w.positionSeconds)}`
                : `Ep ${nextEp} up next`;
              return (
                <Box key={w.anilistId} flexDirection="row" height={ROW_THUMB_ROWS} marginBottom={1}>
                  <FocusBar on={on} />
                  <Thumbnail url={w.cover || covers[w.anilistId] || null} cols={ROW_THUMB_COLS} rows={ROW_THUMB_ROWS} />
                  <Box flexDirection="column" paddingLeft={2} flexGrow={1} flexShrink={1}>
                    <Text color={on ? theme.text.highlight : theme.text.normal} bold={on} wrap="truncate">{w.title}</Text>
                    <Text wrap="truncate">
                      <Text color={theme.text.accent}>{where}</Text>
                      <Text dimColor>  · {ago(w.updatedAt)}</Text>
                    </Text>
                    <Text wrap="truncate">
                      <Bar pct={seriesPct} width={Math.max(8, Math.min(24, paneWidth - 30))} color={on ? theme.text.highlight : theme.text.dim} />
                      <Text dimColor>  {w.lastEpisode}/{w.totalEpisodes ?? "?"}</Text>
                    </Text>
                    {on && openingAnime && <Text color={theme.text.highlight}>opening…</Text>}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>

        <Box width={1} />

        {/* playlists */}
        <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor={pane === "playlists" ? theme.border.hero : theme.border.default} paddingX={1}>
          {paneTitle("playlists", "PLAYLISTS", playlists.length, "c new · s share")}
          <Box flexDirection="column" marginTop={1}>
            {creatingPlaylist && (
              <Box flexDirection="column" marginBottom={1}>
                <Text>
                  <Text color={theme.text.highlight}>  + </Text>
                  <Text bold>{playlistName}</Text>
                  <Text inverse> </Text>
                </Text>
                <Text dimColor>    name your playlist · ENTER create · ESC cancel</Text>
              </Box>
            )}
            {playlists.length === 0 && !creatingPlaylist && <Text dimColor>  No playlists yet. Press c to make one.</Text>}
            {playlists.slice(playlistScroll, playlistScroll + visibleRows).map((p, i) => {
              const idx = playlistScroll + i;
              const on = pane === "playlists" && idx === playlistIdx;
              const art = p.animeIds.slice(0, 3);
              return (
                <Box key={p.id} flexDirection="row" height={ROW_THUMB_ROWS} marginBottom={1}>
                  <FocusBar on={on} />
                  <Box width={ROW_THUMB_COLS * 3} flexShrink={0} flexDirection="row">
                    {/* always three slots so titles line up; empty slots are dim shelves */}
                    {art.length === 0 ? (
                      <Box width={ROW_THUMB_COLS * 3} height={ROW_THUMB_ROWS} flexDirection="column" flexShrink={0}>
                        {Array.from({ length: ROW_THUMB_ROWS }, (_, r) => (
                          <Text key={r} color="#2a2e35">{r === 1 ? "░░░░░" : "░".repeat(ROW_THUMB_COLS * 3)}{r === 1 && <><Text dimColor> empty </Text>░░░░░░</>}</Text>
                        ))}
                      </Box>
                    ) : [0, 1, 2].map(slot => art[slot] !== undefined ? (
                      <Thumbnail key={slot} url={covers[art[slot]!] || null} cols={ROW_THUMB_COLS} rows={ROW_THUMB_ROWS} />
                    ) : (
                      <Box key={slot} width={ROW_THUMB_COLS} height={ROW_THUMB_ROWS} flexDirection="column" flexShrink={0}>
                        {Array.from({ length: ROW_THUMB_ROWS }, (_, r) => (
                          <Text key={r} color="#2a2e35">{"░".repeat(ROW_THUMB_COLS)}</Text>
                        ))}
                      </Box>
                    ))}
                  </Box>
                  <Box flexDirection="column" paddingLeft={2} flexGrow={1} flexShrink={1}>
                    <Text color={on ? theme.text.highlight : theme.text.normal} bold={on} wrap="truncate">{p.name}</Text>
                    <Text dimColor wrap="truncate">
                      {p.animeIds.length} {p.animeIds.length === 1 ? "title" : "titles"} · updated {ago(p.updatedAt)}
                    </Text>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>

      {/* ── FOOTER ── */}
      <Box marginTop={1} flexShrink={0} justifyContent="space-between">
        <Text dimColor>
          <Text inverse> ↑↓ </Text> select   <Text inverse> ←→ </Text> switch   <Text inverse> ENTER </Text> open   <Text inverse> e </Text> edit name   <Text inverse> c </Text> new playlist
        </Text>
        {toast && <Text color={theme.text.successBright}>✓ {toast}</Text>}
      </Box>
    </Box>
  );
}
