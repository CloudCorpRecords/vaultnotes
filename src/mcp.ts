/**
 * vaultnotes MCP server. Tools: list_files_in_vault, list_files_in_dir,
 * get_file_contents, search, append_content, patch_content, delete_file.
 *
 * Why the low-level Server instead of McpServer: the high-level helper
 * converts zod schemas to JSON Schema and injects keys that are not in
 * this tool's public spec ("$schema" and "additionalProperties"), which
 * breaks exact tool-list/schema parity with the spec. This file serves
 * tools/list with the spec's exact input schemas as explicit literals,
 * while zod still validates every tools/call argument set.
 *
 * The vault root is resolved lazily by the core on each call (explicit
 * setting, then the VAULTNOTES_DIR env var, then the cwd), so the
 * server starts and lists its tools even before a vault is chosen;
 * calls against a missing vault error cleanly instead.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  appendContent,
  deleteFile,
  getFileContents,
  listFilesInDir,
  listFilesInVault,
  patchContent,
  searchVault,
  VERSION,
} from "./vault.js";

const NoArgs = z.object({});
const DirpathArgs = z.object({ dirpath: z.string() });
const FilepathArgs = z.object({ filepath: z.string() });
const SearchArgs = z.object({ query: z.string() });
const AppendArgs = z.object({ filepath: z.string(), content: z.string() });
const PatchArgs = z.object({
  filepath: z.string(),
  target: z.string(),
  content: z.string(),
});
const DeleteArgs = z.object({ target_filepath: z.string() });

const TOOLS = [
  {
    name: "list_files_in_vault",
    description: "List all files in the vault.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "list_files_in_dir",
    description: "List all files in a specific directory of the vault.",
    inputSchema: {
      type: "object" as const,
      properties: {
        dirpath: {
          type: "string",
          description: "Vault-relative path to the directory to list files under, recursively.",
        },
      },
      required: ["dirpath"],
    },
  },
  {
    name: "get_file_contents",
    description: "Get the contents of a file in the vault.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filepath: {
          type: "string",
          description: "Vault-relative path to the file to read as UTF-8 text.",
        },
      },
      required: ["filepath"],
    },
  },
  {
    name: "search",
    description: "Search for a query across the markdown files in the vault.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search text to match case-insensitively as a substring across the vault's markdown files.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "append_content",
    description: "Append content to a file in the vault, creating the file if it does not exist.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filepath: {
          type: "string",
          description: "Vault-relative path to the file to append to, creating the file and any parent directories if it does not exist.",
        },
        content: {
          type: "string",
          description: "Text content to append to the end of the file.",
        },
      },
      required: ["filepath", "content"],
    },
  },
  {
    name: "patch_content",
    description: "Replace the first occurrence of a target text in a vault file with new content.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filepath: {
          type: "string",
          description: "Vault-relative path to the file to patch.",
        },
        target: {
          type: "string",
          description: "Exact target text to find in the file; only its first occurrence is replaced, and the patch fails if it is not present.",
        },
        content: {
          type: "string",
          description: "Replacement text to substitute for the first occurrence of the target text.",
        },
      },
      required: ["filepath", "target", "content"],
    },
  },
  {
    name: "delete_file",
    description: "Delete a file from the vault.",
    inputSchema: {
      type: "object" as const,
      properties: {
        target_filepath: {
          type: "string",
          description: "Vault-relative path to the file to delete; directories are refused.",
        },
      },
      required: ["target_filepath"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "vaultnotes", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case "list_files_in_vault":
        NoArgs.parse(args ?? {});
        return textResult(await listFilesInVault());
      case "list_files_in_dir": {
        const p = DirpathArgs.parse(args ?? {});
        return textResult(await listFilesInDir(p.dirpath));
      }
      case "get_file_contents": {
        const p = FilepathArgs.parse(args ?? {});
        return textResult(await getFileContents(p.filepath));
      }
      case "search": {
        const p = SearchArgs.parse(args ?? {});
        return textResult(await searchVault(p.query));
      }
      case "append_content": {
        const p = AppendArgs.parse(args ?? {});
        return textResult(await appendContent(p.filepath, p.content));
      }
      case "patch_content": {
        const p = PatchArgs.parse(args ?? {});
        return textResult(await patchContent(p.filepath, p.target, p.content));
      }
      case "delete_file": {
        const p = DeleteArgs.parse(args ?? {});
        return textResult(await deleteFile(p.target_filepath));
      }
    }
  } catch (err) {
    return errorResult(err);
  }
  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
