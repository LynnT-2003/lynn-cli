import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Thumbnail } from "../components/Thumbnail.js";
import { db } from "../db/index.js";
import { theme } from "../lib/theme.js";
import type { Profile, WatchEntry, Playlist } from "../db/schema.js";

type Props = {
  isFocused?: boolean;
  onFocusSidebar?: () => void;
  onOpenPlaylist?: (playlist: Playlist) => void;
  onOpenAnime?: (anime: any) => void;
};

export function ProfileScreen({ isFocused = true, onFocusSidebar, onOpenPlaylist, onOpenAnime }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [watching, setWatching] = useState<WatchEntry[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activeSection, setActiveSection] = useState<"info" | "watching" | "playlists">("info");
  
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [selectedPlaylistIdx, setSelectedPlaylistIdx] = useState(0);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  
  const [selectedWatchingIdx, setSelectedWatchingIdx] = useState(0);
  const [openingAnime, setOpeningAnime] = useState(false);

  useEffect(() => {
    db.profile.get().then(setProfile);
    db.watch.continueWatching().then(setWatching);
    db.playlist.list().then(setPlaylists);
  }, []);

  useInput((input, key) => {
    if (!isFocused) return;
    
    if (editingProfile) {
      if (key.escape) {
        setEditingProfile(false);
        return;
      }
      if (key.return) {
        db.profile.update({ name: editName.trim() }).then(() => {
          db.profile.get().then(setProfile);
          setEditingProfile(false);
        });
        return;
      }
      if (key.backspace || key.delete) {
        setEditName(prev => prev.slice(0, -1));
        return;
      }
      if (input.length === 1) {
        setEditName(prev => prev + input);
      }
      return;
    }
    
    if (creatingPlaylist) {
      if (key.escape) {
        setCreatingPlaylist(false);
        return;
      }
      if (key.return) {
        if (playlistName.trim().length > 0) {
          db.playlist.create(playlistName.trim()).then(() => {
            db.playlist.list().then(setPlaylists);
            setCreatingPlaylist(false);
          });
        }
        return;
      }
      if (key.backspace || key.delete) {
        setPlaylistName(prev => prev.slice(0, -1));
        return;
      }
      if (input.length === 1) {
        setPlaylistName(prev => prev + input);
      }
      return;
    }

    if (key.return) {
      if (activeSection === "info") {
        setEditName(profile?.name || "");
        setEditingProfile(true);
      } else if (activeSection === "playlists" && playlists[selectedPlaylistIdx]) {
        if (onOpenPlaylist) onOpenPlaylist(playlists[selectedPlaylistIdx]);
      } else if (activeSection === "watching" && watching[selectedWatchingIdx]) {
        if (onOpenAnime && !openingAnime) {
          setOpeningAnime(true);
          import("../lib/anilist.js").then(({ fetchAnimeDetail }) => {
            fetchAnimeDetail(watching[selectedWatchingIdx].anilistId).then(anime => {
              setOpeningAnime(false);
              onOpenAnime(anime);
            }).catch(() => setOpeningAnime(false));
          });
        }
      }
      return;
    }
    
    if (input?.toLowerCase() === "c" && activeSection === "playlists") {
      setPlaylistName("");
      setCreatingPlaylist(true);
      return;
    }

    if (input?.toLowerCase() === "s" && activeSection === "playlists" && playlists[selectedPlaylistIdx]) {
      const p = playlists[selectedPlaylistIdx];
      const payload = Buffer.from(JSON.stringify({ name: p.name, animeIds: p.animeIds })).toString("base64");
      const shareStr = `lynn:playlist:${payload}`;
      
      import('execa').then(({ execa }) => {
        execa("pbcopy", [], { input: shareStr }).then(() => {
          setExportMessage(`Copied to clipboard!`);
        }).catch(() => {
          // Fallback if pbcopy isn't available
          const fs = require('fs');
          fs.writeFileSync('lynn-playlist.txt', shareStr);
          setExportMessage(`Saved to lynn-playlist.txt`);
        });
      });
      return;
    }

    if (key.leftArrow) {
      if (activeSection === "watching") {
        if (selectedWatchingIdx > 0) {
          setSelectedWatchingIdx(prev => prev - 1);
          return;
        }
      }
      if (onFocusSidebar) onFocusSidebar();
      return;
    }
    
    if (key.rightArrow) {
      if (activeSection === "watching") {
        if (selectedWatchingIdx < Math.min(watching.length, 3) - 1) {
          setSelectedWatchingIdx(prev => prev + 1);
          return;
        }
      }
      return;
    }

    if (key.upArrow) {
      if (activeSection === "playlists") {
        if (selectedPlaylistIdx > 0) setSelectedPlaylistIdx(prev => prev - 1);
        else {
          setActiveSection("watching");
          setSelectedWatchingIdx(Math.max(0, Math.min(watching.length, 5) - 1));
        }
      }
      else if (activeSection === "watching") {
        if (selectedWatchingIdx > 0) setSelectedWatchingIdx(prev => prev - 1);
        else setActiveSection("info");
      }
    } else if (key.downArrow) {
      if (activeSection === "info") {
        setActiveSection("watching");
        setSelectedWatchingIdx(0);
      }
      else if (activeSection === "watching") {
        if (selectedWatchingIdx < Math.min(watching.length, 5) - 1) setSelectedWatchingIdx(prev => prev + 1);
        else {
          setActiveSection("playlists");
          setSelectedPlaylistIdx(0);
        }
      }
      else if (activeSection === "playlists") {
        if (selectedPlaylistIdx < playlists.length - 1) setSelectedPlaylistIdx(prev => prev + 1);
      }
    }
  });

  if (!profile) {
    return <Box padding={2}><Text>Loading profile...</Text></Box>;
  }

  return (
    <Box flexDirection="column" padding={2} flexGrow={1} backgroundColor={theme.bg.black}>
      <Box marginBottom={2} borderStyle="single" borderColor={activeSection === "info" ? theme.border.focus : theme.border.default} padding={1}>
        <Box flexDirection="column">
          <Text color={theme.text.highlight} bold>YOUR PROFILE {activeSection === "info" && !editingProfile ? <Text dimColor>(Press ENTER to edit name)</Text> : ""}</Text>
          <Box marginTop={1}>
            <Text color={theme.text.accent}>Name: </Text>
            {editingProfile ? (
              <Text>{editName}<Text inverse> </Text></Text>
            ) : (
              <Text>{profile.name || "Anonymous"}</Text>
            )}
          </Box>
          <Box>
            <Text color={theme.text.accent}>Genres: </Text>
            <Text>{profile.genres.length ? profile.genres.join(", ") : "None"}</Text>
          </Box>
          {editingProfile && <Box marginTop={1}><Text dimColor>ENTER to save · ESC to cancel</Text></Box>}
        </Box>
      </Box>

      <Box marginBottom={2} borderStyle="single" borderColor={activeSection === "watching" ? theme.border.focus : theme.border.default} padding={1}>
        <Box flexDirection="column">
          <Text color={theme.text.highlight} bold>CONTINUE WATCHING</Text>
          <Box marginTop={1} flexDirection="row" overflow="hidden">
            {watching.length === 0 ? <Text dimColor>Nothing yet.</Text> : null}
            {watching.slice(0, 3).map((w, i) => {
              const isFocused = activeSection === "watching" && selectedWatchingIdx === i;
              
              const m = Math.floor(w.positionSeconds / 60);
              const s = Math.floor(w.positionSeconds % 60).toString().padStart(2, '0');
              const dM = Math.floor(w.durationSeconds / 60);
              const dS = Math.floor(w.durationSeconds % 60).toString().padStart(2, '0');
              
              const pct = w.durationSeconds ? Math.min(100, Math.floor((w.positionSeconds / w.durationSeconds) * 100)) : 0;
              const barLen = 14;
              const filled = Math.floor((pct / 100) * barLen);
              const barStr = "█".repeat(filled) + "▒".repeat(barLen - filled);
              
              return (
                <Box 
                  key={w.anilistId} 
                  flexDirection="column" 
                  marginRight={2}
                  borderStyle="single"
                  borderColor={isFocused ? theme.border.focus : theme.border.default}
                  paddingX={1}
                  paddingY={0}
                  width={24}
                >
                  <Box alignSelf="center" marginBottom={1}>
                    <Thumbnail url={w.cover || null} cols={20} rows={10} />
                  </Box>
                  <Box height={2} overflow="hidden">
                    <Text color={isFocused ? "white" : "gray"} bold>{w.title}</Text>
                  </Box>
                  <Box marginTop={1} flexDirection="row" justifyContent="space-between">
                    <Text color={theme.text.accent}>Ep {w.resumeEpisode ?? (w.lastEpisode + 1)}</Text>
                    <Text dimColor>{m}:{s}</Text>
                  </Box>
                  <Box marginTop={1}>
                    <Text color={isFocused ? "cyan" : "gray"}>{barStr}</Text>
                  </Box>
                  {openingAnime && isFocused && <Box marginTop={1}><Text color="yellow">Loading...</Text></Box>}
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>

      <Box borderStyle="single" borderColor={activeSection === "playlists" ? theme.border.focus : theme.border.default} padding={1}>
        <Box flexDirection="column">
          <Text color={theme.text.highlight} bold>PLAYLISTS</Text>
          <Box marginTop={1} flexDirection="column">
            {playlists.length === 0 && !creatingPlaylist ? <Text dimColor>No playlists created.</Text> : null}
            {playlists.map((p, i) => {
              const isFocused = activeSection === "playlists" && selectedPlaylistIdx === i;
              return (
                <Text key={p.id} color={isFocused ? "white" : "gray"} backgroundColor={isFocused ? "#444" : undefined}>
                  <Text color={isFocused ? theme.text.accent : "gray"}>› </Text>
                  {p.name} <Text dimColor>({p.animeIds.length} items)</Text>
                </Text>
              );
            })}
            
            {exportMessage && activeSection === "playlists" && (
              <Box marginTop={1}>
                <Text color="greenBright">{exportMessage}</Text>
              </Box>
            )}

            {creatingPlaylist && (
              <Box marginTop={1} flexDirection="column">
                <Text color={theme.text.accent}>New Playlist Name:</Text>
                <Text>{playlistName}<Text inverse> </Text></Text>
                <Text dimColor>ENTER to create · ESC to cancel</Text>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
      
      <Box marginTop={1}>
        <Text dimColor>↑↓ select · ← sidebar {activeSection === "playlists" ? "· c create · s share" : ""}</Text>
      </Box>
    </Box>
  );
}
