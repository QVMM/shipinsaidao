#!/bin/sh
export TUNNEL_URL=http://127.0.0.1:4173
exec /workspace/tihua-trace/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:4173
