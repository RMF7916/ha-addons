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
3. **De config.** Draai vanaf je pc `tools\config-naar-ha.ps1`. Die haalt `config.json` van
   de Pi, zet `openwebrx.host` op het adres van de Pi, wijst de twee bestandspaden naar
   `/share/openwebrx/` en maakt `stt.bin` en `stt.model` leeg zodat de add-on zelf zoekt. De
   rest -- gebieden, bronnen, sleutels, kanalen, het weer -- blijft letterlijk zoals hij was.
   Hij landt in `\\<je-home-assistant>\share\flighttracknl\config.json`.
   Start je zonder, dan zet de add-on daar zelf een kaal beginbestand neer.
4. Open `http://<je-home-assistant>:8090`.

Het bouwen van whisper.cpp duurt bij de installatie een minuut of tien op twee kernen. Dat
gebeurt één keer per versie.

## Van buitenshuis luisteren

De ontvanger hoeft daarvoor niet aan het internet. Je browser praat alleen met deze add-on, en
die haalt de audio bij OpenWebRX op en geeft hem door: browser -> tracker -> ontvanger. Omdat
dat dezelfde herkomst is als de pagina wordt het vanzelf `wss://` op een https-pagina -- een
`ws://` naar een 192.168-adres weigert je browser daar als mixed content.

Twee dingen zijn daarvoor nodig, en die staan allebei al aan:

- **Ingress.** Home Assistant serveert de tracker onder zijn eigen adres, achter zijn eigen
  login. Ga je van buiten naar Home Assistant, dan is de tracker daarmee ook bereikbaar --
  geen tweede hostnaam, geen extra poort open. Thuis blijft `http://<machine>:8090` gewoon
  werken.
- **`openwebrx.relay` in `config.json`.** `"auto"` (de standaard) geeft de audio door zodra de
  pagina via https binnenkomt, en laat het thuis op http rechtstreeks gaan -- dat scheelt een
  tussenstap. `"aan"` is altijd doorgeven, `"uit"` nooit.

Er luisteren er hoogstens vier tegelijk mee, en een nieuwe luisteraar wacht zo nodig een
seconde. Dat is geen zuinigheid maar voorzichtigheid: elke luisteraar is een eigen verbinding
naar OpenWebRX, en OpenWebRX bant een adres dat te snel achter elkaar verbindt. Nu alle
luisteraars vanaf deze ene machine komen, telt dat zwaarder dan vroeger.

Wat niet meegaat naar buiten is het **OpenWebRX-paneel** rechts. Dat is een `<iframe>` met de
complete webinterface van de ontvanger erin; daarvoor zou de hele webapplicatie doorgesluisd
moeten worden in plaats van alleen de audiostroom, en die gebruikt eigen absolute paden. Van
buitenaf blijft dat paneel dus leeg. Het geluid, de kanalen, het scannen en het meeluisteren
werken wel.

## Waar wat staat

| Wat | Waar | Waarom |
|---|---|---|
| `config.json` | `/share/flighttracknl/` | Buiten het image, dus een update overschrijft hem niet. Mag ook in `/addon_configs/<slug>_flighttracknl/`; de add-on kijkt daar eerst en valt terug op `/share`. Die eerste plek is netter -- alleen deze add-on ziet hem -- maar is geen standaard Samba-share, dus je moet hem daar apart in aanzetten. |
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
