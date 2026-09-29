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
| `observer_lat`, `observer_lon`, `observer_label` | no marker for your own position |

### Keys

Filling in a key also switches that feed on. Leave one empty and that feed simply stays off.

| Field | What it unlocks |
|---|---|
| `key_openaip` | Airspace outlines: CTRs, TMAs, danger and restricted areas |
| `key_schiphol_id`, `key_schiphol_secret` | Schiphol's own feed: registration, gate, pier, terminal, codeshares |
| `key_opensky_id`, `key_opensky_secret` | Learns overnight which routes are usual at your home fields |
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
| `whisper_enabled` | Off switch for recognition as a whole |
| `whisper_model` | A path, or a short name such as `atc-small`. Empty means: use whatever is in `/share/whisper/`, preferring a model trained on ATC. |
| `whisper_threads` | How many cores whisper may use. **Do not give it all of them** — this machine also runs your house. The default of 2 is deliberate; on four threads, 3 is a sensible ceiling. |

### External addresses

These arrive filled in with the addresses actually in use, so you can see where your data comes
from and redirect it if a source moves or you want to run a mirror. The placeholders in braces —
`{lat}`, `{radius}`, `{z}/{x}/{y}`, `{callsign}`, `{iata}`, `{box}`, `{page}` — are filled in by
the tracker and have to stay.

| Field | Feeds |
|---|---|
| `url_positions_1`, `url_positions_2` | Aircraft positions. Two sources, tried in order, with automatic failover and a return to the first once it answers again. adsb.lol and adsb.fi by default; both are free. |
| `url_airport_ehrd`, `url_airport_eheh`, `url_teletext` | The flight board. Rotterdam The Hague and Eindhoven publish their own feeds; Maastricht, Groningen and Schiphol come from NOS teletext. |
| `url_schiphol_token`, `url_schiphol_base`, `url_schiphol_audience` | Schiphol's own endpoints, used with the key above |
| `url_opensky_token`, `url_opensky_base` | OpenSky's endpoints, used with the key above |
| `url_openaip` | The OpenAIP airspace endpoint |
| `url_routes`, `url_routes_hexdb` | Origin and destination per callsign. hexdb goes first (measured 96% correct against adsbdb), adsbdb is the second opinion. |
| `url_airframes` | Type and registration, from the OpenSky aircraft database. Downloads a large file once a month. |
| `url_photos_hex`, `url_photos_reg` | Aircraft photographs |
| `url_logos` | Airline logos for the flight board, fetched once and cached locally |
| `url_ourairports` | Airports, runways and frequencies |
| `url_navdata_fix`, `url_navdata_nav`, `url_navdata_awy` | Navaids, waypoints and airways |
| `url_tiles_night`, `url_tiles_day`, `url_tiles_sat`, `url_tiles_ref` | The four map layers |
| `url_metar`, `url_sigmet`, `url_rain`, `url_rain_tile` | Weather: METAR, SIGMET and the rain radar |

Nothing in the tracker reaches an address that is not in this list.

## 3. Start it

Start the add-on and open the web interface from its page. It also listens on port `8090`, so
`http://<your-home-assistant>:8090` works from your own network.

If something is missing, the log says so in plain words rather than failing silently — no speech
model, no receiver files, a configuration file it is ignoring.

## 4. Listening, if you have a receiver

Two things have to be in place.

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
