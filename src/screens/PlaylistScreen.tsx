import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { theme } from "../lib/theme.js";
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
        status
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

type Props = {
  playlist: Playlist;
  onSelect: (anime: AnilistAnime) => void;
  onBack: () => void;
  isFocused?: boolean;
};

export function PlaylistScreen({ playlist, onSelect, onBack, isFocused = true }: Props) {
  const [items, setItems] = useState<AnilistAnime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);

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
        const media: AnilistAnime[] = data.data.Page.media;
        const sorted = playlist.animeIds.map(id => media.find(m => m.id === id)).filter(Boolean) as AnilistAnime[];
        
        setItems(sorted);
        setLoading(false);
      })
      .catch((err: any) => {
        setError(err.message);
        setLoading(false);
      });
  }, [playlist]);

  useInput((input, key) => {
    if (!isFocused) return;

    if (key.escape || key.backspace || input?.toLowerCase() === "b") {
      onBack();
      return;
    }

    if (items.length === 0) return;

    if (key.upArrow) {
      setFocusIdx(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setFocusIdx(prev => Math.min(items.length - 1, prev + 1));
    } else if (key.return) {
      onSelect(items[focusIdx]);
    }
  }, { isActive: isFocused });

  return (
    <Box flexDirection="column" flexGrow={1} backgroundColor={theme.bg.black} padding={2}>
      <Box marginBottom={1}>
        <Text color={theme.text.highlight} bold>PLAYLIST: {playlist.name}</Text>
      </Box>

      {loading ? (
        <Box marginTop={2}>
          <Text color={theme.text.highlight}><Spinner type="dots" /> LOADING ITEMS...</Text>
        </Box>
      ) : error ? (
        <Box marginTop={2}>
          <Text color="red">Error: {error}</Text>
        </Box>
      ) : items.length === 0 ? (
        <Box marginTop={2}>
          <Text dimColor>This playlist is empty.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {items.map((item, idx) => {
            const isFoc = focusIdx === idx;
            const title = item.title.english || item.title.romaji || "Unknown";
            return (
              <Box key={item.id} paddingX={1} backgroundColor={isFoc ? "#444" : undefined}>
                <Text color={isFoc ? "white" : "gray"}>
                  {isFoc ? "▶ " : "  "}
                  {title} {item.episodes ? `(${item.episodes} eps)` : ""}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      <Box marginTop={2} flexGrow={1} justifyContent="flex-end">
        <Text dimColor>
          <Text inverse> ESC </Text> BACK   <Text inverse> ↑↓ </Text> NAVIGATE   <Text inverse> ENTER </Text> OPEN
        </Text>
      </Box>
    </Box>
  );
}
