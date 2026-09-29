#!/usr/bin/with-contenv bashio
# Start FlightTrackNL. What differs per installation comes from the add-on options; anything
# they do not cover lives in config.json, outside the image so an update cannot overwrite it.
set -e

DATA=/data                           # survives updates and is part of the Home Assistant backup
MODELS=/share/whisper
export FT_CACHE="$DATA/cache"
mkdir -p "$FT_CACHE"

# config.json may live in either of two places:
#
#   /config/config.json               -> /addon_configs/<slug>/ on the machine. The tidy spot:
#                                        this add-on's own, invisible to other add-ons.
#   /share/flighttracknl/config.json  -> /share/ on the machine. Always reachable over Samba,
#                                        because share is a default share; addon_configs has to
#                                        be enabled separately and often is not.
#
# If both exist, the NEWER one wins. A fixed order looked more logical but laid a trap: an
# earlier version wrote its bare starting file to /config, and from then on that beat the real
# configuration in /share -- with nothing telling you why your areas and keys had gone. With
# newest-wins, the file you just put down wins wherever you put it, and the log says which one
# it left alone.
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
  # Put it where you can certainly reach it; otherwise the starting file ends up somewhere you
  # cannot open and you are no further along.
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

# Home Assistant writes the filled-in add-on options here. The server lays them over config.json;
# an empty field does not count, so anything you leave alone stays as it was.
export FT_OPTIONS=/data/options.json

# The model does not belong in the image: dragging 264 MB along with every version is wasteful,
# and the ATC model is not freely redistributable. Put it in share/whisper/ with the Samba add-on.
# The server skips half-written models by itself; this is only a clear message about it.
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
