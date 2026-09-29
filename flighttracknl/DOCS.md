# FlightTrackNL

Vluchtvolger met RadarPlot, 3D-weergave, luchthavenbord, weer en meeluisteren via OpenWebRX.

**De ontvanger blijft op de Raspberry Pi.** Daar draait alleen OpenWebRX+ met de SDR eraan; deze
add-on praat er over het netwerk mee. De tracker zelf, whisper en alle gegevens staan hier.

## Installeren

1. **Het spraakmodel.** Zet het met de Samba-add-on in `share/whisper/`:
   `\\homeassistant\share\whisper\ggml-atc-small.bin`. Zonder model werkt alles behalve het
   meeluisteren.
2. **De twee bestanden van OpenWebRX.** Draai vanaf je pc `tools\owrx-naar-ha.ps1` uit de
   projectmap. Dat zet `settings.json` en `bookmarks.json` in `share/openwebrx/`. Zonder
   `settings.json` kent de tracker de profielen van je ontvanger niet en kan hij niet van band
   wisselen; zonder `bookmarks.json` is je kanalenlijst leeg.
3. **Starten.** De eerste start zet een `config.json` neer in
   `\\homeassistant\addon_configs\<slug>_flighttracknl\config.json`. Vul die aan met je eigen
   instellingen, of kopieer de `config.json` van de Pi erheen, en herstart de add-on.
4. Open `http://<je-home-assistant>:8090`.

Het bouwen van whisper.cpp duurt bij de installatie een minuut of tien op twee kernen. Dat
gebeurt één keer per versie.

## Waar wat staat

| Wat | Waar | Waarom |
|---|---|---|
| `config.json` | `/addon_configs/<slug>_flighttracknl/` | Buiten het image, dus een update overschrijft hem niet. Hier horen je sleutels, nergens anders. |
| cache, `routes.db`, lexicon, opnames | `/data/cache` | Blijft staan over updates heen en zit in je Home Assistant-back-up. |
| spraakmodel | `/share/whisper/` | Te groot voor een image en niet vrij te verspreiden. |
| `settings.json`, `bookmarks.json` | `/share/openwebrx/` | Komen van de Pi; zie hieronder. |

## Waarom die twee bestanden gekopieerd worden

De voor de hand liggende weg zou zijn: de tracker vraagt de profielen en bookmarks rechtstreeks
aan OpenWebRX over de websocket. Dat is gemeten op 29-09-2026 en het werkt niet goed genoeg:

- Het `profiles`-bericht is onvolledig — 4 profielen terug waar de ontvanger er veel meer heeft,
  blijkbaar alleen die van het op dat moment actieve SDR-apparaat.
- Bookmarks komen alleen binnen voor de band van het gekozen profiel: 95 over de websocket
  tegen 219 uit het bestand.
- OpenWebRX bant een adres dat te vaak opnieuw verbindt (`Client address banned`), en dan heb
  je helemaal geen geluid meer.

Kopiëren is dus completer én veiliger. Je hoeft het alleen te doen als je iets aan je ontvanger
verandert — een profiel erbij, een bookmark gewijzigd. De websocketroute zit er nog wel in als
terugval voor als de bestanden ontbreken, met een ruime pauze na een `backoff`.

## Instellingen van de add-on

| Instelling | Betekenis |
|---|---|
| `openwebrx_host` | Adres van de Pi waar OpenWebRX draait. Wordt alleen gebruikt om de eerste `config.json` te vullen; daarna is `openwebrx.host` in dat bestand leidend. |
| `whisper_threads` | Aantal draden voor whisper bij die eerste `config.json`. **Zet dit niet op alle kernen.** Deze machine draait ook je huis; met alle draden bezet wordt Home Assistant merkbaar traag tijdens een transcriptie. Op vier draden is 3 een redelijke bovengrens, 2 als je het rustig wilt houden. |

Al het andere staat in `config.json` — bronnen, gebieden, sleutels, het weer, de kanalen. Dat is
te groot en te genest om in een instellingenscherm te wringen, en het staat daar al goed.

## Bijwerken

Vanaf je pc:

```
.\tools\addon-bijwerken.ps1 -Versie 0.2.0 -Regel "wat er veranderd is" -Pushen
```

Dat kopieert `src\` hierheen, scant op sleutels, hoogt `version` op, schrijft de changelog en
pusht. In Home Assistant verschijnt daarna een updateknop met jouw regel erbij.

## Wat je moet weten over de snelheid

Deze machine is een i3-6100T: twee kernen met AVX2. Per kern ruwweg tweeënhalf keer een Pi 5,
maar er zijn er twee in plaats van vier. Reken op anderhalf tot twee keer zo snel voor whisper,
niet op een factor tien. Meet het na met `tools/whisper-bench.sh` voordat je conclusies trekt.
