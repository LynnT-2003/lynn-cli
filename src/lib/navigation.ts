import { useState } from 'react';
import type { AnilistAnime } from './anilist.js';

export type Screen =
  | { kind: "browse" }
  | { kind: "detail"; anime: AnilistAnime }
  | { kind: "profile" }
  | { kind: "search" }
  | { kind: "search-grid"; query: string }
  | { kind: "playlist"; playlist: import('../db/schema.js').Playlist }
  | { kind: "schedule" };

export type TabId = "home" | "profile" | "search" | "schedule";

export function useNavigation() {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [stacks, setStacks] = useState<Record<TabId, Screen[]>>({
    home: [{ kind: "browse" }],
    profile: [{ kind: "profile" }],
    search: [{ kind: "search" }],
    schedule: [{ kind: "schedule" }],
  });

  const currentStack = stacks[activeTab];
  const currentScreen = currentStack[currentStack.length - 1];

  const push = (screen: Screen) => {
    setStacks(prev => ({
      ...prev,
      [activeTab]: [...prev[activeTab], screen]
    }));
  };

  const pop = () => {
    setStacks(prev => {
      const s = prev[activeTab];
      if (s.length > 1) {
        return {
          ...prev,
          [activeTab]: s.slice(0, -1)
        };
      }
      return prev;
    });
  };

  const switchTab = (tab: TabId) => {
    setActiveTab(tab);
  };

  return { activeTab, currentScreen, push, pop, switchTab };
}
