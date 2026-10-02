import React from "react";
import { Box, Text, useInput } from "ink";
import figlet from "figlet";
import { useTerminalSize } from "../lib/useTerminalSize.js";

type Props = {
  onContinue: () => void;
};

export function SplashScreen({ onContinue }: Props) {
  const { columns, rows } = useTerminalSize();

  useInput((input, key) => {
    if (key.return || input === "s" || input === " " || key.escape) {
      onContinue();
    }
  });

  return (
    <Box
      flexDirection="column"
      height={rows}
      width={columns}
      alignItems="center"
      justifyContent="center"
    >
      <Box flexDirection="column" padding={0.5} width={Math.min(columns - 4, 80)} alignItems="center">

        <Box flexDirection="column" alignItems="center" marginTop={2} marginBottom={2}>
          <Box flexDirection="row" alignItems="center" marginTop={2} marginBottom={2}>
            {/* <Text bold color="cyan" backgroundColor="black">
              {" "}Welcome to{" "}
            </Text> */}
            <Text bold color="magentaBright" backgroundColor="black">
              {figlet.textSync("L . Y . N . N ", { font: "Standard" })}
            </Text>
          </Box>
          <Text color="magentaBright">Local Yet No Nonsense.</Text>
          <Box marginTop={1}>
            <Text dimColor>v0.1.0 · EST. 2026</Text>
          </Box>
        </Box>

        <Box flexDirection="column" alignItems="center" marginBottom={4}>
          <Text color="greenBright">Privacy-first streaming from your terminal.</Text>
          <Text color="greenBright">No ads, no accounts, no login. no tracking.</Text>
          <Text color="cyanBright" bold>{"\n"}Just anime. All Yours.</Text>
        </Box>

        <Box justifyContent="center" marginBottom={12}>
          <Text dimColor>press enter to continue</Text>
        </Box>
      </Box>
    </Box >
  );
}
