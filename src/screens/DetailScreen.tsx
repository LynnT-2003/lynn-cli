import React, { useEffect, useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { execa } from "execa";
import {
  fetchAnimeDetail,
  type AnilistAnime,
  type AnilistAnimeDetail,
} from "../lib/anilist.js";
import { Thumbnail } from "../components/Thumbnail.js";
import { useTerminalSize } from "../lib/useTerminalSize.js";

// ── layout constants ──────────────────────────────────────────

const THUMB_COLS = 28;
const THUMB_ROWS = 20;

// ── helper functions ──────────────────────────────────────────

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function scoreColor(score: number): "green" | "greenBright" | "yellow" | "red" {
  if (score >= 80) return "greenBright";
  if (score >= 65) return "green";
  if (score >= 45) return "yellow";
  return "red";
}

function fuzzyDate(
  d: { year: number | null; month: number | null; day: number | null } | null,
): string {
  if (!d?.year) return "?";
  const months = [
    "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const parts: string[] = [];
  if (d.month) parts.push(months[d.month] ?? "");
  if (d.day) parts.push(`${d.day},`);
  parts.push(`${d.year}`);
  return parts.join(" ");
}

function timeUntil(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── component ─────────────────────────────────────────────────

type Props = {
  anime: AnilistAnime;
  isActive?: boolean;
  onBack: () => void;
  onWatch: () => void;
  onNavigate?: (anime: AnilistAnime) => void;
};

type FocusState = {
  type: 'watch' | 'desc' | 'relation' | 'link' | 'similar';
  index: number;
};

export function DetailScreen({ anime, isActive = true, onBack, onWatch, onNavigate }: Props) {
  const { columns, rows: termRows } = useTerminalSize();
  const [detail, setDetail] = useState<AnilistAnimeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [focus, setFocus] = useState<FocusState>({ type: 'watch', index: 0 });
  const [expandedDesc, setExpandedDesc] = useState(false);

  useEffect(() => {
    fetchAnimeDetail(anime.id)
      .then(setDetail)
      .catch(() => setError("not-found"));
  }, [anime.id]);

  const links = useMemo(() => {
    if (!detail) return [];
    const arr = [];
    if (detail.siteUrl) arr.push({ url: detail.siteUrl, site: "AniList" });
    const streaming = detail.externalLinks.filter((l) => l.type === "STREAMING");
    const otherLinks = detail.externalLinks.filter((l) => l.type !== "STREAMING");
    [...streaming, ...otherLinks].forEach(l => {
      if (l.url) arr.push({ url: l.url, site: l.site });
    });
    return arr.slice(0, 8);
  }, [detail]);

  const similar = useMemo(() => {
    if (!detail) return [];
    return detail.recommendations.nodes
      .filter(n => n.mediaRecommendation)
      .map(n => n.mediaRecommendation!)
      .slice(0, 8);
  }, [detail]);

  const relations = detail?.relations.edges || [];

  useInput((input, key) => {
    if (expandedDesc && (key.escape || key.return || key.backspace || input === "b")) {
      setExpandedDesc(false);
      return;
    }

    if (key.escape || key.backspace || input === "b") {
      onBack();
      return;
    }

    if (!detail) return; // Wait for load

    // 2D Navigation Logic
    if (key.rightArrow) {
      if (focus.type === 'watch') setFocus({ type: 'desc', index: 0 });
      else if (focus.type === 'link' && focus.index < links.length - 1) setFocus({ type: 'link', index: focus.index + 1 });
      else if (focus.type === 'similar' && focus.index < similar.length - 1) setFocus({ type: 'similar', index: focus.index + 1 });
      return;
    }

    if (key.leftArrow) {
      if (focus.type === 'desc' || focus.type === 'relation') setFocus({ type: 'watch', index: 0 });
      else if (focus.type === 'link') {
        if (focus.index > 0) setFocus({ type: 'link', index: focus.index - 1 });
        else setFocus({ type: 'watch', index: 0 });
      }
      else if (focus.type === 'similar') {
        if (focus.index > 0) setFocus({ type: 'similar', index: focus.index - 1 });
        else setFocus({ type: 'watch', index: 0 });
      }
      return;
    }

    if (key.downArrow) {
      if (focus.type === 'watch') {
        setFocus({ type: 'desc', index: 0 });
      } else if (focus.type === 'desc') {
        if (relations.length) setFocus({ type: 'relation', index: 0 });
        else if (links.length) setFocus({ type: 'link', index: 0 });
      } else if (focus.type === 'relation') {
        if (focus.index < relations.length - 1) setFocus({ type: 'relation', index: focus.index + 1 });
        else if (links.length) setFocus({ type: 'link', index: 0 });
        else if (similar.length) setFocus({ type: 'similar', index: 0 });
      } else if (focus.type === 'link') {
        if (similar.length) setFocus({ type: 'similar', index: Math.min(focus.index, similar.length - 1) });
      }
      return;
    }

    if (key.upArrow) {
      if (focus.type === 'relation') {
        if (focus.index > 0) setFocus({ type: 'relation', index: focus.index - 1 });
        else setFocus({ type: 'desc', index: 0 });
      } else if (focus.type === 'link') {
        if (relations.length) setFocus({ type: 'relation', index: relations.length - 1 });
        else setFocus({ type: 'watch', index: 0 });
      } else if (focus.type === 'similar') {
        if (links.length) setFocus({ type: 'link', index: Math.min(focus.index, links.length - 1) });
        else if (relations.length) setFocus({ type: 'relation', index: relations.length - 1 });
        else setFocus({ type: 'watch', index: 0 });
      }
      return;
    }

    if (key.return) {
      if (focus.type === 'watch') onWatch();
      else if (focus.type === 'desc') setExpandedDesc(true);
      else if (focus.type === 'link' && links[focus.index]) execa("open", [links[focus.index].url]).catch(() => { });
      else if (focus.type === 'relation' && relations[focus.index]) {
        if (onNavigate) onNavigate(relations[focus.index].node as any);
      }
      else if (focus.type === 'similar' && similar[focus.index]) {
        if (onNavigate) onNavigate(similar[focus.index] as any);
      }
      return;
    }

    if (input === "w") {
      onWatch();
      return;
    }
  }, { isActive });

  // ── loading state ───────────────────────────────────────────

  if (!detail && !error) {
    const title = anime.title.english ?? anime.title.romaji ?? "unknown";
    return (
      <Box position="absolute" width="100%" height="100%" alignItems="center" justifyContent="center">
        <Box borderStyle="single" borderColor="cyan" padding={2} backgroundColor="black" flexDirection="column" alignItems="center">
          <Text color="cyan" bold>{title}</Text>
          <Box marginTop={1}>
            <Text color="yellow">
              <Spinner type="dots" /> ACCESSING DATABASE...
            </Text>
          </Box>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box position="absolute" width="100%" height="100%" alignItems="center" justifyContent="center">
        <Box borderStyle="single" borderColor="red" padding={2} backgroundColor="black" flexDirection="column" alignItems="center">
          <Text color="red" bold inverse> ERROR </Text>
          <Box marginTop={1} marginBottom={1}>
            <Text color="red">Sorry, not found.</Text>
          </Box>
          <Text dimColor><Text inverse> ESC </Text> BACK</Text>
        </Box>
      </Box>
    );
  }

  // ── full detail render ──────────────────────────────────────

  const d = detail!;
  const title = d.title.english ?? d.title.romaji ?? "unknown";
  const coverUrl = d.coverImage.large ?? d.coverImage.medium;

  const description = (d.description ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const mainStudios = d.studios.edges
    .filter((e) => e.isMain)
    .map((e) => e.node.name);
  const otherStudios = d.studios.edges
    .filter((e) => !e.isMain)
    .map((e) => e.node.name);

  const nonSpoilerTags = d.tags.filter((t) => !t.isMediaSpoiler);

  const infoLine = [
    d.format?.replace(/_/g, " "),
    d.episodes ? `${d.episodes} EP` : null,
    d.duration ? `${d.duration} MIN` : null,
    d.source ? d.source.replace(/_/g, " ") : null
  ].filter(Boolean).join(" · ");

  const timeLine = [
    d.season && d.seasonYear
      ? `${d.season} ${d.seasonYear}`
      : d.seasonYear ? `${d.seasonYear}` : null,
    d.status?.replace(/_/g, " "),
  ].filter(Boolean).join(" · ");

  const isFocused = (type: string, index?: number) => {
    if (focus.type !== type) return false;
    if (index !== undefined && focus.index !== index) return false;
    return true;
  };

  const activeBg = "#444444"; // Soft gray highlight

  const MAX_ITEMS = 6;
  const relStart = focus.type === 'relation'
    ? Math.max(0, Math.min(focus.index - 2, relations.length - MAX_ITEMS))
    : 0;
  const visibleRelations = relations.slice(relStart, relStart + MAX_ITEMS);

  return (
    <Box flexDirection="column" height="100%" overflow="hidden" backgroundColor="black">
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="cyan"
        flexGrow={1}
        overflow="hidden"
      >
        {/* ── HEADER ── */}
        <Box flexDirection="row" justifyContent="space-between" paddingX={2} borderBottom={true} borderStyle="single" borderColor="cyan" borderTop={false} borderLeft={false} borderRight={false}>
          <Box width="60%" overflow="hidden">
            <Text bold color="cyan" wrap="truncate">{title.toUpperCase()}</Text>
          </Box>
          <Box flexShrink={0}>
            {infoLine && <Text color="green">{infoLine}</Text>}
            {timeLine && <Text color="yellow"> · {timeLine}</Text>}
          </Box>
        </Box>

        {/* ── MAIN CONTENT ── */}
        <Box flexDirection="row" flexGrow={1} overflow="hidden">
          {/* LEFT COLUMN */}
          <Box flexDirection="column" width={44} paddingX={1} borderRight={true} borderStyle="single" borderColor="cyan" borderTop={false} borderBottom={false} borderLeft={false} alignItems="center" paddingTop={1}>
            <Thumbnail url={coverUrl} cols={THUMB_COLS} rows={THUMB_ROWS} />

            <Box marginTop={1}>
              <Text
                backgroundColor={isFocused('watch') ? activeBg : undefined}
                color={isFocused('watch') ? "white" : "greenBright"}
                bold
              >
                {isFocused('watch') ? " ▶ WATCH NOW " : "   WATCH NOW "}
              </Text>
            </Box>

            <Box flexDirection="column" marginTop={1} width="100%" paddingX={1}>
              {d.averageScore != null && (
                <Text wrap="truncate" color="yellow">SCORE <Text color={scoreColor(d.averageScore)}>★ {d.averageScore}</Text></Text>
              )}
              {d.meanScore != null && (
                <Text wrap="truncate" color="yellow">MEAN  <Text color="cyan">{d.meanScore}</Text></Text>
              )}
              {d.popularity != null && (
                <Text wrap="truncate" color="yellow">POP   <Text color="cyan">{formatNum(d.popularity)}</Text></Text>
              )}
              {d.favourites != null && (
                <Text wrap="truncate" color="yellow">FAV   <Text color="cyan">{formatNum(d.favourites)}</Text></Text>
              )}
              <Box marginTop={1} flexDirection="column">
                {(d.startDate?.year || d.endDate?.year) && (
                  <Text color="yellow">AIRED</Text>
                )}
                {d.startDate?.year && (
                  <Text dimColor>{fuzzyDate(d.startDate)}</Text>
                )}
                {d.endDate?.year && (
                  <Text dimColor>to {fuzzyDate(d.endDate)}</Text>
                )}
                {d.isAdult && (
                  <Box marginTop={1}>
                    <Text bold color="red" inverse> ⚠ 18+ ADULT </Text>
                  </Box>
                )}
              </Box>
            </Box>
          </Box>

          {/* RIGHT COLUMN */}
          <Box flexDirection="column" flexGrow={1} paddingX={2} paddingTop={1} overflow="hidden">
            <Box marginBottom={1} overflow="hidden" flexShrink={0}>
              <Text wrap="wrap">
                <Text color="yellow">GENRES  </Text>
                <Text color="cyan">{d.genres.length ? d.genres.join(" · ") : "NONE"}</Text>
              </Text>
            </Box>

            <Box flexGrow={1} overflow="hidden" marginBottom={1}>
              <Text
                dimColor={!isFocused('desc')}
                backgroundColor={isFocused('desc') ? activeBg : undefined}
                color={isFocused('desc') ? "white" : undefined}
              >
                {description || "NO SYNOPSIS AVAILABLE."}
              </Text>
            </Box>

            <Box flexDirection="row" flexGrow={2} overflow="hidden">
              {/* SUB COLUMN 1: Characters & Relations */}
              <Box flexDirection="column" width="50%" paddingRight={2}>
                <Text color="yellow" bold>CHARACTERS</Text>
                <Box flexDirection="column" flexGrow={1} overflow="hidden" marginBottom={1}>
                  {d.characters.edges.length === 0 ? <Text dimColor>NONE</Text> : null}
                  {d.characters.edges.slice(0, MAX_ITEMS).map((c, i) => (
                    <Box key={i} width="100%" overflow="hidden">
                      <Text wrap="truncate">
                        <Text color="cyan">› </Text>
                        <Text color={c.role === "MAIN" ? "green" : "white"}>{c.node.name.full}</Text>
                      </Text>
                    </Box>
                  ))}
                </Box>

                <Text color="yellow" bold>RELATIONS</Text>
                <Box flexDirection="column" flexGrow={1} overflow="hidden">
                  {relations.length === 0 ? <Text dimColor>NONE</Text> : null}
                  {visibleRelations.map((r, i) => {
                    const actualIndex = relStart + i;
                    const isF = isFocused('relation', actualIndex);
                    return (
                      <Box key={actualIndex} width="100%" overflow="hidden">
                        <Text wrap="truncate" backgroundColor={isF ? activeBg : undefined}>
                          <Text color="cyan">› </Text>
                          <Text color={isF ? "white" : "green"}>
                            {r.relationType.replace(/_/g, " ").substring(0, 4)} {r.node.title.english ?? r.node.title.romaji}
                          </Text>
                        </Text>
                      </Box>
                    );
                  })}
                </Box>
              </Box>

              {/* SUB COLUMN 2: Staff & Studios */}
              <Box flexDirection="column" width="50%">
                <Text color="yellow" bold>STAFF</Text>
                <Box flexDirection="column" flexGrow={1} overflow="hidden" marginBottom={1}>
                  {d.staff.edges.length === 0 ? <Text dimColor>NONE</Text> : null}
                  {d.staff.edges.slice(0, MAX_ITEMS).map((s, i) => (
                    <Box key={i} width="100%" overflow="hidden">
                      <Text wrap="truncate">
                        <Text color="cyan">› </Text>
                        <Text color="green">{(s.role || "").split(" ")[0].substring(0, 4)} </Text>
                        <Text>{s.node.name.full}</Text>
                      </Text>
                    </Box>
                  ))}
                </Box>

                <Text color="yellow" bold>STUDIOS</Text>
                <Box flexDirection="column" flexGrow={1} overflow="hidden">
                  {(mainStudios.length === 0 && otherStudios.length === 0) ? <Text dimColor>NONE</Text> : null}
                  {mainStudios.concat(otherStudios).slice(0, MAX_ITEMS).map((s, i) => (
                    <Box key={i} width="100%" overflow="hidden">
                      <Text wrap="truncate">
                        <Text color="cyan">› </Text>
                        <Text>{s}</Text>
                      </Text>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* ── BOTTOM AREA: Links & Meta ── */}
        <Box flexDirection="column" flexShrink={0} paddingX={2} borderTop={true} borderStyle="single" borderColor="cyan" borderBottom={false} borderLeft={false} borderRight={false} overflow="hidden">
          {nonSpoilerTags.length > 0 && (
            <Text wrap="truncate">
              <Text color="yellow">TAGS    </Text>
              <Text dimColor>{nonSpoilerTags.map(t => `${t.name} ${t.rank}%`).join(" · ")}</Text>
            </Text>
          )}
          {d.streamingEpisodes.length > 0 && (
            <Text wrap="truncate">
              <Text color="yellow">EPISODES </Text>
              <Text dimColor>{d.streamingEpisodes.map(s => s.title).join(" · ")}</Text>
            </Text>
          )}

          {links.length > 0 && (
            <Box flexDirection="row" flexWrap="wrap">
              <Text color="yellow">LINKS    </Text>
              {links.map((l, i) => {
                const isF = isFocused('link', i);
                return (
                  <Text key={i}>
                    <Text backgroundColor={isF ? activeBg : undefined} color={isF ? "white" : "cyanBright"}>
                      {l.site}
                    </Text>
                    <Text dimColor> · </Text>
                  </Text>
                )
              })}
            </Box>
          )}

          {similar.length > 0 && (
            <Box flexDirection="row" flexWrap="wrap">
              <Text color="yellow">SIMILAR  </Text>
              {similar.map((s, i) => {
                const isF = isFocused('similar', i);
                const title = s.title.english ?? s.title.romaji;
                return (
                  <Text key={i}>
                    <Text backgroundColor={isF ? activeBg : undefined} color={isF ? "white" : undefined}>
                      {title}
                    </Text>
                    <Text dimColor> · </Text>
                  </Text>
                )
              })}
            </Box>
          )}
        </Box>
      </Box>

      {/* ── DESCRIPTION OVERLAY ── */}
      {expandedDesc && (
        <Box position="absolute" width="100%" height="100%" padding={2} flexDirection="column" justifyContent="center" alignItems="center">
          <Box width="80%" borderStyle="double" borderColor="cyan" padding={2} backgroundColor="black">
            <Box marginBottom={1}><Text color="yellow" bold>SYNOPSIS</Text></Box>
            <Text>{description}</Text>
            <Box marginTop={2}>
              <Text dimColor><Text inverse> ESC </Text> CLOSE</Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* ── FOOTER: Keybindings ── */}
      <Box paddingX={1} flexDirection="row" justifyContent="space-between">
        <Text dimColor>
          <Text inverse> ESC </Text> BACK   <Text inverse> ↑↓←→ </Text> NAVIGATE   <Text inverse> ENTER </Text> SELECT
        </Text>
        {d.nextAiringEpisode && (
          <Text color="greenBright" bold>
            📺 EP {d.nextAiringEpisode.episode} IN {timeUntil(d.nextAiringEpisode.timeUntilAiring).toUpperCase()}
          </Text>
        )}
      </Box>
    </Box>
  );
}
