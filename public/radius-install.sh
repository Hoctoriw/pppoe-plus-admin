#!/usr/bin/env bash
# Nexora ISP — instalador do servidor RADIUS (Debian 12 / Ubuntu 22.04+)
# Uso: sudo bash install.sh URL_DO_PAINEL TOKEN
set -euo pipefail
PANEL_URL="${1:-}"; TOKEN="${2:-}"
if [ -z "$PANEL_URL" ] || [ -z "$TOKEN" ]; then echo "Uso: sudo bash install.sh URL_DO_PAINEL TOKEN"; exit 1; fi
[ "$(id -u)" = 0 ] || { echo "Execute como root (sudo)."; exit 1; }
PANEL_URL="${PANEL_URL%/}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates sudo
mkdir -p /etc/sudoers.d
# Segue redirecionamentos (ex.: endereco antigo -> dominio proprio) para nao travar a instalacao
FINAL=$(curl -sL -o /dev/null -m 20 -w '%{url_effective}' "$PANEL_URL/" || true)
[ -n "$FINAL" ] && PANEL_URL="${FINAL%/}"
echo "==> Painel: $PANEL_URL"
# Libera o acesso SSH como root (senha)
mkdir -p /etc/ssh/sshd_config.d
echo "PermitRootLogin yes" > /etc/ssh/sshd_config.d/permit-root.conf
systemctl restart ssh 2>/dev/null || systemctl restart sshd 2>/dev/null || true

echo "==> Instalando FreeRADIUS"
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
    uri = "\${..connect_uri}/authorize?token=$TOKEN"
    method = 'post'
    body = 'json'
    tls = \${..tls}
  }
  accounting {
    uri = "\${..connect_uri}/accounting?token=$TOKEN"
    method = 'post'
    body = 'json'
    tls = \${..tls}
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

echo "==> Instalando agente de conexão com o painel (sincronização e atualizações)"
mkdir -p /opt/nexora
printf 'PANEL_URL=%q\nTOKEN=%q\n' "$PANEL_URL" "$TOKEN" > /opt/nexora/env; chmod 600 /opt/nexora/env
curl -fsSL "$PANEL_URL/radius-agent.sh" -o /opt/nexora/agent.sh; chmod 700 /opt/nexora/agent.sh
[ -n "${3:-}" ] && echo "$3" > /opt/nexora/version
cat > /etc/systemd/system/nexora-agent.service <<'EOF'
[Unit]
Description=Nexora RADIUS Agent
After=network-online.target
[Service]
Type=oneshot
ExecStart=/bin/bash /opt/nexora/agent.sh
EOF
cat > /etc/systemd/system/nexora-agent.timer <<'EOF'
[Unit]
Description=Nexora RADIUS Agent a cada minuto
[Timer]
OnBootSec=30
OnUnitActiveSec=60
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now nexora-agent.timer

echo "==> Instalando painel web local (porta 80)"
apt-get install -y nginx fcgiwrap openssl
WEBPW="${NEXORA_WEB_PW:-}"
[ -z "$WEBPW" ] && [ -f /opt/nexora/webpw ] && WEBPW=$(cat /opt/nexora/webpw)
[ -z "$WEBPW" ] && WEBPW=$(openssl rand -hex 6)
echo "$WEBPW" > /opt/nexora/webpw; chmod 600 /opt/nexora/webpw
printf 'admin:%s\n' "$(openssl passwd -apr1 "$WEBPW")" > /etc/nginx/nexora.htpasswd
chown root:www-data /etc/nginx/nexora.htpasswd; chmod 640 /etc/nginx/nexora.htpasswd
mkdir -p /opt/nexora/www
cat > /opt/nexora/www/index.cgi <<'EOF'
#!/bin/bash
. /opt/nexora/env 2>/dev/null
q="${QUERY_STRING:-}"
if [ "${REQUEST_METHOD:-GET}" = POST ]; then
  case "$q" in
    a=restart-radius) sudo -n /bin/systemctl restart freeradius ;;
    a=sync) sudo -n /bin/systemctl start nexora-agent.service ;;
  esac
  printf 'Status: 303 See Other\r\nLocation: /\r\n\r\n'; exit 0
fi
if [ "$q" = "a=log" ]; then
  printf 'Content-Type: text/plain; charset=utf-8\r\n\r\n'
  sudo -n /usr/bin/journalctl -u freeradius -n 200 --no-pager 2>&1; exit 0
fi
esc(){ sed 's/&/\&amp;/g;s/</\&lt;/g;s/>/\&gt;/g'; }
st(){ systemctl is-active "$1" >/dev/null 2>&1 && echo '<b class=ok>ATIVO</b>' || echo '<b class=bad>PARADO</b>'; }
code=$(curl -s -o /dev/null -m 5 -w '%{http_code} %{time_total}s' -H "Authorization: Bearer $TOKEN" "$PANEL_URL/api/public/radius/version" 2>/dev/null)
case "$code" in 200*) cloud="<b class=ok>CONECTADO</b> (${code#* })";; *) cloud="<b class=bad>SEM CONEXÃO</b> (HTTP ${code%% *})";; esac
mem=$(free -m | awk '/Mem:/{printf "%d / %d MB", $3, $2}')
disk=$(df -h / | awk 'NR==2{print $3" / "$2" ("$5")"}')
load=$(cut -d' ' -f1-3 /proc/loadavg)
clients=$(grep -E '^\s*(client|ipaddr)' /etc/freeradius/3.0/clients.d/nexora.conf 2>/dev/null | paste - - | awk '{print "<tr><td>"$2"</td><td>"$5"</td></tr>"}')
printf 'Content-Type: text/html; charset=utf-8\r\n\r\n'
cat <<HTML
<!doctype html><html lang=pt-BR><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<meta http-equiv=refresh content=30><title>Nexora RADIUS — $(hostname)</title>
<style>body{font-family:system-ui,sans-serif;background:#0f1418;color:#e6edf0;margin:0;padding:24px}h1{margin:0 0 4px}small{color:#8aa}
.g{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin:16px 0}.c{background:#172028;border:1px solid #26333d;padding:14px}
.ok{color:#4ade80}.bad{color:#f87171}table{width:100%;border-collapse:collapse}td{border-top:1px solid #26333d;padding:6px}button,a.b{background:#e8a23a;color:#111;border:0;padding:8px 12px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block;margin-right:6px}</style>
<h1>Nexora RADIUS</h1><small>$(hostname) · IP local $(hostname -I | awk '{print $1}') · versão $(cat /opt/nexora/version 2>/dev/null || echo ?)</small>
<div class=g>
<div class=c>FreeRADIUS (1812/1813 UDP)<br>$(st freeradius)</div>
<div class=c>Sincronização com o painel<br>$(st nexora-agent.timer)</div>
<div class=c>Painel na nuvem<br>$cloud</div>
<div class=c>Sistema<br>CPU $load · RAM $mem<br>Disco $disk<br>$(uptime -p)</div>
</div>
<div class=c><b>Roteadores autorizados</b><table><tr><td><small>Nome</small></td><td><small>IP</small></td></tr>${clients:-<tr><td colspan=2>Nenhum roteador com RADIUS ativo.</td></tr>}</table></div>
<p><form method=post action="/?a=restart-radius" style=display:inline><button>Reiniciar RADIUS</button></form>
<form method=post action="/?a=sync" style=display:inline><button>Sincronizar agora</button></form>
<a class=b href="/?a=log" target=_blank>Ver log do RADIUS</a></p>
HTML
EOF
chmod 755 /opt/nexora/www/index.cgi
cat > /etc/sudoers.d/nexora-web <<'EOF'
www-data ALL=(root) NOPASSWD: /bin/systemctl restart freeradius, /bin/systemctl start nexora-agent.service, /usr/bin/journalctl -u freeradius -n 200 --no-pager
EOF
chmod 440 /etc/sudoers.d/nexora-web
chmod 640 /opt/nexora/env; chown root:www-data /opt/nexora/env
cat > /etc/nginx/sites-available/nexora <<'EOF'
server {
  listen 80 default_server;
  auth_basic "Nexora RADIUS";
  auth_basic_user_file /etc/nginx/nexora.htpasswd;
  location / {
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME /opt/nexora/www/index.cgi;
    fastcgi_pass unix:/run/fcgiwrap.socket;
  }
}
EOF
rm -f /etc/nginx/sites-enabled/default
ln -sf ../sites-available/nexora /etc/nginx/sites-enabled/nexora
systemctl enable --now fcgiwrap.socket
nginx -t && systemctl enable nginx && systemctl restart nginx
if command -v ufw >/dev/null; then ufw allow 80/tcp; fi


CFTOKEN="${NEXORA_CF_TOKEN:-}"
[ -z "$CFTOKEN" ] && [ -f /opt/nexora/cftoken ] && CFTOKEN=$(cat /opt/nexora/cftoken)
if [ -n "$CFTOKEN" ]; then
  echo "==> Instalando conector Cloudflare Tunnel (acesso remoto sem IP público)"
  mkdir -p --mode=0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" > /etc/apt/sources.list.d/cloudflared.list
  apt-get update -y && apt-get install -y cloudflared
  echo "$CFTOKEN" > /opt/nexora/cftoken; chmod 600 /opt/nexora/cftoken
  cloudflared service uninstall >/dev/null 2>&1 || true
  cloudflared service install "$CFTOKEN"
  systemctl enable --now cloudflared || true
fi

echo "==> Validando configuração"
freeradius -C
systemctl enable freeradius
systemctl restart freeradius
bash /opt/nexora/agent.sh || true
IP=$(hostname -I | awk '{print $1}')
echo
echo "Servidor RADIUS pronto e conectado ao painel. IP deste servidor: $IP"
echo "Painel web local: http://$IP  (usuário: admin  senha: $WEBPW)"
[ -n "$CFTOKEN" ] && echo "Cloudflare Tunnel: $(systemctl is-active cloudflared)"
echo "Os roteadores com RADIUS ativo no painel são autorizados automaticamente."
