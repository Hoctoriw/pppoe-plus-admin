#!/usr/bin/env bash
# Nexora RADIUS Agent — mantém o servidor local ligado ao painel principal.
# Sincroniza roteadores, envia status e se atualiza sozinho. Roda via systemd timer.
set -uo pipefail
. /opt/nexora/env
VERSION_FILE=/opt/nexora/version
CUR=$(cat "$VERSION_FILE" 2>/dev/null || echo 0)
API="$PANEL_URL/api/public/radius"
H=(-fsS --max-time 20 -H "Authorization: Bearer $TOKEN")

# 1. Roteadores autorizados
F=/etc/freeradius/3.0/clients.d/nexora.conf
if curl "${H[@]}" "$API/clients" -o /tmp/nexora-clients.conf; then
  if ! cmp -s /tmp/nexora-clients.conf "$F"; then
    cp "$F" "$F.bak" 2>/dev/null || true
    cp /tmp/nexora-clients.conf "$F"; chown root:freerad "$F"; chmod 640 "$F"
    if freeradius -C >/dev/null 2>&1; then systemctl restart freeradius; else cp "$F.bak" "$F"; fi
  fi
fi

# 2. Status para o painel
OK=false; systemctl is-active --quiet freeradius && OK=true
RESP=$(curl "${H[@]}" -X POST -H "Content-Type: application/json" "$API/heartbeat" \
  -d "{\"hostname\":\"$(hostname)\",\"local_ip\":\"$(hostname -I | awk '{print $1}')\",\"version\":\"$CUR\",\"radius_ok\":$OK,\"uptime\":\"$(uptime -p)\"}" || true)

# 3. Atualização automática
NEW=$(echo "$RESP" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
if [ -n "$NEW" ] && [ "$NEW" != "$CUR" ]; then
  if curl -fsSL "$PANEL_URL/radius-install.sh" -o /tmp/nexora-install.sh && \
     curl -fsSL "$PANEL_URL/radius-agent.sh" -o /tmp/nexora-agent.sh; then
    bash /tmp/nexora-install.sh "$PANEL_URL" "$TOKEN" "$NEW" && echo "$NEW" > "$VERSION_FILE"
  fi
fi
