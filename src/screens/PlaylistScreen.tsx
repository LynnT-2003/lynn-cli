import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Thumbnail } from "../components/Thumbnail.js";
import Spinner from "ink-spinner";
import { theme } from "../lib/theme.js";
import { useLayout } from "../lib/useLayout.js";
import { bigText } from "../lib/bigText.js";
import type { Playlist } from "../db/schema.js";
import type { AnilistAnime } from "../lib/anilist.js";

const PLAYLIST_QUERY = `
  query($ids: [Int]) {
    Page(page: 1, perPage: 50) {
      media(id_in: $ids, type: ANIME) {
        id
        idMal
        title {
          romaji
          english
          native
        }
        coverImage {
          medium
          large
          extraLarge
        }
        format
        episodes
        duration
        status
        seasonYear
        genres
        nextAiringEpisode {
          timeUntilAiring
          episode
        }
        averageScore
        description(asHtml: false)
      }
    }
  }
`;

type PlaylistItem = AnilistAnime & {
  genres?: string[];
  nextAiringEpisode?: { timeUntilAiring: number; episode: number } | null;
};

type Props = {
  playlist: Playlist;
  onSelect: (anime: AnilistAnime) => void;
  onBack: () => void;
  isFocused?: boolean;
};

// list row: 4-line poster + 1 line gap
const ROW_THUMB_COLS = 6;
const ROW_THUMB_ROWS = 4;
const ROW_HEIGHT = ROW_THUMB_ROWS + 1;

const STATUS_LABEL: Record<string, string> = {
  RELEASING: "Airing",
  FINISHED: "Finished",
  NOT_YET_RELEASED: "Upcoming",
  CANCELLED: "Cancelled",
  HIATUS: "On hiatus",
};

function cleanDescription(raw: string | null | undefined): string {
  if (!raw) return "No synopsis available.";
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&mdash;/g, "—")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function scoreColor(score: number) {
  return score >= 80 ? theme.text.success : score >= 60 ? theme.text.highlight : theme.text.error;
}

function formatCountdown(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${Math.floor((sec % 3600) / 60)}m`;
}

function titleOf(item: PlaylistItem) {
  return item.title.english || item.title.romaji || "Unknown";
}

export function PlaylistScreen({ playlist, onSelect, onBack, isFocused = true }: Props) {
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const { contentColumns: columns, rows: termRows } = useLayout();

  useEffect(() => {
    if (playlist.animeIds.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query: PLAYLIST_QUERY, variables: { ids: playlist.animeIds } })
    })
      .then(res => res.json())
      .then((data: any) => {
        if (data.errors) throw new Error(data.errors[0].message);

        // Re-sort items to match playlist order (AniList doesn't preserve `id_in` order)
        const media: PlaylistItem[] = data.data.Page.media;
        const sorted = playlist.animeIds.map(id => media.find(m => m.id === id)).filter(Boolean) as PlaylistItem[];

        setItems(sorted);
        setLoading(false);
      })
      .catch((err: any) => {
        setError(err.message);
        setLoading(false);
      });
  }, [playlist]);

  // ── layout ────────────────────────────────────────────────
  const innerWidth = Math.max(40, columns - 4);
  const titleLines = useMemo(() => bigText(playlist.name, innerWidth), [playlist.name, innerWidth]);
  const headerHeight = 1 + titleLines.length + 1 + 1; // top pad + art + subtitle + gap
  const footerHeight = 2;
  const bodyHeight = Math.max(ROW_HEIGHT * 2, termRows - headerHeight - footerHeight - 1);
  const leftWidth = Math.min(60, Math.max(36, Math.floor(innerWidth * 0.38)));
  const maxVisible = Math.max(1, Math.floor(bodyHeight / ROW_HEIGHT));

  // poster on the right keeps a 2:3 ratio (each cell = 1 px wide, 2 px tall)
  // inner height of the right panel = body - border (2) - paddingY (2)
  const coverRows = Math.max(4, Math.min(21, bodyHeight - 4));
  const coverCols = Math.round((coverRows * 4) / 3);

  useEffect(() => {
    setScrollOffset(prev => {
      if (focusIdx < prev) return focusIdx;
      if (focusIdx >= prev + maxVisible) return focusIdx - maxVisible + 1;
      return prev;
    });
  }, [focusIdx, maxVisible]);

  useInput((input, key) => {
    if (!isFocused) return;

    if (key.escape || key.backspace || input?.toLowerCase() === "b") {
      onBack();
      return;
    }

    if (items.length === 0) return;

    if (key.upArrow || input === "k") {
      setFocusIdx(prev => Math.max(0, prev - 1));
    } else if (key.downArrow || input === "j") {
      setFocusIdx(prev => Math.min(items.length - 1, prev + 1));
    } else if (key.return) {
      onSelect(items[focusIdx]);
    }
  }, { isActive: isFocused });

  const selected = items[focusIdx];
  const totalEps = items.reduce((n, i) => n + (i.episodes || 0), 0);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={2} paddingTop={1}>
      {/* ── HEADER ── */}
      <Box flexDirection="column">
        {titleLines.map((line, i) => (
          <Text key={i} color={theme.text.highlight} wrap="truncate">{line}</Text>
        ))}
        <Text dimColor>
          PLAYLIST · {items.length} {items.length === 1 ? "title" : "titles"}
          {totalEps > 0 ? ` · ${totalEps} episodes` : ""}
        </Text>
      </Box>

      {/* ── BODY ── */}
      <Box flexDirection="row" height={bodyHeight} marginTop={1}>
        {loading ? (
          <Text color={theme.text.highlight}><Spinner type="dots" /> LOADING ITEMS...</Text>
        ) : error ? (
          <Text color={theme.text.error}>Error: {error}</Text>
        ) : items.length === 0 ? (
          <Text dimColor>This playlist is empty. Press <Text inverse> p </Text> on any show to add it.</Text>
        ) : (
          <>
            {/* LEFT — scrolling list */}
            <Box flexDirection="column" width={leftWidth} flexShrink={0} paddingRight={2}>
              {items.slice(scrollOffset, scrollOffset + maxVisible).map((item, idx) => {
                const actualIdx = scrollOffset + idx;
                const isFoc = focusIdx === actualIdx;
                const meta = [item.format, item.episodes ? `${item.episodes} ep` : null, item.seasonYear]
                  .filter(Boolean).join(" · ");
                return (
                  <Box key={item.id} flexDirection="row" height={ROW_THUMB_ROWS} marginBottom={1}>
                    <Box width={2} flexShrink={0} flexDirection="column">
                      {Array.from({ length: ROW_THUMB_ROWS }, (_, i) => (
                        <Text key={i} color={theme.text.highlight}>{isFoc ? "▌" : " "}</Text>
                      ))}
                    </Box>
                    <Thumbnail url={item.coverImage.medium || item.coverImage.large} cols={ROW_THUMB_COLS} rows={ROW_THUMB_ROWS} />
                    <Box flexDirection="column" paddingLeft={2} flexGrow={1} flexShrink={1}>
                      <Text color={isFoc ? theme.text.highlight : theme.text.normal} bold={isFoc} wrap="truncate">
                        {titleOf(item)}
                      </Text>
                      <Text dimColor wrap="truncate">{meta || "—"}</Text>
                      <Text wrap="truncate">
                        {item.averageScore ? <Text color={scoreColor(item.averageScore)}>★ {item.averageScore}%</Text> : <Text dimColor>★ —</Text>}
                        <Text dimColor>  {STATUS_LABEL[item.status || ""] || ""}</Text>
                      </Text>
                    </Box>
                  </Box>
                );
              })}
              {items.length > maxVisible && (
                <Text dimColor>  {focusIdx + 1} / {items.length}</Text>
              )}
            </Box>

            {/* RIGHT — selected anime */}
            {selected && (
              <Box flexDirection="row" flexGrow={1} borderStyle="round" borderColor={theme.border.hero} paddingX={2} paddingY={1}>
                <Thumbnail url={selected.coverImage.large || selected.coverImage.medium} cols={coverCols} rows={coverRows} />
                <Box flexDirection="column" paddingLeft={3} flexGrow={1} flexShrink={1}>
                  <Box flexShrink={0} flexDirection="column">
                    <Text color={theme.text.highlight} bold>{titleOf(selected)}</Text>
                    {selected.title.romaji && selected.title.romaji !== titleOf(selected) && (
                      <Text dimColor>{selected.title.romaji}</Text>
                    )}
                  </Box>

                  <Box marginTop={1} flexDirection="row" flexWrap="wrap" columnGap={3} flexShrink={0}>
                    {selected.averageScore ? (
                      <Text>
                        <Text dimColor>SCORE </Text>
                        <Text color={scoreColor(selected.averageScore)} bold>★ {selected.averageScore}%</Text>
                      </Text>
                    ) : null}
                    {selected.format && <Text><Text dimColor>FORMAT </Text>{selected.format}</Text>}
                    {selected.episodes && <Text><Text dimColor>EPISODES </Text>{selected.episodes}</Text>}
                    {selected.duration && <Text><Text dimColor>LENGTH </Text>{selected.duration}m</Text>}
                    {selected.status && <Text><Text dimColor>STATUS </Text>{STATUS_LABEL[selected.status] || selected.status}</Text>}
                    {selected.seasonYear && <Text><Text dimColor>YEAR </Text>{selected.seasonYear}</Text>}
                  </Box>

                  {selected.nextAiringEpisode && (
                    <Text color={theme.text.accent} wrap="truncate">
                      ◷ Episode {selected.nextAiringEpisode.episode} in {formatCountdown(selected.nextAiringEpisode.timeUntilAiring)}
                    </Text>
                  )}

                  {selected.genres && selected.genres.length > 0 && (
                    <Box marginTop={1} flexShrink={0}>
                      <Text color={theme.text.accent} wrap="truncate">{selected.genres.join("  ·  ")}</Text>
                    </Box>
                  )}

                  <Box marginTop={1} flexGrow={1} flexShrink={1} overflow="hidden">
                    <Text wrap="wrap">{cleanDescription(selected.description)}</Text>
                  </Box>

                  <Box marginTop={1} flexShrink={0}>
                    <Text><Text inverse bold> ENTER </Text><Text dimColor> open details</Text></Text>
                  </Box>
                </Box>
              </Box>
            )}
          </>
        )}
      </Box>

      {/* ── FOOTER ── */}
      <Box marginTop={1}>
        <Text dimColor>
          <Text inverse> ESC </Text> BACK   <Text inverse> ↑↓ </Text> NAVIGATE   <Text inverse> ENTER </Text> OPEN
        </Text>
      </Box>
    </Box>
  );
}
