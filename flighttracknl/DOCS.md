# FlightTrackNL — setting it up

This walks a fresh installation from nothing to a working tracker. Everything you have to fill in
is on the add-on's **Configuration** tab; you do not need to create or edit a file to get started.

![The radar plan view with live traffic around Amsterdam](https://raw.githubusercontent.com/RMF7916/ha-addons/main/flighttracknl/images/radarplot.png)

![The 3D view, an approach into Schiphol](https://raw.githubusercontent.com/RMF7916/ha-addons/main/flighttracknl/images/3d-view.png)

![The weather panel with METARs and SIGMETs](https://raw.githubusercontent.com/RMF7916/ha-addons/main/flighttracknl/images/weather.png)

---

## Before you start

You need none of this to see traffic on the map, but it decides what else works.

| | |
|---|---|
| **A machine on amd64** | The add-on compiles whisper.cpp while it installs — about ten minutes on two cores, once per version. |
| **Free API keys, if you want them** | [OpenAIP](https://www.openaip.net) for airspace outlines, [Schiphol](https://developer.schiphol.nl) for that airport's own flight data, [OpenSky](https://opensky-network.org) for overnight route learning. Positions, weather and the flight board need no key at all. |
| **An OpenWebRX+ receiver, if you want to listen** | Anywhere on your network. It stays where it is; the tracker talks to it over the network. |
| **A speech model, if you want callsigns recognised** | Only useful with a receiver, and it has to be a model fine-tuned on air traffic control. See *Listening*. |

## 1. Install the add-on

Settings → Add-ons → Add-on store → ⋮ (top right) → **Repositories** → paste the repository URL.
**FlightTrackNL** then appears at the bottom of the store. Install it, but do not start it yet —
fill in the configuration first so that the first start already does what you want.

## 2. Fill in the Configuration tab

Everything a new installation needs is here: where you are looking, every API key, and every
external address the tracker fetches from.

### Listening on or off

`listening` is the first field and it is **off** by default. Most installations have no SDR, and a
receiver you do not have should not leave a player, a channel list and frequency buttons scattered
across the screen. With it off there is no radio anywhere in the interface, and the addresses
behind it answer 404.

It is a switch, not a text field, so it is never "not filled in" and it always decides — including
over `config.json`. That is the point: otherwise there would be no way to turn listening off.

**Switching it off wipes nothing.** `config.json`, the recordings, the learned pronunciations and
your channel choices all stay exactly where they are. Switch it back on and everything is as you
left it. You can flip it as often as you like.

**An empty field means "not filled in", never "make empty".** Leave a field alone and the built-in
default applies — or, if you have a `config.json` (see *Advanced* below), whatever is in that. So
you only fill in what you want to be different. On every start, the log says which fields it took
from this screen.

### Where you are looking

| Field | Leave empty and you get |
|---|---|
| `lat`, `lon` | Schiphol (52.31, 4.76) |
| `radius_nm` | 250 NM. Larger costs more from the position sources and more memory. |
| `home_airport` | `EHAM` — the field the flight board and the airport buttons start on |
| `trail_minutes` | 15 minutes of trail history |
| `observer_lat`, `observer_lon`, `observer_label` | where you are: asked from the browser, or placed by hand on the map |
| `antenne_lat`, `antenne_lon`, `antenne_label`, `antenne_agl_m` | where the receiving antenna stands: taken from OpenWebRX; antenna height 10 m — see below |

### You and your antenna are two different places

The map centre is what you are looking at. **You** are where you stand, and that moves — at a spotting place you are somewhere else than at home. The **antenna** is where the signal comes in, and that is a fixed installation that does not travel with you.

Only the antenna says anything about reception, so that is the one the range figures hang on and the one every recording in the learning screen measures its distance from. Only where you stand says anything about where to look, so that is the one the distance, bearing and elevation in the flight details are worked out from. A mast is drawn on the antenna in both views; a circle with a cross marks where you stand. Stand at the mast and only the mast is drawn — two symbols on one spot are not extra information.

**The antenna.** Leave `antenne_lat` and `antenne_lon` empty and the server asks OpenWebRX where it stands: a receiver knows its own position and publishes it on `/status.json`, with its name and height above sea level. The answer is kept on disk, so a restart while the receiver is off does not take the mast off the map. Fill the fields in and that wins, as everywhere. `antenne_agl_m` is the height of the antenna above the ground, not the height of the terrain; it sets the radio horizon and the range figures in the troposphere block. Without a receiver and without coordinates there is no mast — which is correct, since there is then nothing receiving.

**Where you stand.** Filled in here, it wins and stays put. Otherwise the browser is asked — but browsers only release a location over https, so over the local address on http nothing comes of it. Either way you can long-press (or right-click) anywhere on the map to put yourself there; that stays through a reload, and the same press on the marker takes it away again.

### Keys

Filling in a key also switches that feed on. Leave one empty and that feed simply stays off.

| Field | What it unlocks |
|---|---|
| `key_openaip` | Airspace outlines: CTRs, TMAs, danger and restricted areas |
| `key_schiphol_id`, `key_schiphol_secret` | Schiphol's own feed: registration, gate, pier, terminal, codeshares |
| `key_opensky_id`, `key_opensky_secret` | Learns overnight which routes are usual at your home fields |
| `key_carto` | Only if you point the map layers at CARTO. Free, no account: request it with an e-mail address at <https://carto.com/basemaps/> and it arrives by mail. Without one, CARTO serves blank tiles stamped API KEY REQUIRED. Put the key here, not in the URL: write `{key}` in the tile address and it is filled in. |
| `photos_contact` | Aircraft photographs. Not a key: planespotters wants to know who is calling and puts it in the User-Agent, and refuses the request without it. An email address or a URL. |

### The receiver

| Field | Meaning |
|---|---|
| `openwebrx_host`, `openwebrx_port` | Where OpenWebRX+ runs. Empty means this machine, port 8073. |
| `openwebrx_url`, `openwebrx_tab_url` | The address of its web interface, for the panel beside the map and the button that opens it in a tab. Empty means `http://<host>:<port>`. |
| `openwebrx_settings_file`, `openwebrx_bookmarks_file` | Where you put copies of the receiver's own two files. See *Listening*. |
| `openwebrx_relay` | `auto` (default), `aan` or `uit`. See *Reaching it from outside*. |

### Listening

| Field | Meaning |
|---|---|
| `listening` | The whole listening side on or off. Off by default; see above. |
| `whisper_enabled` | Off switch for recognition as a whole |
| `whisper_model` | A path, or a short name such as `atc-small`. Empty means: use whatever is in `/share/whisper/`, preferring a model trained on ATC. |
| `whisper_threads` | How many cores whisper may use. **Do not give it all of them** — this machine also runs your house. The default of 2 is deliberate; on four threads, 3 is a sensible ceiling. |

### The map

**One key, and then you never touch this again.** The maps are CARTO's: Dark Matter in 3D at night,
Positron without place names by day, Dark Matter without place names under the RadarPlot's SAT
button, Voyager under the 3D SAT button — muted backdrops that let the traffic be the only thing
with any light in it.

The day map is recoloured on the way in: the land becomes one quiet grey (`#efefef`) and the water
sits just under it (`#d0cfd4`), so day really is a day map and not the night map with the lights
turned up. That happens in the palette of the tile itself — a CARTO tile carries a colour table of
fifty to ninety entries and nothing else — so it costs one pass over that table and no image
library. `tile_palet` in `config.json` holds the recipe and is yours to change: a ramp from the
darkest to the lightest tone, `neutraal` to run that ramp on brightness so a map with a colour cast
comes out neutral, and `water_min`/`water_van`/`water_tot` to catch the water by how much more blue
than red it carries. `tile_day_light` beside it says whether the result is a light map (which
decides the tile tint and the colour of the labels over it); `src/README.md` explains both.

The key is free and takes a minute: request it with an e-mail address at
<https://carto.com/basemaps/>, put it in **`key_carto`**, restart.

Leave `key_carto` empty and there is no map. Everything else works — traffic, weather, the flight
board, listening — but the ground stays empty and the SAT buttons are greyed out, with a line under
the map saying why. That is deliberate: CARTO answers a request without a key with a tile that has
"API KEY REQUIRED" stamped across it, and their terms forbid removing or working around that
watermark, so the tracker does not ask.

Until 1.72.0 the no-key case fell back to Esri, which answers without a token. Answering is not the
same as being allowed: Esri's terms grant that use only with an ArcGIS subscription and specifically
forbid harvesting and self-hosting their tiles, which is what a tile cache does. Esri is gone, and
an arcgisonline address left behind in a `config.json` is dropped at startup with a line in the log.

Want something else, the four addresses are yours to set (`url_tiles_night`, `_day`, `_sat`,
`_radar`). `{z}/{x}/{y}` is the usual order, `{key}` is replaced by `key_carto` and `{s}` by a
letter a-d. An address without `{key}` needs no key, so your own tile server works without one. The
transparent place-name layer follows from the map underneath — needed where a map has no letters of
its own, wrong where it has — so there is no switch for it; `tile_ref` in `config.json` overrules it
if you ever need to.

Tiles are cached on disk, and the cache folder is named after the address — change the address and
the old tiles stay where they are instead of being served to you by mistake. They are not deleted;
remove `cache/tiles*_<code>` yourself if you want the space back.

Keep the attribution line under the map correct (`tile_attribution`). It is not decoration: CARTO
and OpenStreetMap both require a visible, prescribed credit, and it is the condition under which
those tiles may be shown at all. [LICENSES.md](LICENSES.md) lists every source, what it requires,
and which three are non-commercial.

### External addresses

**These start empty, and empty means the address below is used.** They are there so you can
redirect a feed when a source moves, or point it at your own mirror — not so that the screen
imposes a value on you. The placeholders in braces are filled in by the tracker and have to stay.

| Field | Feeds | Address used when empty |
|---|---|---|
| `url_positions_1` | Aircraft positions, first source | `https://api.adsb.lol/v2/point/{lat}/{lon}/{radius}` |
| `url_positions_2` | Second source, taken over automatically when the first stops answering | `https://opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/{radius}` |
| `url_airport_ehrd` | Flight board, Rotterdam The Hague | `https://www.rotterdamthehagueairport.nl/wp-json/rtha/v2/flights` |
| `url_airport_eheh` | Flight board, Eindhoven | `https://www.eindhovenairport.nl/api/flights` |
| `url_teletext` | Flight board, Maastricht / Groningen / Schiphol | `https://teletekst-data.nos.nl/json/{page}` |
| `url_schiphol_token` | Schiphol, used with the key above | `https://api.auth.schiphol.nl/oauth/token` |
| `url_schiphol_base` | | `https://api.schiphol.nl/public/public-flights/v4` |
| `url_schiphol_audience` | | `https://api.schiphol.nl/public` |
| `url_opensky_token` | OpenSky, used with the key above | `https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token` |
| `url_opensky_base` | | `https://opensky-network.org/api` |
| `url_openaip` | Airspace outlines | `https://api.core.openaip.net/api/airspaces` |
| `url_routes_hexdb` | Origin and destination, first source (measured 96% correct) | `https://hexdb.io/api/v1/route/icao/{callsign}` |
| `url_routes` | Second opinion on routes | `https://api.adsbdb.com/v0/callsign/{callsign}` |
| `url_airframes` | Type and registration. Downloads a large file once a month. | `https://s3.opensky-network.org/data-samples/metadata/aircraftDatabase.csv` |
| `url_photos_hex` | Aircraft photographs by ICAO hex | `https://api.planespotters.net/pub/photos/hex/{hex}` |
| `url_photos_reg` | …and by registration | `https://api.planespotters.net/pub/photos/reg/{reg}` |
| `url_logos` | Airline logos, fetched once and cached locally | `https://images.kiwi.com/airlines/64/{iata}.png` |
| `url_ourairports` | Airports, runways and frequencies | `https://davidmegginson.github.io/ourairports-data/` |
| `url_navdata_fix` | Waypoints | `…/x-plane-navdata/master/earth_fix.dat` |
| `url_navdata_nav` | Navaids | `…/x-plane-navdata/master/earth_nav.dat` |
| `url_navdata_awy` | Airways | `…/x-plane-navdata/master/earth_awy.dat` |
| `url_tiles_night` | Map, dark | `…/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}` |
| `url_tiles_day` | Map, light | `…/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}` |
| `url_tiles_sat` | Satellite | `…/World_Imagery/MapServer/tile/{z}/{y}/{x}` |
| `url_tiles_ref` | Place names over the satellite layer | `…/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}` |
| `url_metar` | Weather per field | `https://aviationweather.gov/api/data/metar?bbox={box}&format=json` |
| `url_sigmet` | Weather warnings | `https://aviationweather.gov/api/data/isigmet?format=json` |
| `url_rain` | Rain radar index | `https://api.rainviewer.com/public/weather-maps.json` |
| `url_rain_tile` | Rain radar tiles | `{host}{path}/256/{z}/{x}/{y}/4/1_1.png` |

Nothing in the tracker reaches an address that is not in this list.

**One caveat for a position source of your own.** Each source hands the aircraft over under its
own key in the response — `ac` for adsb.lol, `aircraft` for adsb.fi. For those two the key follows
the address automatically. Point one of the fields at something else and you also have to set
`sources[n].key` in `config.json`, otherwise the tracker fetches data perfectly happily and finds
nothing in it. The log warns when it does not recognise the source.

## 3. Start it

Start the add-on and open the web interface from its page. It also listens on port `8090`, so
`http://<your-home-assistant>:8090` works from your own network.

If something is missing, the log says so in plain words rather than failing silently — no speech
model, no receiver files, a configuration file it is ignoring.

## 4. Listening, if you have a receiver

First turn **`listening`** on in the Configuration tab; it is off by default. Then two things have
to be in place.

**The speech model.** Put it in `/share/whisper/` — with the Samba add-on that is
`\\<your-home-assistant>\share\whisper\`. It is not shipped in the image: models are large, and
the one that matters here is fine-tuned on ATC audio rather than freely redistributable. A general
whisper model will load happily and produce fluent English that is wrong; measured on ATC
recordings, `base.en` and `small.en` recover almost no callsigns.

**The receiver's two files.** Copy `settings.json` and `bookmarks.json` from the machine running
OpenWebRX+ to somewhere this add-on can read, for example `/share/openwebrx/`, and point
`openwebrx_settings_file` and `openwebrx_bookmarks_file` at them.

That copying looks clumsy, so here is why it is not laziness. The obvious route would be to ask
OpenWebRX for its profiles and bookmarks over the websocket. Measured on 2026-09-29, that route is
incomplete: the `profiles` message returned 4 profiles where the receiver has many more — seemingly
only those of the SDR device active at that moment — and bookmarks arrive only for the band of the
selected profile: 95 against 219 from the file. OpenWebRX also bans an address that reconnects too
often, and then there is no audio at all. The websocket route is still there as a fallback when the
files are missing, with a generous pause after a `backoff`. You only have to copy again when you
change something on the receiver.

## 5. Reaching it from outside your home

Your receiver does not need to be on the internet for this. Your browser talks only to the add-on,
which fetches the audio from OpenWebRX and passes it through: browser → add-on → receiver. Because
that is then the same origin as the page, it automatically becomes `wss://` on an `https://`
page — a `ws://` to a private address is refused there as mixed content.

Two things make it work, and both are on by default:

- **Ingress.** Home Assistant serves the tracker under its own address, behind its own login. If
  you can reach Home Assistant from outside, the tracker comes along — no second hostname, no
  extra port exposed.
- **`openwebrx_relay`.** `auto` passes the audio through as soon as the page arrives over https
  and stays direct at home on http, which saves a hop. `aan` always passes through, `uit` never
  does.

At most four listeners at a time, and a new listener waits a second if it has to. That is caution,
not thrift: each listener is its own connection to OpenWebRX, and OpenWebRX bans an address that
connects too rapidly.

What does not travel outside is the **OpenWebRX panel** beside the map. That is an `<iframe>`
holding the receiver's entire web interface; carrying it out would mean proxying a whole web
application instead of one audio stream, and it uses absolute paths of its own. From outside, that
panel stays empty. Audio, channels, scanning and recognition all work.

## 6. Advanced: `config.json`

You can ignore this section until you want something the screen does not offer: named areas to
jump to, the channel list, squelch per profile, which airports the flight board polls, or
whisper's fine tuning. Those are lists and nested structures that an options form handles badly.

The file lives outside the add-on so that an update never overwrites it. Two locations are
accepted:

| Path on the machine | Seen by the add-on as |
|---|---|
| `/share/flighttracknl/config.json` | `/share/flighttracknl/config.json` |
| `/addon_configs/<slug>_flighttracknl/config.json` | `/config/config.json` |

The second is tidier — only this add-on can see it — but `/addon_configs` is not a default Samba
share, so you have to enable it before you can put a file there. `/share` always works. If both
exist, **the newer file wins**, and the log names the one it ignored.

Start the add-on without a configuration file and it writes a small starting one to
`/share/flighttracknl/config.json`. Anything you fill in on the Configuration tab is laid over
that file, so the two do not fight: the screen wins for the fields it has, the file decides the
rest.

## 7. Where things are kept

| What | Where | Why |
|---|---|---|
| `config.json` | `/share/flighttracknl/` or `/addon_configs/…` | Outside the image, so an update cannot overwrite it. |
| Cache, route database, learned pronunciations, recordings | `/data/cache` | Survives updates and is included in your Home Assistant backup. |
| Speech model | `/share/whisper/` | Too large for an image, and not freely redistributable. |
| `settings.json`, `bookmarks.json` | Wherever you pointed the two fields, e.g. `/share/openwebrx/` | Copied from the receiver; see *Listening*. |

## 8. When something is wrong

| What you see | Where to look |
|---|---|
| "listening…" and nothing else | The status carries whisper's own error. Check that a model is in `/share/whisper/` and that it is complete — a half-written file is skipped on purpose. |
| No channels | `openwebrx_bookmarks_file` points nowhere, and the websocket fallback found nothing either. |
| "frequency outside the active profile band" | Something else is holding the receiver on another profile. The OpenWebRX panel counts as a client of its own and will pull the profile back; close it while using the built-in player. |
| No audio from outside your home | Check that `openwebrx_relay` is not `uit`, and that the page really arrived over https. |
| Rate-limit errors from the position sources | Two trackers on one internet connection share one budget. Stop the other one. |
| Airspace stays empty | `key_openaip` is empty. |
| A setting on the Configuration tab seems to do nothing | The log lists the fields it took from the screen on every start. A field that is not listed was either empty or already equal to what was in use. |
