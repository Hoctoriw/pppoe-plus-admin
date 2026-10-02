#!/usr/bin/env bash
# Nexora ISP — instalação ON-PREMISE completa (estilo MK-AUTH) num Debian 12.
# Instala: banco + autenticação locais (Supabase self-hosted em Docker), painel web (Node),
# Nginx na porta 80 e FreeRADIUS consultando o painel local.
# Uso: bash nexora-onprem-install.sh URL_DO_REPOSITORIO_GIT [BRANCH]
#   ex.: bash nexora-onprem-install.sh https://github.com/sua-conta/nexora.git main
set -euo pipefail
REPO="${1:-${REPO_URL:-}}"; BRANCH="${2:-main}"
[ -n "$REPO" ] || { echo "Uso: bash nexora-onprem-install.sh URL_DO_REPOSITORIO_GIT [BRANCH]"; exit 1; }
[ "$(id -u)" = 0 ] || { echo "Rode como root."; exit 1; }
export DEBIAN_FRONTEND=noninteractive
IP=$(hostname -I | awk '{print $1}')
BASE=/opt/nexora; mkdir -p "$BASE"; cd "$BASE"
log(){ echo -e "\n==> $*"; }

log "Pacotes do sistema"
apt-get update -y
apt-get install -y ca-certificates curl git gnupg nginx postgresql-client openssl unzip jq \
  freeradius freeradius-rest

log "Docker"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

log "Node.js 22 + Bun"
command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_22.x | bash -; apt-get install -y nodejs; }
command -v bun >/dev/null || { curl -fsSL https://bun.sh/install | bash; ln -sf /root/.bun/bin/bun /usr/local/bin/bun; }

# ---------- Segredos locais (gerados uma vez) ----------
if [ ! -f "$BASE/secrets.env" ]; then
  JWT_SECRET=$(openssl rand -hex 32)
  sign(){ node -e '
    const c=require("crypto"),[s,r]=process.argv.slice(1);
    const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
    const h=b({alg:"HS256",typ:"JWT"}),p=b({role:r,iss:"supabase",iat:Math.floor(Date.now()/1e3),exp:Math.floor(Date.now()/1e3)+3153600000});
    console.log(h+"."+p+"."+c.createHmac("sha256",s).update(h+"."+p).digest("base64url"));' "$JWT_SECRET" "$1"; }
  cat > "$BASE/secrets.env" <<EOF
JWT_SECRET=$JWT_SECRET
ANON_KEY=$(sign anon)
SERVICE_ROLE_KEY=$(sign service_role)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
DASHBOARD_PASSWORD=$(openssl rand -hex 12)
RADIUS_API_TOKEN=$(openssl rand -hex 32)
SYNC_CRON_TOKEN=$(openssl rand -hex 32)
EOF
  chmod 600 "$BASE/secrets.env"
fi
set -a; . "$BASE/secrets.env"; set +a

log "Banco e autenticação locais"
[ -d "$BASE/supabase-docker" ] || git clone --depth 1 https://github.com/supabase/supabase "$BASE/supabase-src"
if [ ! -d "$BASE/supabase-docker" ]; then cp -r "$BASE/supabase-src/docker" "$BASE/supabase-docker"; rm -rf "$BASE/supabase-src"; fi
cd "$BASE/supabase-docker"
[ -f .env ] || cp .env.example .env
setenv(){ grep -q "^$1=" .env && sed -i "s#^$1=.*#$1=$2#" .env || echo "$1=$2" >> .env; }
setenv POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
setenv JWT_SECRET "$JWT_SECRET"
setenv ANON_KEY "$ANON_KEY"
setenv SERVICE_ROLE_KEY "$SERVICE_ROLE_KEY"
setenv DASHBOARD_PASSWORD "$DASHBOARD_PASSWORD"
setenv SITE_URL "http://$IP"
setenv API_EXTERNAL_URL "http://$IP:8000"
setenv SUPABASE_PUBLIC_URL "http://$IP:8000"
setenv ENABLE_EMAIL_AUTOCONFIRM true
setenv DISABLE_SIGNUP false
docker compose pull -q && docker compose up -d
log "Aguardando o banco subir"
for i in $(seq 1 90); do PGPASSWORD=$POSTGRES_PASSWORD psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -c 'select 1' >/dev/null 2>&1 && break; sleep 2; done

log "Código do painel"
cd "$BASE"
if [ -d app/.git ]; then git -C app fetch -q && git -C app checkout -q "$BRANCH" && git -C app pull -q; else git clone -q -b "$BRANCH" "$REPO" app; fi

log "Estrutura do banco (migrações)"
PGPASSWORD=$POSTGRES_PASSWORD psql -h 127.0.0.1 -U postgres -d postgres -q -c \
  "create table if not exists public._nexora_migrations(name text primary key, applied_at timestamptz default now())"
for f in $(ls app/supabase/migrations/*.sql | sort); do
  n=$(basename "$f")
  done_=$(PGPASSWORD=$POSTGRES_PASSWORD psql -h 127.0.0.1 -U postgres -d postgres -tAc "select 1 from public._nexora_migrations where name='$n'")
  [ "$done_" = 1 ] && continue
  echo "  - $n"
  # Agendamentos da nuvem (pg_cron/net) são trocados por timers locais — erros neles são ignorados.
  PGPASSWORD=$POSTGRES_PASSWORD psql -h 127.0.0.1 -U postgres -d postgres -q -f "$f" || echo "    (aviso: parte da migração não se aplica ao servidor local)"
  PGPASSWORD=$POSTGRES_PASSWORD psql -h 127.0.0.1 -U postgres -d postgres -q -c "insert into public._nexora_migrations(name) values('$n')"
done

log "Compilando o painel para rodar localmente"
cd "$BASE/app"
cat > .env <<EOF
VITE_SUPABASE_URL=http://$IP:8000
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
VITE_SUPABASE_PROJECT_ID=local
EOF
bun install --frozen-lockfile || bun install
NITRO_PRESET=node-server bun run build

cat > "$BASE/app.env" <<EOF
PORT=3000
HOST=127.0.0.1
SUPABASE_URL=http://127.0.0.1:8000
SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
RADIUS_API_TOKEN=$RADIUS_API_TOKEN
SYNC_CRON_TOKEN=$SYNC_CRON_TOKEN
EOF
chmod 600 "$BASE/app.env"

cat > /etc/systemd/system/nexora-web.service <<EOF
[Unit]
Description=Nexora ISP painel web
After=network-online.target docker.service
[Service]
EnvironmentFile=$BASE/app.env
WorkingDirectory=$BASE/app
ExecStart=/usr/bin/node $BASE/app/.output/server/index.mjs
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF

log "Rotinas automáticas (sincronismo MikroTik de hora em hora, backup à meia-noite)"
cat > "$BASE/cron.sh" <<'EOF'
#!/bin/bash
. /opt/nexora/app.env
curl -fsS -X POST -H "Authorization: Bearer $SYNC_CRON_TOKEN" "http://127.0.0.1:3000/api/public/hooks/$1" >/dev/null
EOF
chmod 700 "$BASE/cron.sh"
cat > /etc/cron.d/nexora <<EOF
0 * * * * root $BASE/cron.sh sync-mikrotik
0 0 * * * root TZ=America/Sao_Paulo $BASE/cron.sh daily-backup
EOF

log "Nginx (porta 80)"
cat > /etc/nginx/sites-available/nexora <<'EOF'
server {
  listen 80 default_server;
  client_max_body_size 50m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
EOF
ln -sf /etc/nginx/sites-available/nexora /etc/nginx/sites-enabled/nexora
rm -f /etc/nginx/sites-enabled/default

log "FreeRADIUS ligado ao painel local"
if curl -fsSL "http://127.0.0.1:3000/radius-install.sh" -o /tmp/ri.sh 2>/dev/null; then :; fi
systemctl daemon-reload
systemctl enable --now nexora-web
systemctl restart nginx
for i in $(seq 1 60); do curl -fs -o /dev/null http://127.0.0.1:3000/ && break; sleep 2; done
curl -fsSL "http://127.0.0.1:3000/radius-install.sh" -o /tmp/ri.sh && bash /tmp/ri.sh "http://127.0.0.1:3000" "$RADIUS_API_TOKEN" || echo "(aviso: configure o RADIUS depois rodando o instalador de novo)"

log "Atalho de atualização"
cat > /usr/local/bin/nexora-update <<EOF
#!/bin/bash
REPO_URL="$REPO" bash $BASE/app/public/nexora-onprem-install.sh "$REPO" "$BRANCH"
EOF
chmod +x /usr/local/bin/nexora-update

cat > /etc/issue <<EOF
Nexora ISP (servidor local) — acesse no navegador: http://\4/
Atualizar: nexora-update

EOF

echo
echo "================================================================"
echo " Nexora ISP pronto!  Acesse: http://$IP/"
echo " Crie a primeira conta pela tela de login (ela vira a principal)."
echo " Segredos locais: $BASE/secrets.env (guarde uma cópia)."
echo " Para atualizar no futuro: nexora-update"
echo "================================================================"
