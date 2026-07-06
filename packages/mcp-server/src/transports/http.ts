import http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpSessionStore } from "./session-store.js";

export interface HttpTransportConfig {
  port: number;
  sessionStore?: McpSessionStore;
  enableJsonResponse?: boolean;
  retryInterval?: number;
}

export function createHttpTransport(config: HttpTransportConfig) {
  const sessionStore = config.sessionStore || new McpSessionStore();

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => {
      const session = sessionStore.create();
      return session.id;
    },
    onsessioninitialized: (sessionId: string) => {
      const session = sessionStore.get(sessionId);
      if (session) {
        session.metadata.initializedAt = Date.now();
      }
    },
    onsessionclosed: (sessionId: string) => {
      sessionStore.delete(sessionId);
    },
    enableJsonResponse: config.enableJsonResponse ?? true,
    retryInterval: config.retryInterval,
  });

  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "POST, GET, DELETE, OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Mcp-Session-Id, Accept, Last-Event-ID"
    );

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      await transport.handleRequest(req, res);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Internal server error";
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
  });

  return {
    transport,
    server,
    start: () =>
      new Promise<void>((resolve) => {
        server.listen(config.port, () => {
          resolve();
        });
      }),
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
    sessionStore,
  };
}
