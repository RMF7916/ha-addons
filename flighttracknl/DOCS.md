# FlightTrackNL — installation and configuration

The add-on runs the tracker itself. An SDR receiver, if you have one, stays where it is: the
tracker talks to OpenWebRX+ over the network, so the receiver can sit on a Raspberry Pi in the
attic while this runs on whatever machine hosts Home Assistant.

## 1. Install

Add the repository (Settings → Add-ons → Add-on store → ⋮ → Repositories), install
**FlightTrackNL**, and start it. The first installation compiles whisper.cpp, which takes about
ten minutes on two cores. That happens once per version, not on every start.

Open the web interface from the add-on page. It also listens on port `8090` of the machine
itself, so `http://<your-home-assistant>:8090` works from your own network.

## 2. The configuration file

Almost everything lives in a `config.json` outside the add-on, so that an update never overwrites
it. Two locations are accepted:

| Path on the machine | Seen by the add-on as |
|---|---|
| `/share/flighttracknl/config.json` | `/share/flighttracknl/config.json` |
| `/addon_configs/<slug>_flighttracknl/config.json` | `/config/config.json` |

The second is tidier — only this add-on can see it — but `/addon_configs` is not a default Samba
share, so you have to enable it before you can put a file there. `/share` always works. If both
exist, **the newer file wins**, and the log names the one it ignored.

Start the add-on without a configuration file and it writes a small starting one to
`/share/flighttracknl/config.json` and says so in the log. Fill that in and restart.

A minimal file that works:

```json
{
  "center": { "lat": 52.31, "lon": 4.76 },
  "radius_nm": 250,
  "home_airport": "EHAM"
}
```

### What you are most likely to change

| Key | Meaning |
|---|---|
| `center` | Where the plot is centred, and the middle of the circle positions are fetched for. |
| `radius_nm` | How far out to fetch. Larger costs more from the position sources and more memory. |
| `home_airport` | The field the flight board and the airport buttons start on. |
| `trail_max_min` | How much history a trail keeps, in minutes. |
| `areas` | Named places you can jump to, each with a radius. |
| `observer` | Your own position, drawn as a marker. Leave the coordinates empty to omit it. |
| `tile_attribution` | The credit line under the map. Change it if you change the tile source. |

### Position sources

`sources` is a list, tried in order, with automatic failover and a return to the first one once it
answers again. Each entry has a `name`, a `url` containing `{lat}`, `{lon}` and `{radius}`, and
the `key` that holds the aircraft array in the response. The two defaults, adsb.lol and adsb.fi,
need no key of your own.

### Optional feeds

All of these are off, or harmless, without credentials.

| Block | What it adds | Needs |
|---|---|---|
| `openaip` | Airspace outlines: CTRs, TMAs, danger and restricted areas. | A free OpenAIP key in `api_key`. |
| `schiphol` | Schiphol's own flight feed: registration, gate, pier, terminal, codeshares. | A free Schiphol API client id and secret. |
| `airports_live` | The flight board for the Dutch fields, from each airport's own source, with teletext as a fallback. | Nothing. |
| `routes` | Origin and destination per callsign, from adsbdb. | Nothing. |
| `airframes` | Type and registration from the OpenSky aircraft database. | Nothing, but it downloads a large file once a month. |
| `logos` | Airline logos on the flight board, fetched once and cached locally. | Nothing. |
| `opensky` | Learns overnight which routes are usual at your home fields. | An OpenSky client id and secret. |
| `weather` | METAR, SIGMET and rain radar. | Nothing. |

### Listening (`openwebrx`)

| Key | Meaning |
|---|---|
| `host` | Where OpenWebRX+ runs. Empty or `127.0.0.1` means this machine. |
| `port` | Its port; `8073` by default. |
| `url` | The address of its web interface, for the panel beside the map. Empty means `http://<host>:<port>`. |
| `settings_file`, `bookmarks_file` | Paths to OpenWebRX's own two files. See below. |
| `relay` | `"auto"` (default), `"aan"` or `"uit"` — whether audio is passed through this add-on. See *Listening from outside*. |
| `switch_profile` | Whether clicking a channel may switch the receiver to the profile whose band that frequency falls in. |
| `squelch`, `squelch_by_profile` | A squelch level overall, or one per profile. |
| `band_hz` | The frequency range to take from the bookmarks. |

**Why those two files are copied rather than queried.** The obvious route would be to ask
OpenWebRX for its profiles and bookmarks over the websocket. Measured on 2026-09-29, that route is
incomplete: the `profiles` message returned 4 profiles where the receiver has many more — seemingly
only those of the SDR device active at that moment — and bookmarks arrive only for the band of the
selected profile: 95 against 219 from the file. OpenWebRX also bans an address that reconnects too
often, and then there is no audio at all. So copy `settings.json` and `bookmarks.json` somewhere
the add-on can read, for example `/share/openwebrx/`, and point the two keys at them. You only
need to do that again when you change something on the receiver. The websocket route is still
there as a fallback if the files are missing, with a generous pause after a `backoff`.

### Speech recognition (`stt`)

Put a model in `/share/whisper/` — with the Samba add-on that is
`\\<your-home-assistant>\share\whisper\` — and the add-on finds it. It is not shipped in the
image: models are large, and the one that matters here is fine-tuned on ATC audio rather than
freely redistributable.

A general whisper model will load happily and produce fluent English that is wrong. Measured on
ATC recordings, `base.en` and `small.en` recover almost no callsigns; a model trained on air
traffic control does.

| Key | Meaning |
|---|---|
| `enabled` | Off switch for the whole thing. |
| `model` | A path, or a short name such as `atc-small` that is looked up in the model folders. Empty means: use whatever is there, preferring an ATC model. |
| `threads` | How many cores whisper may use. **Do not give it all of them** — this machine also runs your house. On four threads, 3 is a sensible ceiling and 2 keeps things calm. |
| `slice_seconds` | How much audio goes into one attempt. |
| `beam`, `best_of` | Search width. Both default to 1: measured 14% faster than beam 5, and beam search invented words that were never spoken. |
| `record`, `record_days`, `record_max_mb` | Whether transmissions are kept to learn from, and how much disk that may use. |

If whisper fails, the panel says so and shows whisper's own complaint, rather than sitting on
"listening…" forever.

## 3. Where things are stored

| What | Where | Why |
|---|---|---|
| `config.json` | `/share/flighttracknl/` or `/addon_configs/…` | Outside the image, so an update cannot overwrite it. |
| Cache, route database, learned pronunciations, recordings | `/data/cache` | Survives updates and is included in your Home Assistant backup. |
| Speech model | `/share/whisper/` | Too large for an image, and not freely redistributable. |
| `settings.json`, `bookmarks.json` | Wherever the configuration points, e.g. `/share/openwebrx/` | Copied from the receiver; see above. |

## 4. Add-on options

Everything a fresh installation has to fill in is on the add-on's configuration page: where you
are looking, every API key, every external URL, the receiver and the speech model. Home Assistant
writes those fields to `/data/options.json` and the tracker lays them over `config.json`.

**An empty field does not count.** Empty means *not filled in*, not *make empty*: what is in
`config.json` stays, and otherwise the built-in default applies. So a fresh screen never silently
overwrites an existing setup, and you only fill in what you want to be different. The log says on
every start which fields it took from the screen.

| Field | Goes to | Empty means |
|---|---|---|
| `lat`, `lon` | `center` | Schiphol |
| `radius_nm` | `radius_nm` | 250 NM |
| `home_airport` | `home_airport` | EHAM |
| `trail_minutes` | `trail_max_min` | 15 minutes |
| `observer_lat`, `observer_lon`, `observer_label` | `observer` | no marker |
| `openwebrx_host`, `openwebrx_port` | `openwebrx.host`, `.port` | this machine, 8073 |
| `openwebrx_url` | `openwebrx.url` | `http://<host>:<port>` |
| `openwebrx_settings_file`, `openwebrx_bookmarks_file` | the two receiver files | the websocket fallback |
| `openwebrx_relay` | `openwebrx.relay` | `auto` |
| `whisper_enabled`, `whisper_model`, `whisper_threads` | the `stt` block | on, whatever model is present, 2 threads |
| `key_openaip` | `openaip.api_key` | no airspace outlines |
| `key_schiphol_id`, `key_schiphol_secret` | `schiphol` | no Schiphol feed |
| `key_opensky_id`, `key_opensky_secret` | `opensky` | no route learning |
| `url_positions_1`, `url_positions_2` | `sources[0]`, `sources[1]` | adsb.lol and adsb.fi |
| `url_routes`, `url_airframes`, `url_logos` | those blocks | the addresses shown in the field |
| `url_tiles_night`, `url_tiles_day`, `url_tiles_sat`, `url_tiles_ref` | the four map layers | Esri |
| `url_metar`, `url_sigmet`, `url_rain` | the `weather` block | NOAA and RainViewer |

Filling in a key also switches that feed on. Otherwise you would have to enable it in two places
and then wonder why nothing happens.

The URLs arrive with their current values filled in rather than empty, so that you can see where
the data comes from and redirect it if a source moves or you want to run your own mirror. The
placeholders in braces — `{lat}`, `{radius}`, `{z}/{x}/{y}`, `{callsign}`, `{iata}`, `{box}` —
are filled in by the tracker and have to stay.

**What stays in `config.json`:** named areas, the channel list, squelch per profile, the flight
board's per-airport sources, and whisper's fine tuning. Those are lists and nested structures that
an options form handles badly, and they are documented above where they live.

## 5. Listening from outside your home

The receiver does not need to be on the internet for this. Your browser talks only to the add-on,
which fetches the audio from OpenWebRX and passes it through: browser → add-on → receiver. Because
that is then the same origin as the page, it automatically becomes `wss://` on an `https://`
page — a `ws://` to a private address is refused there as mixed content.

Two things make that work, and both are on by default:

- **Ingress.** Home Assistant serves the tracker under its own address, behind its own login. If
  you can reach Home Assistant from outside, the tracker comes along — no second hostname, no
  extra port exposed. `http://<machine>:8090` keeps working at home.
- **`openwebrx.relay`.** `"auto"` passes the audio through as soon as the page arrives over https
  and stays direct at home on http, which saves a hop. `"aan"` always passes through, `"uit"`
  never does.

At most four listeners at a time, and a new listener waits a second if it has to. That is caution,
not thrift: each listener is its own connection to OpenWebRX, and OpenWebRX bans an address that
connects too rapidly. With every listener now coming from this one machine, that weighs more than
it used to.

What does not travel outside is the **OpenWebRX panel** beside the map. That is an `<iframe>`
holding the receiver's entire web interface; carrying it out would mean proxying a whole web
application instead of one audio stream, and it uses absolute paths of its own. From outside, that
panel stays empty. Audio, channels, scanning and recognition all work.

## 6. When something is wrong

| What you see | Where to look |
|---|---|
| "listening…" and nothing else | The status carries whisper's own error. Check that a model is in `/share/whisper/` and that it is complete — a half-written file is skipped on purpose. |
| No channels | `bookmarks_file` is missing or points nowhere, and the websocket fallback found nothing either. |
| "frequency outside the active profile band" | Something else is holding the receiver on another profile. The OpenWebRX panel counts as a client of its own and will pull the profile back; close it while using the built-in player. |
| No audio from outside your home | Check that `relay` is not `"uit"`, and that the page really arrived over https. |
| Rate-limit errors from the position sources | Two trackers on one internet connection share one budget. Stop the other one. |
| Airspace stays empty | `openaip.api_key` is empty. |
