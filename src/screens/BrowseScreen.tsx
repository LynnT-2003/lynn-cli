import React, { useEffect, useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import Spinner from "ink-spinner";
import {
  fetchCategories,
  fetchCategoriesByGenres,
  type AnilistAnime,
  type CategoryRow,
} from "../lib/anilist.js";
import { Thumbnail } from "../components/Thumbnail.js";
import { useLayout } from "../lib/useLayout.js";
import { db } from "../db/index.js";
import { theme } from "../lib/theme.js";

// anime covers are roughly 2:3 (w:h). raw pixel height is rows*2 (half-block
// trick), so cols:rows*2 should stay close to 2:3 or the crop looks wrong.
const CARD_WIDTH = 20;
const THUMB_ROWS = 15; // -> 20x30 raw pixels, a real 2:3 ratio
const CARD_GAP = 1;
const CARD_BORDER = 2; // borderStyle adds 1 col each side when focused

// vertical space each category row occupies:
// 1 (label) + 1 (marginTop) + THUMB_ROWS (image) + 2 (border top/bottom) + 1 (title)
const ROW_HEIGHT = 1 + 1 + THUMB_ROWS + CARD_BORDER + 1;

// chrome eaten by the header line + padding + hero banner
const CHROME_LINES = 3 + 16; // 1 padding-top + 1 header text + 1 padding-bottom + 16 for hero

type Props = {
  onSelect: (anime: AnilistAnime) => void;
  isFocused: boolean;
  onFocusSidebar?: () => void;
};

let cachedRows: CategoryRow[] | null = null;
let cachedTopSection: {
  topAiring: AnilistAnime[];
  mostPopular: AnilistAnime[];
  mostFavorite: AnilistAnime[];
  latestCompleted: AnilistAnime[];
} | null = null;

export function BrowseScreen({ onSelect, isFocused, onFocusSidebar }: Props) {
  const { exit } = useApp();
  const { contentColumns: columns, rows: termRows } = useLayout();

  const [rows, setRows] = useState<CategoryRow[] | null>(null);
  const [topSection, setTopSection] = useState<{
    topAiring: AnilistAnime[];
    mostPopular: AnilistAnime[];
    mostFavorite: AnilistAnime[];
    latestCompleted: AnilistAnime[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // focusRow = -1: Hero, 0..4: TopSection, 5..: Category Rows
  const [focusRow, setFocusRow] = useState(-1);
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [topCol, setTopCol] = useState(0);
  const [scrollBlockOffset, setScrollBlockOffset] = useState(0);
  const [colByRow, setColByRow] = useState<number[]>([]);

  const loadData = (force = false) => {
    if (!force && cachedRows && cachedTopSection) {
      setRows(cachedRows);
      setTopSection(cachedTopSection);
      setColByRow(cachedRows.map(() => 0));
      return;
    }
    
    if (force) {
      setRows(null);
      cachedRows = null;
      cachedTopSection = null;
    }

    Promise.all([db.profile.get(), db.watch.continueWatching()])
      .then(([profile, cw]) => {
        return Promise.all([
          profile?.genres?.length ? fetchCategoriesByGenres(profile.genres) : fetchCategories(),
          Promise.resolve(cw)
        ]);
      })
      .then(([data, cw]) => {
        let initialRows = data.rows;
        if (cw.length > 0) {
          initialRows = [{
            label: "Continue Watching",
            items: cw.map(c => {
              const m = Math.floor(c.positionSeconds / 60);
              const s = Math.floor(c.positionSeconds % 60).toString().padStart(2, '0');
              const subtext = c.positionSeconds > 0 ? `ep ${c.resumeEpisode} · ${m}:${s}` : `ep ${c.resumeEpisode}`;
              return {
                id: c.anilistId,
                title: { english: c.title, romaji: c.title },
                episodes: c.totalEpisodes,
                status: null,
                description: subtext,
                format: null,
                duration: null,
                seasonYear: null,
                coverImage: { medium: c.cover, large: c.cover },
                bannerImage: null
              } as AnilistAnime;
            })
          }, ...data.rows];
        }
        
        cachedRows = initialRows;
        cachedTopSection = {
          topAiring: data.topAiring,
          mostPopular: data.mostPopular,
          mostFavorite: data.mostFavorite,
          latestCompleted: data.latestCompleted,
        };
        
        setRows(initialRows);
        setTopSection(cachedTopSection);
        setColByRow(initialRows.map(() => 0));
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!rows) return;
    if (isFocused) {
      db.watch.continueWatching().then(cw => {
      let cwRow: CategoryRow | null = null;
      if (cw.length > 0) {
        cwRow = {
          label: "Continue Watching",
          items: cw.map(c => {
             const m = Math.floor(c.positionSeconds / 60);
             const s = Math.floor(c.positionSeconds % 60).toString().padStart(2, '0');
             const subtext = c.positionSeconds > 0 ? `ep ${c.resumeEpisode} · ${m}:${s}` : `ep ${c.resumeEpisode}`;
             return {
               id: c.anilistId,
               title: { english: c.title, romaji: c.title },
               episodes: c.totalEpisodes,
               status: null,
               description: subtext,
               format: null,
               duration: null,
               seasonYear: null,
               coverImage: { medium: c.cover, large: c.cover },
               bannerImage: null
             } as AnilistAnime;
          })
        };
      }
      
      setRows(prev => {
        if (!prev) return prev;
        const hasCw = prev[0]?.label === "Continue Watching";
        if (cwRow && !hasCw) {
          setFocusRow(r => {
            if (r >= 3) return r + 1; // shift category row focus
            return r;
          });
          setColByRow(c => [0, ...c]);
          return [cwRow, ...prev];
        } else if (!cwRow && hasCw) {
          setFocusRow(r => {
            if (r > 3) return r - 1;
            if (r === 3) return 2;
            return r;
          });
          setColByRow(c => c.slice(1));
          return prev.slice(1);
        } else if (cwRow && hasCw) {
          const next = [...prev];
          next[0] = cwRow;
          return next;
        }
        return prev;
      });
      });
    }
  }, [isFocused]);

  const spotlightItems = rows?.find(r => r.label !== "Continue Watching")?.items ?? [];
  const heroAnime = spotlightItems[spotlightIndex];
  const isHeroFocused = focusRow === -1;

  type LogicalBlock = 
    | { type: 'hero', id: string }
    | { type: 'top-columns', id: string }
    | { type: 'category', id: string, row: CategoryRow, rIdx: number };

  const blocks: LogicalBlock[] = [];
  if (heroAnime) blocks.push({ type: 'hero', id: 'hero' });
  if (topSection) blocks.push({ type: 'top-columns', id: 'top-columns' });
  if (rows) rows.forEach((r, i) => blocks.push({ type: 'category', row: r, rIdx: i, id: `cat-${i}` }));

  const getBlockHeight = (block: LogicalBlock) => {
    if (block.type === 'hero') return 16;
    if (block.type === 'top-columns') return 32; // 2 (header) + 3*10 (items) = 32
    if (block.type === 'category') return ROW_HEIGHT + (block.row.label === 'Continue Watching' ? 1 : 0);
    return 0;
  };

  useEffect(() => {
    if (!blocks.length) return;

    const blockOffsets = [3]; // header chrome takes 3 lines
    for (let i = 0; i < blocks.length; i++) {
      blockOffsets.push(blockOffsets[i] + getBlockHeight(blocks[i]!));
    }
    const totalContentHeight = blockOffsets[blocks.length];

    let focusTop = 3;
    let focusBottom = 3;

    if (focusRow === -1) {
      focusTop = blockOffsets[0];
      focusBottom = focusTop + getBlockHeight(blocks[0]!);
    } else if (focusRow >= 0 && focusRow < 3) {
      const bIdx = blocks.findIndex(b => b.type === 'top-columns');
      if (bIdx !== -1) {
        focusTop = blockOffsets[bIdx] + 2 + (focusRow * 10);
        focusBottom = focusTop + 10;
      }
    } else {
      const bIdx = blocks.findIndex(b => b.type === 'category' && b.rIdx === focusRow - 3);
      if (bIdx !== -1) {
        focusTop = blockOffsets[bIdx];
        focusBottom = focusTop + getBlockHeight(blocks[bIdx]!);
      }
    }

    setScrollBlockOffset((prevOffset) => {
      let newOffset = prevOffset;

      while (focusTop < blockOffsets[newOffset] && newOffset > 0) {
        newOffset--;
      }

      while (focusBottom > blockOffsets[newOffset] + termRows && newOffset < blocks.length - 1) {
        newOffset++;
      }

      while (newOffset > 0) {
        const spaceIfUp = blockOffsets[newOffset - 1] + termRows;
        if (spaceIfUp >= totalContentHeight) {
          newOffset--;
        } else {
          break;
        }
      }

      return newOffset;
    });
  }, [focusRow, termRows, blocks.length]);

  useEffect(() => {
    if (!rows) return;
    const spotlightItems = rows.find(r => r.label !== "Continue Watching")?.items ?? [];
    if (spotlightItems.length <= 1) return;

    const timer = setTimeout(() => {
      setSpotlightIndex((prev) => (prev + 1) % spotlightItems.length);
    }, 5000);

    return () => clearTimeout(timer);
  }, [spotlightIndex, rows]);

  const cardSlot = CARD_WIDTH + CARD_GAP + CARD_BORDER;
  const visibleCount = Math.max(1, Math.floor((columns - 4) / cardSlot));

  useInput((input, key) => {
    if (key.escape) {
      exit();
      return;
    }
    if (input?.toLowerCase() === 'r') {
      loadData(true);
      return;
    }
    if (!rows) return;

    const spotlightItems = rows.find(r => r.label !== "Continue Watching")?.items ?? []; // Use trending for spotlight

    if (focusRow === -1) {
      // Hero Carousel is focused
      if (key.upArrow) {
        // Do nothing, already at top
      } else if (key.downArrow) {
        setFocusRow(0);
      } else if (key.leftArrow) {
        if (spotlightIndex === 0) onFocusSidebar?.();
        else setSpotlightIndex((prev) => Math.max(0, prev - 1));
      } else if (key.rightArrow) {
        setSpotlightIndex((prev) => Math.min(spotlightItems.length - 1, prev + 1));
      } else if (key.return) {
        const item = spotlightItems[spotlightIndex];
        if (item) onSelect(item);
      }
      return;
    }

    if (focusRow >= 0 && focusRow < 3) {
      if (key.upArrow) setFocusRow(r => r - 1);
      else if (key.downArrow) setFocusRow(r => r + 1);
      else if (key.leftArrow) {
        if (topCol === 0) onFocusSidebar?.();
        else setTopCol(c => c - 1);
      }
      else if (key.rightArrow) setTopCol(c => Math.min(3, c + 1));
      else if (key.return && topSection) {
        const lists = [topSection.topAiring, topSection.mostPopular, topSection.mostFavorite, topSection.latestCompleted];
        const item = lists[topCol]?.[focusRow];
        if (item) onSelect(item);
      }
      return;
    }

    const rIdx = focusRow - 3;
    const currentItems = rows[rIdx]?.items ?? [];
    const currentCol = colByRow[rIdx] ?? 0;

    if (key.upArrow) {
      setFocusRow((r) => r - 1); // Goes to -1 if at 0
    } else if (key.downArrow) {
      setFocusRow((r) => Math.min(3 + rows.length - 1, r + 1));
    } else if (key.leftArrow) {
      if (currentCol === 0) {
        onFocusSidebar?.();
      } else {
        setColByRow((prev) => {
          const next = [...prev];
          next[rIdx] = Math.max(0, currentCol - 1);
          return next;
        });
      }
    } else if (key.rightArrow) {
      setColByRow((prev) => {
        const next = [...prev];
        next[rIdx] = Math.min(currentItems.length - 1, currentCol + 1);
        return next;
      });
    } else if (key.return) {
      const item = currentItems[currentCol];
      if (item) onSelect(item);
    }
  }, { isActive: isFocused });

  if (error) {
    return <Text color={theme.text.error}>✗ {error}</Text>;
  }

  if (!rows) {
    return (
      <Box>
        <Text color={theme.text.accent}>
          <Spinner type="dots" />
        </Text>
        <Text> loading catalogue...</Text>
      </Box>
    );
  }

  const leftWidth = Math.floor(columns * 0.5) - 2;
  const rightWidth = Math.floor(columns * 0.5);

  const visibleBlocks: LogicalBlock[] = [];
  let currentHeight = 3; // header chrome
  for (let i = scrollBlockOffset; i < blocks.length; i++) {
    const h = getBlockHeight(blocks[i]!);
    visibleBlocks.push(blocks[i]!);
    currentHeight += h;
    
    if (currentHeight >= termRows) {
      break;
    }
  }

  return (
    <Box flexDirection="column" padding={1} flexShrink={0}>
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1} flexShrink={0}>
        <Text bold color={theme.text.accent}>landing-page coming soon</Text>
        <Text color={theme.text.dim}>arrows: move, enter: select, r: refresh</Text>
      </Box>

      <Box flexDirection="column" flexShrink={0}>
      {visibleBlocks.map(block => {
        if (block.type === 'hero') {
          return (
            <Box key={block.id} flexDirection="row" height={15} marginBottom={1} overflow="hidden" borderStyle="round" borderColor={isHeroFocused ? theme.border.hero : theme.border.default}>
              {/* LEFT: INFO */}
              <Box flexDirection="column" width={leftWidth} paddingRight={2} justifyContent="center" paddingLeft={1}>
                <Text color={theme.text.highlightBright} bold>#{spotlightIndex + 1} Spotlight</Text>
                <Box marginY={1} overflow="hidden" height={1}>
                  <Text bold color={theme.text.normal} wrap="truncate">{heroAnime.title.english ?? heroAnime.title.romaji}</Text>
                </Box>
                
                <Box flexDirection="row" marginBottom={1}>
                  <Text color={theme.text.dim}>▶ {heroAnime.format ?? "TV"} • {heroAnime.duration ? `${heroAnime.duration}m` : "?m"} • {heroAnime.seasonYear ?? ""}  </Text>
                  <Text backgroundColor={theme.bg.focus} color={theme.bg.black}> HD </Text>
                  <Text>  </Text>
                  <Text backgroundColor={theme.bg.inverse} color={theme.bg.black}> EP {heroAnime.episodes ?? "?"} </Text>
                </Box>
                
                <Box height={2} overflow="hidden">
                  <Text color={theme.text.dim} wrap="wrap">{heroAnime.description?.replace(/<[^>]+>/g, "").trim()}</Text>
                </Box>
                
                <Box flexDirection="row" marginTop={1}>
                  <Text backgroundColor={isHeroFocused ? theme.bg.highlight : theme.bg.active} color={theme.bg.black} bold> ▶ Watch Now </Text>
                  <Text>   </Text>
                  <Text backgroundColor={theme.bg.active} color={theme.bg.black}> Detail {'>'} </Text>
                </Box>
              </Box>
              
              {/* RIGHT: BANNER IMAGE */}
              <Box width={rightWidth} overflow="hidden">
                <Thumbnail
                  url={heroAnime.bannerImage ?? heroAnime.coverImage.large ?? heroAnime.coverImage.medium}
                  cols={rightWidth - 2}
                  rows={13} // Account for borders (15 - 2)
                  fit="contain"
                />
              </Box>
            </Box>
          );
        }

        if (block.type === 'top-columns' && topSection) {
          const lists = [
            { label: "Top Airing", items: topSection.topAiring },
            { label: "Most Popular", items: topSection.mostPopular },
            { label: "Most Favorite", items: topSection.mostFavorite },
            { label: "Latest Completed", items: topSection.latestCompleted },
          ];
          const colWidth = Math.floor(columns / 4) - 2;
          const textWidth = Math.max(1, colWidth - 11); // 10 (thumb) + 1 (marginRight)

          return (
            <Box key={block.id} flexDirection="row" justifyContent="space-between" marginBottom={2}>
              {lists.map((col, cIdx) => (
                <Box key={cIdx} flexDirection="column" width={colWidth}>
                  <Box marginBottom={1}>
                    <Text bold color={theme.text.highlight}>{col.label}</Text>
                  </Box>
                  {col.items.slice(0, 3).map((item, rIdx) => {
                    const isFocused = focusRow === rIdx && topCol === cIdx;
                    return (
                      <Box key={item.id} flexDirection="row" marginBottom={2} flexShrink={0}>
                        <Box width={10} height={8} marginRight={1} flexShrink={0}>
                          <Thumbnail url={item.coverImage.medium} cols={10} rows={8} fit="cover" />
                        </Box>
                        <Box flexDirection="column" overflow="hidden" justifyContent="center" width={textWidth}>
                          <Text wrap="truncate-end" bold color={isFocused ? theme.text.successBright : theme.text.normal}>
                            {isFocused ? "> " : ""}{item.title.english ?? item.title.romaji ?? "unknown"}
                          </Text>
                          <Text color={theme.text.dim} wrap="truncate-end">
                            {item.episodes ? `EP ${item.episodes}` : "??"} • {item.format ?? "TV"}
                          </Text>
                          <Box flexDirection="row" marginTop={1}>
                             <Text backgroundColor={theme.bg.focus} color={theme.bg.black}> HD </Text>
                             <Text>  </Text>
                             <Text backgroundColor={theme.bg.inverse} color={theme.bg.black}> {item.seasonYear ?? "NEW"} </Text>
                          </Box>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              ))}
            </Box>
          );
        }

        if (block.type === 'category') {
          const row = block.row;
          const rIdx = block.rIdx;
          const focusedRow = (focusRow - 3) === rIdx;
          const items = row.items;
          const col = colByRow[rIdx] ?? 0;

          const maxStart = Math.max(0, items.length - visibleCount);
          const start = Math.max(0, Math.min(col - 1, maxStart));
          const visible = items.slice(start, start + visibleCount);

          return (
            <Box key={block.id} flexDirection="column" marginTop={1}>
              <Text bold color={focusedRow ? theme.text.successBright : theme.text.normal}>
                {focusedRow ? "▶ " : "  "}
                {row.label}
                {focusedRow ? ` (${col + 1}/${items.length})` : ""}
              </Text>

              <Box flexDirection="row" width="100%" justifyContent="flex-start">
                {visible.map((item, i) => {
                  const actualIdx = start + i;
                  const isFocused = focusedRow && actualIdx === col;
                  const title = item.title.english ?? item.title.romaji ?? "unknown";

                  return (
                    <Box
                      key={item.id}
                      flexDirection="column"
                      width={CARD_WIDTH + CARD_BORDER}
                      marginRight={CARD_GAP}
                      borderStyle="round"
                      borderColor={isFocused ? theme.border.hero : "#222"}
                    >
                      <Box width={CARD_WIDTH} height={THUMB_ROWS} overflow="hidden">
                        <Thumbnail
                          url={item.coverImage.medium}
                          cols={CARD_WIDTH}
                          rows={THUMB_ROWS}
                        />
                      </Box>
                      <Box width={CARD_WIDTH} overflow="hidden" flexDirection="column">
                        <Text wrap="truncate-end" bold={isFocused} color={isFocused ? theme.text.successBright : theme.text.normal}>{title}</Text>
                        {row.label === "Continue Watching" && (
                          <Text dimColor>{item.description}</Text>
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          );
        }
        return null;
      })}
      </Box>
    </Box>
  );
}
