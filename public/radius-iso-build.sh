#!/usr/bin/env bash
# Nexora ISP — gera uma ISO Debian 12 que instala sozinha o servidor RADIUS
# Uso (em qualquer Linux): bash radius-iso-build.sh URL_DO_PAINEL TOKEN SENHA_ROOT [TOKEN_CLOUDFLARE_TUNNEL]
# Resultado: nexora-radius.iso  (ATENÇÃO: a instalação APAGA o primeiro disco)
set -euo pipefail
PANEL_URL="${1:-}"; TOKEN="${2:-}"; ROOTPW="${3:-}"; CFTOKEN="${4:-}"
if [ -z "$PANEL_URL" ] || [ -z "$TOKEN" ] || [ -z "$ROOTPW" ]; then
  echo "Uso: bash radius-iso-build.sh URL_DO_PAINEL TOKEN SENHA_ROOT [TOKEN_CLOUDFLARE_TUNNEL]"; exit 1; fi
PANEL_URL="${PANEL_URL%/}"
FINAL=$(curl -sL -o /dev/null -m 20 -w '%{url_effective}' "$PANEL_URL/" || true)
[ -n "$FINAL" ] && PANEL_URL="${FINAL%/}"
command -v xorriso >/dev/null || { echo "Instale o xorriso (apt install xorriso)"; exit 1; }
command -v curl >/dev/null || { echo "Instale o curl"; exit 1; }

BASE=https://cdimage.debian.org/cdimage/archive/latest-oldstable/amd64/iso-cd
[ "$(curl -s -o /dev/null -w '%{http_code}' $BASE/)" = 200 ] || BASE=https://cdimage.debian.org/debian-cd/current/amd64/iso-cd
NAME=$(curl -s "$BASE/" | grep -o 'debian-12[0-9.]*-amd64-netinst.iso' | head -1)
[ -n "$NAME" ] || { echo "Não encontrei a ISO do Debian 12."; exit 1; }

W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
[ -f "$NAME" ] || { echo "==> Baixando $NAME"; curl -L -o "$NAME" "$BASE/$NAME"; }

mkdir -p "$W/nexora"
curl -fsSL "$PANEL_URL/radius-install.sh" -o "$W/nexora/install.sh"
printf 'PANEL_URL=%q\nTOKEN=%q\n' "$PANEL_URL" "$TOKEN" > "$W/nexora/env"
printf '%s\n' "$ROOTPW" > "$W/nexora/webpw"
[ -n "$CFTOKEN" ] && printf '%s\n' "$CFTOKEN" > "$W/nexora/cftoken"
cat > "$W/nexora/issue" <<'EOF'
Nexora RADIUS - painel web local: http://\4  (usuario: admin, senha: a mesma do root)

EOF
cat > "$W/nexora/nexora-firstboot.service" <<'EOF'
[Unit]
Description=Nexora RADIUS primeira inicialização
After=network-online.target
Wants=network-online.target
ConditionPathExists=/opt/nexora/env
[Service]
Type=oneshot
ExecStart=/bin/bash -c '. /opt/nexora/env && bash /opt/nexora/install.sh "$PANEL_URL" "$TOKEN" && cp /opt/nexora/issue /etc/issue && systemctl disable nexora-firstboot.service'
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
d-i pkgsel/include string curl ca-certificates sudo
popularity-contest popularity-contest/participate boolean false
d-i grub-installer/only_debian boolean true
d-i grub-installer/bootdev string default
d-i preseed/late_command string mkdir -p /target/opt/nexora; cp /cdrom/nexora/* /target/opt/nexora/; chmod 600 /target/opt/nexora/env /target/opt/nexora/cftoken 2>/dev/null || true; cp /cdrom/nexora/nexora-firstboot.service /target/etc/systemd/system/; mkdir -p /target/etc/ssh/sshd_config.d /target/etc/sudoers.d; echo 'PermitRootLogin yes' > /target/etc/ssh/sshd_config.d/permit-root.conf; in-target systemctl enable nexora-firstboot.service
d-i finish-install/reboot_in_progress note
EOF

echo "==> Montando ISO"
# Instalacao somente em modo texto (sem instalador grafico)
P='auto=true priority=critical preseed/file=/cdrom/preseed.cfg'
cat > "$W/isolinux.cfg" <<EOF
default nexora
prompt 0
timeout 30
label nexora
  kernel /install.amd/vmlinuz
  append $P vga=788 initrd=/install.amd/initrd.gz --- quiet
EOF
cat > "$W/grub.cfg" <<EOF
set timeout=3
set default=0
insmod all_video
menuentry 'Instalar Nexora RADIUS (modo texto)' {
  linux /install.amd/vmlinuz $P --- quiet
  initrd /install.amd/initrd.gz
}
EOF

xorriso -indev "$NAME" -outdev nexora-radius.iso \
  -map "$W/preseed.cfg" /preseed.cfg -map "$W/nexora" /nexora \
  -map "$W/isolinux.cfg" /isolinux/isolinux.cfg -map "$W/grub.cfg" /boot/grub/grub.cfg \
  -boot_image any replay >/dev/null 2>&1
echo
echo "Pronto: $(pwd)/nexora-radius.iso"
echo "Grave num pendrive (ex.: dd if=nexora-radius.iso of=/dev/sdX bs=4M) e dê boot."
echo "ATENÇÃO: a instalação apaga o primeiro disco da máquina."
