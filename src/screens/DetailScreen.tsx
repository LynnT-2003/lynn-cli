import React, { useEffect, useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { execa } from "execa";
import {
  fetchAnimeDetail,
  type AnilistAnime,
  type AnilistAnimeDetail,
} from "../lib/anilist.js";
import { Thumbnail } from "../components/Thumbnail.js";
import { useLayout } from "../lib/useLayout.js";
import { playWithTracking, getPlayerInfo } from "../lib/player.js";
import { type WatchEntry, type Playlist } from "../db/schema.js";
import { db } from "../db/index.js";
import { theme } from "../lib/theme.js";
import { startCastServer, type CastEvent } from "../lib/castServer.js";
import qrcode from "qrcode-terminal";

// ── layout constants ──────────────────────────────────────────

const THUMB_COLS = 28;
const THUMB_ROWS = 20;

// ── helper functions ──────────────────────────────────────────

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function scoreColor(score: number): "green" | "greenBright" | "yellow" | "red" {
  if (score >= 80) return "greenBright";
  if (score >= 65) return "green";
  if (score >= 45) return "yellow";
  return "red";
}

function fuzzyDate(
  d: { year: number | null; month: number | null; day: number | null } | null,
): string {
  if (!d?.year) return "?";
  const months = [
    "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const parts: string[] = [];
  if (d.month) parts.push(months[d.month] ?? "");
  if (d.day) parts.push(`${d.day},`);
  parts.push(`${d.year}`);
  return parts.join(" ");
}

function timeUntil(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── component ─────────────────────────────────────────────────

type Props = {
  anime: AnilistAnime;
  isActive?: boolean;
  onBack: () => void;
  onNavigate?: (anime: AnilistAnime) => void;
  onFocusSidebar?: () => void;
};

type FocusState = {
  type: 'episodes' | 'desc' | 'relation' | 'link' | 'similar';
  index: number;
};

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const ss = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

function mEpsLabel(total: number | null | undefined) {
  return total ? ` of ${total}` : "";
}

export function DetailScreen({ anime, isActive = true, onBack, onNavigate, onFocusSidebar }: Props) {
  const { contentColumns: columns, rows: termRows } = useLayout();
  const [detail, setDetail] = useState<AnilistAnimeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [focus, setFocus] = useState<FocusState>({ type: 'episodes', index: 0 });
  const entryRef = React.useRef<WatchEntry | null>(null);
  const [expandedDesc, setExpandedDesc] = useState(false);
  
  const [playing, setPlaying] = useState(false);
  const [playStatus, setPlayStatus] = useState("");
  const [watchResult, setWatchResult] = useState<string | null>(null);
  
  const [epPickerOpen, setEpPickerOpen] = useState(false);
  const [selectedEp, setSelectedEp] = useState(1);
  const [storeResumeEp, setStoreResumeEp] = useState<number | null>(null);
  const [storeResumeSec, setStoreResumeSec] = useState<number | null>(null);
  const [resumePrompt, setResumePrompt] = useState<{ ep: number, pos: number, title: string, mEps: number | null } | null>(null);

  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [playlistFocusIdx, setPlaylistFocusIdx] = useState(0);
  const [playerInfo, setPlayerInfo] = useState<{ bin: string, tracks: boolean } | null>(null);
  const [castState, setCastState] = useState<{ url: string; qr: string; stop: () => void } | null>(null);
  const castStopRef = React.useRef<(() => void) | null>(null);
  // live state reported by the phone; null until it opens the page
  const [castInfo, setCastInfo] = useState<{ device: string; ep: number; pos: number; dur: number; paused: boolean; at: number } | null>(null);
  const [castShowQr, setCastShowQr] = useState(true);
  const [, setCastTick] = useState(0);

  // re-render once a second while the phone is playing so the progress bar moves between pings
  useEffect(() => {
    if (!castInfo || castInfo.paused) return;
    const t = setInterval(() => setCastTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [castInfo?.paused, castInfo !== null]);

  const stopCasting = (message?: string) => {
    if (castStopRef.current) castStopRef.current();
    castStopRef.current = null;
    setCastState(null);
    setCastInfo(null);
    setCastShowQr(true);
    if (message) setWatchResult(message);
  };

  const handleCastEvent = (e: CastEvent) => {
    switch (e.type) {
      case "connected":
        setCastInfo(prev => ({ device: e.device, ep: prev?.ep ?? selectedEp, pos: 0, dur: 0, paused: true, at: Date.now() }));
        setCastShowQr(false);
        break;
      case "episode":
        setCastInfo(prev => prev && { ...prev, ep: e.ep, pos: 0, dur: 0, paused: true, at: Date.now() });
        setSelectedEp(e.ep);
        break;
      case "progress":
        setCastInfo(prev => prev && { ...prev, ep: e.ep, pos: e.pos, dur: e.dur, paused: e.paused, at: Date.now() });
        setStoreResumeEp(e.ep);
        setStoreResumeSec(e.pos);
        break;
      case "complete":
        db.watch.getEntry(anime.id).then(entry => { entryRef.current = entry; });
        setStoreResumeEp(e.ep + 1);
        setStoreResumeSec(null);
        setWatchResult(`ep ${e.ep} completed on phone`);
        break;
      case "stopped":
        if (e.reason === "idle") {
          castStopRef.current = null;
          stopCasting("cast ended after 15 min idle");
        }
        break;
    }
  };

  useEffect(() => {
    return () => {
      if (castStopRef.current) castStopRef.current();
    };
  }, []);

  useEffect(() => {
    db.watch.getEntry(anime.id).then(entry => {
      if (entry) {
        entryRef.current = entry;
        const resEp = entry.resumeEpisode;
        if (resEp) {
          setStoreResumeEp(resEp);
          if (entry.positionSeconds > 5) {
            setStoreResumeSec(entry.positionSeconds);
          }
          setSelectedEp(resEp);
          setFocus(f => f.type === 'episodes' ? { ...f, index: Math.max(0, resEp - 1) } : f);
        } else {
          setSelectedEp(entry.lastEpisode + 1);
          setFocus(f => f.type === 'episodes' ? { ...f, index: Math.max(0, entry.lastEpisode) } : f);
        }
      }
    });
  }, [anime.id]);
  
  const activeResumeSec = (selectedEp === storeResumeEp) ? storeResumeSec : null;

  useEffect(() => {
    fetchAnimeDetail(anime.id)
      .then(setDetail)
      .catch(() => setError("not-found"));
      
    getPlayerInfo().then(setPlayerInfo);
  }, [anime.id]);

  const links = useMemo(() => {
    if (!detail) return [];
    const arr = [];
    if (detail.siteUrl) arr.push({ url: detail.siteUrl, site: "AniList" });
    const streaming = detail.externalLinks.filter((l) => l.type === "STREAMING");
    const otherLinks = detail.externalLinks.filter((l) => l.type !== "STREAMING");
    [...streaming, ...otherLinks].forEach(l => {
      if (l.url) arr.push({ url: l.url, site: l.site });
    });
    return arr.slice(0, 8);
  }, [detail]);

  const similar = useMemo(() => {
    if (!detail) return [];
    return detail.recommendations.nodes
      .filter(n => n.mediaRecommendation)
      .map(n => n.mediaRecommendation!)
      .slice(0, 8);
  }, [detail]);

  const relations = detail?.relations.edges || [];

  useInput((input, key) => {
    if (playing) return;


    if (castState) {
      if (key.escape || key.backspace || input === "b") {
        const info = castInfo;
        stopCasting(info && info.pos > 0 ? `saved: ep ${info.ep} at ${fmtTime(info.pos)}` : "casting stopped");
      } else if (input?.toLowerCase() === "q" && castInfo) {
        setCastShowQr(v => !v);
      }
      return;
    }

    if (playlistPickerOpen) {
      if (creatingPlaylist) {
        if (key.escape) setCreatingPlaylist(false);
        else if (key.return) {
           if (newPlaylistName.trim().length > 0) {
             db.playlist.create(newPlaylistName.trim()).then(p => {
               db.playlist.addAnime(p.id, anime.id).then(() => {
                 setWatchResult(`added to new playlist '${p.name}'`);
                 setCreatingPlaylist(false);
                 setPlaylistPickerOpen(false);
               });
             });
           }
        }
        else if (key.backspace || key.delete) setNewPlaylistName(prev => prev.slice(0, -1));
        else if (input && input.length === 1) setNewPlaylistName(prev => prev + input);
        return;
      }

      if (key.escape || input === "p" || key.backspace) {
        setPlaylistPickerOpen(false);
        return;
      }
      if (key.upArrow) setPlaylistFocusIdx(prev => Math.max(0, prev - 1));
      else if (key.downArrow) setPlaylistFocusIdx(prev => Math.min(playlists.length, prev + 1));
      else if (key.return || input === " ") {
        if (playlistFocusIdx === playlists.length) {
          setNewPlaylistName("");
          setCreatingPlaylist(true);
        } else {
          const p = playlists[playlistFocusIdx]!;
          if (p.animeIds.includes(anime.id)) {
            db.playlist.removeAnime(p.id, anime.id).then(() => {
              setWatchResult(`removed from '${p.name}'`);
              setPlaylistPickerOpen(false);
            });
          } else {
            db.playlist.addAnime(p.id, anime.id).then(() => {
              setWatchResult(`added to '${p.name}'`);
              setPlaylistPickerOpen(false);
            });
          }
        }
      }
      return;
    }

    if (resumePrompt) {
      if (key.escape || key.backspace || input === "b") {
        setResumePrompt(null);
        return;
      }
      if (key.leftArrow || key.rightArrow) {
        setFocus(f => ({ ...f, index: f.index === 0 ? 1 : 0 }));
        return;
      }
      if (key.return) {
        const useRes = focus.index === 0;
        const p = resumePrompt;
        setResumePrompt(null);
        
        setPlaying(true);
        setWatchResult(null);
        setPlayStatus(`preparing ep ${p.ep}...`);
        
        playWithTracking({
          query: p.title,
          episode: p.ep,
          startAt: useRes ? p.pos : 0,
          onLog: setPlayStatus
        }).then(({ pos, dur, finished }) => {
          setPlaying(false);
          db.watch.getEntry(anime.id).then(entry => { entryRef.current = entry; });
          
          if (finished) {
            db.watch.markEpisodeCompleted(anime.id, p.ep);
            setWatchResult(`ep ${p.ep} completed`);
            setSelectedEp(p.ep + 1);
            setStoreResumeEp(null);
            setStoreResumeSec(null);
          } else if (pos > 0) {
            db.watch.saveProgress(
              { anilistId: anime.id, title: p.title, cover: anime.coverImage.medium || "", totalEpisodes: p.mEps, playerQuery: p.title },
              p.ep, pos, dur
            );
            const m = Math.floor(pos / 60);
            const s = Math.floor(pos % 60).toString().padStart(2, '0');
            setWatchResult(`saved: ep ${p.ep} at ${m}:${s}`);
            setStoreResumeEp(p.ep);
            setStoreResumeSec(pos);
          } else {
            setWatchResult(`ep ${p.ep} closed`);
          }
        }).catch(err => {
          setPlaying(false);
          setWatchResult(`Error: ${err.message}`);
        });
      }
      return;
    }

    if (expandedDesc && (key.escape || key.return || key.backspace || input === "b")) {
      setExpandedDesc(false);
      return;
    }

    if (key.escape || key.backspace || input === "b") {
      onBack();
      return;
    }

    if (!detail) return; // Wait for load

    const maxEps = detail.episodes || (detail.nextAiringEpisode ? detail.nextAiringEpisode.episode - 1 : Math.max(selectedEp + 10, 12));

    // 2D Navigation Logic
    if (key.rightArrow) {
      if (focus.type === 'episodes') {
        setSelectedEp(e => Math.min(maxEps, e + 1));
      } else if (focus.type === 'link' && focus.index < links.length - 1) {
        setFocus({ type: 'link', index: focus.index + 1 });
      } else if (focus.type === 'similar' && focus.index < similar.length - 1) {
        setFocus({ type: 'similar', index: focus.index + 1 });
      }
      return;
    }

    if (key.leftArrow) {
      if (focus.type === 'episodes') {
        const CHUNK_SIZE = 50;
        const chunkIndex = Math.floor((selectedEp - 1) / CHUNK_SIZE);
        const chunkStart = chunkIndex * CHUNK_SIZE + 1;
        if (selectedEp === chunkStart) onFocusSidebar?.();
        else setSelectedEp(e => Math.max(1, e - 1));
      } else if (focus.type === 'desc' || focus.type === 'relation') {
        onFocusSidebar?.();
      } else if (focus.type === 'link') {
        if (focus.index > 0) setFocus({ type: 'link', index: focus.index - 1 });
        else onFocusSidebar?.();
      } else if (focus.type === 'similar') {
        if (focus.index > 0) setFocus({ type: 'similar', index: focus.index - 1 });
        else onFocusSidebar?.();
      }
      return;
    }

    if (key.downArrow) {
      if (focus.type === 'desc') {
        setFocus({ type: 'episodes', index: 0 });
      } else if (focus.type === 'episodes') {
        if (relations.length) setFocus({ type: 'relation', index: 0 });
        else if (links.length) setFocus({ type: 'link', index: 0 });
        else if (similar.length) setFocus({ type: 'similar', index: 0 });
      } else if (focus.type === 'relation') {
        if (focus.index < relations.length - 1) setFocus({ type: 'relation', index: focus.index + 1 });
        else if (links.length) setFocus({ type: 'link', index: 0 });
        else if (similar.length) setFocus({ type: 'similar', index: 0 });
      } else if (focus.type === 'link') {
        if (similar.length) setFocus({ type: 'similar', index: Math.min(focus.index, similar.length - 1) });
      }
      return;
    }

    if (key.upArrow) {
      if (focus.type === 'episodes') {
        setFocus({ type: 'desc', index: 0 });
      } else if (focus.type === 'relation') {
        if (focus.index > 0) setFocus({ type: 'relation', index: focus.index - 1 });
        else setFocus({ type: 'episodes', index: 0 });
      } else if (focus.type === 'link') {
        if (relations.length) setFocus({ type: 'relation', index: relations.length - 1 });
        else setFocus({ type: 'episodes', index: 0 });
      } else if (focus.type === 'similar') {
        if (links.length) setFocus({ type: 'link', index: Math.min(focus.index, links.length - 1) });
        else if (relations.length) setFocus({ type: 'relation', index: relations.length - 1 });
        else setFocus({ type: 'episodes', index: 0 });
      }
      return;
    }

    if (key.return) {
      if (focus.type === 'episodes') {
        const q = anime.title.english || anime.title.romaji || "";
        const mEps = detail?.episodes || null;
        
        if (activeResumeSec && activeResumeSec > 5) {
          setResumePrompt({ ep: selectedEp, pos: activeResumeSec, title: q, mEps });
          setFocus({ type: 'episodes', index: 0 }); // 0 = resume, 1 = restart
          return;
        }

        setPlaying(true);
        setWatchResult(null);
        setPlayStatus(`preparing ep ${selectedEp}...`);
        
        playWithTracking({
          query: q,
          episode: selectedEp,
          startAt: 0,
          onLog: setPlayStatus
        }).then(({ pos, dur, finished }) => {
          setPlaying(false);
          db.watch.getEntry(anime.id).then(entry => { entryRef.current = entry; });
          
          if (finished) {
            db.watch.markEpisodeCompleted(anime.id, selectedEp);
            setWatchResult(`ep ${selectedEp} completed`);
            setSelectedEp(selectedEp + 1);
            setStoreResumeEp(null);
            setStoreResumeSec(null);
          } else if (pos > 0) {
            db.watch.saveProgress(
              { anilistId: anime.id, title: q, cover: anime.coverImage.medium || "", totalEpisodes: mEps, playerQuery: q },
              selectedEp, pos, dur
            );
            const m = Math.floor(pos / 60);
            const s = Math.floor(pos % 60).toString().padStart(2, '0');
            setWatchResult(`saved: ep ${selectedEp} at ${m}:${s}`);
            setStoreResumeEp(selectedEp);
            setStoreResumeSec(pos);
          } else {
            setWatchResult(`ep ${selectedEp} closed`);
          }
        }).catch(err => {
          setPlaying(false);
          setWatchResult(`Error: ${err.message}`);
        });
      }
      else if (focus.type === 'desc') setExpandedDesc(true);
      else if (focus.type === 'link' && links[focus.index]) execa("open", [links[focus.index].url]).catch(() => { });
      else if (focus.type === 'relation' && relations[focus.index]) {
        if (onNavigate) onNavigate(relations[focus.index].node as any);
      }
      else if (focus.type === 'similar' && similar[focus.index]) {
        if (onNavigate) onNavigate(similar[focus.index] as any);
      }
      return;
    }


    if (input?.toLowerCase() === "c") {
      if (!detail) return;
      const q = anime.title.english || anime.title.romaji || "";
      const mEps = detail?.episodes || null;

      setPlaying(true);
      setWatchResult(null);
      setPlayStatus(`starting cast server for ep ${selectedEp}...`);

      startCastServer(q, anime.id, selectedEp, mEps, handleCastEvent).then(({ url, stop }) => {
        castStopRef.current = stop;
        qrcode.generate(url, { small: true }, (qr) => {
          setCastState({ url, qr, stop });
          setPlaying(false);
        });
      }).catch(err => {
        setPlaying(false);
        setWatchResult(`Cast Error: ${err.message}`);
      });
      return;
    }

    if (input?.toLowerCase() === "p") {
      db.playlist.list().then(ps => {
        setPlaylists(ps);
        setPlaylistFocusIdx(0);
        setPlaylistPickerOpen(true);
      });
      return;
    }
  }, { isActive });

  // ── loading state ───────────────────────────────────────────

  if (!detail && !error) {
    const title = anime.title.english ?? anime.title.romaji ?? "unknown";
    return (
      <Box position="absolute" width="100%" height="100%" alignItems="center" justifyContent="center">
        <Box borderStyle="single" borderColor={theme.border.active} padding={2} backgroundColor={theme.bg.black} flexDirection="column" alignItems="center">
          <Text color={theme.text.accent} bold>{title}</Text>
          <Box marginTop={1}>
            <Text color={theme.text.highlight}>
              <Spinner type="dots" /> ACCESSING DATABASE...
            </Text>
          </Box>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box position="absolute" width="100%" height="100%" alignItems="center" justifyContent="center">
        <Box borderStyle="single" borderColor={theme.border.error} padding={2} backgroundColor={theme.bg.black} flexDirection="column" alignItems="center">
          <Text color={theme.text.error} bold inverse> ERROR </Text>
          <Box marginTop={1} marginBottom={1}>
            <Text color={theme.text.error}>Sorry, not found.</Text>
          </Box>
          <Text dimColor><Text inverse> ESC </Text> BACK</Text>
        </Box>
      </Box>
    );
  }

  // ── full detail render ──────────────────────────────────────

  const d = detail!;
  const title = d.title.english ?? d.title.romaji ?? "unknown";
  const coverUrl = d.coverImage.large ?? d.coverImage.medium;

  const description = (d.description ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const mainStudios = d.studios.edges
    .filter((e) => e.isMain)
    .map((e) => e.node.name);
  const otherStudios = d.studios.edges
    .filter((e) => !e.isMain)
    .map((e) => e.node.name);

  const nonSpoilerTags = d.tags.filter((t) => !t.isMediaSpoiler);

  const infoLine = [
    d.format?.replace(/_/g, " "),
    d.episodes ? `${d.episodes} EP` : null,
    d.duration ? `${d.duration} MIN` : null,
    d.source ? d.source.replace(/_/g, " ") : null
  ].filter(Boolean).join(" · ");

  const timeLine = [
    d.season && d.seasonYear
      ? `${d.season} ${d.seasonYear}`
      : d.seasonYear ? `${d.seasonYear}` : null,
    d.status?.replace(/_/g, " "),
  ].filter(Boolean).join(" · ");

  const isFocused = (type: string, index?: number) => {
    if (focus.type !== type) return false;
    if (index !== undefined && focus.index !== index) return false;
    return true;
  };

  const activeBg = "#444444"; // Soft gray highlight

  const MAX_ITEMS = 6;
  const relStart = focus.type === 'relation'
    ? Math.max(0, Math.min(focus.index - 2, relations.length - MAX_ITEMS))
    : 0;
  const visibleRelations = relations.slice(relStart, relStart + MAX_ITEMS);

  return (
    <Box flexDirection="column" height="100%" overflow="hidden" backgroundColor={theme.bg.black}>
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={theme.border.active}
        flexGrow={1}
        overflow="hidden"
      >
        {/* ── HEADER ── */}
        <Box flexDirection="row" justifyContent="space-between" paddingX={2} borderBottom={true} borderStyle="single" borderColor={theme.border.active} borderTop={false} borderLeft={false} borderRight={false}>
          <Box width="60%" overflow="hidden">
            <Text bold color={theme.text.accent} wrap="truncate">{title.toUpperCase()}</Text>
          </Box>
          <Box flexShrink={0}>
            {infoLine && <Text color={theme.text.success}>{infoLine}</Text>}
            {timeLine && <Text color={theme.text.highlight}> · {timeLine}</Text>}
          </Box>
        </Box>

        {/* ── MAIN CONTENT ── */}
        <Box flexDirection="row" flexGrow={1} overflow="hidden">
          {/* LEFT COLUMN */}
          <Box flexDirection="column" width={44} paddingX={1} borderRight={true} borderStyle="single" borderColor={theme.border.active} borderTop={false} borderBottom={false} borderLeft={false} alignItems="center" paddingTop={1}>
            <Thumbnail url={coverUrl} cols={THUMB_COLS} rows={THUMB_ROWS} />

            
          </Box>

          {/* RIGHT COLUMN */}
          <Box flexDirection="column" flexGrow={1} paddingX={2} paddingTop={1} overflow="hidden">
            <Box marginBottom={1} overflow="hidden" flexShrink={0}>
              <Text wrap="wrap">
                <Text color={theme.text.highlight}>GENRES  </Text>
                <Text color={theme.text.accent}>{d.genres.length ? d.genres.join(" · ") : "NONE"}</Text>
              </Text>
            </Box>

            <Box flexGrow={1} overflow="hidden" marginBottom={1}>
              <Text
                dimColor={!isFocused('desc')}
                backgroundColor={isFocused('desc') ? activeBg : undefined}
                color={isFocused('desc') ? "white" : undefined}
              >
                {description || "NO SYNOPSIS AVAILABLE."}
              </Text>
            </Box>

            {/* ── EPISODES GRID ── */}
            <Box flexDirection="column" marginBottom={1} flexShrink={0}>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={theme.text.highlight} bold>EPISODES</Text>
                {d.episodes && <Text dimColor>{d.episodes} total</Text>}
              </Box>
              
              <Box 
                flexDirection="row" 
                flexWrap="wrap" 
                borderStyle={isFocused('episodes') ? "round" : "single"}
                borderColor={isFocused('episodes') ? theme.border.focus : theme.border.default}
                paddingX={1}
              >
                {(() => {
                  const maxEps = d.episodes || (d.nextAiringEpisode ? d.nextAiringEpisode.episode - 1 : Math.max(selectedEp + 10, 12));
                  const CHUNK_SIZE = 50;
                  const cIdx = Math.floor((selectedEp - 1) / CHUNK_SIZE);
                  const cStart = cIdx * CHUNK_SIZE + 1;
                  const cEnd = Math.min(maxEps, cStart + CHUNK_SIZE - 1);
                  
                  const eps = [];
                  for (let i = cStart; i <= cEnd; i++) {
                    const isFoc = isFocused('episodes') && selectedEp === i;
                    const isWatched = storeResumeEp ? (i < storeResumeEp) : (i <= (entryRef.current?.lastEpisode || 0));
                    
                    let marker = "· ";
                    let color = "gray";
                    
                    if (isFoc) {
                      marker = "▶ ";
                      color = "white";
                    } else if (isWatched) {
                      marker = "✓ ";
                      color = "green";
                    }
                    
                    eps.push(
                      <Box key={i} marginRight={2}>
                        <Text color={color} bold={isFoc}>{marker}{i}</Text>
                      </Box>
                    );
                  }
                  
                  return (
                    <Box flexDirection="column" width="100%">
                      <Box flexDirection="row" flexWrap="wrap">{eps}</Box>
                      {maxEps > CHUNK_SIZE && (
                        <Box marginTop={1}>
                          <Text dimColor>Chunk {cIdx + 1} of {Math.ceil(maxEps / CHUNK_SIZE)} (Left/Right to navigate)</Text>
                        </Box>
                      )}
                    </Box>
                  );
                })()}
              </Box>
              {watchResult && <Text color="cyan">↳ {watchResult}</Text>}
            </Box>

            <Box flexDirection="row" flexGrow={2} overflow="hidden">
              {/* SUB COLUMN 1: Characters & Relations */}
              <Box flexDirection="column" width="50%" paddingRight={2}>
                <Text color={theme.text.highlight} bold>CHARACTERS</Text>
                <Box flexDirection="column" flexGrow={1} overflow="hidden" marginBottom={1}>
                  {d.characters.edges.length === 0 ? <Text dimColor>NONE</Text> : null}
                  {d.characters.edges.slice(0, MAX_ITEMS).map((c, i) => (
                    <Box key={i} width="100%" overflow="hidden">
                      <Text wrap="truncate">
                        <Text color={theme.text.accent}>› </Text>
                        <Text color={c.role === "MAIN" ? "green" : "white"}>{c.node.name.full}</Text>
                      </Text>
                    </Box>
                  ))}
                </Box>

                <Text color={theme.text.highlight} bold>RELATIONS</Text>
                <Box flexDirection="column" flexGrow={1} overflow="hidden">
                  {relations.length === 0 ? <Text dimColor>NONE</Text> : null}
                  {visibleRelations.map((r, i) => {
                    const actualIndex = relStart + i;
                    const isF = isFocused('relation', actualIndex);
                    return (
                      <Box key={actualIndex} width="100%" overflow="hidden">
                        <Text wrap="truncate" backgroundColor={isF ? activeBg : undefined}>
                          <Text color={theme.text.accent}>› </Text>
                          <Text color={isF ? "white" : "green"}>
                            {r.relationType.replace(/_/g, " ").substring(0, 4)} {r.node.title.english ?? r.node.title.romaji}
                          </Text>
                        </Text>
                      </Box>
                    );
                  })}
                </Box>
              </Box>

              {/* SUB COLUMN 2: Staff & Studios */}
              <Box flexDirection="column" width="50%">
                <Text color={theme.text.highlight} bold>STAFF</Text>
                <Box flexDirection="column" flexGrow={1} overflow="hidden" marginBottom={1}>
                  {d.staff.edges.length === 0 ? <Text dimColor>NONE</Text> : null}
                  {d.staff.edges.slice(0, MAX_ITEMS).map((s, i) => (
                    <Box key={i} width="100%" overflow="hidden">
                      <Text wrap="truncate">
                        <Text color={theme.text.accent}>› </Text>
                        <Text color={theme.text.success}>{(s.role || "").split(" ")[0].substring(0, 4)} </Text>
                        <Text>{s.node.name.full}</Text>
                      </Text>
                    </Box>
                  ))}
                </Box>

                <Text color={theme.text.highlight} bold>STUDIOS</Text>
                <Box flexDirection="column" flexGrow={1} overflow="hidden">
                  {(mainStudios.length === 0 && otherStudios.length === 0) ? <Text dimColor>NONE</Text> : null}
                  {mainStudios.concat(otherStudios).slice(0, MAX_ITEMS).map((s, i) => (
                    <Box key={i} width="100%" overflow="hidden">
                      <Text wrap="truncate">
                        <Text color={theme.text.accent}>› </Text>
                        <Text>{s}</Text>
                      </Text>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* ── BOTTOM AREA: Links & Meta ── */}
        <Box flexDirection="column" flexShrink={0} paddingX={2} borderTop={true} borderStyle="single" borderColor={theme.border.active} borderBottom={false} borderLeft={false} borderRight={false} overflow="hidden">
          {nonSpoilerTags.length > 0 && (
            <Text wrap="truncate">
              <Text color={theme.text.highlight}>TAGS    </Text>
              <Text dimColor>{nonSpoilerTags.map(t => `${t.name} ${t.rank}%`).join(" · ")}</Text>
            </Text>
          )}
          {d.streamingEpisodes.length > 0 && (
            <Text wrap="truncate">
              <Text color={theme.text.highlight}>EPISODES </Text>
              <Text dimColor>{d.streamingEpisodes.map(s => s.title).join(" · ")}</Text>
            </Text>
          )}

          {links.length > 0 && (
            <Box flexDirection="row" flexWrap="wrap">
              <Text color={theme.text.highlight}>LINKS    </Text>
              {links.map((l, i) => {
                const isF = isFocused('link', i);
                return (
                  <Text key={i}>
                    <Text backgroundColor={isF ? activeBg : undefined} color={isF ? "white" : "cyanBright"}>
                      {l.site}
                    </Text>
                    <Text dimColor> · </Text>
                  </Text>
                )
              })}
            </Box>
          )}

          {similar.length > 0 && (
            <Box flexDirection="row" flexWrap="wrap">
              <Text color={theme.text.highlight}>SIMILAR  </Text>
              {similar.map((s, i) => {
                const isF = isFocused('similar', i);
                const title = s.title.english ?? s.title.romaji;
                return (
                  <Text key={i}>
                    <Text backgroundColor={isF ? activeBg : undefined} color={isF ? "white" : undefined}>
                      {title}
                    </Text>
                    <Text dimColor> · </Text>
                  </Text>
                )
              })}
            </Box>
          )}
        </Box>
      </Box>

            {resumePrompt && (
        <Box position="absolute" width="100%" height="100%" padding={2} flexDirection="column" justifyContent="center" alignItems="center">
          <Box width="60%" borderStyle="round" borderColor={theme.border.focus} padding={2} backgroundColor={theme.bg.black} flexDirection="column">
            <Box marginBottom={1}><Text color={theme.text.highlight} bold>RESUME EPISODE {resumePrompt.ep}?</Text></Box>
            <Text>You stopped at {Math.floor(resumePrompt.pos / 60)}:{Math.floor(resumePrompt.pos % 60).toString().padStart(2, '0')}.</Text>
            <Box marginTop={2} flexDirection="row" justifyContent="space-around">
              <Text color={focus.index === 0 ? "white" : "gray"} backgroundColor={focus.index === 0 ? "#444" : undefined}> RESUME </Text>
              <Text color={focus.index === 1 ? "white" : "gray"} backgroundColor={focus.index === 1 ? "#444" : undefined}> RESTART </Text>
            </Box>
            <Box marginTop={2}><Text dimColor>← → select · ENTER confirm · ESC cancel</Text></Box>
          </Box>
        </Box>
      )}

      {/* ── CAST: QR (until the phone connects, or Q to show again) ── */}
      {castState && (castShowQr || !castInfo) && (
        <Box position="absolute" width="100%" height="100%" padding={2} flexDirection="column" justifyContent="center" alignItems="center" backgroundColor={theme.bg.black}>
          <Box borderStyle="double" borderColor={theme.border.focus} padding={2} flexDirection="column" alignItems="center">
            <Text color={theme.text.highlight} bold>CAST TO PHONE</Text>
            <Box marginTop={1} marginBottom={1} flexDirection="column" alignItems="center">
              <Text>{castState.qr}</Text>
            </Box>
            <Text color="cyan">{castState.url}</Text>
            <Box marginTop={1}>
              {castInfo
                ? <Text color="green">● connected: {castInfo.device}</Text>
                : <Text color={theme.text.highlight}><Spinner type="dots" /> waiting for phone… scan with your camera (same wifi or hotspot)</Text>}
            </Box>
            <Box marginTop={2}>
              <Text dimColor>
                {castInfo && <><Text inverse> Q </Text> HIDE QR   </>}
                <Text inverse> ESC </Text> STOP CASTING
              </Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* ── CAST: NOW PLAYING ── */}
      {castState && castInfo && !castShowQr && (() => {
        const live = castInfo.paused ? castInfo.pos : castInfo.pos + (Date.now() - castInfo.at) / 1000;
        const pos = castInfo.dur ? Math.min(live, castInfo.dur) : live;
        const barWidth = 36;
        const filled = castInfo.dur ? Math.round((pos / castInfo.dur) * barWidth) : 0;
        const title = anime.title.english || anime.title.romaji || "";
        return (
          <Box position="absolute" width="100%" height="100%" padding={2} flexDirection="column" justifyContent="center" alignItems="center">
            <Box borderStyle="round" borderColor={theme.border.hero} paddingX={3} paddingY={1} backgroundColor={theme.bg.black} flexDirection="column">
              <Text color={theme.text.highlight} bold>📱 CASTING TO {castInfo.device}</Text>
              <Box marginTop={1}><Text bold>{title}</Text></Box>
              <Box justifyContent="space-between">
                <Text>Episode {castInfo.ep}{mEpsLabel(detail?.episodes)}</Text>
                <Text color={castInfo.paused ? "yellow" : "green"}>{castInfo.dur === 0 ? "◌ loading" : castInfo.paused ? "❚❚ paused" : "▶ playing"}</Text>
              </Box>
              <Box marginTop={1}>
                <Text color={theme.text.highlight}>{"━".repeat(filled)}</Text>
                <Text dimColor>{"━".repeat(barWidth - filled)}</Text>
                <Text>  {fmtTime(pos)} / {castInfo.dur ? fmtTime(castInfo.dur) : "--:--"}</Text>
              </Box>
              <Box marginTop={1}>
                <Text dimColor>progress saves automatically · <Text inverse> Q </Text> QR · <Text inverse> ESC </Text> stop casting</Text>
              </Box>
            </Box>
          </Box>
        );
      })()}

      {/* ── PLAYER SPINNER ── */}
      {playing && (
        <Box position="absolute" width="100%" height="100%" padding={2} flexDirection="column" justifyContent="center" alignItems="center">
          <Box borderStyle="round" borderColor={theme.border.hero} padding={2} backgroundColor={theme.bg.black}>
            <Text color={theme.text.highlight}><Spinner type="dots" /> {playStatus}</Text>
          </Box>
        </Box>
      )}

      {/* ── DESCRIPTION OVERLAY ── */}
      {expandedDesc && (
        <Box position="absolute" width="100%" height="100%" padding={2} flexDirection="column" justifyContent="center" alignItems="center">
          <Box width="80%" borderStyle="double" borderColor={theme.border.active} padding={2} backgroundColor={theme.bg.black}>
            <Box marginBottom={1}><Text color={theme.text.highlight} bold>SYNOPSIS</Text></Box>
            <Text>{description}</Text>
            <Box marginTop={2}>
              <Text dimColor><Text inverse> ESC </Text> CLOSE</Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* ── PLAYLIST PICKER OVERLAY ── */}
      {playlistPickerOpen && (
        <Box
          position="absolute"
          width="100%"
          height="100%"
          justifyContent="center"
          alignItems="center"
        >
          <Box flexDirection="column" borderStyle="double" borderColor={theme.border.focus} padding={2} backgroundColor={theme.bg.black}>
            <Text color={theme.text.highlight} bold>Add to Playlist</Text>
            
            <Box marginTop={1} flexDirection="column">
              {playlists.map((p, i) => {
                const isFocused = playlistFocusIdx === i;
                const hasAnime = p.animeIds.includes(anime.id);
                return (
                  <Text key={p.id} color={isFocused ? "white" : "gray"} backgroundColor={isFocused ? "#444" : undefined}>
                    {hasAnime ? "[x]" : "[ ]"} {p.name}
                  </Text>
                );
              })}
              
              <Box marginTop={1}>
                <Text color={playlistFocusIdx === playlists.length ? "white" : "gray"} backgroundColor={playlistFocusIdx === playlists.length ? "#444" : undefined}>
                  [+ Create New Playlist]
                </Text>
              </Box>
            </Box>
            
            {creatingPlaylist && (
              <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="cyan" padding={1}>
                <Text color="cyan">Playlist Name:</Text>
                <Text>{newPlaylistName}<Text inverse> </Text></Text>
              </Box>
            )}
            
            <Box marginTop={2}>
              <Text dimColor>↑↓ select · ENTER toggle/create · ESC close</Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* ── FOOTER: Keybindings ── */}
      <Box paddingX={1} flexDirection="row" justifyContent="space-between">
        <Text dimColor>
          <Text inverse> ESC </Text> BACK   <Text inverse> ↑↓←→ </Text> NAVIGATE   <Text inverse> ENTER </Text> SELECT   <Text inverse> P </Text> PLAYLIST   <Text inverse> C </Text> CAST
        </Text>
        {d.nextAiringEpisode && (
          <Text color={theme.text.successBright} bold>
            📺 EP {d.nextAiringEpisode.episode} IN {timeUntil(d.nextAiringEpisode.timeUntilAiring).toUpperCase()}
          </Text>
        )}
      </Box>
    </Box>
  );
}
