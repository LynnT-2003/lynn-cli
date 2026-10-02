#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { Command } from "commander";
import { AnimeTest } from "./screens/AnimeTest.js";
import { App } from "./App.js";
import { loadLibrary } from "./lib/store.js";

loadLibrary();

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

  program.parseAsync(process.argv);
}
