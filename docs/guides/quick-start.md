# Quick Start

Build your first BizHub AI agent in 5 minutes.

## 1. Install

```bash
npm install @bizhub/agent-kit
```

## 2. Configure

Set your marketplace API URL and authentication:

```bash
export BIZHUB_API_URL=https://your-marketplace.com
export BIZHUB_AUTH_COOKIE="your-session-token"
```

Or create `~/.bizhub/config.json`:

```json
{
  "apiUrl": "https://your-marketplace.com",
  "authCookie": "your-session-token"
}
```

## 3. Create an Agent

```typescript
import { BizHubAgent } from "@bizhub/agent-kit";

// Create the agent with all built-in marketplace tools
const agent = new BizHubAgent({ name: "store-manager" });
agent.loadDefaultTools();
```

## 4. Execute Tools

```typescript
// List pending orders
const orders = await agent.execute("orders_list", {
  status: "pending",
  limit: 10,
});
console.log(orders);

// Get store analytics
const analytics = await agent.execute("analytics_get", {});
console.log(`Revenue: $${analytics.data.totalRevenue}`);

// Apply a discount
const discount = await agent.execute("discounts_apply", {
  slug: "wireless-headphones",
  percent: 20,
});
console.log(`${discount.data.product}: ${discount.data.percentOff}% OFF`);
```

## 5. Integrate with an LLM

### OpenAI

```typescript
import OpenAI from "openai";

const openai = new OpenAI();
const tools = agent.getOpenAITools();

const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Show me my pending orders" }],
  tools,
  tool_choice: "auto",
});
```

### Anthropic Claude

```typescript
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();
const tools = agent.getAnthropicTools();

const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  messages: [{ role: "user", content: "What's my revenue?" }],
  tools,
});
```

## 6. Connect Claude Desktop (MCP)

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bizhub": {
      "command": "npx",
      "args": ["-y", "@bizhub/mcp-server"],
      "env": {
        "BIZHUB_API_URL": "https://your-marketplace.com",
        "BIZHUB_AUTH_COOKIE": "your-session-token"
      }
    }
  }
}
```

Restart Claude Desktop. Now you can ask:

> *"List my pending orders"*
> *"Show me which products are low on stock"*
> *"Apply 20% off to all electronics"*

## What's Next?

- [Core Concepts](./core-concepts.md) — Understand agents, tools, and middleware
- [API Reference](../api/agent.md) — Full API documentation
- [Examples](../examples/openai.md) — More integration examples
