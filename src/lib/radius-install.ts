// Script de instalação do servidor RADIUS (Debian 12). Não contém segredos:
// a URL do painel e o token são passados como argumentos.
export const INSTALL_SCRIPT = String.raw`#!/usr/bin/env bash
# Nexora ISP — instalador do servidor RADIUS (Debian 12 / Ubuntu 22.04+)
# Uso: sudo bash install.sh URL_DO_PAINEL TOKEN
set -euo pipefail
PANEL_URL="\${1:-}"; TOKEN="\${2:-}"
if [ -z "$PANEL_URL" ] || [ -z "$TOKEN" ]; then echo "Uso: sudo bash install.sh URL_DO_PAINEL TOKEN"; exit 1; fi
[ "$(id -u)" = 0 ] || { echo "Execute como root (sudo)."; exit 1; }
PANEL_URL="\${PANEL_URL%/}"

echo "==> Instalando FreeRADIUS"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y freeradius freeradius-rest freeradius-utils curl ca-certificates

echo "==> Testando acesso ao painel"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Content-Type: application/json" \
  "$PANEL_URL/api/public/radius/accounting?token=$TOKEN" -d '{}') || true
if [ "$code" != "204" ]; then echo "Falha ao falar com o painel (HTTP $code). Confira a URL e o token."; exit 1; fi

RD=/etc/freeradius/3.0
cat > $RD/mods-available/rest <<EOF
rest {
  tls { check_cert = yes; check_cert_cn = yes }
  connect_uri = "$PANEL_URL/api/public/radius"
  authorize {
    uri = "\\\${..connect_uri}/authorize?token=$TOKEN"
    method = 'post'
    body = 'json'
    tls = \\\${..tls}
  }
  accounting {
    uri = "\\\${..connect_uri}/accounting?token=$TOKEN"
    method = 'post'
    body = 'json'
    tls = \\\${..tls}
  }
  pool { start = 2; min = 2; max = 32; spare = 4; uses = 0; retry_delay = 30; lifetime = 0; idle_timeout = 60 }
}
EOF
chmod 640 $RD/mods-available/rest; chown root:freerad $RD/mods-available/rest
ln -sf ../mods-available/rest $RD/mods-enabled/rest

cat > $RD/sites-available/nexora <<'EOF'
server nexora {
  listen { type = auth; ipaddr = *; port = 1812 }
  listen { type = acct; ipaddr = *; port = 1813 }
  authorize {
    preprocess
    rest
    if (notfound || reject) { reject }
    mschap
    chap
    pap
  }
  authenticate {
    Auth-Type PAP { pap }
    Auth-Type CHAP { chap }
    Auth-Type MS-CHAP { mschap }
  }
  preacct { preprocess; acct_unique }
  accounting { rest }
  post-auth { Post-Auth-Type REJECT { attr_filter.access_reject } }
}
EOF
rm -f $RD/sites-enabled/default $RD/sites-enabled/inner-tunnel
ln -sf ../sites-available/nexora $RD/sites-enabled/nexora

mkdir -p $RD/clients.d
touch $RD/clients.d/nexora.conf
grep -q 'clients.d/nexora.conf' $RD/clients.conf || echo '$INCLUDE clients.d/nexora.conf' >> $RD/clients.conf

cat > /usr/local/bin/nexora-radius-add-router <<'EOF'
#!/usr/bin/env bash
# Uso: nexora-radius-add-router NOME IP_DO_ROTEADOR SEGREDO
set -e
[ $# -eq 3 ] || { echo "Uso: nexora-radius-add-router NOME IP SEGREDO"; exit 1; }
F=/etc/freeradius/3.0/clients.d/nexora.conf
N=$(echo "$1" | tr -cd 'A-Za-z0-9_-')
printf 'client %s {\n  ipaddr = %s\n  secret = %s\n  nas_type = other\n}\n' "$N" "$2" "$3" >> "$F"
freeradius -C && systemctl restart freeradius && echo "Roteador $1 ($2) autorizado."
EOF
chmod +x /usr/local/bin/nexora-radius-add-router

if command -v ufw >/dev/null; then ufw allow 1812/udp; ufw allow 1813/udp; fi

echo "==> Validando configuração"
freeradius -C
systemctl enable freeradius
systemctl restart freeradius
echo
echo "Servidor RADIUS pronto. IP deste servidor: $(hostname -I | awk '{print $1}')"
echo "Agora autorize cada MikroTik:  nexora-radius-add-router NOME IP_DO_ROTEADOR SEGREDO"
`;
