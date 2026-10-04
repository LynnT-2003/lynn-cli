import fs from "fs";

let code = fs.readFileSync("src/screens/DetailScreen.tsx", "utf-8");

// Imports
code = code.replace(
  `import { theme } from "../lib/theme.js";`,
  `import { theme } from "../lib/theme.js";\nimport { startCastServer } from "../lib/castServer.js";\nimport qrcode from "qrcode-terminal";`
);

// State
code = code.replace(
  `const [playerInfo, setPlayerInfo] = useState<{ bin: string, tracks: boolean } | null>(null);`,
  `const [playerInfo, setPlayerInfo] = useState<{ bin: string, tracks: boolean } | null>(null);\n  const [castState, setCastState] = useState<{ url: string; qr: string; stop: () => void } | null>(null);\n  const castStopRef = React.useRef<(() => void) | null>(null);\n\n  useEffect(() => {\n    return () => {\n      if (castStopRef.current) castStopRef.current();\n    };\n  }, []);`
);

// Input handling
let inputHandlingCode = `
    if (castState) {
      if (key.escape || key.backspace || input === "b") {
        if (castStopRef.current) castStopRef.current();
        castStopRef.current = null;
        setCastState(null);
      }
      return;
    }

    if (playlistPickerOpen) {`;

code = code.replace(`    if (playlistPickerOpen) {`, inputHandlingCode);

// Input handling for "c"
let castShortcutCode = `
    if (input?.toLowerCase() === "c") {
      if (!detail) return;
      const q = anime.title.english || anime.title.romaji || "";
      const mEps = detail?.episodes || null;

      setPlaying(true);
      setWatchResult(null);
      setPlayStatus(\`starting cast server for ep \${selectedEp}...\`);

      startCastServer(q, anime.id, selectedEp, mEps).then(({ url, stop }) => {
        castStopRef.current = stop;
        qrcode.generate(url, { small: true }, (qr) => {
          setCastState({ url, qr, stop });
          setPlaying(false);
        });
      }).catch(err => {
        setPlaying(false);
        setWatchResult(\`Cast Error: \${err.message}\`);
      });
      return;
    }

    if (input?.toLowerCase() === "p") {`;

code = code.replace(`    if (input?.toLowerCase() === "p") {`, castShortcutCode);

// Cast State Overlay
let castOverlayCode = `      {/* ── CAST STATE OVERLAY ── */}
      {castState && (
        <Box position="absolute" width="100%" height="100%" padding={2} flexDirection="column" justifyContent="center" alignItems="center" backgroundColor={theme.bg.black}>
          <Box borderStyle="double" borderColor={theme.border.focus} padding={2} flexDirection="column" alignItems="center">
            <Text color={theme.text.highlight} bold>CASTING</Text>
            <Box marginTop={1} marginBottom={1} flexDirection="column" alignItems="center">
              <Text>{castState.qr}</Text>
            </Box>
            <Text color="cyan">{castState.url}</Text>
            <Box marginTop={1}>
              <Text dimColor>scan with your phone's camera, same wifi required. closes automatically after 15 min idle.</Text>
            </Box>
            <Box marginTop={2}>
              <Text dimColor><Text inverse> ESC / B </Text> STOP CASTING</Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* ── PLAYER SPINNER ── */}`;

code = code.replace(`      {/* ── PLAYER SPINNER ── */}`, castOverlayCode);

// Keybindings update
code = code.replace(
  `<Text inverse> ESC </Text> BACK   <Text inverse> ↑↓←→ </Text> NAVIGATE   <Text inverse> ENTER </Text> SELECT   <Text inverse> P </Text> PLAYLIST`,
  `<Text inverse> ESC </Text> BACK   <Text inverse> ↑↓←→ </Text> NAVIGATE   <Text inverse> ENTER </Text> SELECT   <Text inverse> P </Text> PLAYLIST   <Text inverse> C </Text> CAST`
);

fs.writeFileSync("src/screens/DetailScreen.tsx", code);
