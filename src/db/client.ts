import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createEmptyLibrary, migrate, type LibraryDocument } from "./schema.js";

function dataDir(): string {
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  return path.join(base, "lynn-cli");
}

function dbPath(): string {
  return path.join(dataDir(), "library.json");
}

class LibraryClient {
  private data: LibraryDocument | null = null;
  private loading: Promise<LibraryDocument> | null = null;

  private async readFromDisk(): Promise<LibraryDocument> {
    const file = dbPath();
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf-8");
    } catch (err: any) {
      if (err.code === "ENOENT") return createEmptyLibrary();
      throw err;
    }
    try {
      return migrate(JSON.parse(raw));
    } catch {
      try {
        await fs.copyFile(file, `${file}.bak`);
      } catch {
        /* best effort */
      }
      return createEmptyLibrary();
    }
  }

  async get(): Promise<LibraryDocument> {
    if (this.data) return this.data;
    if (!this.loading) this.loading = this.readFromDisk();
    this.data = await this.loading;
    return this.data;
  }

  // mutate the object from get() in place, then call save() with no args,
  // or pass a full replacement document.
  async save(next?: LibraryDocument): Promise<void> {
    await fs.mkdir(dataDir(), { recursive: true });
    const toWrite = next ?? this.data;
    if (!toWrite) throw new Error("nothing to save, call get() first");
    this.data = toWrite;

    const file = dbPath();
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(toWrite, null, 2), "utf-8");
    await fs.rename(tmp, file); // atomic on same filesystem
  }
}

export const client = new LibraryClient();
