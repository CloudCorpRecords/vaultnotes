/**
 * vaultnotes types.
 *
 * Every tool works on vault-relative paths: a path is always read as
 * relative to the vault root, and listings report paths in that same
 * relative form (with forward slashes). A search yields one match per
 * matching line: the file it was found in, the line number, and the
 * line itself as the snippet.
 */

export interface SearchMatch {
  /** Vault-relative path of the file containing the match. */
  filepath: string;
  /** 1-based line number of the matching line. */
  line: number;
  /** The matching line, trimmed, shortened to a readable excerpt. */
  snippet: string;
}
