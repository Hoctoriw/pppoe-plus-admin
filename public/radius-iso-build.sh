#!/usr/bin/env bash
# Nexora ISP — gera uma ISO Debian 12 genérica do servidor RADIUS (sem chaves secretas).
# No primeiro boot a máquina mostra um código temporário; você o digita no painel para vincular.
# Uso (em qualquer Linux): bash radius-iso-build.sh URL_DO_PAINEL SENHA_ROOT [URL_DO_REPOSITORIO_GIT]
# Com o 3º argumento, a ISO instala o SISTEMA COMPLETO on-premise (painel web + banco + RADIUS) acessível pelo IP.
# Resultado: nexora-radius.iso  (ATENÇÃO: a instalação APAGA o primeiro disco)
set -euo pipefail
PANEL_URL="${1:-}"; ROOTPW="${2:-}"; REPO_URL="${3:-}"; SYNC_KEY="${4:-}"
# 4º argumento opcional: chave de sincronização (página Backup) — a máquina já nasce conectada à nuvem.
if [ -z "$PANEL_URL" ] || [ -z "$ROOTPW" ]; then
  echo "Uso: bash radius-iso-build.sh URL_DO_PAINEL SENHA_ROOT"; exit 1; fi
PANEL_URL="${PANEL_URL%/}"
command -v xorriso >/dev/null || { echo "Instale o xorriso (apt install xorriso)"; exit 1; }
command -v curl >/dev/null || { echo "Instale o curl"; exit 1; }

BASE=https://cdimage.debian.org/cdimage/archive/latest-oldstable/amd64/iso-cd
[ "$(curl -s -o /dev/null -w '%{http_code}' $BASE/)" = 200 ] || BASE=https://cdimage.debian.org/debian-cd/current/amd64/iso-cd
NAME=$(curl -s "$BASE/" | grep -o 'debian-12[0-9.]*-amd64-netinst.iso' | head -1)
[ -n "$NAME" ] || { echo "Não encontrei a ISO do Debian 12."; exit 1; }

W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
[ -f "$NAME" ] || { echo "==> Baixando $NAME"; curl -L -o "$NAME" "$BASE/$NAME"; }

mkdir -p "$W/nexora"
if [ -n "$REPO_URL" ]; then
  curl -fsSL "$PANEL_URL/nexora-onprem-install.sh" -o "$W/nexora/onprem.sh"
  printf '#!/bin/bash\nset -e\nbash /opt/nexora/onprem.sh %q main\n' "$REPO_URL" > "$W/nexora/pair.sh"
else
  curl -fsSL "$PANEL_URL/radius-pair.sh" -o "$W/nexora/pair.sh"
fi
printf 'PANEL_URL=%q\n' "$PANEL_URL" > "$W/nexora/env"
if [ -n "$SYNC_KEY" ]; then
  [[ "$SYNC_KEY" =~ ^nxs_[a-f0-9]{64}$ ]] || { echo "Chave de sincronização inválida."; exit 1; }
  printf 'ONLINE_URL=%s\nSYNC_KEY=%s\n' "$PANEL_URL" "$SYNC_KEY" > "$W/nexora/sync.env"
  chmod 600 "$W/nexora/sync.env"
fi
cat > "$W/nexora/nexora-firstboot.service" <<'EOF'
[Unit]
Description=Nexora RADIUS pareamento e instalação no primeiro boot
After=network-online.target
Wants=network-online.target
ConditionPathExists=!/opt/nexora/agent.sh
ConditionPathExists=!/opt/nexora/app/.output
[Service]
Type=oneshot
TimeoutStartSec=0
ExecStart=/bin/bash /opt/nexora/pair.sh
ExecStartPost=/bin/systemctl disable nexora-firstboot.service
Restart=on-failure
RestartSec=30
[Install]
WantedBy=multi-user.target
EOF

cat > "$W/preseed.cfg" <<EOF
d-i debian-installer/locale string pt_BR.UTF-8
d-i keyboard-configuration/xkb-keymap select br
d-i netcfg/choose_interface select auto
d-i netcfg/get_hostname string nexora-radius
d-i netcfg/get_domain string local
d-i mirror/country string manual
d-i mirror/http/hostname string deb.debian.org
d-i mirror/http/directory string /debian
d-i mirror/http/proxy string
d-i passwd/make-user boolean false
d-i passwd/root-password password $ROOTPW
d-i passwd/root-password-again password $ROOTPW
d-i clock-setup/utc boolean true
d-i time/zone string America/Sao_Paulo
d-i partman-auto/method string regular
d-i partman-auto/choose_recipe select atomic
d-i partman-partitioning/confirm_write_new_label boolean true
d-i partman/choose_partition select finish
d-i partman/confirm boolean true
d-i partman/confirm_nooverwrite boolean true
d-i apt-setup/cdrom/set-first boolean false
tasksel tasksel/first multiselect standard, ssh-server
d-i pkgsel/include string curl ca-certificates
popularity-contest popularity-contest/participate boolean false
d-i grub-installer/only_debian boolean true
d-i grub-installer/bootdev string default
d-i preseed/late_command string mkdir -p /target/opt/nexora; cp /cdrom/nexora/* /target/opt/nexora/; chmod 600 /target/opt/nexora/env; cp /cdrom/nexora/nexora-firstboot.service /target/etc/systemd/system/; in-target systemctl enable nexora-firstboot.service; mkdir -p /target/etc/ssh/sshd_config.d; printf 'PermitRootLogin yes\\nPasswordAuthentication yes\\n' > /target/etc/ssh/sshd_config.d/nexora-ssh.conf
d-i finish-install/reboot_in_progress note
EOF

echo "==> Montando ISO"
xorriso -osirrox on -indev "$NAME" -extract /isolinux/txt.cfg "$W/txt.cfg" -extract /boot/grub/grub.cfg "$W/grub.cfg" >/dev/null 2>&1
chmod u+w "$W"/*.cfg
P='auto=true priority=critical preseed/file=/cdrom/preseed.cfg'
sed -i "s#append #append $P #" "$W/txt.cfg"
sed -i "0,/linux\s\+\/install.amd\/vmlinuz/s##linux /install.amd/vmlinuz $P#" "$W/grub.cfg"
sed -i 's/^default .*/default install/; s/^timeout .*/timeout 30/' "$W/txt.cfg" || true
sed -i '1i set timeout=3\nset default=0' "$W/grub.cfg"

xorriso -indev "$NAME" -outdev nexora-radius.iso \
  -map "$W/preseed.cfg" /preseed.cfg -map "$W/nexora" /nexora \
  -map "$W/txt.cfg" /isolinux/txt.cfg -map "$W/grub.cfg" /boot/grub/grub.cfg \
  -boot_image any replay >/dev/null 2>&1
echo
echo "Pronto: $(pwd)/nexora-radius.iso"
echo "Grave num pendrive (ex.: dd if=nexora-radius.iso of=/dev/sdX bs=4M) e dê boot."
echo "ATENÇÃO: a instalação apaga o primeiro disco da máquina."
