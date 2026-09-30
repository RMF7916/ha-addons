# FlightTrackNL

[![Version][version-shield]][changelog] ![Project stage][stage-shield] ![Maintained][maintained-shield]

![Supports amd64 Architecture][amd64-shield]

A flight tracker for Dutch airspace, as a Home Assistant add-on. It draws live ADS-B traffic two
ways — a radar-style plan view and a 3D view — and, if you have an SDR receiver running
[OpenWebRX+](https://github.com/luarvique/openwebrx), it lets you listen to air traffic control
next to the map and writes down which callsign is talking.

Everything runs on your own machine. No account, no cloud service, no subscription.

![The radar plan view with live traffic around Amsterdam](https://raw.githubusercontent.com/RMF7916/ha-addons/main/flighttracknl/images/radarplot.png)

## What it does

**Two views of the same traffic.** The plan view is deliberately radar-like: data blocks you can
drag around the target, range rings, airways and navaids, airspace outlines, runway layouts and a
speed vector. The 3D view puts the same aircraft above a map with their trails drawn at altitude,
as a line, a ribbon or a curtain down to the ground.

![The 3D view, an approach into Schiphol](https://raw.githubusercontent.com/RMF7916/ha-addons/main/flighttracknl/images/3d-view.png)

**Live positions from two sources at once.** [adsb.lol](https://adsb.lol) and
[adsb.fi](https://adsb.fi) by default, with automatic failover: if one stops answering the tracker
moves to the other and back again, and the status bar says which one it is using. Both are free
and need no key.

**Weather where it matters for flying.** METARs for every field in range, colour-coded by flight
category, international SIGMET areas drawn on the map, and an animated rain radar overlay — in
both the plan view and 3D.

![The weather panel with METARs and SIGMETs](https://raw.githubusercontent.com/RMF7916/ha-addons/main/flighttracknl/images/weather.png)

**A flight board** for the Dutch airports, built from the airports' own published data, with
teletext as a fallback for the fields that publish nothing else. Clicking a row finds that
aircraft on the plot.

**Listening, with the callsign written down.** Off by default — most people have no SDR, and the
interface should not be full of radio you cannot use. Turn `listening` on and point it at an
OpenWebRX+ receiver and you get the
channel list from its bookmarks, a scanner across the channels you tick, per-profile squelch, and
speech recognition (whisper.cpp, on this machine) that pulls the callsign out of each transmission
and lights up the matching aircraft. It learns airline pronunciations from its own confident hits.

The interface is available in Dutch and English; the button at the top right switches between
them.

## What you need

| | |
|---|---|
| **Architecture** | amd64. The add-on compiles whisper.cpp during installation, which takes about ten minutes on two cores — once per version. |
| **A receiver** | Optional. Without one you lose the listening panel; everything else works. OpenWebRX+ may run on any machine on your network — a Raspberry Pi with an SDR is the usual setup. |
| **A speech model** | Optional, and only useful with a receiver. A general whisper model performs poorly on ATC audio; a model fine-tuned on air traffic control is what makes this work. |
| **API keys** | None are required. Airspace outlines (OpenAIP) and the Schiphol flight feed each need a free key if you want them; the tracker starts fine without. |

## Installing

Add this repository to Home Assistant, install the add-on, open it. The walkthrough — where the
configuration file lives, how to connect a receiver, and how to reach the tracker from outside
your home — is in [DOCS.md](DOCS.md).

## Built on

The Python standard library, and [three.js](https://threejs.org) in the browser for the 3D view.
Nothing else is bundled. Positions come from adsb.lol and adsb.fi under ODbL, airport and runway
data from [OurAirports](https://ourairports.com), weather from the NOAA Aviation Weather Center
and [RainViewer](https://rainviewer.com), and map tiles from Esri. Each is credited in the strip
along the bottom of the map.

[changelog]: CHANGELOG.md
<!-- The version badge reads config.yaml from GitHub, so it can never lag behind a release.
     A hard-coded number here would: it is the one you forget to update, and then the first
     thing on the page is untrue. -->
[version-shield]: https://img.shields.io/badge/dynamic/yaml?url=https%3A%2F%2Fraw.githubusercontent.com%2FRMF7916%2Fha-addons%2Fmain%2Fflighttracknl%2Fconfig.yaml&query=%24.version&label=version&color=blue
[stage-shield]: https://img.shields.io/badge/project%20stage-beta-yellow.svg
[maintained-shield]: https://img.shields.io/badge/maintained-yes-green.svg
[amd64-shield]: https://img.shields.io/badge/amd64-yes-green.svg
