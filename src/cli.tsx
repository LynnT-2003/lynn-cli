#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { Command } from "commander";
import { AnimeTest } from "./screens/AnimeTest.js";
import { App } from "./App.js";
import { db } from "./db/index.js";

// bare `lynn-cli` with no subcommand jumps straight into the full-screen
// browse experience - no "run browse first" step, matches the claude-code
// style immersive launch.
const rawArgs = process.argv.slice(2);
if (rawArgs.length === 0) {
  render(<App />);
} else {
  const program = new Command();

  program
    .name("lynn-cli")
    .description("lynn-cli - anime tracker")
    .version("0.1.0");

  program
    .command("test <title>")
    .description("fetch a single title from anilist (debug command)")
    .action((title: string) => {
      render(<AnimeTest title={title} />);
    });

  program
    .command("browse")
    .description("same as running lynn-cli with no arguments")
    .action(() => {
      render(<App />);
    });

  program
    .command("export")
    .description("export watch progress and playlists")
    .action(async () => {
      const cw = await db.watch.continueWatching();
      const playlists = await db.playlist.list();
      
      console.log("\n== WATCHING ==");
      if (cw.length === 0) {
        console.log("No continue watching data.");
      } else {
        for (const c of cw) {
          const m = Math.floor(c.positionSeconds / 60);
          const s = Math.floor(c.positionSeconds % 60).toString().padStart(2, '0');
          console.log(`- ${c.title} (Ep ${c.resumeEpisode || c.lastEpisode + 1} at ${m}:${s})`);
        }
      }
      
      console.log("\n== PLAYLISTS ==");
      if (playlists.length === 0) {
        console.log("No playlists.");
      } else {
        for (const p of playlists) {
          console.log(`\n[${p.name}]`);
          if (p.animeIds.length === 0) {
            console.log("  (empty)");
          } else {
            for (const id of p.animeIds) {
              const entry = await db.watch.getEntry(id);
              console.log(`  - ${entry ? entry.title : `Anilist ID: ${id}`}`);
            }
          }
        }
      }
      console.log("");
    });

  program.parseAsync(process.argv);
}
