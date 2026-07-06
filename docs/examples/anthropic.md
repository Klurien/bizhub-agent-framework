# Anthropic Claude Integration

Full example of integrating `@bizhub/agent-kit` with Claude (claude-sonnet-4-20250514 or claude-3-5-sonnet-latest).

## Prerequisites

```bash
npm install @anthropic-ai/sdk @bizhub/agent-kit
export ANTHROPIC_API_KEY="sk-ant-..."
export BIZHUB_API_URL="https://your-marketplace.com"
export BIZHUB_AUTH_COOKIE="your-session-token"
```

## Basic Chat Agent

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { BizHubAgent } from "@bizhub/agent-kit";

const agent = new BizHubAgent({ name: "claude-store-agent" });
agent.loadDefaultTools();

const anthropic = new Anthropic();

async function chat(userMessage: string) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: `You are a marketplace management assistant with tools for:
- Managing products (list, get, create, update, delete)
- Managing orders (list, get, update status)
- Managing inventory (list, update stock)
- Managing discounts (apply, remove, list)
- Viewing analytics and customer data
- Looking up categories and stores

Always confirm before destructive actions. Present data clearly.`,
    messages: [
      { role: "user", content: userMessage },
    ],
    tools: agent.getAnthropicTools(),
  });

  // Handle tool calls
  for (const content of response.content) {
    if (content.type === "tool_use") {
      const result = await agent.execute(
        content.name,
        content.input as Record<string, unknown>
      );

      // Send result back to Claude
      const followUp = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [
          { role: "user", content: userMessage },
          { role: "assistant", content: response.content },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: content.id,
                content: JSON.stringify(result.data ?? result.error),
              },
            ],
          },
        ],
        tools: agent.getAnthropicTools(),
      });

      return followUp.content;
    }
  }

  return response.content;
}

// Example
const result = await chat("What's my revenue this month?");
console.log(result);
```

## Multi-Tool Workflow

```typescript
async function applySeasonalDiscounts() {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: "You are a promotional management assistant.",
    messages: [
      {
        role: "user",
        content:
          "List all categories, then for the 'electronics' category find " +
          "products and apply 15% off to the first 3 items",
      },
    ],
    tools: agent.getAnthropicTools(),
  });

  for (const block of response.content) {
    if (block.type === "tool_use") {
      const result = await agent.execute(
        block.name,
        block.input as Record<string, unknown>
      );
      console.log(`${block.name}:`, result);
    }
  }
}
```

## Error Handling

```typescript
async function chatWithErrorHandling(message: string) {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: message }],
      tools: agent.getAnthropicTools(),
    });

    for (const block of response.content) {
      if (block.type === "tool_use") {
        const result = await agent.execute(
          block.name,
          block.input as Record<string, unknown>
        );

        if (!result.success) {
          console.error(`Tool ${block.name} failed: ${result.error}`);
          // Handle gracefully — don't crash
        }
      }
    }
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error("Anthropic API error:", error.message);
    } else {
      console.error("Unexpected error:", error);
    }
  }
}
```
