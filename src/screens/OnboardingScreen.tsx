import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../lib/theme.js";
import { useTerminalSize } from "../lib/useTerminalSize.js";

type Props = {
  onComplete: (name: string, genres: string[]) => void;
};

const NUM_COLS = 3;

const AVAILABLE_GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", 
  "Horror", "Mahou Shoujo", "Mecha", "Music", "Mystery", 
  "Psychological", "Romance", "Sci-Fi", "Slice of Life", 
  "Sports", "Supernatural", "Thriller"
];

export function OnboardingScreen({ onComplete }: Props) {
  const { columns, rows } = useTerminalSize();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());
  const [focusIdx, setFocusIdx] = useState(0);

  useInput((input, key) => {
    if (step === 1) {
      if (key.return) {
        if (name.trim().length > 0) {
          setStep(2);
        }
        return;
      }
      if (key.backspace || key.delete) {
        setName((prev) => prev.slice(0, -1));
        return;
      }
      if (input.length === 1) {
        setName((prev) => prev + input);
      }
    } else if (step === 2) {
      const numRows = Math.ceil(AVAILABLE_GENRES.length / NUM_COLS);
      let r = Math.floor(focusIdx / NUM_COLS);
      let c = focusIdx % NUM_COLS;

      if (focusIdx === AVAILABLE_GENRES.length) {
        // We are on the finish button
        if (key.upArrow) {
          r = numRows - 1; // go to last row
          c = 0; // arbitrary column
          setFocusIdx(r * NUM_COLS + c);
        } else if (key.return) {
          onComplete(name.trim(), Array.from(selectedGenres));
        }
        return;
      }

      if (key.upArrow) r = Math.max(0, r - 1);
      else if (key.downArrow) {
        if (r === numRows - 1) {
          // move to finish button
          setFocusIdx(AVAILABLE_GENRES.length);
          return;
        } else {
          r = Math.min(numRows - 1, r + 1);
        }
      }
      else if (key.leftArrow) c = Math.max(0, c - 1);
      else if (key.rightArrow) c = Math.min(NUM_COLS - 1, c + 1);
      
      let nextIdx = r * NUM_COLS + c;
      if (nextIdx >= AVAILABLE_GENRES.length && nextIdx !== AVAILABLE_GENRES.length) {
        if (key.rightArrow) nextIdx = AVAILABLE_GENRES.length - 1;
        else if (key.downArrow) nextIdx = AVAILABLE_GENRES.length; // to finish button
      }
      setFocusIdx(nextIdx);

      if (input === " " || key.return) {
        const genre = AVAILABLE_GENRES[nextIdx]!;
        if (genre) {
          const next = new Set(selectedGenres);
          if (next.has(genre)) next.delete(genre);
          else next.add(genre);
          setSelectedGenres(next);
        }
      }
    }
  });

  return (
    <Box width={columns} height={rows} justifyContent="center" alignItems="center">
      <Box flexDirection="column" alignItems="center" borderStyle="double" borderColor={theme.border.focus} padding={2} width={75}>
        <Box marginBottom={1}>
          <Text color={theme.text.accent} bold> WELCOME TO LYNN </Text>
        </Box>

        {step === 1 && (
          <Box flexDirection="column" alignItems="center">
            <Text color={theme.text.highlight}>What should we call you?</Text>
            <Box marginTop={1}>
              <Text>{name}</Text>
              <Text inverse> </Text>
            </Box>
            <Box marginTop={2}>
              <Text dimColor>Type your name and press ENTER</Text>
            </Box>
          </Box>
        )}

        {step === 2 && (
          <Box flexDirection="column" alignItems="center">
            <Text color={theme.text.highlight}>Select your favorite genres (Optional)</Text>
            <Box marginTop={1} flexDirection="column" alignItems="center">
              {Array.from({ length: Math.ceil(AVAILABLE_GENRES.length / NUM_COLS) }).map((_, r) => (
                <Box key={`row-${r}`} flexDirection="row" marginBottom={1}>
                  {Array.from({ length: NUM_COLS }).map((_, c) => {
                    const idx = r * NUM_COLS + c;
                    if (idx >= AVAILABLE_GENRES.length) return <Box key={`empty-${c}`} width={22} />;
                    const g = AVAILABLE_GENRES[idx]!;
                    const isSelected = selectedGenres.has(g);
                    const isFocused = idx === focusIdx;
                    return (
                      <Box key={g} width={22}>
                        <Text color={isFocused ? "white" : "gray"} backgroundColor={isFocused ? "#444" : undefined}>
                          {isSelected ? "[x]" : "[ ]"} {g}
                        </Text>
                      </Box>
                    );
                  })}
                </Box>
              ))}
              <Box marginTop={1} justifyContent="center">
                <Text color={focusIdx === AVAILABLE_GENRES.length ? "white" : "gray"} backgroundColor={focusIdx === AVAILABLE_GENRES.length ? "#444" : undefined}>
                  [ FINISH ]
                </Text>
              </Box>
            </Box>
            <Box marginTop={2}>
              <Text dimColor>↑↓ select · SPACE/ENTER toggle</Text>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
