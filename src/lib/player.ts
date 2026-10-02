import { execa } from "execa";

export type PlayerOptions = {
  videoUrl: string;
  referer: string;
  subtitleUrl: string | null;
  title: string;
  episodeNo: string;
};

export async function launchPlayer(opts: PlayerOptions) {
  const players = ["iina", "mpv", "vlc"];
  let selectedPlayer: string | null = null;
  
  for (const p of players) {
    try {
      await execa("sh", ["-c", `command -v ${p}`]);
      selectedPlayer = p;
      break;
    } catch {
      continue;
    }
  }
  
  if (!selectedPlayer && process.platform === "darwin") {
    try {
      await execa("sh", ["-c", 'command -v "/Applications/IINA.app/Contents/MacOS/iina-cli"']);
      selectedPlayer = "/Applications/IINA.app/Contents/MacOS/iina-cli";
    } catch {
      // ignore
    }
  }
  
  if (!selectedPlayer) throw new Error("No player found (mpv, vlc, iina)");

  const mediaTitle = `${opts.title} Episode ${opts.episodeNo}`;
  let args: string[] = [];

  if (selectedPlayer.includes("iina")) {
    const subArg = opts.subtitleUrl ? opts.subtitleUrl.replace(/:/g, "\\:") : null;
    args = [
      `--mpv-referrer=${opts.referer}`,
      ...(subArg ? [`--mpv-sub-files=${subArg}`] : []),
      `--mpv-force-media-title=${mediaTitle}`,
      "--no-stdin",
      "--keep-running",
      opts.videoUrl
    ];
  } else if (selectedPlayer === "mpv") {
    args = [
      `--referrer=${opts.referer}`,
      ...(opts.subtitleUrl ? [`--sub-file=${opts.subtitleUrl}`] : []),
      `--force-media-title=${mediaTitle}`,
      opts.videoUrl
    ];
  } else if (selectedPlayer === "vlc") {
    args = [
      `--http-referrer=${opts.referer}`,
      `--meta-title=${mediaTitle}`,
      opts.videoUrl,
      ...(opts.subtitleUrl ? [`:input-slave=${opts.subtitleUrl}`] : [])
    ];
  }

  const cp = execa(selectedPlayer, args, { detached: true, stdio: "ignore" });
  cp.unref();
  return cp;
}
