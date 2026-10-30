/**
 * vaultnotes core: a local directory treated as a notes vault.
 *
 * Local mode: this rebuild works directly on a folder of files on disk
 * instead of talking to a running note-taking app through a plugin
 * API. The vault root is chosen once — an explicit setting wins, then
 * the VAULTNOTES_DIR environment variable, then the current working
 * directory — and every operation is scoped inside it.
 *
 * Scoping rule: caller paths are read as vault-relative, resolved
 * against the root, and canonicalised (through the real filesystem for
 * existing targets, through the parent for new ones). A resolved path
 * that lands outside the root — `..` escapes, absolute paths pointing
 * elsewhere, symlinks out of the vault — is rejected before any file
 * is touched.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { SearchMatch } from "./types.js";

export const VERSION = "0.1.0";

export const VAULT_ENV_VAR = "VAULTNOTES_DIR";

// ---------------------------------------------------------------------------
// Vault root
// ---------------------------------------------------------------------------

let vaultRoot: string | null = null;

function canonicalise(dir: string): string {
  const abs = path.resolve(dir);
  try {
    return fs.realpathSync(abs);
  } catch {
    return abs;
  }
}

/** Point the vault at a directory (CLI --vault flag, tests). */
export function setVaultRoot(dir: string): void {
  vaultRoot = canonicalise(dir);
}

/** The active vault root: explicit setting, then env, then the cwd. */
export function getVaultRoot(): string {
  if (vaultRoot) return vaultRoot;
  const fromEnv = process.env[VAULT_ENV_VAR];
  vaultRoot = canonicalise(fromEnv && fromEnv.trim() ? fromEnv.trim() : process.cwd());
  return vaultRoot;
}

// ---------------------------------------------------------------------------
// Path scoping
// ---------------------------------------------------------------------------

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Report a path the way callers see it: vault-relative, forward slashes. */
function toVaultRelative(abs: string): string {
  return path.relative(getVaultRoot(), abs).split(path.sep).join("/");
}

/**
 * Resolve a caller-supplied path inside the vault, or throw. Existing
 * targets are canonicalised with realpath so symlinks cannot smuggle
 * a path out; new targets are canonicalised through their parent.
 */
export async function resolveInVault(p: string): Promise<string> {
  if (typeof p !== "string" || p.length === 0) {
    throw new Error("path must be a non-empty string");
  }
  const root = getVaultRoot();
  const abs = path.resolve(root, p);
  let real: string;
  try {
    real = await fsp.realpath(abs);
  } catch {
    const parent = path.dirname(abs);
    let realParent: string;
    try {
      realParent = await fsp.realpath(parent);
    } catch {
      realParent = parent;
    }
    real = path.join(realParent, path.basename(abs));
  }
  if (!isInside(real, root)) {
    throw new Error(`Access denied: path '${p}' is outside the vault (${root})`);
  }
  return real;
}

// ---------------------------------------------------------------------------
// Walking
// ---------------------------------------------------------------------------

async function walkFiles(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    throw new Error(
      `Cannot read directory '${toVaultRelative(dir) || "."}': ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walkFiles(full, out);
    else if (e.isFile()) out.push(full);
  }
}

async function allFiles(): Promise<string[]> {
  const root = getVaultRoot();
  try {
    const stat = await fsp.stat(root);
    if (!stat.isDirectory()) throw new Error(`Vault root is not a directory: ${root}`);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Vault root")) throw err;
    throw new Error(`Vault directory does not exist or is not readable: ${root}`);
  }
  const out: string[] = [];
  await walkFiles(root, out);
  return out;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

/** List every file in the vault, as vault-relative paths. */
export async function listFilesInVault(): Promise<string[]> {
  const files = await allFiles();
  return files.map(toVaultRelative).sort();
}

/** List every file under one vault directory, as vault-relative paths. */
export async function listFilesInDir(dirpath: string): Promise<string[]> {
  const real = await resolveInVault(dirpath);
  const stat = await fsp.stat(real).catch(() => null);
  if (!stat) throw new Error(`Directory not found in vault: '${dirpath}'`);
  if (!stat.isDirectory()) throw new Error(`Not a directory: '${dirpath}'`);
  const out: string[] = [];
  await walkFiles(real, out);
  return out.map(toVaultRelative).sort();
}

/** Read a vault file as UTF-8 text. */
export async function getFileContents(filepath: string): Promise<string> {
  const real = await resolveInVault(filepath);
  const stat = await fsp.stat(real).catch(() => null);
  if (!stat) throw new Error(`File not found in vault: '${filepath}'`);
  if (stat.isDirectory()) throw new Error(`'${filepath}' is a directory, not a file`);
  return fsp.readFile(real, "utf-8");
}

const SNIPPET_LIMIT = 200;

/**
 * Substring search (case-insensitive) across the vault's markdown
 * files. One match is returned per matching line, with the line itself
 * as the snippet.
 */
export async function searchVault(query: string): Promise<SearchMatch[]> {
  const needle = typeof query === "string" ? query.trim().toLowerCase() : "";
  if (!needle) throw new Error("query must be a non-empty string");
  const files = (await allFiles()).filter((f) => f.toLowerCase().endsWith(".md"));
  const matches: SearchMatch[] = [];
  for (const file of files) {
    let body: string;
    try {
      body = await fsp.readFile(file, "utf-8");
    } catch {
      continue; // an unreadable file simply has no matches
    }
    const lines = body.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(needle)) {
        const trimmed = lines[i].trim();
        matches.push({
          filepath: toVaultRelative(file),
          line: i + 1,
          snippet:
            trimmed.length > SNIPPET_LIMIT ? trimmed.slice(0, SNIPPET_LIMIT) + "..." : trimmed,
        });
      }
    }
  }
  return matches;
}

/** Append content to a vault file, creating it (and parents) if needed. */
export async function appendContent(filepath: string, content: string): Promise<string> {
  if (typeof content !== "string") throw new Error("content must be a string");
  const real = await resolveInVault(filepath);
  const stat = await fsp.stat(real).catch(() => null);
  if (stat?.isDirectory()) throw new Error(`'${filepath}' is a directory, not a file`);
  await fsp.mkdir(path.dirname(real), { recursive: true });
  await fsp.appendFile(real, content, "utf-8");
  return `Appended ${content.length} character(s) to ${filepath}`;
}

/**
 * Replace the first occurrence of an exact target text in a vault file
 * with new content. Fails when the target text is not present, so a
 * patch is never silently a no-op.
 */
export async function patchContent(
  filepath: string,
  target: string,
  content: string,
): Promise<string> {
  if (typeof target !== "string" || target.length === 0) {
    throw new Error("target must be a non-empty string");
  }
  if (typeof content !== "string") throw new Error("content must be a string");
  const real = await resolveInVault(filepath);
  const stat = await fsp.stat(real).catch(() => null);
  if (!stat) throw new Error(`File not found in vault: '${filepath}'`);
  if (stat.isDirectory()) throw new Error(`'${filepath}' is a directory, not a file`);
  const original = await fsp.readFile(real, "utf-8");
  const idx = original.indexOf(target);
  if (idx === -1) {
    throw new Error(`patch failed: target text not found in '${filepath}'`);
  }
  const updated = original.slice(0, idx) + content + original.slice(idx + target.length);
  await fsp.writeFile(real, updated, "utf-8");
  return `Patched ${filepath}: replaced the first occurrence of the target text`;
}

/** Delete a file from the vault. Directories are refused. */
export async function deleteFile(targetFilepath: string): Promise<string> {
  const real = await resolveInVault(targetFilepath);
  const stat = await fsp.stat(real).catch(() => null);
  if (!stat) throw new Error(`File not found in vault: '${targetFilepath}'`);
  if (stat.isDirectory()) throw new Error(`'${targetFilepath}' is a directory, not a file`);
  await fsp.unlink(real);
  return `Deleted ${targetFilepath}`;
}
