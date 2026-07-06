# Provider Adapters

Provider adapters convert BizHub tools into the formats required by different LLM providers, and parse their responses back into tool calls.

## OpenAI Adapter

Converts tools to OpenAI's [function calling](https://platform.openai.com/docs/guides/function-calling) format with strict schema mode.

### Format

```typescript
import { openAIAdapter, type ToolDefinition } from "@bizhub/agent-kit";

const tools: ToolDefinition[] = agent.getToolDefinitions();
const openaiFormatted = openAIAdapter.formatTools(tools);
```

Output format:
```json
[{
  "type": "function",
  "function": {
    "name": "products_list",
    "description": "List products...",
    "strict": true,
    "parameters": {
      "type": "object",
      "properties": {
        "category": { "type": "string", "description": "..." },
        "limit": { "type": "number", "default": 50 }
      },
      "additionalProperties": false,
      "required": []
    }
  }
}]
```

### Parse Response

```typescript
const openaiResponse = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [...],
  tools: openaiFormatted,
  tool_choice: "auto",
});

const call = openaiAdapter.parseResult(openaiResponse.choices[0].message);
if (call) {
  const result = await agent.execute(call.toolName, call.args);
}
```

### Full Integration

```typescript
import OpenAI from "openai";
import { BizHubAgent, openAIAdapter } from "@bizhub/agent-kit";

const agent = new BizHubAgent({ name: "shopify-agent" });
agent.loadDefaultTools();

const openai = new OpenAI();

async function chat(userMessage: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a marketplace management assistant." },
      { role: "user", content: userMessage },
    ],
    tools: agent.getOpenAITools(),
    tool_choice: "auto",
  });

  const message = response.choices[0].message;

  if (message.tool_calls) {
    for (const call of message.tool_calls) {
      const parsed = openAIAdapter.parseResult(call);
      if (parsed) {
        const result = await agent.execute(parsed.toolName, parsed.args);
        console.log(`${call.function.name}:`, result);
      }
    }
  } else {
    console.log(message.content);
  }
}

await chat("List my pending orders and apply 20% off to wireless-headphones");
```

## Anthropic Adapter

Converts tools to Anthropic's [tool use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) format.

### Format

```typescript
import { anthropicAdapter } from "@bizhub/agent-kit";

const anthropicFormatted = anthropicAdapter.formatTools(agent.getToolDefinitions());
```

Output format:
```json
[{
  "name": "products_list",
  "description": "List products...",
  "input_schema": {
    "type": "object",
    "properties": {
      "category": { "type": "string" },
      "limit": { "type": "number", "default": 50 }
    }
  }
}]
```

### Parse Response

```typescript
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  system: "You are a marketplace management assistant.",
  messages: [{ role: "user", content: "Show me my store analytics" }],
  tools: anthropicFormatted,
});

for (const block of response.content) {
  const parsed = anthropicAdapter.parseResult(block);
  if (parsed) {
    const result = await agent.execute(parsed.toolName, parsed.args);
  }
}
```

## Adapter Interface

```typescript
interface ProviderAdapter {
  formatTools(tools: ToolDefinition[]): unknown[];
  parseResult(result: unknown): {
    toolName: string;
    args: Record<string, unknown>;
  } | null;
}
```

Implement this interface to add support for other providers (Google Gemini, Cohere, etc.).
