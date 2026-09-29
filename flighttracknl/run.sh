#!/usr/bin/with-contenv bashio
# Start FlightTrackNL. Wat per installatie verschilt komt uit de add-on-instellingen; de rest
# staat in config.json, dat buiten het image leeft zodat een update hem niet overschrijft.
set -e

CFG=/config/config.json              # -> /addon_configs/<slug>/config.json op de machine
DATA=/data                           # blijft staan over updates heen en zit in de HA-back-up
MODELS=/share/whisper
export FT_CACHE="$DATA/cache"
export FT_CONFIG="$CFG"
mkdir -p "$FT_CACHE"

# Eerste start: een beginnetje neerzetten met het adres van de ontvanger erin, zodat de add-on
# meteen iets doet en jij hem daarna met de File Editor aanvult of van de Pi kopieert.
if [ ! -f "$CFG" ]; then
  bashio::log.warning "Nog geen config.json; ik zet een beginnetje neer in ${CFG}."
  bashio::log.warning "Vul hem aan met je eigen instellingen -- sleutels, gebieden, bronnen --"
  bashio::log.warning "of kopieer de config.json van de Pi erheen, en herstart de add-on."
  cat > "$CFG" <<JSON
{
  "center": { "lat": 52.13, "lon": 4.60 },
  "radius_nm": 250,
  "home_airport": "EHRD",
  "openwebrx": {
    "host": "$(bashio::config 'openwebrx_host')",
    "port": 8073,
    "settings_file": "/share/openwebrx/settings.json",
    "bookmarks_file": "/share/openwebrx/bookmarks.json"
  },
  "stt": {
    "enabled": true,
    "threads": $(bashio::config 'whisper_threads')
  }
}
JSON
fi

# Het model hoort niet in het image: 264 MB meeslepen bij elke versie is zonde, en het
# ATC-model is niet vrij te downloaden. Zet het met de Samba-add-on in share/whisper/.
# Half geschreven modellen slaat de server zelf over; hier alleen een duidelijke melding.
if ls "$MODELS"/ggml-*.bin >/dev/null 2>&1; then
  bashio::log.info "spraakmodellen in ${MODELS}:"
  for f in "$MODELS"/ggml-*.bin; do
    bashio::log.info "   $(basename "$f") ($(( $(stat -c%s "$f") / 1048576 )) MB)"
  done
else
  bashio::log.warning "Geen spraakmodel in ${MODELS}. Meeluisteren blijft uit tot je er een"
  bashio::log.warning "neerzet, bijvoorbeeld ggml-atc-small.bin van de Pi. De rest werkt wel."
fi

if [ ! -f /share/openwebrx/settings.json ]; then
  bashio::log.warning "Geen /share/openwebrx/settings.json. Zonder dat bestand kent de tracker"
  bashio::log.warning "de profielen van je ontvanger niet en kan hij niet van band wisselen."
  bashio::log.warning "Draai tools/owrx-naar-ha.ps1 om hem erheen te kopieren."
fi

cd /app
exec python3 -u server.py
