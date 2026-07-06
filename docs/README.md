# BizHub Agent Framework — Documentation

```bash
# Quick install
npm install @bizhub/agent-kit
```

## Contents

### 🚀 Getting Started
- [Quick Start](./guides/quick-start.md) — Build your first agent in 5 minutes
- [Configuration](./guides/configuration.md) — API URL, auth, and environment setup
- [Core Concepts](./guides/core-concepts.md) — Agents, Tools, Middleware, Providers

### 📘 API Reference
- [BizHubAgent](./api/agent.md) — The core agent class
- [Tool Registry](./api/tool-registry.md) — Register, execute, and compose tools
- [Built-in Tools](./api/tools.md) — All 17 marketplace tools
- [Middleware](./api/middleware.md) — Pipeline: auth, logging, rate limiting, retry
- [Provider Adapters](./api/providers.md) — OpenAI, Anthropic integration
- [API Client](./api/client.md) — Direct HTTP client for the BizHub REST API

### 💡 Examples
- [OpenAI Integration](./examples/openai.md) — Use with GPT-4o function calling
- [Anthropic Integration](./examples/anthropic.md) — Use with Claude tool use
- [Custom Agent](./examples/custom-agent.md) — Build a specialized marketplace agent
- [MCP Server Setup](./examples/mcp.md) — Connect Claude Desktop / Cursor

### 🛠 CLI Reference
- [CLI Commands](./api/cli.md) — Terminal management tool

### 🔌 MCP Server
- [MCP Server API](./api/mcp-server.md) — Protocol server reference
- [MCP Configuration](./guides/mcp-config.md) — Configure for Claude Desktop, Cursor, VS Code

---

## Package Overview

| Package | Description | Install |
|---------|-------------|---------|
| `@bizhub/agent-kit` | Core SDK — build AI agents | `npm install @bizhub/agent-kit` |
| `@bizhub/mcp-server` | MCP protocol server | `npx @bizhub/mcp-server` |
| `@bizhub/cli` | Terminal CLI | `npx @bizhub/cli` |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Your AI Agent                        │
│  (Custom code, Claude, GPT, or terminal)               │
└──────────┬──────────────────────────┬──────────────────┘
           │                          │
     ┌─────▼──────┐           ┌──────▼──────┐
     │ @bizhub/cli │           │@bizhub/mcp  │
     │ Terminal UI │           │ MCP Server  │
     └─────┬──────┘           └──────┬──────┘
           │                         │
           └─────────┬───────────────┘
                     ▼
        ┌────────────────────────────┐
        │     @bizhub/agent-kit      │
        │                            │
        │  ┌──────────────────────┐  │
        │  │   BizHubAgent        │  │
        │  │   - ToolRegistry     │  │
        │  │   - Middleware chain │  │
        │  │   - Provider adapters│  │
        │  └──────────────────────┘  │
        │                            │
        │  ┌──────────────────────┐  │
        │  │   BizHubClient       │  │
        │  │   (REST API Client)  │  │
        │  └──────────────────────┘  │
        └──────────┬─────────────────┘
                   ▼
        ┌──────────────────────┐
        │   BizHub API         │
        │   (Your Marketplace) │
        └──────────────────────┘
```
