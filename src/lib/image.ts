import sharp from "sharp";
import chalk from "chalk";

// cache by url+size so scrolling past a card twice doesn't refetch/resize
const cache = new Map<string, string>();

// two vertical pixels collapse into one "▀" character: foreground = top pixel,
// background = bottom pixel. doubles vertical resolution for the same char count.
export async function imageToAnsi(
  url: string,
  cols: number,
  rows: number,
  fit: "cover" | "contain" = "cover",
): Promise<string> {
  const cacheKey = `${url}::${cols}x${rows}::${fit}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`image fetch failed: ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());

  const { data, info } = await sharp(buffer)
    .resize(cols, rows * 2, {
      fit: fit,
      kernel: sharp.kernel.lanczos3, // blocky/crisp instead of blurred-mush
    })
    .modulate({ saturation: 1.25 }) // small boost, flat colors read better at this size
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const lines: string[] = [];

  for (let y = 0; y < rows; y++) {
    let line = "";
    for (let x = 0; x < cols; x++) {
      const topIdx = (y * 2 * cols + x) * channels;
      const botIdx = ((y * 2 + 1) * cols + x) * channels;

      const tr = data[topIdx];
      const tg = data[topIdx + 1];
      const tb = data[topIdx + 2];
      const br = data[botIdx];
      const bg = data[botIdx + 1];
      const bb = data[botIdx + 2];

      line += chalk.bgRgb(br, bg, bb).rgb(tr, tg, tb)("▀");
    }
    lines.push(line);
  }

  const output = lines.join("\n");
  cache.set(cacheKey, output);
  return output;
}
