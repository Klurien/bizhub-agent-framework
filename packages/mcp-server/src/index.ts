#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BizHubAgent, getConfig } from "@biz-hub/agent-kit";
import { z } from "zod";
import { createHttpTransport } from "./transports/http.js";

const PORT = parseInt(process.env.MCP_PORT || "3100", 10);
const TRANSPORT = (process.env.MCP_TRANSPORT || "stdio") as "stdio" | "http";

const cfg = getConfig();
const agent = new BizHubAgent({ name: "bizhub-mcp", version: "1.0.0" });
agent.loadDefaultTools();

const server = new McpServer(
  {
    name: "BizHub Marketplace",
    version: "1.0.0",
  },
  {
    capabilities: { tools: {} },
  }
);

const tools = agent.getToolDefinitions();

for (const tool of tools) {
  const schema = tool.schema;

  const shape: Record<string, z.ZodTypeAny> = {};
  if (schema._def?.shape) {
    const s = schema._def.shape();
    for (const [key, value] of Object.entries(s)) {
      shape[key] = value as z.ZodTypeAny;
    }
  }

  server.tool(tool.name, tool.description, shape, async (args) => {
    const result = await agent.execute(
      tool.name,
      args as Record<string, unknown>
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            result.data || { error: result.error },
            null,
            2
          ),
        },
      ],
    };
  });
}

console.error(`[bizhub-mcp] Server initialized`);
console.error(`[bizhub-mcp] API: ${cfg.apiUrl}`);
console.error(
  `[bizhub-mcp] Auth: ${cfg.authCookie || cfg.apiKey ? "configured" : "NOT configured"}`
);
console.error(`[bizhub-mcp] Tools: ${tools.length} registered`);

if (TRANSPORT === "http") {
  const httpTransport = createHttpTransport({ port: PORT });
  await server.connect(httpTransport.transport);
  await httpTransport.start();
  console.error(
    `[bizhub-mcp] HTTP transport running on http://localhost:${PORT}/mcp`
  );
} else {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[bizhub-mcp] Stdio transport active`);
}
