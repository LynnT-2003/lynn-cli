import React from 'react';
import { Box } from 'ink';
import { theme } from '../lib/theme.js';

type CardProps = {
  isFocused: boolean;
  width?: number;
  height?: number;
  children: React.ReactNode;
};

export function Card({ isFocused, width = 24, height, children }: CardProps) {
  return (
    <Box
      flexDirection="column"
      marginRight={2}
      borderStyle="single"
      borderColor={isFocused ? theme.border.focus : theme.border.default}
      paddingX={1}
      paddingY={0}
      width={width}
      height={height}
    >
      {children}
    </Box>
  );
}
