import React from 'react';
import { Box, Text } from 'ink';
import { SIDEBAR_WIDTH } from '../lib/useLayout.js';
import type { TabId } from '../lib/navigation.js';

type SidebarProps = {
  activeTab: TabId;
  isFocused: boolean;
};

export function Sidebar({ activeTab, isFocused }: SidebarProps) {
  const tabs: { id: TabId; label: string; keyHint: string }[] = [
    { id: 'home', label: 'Home', keyHint: '1' },
    { id: 'profile', label: 'Profile', keyHint: '2' },
    { id: 'search', label: 'Search', keyHint: '3' },
  ];

  return (
    <Box flexDirection="column" width={SIDEBAR_WIDTH} borderRight borderStyle="single" borderColor={isFocused ? "green" : "cyan"} paddingX={1} paddingTop={1}>
      <Box marginBottom={2}><Text bold color="magenta">LYNN CLI</Text></Box>
      {tabs.map(tab => {
        const isActive = activeTab === tab.id;
        const color = isActive ? (isFocused ? "greenBright" : "green") : "white";
        return (
          <Box key={tab.id} marginBottom={1}>
            <Text color={color} bold={isActive} inverse={isActive && isFocused}>
              {isActive ? "▶ " : "  "}{tab.label} <Text dimColor>({tab.keyHint})</Text>
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
