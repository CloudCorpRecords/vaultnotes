import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendContent,
  deleteFile,
  getFileContents,
  getVaultRoot,
  listFilesInDir,
  listFilesInVault,
  patchContent,
  searchVault,
  setVaultRoot,
} from "../src/vault.js";

let vault: string;

function seed(rel: string, body: string): void {
  const full = path.join(vault, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, "utf-8");
}

beforeEach(() => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), "vaultnotes-test-"));
  setVaultRoot(vault);
  seed("inbox.md", "# Inbox\nRemember to water the plants.\n");
  seed("projects/alpha.md", "# Alpha\nThe alpha launch checklist lives here.\nWater the roadmap too.\n");
  seed("projects/beta.txt", "beta water notes in a text file\n");
  seed("deep/nested/note.md", "A nested note about gardens.\n");
});

describe("vault root", () => {
  it("uses the directory set explicitly", () => {
    assert.equal(getVaultRoot(), fs.realpathSync(vault));
  });
});

describe("listFilesInVault / listFilesInDir", () => {
  it("lists every file in the vault as sorted vault-relative paths", async () => {
    assert.deepEqual(await listFilesInVault(), [
      "deep/nested/note.md",
      "inbox.md",
      "projects/alpha.md",
      "projects/beta.txt",
    ]);
  });

  it("lists only the files under one directory", async () => {
    assert.deepEqual(await listFilesInDir("projects"), [
      "projects/alpha.md",
      "projects/beta.txt",
    ]);
    assert.deepEqual(await listFilesInDir("deep"), ["deep/nested/note.md"]);
  });

  it("rejects a missing directory and a file passed as a directory", async () => {
    await assert.rejects(() => listFilesInDir("nope"), /not found/);
    await assert.rejects(() => listFilesInDir("inbox.md"), /Not a directory/);
  });
});

describe("getFileContents", () => {
  it("reads a file by its vault-relative path", async () => {
    assert.equal(
      await getFileContents("projects/alpha.md"),
      "# Alpha\nThe alpha launch checklist lives here.\nWater the roadmap too.\n",
    );
  });

  it("rejects missing files and directories", async () => {
    await assert.rejects(() => getFileContents("ghost.md"), /not found/);
    await assert.rejects(() => getFileContents("projects"), /is a directory/);
  });
});

describe("searchVault", () => {
  it("finds substring matches across markdown files, case-insensitively", async () => {
    const matches = await searchVault("WATER");
    assert.deepEqual(
      matches.map((m) => `${m.filepath}:${m.line}`),
      ["inbox.md:2", "projects/alpha.md:3"],
    );
    assert.equal(matches[0].snippet, "Remember to water the plants.");
  });

  it("does not search non-markdown files", async () => {
    const matches = await searchVault("water");
    assert.ok(matches.every((m) => m.filepath.endsWith(".md")));
  });

  it("returns an empty list when nothing matches and rejects empty queries", async () => {
    assert.deepEqual(await searchVault("zzzz-not-present"), []);
    await assert.rejects(() => searchVault("  "), /non-empty/);
  });
});

describe("appendContent", () => {
  it("appends to an existing file", async () => {
    await appendContent("inbox.md", "Another line.\n");
    assert.equal(
      await getFileContents("inbox.md"),
      "# Inbox\nRemember to water the plants.\nAnother line.\n",
    );
  });

  it("creates a new file, including parent directories", async () => {
    const msg = await appendContent("fresh/new-note.md", "# Fresh\n");
    assert.match(msg, /Appended/);
    assert.equal(await getFileContents("fresh/new-note.md"), "# Fresh\n");
    assert.ok((await listFilesInVault()).includes("fresh/new-note.md"));
  });
});

describe("patchContent", () => {
  it("replaces only the first occurrence of the target text", async () => {
    seed("repeat.md", "one fish, two fish, one more fish\n");
    await patchContent("repeat.md", "fish", "cat");
    assert.equal(await getFileContents("repeat.md"), "one cat, two fish, one more fish\n");
  });

  it("fails when the target text is absent", async () => {
    await assert.rejects(
      () => patchContent("inbox.md", "no such text", "replacement"),
      /target text not found/,
    );
    // And the file is untouched.
    assert.equal(
      await getFileContents("inbox.md"),
      "# Inbox\nRemember to water the plants.\n",
    );
  });

  it("fails on a missing file", async () => {
    await assert.rejects(() => patchContent("ghost.md", "a", "b"), /not found/);
  });
});

describe("deleteFile", () => {
  it("deletes a file from the vault", async () => {
    const msg = await deleteFile("projects/beta.txt");
    assert.match(msg, /Deleted/);
    assert.ok(!(await listFilesInVault()).includes("projects/beta.txt"));
    await assert.rejects(() => getFileContents("projects/beta.txt"), /not found/);
  });

  it("refuses directories and missing files", async () => {
    await assert.rejects(() => deleteFile("projects"), /is a directory/);
    await assert.rejects(() => deleteFile("ghost.md"), /not found/);
  });
});

describe("path scoping", () => {
  it("rejects .. escapes on reads, writes, patches, and deletes", async () => {
    await assert.rejects(() => getFileContents("../outside.md"), /outside the vault/);
    await assert.rejects(() => appendContent("../outside.md", "x"), /outside the vault/);
    await assert.rejects(() => patchContent("../outside.md", "a", "b"), /outside the vault/);
    await assert.rejects(() => deleteFile("../outside.md"), /outside the vault/);
    await assert.rejects(() => listFilesInDir(".."), /outside the vault/);
  });

  it("rejects absolute paths outside the vault but allows ones inside", async () => {
    await assert.rejects(() => getFileContents("/etc/hostname"), /outside the vault/);
    const inside = path.join(vault, "inbox.md");
    assert.match(await getFileContents(inside), /# Inbox/);
  });

  it("rejects a symlink inside the vault that points outside", async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "vaultnotes-outside-"));
    const secret = path.join(outside, "secret.md");
    fs.writeFileSync(secret, "not yours\n", "utf-8");
    fs.symlinkSync(secret, path.join(vault, "link.md"));
    await assert.rejects(() => getFileContents("link.md"), /outside the vault/);
  });
});
