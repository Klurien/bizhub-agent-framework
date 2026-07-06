# BizHubClient API

The `BizHubClient` is a lightweight HTTP client for the BizHub marketplace REST API. It handles authentication, request/response serialization, and error handling.

## Constructor

```typescript
import { BizHubClient } from "@bizhub/agent-kit";

const client = new BizHubClient({
  baseUrl?: string,       // API base URL (default: env var or config file)
  authCookie?: string,    // Session auth cookie (default: env var or config file)
  apiKey?: string,        // API key (default: env var)
  timeout?: number,       // Request timeout in ms (default: 30000)
});
```

## Configuration Resolution

Priority: explicit parameter > environment variable > config file > default

| Parameter | Env Var | Config File | Default |
|-----------|---------|-------------|---------|
| `baseUrl` | `BIZHUB_API_URL` | `apiUrl` | `http://localhost:3001` |
| `authCookie` | `BIZHUB_AUTH_COOKIE` | `authCookie` | — |
| `apiKey` | `BIZHUB_API_KEY` | `apiKey` | — |

## Methods

### `get<T>(path, params?)`

```typescript
const products = await client.get("/api/products", {
  category: "electronics",
  limit: "20",
});
```

### `post<T>(path, body?)`

```typescript
const newProduct = await client.post("/api/products", {
  name: "Wireless Headphones",
  price: 79.99,
});
```

### `patch<T>(path, body?)`

```typescript
const updated = await client.patch("/api/products/wireless-headphones", {
  price: 69.99,
});
```

### `delete<T>(path)`

```typescript
await client.delete("/api/products/wireless-headphones");
```

## Authentication

The client automatically adds the appropriate auth header:

- **Auth Cookie**: Adds `Cookie: auth=<cookie>` header
- **API Key**: Adds `X-API-Key: <key>` header
- API key takes precedence if both are set

## Error Handling

The client wraps errors consistently:

```typescript
try {
  const result = await client.get("/api/products");
} catch (error) {
  if (error instanceof BizHubClientError) {
    console.error(error.statusCode);  // HTTP status
    console.error(error.message);      // Error description
    console.error(error.body);         // Response body if available
  }
}
```

### BizHubClientError

| Property | Description |
|----------|-------------|
| `statusCode` | HTTP status code |
| `message` | Error message |
| `body` | Parsed response body |
| `cause` | Original error |

## Types

```typescript
type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface ClientConfig {
  baseUrl?: string;
  authCookie?: string;
  apiKey?: string;
  timeout?: number;
}

class BizHubClientError extends Error {
  statusCode: number;
  body?: unknown;
}

class BizHubClient {
  constructor(config?: ClientConfig);
  get<T>(path: string, params?: Record<string, string>): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  delete<T>(path: string): Promise<T>;
}
```
