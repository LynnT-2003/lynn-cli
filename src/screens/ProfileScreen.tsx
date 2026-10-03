import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { db } from "../db/index.js";
import { theme } from "../lib/theme.js";
import type { Profile, WatchEntry, Playlist } from "../db/schema.js";

type Props = {
  isFocused?: boolean;
  onFocusSidebar?: () => void;
};

export function ProfileScreen({ isFocused = true, onFocusSidebar }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [watching, setWatching] = useState<WatchEntry[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activeSection, setActiveSection] = useState<"info" | "watching" | "playlists">("info");
  
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [playlistName, setPlaylistName] = useState("");

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
      } else if (activeSection === "playlists") {
        setPlaylistName("");
        setCreatingPlaylist(true);
      }
      return;
    }

    if (key.leftArrow) {
      if (onFocusSidebar) onFocusSidebar();
      return;
    }

    if (key.upArrow) {
      if (activeSection === "playlists") setActiveSection("watching");
      else if (activeSection === "watching") setActiveSection("info");
    } else if (key.downArrow) {
      if (activeSection === "info") setActiveSection("watching");
      else if (activeSection === "watching") setActiveSection("playlists");
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
          <Box marginTop={1} flexDirection="column">
            {watching.length === 0 ? <Text dimColor>Nothing yet.</Text> : null}
            {watching.slice(0, 5).map(w => (
              <Text key={w.anilistId}>
                <Text color={theme.text.accent}>› </Text>
                {w.title} - <Text dimColor>Ep {w.resumeEpisode ?? (w.lastEpisode + 1)}</Text>
              </Text>
            ))}
            {watching.length > 5 && <Text dimColor>+ {watching.length - 5} more</Text>}
          </Box>
        </Box>
      </Box>

      <Box borderStyle="single" borderColor={activeSection === "playlists" ? theme.border.focus : theme.border.default} padding={1}>
        <Box flexDirection="column">
          <Text color={theme.text.highlight} bold>PLAYLISTS {activeSection === "playlists" && !creatingPlaylist ? <Text dimColor>(Press ENTER to create)</Text> : ""}</Text>
          <Box marginTop={1} flexDirection="column">
            {playlists.length === 0 && !creatingPlaylist ? <Text dimColor>No playlists created.</Text> : null}
            {playlists.map(p => (
              <Text key={p.id}>
                <Text color={theme.text.accent}>› </Text>
                {p.name} <Text dimColor>({p.animeIds.length} items)</Text>
              </Text>
            ))}
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
        <Text dimColor>↑↓ select section · ← sidebar</Text>
      </Box>
    </Box>
  );
}
