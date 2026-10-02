import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import type { AnilistAnime } from "../lib/anilist.js";
import { useTerminalSize } from "../lib/useTerminalSize.js";
import {
  findHianimeAnime,
  hianimeEpisodes,
  hianimeGetStreamUrl,
  type HianimeResult,
  type HianimeEpisode,
} from "../lib/hianime.js";
import { launchPlayer } from "../lib/player.js";

type Props = {
  anime: AnilistAnime;
  onClose: () => void;
};

export function EpisodePickerOverlay({ anime, onClose }: Props) {
  const { columns, rows: termRows } = useTerminalSize();

  const [hianimeTitle, setHianimeTitle] = useState<HianimeResult | null>(null);
  const [episodes, setEpisodes] = useState<HianimeEpisode[]>([]);
  const [loading, setLoading] = useState("Matching title...");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"sub" | "dub">("sub");
  const [focusIdx, setFocusIdx] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    const titleToSearch = anime.title.english || anime.title.romaji;
    if (!titleToSearch) {
      setError("Anime has no title");
      setLoading("");
      return;
    }

    findHianimeAnime(titleToSearch)
      .then((res) => {
        if (!res) {
          setError(`Could not find a match for "${titleToSearch}"`);
          setLoading("");
          return;
        }
        setHianimeTitle(res);
        setLoading(`Fetching episodes for ${res.title}...`);
        return hianimeEpisodes(res.id);
      })
      .then((eps) => {
        if (eps) {
          setEpisodes(eps);
          setLoading("");
        }
      })
      .catch((e) => {
        setError(e.message);
        setLoading("");
      });
  }, [anime]);

  const overlayWidth = Math.min(50, columns - 4);
  const maxVisibleRows = Math.max(5, termRows - 10);

  useEffect(() => {
    setScrollOffset((prev) => {
      if (focusIdx < prev) return focusIdx;
      if (focusIdx >= prev + maxVisibleRows) return focusIdx - maxVisibleRows + 1;
      return prev;
    });
  }, [focusIdx, maxVisibleRows]);

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (error) return; // if error, only escape works

    if (key.downArrow || input === "j") {
      setFocusIdx((prev) => (prev < episodes.length - 1 ? prev + 1 : prev));
    }
    
    if (key.upArrow || input === "k") {
      setFocusIdx((prev) => (prev > 0 ? prev - 1 : 0));
    }

    if (input === "m") {
      setMode((m) => (m === "sub" ? "dub" : "sub"));
    }

    if (key.return && episodes.length > 0 && !loading) {
      const ep = episodes[focusIdx]!;
      setLoading(`Resolving stream for Episode ${ep.epNo}...`);
      
      hianimeGetStreamUrl(ep.dataId, mode)
        .then((streamInfo) => {
          setLoading(`Launching player...`);
          return launchPlayer({
            videoUrl: streamInfo.videoUrl,
            subtitleUrl: streamInfo.subtitleUrl,
            referer: streamInfo.referer,
            title: hianimeTitle!.title,
            episodeNo: ep.epNo,
          });
        })
        .then(() => {
          // Success! Player is launching in the bg. We can close this overlay.
          onClose();
        })
        .catch((e) => {
          setError(e.message);
          setLoading("");
        });
    }
  });

  return (
    <Box
      position="absolute"
      flexDirection="column"
      marginTop={Math.max(1, Math.floor((termRows - maxVisibleRows - 8) / 2))}
      marginLeft={Math.floor((columns - overlayWidth) / 2)}
      width={overlayWidth}
      borderStyle="round"
      borderColor="magenta"
      paddingX={1}
      backgroundColor="black"
    >
      {/* Header */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="magenta">
          ▶ Select Episode
        </Text>
        <Text dimColor>
          {hianimeTitle ? hianimeTitle.title : anime.title.english || anime.title.romaji}
        </Text>
      </Box>

      {/* Loading or Error */}
      {loading ? (
        <Box paddingY={1}>
          <Text color="cyan">
            <Spinner type="dots" />{" "}
          </Text>
          <Text>{loading}</Text>
        </Box>
      ) : error ? (
        <Box paddingY={1}>
          <Text color="red">✗ {error}</Text>
        </Box>
      ) : (
        <>
          {/* Controls hint */}
          <Box marginBottom={1}>
            <Text dimColor>
              Mode: <Text color={mode === "sub" ? "green" : "white"}>Sub</Text> /{" "}
              <Text color={mode === "dub" ? "green" : "white"}>Dub</Text> (press 'm' to toggle)
            </Text>
          </Box>

          {/* Episode List */}
          <Box flexDirection="column" overflow="hidden">
            {episodes.length === 0 ? (
              <Text dimColor>No episodes found.</Text>
            ) : (
              episodes.slice(scrollOffset, scrollOffset + maxVisibleRows).map((ep, i) => {
                const actualIdx = scrollOffset + i;
                const isFocused = actualIdx === focusIdx;
                return (
                  <Box key={ep.dataId}>
                    <Text
                      color={isFocused ? "magentaBright" : "white"}
                      bold={isFocused}
                    >
                      {isFocused ? "▶ " : "  "}
                      Episode {ep.epNo}
                    </Text>
                  </Box>
                );
              })
            )}
          </Box>
        </>
      )}

      {/* Footer hint */}
      <Box marginTop={1}>
        <Text dimColor>
          ↑↓/jk scroll · m toggle sub/dub · enter play · esc close
        </Text>
      </Box>
    </Box>
  );
}
