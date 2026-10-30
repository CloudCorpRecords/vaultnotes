# vaultnotes

vaultnotes is a small set of tools for working with a vault of notes
stored as plain files in a folder on your own disk: list what is in
the vault, read a note, search across the markdown files, and append
to, patch, or delete a note. It runs from the command line or as an
MCP server for agents.

**Local mode.** vaultnotes works directly on a local directory. It
does not need a running note-taking application or a plugin API: point
it at the folder that holds your notes and every tool operates on the
files there. Paths are always vault-relative, and anything that would
resolve outside the vault — `..` escapes, absolute paths elsewhere,
symlinks pointing out — is refused before a file is touched.

## Install

```bash
npx @reneturcios/vaultnotes list --vault ~/notes
```

Or run the container image:

```bash
docker run -i ghcr.io/cloudcorprecords/vaultnotes
```

The container defaults to the MCP server (see below). Pass CLI
arguments to use it as a CLI instead.

## Choosing the vault

The vault directory is resolved in this order:

1. the `--vault <dir>` flag on the command line,
2. the `VAULTNOTES_DIR` environment variable,
3. the current working directory.

## CLI

```bash
vaultnotes list --vault ~/notes                 # every file in the vault
vaultnotes list-dir projects --vault ~/notes    # files under one directory
vaultnotes read projects/alpha.md --vault ~/notes
vaultnotes search "launch checklist" --vault ~/notes
vaultnotes append inbox.md "Call Sam on Tuesday." --vault ~/notes
vaultnotes patch inbox.md "Tuesday" "Wednesday" --vault ~/notes
vaultnotes delete drafts/old.md --vault ~/notes

vaultnotes --version
```

Exit codes: `0` on success, `1` when an operation fails (the error
names the problem), `2` for usage errors.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio MCP
server:

```bash
npx -y @reneturcios/vaultnotes mcp
```

MCP client configuration (set the vault with the environment):

```json
{
  "mcpServers": {
    "vaultnotes": {
      "command": "npx",
      "args": ["-y", "@reneturcios/vaultnotes", "mcp"],
      "env": { "VAULTNOTES_DIR": "/path/to/your/notes" }
    }
  }
}
```

The server starts and lists its tools even when no vault has been
configured yet; the vault is resolved per call and a missing vault
produces a tool error rather than a crash.

### Tools

| Tool | Input | What it returns |
| --- | --- | --- |
| `list_files_in_vault` | _(no arguments)_ | Every file in the vault, as vault-relative paths. |
| `list_files_in_dir` | `dirpath` (string, required) | Every file under that vault directory, as vault-relative paths. |
| `get_file_contents` | `filepath` (string, required) | The file's contents as text. |
| `search` | `query` (string, required) | Case-insensitive substring matches across the vault's `.md` files: for each match, the filepath, the line number, and the matching line as a snippet. |
| `append_content` | `filepath` (string, required), `content` (string, required) | Appends the content to the file, creating the file (and parent folders) when it does not exist yet. |
| `patch_content` | `filepath` (string, required), `target` (string, required), `content` (string, required) | Replaces the first occurrence of the exact target text with the new content; an error when the target text is not in the file. |
| `delete_file` | `target_filepath` (string, required) | Deletes the file. Directories are refused. |

A note on `patch_content`: targeting here is exact-text — the target
is the literal passage to replace, not a heading name or a block
reference. That keeps a patch unambiguous: it either finds the exact
text once and replaces it, or it fails and changes nothing.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, real fs in temp dirs, no network
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.
