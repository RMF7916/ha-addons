# Changelog

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
- **Fixed: `openwebrx.url` and `tab_url` defaulted to a personal domain.** They are now empty, and
  empty means `http://<host>:<port>` — your own receiver. The default map centre is Schiphol
  rather than a private address.
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
