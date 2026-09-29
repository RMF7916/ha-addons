# RWMA add-ons voor Home Assistant

Eigen add-ons, bedoeld om vanuit Home Assistant bij te houden in plaats van met de hand op
een machine te installeren.

## Toevoegen aan Home Assistant

Instellingen → Add-ons → Add-on store → rechtsboven de drie puntjes → **Repositories** → plak:

```
https://github.com/RMF7916/ha-addons
```

Na het toevoegen verschijnt er een blok **RWMA add-ons** onderaan de winkel.

## Bijwerken

Elke add-on heeft een `version` in zijn `config.yaml`. Hoog dat nummer op en push; Home Assistant
ziet binnen een uur (of meteen na "Controleer op updates") dat er een nieuwe versie is en zet er
een updateknop bij. De tekst die je daarbij te zien krijgt komt uit `CHANGELOG.md` van de add-on.

Dat is de hele updatestroom: **versie ophogen, pushen, in Home Assistant op Update drukken.**

## Add-ons

| Add-on | Wat het doet |
|---|---|
| [flighttracknl](flighttracknl/) | Vluchtvolger met RadarPlot, 3D, weer en meeluisteren |

## Wat hier niet in hoort

Geen sleutels, geen `config.json`, geen modelbestanden. De instellingen van een add-on staan in
Home Assistant zelf; grote bestanden zoals een spraakmodel horen in `/share` op de machine.
