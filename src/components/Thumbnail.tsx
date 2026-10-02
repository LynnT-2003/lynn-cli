import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { imageToAnsi } from "../lib/image.js";

type Props = {
  url: string | null;
  cols: number;
  rows: number;
  fit?: "cover" | "contain";
};

export function Thumbnail({ url, cols, rows, fit = "cover" }: Props) {
  const [art, setArt] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setArt(null);
    setFailed(false);

    if (!url) {
      setFailed(true);
      return;
    }

    imageToAnsi(url, cols, rows, fit)
      .then((a) => {
        if (!cancelled) setArt(a);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [url, cols, rows]);

  if (failed) {
    return (
      <Box
        width={cols}
        height={rows}
        alignItems="center"
        justifyContent="center"
      >
        <Text dimColor>no image</Text>
      </Box>
    );
  }

  if (!art) {
    return (
      <Box
        width={cols}
        height={rows}
        alignItems="center"
        justifyContent="center"
      >
        <Text dimColor>...</Text>
      </Box>
    );
  }

  return <Text>{art}</Text>;
}
