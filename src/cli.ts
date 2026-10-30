#!/usr/bin/env node
/**
 * vaultnotes CLI.
 *
 *   vaultnotes list [--vault <dir>]
 *   vaultnotes list-dir <dirpath> [--vault <dir>]
 *   vaultnotes read <filepath> [--vault <dir>]
 *   vaultnotes search <query> [--vault <dir>]
 *   vaultnotes append <filepath> <content> [--vault <dir>]
 *   vaultnotes patch <filepath> <target> <content> [--vault <dir>]
 *   vaultnotes delete <target_filepath> [--vault <dir>]
 *   vaultnotes mcp [--vault <dir>]
 *
 * The vault directory comes from --vault, then the VAULTNOTES_DIR
 * environment variable, then the current working directory.
 * Exit codes: 0 success, 1 operation error, 2 usage error.
 */
import {
  appendContent,
  deleteFile,
  getFileContents,
  listFilesInDir,
  listFilesInVault,
  patchContent,
  searchVault,
  setVaultRoot,
  VERSION,
} from "./vault.js";

function usage(): never {
  console.error(`Usage:
  vaultnotes list [--vault <dir>]
  vaultnotes list-dir <dirpath> [--vault <dir>]
  vaultnotes read <filepath> [--vault <dir>]
  vaultnotes search <query> [--vault <dir>]
  vaultnotes append <filepath> <content> [--vault <dir>]
  vaultnotes patch <filepath> <target> <content> [--vault <dir>]
  vaultnotes delete <target_filepath> [--vault <dir>]
  vaultnotes mcp [--vault <dir>]
  vaultnotes --version`);
  process.exit(2);
}

/** Pull --vault <dir> out of the argument list, wherever it appears. */
function extractVault(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--vault") {
      if (i + 1 >= args.length) usage();
      setVaultRoot(args[i + 1]);
      i++;
    } else {
      out.push(args[i]);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const [cmd, ...rawRest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  const rest = extractVault(rawRest);
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (!cmd) usage();
  try {
    switch (cmd) {
      case "list": {
        const files = await listFilesInVault();
        console.log(files.join("\n"));
        break;
      }
      case "list-dir": {
        const [dirpath] = rest;
        if (!dirpath) usage();
        console.log((await listFilesInDir(dirpath)).join("\n"));
        break;
      }
      case "read": {
        const [filepath] = rest;
        if (!filepath) usage();
        console.log(await getFileContents(filepath));
        break;
      }
      case "search": {
        const query = rest.join(" ").trim();
        if (!query) usage();
        const matches = await searchVault(query);
        if (matches.length === 0) console.log("No matches.");
        for (const m of matches) console.log(`${m.filepath}:${m.line}: ${m.snippet}`);
        break;
      }
      case "append": {
        const [filepath, ...contentParts] = rest;
        if (!filepath || contentParts.length === 0) usage();
        console.log(await appendContent(filepath, contentParts.join(" ")));
        break;
      }
      case "patch": {
        const [filepath, target, ...contentParts] = rest;
        if (!filepath || !target || contentParts.length === 0) usage();
        console.log(await patchContent(filepath, target, contentParts.join(" ")));
        break;
      }
      case "delete": {
        const [target] = rest;
        if (!target) usage();
        console.log(await deleteFile(target));
        break;
      }
      default:
        usage();
    }
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
