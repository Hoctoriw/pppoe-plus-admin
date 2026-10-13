#!/usr/bin/env bash
# Syncron Bridge — executa no MikroTik da rede local os comandos enviados pelo painel.
set -u
. /opt/nexora/env
API="$PANEL_URL/api/public/radius"
while true; do
  LIST=$(curl -fsS --max-time 15 -H "Authorization: Bearer $TOKEN" "$API/commands" 2>/dev/null || true)
  if [ -n "$LIST" ]; then
    while IFS=$'\t' read -r ID METHOD URL AUTH BODY; do
      [ -z "${ID:-}" ] && continue
      ARGS=(-sk --max-time 12 -o /tmp/nexora-bridge.out -w '%{http_code}' -X "$METHOD" -H "Authorization: Basic $AUTH" -H "Content-Type: application/json")
      if [ -n "${BODY:-}" ]; then echo "$BODY" | base64 -d > /tmp/nexora-bridge.in; ARGS+=(--data-binary @/tmp/nexora-bridge.in); fi
      : > /tmp/nexora-bridge.out
      CODE=$(curl "${ARGS[@]}" "$URL" 2>/tmp/nexora-bridge.err) || CODE=0
      [ "$CODE" = "000" ] && CODE=0
      if [ "$CODE" = 0 ]; then RES=$(base64 -w0 /tmp/nexora-bridge.err); else RES=$(base64 -w0 /tmp/nexora-bridge.out); fi
      printf '{"id":"%s","http_status":%s,"result":"%s"}' "$ID" "$CODE" "$RES" > /tmp/nexora-bridge.res
      curl -fsS --max-time 20 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -X POST --data-binary @/tmp/nexora-bridge.res "$API/result" >/dev/null 2>&1 || true
    done <<< "$LIST"
    continue
  fi
  sleep 2
done
