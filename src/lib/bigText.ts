import figlet from "figlet";

const FONTS = ["ANSI Shadow", "Standard", "Small"] as const;

function figletLines(text: string, font: string, width?: number): string[] | null {
  try {
    const art = figlet.textSync(text, width ? { font: font as any, width, whitespaceBreak: true } : { font: font as any });
    const lines = art.split("\n");
    while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop();
    return lines;
  } catch {
    return null;
  }
}

// biggest figlet font that fits on one line; only very long text wraps (smallest font)
export function bigText(text: string, width: number): string[] {
  for (const font of FONTS) {
    const lines = figletLines(text, font);
    if (lines && lines.every(l => l.length <= width)) return lines;
  }
  const wrapped = figletLines(text, "Small", width);
  if (wrapped && wrapped.length <= 10 && wrapped.every(l => l.length <= width)) return wrapped;
  return [text.toUpperCase()];
}
