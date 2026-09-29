#!/usr/bin/with-contenv bashio
# Start FlightTrackNL. Wat per installatie verschilt komt uit de add-on-instellingen; de rest
# staat in config.json, dat buiten het image leeft zodat een update hem niet overschrijft.
set -e

DATA=/data                           # blijft staan over updates heen en zit in de HA-back-up
MODELS=/share/whisper
export FT_CACHE="$DATA/cache"
mkdir -p "$FT_CACHE"

# config.json mag op twee plekken staan:
#
#   /config/config.json               -> /addon_configs/<slug>/ op de machine. De nette plek:
#                                        van deze add-on, niet zichtbaar voor andere add-ons.
#   /share/flighttracknl/config.json  -> /share/ op de machine. Werkt altijd met Samba, want
#                                        share is een standaard-share; addon_configs moet je
#                                        er apart in aanzetten en dat is lang niet overal zo.
#
# Staan ze er allebei, dan wint de NIEUWSTE. Een vaste volgorde leek logischer maar zette een
# val: een eerdere versie zette zijn kale beginbestand in /config, en dat won daarna van de
# echte config die je in /share had gezet -- zonder dat iets je vertelde waarom je gebieden en
# sleutels weg waren. Met de nieuwste wint het bestand dat je zojuist hebt neergezet, waar je
# het ook zet, en het logboek zegt wat hij liet liggen.
CFG=""
for kandidaat in /config/config.json /share/flighttracknl/config.json; do
  [ -f "$kandidaat" ] || continue
  if [ -z "$CFG" ] || [ "$kandidaat" -nt "$CFG" ]; then
    [ -n "$CFG" ] && OUD="$CFG"
    CFG="$kandidaat"
  else
    OUD="$kandidaat"
  fi
done

if [ -n "$CFG" ]; then
  bashio::log.info "config.json: ${CFG}"
  [ -n "${OUD:-}" ] && bashio::log.warning "there is an older one in ${OUD}; it is being ignored"
else
  # Neerzetten waar je er zeker bij kunt, anders staat het beginnetje op een plek die je niet
  # kunt openen en kom je geen stap verder.
  CFG=/share/flighttracknl/config.json
  mkdir -p /share/flighttracknl
  bashio::log.warning "No config.json yet; writing a starting one to ${CFG}."
  bashio::log.warning "That is \\\\<your-home-assistant>\\share\\flighttracknl\\config.json."
  bashio::log.warning "Fill it in with your own settings -- keys, areas, sources -- or copy"
  bashio::log.warning "an existing config.json there, then restart the add-on."
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
export FT_CONFIG="$CFG"

# Het model hoort niet in het image: 264 MB meeslepen bij elke versie is zonde, en het
# ATC-model is niet vrij te downloaden. Zet het met de Samba-add-on in share/whisper/.
# Half geschreven modellen slaat de server zelf over; hier alleen een duidelijke melding.
if ls "$MODELS"/ggml-*.bin >/dev/null 2>&1; then
  bashio::log.info "speech models in ${MODELS}:"
  for f in "$MODELS"/ggml-*.bin; do
    bashio::log.info "   $(basename "$f") ($(( $(stat -c%s "$f") / 1048576 )) MB)"
  done
else
  bashio::log.warning "No speech model in ${MODELS}. Listening stays off until you put one"
  bashio::log.warning "there, for example ggml-atc-small.bin. Everything else works."
fi

if [ ! -f /share/openwebrx/settings.json ]; then
  bashio::log.warning "No /share/openwebrx/settings.json. Without it the tracker does not know"
  bashio::log.warning "your receiver profiles and cannot switch bands. Copy settings.json and"
  bashio::log.warning "bookmarks.json from your receiver into /share/openwebrx/."
fi

cd /app
exec python3 -u server.py
