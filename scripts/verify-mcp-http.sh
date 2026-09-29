#!/usr/bin/env bash
# End-to-end check of the BizHub MCP HTTP transport against the live marketplace.
#
# KNOWN LIMITATION: the HTTP transport in @biz-hub/mcp-server keeps a single
# server instance. Once a client has called `initialize`, any further
# `initialize` is rejected with -32600 "Server already initialized" until the
# process restarts. This script therefore verifies one session per run:
#   pm2 restart bizhub-mcp && ./scripts/verify-mcp-http.sh
# The stdio transport (what Claude Desktop uses) has no such limitation and
# supports concurrent clients.
set -uo pipefail
URL="${1:-http://localhost:3100/mcp}"
CT="Content-Type: application/json"
AC="Accept: application/json, text/event-stream"

hdr=$(mktemp)
curl -s -D "$hdr" -o /dev/null --max-time 25 -X POST "$URL" \
  -H "$CT" -H "$AC" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"verify","version":"1.0"}}}'

SID=$(grep -i '^mcp-session-id:' "$hdr" | tr -d '\r' | awk '{print $2}')
rm -f "$hdr"

if [ -z "$SID" ]; then
  echo "FAIL: initialize returned no Mcp-Session-Id."
  echo "      If the body said 'Server already initialized', restart first:"
  echo "        pm2 restart bizhub-mcp"
  exit 1
fi
echo "session established: $SID"

curl -s --max-time 20 -X POST "$URL" -H "$CT" -H "$AC" -H "Mcp-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}' >/dev/null

echo "--- tools/call analytics_get ---"
curl -s --max-time 45 -X POST "$URL" -H "$CT" -H "$AC" -H "Mcp-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"analytics_get","arguments":{}}}' \
  | python3 -c "
import sys, json
raw = sys.stdin.read()
try:
    d = json.loads(raw)
except Exception:
    print('FAIL: non-JSON response:', raw[:200]); raise SystemExit(1)
if 'error' in d:
    print('FAIL:', d['error']); raise SystemExit(1)
print('OK:', d['result']['content'][0]['text'][:200])
"
