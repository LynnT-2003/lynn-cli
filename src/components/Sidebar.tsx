import React from 'react';
import { Box, Text } from 'ink';
import { SIDEBAR_WIDTH } from '../lib/useLayout.js';
import type { TabId } from '../lib/navigation.js';
import { theme } from '../lib/theme.js';

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
    <Box flexDirection="column" width={SIDEBAR_WIDTH} flexShrink={0} borderRight borderStyle="single" borderColor={isFocused ? theme.border.focus : theme.border.active} paddingX={1} paddingTop={1}>
      <Box marginBottom={2}><Text bold color={theme.brand}>LYNN CLI</Text></Box>
      {tabs.map(tab => {
        const isActive = activeTab === tab.id;
        const color = isActive ? (isFocused ? theme.text.successBright : theme.text.success) : theme.text.normal;
        return (
          <Box key={tab.id} marginBottom={1}>
            <Text color={color} bold={isActive} inverse={isActive && isFocused}>
              {isActive ? "▶ " : "  "}{tab.label} <Text color={theme.text.dim}>({tab.keyHint})</Text>
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
