import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const ACCOUNT_ID = "990b6325961454fd7aa4445d24fd383e";

function getToken(): string {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  try {
    const tomlPath = join(homedir(), "Library", "Preferences", ".wrangler", "config", "default.toml");
    const toml = readFileSync(tomlPath, "utf8");
    const match = toml.match(/oauth_token\s*=\s*"([^"]+)"/);
    if (match) return match[1];
  } catch {}
  throw new Error("No Cloudflare token found. Set CLOUDFLARE_API_TOKEN or run: wrangler login");
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? ACCOUNT_ID;

const server = new McpServer({
  name: "cloudflare-kv-eu",
  version: "1.0.0",
});

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true as const };
}

async function cfFetch(
  method: string,
  path: string,
  body?: unknown,
  contentType: string = "application/json"
): Promise<unknown> {
  const token = getToken();
  const url = `https://api.cloudflare.com/client/v4${path}`;
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
    },
  };

  if (body) {
    if (contentType === "text/plain") {
      init.body = body as string;
    } else {
      init.body = JSON.stringify(body);
    }
  }

  const res = await fetch(url, init);

  // For text responses, return raw text
  if (contentType === "text/plain" || !res.headers.get("content-type")?.includes("application/json")) {
    const text = await res.text();
    if (!res.ok) throw new Error(`API error: ${res.statusText}`);
    return text;
  }

  const data = (await res.json()) as {
    success?: boolean;
    errors?: Array<{ message: string }>;
  };

  if (!res.ok || !data.success) {
    const errorMsg =
      data.errors?.[0]?.message || `API error: ${res.statusText}`;
    throw new Error(errorMsg);
  }

  return data;
}

server.tool(
  "kv_list_namespaces",
  "List all KV namespaces",
  {
    page: z.number().optional(),
    per_page: z.number().optional(),
    order: z.enum(["id", "title"]).optional(),
    direction: z.enum(["asc", "desc"]).optional(),
  },
  async (params) => {
    try {
      const searchParams = new URLSearchParams();
      if (params.page) searchParams.append("page", String(params.page));
      if (params.per_page) searchParams.append("per_page", String(params.per_page));
      if (params.order) searchParams.append("order", params.order);
      if (params.direction) searchParams.append("direction", params.direction);

      const query = searchParams.toString();
      const path = `/accounts/${accountId}/storage/kv/namespaces${query ? `?${query}` : ""}`;
      const data = await cfFetch("GET", path);
      return json(data);
    } catch (e) {
      return err(e);
    }
  }
);

server.tool(
  "kv_create_namespace",
  "Create a KV namespace",
  {
    title: z.string(),
  },
  async (params) => {
    try {
      const path = `/accounts/${accountId}/storage/kv/namespaces`;
      const data = await cfFetch("POST", path, { title: params.title });
      return json(data);
    } catch (e) {
      return err(e);
    }
  }
);

server.tool(
  "kv_get_namespace",
  "Get namespace details",
  {
    namespace_id: z.string(),
  },
  async (params) => {
    try {
      const path = `/accounts/${accountId}/storage/kv/namespaces/${params.namespace_id}`;
      const data = await cfFetch("GET", path);
      return json(data);
    } catch (e) {
      return err(e);
    }
  }
);

server.tool(
  "kv_update_namespace",
  "Update namespace title",
  {
    namespace_id: z.string(),
    title: z.string(),
  },
  async (params) => {
    try {
      const path = `/accounts/${accountId}/storage/kv/namespaces/${params.namespace_id}`;
      const data = await cfFetch("PUT", path, { title: params.title });
      return json(data);
    } catch (e) {
      return err(e);
    }
  }
);

server.tool(
  "kv_delete_namespace",
  "Delete a namespace",
  {
    namespace_id: z.string(),
  },
  async (params) => {
    try {
      const path = `/accounts/${accountId}/storage/kv/namespaces/${params.namespace_id}`;
      const data = await cfFetch("DELETE", path);
      return json(data);
    } catch (e) {
      return err(e);
    }
  }
);

server.tool(
  "kv_list_keys",
  "List keys in a namespace",
  {
    namespace_id: z.string(),
    prefix: z.string().optional(),
    limit: z.number().optional(),
    cursor: z.string().optional(),
  },
  async (params) => {
    try {
      const searchParams = new URLSearchParams();
      if (params.prefix) searchParams.append("prefix", params.prefix);
      if (params.limit) searchParams.append("limit", String(params.limit));
      if (params.cursor) searchParams.append("cursor", params.cursor);

      const query = searchParams.toString();
      const path = `/accounts/${accountId}/storage/kv/namespaces/${params.namespace_id}/keys${query ? `?${query}` : ""}`;
      const data = await cfFetch("GET", path);
      return json(data);
    } catch (e) {
      return err(e);
    }
  }
);

server.tool(
  "kv_get_value",
  "Get a value from a namespace",
  {
    namespace_id: z.string(),
    key_name: z.string(),
  },
  async (params) => {
    try {
      const path = `/accounts/${accountId}/storage/kv/namespaces/${params.namespace_id}/values/${encodeURIComponent(params.key_name)}`;
      const value = await cfFetch("GET", path, undefined, "text/plain");
      return { content: [{ type: "text" as const, text: String(value) }] };
    } catch (e) {
      return err(e);
    }
  }
);

server.tool(
  "kv_put_value",
  "Set a value in a namespace",
  {
    namespace_id: z.string(),
    key_name: z.string(),
    value: z.string(),
    expiration: z.number().optional(),
    expiration_ttl: z.number().optional(),
  },
  async (params) => {
    try {
      const searchParams = new URLSearchParams();
      if (params.expiration) searchParams.append("expiration", String(params.expiration));
      if (params.expiration_ttl) searchParams.append("expiration_ttl", String(params.expiration_ttl));

      const query = searchParams.toString();
      const path = `/accounts/${accountId}/storage/kv/namespaces/${params.namespace_id}/values/${encodeURIComponent(params.key_name)}${query ? `?${query}` : ""}`;
      const data = await cfFetch("PUT", path, params.value, "text/plain");
      return json(data);
    } catch (e) {
      return err(e);
    }
  }
);

server.tool(
  "kv_delete_key",
  "Delete a key from a namespace",
  {
    namespace_id: z.string(),
    key_name: z.string(),
  },
  async (params) => {
    try {
      const path = `/accounts/${accountId}/storage/kv/namespaces/${params.namespace_id}/values/${encodeURIComponent(params.key_name)}`;
      const data = await cfFetch("DELETE", path);
      return json(data);
    } catch (e) {
      return err(e);
    }
  }
);

server.tool(
  "kv_status",
  "Show server config and connection info",
  {},
  async () => {
    try {
      const src = process.env.CLOUDFLARE_API_TOKEN ? "env:CLOUDFLARE_API_TOKEN" : "wrangler-oauth";
      return json({
        server: "cloudflare-kv-eu",
        version: "1.0.0",
        accountId,
        tokenSource: src,
      });
    } catch (e) {
      return err(e);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Cloudflare KV MCP (mobicycle-eu) running on stdio");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
