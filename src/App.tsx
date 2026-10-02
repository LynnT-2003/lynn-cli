import React, { useEffect, useState } from "react";
import { Box } from "ink";
import { BrowseScreen } from "./screens/BrowseScreen.js";
import { DetailScreen } from "./screens/DetailScreen.js";
import { SearchOverlay } from "./screens/SearchOverlay.js";
import { SearchGridScreen } from "./screens/SearchGridScreen.js";
import { SplashScreen } from "./screens/SplashScreen.js";
import type { AnilistAnime } from "./lib/anilist.js";
import { useTerminalSize } from "./lib/useTerminalSize.js";

export type Screen =
  | { type: "splash" }
  | { type: "browse" }
  | { type: "search-overlay" }
  | { type: "search-grid"; query: string }
  | { type: "detail"; anime: AnilistAnime };

export function App() {
  const [stack, setStack] = useState<Screen[]>([{ type: "splash" }]);
  const [ready, setReady] = useState(false);
  const current = stack[stack.length - 1]!;
  const { rows: termRows } = useTerminalSize();

  const push = (screen: Screen) => setStack((s) => [...s, screen]);
  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  // esc from search-grid goes straight to browse, not back to overlay
  const popToBrowse = () => setStack([{ type: "browse" }]);

  useEffect(() => {
    // enter alt-screen + hide cursor (same trick vim/htop/claude code use)
    process.stdout.write("\x1B[?1049h");
    process.stdout.write("\x1B[?25l");
    
    // Force a re-render now that we are on the alt screen
    setReady(true);

    return () => {
      // always restore the user's real terminal on exit, even on crash
      process.stdout.write("\x1B[?25h");
      process.stdout.write("\x1B[?1049l");
    };
  }, []);

  if (!ready) {
    return null;
  }

  // browse is always mounted underneath; overlay renders on top when active
  const showBrowse =
    current.type === "browse" || current.type === "search-overlay";

  if (current.type === "splash") {
    return <SplashScreen onContinue={() => setStack([{ type: "browse" }])} />;
  }

  if (current.type === "detail") {
    const detailScreens = stack.filter((s) => s.type === "detail") as Extract<Screen, { type: "detail" }>[];
    
    return (
      <Box flexDirection="column" height={termRows} overflow="hidden">
        {detailScreens.map((s, i) => {
          const isTop = i === detailScreens.length - 1;
          return (
            <Box key={i} position={i > 0 ? "absolute" : "relative"} width="100%" height="100%">
              <DetailScreen 
                anime={s.anime} 
                isActive={isTop}
                onBack={pop} 
                onWatch={() => {}} // Now handled internally
                onNavigate={(newAnime) => push({ type: "detail", anime: newAnime })}
              />
            </Box>
          );
        })}
      </Box>
    );
  }

  if (current.type === "search-grid") {
    return (
      <SearchGridScreen
        query={current.query}
        onSelect={(anime) => push({ type: "detail", anime })}
        onBack={popToBrowse}
      />
    );
  }

  // browse (possibly with overlay on top)
  return (
    <Box flexDirection="column" height={termRows} overflow="hidden">
      <BrowseScreen
        onSelect={(anime) => push({ type: "detail", anime })}
        onSearch={() => push({ type: "search-overlay" })}
        isFocused={current.type === "browse"}
      />
      {current.type === "search-overlay" && (
        <SearchOverlay
          onSelectAnime={(anime) => push({ type: "detail", anime })}
          onCommitQuery={(query) => push({ type: "search-grid", query })}
          onClose={pop}
        />
      )}
    </Box>
  );
}
