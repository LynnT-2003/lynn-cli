export const theme = {
  // Brand identity
  brand: "magentaBright",
  
  // Standard text colors
  text: {
    normal: "white",
    dim: "gray",
    highlight: "yellow",
    highlightBright: "yellowBright",
    accent: "cyan",
    accentBright: "cyanBright",
    success: "green",
    successBright: "greenBright",
    error: "red",
  },
  
  // Border colors
  border: {
    default: "gray",       // Base border color for inactive/unfocused containers
    active: "cyan",        // Active/main panel borders
    focus: "green",        // When an item or section has keyboard focus
    hero: "yellow",        // Special spotlight focus
    error: "red",
  },

  // Background colors
  bg: {
    focus: "green",
    active: "gray",
    highlight: "yellow",
    inverse: "white",
    black: "black",
  }
} as const;
