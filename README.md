# RMF7916's add-ons for Home Assistant

A small Home Assistant add-on repository. Add it once and the add-ons below appear in your
add-on store, with updates arriving the same way every other add-on's do.

## Adding it

Settings → Add-ons → Add-on store → the three dots, top right → **Repositories** → paste:

```
https://github.com/RMF7916/ha-addons
```

A block named **RMF7916's add-ons** appears at the bottom of the store.

## What is in here

| Add-on | What it does |
|---|---|
| [FlightTrackNL](flighttracknl/) | A flight tracker for Dutch airspace: live ADS-B in a radar plan view and in 3D, aviation weather, a flight board for the Dutch airports, and listening to air traffic control through an OpenWebRX+ receiver with the callsign recognised automatically. |

## Updates

Every add-on carries a `version` in its `config.yaml`. Raise it, push, and Home Assistant offers
an update — with that version's entry from `CHANGELOG.md` shown beside the button.

## Licence

The add-ons in this repository are [MIT](LICENSE). What they bundle and what they fetch while they
run is another matter — some of those sources are non-commercial, and some may not be
redistributed. Each add-on has a `LICENSES.md` that says exactly what it uses and under which
terms; for FlightTrackNL that is [flighttracknl/LICENSES.md](flighttracknl/LICENSES.md), which also
carries the disclaimer: it is a viewing tool, not an aviation tool.

## What is deliberately not here

No keys, no `config.json`, no model files. An add-on's own settings live in Home Assistant; large
files such as a speech model belong in `/share` on your own machine.
