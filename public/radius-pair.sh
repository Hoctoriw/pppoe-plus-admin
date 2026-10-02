#!/usr/bin/env bash
# Nexora RADIUS — pareamento no primeiro boot.
# Pede um código temporário ao painel, mostra na tela e aguarda a aprovação.
# Só depois recebe a chave exclusiva deste servidor e instala o FreeRADIUS.
set -uo pipefail
. /opt/nexora/env
API="$PANEL_URL/api/public/radius"
show() { printf '%s\n' "$1" > /etc/issue; for t in /dev/tty1 /dev/console; do [ -w "$t" ] && printf '\033c%s\n' "$1" > "$t" 2>/dev/null; done; }

until curl -fsS --max-time 10 -o /dev/null "$PANEL_URL/radius-install.sh"; do
  show "NEXORA RADIUS — aguardando internet para falar com o painel..."; sleep 10
done

while true; do
  IP=$(hostname -I | awk '{print $1}')
  R=$(curl -fsS --max-time 15 -X POST -H "Content-Type: application/json" "$API/pair-request" \
    -d "{\"hostname\":\"$(hostname)\",\"local_ip\":\"$IP\"}") || { sleep 15; continue; }
  CODE=$(echo "$R" | grep -o '"code":"[0-9]*"' | cut -d'"' -f4)
  POLL=$(echo "$R" | grep -o '"poll_secret":"[0-9a-f]*"' | cut -d'"' -f4)
  [ -n "$CODE" ] && [ -n "$POLL" ] || { sleep 15; continue; }
  show "
 ===========================================================
   NEXORA ISP — SERVIDOR RADIUS LOCAL
   IP desta máquina: $IP

   CÓDIGO DE PAREAMENTO:  ${CODE:0:3} ${CODE:3:3}   (vale 15 minutos)

   No painel, abra MikroTik > RADIUS > Vincular servidor
   e digite este código.
 ===========================================================
"
  END=$(( $(date +%s) + 900 ))
  while [ "$(date +%s)" -lt "$END" ]; do
    sleep 5
    S=$(curl -fsS --max-time 15 -X POST -H "Content-Type: application/json" "$API/pair-status" \
      -d "{\"code\":\"$CODE\",\"poll_secret\":\"$POLL\"}") || continue
    TOKEN=$(echo "$S" | grep -o '"token":"[0-9a-f]*"' | cut -d'"' -f4)
    VER=$(echo "$S" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$TOKEN" ]; then
      show "NEXORA RADIUS — servidor vinculado! Instalando, aguarde..."
      curl -fsSL "$PANEL_URL/radius-install.sh" -o /opt/nexora/install.sh
      if bash /opt/nexora/install.sh "$PANEL_URL" "$TOKEN" "$VER"; then
        show "NEXORA RADIUS — pronto e conectado ao painel. IP: $IP"; exit 0
      fi
      show "Falha na instalação. Veja: journalctl -u nexora-firstboot"; exit 1
    fi
    echo "$S" | grep -q '"expired"' && break
  done
done
