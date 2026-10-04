import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Thumbnail } from "../components/Thumbnail.js";
import { Card } from "../components/Card.js";
import { db } from "../db/index.js";
import { useLayout } from "../lib/useLayout.js";
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
  const [playlistCovers, setPlaylistCovers] = useState<Record<number, string>>({});

  useEffect(() => {
    const allIds = Array.from(new Set(playlists.flatMap(p => p.animeIds).slice(0, 50)));
    if (allIds.length === 0) return;

    fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query($ids: [Int]) { Page { media(id_in: $ids, type: ANIME) { id coverImage { large } } } }`,
        variables: { ids: allIds }
      })
    })
      .then(r => r.json())
      .then(data => {
        const map: Record<number, string> = {};
        data.data.Page.media.forEach((m: any) => {
          map[m.id] = m.coverImage.large;
        });
        setPlaylistCovers(map);
      }).catch(() => { });
  }, [playlists]);
  const [activeSection, setActiveSection] = useState<"info" | "watching" | "playlists">("info");

  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");

  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [selectedPlaylistIdx, setSelectedPlaylistIdx] = useState(0);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const { rows: termRows } = useLayout();
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    if (activeSection === "info") {
      setScrollOffset(0);
    } else if (activeSection === "watching") {
      if (termRows < 32) {
        setScrollOffset(1);
      } else {
        setScrollOffset(0);
      }
    } else if (activeSection === "playlists") {
      if (termRows < 28) {
        setScrollOffset(2);
      } else if (termRows < 52) {
        setScrollOffset(1);
      } else {
        setScrollOffset(0);
      }
    }
  }, [activeSection, termRows]);

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
      if (activeSection === "playlists") {
        if (selectedPlaylistIdx > 0) {
          setSelectedPlaylistIdx(prev => prev - 1);
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
      if (activeSection === "playlists") {
        if (selectedPlaylistIdx < Math.min(playlists.length, 3) - 1) {
          setSelectedPlaylistIdx(prev => prev + 1);
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
    <Box flexDirection="column" padding={1} flexGrow={1}>
      {scrollOffset <= 0 && (
        <Box marginBottom={1} borderStyle="single" borderColor={activeSection === "info" ? theme.border.focus : theme.border.default} paddingX={1} paddingY={0} flexShrink={0}>
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

      )}

      {scrollOffset <= 1 && (
        <Box marginBottom={1} borderStyle="single" borderColor={activeSection === "watching" ? theme.border.focus : theme.border.default} paddingX={1} paddingY={0} flexShrink={0}>
          <Box flexDirection="column">
            <Text color={theme.text.highlight} bold>CONTINUE WATCHING</Text>
            <Box marginTop={1} flexDirection="row" overflow="hidden">
              {watching.length === 0 ? <Text dimColor>Nothing yet.</Text> : null}

              {
                watching.slice(0, 3).map((w, i) => {
                  const isFocused = activeSection === "watching" && selectedWatchingIdx === i;

                  const m = Math.floor(w.positionSeconds / 60);
                  const s = Math.floor(w.positionSeconds % 60).toString().padStart(2, '0');
                  const pct = w.durationSeconds ? Math.min(100, Math.floor((w.positionSeconds / w.durationSeconds) * 100)) : 0;

                  return (
                    <Card key={w.anilistId} isFocused={isFocused} width={24} height={17}>
                      <Box alignSelf="center">
                        <Thumbnail url={w.cover || null} cols={20} rows={10} />
                      </Box>
                      <Box height={2} overflow="hidden" marginTop={1}>
                        <Text color={isFocused ? "white" : "gray"} bold>{w.title}</Text>
                      </Box>
                      <Box flexDirection="row" justifyContent="space-between">
                        <Text color={theme.text.accent}>Ep {w.resumeEpisode ?? (w.lastEpisode + 1)}</Text>
                        <Text dimColor>{m}:{s}</Text>
                      </Box>
                      <Box>
                        <Text color={isFocused ? "cyan" : "gray"}>{"█".repeat(Math.floor((pct / 100) * 20)) + "▒".repeat(20 - Math.floor((pct / 100) * 20))}</Text>
                      </Box>
                      {openingAnime && isFocused && <Box><Text color="yellow">Loading...</Text></Box>}
                    </Card>
                  );
                })
              }
            </Box>
          </Box>
        </Box>

      )}

      {scrollOffset <= 2 && (
        <Box borderStyle="single" borderColor={activeSection === "playlists" ? theme.border.focus : theme.border.default} paddingX={1} paddingY={0} flexShrink={0}>
          <Box flexDirection="column">
            <Text color={theme.text.highlight} bold>PLAYLISTS</Text>
            <Box marginTop={1} flexDirection="row" overflow="hidden">
              {playlists.length === 0 && !creatingPlaylist ? <Text dimColor>No playlists created.</Text> : null}

              {
                playlists.slice(0, 3).map((p, i) => {
                  const isFocused = activeSection === "playlists" && selectedPlaylistIdx === i;
                  const covers = p.animeIds.map(id => playlistCovers[id]).filter(Boolean);

                  return (
                    <Card key={p.id} isFocused={isFocused} width={24} height={16}>
                      <Box alignSelf="center" width={20} height={10} flexDirection="column">
                        {covers.length === 0 ? (
                          <Box flexGrow={1} borderStyle="single" borderColor={theme.border.default} justifyContent="center" alignItems="center">
                            <Text dimColor>EMPTY</Text>
                          </Box>
                        ) : covers.length < 4 ? (
                          <Thumbnail url={covers[0] || null} cols={20} rows={10} />
                        ) : (
                          <Box flexDirection="column">
                            <Box flexDirection="row">
                              <Thumbnail url={covers[0] || null} cols={10} rows={5} />
                              <Thumbnail url={covers[1] || null} cols={10} rows={5} />
                            </Box>
                            <Box flexDirection="row">
                              <Thumbnail url={covers[2] || null} cols={10} rows={5} />
                              <Thumbnail url={covers[3] || null} cols={10} rows={5} />
                            </Box>
                          </Box>
                        )}
                      </Box>
                      <Box height={2} overflow="hidden" marginTop={1}>
                        <Text color={isFocused ? "white" : "gray"} bold>{p.name}</Text>
                      </Box>
                      <Box>
                        <Text dimColor>{p.animeIds.length} items</Text>
                      </Box>
                    </Card>
                  );
                })
              }

            </Box>

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

      )}

      <Box marginTop={1} flexShrink={0}>
        <Text dimColor>↑↓ select · ← sidebar {activeSection === "playlists" ? "· c create · s share" : ""}</Text>
      </Box>
    </Box>
  );
}
