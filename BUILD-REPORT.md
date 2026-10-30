# vaultnotes — Build Report

MCP Rebuild 100, Tier A. Clean-room rebuild of mcp-obsidian's tool
surface, built from the public tool spec captured in
`harness/fixtures/obsidian-tools-original.json` only. The fixture was
created for this build: it is docs-derived from the original
project's public documentation (tool names, parameter types,
required sets), marked `"_source": docs-derived ... not
hand-probed`. Local build only — nothing pushed or published.

Identity: repo `vaultnotes`, npm `@reneturcios/vaultnotes`,
MCP name `io.github.CloudCorpRecords/vaultnotes`, version `0.1.0`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `vaultnotes: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "List, read, search, and edit markdown
  notes in a local vault directory." = **71 chars** (≤100 ✓); npm
  entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/vaultnotes:0.1.0` carries **no**
  `version` field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/vaultnotes"`
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-26)
- `src/index.ts`, `src/cli.ts` (`list`, `list-dir`, `read`, `search`,
  `append`, `patch`, `delete`, `mcp`, `--version`; exit 2 usage / 1
  operation error), `src/mcp.ts`, `src/types.ts`, `src/vault.ts`
  (core logic, `VERSION = "0.1.0"`)
- `test/vault.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template; image name and smoke-test server name
  changed to vaultnotes)

## Implementation notes

- **Local mode, chosen honestly:** the original mcp-obsidian talks to
  a running Obsidian app through its Local REST API plugin. This
  rebuild instead operates directly on a local vault directory — no
  app, plugin, or network involved. The tool surface (names, schemas,
  semantics) is unchanged; the transport underneath is plain `node:fs`.
  This choice is stated in the README, CHANGELOG, core header, and
  the fixture's `_source` note.
- Vault root resolution: explicit setting / `--vault <dir>` flag,
  then the `VAULTNOTES_DIR` env var, then the current working
  directory. The MCP server resolves the root lazily per call, so it
  starts and answers `tools/list` with no vault configured; calls
  against a missing vault return clean tool errors.
- Scoping follows the fileport pattern: caller paths are resolved
  against the vault root, canonicalised via realpath (through the
  parent for not-yet-existing targets), and rejected when they land
  outside the root. Tests cover `..` escapes on every mutating and
  reading tool, outside absolute paths, and a symlink inside the
  vault pointing outside.
- `src/mcp.ts` uses the SDK's low-level `Server` with explicit
  inputSchema literals, per the clockport precedent (McpServer's
  schema conversion injects `$schema` / `additionalProperties` keys
  absent from the public spec). Zod still validates every
  `tools/call`. `list_files_in_vault` serves
  `{type:"object", properties:{}, required:[]}` exactly.
- `search` is a case-insensitive substring search over `.md` files,
  one match per matching line with filepath, 1-based line number,
  and the trimmed line (capped at 200 chars) as the snippet.

## Verification (exact outputs)

### 1. Build
```
$ ./node_modules/.bin/tsc ; echo exit=$?
tsc exit=0
```
`dist/` produced, including `dist/cli.js`.

### 2. Tests
```
$ ./node_modules/.bin/tsx --test test/*.test.ts
ℹ tests 19
ℹ pass 19
ℹ fail 0
```
Tests run against the real filesystem in per-test temp dirs
(`fs.mkdtemp` under `os.tmpdir()`), no network. Covers: vault and
per-directory listing, file reads, substring search (case-insensitive,
markdown-only), append (existing file + create-with-parents), patch
first-occurrence replacement, patch-on-missing-target error leaving
the file untouched, delete (incl. directory refusal), and the three
path-scoping rejections above.

### 3. CLI / MCP smoke
CLI against a scratch vault: `--version` → `0.1.0`; `list`, `read`,
`search` (match printed as `projects/alpha.md:2: launch checklist
here`), `append` all correct; `read ../etc` exits 1 with "outside
the vault"; unknown command exits 2 with Usage. MCP over stdio with
`VAULTNOTES_DIR` set: `initialize` → `serverInfo
{"name":"vaultnotes","version":"0.1.0"}`; `tools/list` returns the 7
spec tools; `tools/call list_files_in_vault` returned the scratch
vault's files; `tools/call get_file_contents` with `../escape.md`
returned a clean `isError` result. The parity run below additionally
proves the server starts with **no** vault env set at all.

### 4. Parity (harness, from ~/workspace/mcp-rebuild-100/harness/)
```
$ python3 parity.py --original fixtures/obsidian-tools-original.json \
    --rebuild "stdio:node /home/hatch/workspace/mcp-rebuild-100/builds/vaultnotes/dist/cli.js mcp" \
    --out .../builds/vaultnotes/parity-out
verdict=PASS parity_pct=100.0 original_tools=7 rebuild_tools=7 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
Original side is tools-file mode, so `fixture_results` records
`SKIPPED-TOOLS-FILE-MODE` — expected harness semantics, not an error.

## Lockfile status

`package-lock.json` was copied from clockport's and edited with the
file edit tool: top-level `name`, root package `name`, and root
package `bin` key changed clockport -> vaultnotes (dependency ranges
are identical, so the tree is unchanged). **Clean regeneration (no
`node_modules` present) is deferred to the publish wave**; do not
publish from this lockfile as-is. `node_modules` here is a `cp -a`
copy of clockport's (ownership-preservation warnings during the copy
were cosmetic; `.bin/tsc` / `.bin/tsx` verified working).

## Gaps / honest notes

- **patch_content targeting simplified:** the original's patch tool
  targets a heading or block reference inside a note. This rebuild
  uses exact-text targeting — replace the first occurrence of the
  literal `target` string, error if absent. Same schema, narrower
  addressing; stated in the README and CHANGELOG.
- **Local mode vs REST API mode:** anything the original gets from
  the running app (e.g. awareness of files open in the app, periodic
  notes, plugin-managed metadata) has no local equivalent and is out
  of scope; the seven rebuilt tools operate purely on files.
- `list_files_in_dir` lists files recursively under the directory
  (the original's docs do not pin down recursion); listings are
  vault-relative and sorted.
- `search` scans `.md` files only and returns one match per matching
  line; the original's result shaping over the REST API may group
  matches per file instead. Filepaths + snippets are preserved.
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.

## Publish-gate remediation (2026-10-27)

Recorded under Rene's 2026-10-27 decision ("Remediate the 6: add param
descriptions + capability-class vet policy, then re-gate") and
`publish/GATE-POLICY.md`, applied to vaultnotes under the same Wave 2
remediation pattern. This is an authorized deviation from the
parity-faithful state: a description was added to every tool
parameter that lacked one, in the `src/mcp.ts` schema literals only —
parameter names, types, required lists and enums are unchanged. The
info-level SCHEMA_NO_PROPERTIES note on the no-arg tool
`list_files_in_vault` is info only, not a deduction, and was left
untouched.

- Descriptions added: 9, across 6 tools — `list_files_in_dir`
  (dirpath), `get_file_contents` (filepath), `search` (query),
  `append_content` (filepath, content), `patch_content` (filepath,
  target, content), `delete_file` (target_filepath). Each description
  was written from the parameter's actual semantics in `src/vault.ts`
  / the zod schemas in `src/mcp.ts`.
- Rebuild: `npm run build` (tsc) exit 0; `tsc --noEmit` exit 0; full
  test suite 19/19 pass (tests 19, pass 19, fail 0).
- Parity harness re-run, verbatim: **PARTIAL, parity_pct 57.1** —
  original_tools=7, rebuild_tools=7, missing=[], extra=[],
  identical_tools=1, schema_differing_tools=6, with 9 schema diffs,
  every one a description addition
  (`*.description: present in rebuild but not in original`); 0
  structural diffs. Full record:
  `publish/parity-remediation/vaultnotes/parity.json`.
- Strip-proof (corrected, coordinator-validated procedure):
  recursively stripping every `description` key from BOTH
  `tools-post.json` and `tools-pre.json` deep-equals —
  strip-both-equal: True. Walk of both lists confirms every
  description present in PRE is byte-identical in POST
  (changed-descriptions: none, removed-descriptions: none;
  pre-description-count: 7, post-description-count: 16), and the
  only additions are the 9 at inputSchema property paths:
  [1].inputSchema.properties.dirpath.description,
  [2].inputSchema.properties.filepath.description,
  [3].inputSchema.properties.query.description,
  [4].inputSchema.properties.filepath.description,
  [4].inputSchema.properties.content.description,
  [5].inputSchema.properties.filepath.description,
  [5].inputSchema.properties.target.description,
  [5].inputSchema.properties.content.description,
  [6].inputSchema.properties.target_filepath.description
  (indices are tools-list order: list_files_in_dir,
  get_file_contents, search, append_content, patch_content,
  delete_file). Full record:
  `publish/parity-remediation/vaultnotes/strip-proof.txt`
  (script: `strip-proof.py`). Adjudication: the description-only
  diffs are the authorized remediation itself; structural parity is
  unchanged.
- Re-gate: not run in this remediation pass — mcpaudit / mcpvet were
  not run and nothing was published, per the remediation brief.
