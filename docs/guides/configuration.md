# Configuration

## Authentication

The BizHub Agent Framework authenticates with your marketplace via one of three methods:

### 1. Auth Cookie (Default)

For browser-session based auth:

```bash
export BIZHUB_AUTH_COOKIE="your-session-cookie-value"
```

The cookie value should be the JWT token stored in the `auth` cookie after logging into the marketplace.

### 2. API Key

For programmatic access:

```bash
export BIZHUB_API_KEY="your-api-key"
```

API keys are sent via the `X-API-Key` header and take precedence over auth cookies.

### 3. Config File

Persist configuration in `~/.bizhub/config.json`:

```json
{
  "apiUrl": "https://your-marketplace.com",
  "authCookie": "your-session-token",
  "apiKey": "your-api-key"
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BIZHUB_API_URL` | `http://localhost:3001` | Base URL of the BizHub marketplace |
| `BIZHUB_AUTH_COOKIE` | — | Session auth cookie value |
| `BIZHUB_API_KEY` | — | API key for programmatic auth |

## Precedence

1. Environment variables take highest priority
2. Config file values are used as fallback
3. Defaults apply if nothing is set

## Verification

Check your configuration:

```bash
npx @bizhub/cli config
```

Expected output:
```
BizHub CLI Configuration

  API URL:    https://your-marketplace.com
  Auth:       configured
  API Key:    not set
```
