import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { searchAnime, type AnilistAnime } from "../lib/anilist.js";

type Props = {
  title: string;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "not-found" }
  | { status: "done"; anime: AnilistAnime };

export function AnimeTest({ title }: Props) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    searchAnime(title)
      .then((anime) => {
        if (cancelled) return;
        if (!anime) {
          setState({ status: "not-found" });
        } else {
          setState({ status: "done", anime });
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState({ status: "error", message: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [title]);

  if (state.status === "loading") {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> looking up "{title}" on anilist...</Text>
      </Box>
    );
  }

  if (state.status === "error") {
    return <Text color="red">✗ {state.message}</Text>;
  }

  if (state.status === "not-found") {
    return <Text color="yellow">✗ no match found for "{title}"</Text>;
  }

  const { anime } = state;
  const name = anime.title.english ?? anime.title.romaji ?? title;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="green">✓ found match</Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>{name}</Text>
        <Text dimColor>anilist id: {anime.id}</Text>
        <Text dimColor>episodes: {anime.episodes ?? "unknown"}</Text>
        <Text dimColor>status: {anime.status ?? "unknown"}</Text>
        <Text dimColor>cover: {anime.coverImage.medium ?? "none"}</Text>
      </Box>
    </Box>
  );
}
