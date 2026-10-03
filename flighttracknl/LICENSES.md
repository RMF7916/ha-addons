# Disclaimer, sources and licences

FlightTrackNL is MIT-licensed — see [LICENSE](../LICENSE). This page covers what it does not own:
the code it bundles, the data it fetches while it runs, and what you may and may not do with the
result.

## Disclaimer

**This is something to look at, not something to fly by.**

The positions come from volunteers running their own ADS-B receivers. They lag behind, they are
incomplete — military traffic and aircraft without ADS-B are often missing entirely — and altitude,
heading, route, registration and type can all be wrong. Airspace outlines, holding patterns,
airways and navaids are drawn from data of varying age; the navigation data in particular is an old
AIRAC cycle and several waypoints have moved since. Weather is shown as it was published, not as it
is now.

Do not use this for navigation, air traffic control, separation, flight planning, or any other
decision that safety depends on. Use official sources for that.

None of the sources below warrants that its data is correct, complete or available, and neither
does this add-on: it is provided as is, without warranty of any kind. FlightTrackNL is not
affiliated with, endorsed by or connected to any airline, airport, air navigation service provider
or aviation authority. Names of airlines, airports and aircraft types appear because they are what
the data says; they are the trademarks of their owners.

## Code that ships with the add-on

| Component | Version | Licence | Where |
|---|---|---|---|
| FlightTrackNL | this repository | MIT | [LICENSE](../LICENSE) |
| [three.js](https://threejs.org) | r160 | MIT, © 2010-2023 three.js authors | `src/web/vendor/three.module.js` |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | v1.7.4 | MIT, © the ggml authors | compiled during installation |
| [Whisper models](https://github.com/openai/whisper) | ggml conversions | MIT, © 2022 OpenAI | downloaded on request |
| [B612 and B612 Mono](https://github.com/polarsys/b612) | Google Fonts | SIL OFL 1.1 | loaded from fonts.googleapis.com |

A speech model fine-tuned on air traffic control is **not** one of OpenAI's and carries whatever
licence its author gave it. If you supply one, that licence is yours to check.

## Data the tracker fetches while it runs

| Source | What it provides | Terms | Attribution |
|---|---|---|---|
| [adsb.lol](https://www.adsb.lol/docs/open-data/api/) | live positions | ODbL 1.0 | required, in the strip under the map |
| [adsb.fi](https://github.com/adsbfi/opendata) | live positions, second source | own terms — **personal, non-commercial use only** | required, with a link to their home page |
| [OurAirports](https://ourairports.com/data/) | airports, runways, radio frequencies | public domain | not required, given anyway |
| [Natural Earth](https://www.naturalearthdata.com) | coastlines, borders, land and lakes | public domain | not required |
| [CARTO](https://carto.com/legal/basemap-terms/) basemaps | the map under the traffic | free key; 5 million tiles a month for non-commercial use | **required and prescribed**: © OpenStreetMap contributors, © CARTO |
| [NOAA Aviation Weather Center](https://aviationweather.gov/data/api/) | METAR, SIGMET | US government work, public domain | not required; do not suggest NOAA endorses you |
| [RainViewer](https://www.rainviewer.com/api.html) | rain radar | free, **personal and educational use** | required: "Weather data by RainViewer", with a link |
| [openAIP](https://www.openaip.net) | airspace outlines | **CC BY-NC 4.0** — attribution, non-commercial | required; needs your own free key |
| [EUROCONTROL](https://github.com/euctrl-pru/eurocontrol-atlas) | FIR and UIR boundaries | MIT, copyright (c) 2019 EUROCONTROL | the licence text has to travel with the data; credited in the strip under the map |
| [ADS-B Radar for macOS](https://adsb-radar.com) | the aircraft icons in the plan view | free for personal and commercial use | **required**: a backlink, see below |
| [hexdb.io](https://hexdb.io) | aircraft types, routes | no published terms; they ask you not to scrape | they credit PlaneBase/PlanePlotter, Jim Mason, Steve Hibberd, ip2location, Airport-Data |
| [adsbdb](https://github.com/mrjackwills/adsbdb) | routes, second source | code MIT; **route data may not be republished** (see below) | credit PlaneBase and the route authors |
| [Planespotters.net](https://www.planespotters.net/legal/termsofuse) | aircraft photos | own terms; the API's own terms are not published | required **per photographer**, in the form © name — the tracker shows what the API returns |
| [Schiphol Public Flight API](https://developer.schiphol.nl/legal/terms-and-conditions) | Schiphol arrivals and departures | own terms, personal key, tied to the intended use | none required; you may **not** use the Schiphol name or logo as branding |
| [OpenSky Network](https://opensky-network.org/about/terms-of-use) | home-field statistics, airframe details | non-profit research and education only — see below | citation prescribed in their terms |
| [x-plane-navdata](https://github.com/mcantsin/x-plane-navdata) | navaids, waypoints, airways | GPL, AIRAC cycle 2012.08 | — |
| NOS Teletekst | flight board fallback for fields that publish nothing else | no published terms; read-only, as any reader would | — |

`web/landen.js` maps the ICAO 24-bit address to a country of registration. The allocation is
published by ICAO in Annex 10, Volume III, chapter 9 — a factual table of address blocks per state
— and was checked against the public table in [tar1090](https://github.com/wiedehopf/tar1090)
(GPL-2.0), which is generated from that same annex. No code was taken from it. The flags beside it
are simple drawings of national flags, which carry no copyright; coats of arms and script are left
out, and a country without a drawing shows its two-letter code instead.

`web/holdings.js` holds the Schiphol holding patterns, read off the AIP Netherlands STAR chart and
written out as coordinates. The AIP itself is © LVNL and is not reproduced here. `web/types.json`
maps ICAO type designators (ICAO Doc 8643) to type names.

## Things worth knowing before you publish anything

**Three sources are non-commercial.** adsb.fi, openAIP and RainViewer all limit you to personal,
educational or otherwise non-commercial use. A dashboard on the wall at home is exactly what they
have in mind. A screen in a paying venue, or anything you charge for, is not — and switching those
three off in `config.json` is the way to stay inside their terms.

**Route data is not yours to redistribute.** hexdb.io and adsbdb both carry the callsign-to-route
data of David J Taylor and Jim Mason, which "may not be copied, published, or incorporated into
other databases" without permission. The tracker keeps looked-up routes in `cache/routes.db` so it
does not ask the same question twice; entries expire after 30 days and the file never leaves your
machine. Putting the tracker on the open internet, or copying that cache somewhere else, is
republishing it.

**OpenSky is off by default, and should stay off unless your use fits theirs.** Their terms limit
the REST API to non-profit research and education and require a written licence for "integration
into a live product, service, or automated system"; a dashboard that polls around the clock is one.
The home-field statistics it provides are a convenience, not a requirement — everything else works
without it.

**Esri was removed in 1.72.0.** `server.arcgisonline.com` answers without a token, which is not the
same as being allowed: Esri's terms grant that use only with an ArcGIS subscription or ArcGIS
software, and specifically forbid harvesting and self-hosting their base map tiles — which is what a
tile cache does. The add-on now uses CARTO only, and drops arcgisonline addresses it finds in an
existing `config.json`.

**Airline logos are nobody's to give away.** `web/logos/` is empty by design. The logo CDNs of
travel platforms work technically but grant no usage right, and the logos themselves are the
airlines' trademarks. For a screen next to your own receiver that is one judgement; for something
you publish it is another. See `src/web/logos/LEESMIJ.md`.

**The day map's colours are changed locally.** The tiles come from CARTO as they always do; before
they are cached, their colour table is rewritten so that the land becomes one quiet grey and the
water sits just under it (`tile_palet` in `config.json`). Nothing is removed, no watermark is
touched, and the attribution stays exactly as CARTO prescribes it. Their terms set out attribution
and forbid working around the missing-key watermark; they say nothing I could find about
restyling, so this is a reading rather than a permission in writing.

The target tones (land `#efefef`, water `#d0cfd4`) were measured from an Esri Light Gray Canvas
tile, because that is the look being aimed at. Measuring a colour is not using the map: no Esri
tile is requested, cached or shown, and the tiles on the screen are CARTO's Positron. Esri stays
out of this add-on for the reason given above.

**The aircraft icons are theirs, the colours are ours.** The drawings in `web/icons/` are the
free SVG set published by ADS-B Radar for macOS. They are free to use, commercially as well, on
one condition: a backlink somewhere in the project, the website or the documentation. This is that
backlink, and the same credit stands in the source list behind the small "i" under the map:

> Icons by ADS-B Radar for macOS — <https://adsb-radar.com> — <https://apps.apple.com/app/id1538149835>

The files are used as they are; only the colour is changed, so that an aircraft takes the colour of
its kind in this tracker rather than the colour the drawing was made in. If you remove the icons,
remove those two credits as well; if you keep them, keep the credits. The shapes in the 3D view are
a different thing: those are drawn here (`web/acvorm.js`) and carry no condition.

**The FIR boundaries are bundled, not fetched.** `web/firs.js` is derived from the EUROCONTROL
Network Manager FIR/UIR shapefile in `euctrl-pru/eurocontrol-atlas`, MIT licensed, copyright (c)
2019 EUROCONTROL. The outlines are simplified (Douglas-Peucker at 0.0015 degree) and rounded to
three decimals; that is a derived work, so the MIT notice above travels with it and the file names
its source in full. They come bundled rather than fetched because they change about once a year
and the add-on should work without reaching out.

**Keep the attribution line correct.** The strip under the map, and the list behind the small "i"
next to it, are not decoration: they are the condition under which several of these sources may be
shown at all. `tile_attribution` in `config.json` is yours to word and to translate, but the map
credit has to keep naming whoever actually made the tiles you are looking at.
