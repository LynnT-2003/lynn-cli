import React, { useEffect, useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import Spinner from "ink-spinner";
import {
  fetchCategories,
  type AnilistAnime,
  type CategoryRow,
} from "../lib/anilist.js";
import { Thumbnail } from "../components/Thumbnail.js";
import { useTerminalSize } from "../lib/useTerminalSize.js";

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
  onSearch: () => void;
  isFocused: boolean;
};

export function BrowseScreen({ onSelect, onSearch, isFocused }: Props) {
  const { exit } = useApp();
  const { columns, rows: termRows } = useTerminalSize();

  const [rows, setRows] = useState<CategoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // focusRow = -1 means Spotlight Hero Carousel is focused
  const [focusRow, setFocusRow] = useState(-1);
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [colByRow, setColByRow] = useState<number[]>([]);

  useEffect(() => {
    fetchCategories()
      .then((data) => {
        setRows(data);
        setColByRow(data.map(() => 0));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const maxVisibleRows = Math.max(1, Math.ceil((termRows - CHROME_LINES) / ROW_HEIGHT));

  useEffect(() => {
    setScrollOffset((prev) => {
      if (focusRow < 0) return 0;
      if (focusRow < prev) return focusRow;
      if (focusRow >= prev + maxVisibleRows) return focusRow - maxVisibleRows + 1;
      return prev;
    });
  }, [focusRow, maxVisibleRows]);

  const cardSlot = CARD_WIDTH + CARD_GAP + CARD_BORDER;
  const visibleCount = Math.max(1, Math.floor((columns - 4) / cardSlot));

  useInput((input, key) => {
    if (key.escape) {
      exit();
      return;
    }
    if (!rows) return;

    if (input === "s") {
      onSearch();
      return;
    }

    const spotlightItems = rows[0]?.items ?? []; // Use trending for spotlight

    if (focusRow === -1) {
      // Hero Carousel is focused
      if (key.upArrow) {
        onSearch();
      } else if (key.downArrow) {
        setFocusRow(0);
      } else if (key.leftArrow) {
        setSpotlightIndex((prev) => Math.max(0, prev - 1));
      } else if (key.rightArrow) {
        setSpotlightIndex((prev) => Math.min(spotlightItems.length - 1, prev + 1));
      } else if (key.return) {
        const item = spotlightItems[spotlightIndex];
        if (item) onSelect(item);
      }
      return;
    }

    const currentItems = rows[focusRow]?.items ?? [];
    const currentCol = colByRow[focusRow] ?? 0;

    if (key.upArrow) {
      setFocusRow((r) => r - 1); // Goes to -1 if at 0
    } else if (key.downArrow) {
      setFocusRow((r) => Math.min(rows.length - 1, r + 1));
    } else if (key.leftArrow) {
      setColByRow((prev) => {
        const next = [...prev];
        next[focusRow] = Math.max(0, currentCol - 1);
        return next;
      });
    } else if (key.rightArrow) {
      setColByRow((prev) => {
        const next = [...prev];
        next[focusRow] = Math.min(currentItems.length - 1, currentCol + 1);
        return next;
      });
    } else if (key.return) {
      const item = currentItems[currentCol];
      if (item) onSelect(item);
    }
  }, { isActive: isFocused });

  if (error) {
    return <Text color="red">✗ {error}</Text>;
  }

  if (!rows) {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> loading catalogue...</Text>
      </Box>
    );
  }

  const visibleRows = rows.slice(scrollOffset, scrollOffset + maxVisibleRows);
  const spotlightItems = rows[0]?.items ?? [];
  const heroAnime = spotlightItems[spotlightIndex];
  const isHeroFocused = focusRow === -1;

  const leftWidth = Math.floor(columns * 0.5) - 2;
  const rightWidth = Math.floor(columns * 0.5);

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Text bold color="cyan">aniwatch-cli</Text>
        <Text dimColor>s to search, arrows to move, enter to select</Text>
      </Box>

      {/* SPOTLIGHT HERO BANNER */}
      {heroAnime && (
        <Box flexDirection="row" height={15} marginBottom={1} overflow="hidden" borderStyle="round" borderColor={isHeroFocused ? "yellow" : "gray"}>
          {/* LEFT: INFO */}
          <Box flexDirection="column" width={leftWidth} paddingRight={2} justifyContent="center" paddingLeft={1}>
            <Text color="yellowBright" bold>#{spotlightIndex + 1} Spotlight</Text>
            <Box marginY={1} overflow="hidden" height={1}>
              <Text bold color="white" wrap="truncate">{heroAnime.title.english ?? heroAnime.title.romaji}</Text>
            </Box>
            
            <Box flexDirection="row" marginBottom={1}>
              <Text color="gray">▶ {heroAnime.format ?? "TV"} • {heroAnime.duration ? `${heroAnime.duration}m` : "?m"} • {heroAnime.seasonYear ?? ""}  </Text>
              <Text backgroundColor="green" color="black"> HD </Text>
              <Text>  </Text>
              <Text backgroundColor="white" color="black"> EP {heroAnime.episodes ?? "?"} </Text>
            </Box>
            
            <Box height={2} overflow="hidden">
              <Text color="gray" wrap="wrap">{heroAnime.description?.replace(/<[^>]+>/g, "").trim()}</Text>
            </Box>
            
            <Box flexDirection="row" marginTop={1}>
              <Text backgroundColor={isHeroFocused ? "yellow" : "gray"} color="black" bold> ▶ Watch Now </Text>
              <Text>   </Text>
              <Text backgroundColor="gray" color="black"> Detail {'>'} </Text>
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
      )}

      {/* CATEGORIES */}
      {visibleRows.map((row, vIdx) => {
        const rIdx = scrollOffset + vIdx;
        const focusedRow = rIdx === focusRow;
        const items = row.items;
        const col = colByRow[rIdx] ?? 0;

        const maxStart = Math.max(0, items.length - visibleCount);
        const start = Math.max(0, Math.min(col - 1, maxStart));
        const visible = items.slice(start, start + visibleCount);

        return (
          <Box key={row.label} flexDirection="column" marginTop={1}>
            <Text bold color={focusedRow ? "greenBright" : "white"}>
              {focusedRow ? "▶ " : "  "}
              {row.label}
              {focusedRow ? ` (${col + 1}/${items.length})` : ""}
            </Text>

            <Box flexDirection="row" width="100%" justifyContent="space-between">
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
                    borderStyle={isFocused ? "round" : undefined}
                    borderColor={isFocused ? "green" : undefined}
                  >
                    <Box width={CARD_WIDTH} height={THUMB_ROWS} overflow="hidden">
                      <Thumbnail
                        url={item.coverImage.medium}
                        cols={CARD_WIDTH}
                        rows={THUMB_ROWS}
                      />
                    </Box>
                    <Box width={CARD_WIDTH} overflow="hidden">
                      <Text wrap="truncate-end">{title}</Text>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
