import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { searchAnimePage, type AnilistAnime } from "../lib/anilist.js";
import { useTerminalSize } from "../lib/useTerminalSize.js";
import { Thumbnail } from "../components/Thumbnail.js";

const DEBOUNCE_MS = 800;
const PREVIEW_COUNT = 5;

type Props = {
  onSelectAnime: (anime: AnilistAnime) => void;
  onCommitQuery: (query: string) => void;
  onClose: () => void
};

export function SearchOverlay({
  onSelectAnime,
  onCommitQuery,
  onClose,
}: Props) {
  const { columns } = useTerminalSize();

  const [query, setQuery] = useState("");
  // -1 = text input focused, 0..4 = result highlighted
  const [focusIdx, setFocusIdx] = useState(-1);
  const [results, setResults] = useState<AnilistAnime[]>([]);
  const [loading, setLoading] = useState(false);

  // debounce timer ref
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // track which query the inflight request was for, so stale responses
  // don't overwrite a newer query's results
  const inflightQueryRef = useRef("");

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (query.trim().length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    timerRef.current = setTimeout(() => {
      const q = query.trim();
      inflightQueryRef.current = q;

      searchAnimePage(q, 1, PREVIEW_COUNT)
        .then(({ results: r }) => {
          // only apply if this is still the latest query
          if (inflightQueryRef.current === q) {
            setResults(r);
            setLoading(false);
          }
        })
        .catch(() => {
          if (inflightQueryRef.current === q) {
            setResults([]);
            setLoading(false);
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (key.return) {
      if (focusIdx >= 0 && focusIdx < results.length) {
        // enter on a highlighted result → detail directly
        onSelectAnime(results[focusIdx]!);
      } else if (query.trim().length > 0) {
        // enter from input → commit query → search grid
        onCommitQuery(query.trim());
      }
      return;
    }

    if (key.downArrow) {
      setFocusIdx((prev) =>
        prev < results.length - 1 ? prev + 1 : prev,
      );
      return;
    }

    if (key.upArrow) {
      setFocusIdx((prev) => (prev > -1 ? prev - 1 : -1));
      return;
    }

    // text editing: printable chars and backspace/delete
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      setFocusIdx(-1);
      return;
    }

    // ignore control sequences (tab, etc)
    if (key.tab || key.ctrl || key.meta) return;

    // printable character
    if (input && input.length > 0) {
      setQuery((q) => q + input);
      setFocusIdx(-1);
    }
  });

  const overlayWidth = Math.min(60, columns - 4);

  return (
    <Box
      position="absolute"
      flexDirection="column"
      marginTop={1}
      marginLeft={Math.floor((columns - overlayWidth) / 2)}
      width={overlayWidth}
      borderStyle="round"
      borderColor="cyan"
      backgroundColor="black"
      paddingX={1}
    >
      {/* search input */}
      <Box>
        <Text color="cyan" bold>
          🔍{" "}
        </Text>
        <Text>
          {query}
          {focusIdx === -1 ? (
            <Text color="cyan" bold>
              ▎
            </Text>
          ) : (
            ""
          )}
        </Text>
      </Box>

      {/* loading indicator */}
      {loading && query.trim().length > 0 && (
        <Box marginTop={1}>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text dimColor> searching...</Text>
        </Box>
      )}

      {/* results list */}
      {results.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {results.map((item, i) => {
            const highlighted = i === focusIdx;
            const title =
              item.title.english ?? item.title.romaji ?? "unknown";
            const info = [
              item.episodes ? `${item.episodes} ep` : null,
              item.status,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <Box 
                key={item.id} 
                paddingX={1} 
                flexDirection="row" 
                alignItems="center"
                marginBottom={i === results.length - 1 ? 0 : 1}
              >
                <Box width={2} flexShrink={0}>
                  <Text color={highlighted ? "greenBright" : "white"} bold={highlighted}>
                    {highlighted ? "▶" : ""}
                  </Text>
                </Box>
                <Thumbnail url={item.coverImage.medium} cols={6} rows={3} />
                <Box flexDirection="column" marginLeft={1} flexGrow={1} overflow="hidden">
                  <Text color={highlighted ? "greenBright" : "white"} bold={highlighted} wrap="truncate">
                    {title}
                  </Text>
                  {info && <Text dimColor wrap="truncate">{info}</Text>}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* empty state */}
      {!loading && query.trim().length > 0 && results.length === 0 && (
        <Box marginTop={1}>
          <Text dimColor>no results</Text>
        </Box>
      )}

      {/* hint */}
      <Box marginTop={1}>
        <Text dimColor>
          ↑↓ navigate · enter{" "}
          {focusIdx >= 0 ? "open" : "show all results"} · esc close
        </Text>
      </Box>
    </Box>
  );
}
