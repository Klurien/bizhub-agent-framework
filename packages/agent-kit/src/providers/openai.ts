import type { ProviderAdapter, ToolDefinition } from "../types.js";

/**
 * OpenAI function calling adapter.
 * Formats BizHub tools as OpenAI-compatible function definitions
 * and parses response tool calls.
 */
export const openAIAdapter: ProviderAdapter = {
  formatTools(tools: ToolDefinition[]) {
    return tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        strict: true,
        parameters: {
          type: "object",
          properties: extractProperties(t.schema),
          additionalProperties: false,
          ...extractRequired(t.schema),
        },
      },
    }));
  },

  parseResult(result: any) {
    if (result?.type === "function" && result.function) {
      return {
        toolName: result.function.name,
        args: JSON.parse(result.function.arguments),
      };
    }
    if (result?.tool_calls?.[0]) {
      const call = result.tool_calls[0];
      return {
        toolName: call.function.name,
        args: JSON.parse(call.function.arguments),
      };
    }
    return null;
  },
};

function extractProperties(schema: any): Record<string, any> {
  if (schema._def?.shape) {
    const shape = schema._def.shape();
    const props: Record<string, any> = {};
    for (const [key, value] of Object.entries(shape)) {
      props[key] = extractZodType(value);
    }
    return props;
  }
  return {};
}

function extractRequired(schema: any): { required?: string[] } {
  if (schema._def?.shape) {
    const shape = schema._def.shape();
    const required = Object.entries(shape)
      .filter(([, v]: [string, any]) => {
        const isOptional =
          v._def?.typeName === "ZodOptional" ||
          v.isOptional?.() ||
          v._def?.defaultValue !== undefined;
        return !isOptional;
      })
      .map(([key]) => key);
    return required.length > 0 ? { required } : {};
  }
  return {};
}

function extractZodType(zodObj: any): any {
  let inner = zodObj;
  let description: string | undefined;
  let defaultVal: any;

  if (inner._def?.description) description = inner._def.description;
  if (inner._def?.defaultValue !== undefined) defaultVal = inner._def.defaultValue;

  // Unwrap optional
  while (inner._def?.typeName === "ZodOptional") {
    inner = inner._def.innerType;
  }

  // Unwrap default
  while (inner._def?.typeName === "ZodDefault") {
    inner = inner._def.innerType;
  }

  const typeName = inner._def?.typeName || "";
  let jsonType: any = {};

  switch (typeName) {
    case "ZodString":
      jsonType = { type: "string" };
      break;
    case "ZodNumber":
      jsonType = { type: "number" };
      if (inner._def?.checks) {
        for (const check of inner._def.checks) {
          if (check.kind === "min") jsonType.minimum = check.value;
          if (check.kind === "max") jsonType.maximum = check.value;
          if (check.kind === "positive") jsonType.exclusiveMinimum = 0;
        }
      }
      break;
    case "ZodBoolean":
      jsonType = { type: "boolean" };
      break;
    case "ZodArray":
      jsonType = {
        type: "array",
        items: extractZodType(inner._def.type),
      };
      break;
    case "ZodEnum":
      jsonType = {
        type: "string",
        enum: inner._def.values,
      };
      break;
    default:
      jsonType = { type: "string" };
  }

  if (description) jsonType.description = description;
  if (defaultVal !== undefined) jsonType.default = defaultVal;

  return jsonType;
}
