# Changelog

## 0.19.0 — 2026-10-04

- Tracker 1.93.0: the troposphere reading now uses words about reception instead of the name of the
  physics. Seven steps, from poor to exceptional, with thresholds set on the ratio between this
  hour's range and the range in a normal atmosphere, `√(k / k₀)`. That ratio is independent of
  antenna height and aircraft height — both cancel — so the word means the same at any
  installation. Excellent is below 36 M/km (426 NM and beyond to an aircraft at FL350), average is
  101–131 M/km (225–256 NM), poor is above 163 M/km. Exceptional is kept separate for a duct that
  actually traps the airband, which depends on layer thickness: below roughly two hundred metres
  137 MHz does not fit inside and the reading stays excellent.
- The full scale sits behind an info button next to TROPO in the player bar; only this hour's word
  and figure stay visible. The 48-hour strip follows the same seven steps in colour and height, and
  the table behind the weather panel's info button names the same word per gradient.
- Fixed: the player reading stayed empty until the weather panel had been opened once, because the
  update hung on the panel's own render. Fixed: the word and the decimal separator did not follow
  the language button. Fixed: the duct sentence used 118 MHz as the top of the airband where the
  server uses 137 MHz, so it could contradict the word above it.

## 0.18.0 — 2026-10-04

- Tracker 1.92.0: the troposphere figure now says what it means for reception. The gradient gives
  the effective earth radius factor k and from that the radio horizon — 118 M/km is k = 1.33 and
  237 NM to an aircraft at FL350, the familiar reach of the airband. The panel shows this hour's
  range with the factor, and the full scale sits behind the info button. For a duct it shows the
  layer thickness and whether the airband is actually trapped in it, since a thin duct holds only
  the higher bands.

## 0.17.0 — 2026-10-04

- Tracker 1.91.0: a TROPOSPHERE block in the weather panel and a TROPO readout in the player bar,
  showing how far the airband is carrying. At 120 MHz sunspots and the K index do nothing; the
  troposphere does. The modified refractivity gradient is computed from an Open-Meteo vertical
  profile — normal is +118 M/km, below zero there is a duct — with a 54-hour strip from six hours
  back to forty-eight ahead. Open-Meteo is added to the source list and to LICENSES.md: CC BY 4.0,
  non-commercial, no key needed.

## 0.16.0 — 2026-10-03

- Tracker 1.90.0: a new ICON SIZE slider in the display panel, 60 to 200 per cent, scaling the
  aircraft icons in the plan view without touching the label text. It multiplies what the class and
  the altitude already set, so the proportions between them are kept.

## 0.15.0 — 2026-10-03

- Tracker 1.89.0: the per-type icon size is now three classes instead of fourteen separate values —
  1.00 for all airline, cargo and large military traffic, 0.68 for light and business traffic and
  fighters, 0.55 for gliders, balloons, drones, helicopters and ground vehicles. Within the airline
  traffic that fills most of the picture, size now varies with altitude alone.

## 0.14.0 — 2026-10-03

- Tracker 1.88.0: the ICON key moved into the DATA BLOCK row, behind CALLSIGN. With ICON on, the
  size of the drawing now follows the altitude — from 0.875 on the ground through 1.000 at FL150
  to 1.312 at FL400, capped at 1.400 above FL450. The curve is a view from 120,000 ft rather than
  a table of steps, so it rises smoothly and shows no treads.

## 0.13.0 — 2026-10-03

- Tracker 1.87.0: clicking the photo in the flight card now opens the photo page directly in a new
  tab, where the full-size image lives. The overlay in between is gone — it showed the same image
  that was going to be fetched from their page anyway.

## 0.12.0 — 2026-10-03

- Tracker 1.86.0: with ICON on, the speed vector goes out along with the history dots — the
  drawing already shows where the aircraft is heading. The leader lines from the data blocks to
  their targets stay.

## 0.11.0 — 2026-10-03

- Tracker 1.85.0: the photo in the overlay is now itself a link to the photo page, which opens in
  a new tab and holds the full-size image. The photo here stays at its native size and is not
  upscaled: the Planespotters open interface offers 200 px wide and one 280 px high, and no more.

## 0.10.0 — 2026-10-03

- Tracker 1.84.0: the ICON key now uses the free aircraft icon set by ADS-B Radar for macOS,
  recoloured to the traffic-type colours of this tracker. Their only condition is a backlink, and
  that credit now stands in LICENSES.md, in src/README.md and in the source list under the map.
  Traffic on the ground keeps the plain cross until zoomed in to 10 NM.

## 0.9.0 — 2026-10-03

- Tracker 1.83.0: the FIR key is now a layer of its own and no longer switches off with the
  airspace filter, a new ICON key under DATA BLOCK draws aircraft silhouettes instead of radar
  symbols (and drops the history dots with them), the photo in the flight card opens full size in
  an overlay, and auto-track in the player no longer ends up on with its key showing off.

## 0.8.0 — 2026-10-03

- Tracker 1.82.0: every aircraft now has its own silhouette in the 3D view (eleven shapes, picked
  from the type code and the ADS-B category, sized relative to each other), the FIR boundaries come
  from a complete EUROCONTROL set and work in both views, and the 3D day map is a light canvas
  based on CARTO Positron instead of a lightened dark map.

## 0.7.0 — 2026-10-02

- Tracker 1.81.0: refresh, delay and listening now sit together under SYSTEM at the bottom of the
  panel — those are settings about what the tracker does, not about what is seen — and the version
  number is shown in the header beside the name.

## 0.6.11 — 2026-10-01

- Tracker 1.80.1: the attribution line no longer runs through the weather panel (that column was
  missing from the layout sum), and a variable wind in a METAR no longer prints "undefined" where
  its wind arrow should be.

## 0.6.10 — 2026-10-01

- Tracker 1.80.0: every heading in the display panel now carries an info button that opens a short
  explanation of what that block does — twenty of them in the plan view, eleven in 3D, in Dutch and
  English.

## 0.6.9 — 2026-10-01

- Tracker 1.79.0: the conflict alert now has one key per band instead of a single switch — CRUISE
  above 6000 ft at 5 NM, TMA below it at 3 NM, FINAL with both aircraft below 2000 ft at 2 NM, the
  last one off by default. That is the alarm around the airport that is not wanted, and it is now
  switchable.

## 0.6.8 — 2026-10-01

- Tracker 1.78.0: two things a real radar display has and a tracker does not. **CONFL** draws a line
  between two aircraft that will come too close within five minutes, with the time, the closest
  distance and the height difference there — 5 NM and 1000 ft at altitude, 3 NM below 6000 ft, and
  nothing at all below 2000 ft where aircraft are deliberately three miles in trail. **RULER**
  takes a click on two points or two aircraft and reads off distance, bearing, closing speed and
  the moment of closest approach.

## 0.6.7 — 2026-10-01

- Tracker 1.77.0: the status lines moved out from under the keys and sit behind an info button on
  their block's heading; short rows are filled out to four with blank keys; LOKAAL is an ordinary
  single key again; and the aircraft card shows the flag of the country of registration beside the
  callsign, taken from the aircraft's ICAO address rather than from its paintwork.

## 0.6.6 — 2026-10-01

- Tracker 1.76.0: the airspace filter now says what it is doing — "126 of 677 areas on screen, 331
  filtered out, 216 off screen" — and says so plainly when the layer is switched off. A filter that
  takes nothing away and a layer that is off used to look exactly the same.

## 0.6.5 — 2026-10-01

- Tracker 1.75.1: the day map's landmass is 20% darker, and the data block's backing on the light
  map is grey rather than near-white, with the white glow around its letters dropped.

## 0.6.4 — 2026-10-01

- Tracker 1.75.0: the data block in 3D now sits on its own translucent grey backing, so the text
  holds up over roads, built-up edges and shorelines instead of relying on a glow. And the day map
  has a light grey landmass — same tiles, different recipe, with Voyager's blue water kept.

## 0.6.3 — 2026-10-01

- Tracker 1.74.1: fixes label text washing out in the 3D day view. The labels follow the map rather
  than the day button, but their base rule still drew its colour and glow from the panel palette,
  so dark blue letters with a light halo ended up on a dark map.

## 0.6.2 — 2026-10-01

- Tracker 1.74.0: the 3D day map is now Dark Matter without place names, recoloured to the slate
  grey of the Esri canvas it replaced, with its water set to Voyager's blue — so day and night are
  different maps again. The recolouring happens in the tile's own colour table (`tile_palet` in
  `config.json`), which costs one pass over nine to eleven greys and no image library.

## 0.6.1 — 2026-10-01

- Tracker 1.73.0: the map controls — turn, tilt, zoom, STD and QL — now float at the bottom left of
  the view in both 2D and 3D instead of sitting at the far right of the header. And the 3D day
  button lights up the panels, the header and the sky again, while what lies on the map itself —
  labels, runway letters, altitude colours, the tile tint — follows the map underneath, so the dark
  day map keeps its night legibility.

## 0.6.0 — 2026-09-30

- **A CARTO key is now required for the map.** Esri has been removed: `server.arcgisonline.com`
  answers without a token, but Esri's terms grant that use only with an ArcGIS subscription and
  forbid harvesting or self-hosting their tiles — which is what a tile cache does. All five layers
  come from CARTO now. Without `key_carto` there is simply no map: the traffic, the weather, the
  flight board and the listening panel all still work, the SAT buttons are greyed out, and a line
  under the map says why. The key is free, by e-mail, at <https://carto.com/basemaps/>.
- **A disclaimer and the full source list, behind an "i" under the map.** This is something to look
  at, not something to fly by — with every source, its licence and the links that CARTO,
  OpenStreetMap and adsb.fi require. In Dutch and English.
- **The repository now carries a licence.** The add-on is MIT; what it bundles and what it fetches
  is set out in the new [LICENSES.md](LICENSES.md), including the three sources that are
  non-commercial (adsb.fi, openAIP, RainViewer) and the route data that may not be republished.
- Tracker 1.72.0.

## 0.5.11 — 2026-09-30

- Tracker 1.71.0: the DAG button in 3D now draws Esri Dark Gray Canvas instead of Positron — grey
  with more of the land in it, against the near-black Dark Matter at night. The light appearance
  that came with that button now follows the map rather than the button's name, so dark tiles no
  longer end up under a light sky.

## 0.5.10 — 2026-09-30

- Tracker 1.70.3: the place-name layer and the tile marker are the server's to decide, and both
  were being overwritten by whatever the browser had saved earlier — which is why the RadarPlot
  still had names over a map that carries its own, and why old tiles kept turning up. Manually
  chosen display settings are untouched.

## 0.5.9 — 2026-09-30

- Tracker 1.70.2: tiles cached by the browser during the 0.5.7 window are skipped. That version
  configured CARTO and served Esri, so those wrong images sat in the browser for a month under
  the very address that is correct now — giving a patchwork of old and new map. Also, the credit
  line under the map follows the map again; only the map credit is swapped, the rest of the
  sentence is left as it was written.

## 0.5.8 — 2026-09-30

**Fixes 0.5.7, which configured the new maps correctly and then served the old ones.**

- The tile cache folder is named after the address, but an address that matched the default kept
  the plain name — and when the default itself moved from Esri to CARTO, the new maps landed in
  the folders the old tiles were already in. The address fingerprint is now always part of the
  name. Old folders are left where they are; delete `cache/tiles*` to reclaim the space.
- The `tiles_ref` switch is gone. Whether the place-name overlay belongs there follows from the
  map underneath, and the server knows that: off for the CARTO maps, on for the Esri fallback
  (satellite imagery has no lettering). It was also stuck on `true` in existing installations,
  which put the old names back over the new maps.

## 0.5.7 — 2026-09-30

**Fill in one field and the maps are there. That is all it should ever have been.**

- Tracker 1.70.0 ships the four CARTO basemaps as the defaults — Dark Matter at night, Positron
  by day, Voyager under the 3D SAT button, Dark Matter without place names under the RadarPlot —
  with the place-name overlay off, because those maps carry their own. The only field left is
  **`key_carto`**, the free CARTO key from <https://carto.com/basemaps/>.
- Without a key the Esri maps appear exactly as before. CARTO serves blank tiles stamped API KEY
  REQUIRED without one, and a fresh install should not stare at an empty screen.
- Old Esri addresses written into a `config.json` are ignored, because a filled field beats a
  default and they would have blocked the new maps with nothing on screen to explain it. An
  address entered by hand is left alone.
- Sorry for the detour. Four URLs with braces across two places, plus a switch, for what is
  really one decision.

## 0.5.6 — 2026-09-30

- Tracker 1.69.0: changing the map now changes the tile address as well, so the browser stops
  showing the previous map from its cache for a month. And `/api/config` reports which map
  addresses are actually in force and which fields were taken from the configuration screen —
  "it isn't changing" was otherwise a matter of guesswork.

## 0.5.5 — 2026-09-30

- Tracker 1.68.0: the RadarPlot gets a map layer of its own (`url_tiles_radar`), so the SAT button
  in the plan view and the one in 3D no longer have to show the same map. And the place-name
  overlay can be switched off with `tiles_ref`, for maps that carry their own names.
- Defaults are unchanged, so an existing setup looks exactly as it did.

## 0.5.4 — 2026-09-30

- Tracker 1.67.0: it stops fetching data nobody is looking at (once a minute after fifteen quiet
  minutes instead of every ten seconds), map addresses may carry `{key}`, and the tile cache is
  named after the address so switching providers does not serve the old one's tiles.
- **New option `key_carto`.** Only needed if the map layers point at CARTO — free, no account,
  requested with an e-mail address at <https://carto.com/basemaps/>. Without one CARTO serves
  blank tiles stamped API KEY REQUIRED. DOCS.md now lists the addresses for the usual basemaps.

## 0.5.3 — 2026-09-30

**The Vulkan build is gone. It took the whole machine down.**

- On an Intel HD Graphics 530 (Gen9, 2015) the GPU build did not crash — it **hung**, and it took
  Home Assistant OS with it: no answer on 8123, 8090, 445 or 22, while another machine on the
  same network answered in 20 ms. Only a power cycle brought it back. A wedged i915 driver leaves
  the process in uninterruptible sleep, where not even SIGKILL lands.
- 0.5.0 guarded against a GPU build that *falls over*, and that guard worked. There was none for
  one that *hangs*, and no guard in this add-on could have helped: when the driver takes the
  kernel with it, nothing in a Python process gets a say. So this is not something to fix with a
  shorter timeout. It is out.
- `whisper_gpu` is gone from the configuration screen and no second binary is built. The server
  keeps the code (`stt.gpu` in `config.json`), inert, with a warning beside it.
- **The Debian trixie base stays.** Its layers are built, moving back would cost another full
  rebuild for nothing, and a current Debian is no worse than an old one.
- Everything else from today stays: the sidebar icon, the queue that no longer discards
  transmissions, the CALLSIGN data block, amber airport names, and whisper reporting where its
  time goes.

## 0.5.2 — 2026-09-30

**The iGPU build works now. The base image was the problem.**

- **Debian trixie instead of bookworm.** Bookworm ships glslc from shaderc 2023.2 (glslang
  11.13, early 2022), and that compiler does not merely lack an extension — it **segfaults** on
  ggml's matmul shaders. Measured both ways: with bookworm's glslc, dozens of
  `cannot compile matmul_*` followed by `Segmentation fault` and a build that grinds for an hour;
  with trixie's glslc (shaderc 2025.2, glslang 15.1) the very same whisper.cpp v1.7.4 builds
  clean in under two minutes on two cores. whisper stays pinned at v1.7.4; only the base moved.
- That is what made 0.5.0 take over an hour and then quietly install without a GPU binary.
- **`whisper_gpu` is back**, still off by default, and the safety net is unchanged: if the GPU
  binary crashes, the same transmission goes to the CPU one and the log says why once.
- **A failed GPU build is now visible.** Its output is kept in the image, and if the switch is on
  while the binary is missing, `/api/channels` says so under `stt.gpu.bestand` and quotes the
  reason. 0.5.0 threw that away with its own `|| echo`.
- Because the base image changes, this update rebuilds everything from scratch. Reckon on twenty
  to thirty minutes on a slow two-core machine — but it finishes; this exact build was made end
  to end before it was published.

## 0.5.1 — 2026-09-30

**The Vulkan experiment is out again.**

- 0.5.0 added a second whisper build and a set of Vulkan packages, and installing it never
  finished on a two-core machine — over an hour, with the Supervisor stopping other add-ons to
  make room. The image is now byte-for-byte what it was in 0.4.4: one build, no extra packages,
  no `/dev/dri`. If 0.5.0 is stuck on the machine, this is the version to install.
- The server keeps the code for it (`stt.gpu`), so nothing was lost — but with no GPU binary in
  the image it does nothing at all, and the option is gone from the configuration screen.
- Next time this gets tried, the image gets built end to end somewhere else first. An experiment
  should cost the person running it nothing but a switch.

## 0.5.0 — 2026-09-30

**The encoder can run on an Intel integrated GPU.**

- New option **`whisper_gpu`**, off by default. A transcription is about 96% encoder, so this is
  the only place a real gain is left — and it takes the work off the two cores Home Assistant
  itself runs on.
- The image now builds **two** whisper binaries: the usual CPU one, and a Vulkan one beside it.
  Two rather than one with a flag, because a Vulkan build creates a Vulkan instance while
  starting up — including with `-ng`, the flag meant to turn the GPU off — and dies with
  `vk::IncompatibleDriverError` when no driver answers. One binary would mean a sulking graphics
  driver takes all speech recognition with it.
- **Recognition cannot be broken with this switch.** If the GPU binary crashes, the same
  transmission goes straight to the CPU one, the log says why once, and the rest of the run stays
  on the CPU. If the Vulkan build failed at install time, the add-on installs without it and
  nothing changes.
- `video: true` gives the add-on the machine's graphics devices; without `/dev/dri` Vulkan sees
  nothing. It costs nothing while the switch is off.
- **Installing takes about ten minutes longer**, because whisper is now compiled twice. If this
  experiment leads nowhere, that comes back out.

## 0.4.4 — 2026-09-30

- Tracker 1.65.0: transmissions arriving while whisper is still busy are no longer thrown away.
  Two now wait their turn instead of one being held and the rest discarded. See the tracker's own
  changelog.

## 0.4.3 — 2026-09-30

- Tracker 1.64.2: the log and `/api/channels` now say which instruction sets whisper is actually
  compiled against. Without AVX2 the encoder is two to four times slower, and the encoder is
  almost all of the time. See the tracker's own changelog.

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
  SDR, and a receiver that is not there should not leave a player, a channel list, a RADIO button
  and frequency buttons scattered across the screen. With it off none of that is built, and
  `/owrx`, `/api/owrx/*` and `/api/stt*` answer 404 so that a tab left open cannot reach them
  either.
- **Nothing is wiped when it is switched off.** `config.json`, the recordings, the learned
  pronunciations and the channel choices stay exactly where they are. Switch it back on and
  everything is as it was left.
- It is a switch, so it is never "not filled in" and it always decides, including over
  `config.json`. That is the point: otherwise listening could not be turned off at all.
- **If the receiver was already in use, turn it on once after this update.** The new option
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

- Tracker 1.61.0: one key shape across the display panel, an amber lamp for whatever is picked,
  and the altitude band moved up next to the range. See the tracker's own changelog.

## 0.3.11 — 2026-09-30

- Tracker 1.60.0: one shape and one height for every button in the header, and a new HQ button
  that centres the view on the configured home position. See the tracker's own changelog.

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
  straight from GitHub, so it can never lag behind a release — a hard-coded number is one that
  does not get updated, and then the first thing on the page is untrue.
- Architecture badges at the top of the README, so the Info tab says at a glance what this runs
  on: amd64 yes, everything else no. That is worth stating rather than leaving to the install
  error — it is the same information that is in `build.yaml`, but in the place that is read first.

## 0.3.5 — 2026-09-30

- **Fixed: broken image frames on the add-on's Info tab.** Home Assistant shows the README there,
  and the screenshots in it were linked by a relative path — which nothing inside Home Assistant
  can resolve, so the result was empty frames with the caption underneath. They now use their full
  address, the same way DOCS.md already did. GitHub renders both forms, so nothing changes there.

## 0.3.4 — 2026-09-30

**Fixed: a pre-filled URL replaced a manually configured source.**

- The external addresses arrived filled in with the address in use. That looked helpful, but a
  filled field is a value the screen imposes on every start — and it silently replaced a position
  source set in `config.json`. Worse, only the URL was replaced: each source hands the aircraft
  over under its own key in the response (`ac` for adsb.lol, `aircraft` for adsb.fi), so the
  tracker fetched data perfectly happily and found nothing in it. No error, no aircraft.
- Every URL field now starts empty, like the keys. Empty means the built-in address is used, and
  those addresses are listed in DOCS.md where they can be copied without them imposing anything.
- If a position field is pointed somewhere else, the key now follows the address for the known
  sources, and the log warns when it does not recognise one.

## 0.3.3 — 2026-09-30

**Fixed: half the options were invisible.**

- Home Assistant draws the configuration screen from the list of values, not from the schema. A
  field described in the schema but absent from that list simply does not appear — which is why
  the API keys, the receiver's address and paths, and the position could not be filled in at
  all, while the URLs could. Every field now carries a value, empty where it has none.
- Position and range are text fields rather than number fields, because an empty number field is
  not possible here and empty is exactly what says "leave this alone". The server converts them,
  and accepts a comma as the decimal separator.
- The screenshots now also show on the Documentation tab inside Home Assistant. They were only
  in the README, which Home Assistant does not display.

## 0.3.2 — 2026-09-30

**Documentation rebuilt around a fresh installation.**

- `photos_contact` added to the options. It is not a key, but it is something a new installation
  has to fill in: planespotters wants to know who is calling, puts it in the User-Agent, and
  refuses the request without it. It was the one credential-like field still missing.

- DOCS now walks an install from nothing to a working tracker: what is needed before starting,
  installing, filling in the Configuration tab field by field, starting it, connecting a receiver,
  reaching it from outside, and only then `config.json` as an advanced section for what the screen
  cannot hold. Previously it led with the configuration file, which is no longer how this is set
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
- Nothing in the tracker now reaches an address that cannot be seen and changed. Checked by
  comparing every `http(s)://` in the source against the configuration: no host left over.
- Fifty-two fields in total. The empty-means-not-filled-in rule is unchanged, so this update does
  nothing to an existing setup.

## 0.3.0 — 2026-09-30

**Everything a new installation needs is now on the add-on's configuration page.**

- **All keys and all external URLs are options.** The place being looked at, the range, the home
  airport, the home position, the receiver, the speech model, the OpenAIP / Schiphol /
  OpenSky credentials, and every address the tracker fetches from: positions, routes, the aircraft
  database, airline logos, the four map layers, METAR, SIGMET and the rain radar. A fresh install
  can be set up without ever touching a file.
- **An empty field does not count.** Empty means *not filled in*, not *make empty*: what is in
  `config.json` stays, and otherwise the built-in default applies. An existing setup therefore
  survives this update untouched, and the log names the fields that were taken from the screen.
- **Filling in a key switches that feed on**, instead of needing it enabled in a second place.
- **The URLs come pre-filled** with the addresses actually in use, so where the data comes from is
  visible and it can be redirected if a source moves. The placeholders in braces are filled in by
  the tracker and must stay.
- `whisper_threads` now actually reaches whisper. It used to be used only when generating a first
  `config.json`. The default is 2: this machine also runs the house, and whisper with every core
  busy makes Home Assistant noticeably slow during a transcription.
- Areas, the channel list, squelch per profile and whisper's fine tuning stay in `config.json`.
  They are lists and nested structures that an options form handles badly.

## 0.2.1 — 2026-09-29

**Documentation, and defaults that were not anybody's to inherit.**

- **Fixed: `openwebrx.url` and `tab_url` defaulted to a personal domain.** Anyone installing this
  add-on got someone else's receiver in the panel beside the map. Both are now empty, and empty
  means `http://<host>:<port>` — the receiver on the same machine. The default map centre is Schiphol
  rather than a private address, and the credit line under the map is in English.
- **README and DOCS rewritten** for someone arriving here for the first time rather than for the
  author: what the tracker actually does, with screenshots, what is needed before installing, and
  a reference for every block of `config.json` — position sources, the optional feeds and what
  each one needs, the listening settings, and where files are kept.
- **This changelog rewritten** in the same spirit, configuration changes included, so that an
  update says what it means for the setup instead of what was in the author's head.
- The add-on's own messages in the log are now in English. The source code and its comments stay
  in Dutch; the interface offers both.

## 0.2.0 — 2026-09-29

**Listening now works from outside the home, and speech recognition works at all.**

- **Fixed: recognition died on the very first transmission.** `whisper-cli` was copied out of the
  build directory and the directory was then deleted — but whisper.cpp builds `libwhisper.so` and
  the `libggml-*.so` alongside it, and the binary is linked against them. It fell over with
  "error while loading shared libraries" within two milliseconds, which looked as though whisper
  itself was broken. It is now linked statically, and the build verifies this afterwards with
  `ldd`: if the binary still depends on anything from the build directory, the build fails there
  rather than shipping an image in which listening is quietly broken.
- **Audio can be relayed through the add-on** instead of the browser connecting straight to the
  receiver. The receiver therefore does not need to be on the internet: the browser talks only to
  the add-on, which already sits behind whatever is used to reach Home Assistant. Because it is
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
  Port `8090` keeps working on the local network. Version 0.1.2 claimed ingress was impossible
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

- **Fixed: a stale starting file could beat the real configuration.** When `config.json` exists
  in both accepted locations, the newer one now wins, instead of a fixed order. Version 0.1.2 had
  written its bare starting file to `/config`, and from then on that took precedence over the real
  configuration in `/share` — areas and keys appeared to vanish with nothing explaining why. The
  log now also names the file it is ignoring.
- **Fixed: a speech model in `/share/whisper` was never found.** The server only searched the
  three directories a Raspberry Pi installation uses. `/share/whisper` has been added — which is
  precisely where this add-on says to put the model.

## 0.1.3 — 2026-09-29

- **`config.json` may now also live in `/share/flighttracknl/`.** The tidy location is
  `/addon_configs/<slug>/`, but that is not a default Samba share: it has to be enabled
  separately, and until then it cannot be reached from a file browser. `/share` is always there.
  If neither file exists, the starting one is written to `/share`, where it can certainly be
  reached.

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
  `/data` and is therefore part of the Home Assistant backup — including the route database, the
  learned pronunciations and the recordings.
- The speech model and OpenWebRX's two files are read from `/share`: they belong neither in an
  image nor in a repository.
