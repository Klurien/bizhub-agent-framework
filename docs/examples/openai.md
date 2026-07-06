# OpenAI Integration

Full example of integrating `@bizhub/agent-kit` with OpenAI's GPT-4o to create a conversational store management assistant.

## Prerequisites

```bash
npm install openai @bizhub/agent-kit
export OPENAI_API_KEY="sk-..."
export BIZHUB_API_URL="https://your-marketplace.com"
export BIZHUB_AUTH_COOKIE="your-session-token"
```

## Basic Chat Agent

```typescript
import OpenAI from "openai";
import { BizHubAgent, openAIAdapter } from "@bizhub/agent-kit";

const agent = new BizHubAgent({ name: "store-assistant" });
agent.loadDefaultTools();

const openai = new OpenAI();

// Enable audit trail
import { audit } from "@bizhub/agent-kit";
agent.middleware(audit({ persist: true }));

async function chat(userMessage: string): Promise<string> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are a marketplace management assistant. You have access to tools for
managing products, orders, inventory, discounts, and analytics.

Rules:
1. Always confirm before destructive actions (delete products, refund orders)
2. For listing commands, show results in a readable format
3. If a tool fails, explain the error to the user clearly
4. Use categories_list to find the right category slug before creating products`,
    },
    { role: "user", content: userMessage },
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    tools: agent.getOpenAITools(),
    tool_choice: "auto",
  });

  const message = response.choices[0].message;

  if (message.tool_calls) {
    messages.push(message);

    for (const toolCall of message.tool_calls) {
      const parsed = openAIAdapter.parseResult(
        toolCall.function.name,
        toolCall.function.arguments
      );

      if (!parsed) continue;

      const result = await agent.execute(parsed.toolName, parsed.args);

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result.data ?? { error: result.error }),
      });
    }

    // Get final response
    const finalResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools: agent.getOpenAITools(),
    });

    return finalResponse.choices[0].message.content ?? "";
  }

  return message.content ?? "";
}

// Example usage
async function main() {
  console.log(await chat("Show me the analytics dashboard"));
  console.log(await chat("Which products are low on stock?"));
  console.log(
    await chat("Apply 20% off to all electronics and show me the results")
  );
}

main().catch(console.error);
```

## Streaming Chat

```typescript
async function* streamChat(userMessage: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a helpful marketplace assistant.",
      },
      { role: "user", content: userMessage },
    ],
    tools: agent.getOpenAITools(),
    stream: true,
  });

  for await (const chunk of response) {
    yield chunk.choices[0]?.delta?.content ?? "";
  }
}

// Usage
for await (const text of streamChat("List my pending orders")) {
  process.stdout.write(text);
}
```

## Function Calling Agent (Non-Chat)

For programmatic use without a conversational loop:

```typescript
import { openAIAdapter } from "@bizhub/agent-kit";

// Execute multiple tools in sequence
async function executeWorkflow() {
  // Step 1: Get analytics
  const analytics = await agent.execute("analytics_get", {});
  if (!analytics.success) throw new Error(analytics.error);

  const revenue = analytics.data.totalRevenue;
  const pendingOrders = analytics.data.pendingOrders;

  // Step 2: If revenue is high and there are pending orders, apply a discount
  if (revenue > 10000 && pendingOrders > 5) {
    const products = await agent.execute("products_list", { limit: 5 });
    for (const product of products.data.products) {
      await agent.execute("discounts_apply", {
        slug: product.slug,
        percent: 10,
      });
    }
  }

  console.log("Workflow complete!");
}
```
