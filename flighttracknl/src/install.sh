#!/usr/bin/env bash
# FlightTrackNL - installeert of werkt bij op de Raspberry Pi als systemd-service.
# Gebruik: sudo ./install.sh              bestaande config.json blijft staan
#          sudo ./install.sh --config     config.json vervangen, oude bewaard als config.json.oud
set -euo pipefail

FORCE_CONFIG=0
[[ "${1:-}" == "--config" ]] && FORCE_CONFIG=1

[[ $EUID -eq 0 ]] || { echo "Start met: sudo ./install.sh"; exit 1; }

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST=/opt/flighttracknl
SERVICE=flighttracknl
OLD_DEST=/opt/luchtruim
OLD_SERVICE=luchtruim

# De naam is veranderd van luchtruim naar flighttracknl: oude installatie overnemen en opruimen.
if [[ -d "$OLD_DEST" && ! -d "$DEST" ]]; then
  echo "Oude installatie gevonden in $OLD_DEST, die wordt overgenomen."
  systemctl stop "$OLD_SERVICE" 2>/dev/null || true
  systemctl disable "$OLD_SERVICE" 2>/dev/null || true
  rm -f "/etc/systemd/system/$OLD_SERVICE.service"
  systemctl daemon-reload
  pkill -f "$OLD_DEST/server.py" 2>/dev/null || true   # ook een handmatig gestart proces
  mv "$OLD_DEST" "$DEST"
fi
RUN_USER="${SUDO_USER:-pi}"

command -v python3 >/dev/null || { echo "python3 ontbreekt"; exit 1; }

# config: bestaande configuratie op de Pi nooit overschrijven
install -d "$DEST"
if [[ -f "$DEST/config.json" && $FORCE_CONFIG -eq 0 ]]; then
  if ! cmp -s "$SRC/config.json" "$DEST/config.json"; then
    cp "$SRC/config.json" "$DEST/config.json.nieuw"
    echo "Bestaande config.json behouden; nieuwe standaard staat in $DEST/config.json.nieuw"
  fi
else
  if [[ -f "$DEST/config.json" ]]; then
    cp "$DEST/config.json" "$DEST/config.json.oud"
    echo "Oude config.json bewaard als $DEST/config.json.oud"
  fi
  cp "$SRC/config.json" "$DEST/config.json"
  rm -f "$DEST/config.json.nieuw"
fi
PORT=$(python3 -c "import json;print(json.load(open('$DEST/config.json')).get('port',8090))")

# poort vrij? (tenzij onze eigen service er al op draait)
port_free() {
  python3 - "$PORT" <<'PYEOF' 2>/dev/null
import socket, sys
s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)   # zelfde instelling als de server
try:
    s.bind(("0.0.0.0", int(sys.argv[1])))
    s.close()
except OSError:
    sys.exit(1)
PYEOF
}

if ! systemctl is-active --quiet "$SERVICE"; then
  for _ in $(seq 1 15); do port_free && break; sleep 1; done   # even geduld na het stoppen
  if ! port_free; then
    echo "Poort $PORT is nog in gebruik door:"
    (ss -ltnp 2>/dev/null | grep ":$PORT " || lsof -i ":$PORT" 2>/dev/null || echo "  onbekend proces")
    echo "Stop dat proces, of kies een andere 'port' in $DEST/config.json, en start opnieuw."
    exit 1
  fi
fi

# bestanden
install -m 0755 "$SRC/server.py" "$DEST/server.py"
if [ -f "$SRC/install-whisper.sh" ]; then install -m 0755 "$SRC/install-whisper.sh" "$DEST/install-whisper.sh"; fi
rm -rf "$DEST/web"
cp -r "$SRC/web" "$DEST/web"
install -d "$DEST/cache"
chown -R "$RUN_USER": "$DEST"

cat > /etc/systemd/system/$SERVICE.service <<UNIT
[Unit]
Description=FlightTrackNL (adsb.lol, adsb.fi)
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_USER
WorkingDirectory=$DEST
ExecStart=/usr/bin/python3 $DEST/server.py
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1
Nice=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null
systemctl restart "$SERVICE"
sleep 2
systemctl is-active --quiet "$SERVICE" || { journalctl -u "$SERVICE" -n 30 --no-pager; exit 1; }

echo
echo "FlightTrackNL draait op poort $PORT."
echo "  lokaal:    http://$(hostname -I | awk '{print $1}'):$PORT"
if command -v tailscale >/dev/null && TS=$(tailscale ip -4 2>/dev/null | head -1) && [[ -n "$TS" ]]; then
  echo "  tailscale: http://$TS:$PORT"
fi
echo "Log bekijken: journalctl -u $SERVICE -f"
