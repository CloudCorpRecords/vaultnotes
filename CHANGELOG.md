# Changelog

## 0.1.0 (2026-10-26)

- Initial release.
- Local vault mode: all tools operate on a plain directory of files on
  disk — no running note-taking app or plugin API required. The vault
  is chosen by `--vault`, the `VAULTNOTES_DIR` environment variable,
  or the current working directory, in that order.
- CLI: `list`, `list-dir`, `read`, `search`, `append`, `patch`, and
  `delete`, mirroring the MCP tools.
- MCP server (`vaultnotes mcp`, stdio) with seven tools:
  `list_files_in_vault`, `list_files_in_dir`, `get_file_contents`,
  `search`, `append_content`, `patch_content`, and `delete_file`.
- Every path is scoped inside the vault: `..` escapes, outside
  absolute paths, and symlinks out of the vault are rejected.
- `patch_content` targeting is exact-text (first occurrence), and a
  missing target is an error rather than a silent no-op.
