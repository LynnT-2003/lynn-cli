import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { fetchSchedule, type AiringSchedule, type AnilistAnime } from "../lib/anilist/index.js";
import { theme } from "../lib/theme.js";
import { useLayout } from "../lib/useLayout.js";

type Props = {
  isFocused: boolean;
  onFocusSidebar: () => void;
  onSelect: (anime: AnilistAnime) => void;
};

export function ScheduleScreen({ isFocused, onFocusSidebar, onSelect }: Props) {
  const { contentColumns: columns, rows: termRows } = useLayout();
  const [dayOffset, setDayOffset] = useState(0);
  const [schedule, setSchedule] = useState<AiringSchedule[] | null>(null);
  
  const [focusArea, setFocusArea] = useState<"days" | "list">("days");
  const [listIdx, setListIdx] = useState(0);
  const [listScroll, setListScroll] = useState(0);

  useEffect(() => {
    setSchedule(null);
    const now = new Date();
    const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    const start = Math.floor(targetDate.getTime() / 1000);
    const end = start + 86400;
    
    fetchSchedule(start, end).then(data => {
      setSchedule(data);
      setListIdx(0);
      setListScroll(0);
    }).catch(() => setSchedule([]));
  }, [dayOffset]);

  // The header, margins, and container paddings take up exactly 13-14 rows. 
  // Each schedule list item is exactly 4 rows tall (paddingTop 1 + text 1 + paddingBottom 1 + borderBottom 1).
  const listVisibleCount = Math.max(1, Math.floor((termRows - 14) / 4));

  useInput((input, key) => {
    if (!isFocused) return;
    if (!schedule) return;

    if (focusArea === "days") {
      if (key.leftArrow) {
        setDayOffset(d => d - 1);
      } else if (key.rightArrow) {
        setDayOffset(d => d + 1);
      } else if (key.downArrow) {
        if (schedule.length > 0) setFocusArea("list");
      } else if (input === 'h') { // hjkl fallback
        setDayOffset(d => d - 1);
      } else if (input === 'l') {
        setDayOffset(d => d + 1);
      } else if (input === 'j') {
        if (schedule.length > 0) setFocusArea("list");
      }
    } else {
      if (key.upArrow || input === 'k') {
        if (listIdx === 0) setFocusArea("days");
        else {
          setListIdx(i => i - 1);
          if (listIdx - 1 < listScroll) setListScroll(s => s - 1);
        }
      } else if (key.downArrow || input === 'j') {
        if (listIdx < schedule.length - 1) {
          setListIdx(i => i + 1);
          if (listIdx + 1 >= listScroll + listVisibleCount) setListScroll(s => s + 1);
        }
      } else if (key.leftArrow || input === 'h') {
        setFocusArea("days");
        onFocusSidebar();
      } else if (key.return) {
        const item = schedule[listIdx];
        if (item) {
          onSelect({
            id: item.media.id,
            title: item.media.title,
            episodes: null,
            status: null,
            description: null,
            format: null,
            duration: null,
            seasonYear: null,
            coverImage: { medium: null, large: null },
            bannerImage: null
          });
        }
      }
    }
  }, { isActive: isFocused });

  const getDayLabel = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const day = d.toLocaleDateString('en-US', { weekday: 'short' });
    const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return { day, date };
  };

  const daysToRender = [-3, -2, -1, 0, 1, 2, 3].map(off => off + dayOffset);

  return (
    <Box flexDirection="column" padding={2}>
      <Box flexDirection="row" justifyContent="space-between" marginBottom={2}>
        <Text bold color={theme.text.highlightBright}>Estimated Schedule</Text>
        <Text color={theme.text.dim}>(Local Time) {new Date().toLocaleString()}</Text>
      </Box>

      {/* Days row */}
      <Box flexDirection="row" marginBottom={2} justifyContent="space-between" flexShrink={0}>
        <Text color={focusArea === "days" ? theme.text.successBright : theme.text.dim}>{"<"}</Text>
        <Box flexDirection="row" gap={1}>
          {daysToRender.map((actualOffset) => {
            const { day, date } = getDayLabel(actualOffset);
            const isSelected = actualOffset === dayOffset;
            const isRowFocused = focusArea === "days";
            return (
              <Box 
                key={actualOffset} 
                flexDirection="column" 
                alignItems="center"
                borderStyle="round" 
                borderColor={isSelected ? (isRowFocused ? theme.border.focus : theme.border.active) : theme.border.default}
                paddingX={2}
                width={12}
              >
                <Text bold color={isSelected ? (isRowFocused ? theme.text.successBright : theme.text.normal) : theme.text.dim}>{day}</Text>
                <Text color={theme.text.dim}>{date}</Text>
              </Box>
            );
          })}
        </Box>
        <Text color={focusArea === "days" ? theme.text.successBright : theme.text.dim}>{">"}</Text>
      </Box>

      {/* Schedule list */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {!schedule ? (
          <Box><Text color={theme.text.accent}><Spinner type="dots" /> loading...</Text></Box>
        ) : schedule.length === 0 ? (
          <Box><Text color={theme.text.dim}>No episodes scheduled for this day.</Text></Box>
        ) : (
          schedule.slice(listScroll, listScroll + listVisibleCount).map((item, i) => {
            const actualIdx = listScroll + i;
            const isSelected = focusArea === "list" && actualIdx === listIdx;
            const d = new Date(item.airingAt * 1000);
            const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            return (
              <Box 
                key={`${item.media.id}-${item.episode}`} 
                flexDirection="row" 
                paddingX={3}
                paddingY={1}
                borderBottom 
                borderStyle="single" 
                borderTop={false}
                borderLeft={false}
                borderRight={false}
                borderColor={isSelected ? theme.border.focus : theme.border.default}
                alignItems="center"
                flexShrink={0}
              >
                <Box width={12}>
                  <Text color={isSelected ? theme.text.successBright : theme.text.dim}>{time}</Text>
                </Box>
                <Box flexGrow={1} overflow="hidden">
                  <Text bold color={isSelected ? theme.text.successBright : theme.text.normal} wrap="truncate-end">
                    {isSelected ? "▶ " : "  "}{item.media.title.english || item.media.title.romaji}
                  </Text>
                </Box>
                <Box width={20} justifyContent="flex-end">
                  <Text color={isSelected ? theme.text.successBright : theme.text.dim}>▶ Episode {item.episode}</Text>
                </Box>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
