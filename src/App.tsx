import React, { useEffect, useState } from "react";
import { Box, useInput, Text } from "ink";
import { BrowseScreen } from "./screens/BrowseScreen.js";
import { DetailScreen } from "./screens/DetailScreen.js";
import { SearchOverlay } from "./screens/SearchOverlay.js";
import { SearchGridScreen } from "./screens/SearchGridScreen.js";
import { SplashScreen } from "./screens/SplashScreen.js";
import { OnboardingScreen } from "./screens/OnboardingScreen.js";
import { ProfileScreen } from "./screens/ProfileScreen.js";
import { db } from "./db/index.js";
import { LayoutProvider, useLayout } from "./lib/useLayout.js";
import { useNavigation } from "./lib/navigation.js";
import { Sidebar } from "./components/Sidebar.js";

function MainApp() {
  const { activeTab, currentScreen, push, pop, switchTab } = useNavigation();
  const { rows: termRows } = useLayout();
  const [sidebarFocused, setSidebarFocused] = useState(false);

  // Global key handling for tab switching
  // NOTE: Ink uses a global input listener. Since we don't have text inputs yet,
  // this is safe. If we add text inputs later (e.g. for search), we must ensure 
  // this doesn't conflict by conditionally disabling it or scoping priorities.
  useInput((input, key) => {
    // Only process tab switches on numeric keys
    if (input === "1") {
      switchTab("home");
    } else if (input === "2") {
      switchTab("profile");
    } else if (input === "3") {
      switchTab("search");
    }
    
    if (sidebarFocused) {
      if (key.rightArrow || key.return) {
        setSidebarFocused(false);
      } else if (key.upArrow) {
        if (activeTab === "profile") switchTab("home");
        else if (activeTab === "search") switchTab("profile");
      } else if (key.downArrow) {
        if (activeTab === "home") switchTab("profile");
        else if (activeTab === "profile") switchTab("search");
      }
    }
  }, { isActive: true });

  return (
    <Box flexDirection="row" width="100%" height={termRows} overflow="hidden">
      <Sidebar activeTab={activeTab} isFocused={sidebarFocused} />
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {currentScreen.kind === "browse" && (
          <BrowseScreen
            onSelect={(anime) => push({ kind: "detail", anime })}
            isFocused={!sidebarFocused}
            onFocusSidebar={() => setSidebarFocused(true)}
          />
        )}
        {currentScreen.kind === "detail" && (
          <DetailScreen
            anime={currentScreen.anime}
            isActive={!sidebarFocused}
            onBack={pop}
            onNavigate={(newAnime) => push({ kind: "detail", anime: newAnime })}
            onFocusSidebar={() => setSidebarFocused(true)}
          />
        )}
        {currentScreen.kind === "profile" && (
          <ProfileScreen 
            isFocused={!sidebarFocused}
            onFocusSidebar={() => setSidebarFocused(true)}
          />
        )}
        {currentScreen.kind === "search" && (
          <Box padding={2}><Text>search - coming soon</Text></Box>
        )}
      </Box>
    </Box>
  );
}

export function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [ready, setReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    process.stdout.write("\x1B[?1049h");
    process.stdout.write("\x1B[?25l");
    
    db.profile.get().then(p => {
      setNeedsOnboarding(!p.onboarded);
      setReady(true);
    });

    return () => {
      process.stdout.write("\x1B[?25h");
      process.stdout.write("\x1B[?1049l");
    };
  }, []);

  if (!ready) {
    return null;
  }

  if (showSplash) {
    return <SplashScreen onContinue={() => setShowSplash(false)} />;
  }

  if (needsOnboarding) {
    return (
      <OnboardingScreen onComplete={(name, genres) => {
        db.profile.completeOnboarding(name, genres, []).then(() => {
          setNeedsOnboarding(false);
        });
      }} />
    );
  }

  return (
    <LayoutProvider>
      <MainApp />
    </LayoutProvider>
  );
}
