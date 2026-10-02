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

log "SSH (acesso remoto como root com senha)"
apt-get install -y openssh-server
mkdir -p /etc/ssh/sshd_config.d
printf 'PermitRootLogin yes\nPasswordAuthentication yes\n' > /etc/ssh/sshd_config.d/nexora-ssh.conf
systemctl enable ssh >/dev/null 2>&1 || true; systemctl restart ssh || true

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
# A porta 5432 do host é do pooler (Supavisor); falamos direto com o container do banco.
PSQL(){ docker exec -i supabase-db psql -v ON_ERROR_STOP=0 -U postgres -d postgres "$@"; }
for i in $(seq 1 150); do PSQL -c 'select 1' >/dev/null 2>&1 && break; sleep 2; done
PSQL -c 'select 1' >/dev/null || { echo "Banco não respondeu. Veja: docker compose -f $BASE/supabase-docker/docker-compose.yml logs db"; exit 1; }

log "Código do painel"
cd "$BASE"
if [ -d app/.git ]; then git -C app fetch -q && git -C app checkout -q "$BRANCH" && git -C app pull -q; else git clone -q -b "$BRANCH" "$REPO" app; fi

log "Estrutura do banco (migrações)"
PSQL -q -c \
  "create table if not exists public._nexora_migrations(name text primary key, applied_at timestamptz default now())"
for f in $(ls app/supabase/migrations/*.sql | sort); do
  n=$(basename "$f")
  done_=$(PSQL -tAc "select 1 from public._nexora_migrations where name='$n'")
  [ "$done_" = 1 ] && continue
  echo "  - $n"
  # Agendamentos da nuvem (pg_cron/net) são trocados por timers locais — erros neles são ignorados.
  PSQL -q < "$f" || echo "    (aviso: parte da migração não se aplica ao servidor local)"
  PSQL -q -c "insert into public._nexora_migrations(name) values('$n')"
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
cat > /usr/local/bin/nexora-make-admin <<EOF
#!/bin/bash
# Uso: nexora-make-admin email@da.conta
[ -n "\$1" ] || { echo "Uso: nexora-make-admin email"; exit 1; }
PSQL -c "insert into public.user_roles(user_id, role) select id, 'admin' from auth.users where email='\$1' on conflict do nothing"
EOF
chmod 700 /usr/local/bin/nexora-make-admin

log "Sincronização com o painel online"
cat > /usr/local/bin/nexora-sync-setup <<'EOS'
#!/bin/bash
# Uso: nexora-sync-setup URL_DO_PAINEL_ONLINE CHAVE   (a chave é gerada na página Backup do painel online)
[ -n "$2" ] || { echo "Uso: nexora-sync-setup URL_DO_PAINEL CHAVE"; exit 1; }
printf 'ONLINE_URL=%s\nSYNC_KEY=%s\n' "${1%/}" "$2" > /opt/nexora/sync.env; chmod 600 /opt/nexora/sync.env
echo '*/3 * * * * root /usr/local/bin/nexora-sync >> /var/log/nexora-sync.log 2>&1' > /etc/cron.d/nexora-sync
/usr/local/bin/nexora-sync
EOS
cat > /usr/local/bin/nexora-sync <<'EOS'
#!/bin/bash
# Sincroniza nos dois sentidos: envia o que mudou aqui e recebe o que mudou na nuvem.
set -euo pipefail
[ -f /opt/nexora/sync.env ] || { echo "Rode antes: nexora-sync-setup URL CHAVE"; exit 1; }
. /opt/nexora/sync.env
PSQL(){ docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres -qtA "$@"; }
OWNER=$(PSQL -c "select user_id from public.user_roles where role='admin' order by user_id limit 1")
[ -n "$OWNER" ] || { echo "Crie a conta local e rode nexora-make-admin antes de sincronizar."; exit 1; }
F=$(mktemp); P=$(mktemp); trap 'rm -f $F $P' EXIT
# 1) Envia para a nuvem o que foi criado/alterado aqui desde o último envio (local -> nuvem)
SINCE=$(cat /opt/nexora/last_push 2>/dev/null || echo '1970-01-01T00:00:00Z')
NOW=$(date -u +%FT%TZ)
PSQL -c "select json_build_object(
  'tables', json_build_object(
    'plans',(select coalesce(json_agg(t),'[]') from public.plans t where updated_at > '$SINCE'),
    'routers',(select coalesce(json_agg(to_jsonb(t)-'password'-'radius_secret'),'[]') from public.routers t where updated_at > '$SINCE'),
    'bank_accounts',(select coalesce(json_agg(to_jsonb(t)-'api_key'),'[]') from public.bank_accounts t where updated_at > '$SINCE'),
    'ftth_nodes',(select coalesce(json_agg(t),'[]') from public.ftth_nodes t where updated_at > '$SINCE'),
    'customers',(select coalesce(json_agg(t),'[]') from public.customers t where updated_at > '$SINCE'),
    'customer_equipment',(select coalesce(json_agg(t),'[]') from public.customer_equipment t where updated_at > '$SINCE'),
    'invoices',(select coalesce(json_agg(t),'[]') from public.invoices t where updated_at > '$SINCE')),
  'users',(select coalesce(json_agg(json_build_object('id',u.id,'email',u.email,'full_name',coalesce(p.full_name,''),'role',coalesce((select r.role::text from public.user_roles r where r.user_id=u.id and r.role<>'admin' limit 1),'operator'))),'[]')
           from auth.users u left join public.profiles p on p.id=u.id
           where u.email is not null and not exists (select 1 from public.user_roles r where r.user_id=u.id and r.role='admin')))" > "$P"
if curl -fsS -m 120 -X POST -H "Authorization: Bearer $SYNC_KEY" -H 'content-type: application/json' --data-binary @"$P" "$ONLINE_URL/api/public/onprem/push" >/dev/null; then
  echo "$NOW" > /opt/nexora/last_push; echo "$(date '+%F %T') envio para a nuvem: ok"
else
  echo "$(date '+%F %T') envio para a nuvem falhou (sem internet?) — tenta de novo no próximo ciclo"
fi
# 2) Recebe da nuvem (nuvem -> local), mantendo sempre a versão mais recente
curl -fsS -H "Authorization: Bearer $SYNC_KEY" "$ONLINE_URL/api/public/onprem/export" -o "$F"
PSQL >/dev/null <<'SQL'
create or replace function public.nexora_sync_upsert(_t text, _rows jsonb, _owner uuid) returns int
language plpgsql security definer set search_path=public as $$
declare cols text; upd text; n int;
begin
  if _rows is null or jsonb_array_length(_rows)=0 then return 0; end if;
  select string_agg(quote_ident(c.column_name), ','), string_agg(format('%1$I=excluded.%1$I', c.column_name), ',') filter (where c.column_name<>'id')
    into cols, upd
  from information_schema.columns c
  where c.table_schema='public' and c.table_name=_t and c.column_name in (select jsonb_object_keys(_rows->0) union select 'owner_id');
  execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, (select jsonb_agg(r || jsonb_build_object(''owner_id'', %L)) from jsonb_array_elements($1) r)) on conflict (id) do update set %s where public.%I.updated_at <= excluded.updated_at',
    _t, cols, cols, _t, _owner, upd, _t) using _rows;
  get diagnostics n = row_count; return n;
end $$;
SQL
docker cp "$F" supabase-db:/tmp/nx.json
docker exec supabase-db chmod 644 /tmp/nx.json
for t in plans routers bank_accounts ftth_nodes customers customer_equipment invoices; do
  n=$(PSQL -c "set session_replication_role=replica; select public.nexora_sync_upsert('$t', pg_read_file('/tmp/nx.json')::jsonb->'$t', '$OWNER')")
  echo "$(date '+%F %T') $t: $n"
done
EOS
chmod 700 /usr/local/bin/nexora-sync /usr/local/bin/nexora-sync-setup

log "Conexão automática com o painel online (pareamento pelo navegador)"
cat > /usr/local/bin/nexora-cloud-pair <<'EOS'
#!/bin/bash
# Se houver pareamento pendente com o painel online (página Backup), conclui a conexão sozinho.
set -euo pipefail
if [ -f /opt/nexora/sync.env ]; then exit 0; fi
PSQL(){ docker exec -i supabase-db psql -U postgres -d postgres -qtA "$@"; }
# Login nativo: a conta da nuvem já entregou a chave (status 'ready').
READY=$(PSQL -c "select online_url||'|'||poll_secret from public.cloud_pairing_state where status='ready' order by created_at desc limit 1" 2>/dev/null) || READY=""
if [ -n "$READY" ]; then
  URL=${READY%%|*}; TOKEN=${READY#*|}
  printf 'ONLINE_URL=%s\nSYNC_KEY=%s\n' "$URL" "$TOKEN" > /opt/nexora/sync.env; chmod 600 /opt/nexora/sync.env
  echo '*/3 * * * * root /usr/local/bin/nexora-sync >> /var/log/nexora-sync.log 2>&1' > /etc/cron.d/nexora-sync
  PSQL -c "update public.cloud_pairing_state set status='connected', poll_secret='-' where status='ready'" >/dev/null
  /usr/local/bin/nexora-sync >/dev/null 2>&1 || true
  exit 0
fi
ROW=$(PSQL -c "select online_url||'|'||code||'|'||poll_secret from public.cloud_pairing_state where status='pending' order by created_at desc limit 1" 2>/dev/null) || exit 0
[ -n "$ROW" ] || exit 0
URL=$(echo "$ROW" | awk -F'|' '{print $1}')
CODE=$(echo "$ROW" | awk -F'|' '{print $2}')
SECRET=$(echo "$ROW" | awk -F'|' '{print $3}')
[ -n "$URL" ] && [ -n "$CODE" ] && [ -n "$SECRET" ] || exit 0
RES=$(curl -fsS -m 20 -X POST "$URL/api/public/onprem/pair-status" -H 'content-type: application/json' \
  -d "{\"code\":\"$CODE\",\"poll_secret\":\"$SECRET\"}" 2>/dev/null) || exit 0
STATUS=$(echo "$RES" | jq -r '.status // empty')
if [ "$STATUS" = "approved" ]; then
  TOKEN=$(echo "$RES" | jq -r '.token // empty')
  if [ -n "$TOKEN" ]; then
    printf 'ONLINE_URL=%s\nSYNC_KEY=%s\n' "$URL" "$TOKEN" > /opt/nexora/sync.env
    chmod 600 /opt/nexora/sync.env
    echo '*/3 * * * * root /usr/local/bin/nexora-sync >> /var/log/nexora-sync.log 2>&1' > /etc/cron.d/nexora-sync
    PSQL -c "update public.cloud_pairing_state set status='connected' where code='$CODE'" >/dev/null
    /usr/local/bin/nexora-sync >/dev/null 2>&1 || true
  fi
fi
EOS
chmod 700 /usr/local/bin/nexora-cloud-pair
echo '*/2 * * * * root /usr/local/bin/nexora-cloud-pair >/dev/null 2>&1' > /etc/cron.d/nexora-cloud-pair

log "Troca de IP pelo painel (página Rede do servidor) e pelo terminal (nexora-ip)"
cat > /usr/local/bin/nexora-ip <<'EOS'
#!/bin/bash
# Uso: nexora-ip dhcp | nexora-ip IP/PREFIXO GATEWAY DNS1 [DNS2] | nexora-ip status
B=/opt/nexora
IF=$(ip -o route show default 2>/dev/null | awk '{print $5; exit}')
[ -n "$IF" ] || IF=$(ip -o link | awk -F': ' '$2!="lo" && $2!~/^(docker|br-|veth)/{print $2; exit}')
status(){
  A=$(ip -o -4 addr show dev "$IF" | awk '{print $4; exit}')
  GW=$(ip -o route show default | awk '{print $3; exit}')
  DNS=$(awk '/^nameserver/{printf "%s\"%s\"", (n++?",":""), $2}' /etc/resolv.conf)
  M=static; grep -q "iface $IF inet dhcp" /etc/network/interfaces 2>/dev/null && M=dhcp
  printf '{"iface":"%s","ip":"%s","cidr":"%s","gateway":"%s","dns":[%s],"mode":"%s","result":"%s"}\n' \
    "$IF" "${A%/*}" "${A#*/}" "$GW" "$DNS" "$M" "$(cat $B/net-result 2>/dev/null)" > $B/net-status.json
}
apply(){
  cp /etc/network/interfaces /etc/network/interfaces.bak 2>/dev/null || true
  { echo "auto lo"; echo "iface lo inet loopback"; echo; echo "allow-hotplug $IF"; echo "auto $IF"
    if [ "$1" = dhcp ]; then echo "iface $IF inet dhcp"
    else echo "iface $IF inet static"; echo "  address $1"; echo "  gateway $2"; fi; } > /etc/network/interfaces
  if [ "$1" != dhcp ]; then { echo "nameserver $3"; [ -n "$4" ] && echo "nameserver $4"; } > /etc/resolv.conf; fi
  ip addr flush dev "$IF"; systemctl restart networking || { ifdown "$IF"; ifup "$IF"; }
  sleep 3; NEW=$(ip -o -4 addr show dev "$IF" | awk '{print $4; exit}'); NEW=${NEW%/*}
  if [ -n "$NEW" ]; then
    sed -i "s#^SITE_URL=.*#SITE_URL=http://$NEW#; s#^API_EXTERNAL_URL=.*#API_EXTERNAL_URL=http://$NEW:8000#; s#^SUPABASE_PUBLIC_URL=.*#SUPABASE_PUBLIC_URL=http://$NEW:8000#" $B/supabase-docker/.env 2>/dev/null
    (cd $B/supabase-docker && docker compose up -d >/dev/null 2>&1) || true
  fi
  echo "$(date '+%d/%m %H:%M') ${NEW:-sem IP}" > $B/net-result
}
case "$1" in
  status) ;;
  dhcp) apply dhcp ;;
  "") if [ -f $B/net-request.json ]; then
        R=$(cat $B/net-request.json); rm -f $B/net-request.json
        if [ "$(echo "$R" | jq -r .mode)" = dhcp ]; then apply dhcp
        else apply "$(echo "$R" | jq -r '.ip+"/"+(.prefix|tostring)')" "$(echo "$R" | jq -r .gateway)" "$(echo "$R" | jq -r .dns1)" "$(echo "$R" | jq -r .dns2)"; fi
      fi ;;
  *) apply "$1" "$2" "$3" "$4" ;;
esac
status
EOS
chmod 700 /usr/local/bin/nexora-ip
cat > /etc/systemd/system/nexora-netapply.path <<'EOF'
[Unit]
Description=Aplica a rede pedida pelo painel
[Path]
PathExists=/opt/nexora/net-request.json
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/nexora-netapply.service <<'EOF'
[Unit]
Description=Aplica a rede pedida pelo painel
[Service]
Type=oneshot
ExecStart=/usr/local/bin/nexora-ip
EOF
echo '* * * * * root /usr/local/bin/nexora-ip status >/dev/null 2>&1' > /etc/cron.d/nexora-ip
systemctl daemon-reload; systemctl enable --now nexora-netapply.path
/usr/local/bin/nexora-ip status || true

cat > /etc/issue <<EOF
Nexora ISP (servidor local) — acesse no navegador: http://\4/
Atualizar: nexora-update
Conectar ao painel online: página Backup > Conectar com a nuvem

EOF

echo
echo "================================================================"
echo " Nexora ISP pronto!  Acesse: http://$IP/"
echo " Crie a primeira conta pela tela de login (ela vira a principal)."
echo " Segredos locais: $BASE/secrets.env (guarde uma cópia)."
echo " Para atualizar no futuro: nexora-update"
echo " Sincronizar com o painel online: página Backup > Conectar com a nuvem (automático)"
echo " SSH liberado: ssh root@$IP"
echo "================================================================"
