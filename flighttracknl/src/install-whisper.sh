#!/usr/bin/env bash
# whisper.cpp op de Raspberry Pi zetten voor "meelezen" in FlightTrackNL.
#
#   sudo /opt/flighttracknl/install-whisper.sh            # base.en: snel genoeg voor callsigns
#   sudo /opt/flighttracknl/install-whisper.sh tiny.en    # nog sneller, mist meer
#   sudo /opt/flighttracknl/install-whisper.sh small.en   # nauwkeuriger, ongeveer 2x zo traag
#
# Bouwen duurt op een Pi 5 een minuut of tien. Daarna vindt FlightTrackNL het zelf:
# /usr/local/bin/whisper-cli en /opt/whisper.cpp/models/ggml-<model>.bin.
set -euo pipefail

MODEL="${1:-base.en}"
DIR=/opt/whisper.cpp
JOBS="$(nproc)"

[ "$(id -u)" -eq 0 ] || { echo "Draai dit met sudo."; exit 1; }

echo "== pakketten =="
apt-get update -qq
apt-get install -y -qq git cmake build-essential

echo "== broncode ($DIR) =="
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only
else
  git clone --depth 1 https://github.com/ggml-org/whisper.cpp "$DIR"
fi

echo "== bouwen (${JOBS} kernen) =="
cmake -S "$DIR" -B "$DIR/build" -DCMAKE_BUILD_TYPE=Release >/dev/null
cmake --build "$DIR/build" -j "$JOBS" --target whisper-cli

BIN="$DIR/build/bin/whisper-cli"
[ -x "$BIN" ] || { echo "whisper-cli niet gebouwd"; exit 1; }
ln -sf "$BIN" /usr/local/bin/whisper-cli

# Het quantize-gereedschap komt uit dezelfde boom, maar is een aparte target en werd
# vroeger niet meegebouwd. De naam verschilt per whisper.cpp-versie.
echo "== quantize =="
cmake --build "$DIR/build" -j "$JOBS" --target quantize 2>/dev/null \
  || cmake --build "$DIR/build" -j "$JOBS" --target whisper-quantize 2>/dev/null \
  || echo "quantize niet gebouwd (gaat verder; alleen het snelle model vervalt)"
QBIN="$(find "$DIR/build" -name '*quantize*' -type f -perm -u+x -print -quit 2>/dev/null || true)"
[ -n "$QBIN" ] && ln -sf "$QBIN" /usr/local/bin/whisper-quantize

echo "== model $MODEL =="
if [ ! -f "$DIR/models/ggml-$MODEL.bin" ]; then
  bash "$DIR/models/download-ggml-model.sh" "$MODEL" "$DIR/models"
fi

# Gekwantiseerd model ernaast: ongeveer twee keer zo snel op een Pi 5, omdat het
# geheugenverkeer halveert. FlightTrackNL pakt -q5_0 vanzelf boven het gewone bestand.
#
# Let op de opruiming: een model dat al gequantiseerd is (veel ATC-modellen staan in q8_0)
# laat whisper-quantize halverwege vallen met "unsupported ttype", en het half geschreven
# bestand blijft anders staan. Dat laadt zonder klacht en levert nooit een callsign op.
Q="$DIR/models/ggml-$MODEL-q5_0.bin"
if [ -n "$QBIN" ] && [ ! -f "$Q" ]; then
  echo "== quantiseren ($MODEL -> q5_0) =="
  if "$QBIN" "$DIR/models/ggml-$MODEL.bin" "$Q" q5_0 > /tmp/quant.log 2>&1; then
    echo "   $(du -h "$Q" | cut -f1) (was $(du -h "$DIR/models/ggml-$MODEL.bin" | cut -f1))"
  else
    rm -f "$Q"
    echo "   gaat niet -- $MODEL is waarschijnlijk al gequantiseerd; blijft zoals het is"
    grep -i 'unsupported\|error' /tmp/quant.log | tail -1 || true
  fi
fi
chmod -R a+rX "$DIR/models"

echo "== proef =="
whisper-cli -m "$DIR/models/ggml-$MODEL.bin" -f "$DIR/samples/jfk.wav" -nt -np -t "$JOBS" || true

cat <<EOF

Klaar. In FlightTrackNL verschijnt de knop TXT in de spelerbalk (Ctrl+F5 in de browser).
Ander model kiezen: draai dit script opnieuw met tiny.en, base.en of small.en.
Vastzetten in config.json onder "stt":
  "bin": "/usr/local/bin/whisper-cli",
  "model": "$DIR/models/ggml-$MODEL.bin",
  "threads": $JOBS

Staat er een ggml-<model>-q5_0.bin naast, dan gebruikt FlightTrackNL die vanzelf: zelfde
model, ongeveer twee keer zo snel. Zelf een bestaand model quantiseren kan met:
  sudo whisper-quantize $DIR/models/ggml-atc-small.bin $DIR/models/ggml-atc-small-q5_0.bin q5_0
EOF
