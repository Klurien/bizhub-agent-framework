import type { ProviderAdapter, ToolDefinition } from "../types.js";

/**
 * Anthropic Claude tool use adapter.
 * Formats BizHub tools as Anthropic-compatible tool definitions
 * and parses response tool use blocks.
 */
export const anthropicAdapter: ProviderAdapter = {
  formatTools(tools: ToolDefinition[]) {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: "object",
        properties: extractProperties(t.schema),
        ...extractRequired(t.schema),
      },
    }));
  },

  parseResult(result: any) {
    // Anthropic tool_use content blocks
    if (result?.type === "tool_use") {
      return {
        toolName: result.name,
        args: result.input,
      };
    }
    // Content array with tool_use
    if (result?.content) {
      for (const block of result.content) {
        if (block.type === "tool_use") {
          return {
            toolName: block.name,
            args: block.input,
          };
        }
      }
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

  while (inner._def?.typeName === "ZodOptional") inner = inner._def.innerType;
  while (inner._def?.typeName === "ZodDefault") inner = inner._def.innerType;

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
        }
      }
      break;
    case "ZodBoolean":
      jsonType = { type: "boolean" };
      break;
    case "ZodArray":
      jsonType = { type: "array", items: extractZodType(inner._def.type) };
      break;
    case "ZodEnum":
      jsonType = { type: "string", enum: inner._def.values };
      break;
    default:
      jsonType = { type: "string" };
  }

  if (description) jsonType.description = description;
  if (defaultVal !== undefined) jsonType.default = defaultVal;

  return jsonType;
}
