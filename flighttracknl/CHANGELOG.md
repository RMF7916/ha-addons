# Changelog

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
