# Changelog

## 0.4.2 — 2026-09-30

- Tracker 1.64.1: whisper now reports where its time goes — loading, mel, encoder, decoder — in
  the log and in `/api/channels`. Groundwork for deciding whether keeping the model in memory is
  worth building. See the tracker's own changelog.

## 0.4.1 — 2026-09-30

- A radar icon in the Home Assistant sidebar instead of the default puzzle piece, and the panel
  is named FlightTrackNL. The add-on's own icon and logo only ever applied to the store page; the
  sidebar reads `panel_icon`, and without it every add-on looks the same there.

## 0.4.0 — 2026-09-30

**Listening is now off by default, and can be switched off in a running installation.**

- **New option `listening`, the first field on the Configuration tab.** Most installations have no
  SDR, and a receiver you do not have should not leave a player, a channel list, a RADIO button
  and frequency buttons scattered across the screen. With it off none of that is built, and
  `/owrx`, `/api/owrx/*` and `/api/stt*` answer 404 so that a tab left open cannot reach them
  either.
- **Nothing is wiped when you switch it off.** `config.json`, the recordings, the learned
  pronunciations and your channel choices stay exactly where they are. Switch it back on and
  everything is as you left it.
- It is a switch, so it is never "not filled in" and it always decides, including over
  `config.json`. That is the point: otherwise listening could not be turned off at all.
- **If you were already using the receiver, turn it on once after this update.** The new option
  arrives off, and off is what it then does. Nothing is lost by that — one click brings it back.
- whisper.cpp is still compiled during every installation. The switch decides whether it is used,
  not whether it is there.

Tracker 1.64.0 also adds a CALLSIGN setting for the data block, puts airport names in amber on the
map, and moves the listening keys to the bottom of the display panel. See the tracker's own
changelog.

## 0.3.14 — 2026-09-30

- Tracker 1.63.0: a pressed button is filled in the theme colour again instead of amber, Local
  traffic is an ordinary key like the filters beside it, and runway visibility is one block. See
  the tracker's own changelog.

## 0.3.13 — 2026-09-30

- Tracker 1.62.0: the range keys are left as they were, the landing-line length now says LDG 5 /
  LDG 10 / LDG 15, and every other choice and filter button is the same width. See the tracker's
  own changelog.

## 0.3.12 — 2026-09-30

- Tracker 1.61.0: one key shape across the display panel, an amber lamp for whatever you picked,
  and the altitude band moved up next to the range. See the tracker's own changelog.

## 0.3.11 — 2026-09-30

- Tracker 1.60.0: one shape and one height for every button in the header, and a new HQ button
  that centres the view on your own position. See the tracker's own changelog.

## 0.3.10 — 2026-09-30

- Tracker 1.59.0: aircraft photographs recover from a hiccup instead of staying away. See the
  tracker's own changelog.

## 0.3.9 — 2026-09-30

- Tracker 1.58.1: the airport code no longer sits on top of the runways, and it dims instead of
  fighting for space. See the tracker's own changelog.

## 0.3.8 — 2026-09-30

- Tracker 1.58.0: the flight board now has a daytime version, and the Listen button is gone from
  the display panel. See the tracker's own changelog.

## 0.3.7 — 2026-09-30

- Only the supported architecture is shown. The red "no" badges for aarch64, armv7, armhf and
  i386 said the same thing five times over and made the header look like a list of failures;
  `build.yaml` and the install error cover it well enough.
- The version, project stage and maintained badges are actually in the README now. They were
  written for 0.3.6 but landed after it was published, so 0.3.6 shipped without them.

## 0.3.6 — 2026-09-30

- Version, project stage and maintained badges beside them. The version badge reads `config.yaml`
  straight from GitHub, so it can never lag behind a release — a hard-coded number is one you
  forget to update, and then the first thing on the page is untrue.
- Architecture badges at the top of the README, so the Info tab says at a glance what this runs
  on: amd64 yes, everything else no. That is worth stating rather than leaving to the install
  error — it is the same information that is in `build.yaml`, but where you look first.

## 0.3.5 — 2026-09-30

- **Fixed: broken image frames on the add-on's Info tab.** Home Assistant shows the README there,
  and the screenshots in it were linked by a relative path — which nothing inside Home Assistant
  can resolve, so you got empty frames with the caption underneath. They now use their full
  address, the same way DOCS.md already did. GitHub renders both forms, so nothing changes there.

## 0.3.4 — 2026-09-30

**Fixed: a pre-filled URL replaced a source you had configured yourself.**

- The external addresses arrived filled in with the address in use. That looked helpful, but a
  filled field is a value the screen imposes on every start — and it silently replaced a position
  source set in `config.json`. Worse, only the URL was replaced: each source hands the aircraft
  over under its own key in the response (`ac` for adsb.lol, `aircraft` for adsb.fi), so the
  tracker fetched data perfectly happily and found nothing in it. No error, no aircraft.
- Every URL field now starts empty, like the keys. Empty means the built-in address is used, and
  those addresses are listed in DOCS.md where you can copy them without them imposing anything.
- If you do point a position field somewhere else, the key now follows the address for the known
  sources, and the log warns when it does not recognise one.

## 0.3.3 — 2026-09-30

**Fixed: half the options were invisible.**

- Home Assistant draws the configuration screen from the list of values, not from the schema. A
  field described in the schema but absent from that list simply does not appear — which is why
  the API keys, the receiver's address and paths, and your position could not be filled in at
  all, while the URLs could. Every field now carries a value, empty where it has none.
- Position and range are text fields rather than number fields, because an empty number field is
  not possible here and empty is exactly how you say "leave this alone". The server converts them,
  and accepts a comma as the decimal separator.
- The screenshots now also show on the Documentation tab inside Home Assistant. They were only
  in the README, which Home Assistant does not display.

## 0.3.2 — 2026-09-30

**Documentation rebuilt around a fresh installation.**

- `photos_contact` added to the options. It is not a key, but it is something a new installation
  has to fill in: planespotters wants to know who is calling, puts it in the User-Agent, and
  refuses the request without it. It was the one credential-like field still missing.

- DOCS now walks an install from nothing to a working tracker: what you need before you start,
  installing, filling in the Configuration tab field by field, starting it, connecting a receiver,
  reaching it from outside, and only then `config.json` as an advanced section for what the screen
  cannot hold. Previously it led with the configuration file, which is no longer how you set this
  up.
- Every external address the add-on fetches from is listed in one table, with what it feeds.
- The comments in `config.yaml`, `run.sh`, `Dockerfile`, `build.yaml` and `.gitattributes` are in
  English, so the repository reads the same way throughout. The tracker's own source code and its
  comments remain in Dutch; the interface offers both languages.

## 0.3.1 — 2026-09-30

**The remaining addresses, including the flight board's own sources.**

- **The flight board is now configurable too.** Rotterdam The Hague and Eindhoven each publish
  their own flight feed, and Maastricht, Groningen and Schiphol come from NOS teletext. Those
  three addresses were fixed in the code; they are options now.
- **Every other fixed address followed**: the OpenAIP airspace endpoint, hexdb (the first of the
  two route sources), the two aircraft-photo endpoints, the OurAirports data directory, the three
  navdata files, the rain radar tile pattern, the Schiphol token, base and audience URLs, the
  OpenSky token and base URLs, and the OpenWebRX tab address.
- Nothing in the tracker now reaches an address you cannot see and change. Checked by comparing
  every `http(s)://` in the source against the configuration: no host left over.
- Fifty-two fields in total. The empty-means-not-filled-in rule is unchanged, so this update does
  nothing to an existing setup.

## 0.3.0 — 2026-09-30

**Everything a new installation needs is now on the add-on's configuration page.**

- **All keys and all external URLs are options.** Where you are looking, the range, the home
  airport, your own position, the receiver, the speech model, the OpenAIP / Schiphol / OpenSky
  credentials, and every address the tracker fetches from: positions, routes, the aircraft
  database, airline logos, the four map layers, METAR, SIGMET and the rain radar. A fresh install
  can be set up without ever touching a file.
- **An empty field does not count.** Empty means *not filled in*, not *make empty*: what is in
  `config.json` stays, and otherwise the built-in default applies. An existing setup therefore
  survives this update untouched, and the log names the fields that were taken from the screen.
- **Filling in a key switches that feed on**, instead of needing it enabled in a second place.
- **The URLs come pre-filled** with the addresses actually in use, so you can see where the data
  comes from and redirect it if a source moves. The placeholders in braces are filled in by the
  tracker and must stay.
- `whisper_threads` now actually reaches whisper. It used to be used only when generating a first
  `config.json`. The default is 2: this machine also runs your house, and whisper with every core
  busy makes Home Assistant noticeably slow during a transcription.
- Areas, the channel list, squelch per profile and whisper's fine tuning stay in `config.json`.
  They are lists and nested structures that an options form handles badly.

## 0.2.1 — 2026-09-29

**Documentation, and defaults that were not anybody's to inherit.**

- **Fixed: `openwebrx.url` and `tab_url` defaulted to a personal domain.** Anyone installing this
  add-on got someone else's receiver in the panel beside the map. Both are now empty, and empty
  means `http://<host>:<port>` — your own receiver. The default map centre is Schiphol rather
  than a private address, and the credit line under the map is in English.
- **README and DOCS rewritten** for someone arriving here for the first time rather than for the
  author: what the tracker actually does, with screenshots, what you need before installing, and
  a reference for every block of `config.json` — position sources, the optional feeds and what
  each one needs, the listening settings, and where files are kept.
- **This changelog rewritten** in the same spirit, configuration changes included, so that an
  update tells you what it means for your setup instead of what was in the author's head.
- The add-on's own messages in the log are now in English. The source code and its comments stay
  in Dutch; the interface offers both.

## 0.2.0 — 2026-09-29

**Listening now works from outside your home, and speech recognition works at all.**

- **Fixed: recognition died on the very first transmission.** `whisper-cli` was copied out of the
  build directory and the directory was then deleted — but whisper.cpp builds `libwhisper.so` and
  the `libggml-*.so` alongside it, and the binary is linked against them. It fell over with
  "error while loading shared libraries" within two milliseconds, which looked as though whisper
  itself was broken. It is now linked statically, and the build verifies this afterwards with
  `ldd`: if the binary still depends on anything from the build directory, the build fails there
  rather than shipping an image in which listening is quietly broken.
- **Audio can be relayed through the add-on** instead of the browser connecting straight to the
  receiver. Your receiver therefore does not need to be on the internet: the browser talks only to
  the add-on, which already sits behind whatever you use to reach Home Assistant. Because it is
  then the same origin as the page, it becomes `wss://` by itself on an `https://` page — a
  `ws://` to a private address is refused there as mixed content, which is exactly why it did not
  work before.
  - New setting `openwebrx.relay` in `config.json`: `"auto"` (default) relays as soon as the page
    arrives over https and stays direct at home over http; `"aan"` always relays, `"uit"` never
    does, which is the behaviour of earlier versions.
  - At most four listeners at a time, and a second between new connections. Each listener is its
    own connection to OpenWebRX, and OpenWebRX bans an address that connects too rapidly.
  - The relay is deliberately dumb: every frame is passed on unchanged, with its opcode and fin
    bit. It does not know OpenWebRX's protocol and does not need to, so a future version of
    OpenWebRX will not break on it.
- **Ingress is on.** Home Assistant now serves the tracker under its own address, behind its own
  login, so it is reachable from outside without a second hostname and without exposing a port.
  Port `8090` keeps working on your own network. Version 0.1.2 claimed ingress was impossible
  because the front end used absolute paths; that was an assumption rather than a check, and it
  was wrong — there is not a single absolute path in it.
- **Fixed: the OpenWebRX panel pointed at the wrong machine.** It fell back to the hostname of the
  page instead of the configured receiver, so with the tracker and the receiver on different
  machines the panel looked for the receiver where the tracker runs.
- The status now reports whether recognition actually works, not merely whether a model file is
  present: `/api/channels` carries `fout`, `runs` and `fails`, and whisper's own complaint appears
  in the panel where "listening…" used to sit indefinitely.
- Its own icon and logo instead of the default puzzle piece (was 0.1.5).

## 0.1.4 — 2026-09-29

- **Fixed: a stale starting file could beat your real configuration.** When `config.json` exists
  in both accepted locations, the newer one now wins, instead of a fixed order. Version 0.1.2 had
  written its bare starting file to `/config`, and from then on that took precedence over the real
  configuration in `/share` — areas and keys appeared to vanish with nothing explaining why. The
  log now also names the file it is ignoring.
- **Fixed: a speech model in `/share/whisper` was never found.** The server only searched the
  three directories a Raspberry Pi installation uses. `/share/whisper` has been added — which is
  precisely where this add-on tells you to put the model.

## 0.1.3 — 2026-09-29

- **`config.json` may now also live in `/share/flighttracknl/`.** The tidy location is
  `/addon_configs/<slug>/`, but that is not a default Samba share: you have to enable it
  separately, and until you do you cannot reach it from a file browser. `/share` is always there.
  If neither file exists, the starting one is written to `/share`, where you can certainly get
  at it.

## 0.1.2 — 2026-09-29

- **Fixed: no "Open Web UI" button on the add-on page.** The `webui` line was missing from
  `config.yaml`; without it Home Assistant does not know which address to offer.

## 0.1.1 — 2026-09-29

- **Fixed: the build stopped immediately with "base name (${BUILD_FROM}) should not be blank".**
  A `build.yaml` was missing, and without it the Supervisor passes no base image to the
  Dockerfile. It now names `ghcr.io/home-assistant/amd64-base-debian:bookworm` — Debian rather
  than Alpine, because the Dockerfile uses apt-get and builds whisper.cpp with cmake.

## 0.1.0 — 2026-09-29

- First release as a Home Assistant add-on. The whole tracker runs here: the radar plan view, the
  3D view, the flight board, the weather and the listening. Only OpenWebRX+ stays on the receiver
  machine.
- whisper.cpp v1.7.4 is compiled on the machine itself during installation, so no registry or
  build pipeline is involved.
- `config.json` lives outside the image, so an update does not overwrite it. The cache lives in
  `/data` and is therefore part of your Home Assistant backup — including the route database, the
  learned pronunciations and the recordings.
- The speech model and OpenWebRX's two files are read from `/share`: they belong neither in an
  image nor in a repository.
