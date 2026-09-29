# Changelog FlightTrackNL

## 0.1.1 — 2026-09-29
- **Hersteld: de bouw stopte meteen met "base name (${BUILD_FROM}) should not be blank".**
  Er ontbrak een `build.yaml`. Zonder dat bestand geeft de Supervisor geen basis-image mee aan
  de Dockerfile. Nu staat er `ghcr.io/home-assistant/amd64-base-debian:bookworm` in -- Debian
  en geen Alpine, want de Dockerfile gebruikt apt-get en bouwt whisper.cpp met cmake.

## 0.1.0 — 2026-09-29
- Eerste versie als Home Assistant-add-on. De hele tracker draait hier: RadarPlot, 3D-weergave,
  het bord, het weer en het meeluisteren. Op de Pi blijft alleen OpenWebRX+ staan.
- whisper.cpp v1.7.4 wordt bij het installeren op de machine zelf gebouwd, dus er komt geen
  registry of bouwstraat aan te pas.
- `config.json` staat in `/addon_configs/<slug>/`, buiten het image: een update overschrijft
  hem niet. De cache staat in `/data` en zit daarmee in je Home Assistant-back-up -- inclusief
  routes.db, het lexicon en de opnames.
- Het spraakmodel en de twee bestanden van OpenWebRX komen uit `/share`, want die horen niet
  in een image en niet in een repository.
