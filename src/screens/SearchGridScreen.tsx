import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { searchAnimePage, type AnilistAnime } from "../lib/anilist.js";
import { Thumbnail } from "../components/Thumbnail.js";
import { useTerminalSize } from "../lib/useTerminalSize.js";

const CARD_WIDTH = 20;
const THUMB_ROWS = 15;
const CARD_GAP = 1;
const CARD_BORDER = 2;

// vertical space per grid row: marginTop(1) + cards(THUMB_ROWS + border + title)
const GRID_ROW_HEIGHT = 1 + THUMB_ROWS + CARD_BORDER + 1;
// chrome: padding-top(1) + header(1) + padding-bottom(1)
const CHROME = 3;

const PER_PAGE = 15;

type Props = {
  query: string;
  onSelect: (anime: AnilistAnime) => void;
  onBack: () => void;
};

export function SearchGridScreen({ query, onSelect, onBack }: Props) {
  const { columns, rows: termRows } = useTerminalSize();

  const [items, setItems] = useState<AnilistAnime[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [focusIdx, setFocusIdx] = useState(0);
  const [scrollRow, setScrollRow] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // how many cards per row, how many grid rows visible
  const cardSlot = CARD_WIDTH + CARD_GAP + CARD_BORDER;
  const gridCols = Math.max(1, Math.floor((columns - 4) / cardSlot));
  const maxVisibleGridRows = Math.max(
    1,
    Math.ceil((termRows - CHROME) / GRID_ROW_HEIGHT),
  );

  // fetch initial page
  useEffect(() => {
    setLoading(true);
    searchAnimePage(query, 1, PER_PAGE)
      .then(({ results, hasNextPage }) => {
        setItems(results);
        setHasMore(hasNextPage);
        setPage(1);
        setFocusIdx(0);
        setScrollRow(0);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [query]);

  // auto-fetch next page when focus nears the bottom
  const totalGridRows = Math.ceil(items.length / gridCols);
  const focusGridRow = Math.floor(focusIdx / gridCols);

  useEffect(() => {
    // trigger when within 1 row of the bottom and there's more to fetch
    if (
      hasMore &&
      !loading &&
      focusGridRow >= totalGridRows - 2 &&
      items.length > 0
    ) {
      const nextPage = page + 1;
      setLoading(true);
      searchAnimePage(query, nextPage, PER_PAGE)
        .then(({ results, hasNextPage }) => {
          setItems((prev) => [...prev, ...results]);
          setHasMore(hasNextPage);
          setPage(nextPage);
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
        });
    }
  }, [focusGridRow, totalGridRows, hasMore, loading, page, query, items.length]);

  // keep scrollRow in sync so focused row is visible
  useEffect(() => {
    setScrollRow((prev) => {
      if (focusGridRow < prev) return focusGridRow;
      if (focusGridRow >= prev + maxVisibleGridRows)
        return focusGridRow - maxVisibleGridRows + 1;
      return prev;
    });
  }, [focusGridRow, maxVisibleGridRows]);

  useInput((_input, key) => {
    if (key.escape) {
      onBack();
      return;
    }

    if (key.return) {
      const item = items[focusIdx];
      if (item) onSelect(item);
      return;
    }

    const focusCol = focusIdx % gridCols;

    if (key.leftArrow) {
      setFocusIdx((prev) => Math.max(0, prev - 1));
    } else if (key.rightArrow) {
      setFocusIdx((prev) => Math.min(items.length - 1, prev + 1));
    } else if (key.upArrow) {
      const target = focusIdx - gridCols;
      if (target >= 0) setFocusIdx(target);
    } else if (key.downArrow) {
      const target = focusIdx + gridCols;
      if (target < items.length) {
        setFocusIdx(target);
      } else if (target >= items.length && items.length > 0) {
        // last incomplete row — snap to last item
        setFocusIdx(items.length - 1);
      }
    }
  });

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">✗ {error}</Text>
        <Text dimColor>esc to go back</Text>
      </Box>
    );
  }

  if (loading && items.length === 0) {
    return (
      <Box padding={1}>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> searching "{query}"...</Text>
      </Box>
    );
  }

  if (items.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">no results for "{query}"</Text>
        <Text dimColor>esc to go back</Text>
      </Box>
    );
  }

  // build grid rows from flat items array
  const gridRows: AnilistAnime[][] = [];
  for (let i = 0; i < items.length; i += gridCols) {
    gridRows.push(items.slice(i, i + gridCols));
  }

  const visibleGridRows = gridRows.slice(
    scrollRow,
    scrollRow + maxVisibleGridRows,
  );

  const canScrollUp = scrollRow > 0;
  const canScrollDown =
    scrollRow + maxVisibleGridRows < gridRows.length || hasMore;

  return (
    <Box flexDirection="column" padding={1} height={termRows} overflow="hidden">
      <Text bold color="cyan">
        results for "{query}" ({items.length}
        {hasMore ? "+" : ""})
        {canScrollUp ? "  ↑" : ""}
        {canScrollDown ? "  ↓" : ""}
        <Text dimColor>  esc to go back</Text>
      </Text>

      {visibleGridRows.map((rowItems, vIdx) => {
        const gridRowIdx = scrollRow + vIdx;

        return (
          <Box key={gridRowIdx} flexDirection="row" marginTop={1}>
            {rowItems.map((item, colIdx) => {
              const itemIdx = gridRowIdx * gridCols + colIdx;
              const isFocused = itemIdx === focusIdx;
              const title =
                item.title.english ?? item.title.romaji ?? "unknown";

              return (
                <Box
                  key={item.id}
                  flexDirection="column"
                  width={CARD_WIDTH + 2}
                  marginRight={CARD_GAP}
                  borderStyle={isFocused ? "round" : undefined}
                  borderColor={isFocused ? "green" : undefined}
                >
                  <Thumbnail
                    url={item.coverImage.medium}
                    cols={CARD_WIDTH}
                    rows={THUMB_ROWS}
                  />
                  <Text wrap="truncate-end">{title}</Text>
                </Box>
              );
            })}
          </Box>
        );
      })}

      {/* loading more indicator */}
      {loading && items.length > 0 && (
        <Box marginTop={1}>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text dimColor> loading more...</Text>
        </Box>
      )}

      {/* end of results */}
      {!hasMore && (
        <Box marginTop={1}>
          <Text dimColor>— end of results —</Text>
        </Box>
      )}
    </Box>
  );
}
