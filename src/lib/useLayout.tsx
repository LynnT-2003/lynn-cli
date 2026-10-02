import React, { createContext, useContext } from 'react';
import { useTerminalSize } from './useTerminalSize.js';

export const SIDEBAR_WIDTH = 20;

type LayoutContextType = {
  contentColumns: number;
  rows: number;
};

const LayoutContext = createContext<LayoutContextType>({ contentColumns: 80, rows: 24 });

export function LayoutProvider({ children }: { children: React.ReactNode }) {
  const { columns, rows } = useTerminalSize();
  const contentColumns = Math.max(20, columns - SIDEBAR_WIDTH);

  return (
    <LayoutContext.Provider value={{ contentColumns, rows }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  return useContext(LayoutContext);
}
