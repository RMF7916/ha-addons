#!/usr/bin/env python3
"""FlightTrackNL - backend voor de Raspberry Pi.

- Haalt periodiek posities op bij adsb.lol (server-side, dus geen CORS-probleem)
- Houdt per toestel een spoorgeheugen bij, zodat de 3D-weergave direct met sporen start
- Levert luchthavens + banen uit OurAirports (1x per 30 dagen ververst)
- Proxyt en cachet kaarttegels op schijf
- Serveert de frontend uit ./web

Alleen Python-standaardbibliotheek, geen pip-pakketten nodig.
"""
import base64
import collections
import csv
import datetime
import difflib
import gzip
import hashlib
import html
import io
import json
import math
import os
import random
import re
import shutil
import socket
import sqlite3
import struct
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BASE = Path(__file__).resolve().parent
WEB = (BASE / "web").resolve()
# Naast de broncode, zoals op de Pi. In een container staat de code op een plek die bij elke
# update wordt overschreven, dus wijzen deze twee daar naar buiten: FT_CACHE naar /data/cache
# (blijft staan en zit in de back-up) en FT_CONFIG naar het configuratiebestand.
CACHE = Path(os.environ.get("FT_CACHE") or (BASE / "cache"))
# De versie van deze tracker. Staat hier en nergens anders in de code; het inpakken controleert
# dat hij gelijk is aan VERSION in de projectmap, zodat een zip nooit een ander nummer kan dragen
# dan wat het scherm toont.
VERSIE = "1.83.0"

CFG_PATH = Path(os.environ.get("FT_CONFIG") or (BASE / "config.json"))
CACHE.mkdir(parents=True, exist_ok=True)
CFG = json.loads(CFG_PATH.read_text(encoding="utf-8"))

# Standaardwaarden voor alles wat later is bijgekomen. Een bestaande config.json op de Pi
# mist die blokken, en dan vult de server ze hiermee aan in plaats van om te vallen.
# De kaarten komen allemaal van CARTO: gratis, wel een sleutel (tile_key). Één plek, zodat een
# adres nergens twee keer staat.
#
# Tot 1.71.0 stond Esri hier als terugval voor wie geen sleutel had, omdat
# server.arcgisonline.com ook zonder token antwoordt. Antwoorden is niet hetzelfde als mogen: de
# Esri Terms of Use verlenen dat gebruik alleen bij een ArcGIS-abonnement of ArcGIS-software, en
# verbieden met zoveel woorden "systematically harvest base map tiles" en "self-host any content
# hosted by Esri" -- een tegelcache is precies dat. Een tracker die dat stilzwijgend voor je
# blijft doen is geen dienst, dus Esri is er helemaal uit; tiles_opschonen() haalt oude
# arcgisonline-adressen ook uit een bestaande config.json.
CARTO = "https://basemaps.cartocdn.com/rastertiles/%s/{z}/{x}/{y}.png?key={key}"
ESRI_HOST = "server.arcgisonline.com"
# De bronvermeldingen die bij die Esri-kaarten hoorden. Staan ze nog letterlijk zo in een
# config.json, dan noemen ze een leverancier die er niet meer is; zie tiles_opschonen().
TILE_OUD = {
    "tile_attribution": ("Map: Esri, HERE, Garmin, © OpenStreetMap contributors. "
                         "Positions: adsb.lol (ODbL). Airports: OurAirports."),
    "tile_attribution_sat": ("Satellite: Esri, Maxar, Earthstar Geographics. "
                             "Positions: adsb.lol (ODbL). Airports: OurAirports."),
    # Tot 1.81.0 was de dagkaart Dark Matter zonder letters, die we met het palet omklapten naar
    # lichtgrijs. Dat werkte, maar het is een donkere kaart die licht gemaakt wordt: wegen en
    # bebouwing houden de verhoudingen van een nachtkaart. Vanaf 1.82.0 ligt er Positron onder,
    # een kaart die licht bedoeld is. Staat de oude keuze letterlijk in config.json, dan houdt
    # die de nieuwe tegen; zie tiles_opschonen().
    "tile_url_day": "https://basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}.png?key={key}",
    "tile_palet": {
        "day": {"vervang": {"#262626": "#d5e8eb"},
                "grijs_van": "#030303", "grijs_tot": "#2a2a2a",
                "wordt_van": "#b8b8b8", "wordt_tot": "#8d8d8d"},
    },
}

DEFAULTS = {
    # Drie tempo's. Kijkt er iemand, dan elke 3 seconden. Is het laatste verzoek langer dan twee
    # minuten geleden, dan 10. En heeft er langer dan een kwartier niemand gekeken, dan nog maar
    # eens per minuut -- de sporen zijn 15 minuten diep, dus na een kwartier stilte is er toch
    # niets meer te bewaren en haalt hij alleen nog gegevens op die niemand ziet. Bij het eerste
    # verzoek staat hij meteen weer op 3.
    "poll_active_s": 3, "poll_idle_s": 10, "poll_sleep_s": 60, "sleep_after_s": 900,
    "trail_step_s": 4, "trail_max_min": 15,
    "geoid_offset_m": 43, "retry_primary_s": 600, "min_gap_s": 2.0, "port": 8090, "bind": "0.0.0.0",
    # Deze drie stonden alleen in config.json en nergens als standaard, dus een verse of magere
    # config.json liet de server halverwege omvallen op een KeyError in plaats van te starten
    # met iets redelijks. Het midden is Schiphol: een neutraal beginpunt voor wie de tracker
    # voor het eerst start. areas() maakt er zelf een thuisgebied van. Zet in config.json je
    # eigen positie; deze standaard is bewust niet iemands huisadres.
    "center": {"lat": 52.31, "lon": 4.76}, "radius_nm": 250, "home_airport": "EHAM",
    "sources": [
        {"name": "adsb.lol", "url": "https://api.adsb.lol/v2/point/{lat}/{lon}/{radius}", "key": "ac"},
        {"name": "adsb.fi", "url": "https://opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/{radius}",
         "key": "aircraft"},
    ],
    # Kaartlagen. De sleutel is de naam in de URL: /tiles/<laag>/z/x/y, en leeg is de nacht-
    # kaart (/tiles/z/x/y), zodat oude adressen blijven werken. Elke laag krijgt een eigen
    # cachemap, met het adres in de naam verwerkt.
    #
    # Vier kaarten van CARTO, want die zijn gemaakt om ondergrond te zijn: gedempt, weinig
    # contrast, de kaart zakt weg en het verkeer wordt het enige dat licht geeft. De RadarPlot
    # krijgt de variant zonder plaatsnamen, want daar concurreren letters met de datablokken.
    #
    # {key} wordt vervangen door tile_key. Die sleutel is gratis en komt per e-mail op
    # carto.com/basemaps; zonder sleutel stuurt CARTO tegels met "API KEY REQUIRED" erop, en die
    # mag je volgens hun voorwaarden niet wegpoetsen of omzeilen. Daarom vraagt de server ze dan
    # niet op: geen kaart in plaats van een watermerk, en de pagina zegt waarom.
    "tile_key": "",
    "ourairports_url": "https://davidmegginson.github.io/ourairports-data/",
    "tile_url": CARTO % "dark_all",             # 3D, nacht
    "tile_url_day": CARTO % "light_nolabels",   # 3D, dag: licht canvas zonder letters
    "tile_url_sat": CARTO % "voyager",          # 3D, de SAT-knop
    "tile_url_radar": CARTO % "dark_nolabels",  # RadarPlot, de SAT-knop
    # De doorzichtige laag met plaatsnamen. Die bestaat omdat een kaart zonder letters er soms
    # een nodig heeft; dark_all en voyager dragen hun eigen namen, dus standaard uit. Geen knop
    # in het add-on-scherm: of die laag zin heeft volgt uit welke kaart eronder ligt, en dat weet
    # de server zelf.
    "tile_ref": False,
    # Is de dagkaart een lichte kaart? Dit stuurt de tint waarmee de tegels worden
    # vermenigvuldigd, en daarmee ook de kleuren van alles wat óp de kaart ligt: labels,
    # baanletters, hoogtekleuren. Een lichte kaart wil bijna geen tint en donkere letters, een
    # donkere kaart de blauwe demping van de nacht en lichte letters.
    #
    # Hier staat hij hard op true. Normaal wordt het afgeleid uit het adres ("dark" erin betekent
    # donker) en dat zou met Positron ook goed gaan, maar de dagkaart is nu juist de laag die we
    # met het palet bijkleuren; dan wil je niet dat een adres de tint bepaalt. Zet je een eigen
    # dagkaart in, haal deze regel dan weg of zet hem op null: dan leidt de server het weer af
    # uit het adres.
    "tile_day_light": True,
    "tile_url_ref": CARTO % "dark_only_labels",
    # Kleuren van een kaartlaag omzetten voordat de tegel in de cache gaat. CARTO's donkere
    # kaarten zijn paletplaatjes: negen tot elf grijstinten per tegel, meer niet. "Het water
    # blauw maken" is daarmee geen beeldbewerking maar één regel in dat palet vervangen -- dat
    # kan met de standaardbibliotheek en het kost eenmalig niets.
    #
    # Hieronder de dagkaart: Positron zonder letters, bijgetrokken naar de tinten van een licht
    # canvas -- land in één rustig grijs, water er net onder in een grijs met een spoor blauw,
    # zodat de kust zichtbaar blijft zonder dat de zee om aandacht vraagt. Gemeten op een
    # kustregel: land #efefef, water #d0cfd4.
    #
    #   grijs_van/grijs_tot  de donkerste en lichtste tint die de kaart zelf gebruikt
    #   wordt_van/wordt_tot  wat daarvoor in de plaats komt; alles ertussen schuift mee op
    #   neutraal             ramp op helderheid in plaats van op echt grijs (r=g=b); zo gaat ook
    #                        een kaart met een kleurzweem mee, en komt hij er neutraal uit
    #   water_min            vanaf welk blauwoverschot (blauw min rood) een kleur water is.
    #                        Gemeten in het Positron-palet: land en wegen zitten op 0 of lager,
    #                        water en zijn kustrand op 3 tot 12. Dat scheidt schoon.
    #   water_van/water_tot  de donkerste en de lichtste van die waterkleuren; de rand tussen
    #                        zee en kust schuift daar netjes doorheen
    #   vervang              losse kleuren die hun eigen bestemming hebben, vóór al het andere
    #
    # Leeg laten betekent: tegels doorgeven zoals ze binnenkomen.
    "tile_palet": {
        "day": {"neutraal": True,
                "grijs_van": "#cdcdcd", "grijs_tot": "#fafafa",
                "wordt_van": "#dcdcdc", "wordt_tot": "#efefef",
                "water_min": 3, "water_van": "#d0cfd4", "water_tot": "#e9e9eb"},
    },
    # Bronvermelding onder aan de kaart. In het Engels, want die regel is voor de leveranciers
    # van de tegels en de posities en die schrijven hun voorwaarden ook zo; in config.json mag
    # je er je eigen taal van maken.
    "tile_attribution": "Map: © OpenStreetMap contributors, © CARTO. "
                        "Positions: adsb.lol (ODbL), adsb.fi. Airports: OurAirports. "
                        "FIR: EUROCONTROL.",
    "tile_attribution_sat": "Map: © OpenStreetMap contributors, © CARTO. "
                            "Positions: adsb.lol (ODbL), adsb.fi. Airports: OurAirports. "
                            "FIR: EUROCONTROL.",
    # Weer. Alle drie de bronnen zijn vrij en hebben geen sleutel nodig. De METAR's komen per
    # venster binnen in plaats van per lijst velden, dan hoeft er geen lijst bijgehouden te
    # worden. De regenradar levert tegels in dezelfde vorm als de kaartlagen hierboven.
    "weather": {
        "enabled": True,
        "metar_url": "https://aviationweather.gov/api/data/metar?bbox={box}&format=json",
        "metar_min": 5,                  # METAR's komen op hele en halve uren; vaker heeft geen zin
        "sigmet_url": "https://aviationweather.gov/api/data/isigmet?format=json",
        "sigmet_min": 10,
        "rain_index": "https://api.rainviewer.com/public/weather-maps.json",
        "rain_min": 4,                   # nieuw beeld elke 10 minuten
        # kleurenschema 4, glad, met sneeuw. Tegelmaat 512 bestaat ook en is twee keer zo scherp,
        # maar ook drie keer zo zwaar (60 kB tegen 18 kB); op een Pi is 256 de betere ruil.
        "rain_tile": "{host}{path}/256/{z}/{x}/{y}/4/1_1.png",
        "rain_max_z": 7,                 # gemeten: daarboven stuurt RainViewer "Zoom Level Not Supported"
        "rain_cache": 900,               # zoveel tegels in het geheugen; ze verlopen toch
        "metar_km": 260,                 # venster voor de velden: ruimer levert minder op, zie weer_metar
        "metar_max": 60,                 # dichtstbijzijnde zoveel; de rest zegt je hier niets
        "sigmet_km": 600,                # een gebied boven Spanje verklaart hier niets
    },
    "weather_attribution": "Weer: NOAA Aviation Weather Center. Weather data by RainViewer.",
    # url: het adres waarop je OpenWebRX-webinterface te bereiken is; dat vult het paneel naast
    # de kaart. Leeg betekent http://<host>:<port> hieronder -- goed voor een ontvanger op je
    # eigen netwerk. tab_url is hetzelfde adres met een frequentie erachter, voor de knop die
    # OpenWebRX in een eigen tabblad opent. Beide leeg laten tot je ze zelf invult: hier stond
    # een persoonlijk domein, en dat hoort niet in de standaardwaarden van een gedeelde tracker.
    "openwebrx": {
                  # Meeluisteren aan of uit. Staat dit uit, dan bouwt de pagina de hele radiokant
                  # niet op -- geen speler, geen kanalen, geen frequentieknoppen bij een vlucht --
                  # en weigert de server de bijbehorende adressen. Er wordt niets gewist: de
                  # kanalen, de opnames en het geleerde woordenboek blijven staan, dus aanzetten
                  # brengt alles terug zoals het was. Hier staat hij aan omdat een installatie met
                  # een eigen config.json altijd al meeluisterde; in de add-on staat de schakelaar
                  # standaard uit, want de meeste gebruikers hebben geen SDR met OpenWebRX.
                  "enabled": True,
                  "url": "",
                  "tab_url": "",
                  "open_in_tab": True, "port": 8073,
                  # Waar OpenWebRX draait. Leeg of 127.0.0.1 = deze machine, zoals het altijd
                  # was. Draait de tracker elders (Home Assistant), zet hier het adres van de
                  # Pi; dan komen ook de profielen en bookmarks over de websocket binnen in
                  # plaats van uit de twee bestanden hieronder, die daar dan niet meer zijn.
                  "host": "127.0.0.1",
                  "scan_hours": 12,       # zo vaak hooguit een rondje langs de profielen
                  "bookmarks_file": "/var/lib/openwebrx/bookmarks.json",
                  "settings_file": "/var/lib/openwebrx/settings.json", "switch_profile": True,
                  "profile_prefer": "Airband", "squelch": None, "squelch_by_profile": {},
                  "player_url": "",
                  # Audio doorgeven via deze server in plaats van rechtstreeks naar de ontvanger.
                  # "auto" = alleen als de pagina via https binnenkomt (dus van buitenshuis, door
                  # je tunnel of de ingress van Home Assistant); thuis op http blijft het
                  # rechtstreeks, dat scheelt een tussenstap. "aan" = altijd, "uit" = nooit.
                  "relay": "auto",
                  "band_hz": [118000000, 137000000], "channels": []},
    # Foto's van toestellen. De twee adressen stonden vast in de code; nu kun je ze omleggen
    # als planespotters van adres verandert of je een eigen spiegel draait.
    "photos": {"enabled": True, "contact": "",
               "url_hex": "https://api.planespotters.net/pub/photos/hex/{hex}",
               "url_reg": "https://api.planespotters.net/pub/photos/reg/{reg}"},
    # Twee bronnen voor herkomst en bestemming per callsign. hexdb gaat voor (gemeten 96% goed
    # tegen adsbdb), adsbdb is de tweede kandidaat. Beide adressen zijn omlegbaar.
    "routes": {"enabled": True, "url": "https://api.adsbdb.com/v0/callsign/{callsign}",
               "url_hexdb": "https://hexdb.io/api/v1/route/icao/{callsign}",
               "lookups_per_s": 3, "ttl_days": 30, "miss_ttl_days": 2},
    "airports_live": {
        "enabled": True, "poll_s": 180, "tt_poll_s": 600, "hours_back": 6, "hours_ahead": 18,
        "keep_hours": 24,
        # De teletekstpagina's komen van de NOS; {page} is het paginanummer.
        "teletext_url": "https://teletekst-data.nos.nl/json/{page}",
        "sources": [
            {"icao": "EHAM", "kind": "ciss", "enabled": True},
            {"icao": "EHRD", "kind": "rtha", "enabled": True,
             "url": "https://www.rotterdamthehagueairport.nl/wp-json/rtha/v2/flights"},
            {"icao": "EHEH", "kind": "ein", "enabled": True,
             "url": "https://www.eindhovenairport.nl/api/flights"},
            # 768 draagt Maastricht en Eindhoven, 769 Rotterdam en Groningen. Geen van beide is
            # een zuivere terugval: EHBK en EHGG hebben geen andere bron, en de velden die dat wel
            # hebben worden er per vlucht uitgefilterd zodra hun eigen bron werkt.
            {"icao": "EHBK", "kind": "teletekst", "enabled": True, "pages": [768]},
            {"icao": "EHGG", "kind": "teletekst", "enabled": True, "pages": [769]},
            # zonder pages kiest de terugval zelf het dagdeel dat bij de klok hoort
            {"icao": "EHAM", "kind": "teletekst", "enabled": True, "fallback": True},
        ]},
    # Logo's van de maatschappijen voor het vluchtenbord. De browser vraagt ze aan de eigen
    # server; die haalt ze eenmalig op en zet ze in de cache, zodat de Pi de enige is die naar
    # buiten praat en het bord ook zonder internet blijft werken. Zet je zelf een bestand in
    # web/logos/, dan wint dat altijd. Een gemiste code wordt onthouden en niet elk uur opnieuw
    # geprobeerd.
    "logos": {"enabled": True, "url": "https://images.kiwi.com/airlines/64/{iata}.png",
              "ttl_days": 180, "miss_ttl_days": 7},
    "opensky": {"enabled": False, "client_id": "", "client_secret": "",
                "token_url": "https://auth.opensky-network.org/auth/realms/opensky-network"
                             "/protocol/openid-connect/token",
                "base_url": "https://opensky-network.org/api",
                "airports": [], "days_back": 7, "keep_days": 60, "min_seen": 2,
                "run_hour": 4, "max_requests": 60, "learn_routes": True,
                "min_flights": 2, "pair_days": 30},
    "airframes": {"enabled": True,
                  "url": "https://s3.opensky-network.org/data-samples/metadata/aircraftDatabase.csv",
                  "refresh_days": 30},
    "observer": {"lat": None, "lon": None, "label": "HQ"},
    "schiphol": {"enabled": False, "client_id": "", "client_secret": "",
                 "token_url": "https://api.auth.schiphol.nl/oauth/token",
                 "audience": "https://api.schiphol.nl/public",
                 "base_url": "https://api.schiphol.nl/public/public-flights/v4",
                 "hours_back": 2, "hours_ahead": 4, "poll_s": 120, "max_pages": 200},
    "openaip": {"enabled": True, "api_key": "",
                "url": "https://api.core.openaip.net/api/airspaces",
                "radius_nm": 150, "refresh_days": 7,
                "types": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 26]},
    "stt": {"enabled": True, "bin": "", "model": "", "language": "en", "threads": 4,
            # greedy: gemeten 14% sneller dan beam 5 en geen enkele regressie -- beam search
            # verzon er juist woorden bij die niet waren uitgesproken
            "timeout_s": 120, "beam": 1, "best_of": 1, "max_context": 0,
            "entropy": 2.6, "logprob": -1.0, "polish": True, "match_callsigns": True,
            "prompt_callsigns": True, "prompt_max": 28, "airlines": {},
            "model_fast": "", "who_seconds": 6, "who_min": 3.0,
            "who_partial": 2, "who_offscreen": True, "audio_ctx": 512, "max_queue": 1, "slice_seconds": 2.6,
            # De encoder op de iGPU in plaats van de CPU (Vulkan).
            #
            # LAAT DIT UIT tenzij je weet dat je grafische driver het aankan. Op een Intel HD
            # Graphics 530 (Gen9, 2015) crashte de Vulkan-build niet maar HING hij, en sleepte hij
            # de hele machine mee: Home Assistant antwoordde op geen enkele poort meer en alleen
            # de stekker hielp. Een vastgelopen i915 laat het proces in ononderbreekbare slaap
            # achter, waar zelfs SIGKILL niet landt -- geen tijdslimiet in deze code komt daar
            # tussen. De add-on bouwt sinds 0.5.3 geen GPU-versie meer, dus dit veld doet daar
            # niets; het staat er voor wie zelf een whisper-cli-gpu neerzet en weet wat hij doet.
            "gpu": False,
            "record": False, "record_days": 30, "record_max_mb": 500,
            # wat bewaren: "leerzaam" houdt alleen de twijfelgevallen plus een steekproef van de
            # zekere treffers, "alles" bewaart elke transmissie (vult de schijf veel sneller)
            "record_keep": "leerzaam", "record_sample": 10,
            # rekenvenster: audio_ctx voor de snelle stap, audio_ctx_full voor de volledige
            # transcriptie, audio_ctx_atc voor beide als het model bijgetraind is op ATC.
            # 0 = het volle venster van 30 seconden. Meet met tools/whisper-bench.sh.
            "audio_ctx_atc": 0, "audio_ctx_full": 0,
            "lexicon": True, "lexicon_min": 3,
            # licht automatisch leren uit zekere treffers; zet learn op false om het uit te zetten
            "learn": True, "learn_conf": 0.9,
            "prompt": "Air traffic control radio: Schiphol Tower, Amsterdam Radar, cleared to land "
                      "runway 18R, contact departure, QNH 1013, squawk 7000, descend flight level 70, "
                      "KLM, Transavia, Easy, Speedbird, Delta, callsign."},
    "navdata": {"enabled": True,
                "fix_url": "https://raw.githubusercontent.com/mcantsin/x-plane-navdata/master/earth_fix.dat",
                "nav_url": "https://raw.githubusercontent.com/mcantsin/x-plane-navdata/master/earth_nav.dat",
                "awy_url": "https://raw.githubusercontent.com/mcantsin/x-plane-navdata/master/earth_awy.dat",
                "refresh_days": 180},
}
for _k, _v in DEFAULTS.items():
    if _k not in CFG:
        CFG[_k] = _v
    elif isinstance(_v, dict) and isinstance(CFG[_k], dict):
        for _kk, _vv in _v.items():
            CFG[_k].setdefault(_kk, _vv)

# ---------------------------------------------------------------- instellingen uit het scherm
# Draait de tracker als Home Assistant-add-on, dan schrijft Home Assistant de ingevulde
# instellingen naar /data/options.json en wijst FT_OPTIONS daarheen. Die waarden gaan hier over
# config.json heen, zodat een verse installatie alles in het scherm kan invullen zonder ooit
# een bestand aan te raken.
#
# Een leeg veld telt niet mee. Leeg is "niet ingevuld", niet "maak leeg": anders zou een vers
# scherm de sleutels en het middelpunt wissen van iemand die zijn config.json al had staan. Dat
# maakt de regel ook makkelijk uit te leggen: wat je invult wint, de rest laat je met rust.
OPTIE_KAART = {
    "lat": ("center", "lat"),
    "lon": ("center", "lon"),
    "radius_nm": ("radius_nm",),
    "home_airport": ("home_airport",),
    "trail_minutes": ("trail_max_min",),
    "observer_lat": ("observer", "lat"),
    "observer_lon": ("observer", "lon"),
    "observer_label": ("observer", "label"),
    "listening": ("openwebrx", "enabled"),
    "openwebrx_host": ("openwebrx", "host"),
    "openwebrx_port": ("openwebrx", "port"),
    "openwebrx_url": ("openwebrx", "url"),
    "openwebrx_settings_file": ("openwebrx", "settings_file"),
    "openwebrx_bookmarks_file": ("openwebrx", "bookmarks_file"),
    "openwebrx_relay": ("openwebrx", "relay"),
    "whisper_enabled": ("stt", "enabled"),
    "whisper_gpu": ("stt", "gpu"),
    "whisper_model": ("stt", "model"),
    "whisper_threads": ("stt", "threads"),
    "key_openaip": ("openaip", "api_key"),
    # Geen sleutel maar wel iets dat je moet invullen: planespotters wil in de User-Agent weten
    # wie er aanklopt, en zonder dat weigeren ze de aanvraag.
    "photos_contact": ("photos", "contact"),
    "key_schiphol_id": ("schiphol", "client_id"),
    "key_schiphol_secret": ("schiphol", "client_secret"),
    "key_opensky_id": ("opensky", "client_id"),
    "key_opensky_secret": ("opensky", "client_secret"),
    "url_routes": ("routes", "url"),
    "url_airframes": ("airframes", "url"),
    "url_logos": ("logos", "url"),
    "key_carto": ("tile_key",),
    "url_tiles_night": ("tile_url",),
    "url_tiles_day": ("tile_url_day",),
    "url_tiles_sat": ("tile_url_sat",),
    "url_tiles_radar": ("tile_url_radar",),
    "url_tiles_ref": ("tile_url_ref",),
    "openwebrx_tab_url": ("openwebrx", "tab_url"),
    "url_routes_hexdb": ("routes", "url_hexdb"),
    "url_photos_hex": ("photos", "url_hex"),
    "url_photos_reg": ("photos", "url_reg"),
    "url_ourairports": ("ourairports_url",),
    "url_openaip": ("openaip", "url"),
    "url_schiphol_token": ("schiphol", "token_url"),
    "url_schiphol_base": ("schiphol", "base_url"),
    "url_schiphol_audience": ("schiphol", "audience"),
    "url_opensky_token": ("opensky", "token_url"),
    "url_opensky_base": ("opensky", "base_url"),
    "url_teletext": ("airports_live", "teletext_url"),
    "url_navdata_fix": ("navdata", "fix_url"),
    "url_navdata_nav": ("navdata", "nav_url"),
    "url_navdata_awy": ("navdata", "awy_url"),
    "url_metar": ("weather", "metar_url"),
    "url_sigmet": ("weather", "sigmet_url"),
    "url_rain": ("weather", "rain_index"),
    "url_rain_tile": ("weather", "rain_tile"),
}


# Deze velden staan in het scherm als tekst en niet als getal. Reden: Home Assistant tekent het
# scherm uit de lijst met waarden, en een getalveld kan daar niet leeg in staan -- terwijl leeg
# juist onze manier is om "niet ingevuld" te zeggen. Hier gaan ze weer terug naar een getal.
OPTIE_KOMMA = {"lat", "lon", "observer_lat", "observer_lon"}
OPTIE_GEHEEL = {"radius_nm", "trail_minutes", "openwebrx_port", "whisper_threads"}


def optie_getal(veld, waarde):
    """Tekst uit het scherm naar een getal, of None als het geen getal is."""
    try:
        if veld in OPTIE_KOMMA:
            return float(str(waarde).replace(",", "."))
        if veld in OPTIE_GEHEEL:
            return int(float(str(waarde)))
    except (TypeError, ValueError):
        return None
    return waarde


def opties_toepassen(cfg, opt):
    """Ingevulde velden uit het scherm over cfg heen. Geeft terug wat er is overgenomen."""
    gedaan = []
    for veld, pad in OPTIE_KAART.items():
        if veld not in opt:
            continue
        waarde = opt[veld]
        if waarde is None or (isinstance(waarde, str) and not waarde.strip()):
            continue                                   # niet ingevuld
        if veld in OPTIE_KOMMA or veld in OPTIE_GEHEEL:
            waarde = optie_getal(veld, waarde)
            if waarde is None:
                log(f"instelling {veld} is geen getal; ik laat hem staan")
                continue
        doel = cfg
        for stuk in pad[:-1]:
            if not isinstance(doel.get(stuk), dict):
                doel[stuk] = {}
            doel = doel[stuk]
        if doel.get(pad[-1]) != waarde:
            gedaan.append(veld)
        doel[pad[-1]] = waarde

    # De twee positiebronnen staan in een lijst, dus die gaan niet door de tabel hierboven.
    #
    # Alleen de URL vervangen is niet genoeg: elke bron levert de toestellen onder een eigen
    # sleutel in het antwoord, en die stond al in de regel. Zet je er een ander adres in en blijft
    # de oude sleutel staan, dan haalt hij netjes gegevens op en vindt er nul toestellen in --
    # zonder foutmelding, want er ging niets mis. Voor de twee bekende bronnen zetten we de
    # sleutel daarom mee; voor een eigen bron moet je hem in config.json zetten.
    BRON_SLEUTEL = {"adsb.lol": "ac", "adsb.fi": "aircraft", "adsbexchange": "ac", "airplanes.live": "ac"}
    for i, veld in enumerate(("url_positions_1", "url_positions_2")):
        u = (opt.get(veld) or "").strip()
        if not u:
            continue
        bronnen = cfg.setdefault("sources", [])
        while len(bronnen) <= i:
            bronnen.append({"name": f"bron {len(bronnen) + 1}", "key": "ac"})
        if bronnen[i].get("url") != u:
            gedaan.append(veld)
        bronnen[i]["url"] = u
        for merk, sleutel in BRON_SLEUTEL.items():
            if merk in u:
                bronnen[i]["key"] = sleutel
                bronnen[i]["name"] = merk
                break
        else:
            log(f"{veld}: onbekende bron; controleer of sources[{i}].key in config.json klopt")

    # De luchthavenbronnen staan eveneens in een lijst, met hun soort als herkenningspunt.
    for veld, soort in (("url_airport_ehrd", "rtha"), ("url_airport_eheh", "ein")):
        u = (opt.get(veld) or "").strip()
        if not u:
            continue
        for bron in (cfg.get("airports_live") or {}).get("sources") or []:
            if bron.get("kind") == soort:
                if bron.get("url") != u:
                    gedaan.append(veld)
                bron["url"] = u

    # Een sleutel invullen betekent: die koppeling wil ik hebben. Anders zou je hem op twee
    # plekken moeten aanzetten en zoeken waarom er niets gebeurt.
    if (opt.get("key_schiphol_id") or "").strip() and (opt.get("key_schiphol_secret") or "").strip():
        cfg.setdefault("schiphol", {})["enabled"] = True
    if (opt.get("key_opensky_id") or "").strip() and (opt.get("key_opensky_secret") or "").strip():
        cfg.setdefault("opensky", {})["enabled"] = True
    if (opt.get("key_openaip") or "").strip():
        cfg.setdefault("openaip", {})["enabled"] = True
    return gedaan


OPTIES_PAD = os.environ.get("FT_OPTIONS") or ""
OPTIES_OVER = []
if OPTIES_PAD and Path(OPTIES_PAD).is_file():
    try:
        OPTIES_OVER = opties_toepassen(CFG, json.loads(Path(OPTIES_PAD).read_text(encoding="utf-8")))
    except Exception as _e:  # noqa: BLE001
        OPTIES_OVER = []
        print(f"instellingen uit {OPTIES_PAD} niet gelezen: {_e}", flush=True)


def tiles_opschonen(cfg):
    """Esri-adressen en de bijbehorende bronvermelding uit config.json laten vallen.

    Tot 1.71.0 stonden de Esri-kaarten in de code, en wie ooit een config.json heeft laten
    schrijven heeft ze daar letterlijk in staan. Een ingevuld veld wint van een standaard, dus
    die oude regels zouden de nieuwe kaarten blijven tegenhouden -- en dat is niet te zien zonder
    het bestand erbij te pakken.

    Hier gaat elk arcgisonline-adres eruit, ook een zelf ingevuld exemplaar, en niet omdat het
    niet werkt: het mag niet zonder ArcGIS-abonnement, zie het kaartblok bovenaan. Heb je dat
    abonnement wel, dan hoort daar hun eigen tegelroute met token bij; dat is een andere kaart
    dan deze en die vul je niet per ongeluk in."""
    weg = [veld for veld, oud in TILE_OUD.items() if cfg.get(veld) == oud]
    weg += [veld for veld in ("tile_url", "tile_url_day", "tile_url_sat", "tile_url_radar",
                              "tile_url_ref")
            if ESRI_HOST in str(cfg.get(veld) or "")]
    weg = list(dict.fromkeys(weg))
    for veld in weg:
        cfg[veld] = DEFAULTS[veld]
    return weg


# De kaartcredit in de bronvermelding. Die moet kloppen met de kaart die je werkelijk ziet --
# het is geen sierregel maar de voorwaarde waaronder je die tegels mag tonen. De rest van de
# zin (posities, luchthavens, jouw taal en formulering) blijft van jou.
ATTR_ESRI_NAAR_CARTO = [
    ("Esri, HERE, Garmin, © OpenStreetMap-bijdragers", "© OpenStreetMap-bijdragers, © CARTO"),
    ("Esri, HERE, Garmin, © OpenStreetMap contributors", "© OpenStreetMap contributors, © CARTO"),
    ("Esri, Maxar, Earthstar Geographics", "© OpenStreetMap-bijdragers, © CARTO"),
]


def attributie_meewisselen(cfg):
    """Noemt de bronvermelding nog Esri terwijl de kaart van CARTO komt, dan die credit wisselen."""
    if "cartocdn" not in str(cfg.get("tile_url") or ""):
        return []
    gedaan = []
    for veld in ("tile_attribution", "tile_attribution_sat"):
        tekst = str(cfg.get(veld) or "")
        for oud, nieuw in ATTR_ESRI_NAAR_CARTO:
            if oud in tekst:
                cfg[veld] = tekst.replace(oud, nieuw)
                gedaan.append(veld)
                break
    return gedaan


TILES_OUD_WEG = tiles_opschonen(CFG)
ATTR_GEWISSELD = attributie_meewisselen(CFG)

UA = "flighttracknl/1.0 (persoonlijk gebruik, Raspberry Pi)"
# Luchthavens, banen en frequenties. De map met csv-bestanden; de bestandsnamen komen erachter.
OURAIRPORTS = CFG.get("ourairports_url") or "https://davidmegginson.github.io/ourairports-data/"
FIELDS = ["hex", "flight", "lat", "lon", "altg", "altb", "gs", "track", "vr",
          "type", "reg", "cat", "squawk", "ground", "emerg", "t", "mcp", "fms"]

lock = threading.Lock()
snapshot = {"now": 0, "fields": FIELDS, "ac": [], "status": "starting", "error": None, "source": ""}
snapshot_gz = b""
trails = {}            # hex -> [[t, lat, lon, altg_ft], ...]
airports_payload = {"loading": True, "airports": []}
airports_all = {}        # ICAO -> [iata, plaats, lat, lon, landcode], voor routes buiten het gebied
airports_iata = {}       # IATA -> [iata, plaats, lat, lon, landcode, icao]
last_client = 0.0
GEOID_FT = float(CFG.get("geoid_offset_m", 0)) / 0.3048


def log(msg):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), msg, flush=True)


def http_get(url, timeout=15, accept_gzip=True):
    headers = {"User-Agent": UA}
    if accept_gzip:
        headers["Accept-Encoding"] = "gzip"     # sommige servers (S3) weigeren dit
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            data = gzip.decompress(data)
        return data


def dist_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(a))


def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


# ---------------------------------------------------------------- aircraft

def slim(a, now):
    lat, lon = num(a.get("lat")), num(a.get("lon"))
    if lat is None or lon is None:
        return None
    ground = 1 if a.get("alt_baro") == "ground" else 0
    altb = 0 if ground else num(a.get("alt_baro"))
    altg = 0 if ground else num(a.get("alt_geom"))
    if altg is not None and not ground:
        altg -= GEOID_FT            # WGS84-ellipsoïdehoogte -> ongeveer MSL
    if altg is None:
        altg = altb
    if altg is None:
        return None
    track = num(a.get("track"))
    if track is None:
        track = num(a.get("true_heading"))
    if track is None:
        track = num(a.get("mag_heading"))
    vr = num(a.get("baro_rate"))
    if vr is None:
        vr = num(a.get("geom_rate")) or 0
    seen_pos = num(a.get("seen_pos")) or 0
    return [
        a.get("hex", ""),
        (a.get("flight") or "").strip(),
        round(lat, 5), round(lon, 5),
        int(altg), None if altb is None else int(altb),
        round(num(a.get("gs")) or 0, 1),
        None if track is None else round(track, 1),
        int(vr),
        a.get("t") or "", a.get("r") or "", a.get("category") or "",
        a.get("squawk") or "", ground, a.get("emergency") or "none",
        round(now - seen_pos, 2),
        # door de bemanning ingestelde hoogte (MCP/FCU) en die van de FMS, als het toestel ze uitzendt
        int(num(a.get("nav_altitude_mcp"))) if num(a.get("nav_altitude_mcp")) is not None else None,
        int(num(a.get("nav_altitude_fms"))) if num(a.get("nav_altitude_fms")) is not None else None,
    ]


def encode(obj):
    return gzip.compress(json.dumps(obj, separators=(",", ":")).encode(), 5)


def areas():
    """Gebieden die worden opgevraagd. Het eerste is het thuisgebied en gaat elke ronde mee."""
    lst = CFG.get("areas") or []
    if not lst:
        c = CFG["center"]
        lst = [{"name": "thuis", "lat": c["lat"], "lon": c["lon"], "radius_nm": CFG["radius_nm"]}]
    out = []
    for a in lst:
        out.append({"name": a.get("name", "gebied"), "lat": float(a["lat"]), "lon": float(a["lon"]),
                    "radius": max(1, min(250, int(a.get("radius_nm", CFG["radius_nm"]))))})
    return out


def coverage_km():
    """Straal rond het middelpunt die alle gebieden omvat."""
    c = CFG["center"]
    return max(dist_km(c["lat"], c["lon"], a["lat"], a["lon"]) + a["radius"] * 1.852
               for a in areas())


def sources():
    src = CFG.get("sources") or [{"name": "adsb.lol",
                                  "url": "https://api.adsb.lol/v2/point/{lat}/{lon}/{radius}",
                                  "key": "ac"}]
    gap = float(CFG.get("min_gap_s", 2.0))
    return [{"name": s.get("name", "bron"), "url": s["url"], "key": s.get("key", "ac"),
             "base": float(s.get("min_gap_s", gap)),
             "gap": float(s.get("min_gap_s", gap)),   # past zich aan: x2 bij 429, langzaam terug
             "next": 0.0,        # vroegste moment voor de volgende aanvraag
             "n429": 0,          # 429's sinds de laatste melding
             "ok": 0,            # geslaagde aanvragen op rij
             "logged": 0.0}      # tijdstip laatste 429-melding
            for s in src]


def _reason(e):
    if isinstance(e, urllib.error.HTTPError):
        return f"HTTP {e.code}"
    if isinstance(e, urllib.error.URLError):
        return f"{e.reason}"
    return f"{type(e).__name__}: {e}"


def source_time(d, local):
    """Tijdstempel van de bron naar seconden. adsb.lol geeft milliseconden, adsb.fi seconden.

    Wijkt de bronklok meer dan vijf minuten af van de onze, dan gebruiken we onze eigen klok:
    de posities hangen aan seen_pos en die is altijd relatief.
    """
    raw = num(d.get("now"))
    if raw:
        for candidate in (raw / 1000.0, raw):
            if abs(candidate - local) < 300:
                return candidate
    return local


def fetch_any(srcs, cur, area):
    """Haal een gebied op, bij voorkeur bij de huidige bron.

    Elke bron krijgt minstens `min_gap_s` tussen twee aanvragen; na een 429 wordt dat per keer
    verdubbeld (tot 60 s) en na elke 10 geslaagde aanvragen weer 10% korter. Is de huidige bron
    nog niet aan de beurt, dan doet een andere bron dit gebied. Dat is geen
    uitval: `cur` blijft staan. Alleen een echte fout (time-out, 5xx, geen verbinding) telt
    als uitval.
    Geeft (gebruikte bron, data, echte fout van de huidige bron of None, laatste fout).
    """
    now = time.time()
    order = [(cur + k) % len(srcs) for k in range(len(srcs))]
    ready = [i for i in order if srcs[i]["next"] <= now]
    if not ready:                                   # iedereen net geweest: kort wachten
        i = min(order, key=lambda j: srcs[j]["next"])
        wait = srcs[i]["next"] - now
        if wait > 5:
            return cur, None, None, None
        time.sleep(wait)
        ready = [i]
    hard = None
    err = None
    for i in ready:
        s = srcs[i]
        url = s["url"].format(lat=area["lat"], lon=area["lon"], radius=area["radius"])
        s["next"] = time.time() + s["gap"]
        try:
            d = json.loads(http_get(url))
        except urllib.error.HTTPError as e:
            err = e
            if e.code == 429:
                # Tempo van deze bron halveren (tot 1 per 60 s) en even wachten.
                ra = e.headers.get("Retry-After") if e.headers else None
                try:
                    pause = max(5.0, min(300.0, float(ra)))
                except (TypeError, ValueError):
                    pause = 15.0
                s["gap"] = min(60.0, s["gap"] * 2)
                s["next"] = time.time() + max(pause, s["gap"])
                s["n429"] += 1
                s["ok"] = 0
                if time.time() - s["logged"] > 600:              # hooguit elke 10 min een regel
                    log(f"{s['name']}: HTTP 429 (te veel aanvragen), tempo nu 1 per {s['gap']:.0f} s"
                        + (f" ({s['n429']}x sinds vorige melding)" if s["n429"] > 1 else ""))
                    s["logged"] = time.time()
                    s["n429"] = 0
                continue
            if i == cur:
                hard = e
            s["next"] = time.time() + max(s["gap"], 30)      # echte fout: even met rust laten
            continue
        except Exception as e:  # noqa: BLE001
            err = e
            if i == cur:
                hard = e
            s["next"] = time.time() + max(s["gap"], 30)
            continue
        s["ok"] += 1
        if s["gap"] > s["base"] and s["ok"] >= 10:            # 10x goed: 10% sneller
            s["gap"] = max(s["base"], s["gap"] * 0.9)
            s["ok"] = 0
        return i, d, hard, None
    return cur, None, hard, err


def poll_loop():
    """Elke ronde het thuisgebied, plus om beurten één van de andere gebieden."""
    global snapshot, snapshot_gz
    step = float(CFG.get("trail_step_s", 4))
    tmax = float(CFG.get("trail_max_min", 15)) * 60
    srcs = sources()
    ar = areas()
    latest = {}             # hex -> rij, van alle gebieden samen
    cur = 0
    fails = 0
    fallback_since = 0.0
    turn = 1                # welk niet-thuisgebied nu aan de beurt is
    retrying = False        # na retry_primary_s weer de eerste bron aan het proberen
    home_src = ""
    while True:
        t0 = time.time()
        if cur and t0 - fallback_since > float(CFG.get("retry_primary_s", 600)):
            cur = 0
            retrying = True
        todo = [ar[0]] if len(ar) == 1 else [ar[0], ar[turn]]
        if len(ar) > 1:
            turn = 1 if turn + 1 >= len(ar) else turn + 1
        got = False
        for n, area in enumerate(todo):
            used, d, hard, err = fetch_any(srcs, cur, area)
            if hard is not None:
                if retrying:
                    log(f"{srcs[cur]['name']} nog niet terug: {_reason(hard)}")
                    retrying = False
                elif d is not None:
                    log(f"overgeschakeld naar {srcs[used]['name']} "
                        f"({srcs[cur]['name']}: {_reason(hard)})")
                if d is not None:
                    cur = used
                    fallback_since = t0 if used else 0.0
            if d is None:
                if err is not None and fails == 0 and n == 0:
                    log(f"ophalen mislukt: {_reason(err)}")
                continue
            if retrying and used == 0:
                log(f"terug op {srcs[0]['name']}")
                retrying = False
            src = srcs[used]
            if n == 0:
                home_src = src["name"]
            now = source_time(d, time.time())
            got = True
            with lock:
                for a in d.get(src["key"]) or []:
                    row = slim(a, now)
                    if not row:
                        continue
                    prev = latest.get(row[0])
                    if prev and prev[15] >= row[15]:
                        continue                  # oudere meting dan we al hadden
                    latest[row[0]] = row
                    p = [row[15], row[2], row[3], row[4]]
                    tr = trails.get(row[0])
                    if tr is None:
                        trails[row[0]] = [p]
                    elif p[0] - tr[-1][0] >= step:
                        tr.append(p)
        if got:
            now = time.time()
            with lock:
                for h in [h for h, r in latest.items() if now - r[15] > 120]:
                    latest.pop(h, None)           # te lang niets gehoord
                cutoff = (max((r[15] for r in latest.values()), default=now)) - tmax
                for h in list(trails):
                    tr = trails[h]
                    i = 0
                    while i < len(tr) and tr[i][0] < cutoff:
                        i += 1
                    if i:
                        del tr[:i]
                    if not tr:
                        del trails[h]
                rows = list(latest.values())
                snapshot = {"now": max((r[15] for r in rows), default=now), "fields": FIELDS,
                            "ac": rows, "status": "ok", "error": None, "source": home_src or srcs[cur]["name"],
                            "areas": len(ar)}
                snapshot_gz = encode(snapshot)
            if fails:
                log(f"data weer binnen via {home_src or srcs[cur]['name']} ({len(rows)} toestellen)")
            fails = 0
        else:
            fails += 1
            if fails in (1, 10) or fails % 100 == 0:
                log(f"geen enkele bron bereikbaar ({fails}x)")
            with lock:
                snapshot = dict(snapshot, status="error")
                snapshot_gz = encode(snapshot)
        stil = time.time() - last_client
        if stil < 120:
            interval = float(CFG["poll_active_s"])
        elif stil < float(CFG.get("sleep_after_s", 900) or 900):
            interval = float(CFG["poll_idle_s"])
        else:
            interval = float(CFG.get("poll_sleep_s", 60) or 60)
        if fails:
            interval = min(30, interval * min(fails, 6))
        interval += random.uniform(0, 0.4)
        time.sleep(max(0.3, interval - (time.time() - t0)))


# ---------------------------------------------------------------- airports

def ensure_csv(name):
    p = CACHE / name
    if not p.exists() or time.time() - p.stat().st_mtime > 30 * 86400:
        try:
            data = http_get(OURAIRPORTS + name, 90)
            tmp = p.with_suffix(".tmp")
            tmp.write_bytes(data)
            tmp.replace(p)
            log(f"{name} ververst ({len(data) // 1024} kB)")
        except Exception as e:  # noqa: BLE001
            if not p.exists():
                raise
            log(f"{name} verversen mislukt, oude versie gebruikt: {e}")
    return p


def load_airports():
    global airports_payload, airports_all, airports_iata
    c = CFG["center"]
    rkm = coverage_km()
    for attempt in range(1, 1000):
        try:
            aps = {}
            index = {}
            with open(ensure_csv("airports.csv"), newline="", encoding="utf-8") as f:
                for r in csv.DictReader(f):
                    typ = r["type"]
                    ident = r["ident"]
                    if len(ident) == 4 and ident.isalpha():
                        try:
                            index[ident.upper()] = [r["iata_code"],
                                                    r["municipality"] or r["name"],
                                                    float(r["latitude_deg"]), float(r["longitude_deg"]),
                                                    (r["iso_country"] or "")]
                        except ValueError:
                            pass
                    if typ not in ("large_airport", "medium_airport"):
                        continue
                    if typ == "medium_airport" and r["scheduled_service"] != "yes":
                        continue
                    try:
                        lat, lon = float(r["latitude_deg"]), float(r["longitude_deg"])
                    except ValueError:
                        continue
                    d = dist_km(c["lat"], c["lon"], lat, lon)
                    if d > rkm:
                        continue
                    aps[r["ident"]] = {
                        "icao": r["ident"], "iata": r["iata_code"], "name": r["name"],
                        "city": r["municipality"],
                        "size": "large" if typ == "large_airport" else "medium",
                        "lat": lat, "lon": lon, "d": round(d, 1), "runways": [],
                    }
            with open(ensure_csv("runways.csv"), newline="", encoding="utf-8") as f:
                for r in csv.DictReader(f):
                    ap = aps.get(r["airport_ident"])
                    if not ap or r["closed"] == "1":
                        continue
                    try:
                        lat1, lon1 = float(r["le_latitude_deg"]), float(r["le_longitude_deg"])
                        lat2, lon2 = float(r["he_latitude_deg"]), float(r["he_longitude_deg"])
                    except ValueError:
                        continue
                    try:
                        width_m = float(r["width_ft"]) * 0.3048
                    except ValueError:
                        width_m = 45.0
                    ap["runways"].append({"id": f'{r["le_ident"]}/{r["he_ident"]}',
                                          "lat1": lat1, "lon1": lon1, "lat2": lat2, "lon2": lon2,
                                          "w": round(width_m, 1)})
            # radiofrequenties per luchthaven (type, omschrijving, kanaal in MHz); los van de rest,
            # zodat een mislukte download de luchthavens niet tegenhoudt
            try:
                with open(ensure_csv("airport-frequencies.csv"), newline="", encoding="utf-8") as f:
                    for r in csv.DictReader(f):
                        ap = aps.get(r["airport_ident"])
                        if not ap:
                            continue
                        try:
                            mhz = float(r["frequency_mhz"])
                        except ValueError:
                            continue
                        if 108 <= mhz <= 137:
                            ap.setdefault("freqs", []).append([(r["type"] or "").upper(), r["description"] or "", mhz])
            except Exception as e:  # noqa: BLE001
                log(f"frequenties laden mislukt: {e}")
            lst = sorted(aps.values(), key=lambda a: a["d"])
            with lock:
                airports_payload = {"loading": False, "airports": lst}
                airports_all = index
                airports_iata = {v[0].upper(): v + [k] for k, v in index.items() if v[0]}
            log(f"{len(lst)} luchthavens binnen {round(rkm)} km geladen")
            return
        except Exception as e:  # noqa: BLE001
            log(f"luchthavens laden mislukt (poging {attempt}): {e}")
            time.sleep(min(300, 15 * attempt))


# ---------------------------------------------------------------- routes

ROUTE_COLS = ("cs", "found", "updated", "o_icao", "o_iata", "o_name", "o_lat", "o_lon", "o_cc",
              "d_icao", "d_iata", "d_name", "d_lat", "d_lon", "d_cc", "airline", "alt_o", "alt_d", "src")
db_lock = threading.Lock()
db = None
routes_cache = {"built": 0.0, "gz": b""}
routes_mem = {}          # callsign -> [o..., d..., airline, alt_o, alt_d]; gespiegeld uit SQLite
views = []               # [(tijd, lat1, lon1, lat2, lon2)] van wat browsers de afgelopen minuut bekeken
views_lock = threading.Lock()
MEM_COLS = ("o_icao", "o_iata", "o_name", "o_lat", "o_lon", "o_cc",
            "d_icao", "d_iata", "d_name", "d_lat", "d_lon", "d_cc", "airline", "alt_o", "alt_d")


def db_open():
    global db
    db = sqlite3.connect(str(CACHE / "routes.db"), check_same_thread=False)
    db.execute("""CREATE TABLE IF NOT EXISTS routes(
        cs TEXT PRIMARY KEY, found INTEGER, updated INTEGER,
        o_icao TEXT, o_iata TEXT, o_name TEXT, o_lat REAL, o_lon REAL,
        d_icao TEXT, d_iata TEXT, d_name TEXT, d_lat REAL, d_lon REAL,
        airline TEXT)""")
    for col in ("o_cc", "d_cc", "alt_o", "alt_d", "src"):
        try:
            db.execute(f"ALTER TABLE routes ADD COLUMN {col} TEXT")
        except sqlite3.OperationalError:
            pass
    db.execute("""CREATE TABLE IF NOT EXISTS airframes(
        hex TEXT PRIMARY KEY, built TEXT, serial TEXT, owner TEXT, model TEXT)""")
    db.execute("CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT)")
    # Welk toestel op welk veld vertrok of landde, achteraf vastgesteld door OpenSky.
    db.execute("""CREATE TABLE IF NOT EXISTS fieldhex(
        hex TEXT, icao TEXT, seen INTEGER, n INTEGER, cs TEXT,
        PRIMARY KEY (hex, icao))""")
    db.execute("CREATE INDEX IF NOT EXISTS fieldhex_seen ON fieldhex(seen)")
    # Hoe vaak een callsign met dezelfde herkomst en bestemming gezien is. Pas bij herhaling
    # wordt daar een route van gemaakt; zie fields_leer.
    # Wat het vluchtenbord laat zien. De bronnen geven de kalenderdag, geen voortschrijdend
    # venster: om middernacht slaat Rotterdam om en is de hele vorige dag weg. Daarom bewaart de
    # server zelf wat hij gezien heeft, zodat het bord geschiedenis houdt over die sprong heen.
    db.execute("""CREATE TABLE IF NOT EXISTS bordvlucht(
        sleutel TEXT PRIMARY KEY, home TEXT, dir TEXT, flight TEXT, reg TEXT, cs TEXT,
        sched TEXT, eta TEXT, actual TEXT, gate TEXT, belt TEXT, states TEXT,
        other TEXT, other_icao TEXT, plaats TEXT, src TEXT, hard INTEGER,
        t REAL, gezien REAL, airline TEXT)""")
    try:
        db.execute("ALTER TABLE bordvlucht ADD COLUMN airline TEXT")
    except sqlite3.OperationalError:
        pass
    db.execute("CREATE INDEX IF NOT EXISTS bordvlucht_t ON bordvlucht(t)")
    db.execute("""CREATE TABLE IF NOT EXISTS routepaar(
        cs TEXT, o TEXT, d TEXT, n INTEGER, seen INTEGER,
        PRIMARY KEY (cs, o, d))""")
    db.commit()
    # 1.38.0 maakte van elke losse vlucht meteen een route. Een callsign hoort niet bij een vaste
    # route - Ryanair en Transavia rouleren ze per dag - dus daar stond onzin tussen, met dezelfde
    # status als een bevestigde route van adsbdb. Alles wat niet van adsbdb kwam gaat er daarom
    # eenmalig uit; adsbdb levert altijd een maatschappijnaam, de rest niet. Wat weg is wordt
    # gewoon opnieuw opgezocht.
    if not db.execute("SELECT v FROM meta WHERE k='routes_clean'").fetchone():
        weg = db.execute("DELETE FROM routes WHERE found=1 AND "
                         "(airline IS NULL OR airline='')").rowcount
        db.execute("DELETE FROM routepaar")
        db.execute("DELETE FROM fieldhex")
        db.execute("DELETE FROM meta WHERE k LIKE 'os:%'")
        db.execute("INSERT OR REPLACE INTO meta (k,v) VALUES ('routes_clean','1')")
        db.commit()
        if weg:
            log(f"{weg} routes zonder maatschappij opgeruimd; thuisvelden worden opnieuw opgehaald")
    # Alles wat vóór de bronwissel is opgezocht komt van adsbdb, en die had een op de vijf routes
    # fout. Ze blijven in beeld staan, maar gelden als verouderd, zodat de opzoeker ze rustig
    # vervangt door wat hexdb zegt in plaats van het scherm leeg te maken.
    if not db.execute("SELECT v FROM meta WHERE k='routes_hexdb'").fetchone():
        oud = db.execute("UPDATE routes SET updated=0 WHERE found=1 AND "
                         "(src IS NULL OR src='')").rowcount
        db.execute("INSERT OR REPLACE INTO meta (k,v) VALUES ('routes_hexdb','1')")
        db.commit()
        if oud:
            log(f"{oud} routes van adsbdb worden opnieuw opgezocht, hexdb gaat nu voor")
    for row in db.execute(f"SELECT cs,{','.join(MEM_COLS)} FROM routes WHERE found=1"):
        routes_mem[row[0]] = list(row[1:])
    log(f"{len(routes_mem)} routes uit de cache geladen")


def hexdb_route(cs):
    """Tweede bron: hexdb.io geeft de route als \"EGLL-EHAM\"."""
    try:
        hx = ((CFG.get("routes") or {}).get("url_hexdb")
              or "https://hexdb.io/api/v1/route/icao/{callsign}")
        d = json.loads(http_get(hx.format(callsign=urllib.parse.quote(cs)), 15))
        parts = [p.strip().upper() for p in (d.get("route") or "").split("-") if p.strip()]
        if len(parts) >= 2:
            return parts[0], parts[-1]
    except Exception:  # noqa: BLE001
        pass
    return None


def route_store(cs, found, data, alt=None, src=""):
    row = {"cs": cs, "found": 1 if found else 0, "updated": int(time.time()), "src": src,
           "alt_o": (alt or ("", ""))[0], "alt_d": (alt or ("", ""))[1]}
    for side, src in (("o", (data or {}).get("origin")), ("d", (data or {}).get("destination"))):
        src = src or {}
        row[f"{side}_icao"] = src.get("icao_code") or ""
        row[f"{side}_iata"] = src.get("iata_code") or ""
        row[f"{side}_name"] = src.get("municipality") or src.get("name") or ""
        row[f"{side}_cc"] = src.get("country_iso_name") or ""
        row[f"{side}_lat"] = num(src.get("latitude"))
        row[f"{side}_lon"] = num(src.get("longitude"))
    row["airline"] = ((data or {}).get("airline") or {}).get("name") or ""
    with db_lock:
        db.execute(f"INSERT OR REPLACE INTO routes ({','.join(ROUTE_COLS)}) "
                   f"VALUES ({','.join('?' * len(ROUTE_COLS))})",
                   [row[c] for c in ROUTE_COLS])
        db.commit()
        if found:
            routes_mem[cs] = [row[c] for c in MEM_COLS]
        else:
            routes_mem.pop(cs, None)


def route_fresh():
    """Callsigns die al recent zijn opgezocht, met hun leeftijdgrens."""
    r = CFG.get("routes") or {}
    now = int(time.time())
    hit = now - int(float(r.get("ttl_days", 30)) * 86400)
    miss = now - int(float(r.get("miss_ttl_days", 2)) * 86400)
    with db_lock:
        rows = db.execute("SELECT cs FROM routes WHERE (found=1 AND updated>? AND o_cc IS NOT NULL) "
                          "OR (found=0 AND updated>?)", (hit, miss)).fetchall()
    return {r[0] for r in rows}


def leg_van(o, dst, airline=""):
    """Een route-object uit twee ICAO-codes, met de luchthavengegevens erbij."""
    ao, ad = airports_all.get((o or "").upper()), airports_all.get((dst or "").upper())
    if not ao or not ad:
        return None
    return {"origin": {"icao_code": o, "iata_code": ao[0], "municipality": ao[1],
                       "latitude": ao[2], "longitude": ao[3], "country_iso_name": ao[4]},
            "destination": {"icao_code": dst, "iata_code": ad[0], "municipality": ad[1],
                            "latitude": ad[2], "longitude": ad[3], "country_iso_name": ad[4]},
            "airline": {"name": airline} if airline else None}


def route_lookup(cs):
    """Twee bronnen, en hexdb gaat voor. Getoetst op 70 callsigns waarvan OpenSky in een week
    minstens vier keer dezelfde route waarnam: hexdb had er 96% goed en geen enkele fout, adsbdb
    74% goed en 20% echt fout - verouderde of door elkaar gehaalde etappes van een callsign dat
    meerdere routes vliegt. Drie toestellen die op Schiphol geparkeerd stonden bevestigden dat
    los daarvan: hexdb drie van de drie goed, adsbdb nul. adsbdb blijft wel de bron van de
    maatschappijnaam, en zijn route blijft als tweede kandidaat staan: de plot kiest tussen de
    kandidaten op de koers die het toestel werkelijk vliegt."""
    r = CFG.get("routes") or {}
    url = r.get("url", "https://api.adsbdb.com/v0/callsign/{callsign}").format(
        callsign=urllib.parse.quote(cs))
    hx = hexdb_route(cs) if r.get("second_source", True) else None
    try:
        d = json.loads(http_get(url, 20))
        ads = (d.get("response") or {}).get("flightroute")
    except urllib.error.HTTPError as e:
        if e.code == 429:
            log("routes: te veel aanvragen, een minuut wachten")
            time.sleep(60)
            return False
        if e.code != 404:
            return False
        ads = None
    except Exception:  # noqa: BLE001
        return False

    naam = ((ads or {}).get("airline") or {}).get("name") or ""
    ao = (ads or {}).get("origin") or {}
    ad = (ads or {}).get("destination") or {}
    ads_paar = (ao.get("icao_code"), ad.get("icao_code")) if ads else None
    if hx:
        fr = leg_van(hx[0], hx[1], naam)
        if fr:
            # adsbdb als tweede kandidaat, maar alleen als hij iets anders beweert
            alt = ads_paar if ads_paar and ads_paar != hx else None
            route_store(cs, True, fr, alt, src="hexdb")
            return True
    if ads:
        route_store(cs, True, ads, None, src="adsbdb")
        return True
    route_store(cs, False, None, None, src="")
    return True


def note_view(box):
    now = time.time()
    with views_lock:
        views.append((now,) + tuple(box))
        views[:] = [v for v in views if now - v[0] < 60][-20:]


def in_view(lat, lon):
    now = time.time()
    with views_lock:
        vs = list(views)
    for t0, la1, lo1, la2, lo2 in vs:
        if now - t0 < 60 and la1 <= lat <= la2 and (lo1 <= lon <= lo2 if lo1 <= lo2 else lon >= lo1 or lon <= lo2):
            return True
    return False


def route_loop():
    r = CFG.get("routes") or {}
    if not r.get("enabled", True):
        return
    rate = max(0.2, float(r.get("lookups_per_s", 2)))
    c = CFG["center"]
    while True:
        try:
            with lock:
                rows = [(row[1], row[2], row[3]) for row in snapshot["ac"] if row[1]]
            known = route_fresh()
            # eerst wat nu in beeld is bij een browser, daarna op afstand van het middelpunt
            todo = [(0 if in_view(lat, lon) else 1, dist_km(c["lat"], c["lon"], lat, lon), cs)
                    for cs, lat, lon in rows if cs not in known]
            todo.sort()
            if not todo:
                time.sleep(20)
                continue
            for _, _, cs in todo[:120]:          # kleine porties: nieuw beeld gaat snel voor
                t0 = time.time()
                route_lookup(cs)
                time.sleep(max(0, 1 / rate - (time.time() - t0)))
        except Exception as e:  # noqa: BLE001
            log(f"routes: {e}")
            time.sleep(30)


# ---------------------------------------------------------------- thuisvelden (OpenSky)
# Het filter van/naar leunt op de routetabel, en daar staat geen lesvlucht in: wie van EHRD
# opstijgt, een rondje vliegt en er weer landt heeft geen vluchtnummer en dus geen route.
# OpenSky stelt achteraf per vlucht het vertrek- en aankomstveld vast uit de waarnemingen zelf,
# in een batch die 's nachts draait. Live is dat dus niets waard, maar wie gisteren van EHRD
# vertrok vertrekt er volgende week waarschijnlijk weer: één ronde per nacht levert de vaste
# klanten van elk veld op, en die kent de plot dan meteen bij de eerste meting.
# Wat er langskomt met zowel een vertrek- als een aankomstveld en een echt vluchtnummer vult
# meteen de routetabel aan; dat zijn juist de internationale vluchten die adsbdb en hexdb missen.
OS_TOKEN_URL = ("https://auth.opensky-network.org/auth/realms/opensky-network"
                "/protocol/openid-connect/token")
OS_VENSTER = 2 * 86400            # OpenSky staat per aanvraag hooguit twee dagen toe
os_lock = threading.Lock()
_os_token = {"value": "", "expires": 0.0}
fields_cache = {"built": 0.0, "data": None}
fields_status = {"state": "uit", "updated": 0.0, "hex": 0, "routes": 0, "note": ""}
FLIGHTNR = re.compile(r"^[A-Z]{3}\d")


def os_cfg():
    c = CFG.get("opensky") or {}
    return c if c.get("enabled") and c.get("client_id") and c.get("client_secret") else None


def os_token(cfg):
    """OAuth2 client_credentials; het token is een halfuur geldig."""
    with os_lock:
        if _os_token["value"] and time.time() < _os_token["expires"] - 60:
            return _os_token["value"]
        data = urllib.parse.urlencode({
            "grant_type": "client_credentials",
            "client_id": cfg["client_id"],
            "client_secret": cfg["client_secret"]}).encode()
        req = urllib.request.Request(cfg.get("token_url") or OS_TOKEN_URL, data=data,
                                     headers={"Content-Type": "application/x-www-form-urlencoded",
                                              "User-Agent": UA})
        with urllib.request.urlopen(req, timeout=20) as r:
            tok = json.loads(r.read())
        _os_token["value"] = tok["access_token"]
        _os_token["expires"] = time.time() + float(tok.get("expires_in", 1800))
        return _os_token["value"]


def os_flights(cfg, kind, icao, begin, end):
    """Eén venster van hooguit twee dagen. 404 betekent: dit veld had toen geen verkeer."""
    url = (cfg.get("base_url") or "https://opensky-network.org/api").rstrip("/")
    url += f"/flights/{kind}?airport={urllib.parse.quote(icao)}&begin={int(begin)}&end={int(end)}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {os_token(cfg)}",
                                               "Accept": "application/json", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            body = r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return []
        raise
    return json.loads(body) if body else []


def os_velden():
    """De velden waarop gefilterd kan worden: uit de config, anders dezelfde knoppen als de balk."""
    c = CFG.get("opensky") or {}
    gekozen = [str(x).upper() for x in (c.get("airports") or []) if x]
    if gekozen:
        return gekozen[:12]
    with lock:
        lst = list(airports_payload.get("airports") or [])
    thuis = (CFG.get("home_airport") or "").upper()
    uit = [thuis] if thuis else []
    for ap in lst:
        if ap.get("size") == "large" and ap.get("icao") and ap["icao"] not in uit:
            uit.append(ap["icao"])
    return uit[:8]


def fields_store(kind, icao, flights):
    """Schrijft weg welke toestellen op dit veld vertrokken of landden."""
    eigen = 0
    veld_key = "estDepartureAirport" if kind == "departure" else "estArrivalAirport"
    tijd_key = "firstSeen" if kind == "departure" else "lastSeen"
    with db_lock:
        for f in flights:
            hexid = (f.get("icao24") or "").strip().lower()
            # OpenSky schat het veld; staat er een buurveld in, dan telt het daar en niet hier
            if not hexid or (f.get(veld_key) or "").upper() != icao:
                continue
            cs = (f.get("callsign") or "").strip().upper()
            db.execute("INSERT INTO fieldhex (hex,icao,seen,n,cs) VALUES (?,?,?,1,?) "
                       "ON CONFLICT(hex,icao) DO UPDATE SET seen=max(seen,excluded.seen), "
                       "n=n+1, cs=COALESCE(NULLIF(excluded.cs,''), cs)",
                       (hexid, icao, int(f.get(tijd_key) or 0), cs))
            eigen += 1
        db.commit()
    return eigen


def fields_paren(flights, gezien):
    """Telt op hoe vaak dit callsign met deze herkomst en bestemming voorbijkwam."""
    nu = int(time.time())
    with db_lock:
        for f in flights:
            cs = (f.get("callsign") or "").strip().upper()
            o = (f.get("estDepartureAirport") or "").upper()
            d = (f.get("estArrivalAirport") or "").upper()
            if not cs or not FLIGHTNR.match(cs) or not o or not d or o == d:
                continue
            db.execute("INSERT INTO routepaar (cs,o,d,n,seen) VALUES (?,?,?,1,?) "
                       "ON CONFLICT(cs,o,d) DO UPDATE SET n=n+1, seen=max(seen,excluded.seen)",
                       (cs, o, d, int(f.get("firstSeen") or nu)))
            gezien.add(cs)
        db.commit()


def fields_leer(gezien, min_n, dagen):
    """Een callsign krijgt pas een route als het die meermaals gevlogen heeft, en dan de route
    die de meerderheid vormt. Eén losse waarneming zegt niets: van de callsigns die in een week
    rond Schiphol langskwamen was 26% er maar één keer, en juist daar zat de onzin. En ook wie
    vaker komt wisselt weleens van bestemming in de schatting van OpenSky (KLM1361 stond 5x op
    LKPR en 1x op LKLT), dus de meerderheid beslist, niet de laatste of de eerste vlucht."""
    if not gezien:
        return 0
    known = route_fresh()
    sinds = int(time.time()) - int(float(dagen) * 86400)
    with db_lock:
        rijen = db.execute("SELECT cs,o,d,n FROM routepaar WHERE seen>?", (sinds,)).fetchall()
    per = {}
    for cs, o, d, n in rijen:
        if cs in gezien and cs not in known:
            per.setdefault(cs, []).append((n, o, d))
    uit = 0
    for cs, lst in per.items():
        lst.sort(reverse=True)
        top, o, d = lst[0]
        if top < min_n or top * 2 <= sum(x[0] for x in lst):
            continue                            # te weinig gezien, of geen duidelijke meerderheid
        ao, ad = airports_all.get(o), airports_all.get(d)
        if not ao or not ad:
            continue
        route_store(cs, True, {
            "origin": {"icao_code": o, "iata_code": ao[0], "municipality": ao[1],
                       "latitude": ao[2], "longitude": ao[3], "country_iso_name": ao[4]},
            "destination": {"icao_code": d, "iata_code": ad[0], "municipality": ad[1],
                            "latitude": ad[2], "longitude": ad[3], "country_iso_name": ad[4]}},
            src="opensky")
        uit += 1
    return uit


def fields_taken(cfg, velden, tot):
    """De vensters die nog gehaald moeten worden, oudste eerst, per veld en richting."""
    terug = int(float(cfg.get("days_back", 7)) * 86400)
    taken = []
    with db_lock:
        rows = dict(db.execute("SELECT k,v FROM meta WHERE k LIKE 'os:%'").fetchall())
    for icao in velden:
        for kind in ("departure", "arrival"):
            vanaf = float(rows.get(f"os:{icao}:{kind}", 0) or 0) or (tot - terug)
            while vanaf < tot - 3600:                 # minder dan een uur is de aanvraag niet waard
                eind = min(vanaf + OS_VENSTER, tot)
                taken.append((vanaf, icao, kind, vanaf, eind))
                vanaf = eind
    taken.sort()
    return taken


def fields_round(cfg):
    """Eén ronde. Geeft terug hoeveel seconden tot de volgende."""
    velden = os_velden()
    if not velden:
        return 600                                   # luchthavens zijn nog niet geladen
    # De batch van OpenSky draait 's nachts: van vandaag is er nog niets, dus we stoppen bij
    # middernacht UTC.
    tot = int(time.time() // 86400 * 86400)
    taken = fields_taken(cfg, velden, tot)
    plafond = max(1, int(cfg.get("max_requests", 60)))
    gedaan = vluchten = eigen = nieuwe_routes = 0
    leren = cfg.get("learn_routes", True)
    gezien = set()
    tegoed_op = False
    for _, icao, kind, begin, eind in taken[:plafond]:
        try:
            lst = os_flights(cfg, kind, icao, begin, eind)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                tegoed_op = True
                log("thuisvelden: OpenSky meldt te veel aanvragen, de rest komt morgen")
                break
            if e.code in (401, 403):
                fields_status.update(state="fout", note="sleutels geweigerd")
                log(f"thuisvelden: OpenSky weigert de sleutels (HTTP {e.code})")
                return 3600
            raise
        vluchten += len(lst)
        eigen += fields_store(kind, icao, lst)
        if leren:
            fields_paren(lst, gezien)
        with db_lock:
            db.execute("INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)",
                       (f"os:{icao}:{kind}", str(eind)))
            db.commit()
        gedaan += 1
        time.sleep(1)                                # rustig aan met het tegoed
    if leren and gezien:
        # pas nu, met alle vensters van deze ronde erbij opgeteld, beslist de meerderheid
        nieuwe_routes = fields_leer(gezien, int(cfg.get("min_flights", 2)),
                                    float(cfg.get("pair_days", 30)))
    with db_lock:                                # oude waarnemingen laten vervallen
        db.execute("DELETE FROM routepaar WHERE seen<?",
                   (int(time.time()) - int(float(cfg.get("pair_days", 30)) * 86400),))
        db.commit()
    if gedaan:
        with db_lock:
            db.execute("INSERT OR REPLACE INTO meta (k,v) VALUES ('opensky',?)", (str(time.time()),))
            db.commit()
        fields_cache["built"] = 0.0
        fields_status.update(state="ok", updated=time.time(),
                             note="tegoed op" if tegoed_op else "")
        log(f"thuisvelden: {gedaan} vensters, {vluchten} vluchten, {eigen} koppelingen, "
            f"{nieuwe_routes} nieuwe routes")
    # Nog vensters open en het tegoed is niet op: zo doorgaan. Is het wel op, dan heeft het geen
    # zin om het binnen hetzelfde etmaal opnieuw te proberen; dat wordt weer een weigering.
    if len(taken) - gedaan > 0 and not tegoed_op:
        return 300
    return fields_wacht(cfg)


def fields_wacht(cfg):
    """Seconden tot het ingestelde uur van de volgende nacht."""
    uur = max(0, min(23, int(cfg.get("run_hour", 4))))
    nu = time.localtime()
    doel = time.mktime((nu.tm_year, nu.tm_mon, nu.tm_mday, uur, 7, 0, 0, 0, -1))
    if doel <= time.time():
        doel += 86400
    return max(60, int(doel - time.time()))


def fields_payload():
    c = CFG.get("opensky") or {}
    if fields_cache["data"] and time.time() - fields_cache["built"] < 300:
        return fields_cache["data"]
    keep = int(float(c.get("keep_days", 60)) * 86400)
    sinds = int(time.time()) - keep
    minseen = max(1, int(c.get("min_seen", 2)))
    per = {}
    if db is not None:
        with db_lock:
            rows = db.execute("SELECT icao,hex FROM fieldhex WHERE seen>? AND n>=?",
                              (sinds, minseen)).fetchall()
            m = db.execute("SELECT v FROM meta WHERE k='opensky'").fetchone()
        for icao, hexid in rows:
            per.setdefault(icao, []).append(hexid)
        fields_status["updated"] = float(m[0]) if m and m[0] else 0.0
        fields_status["hex"] = sum(len(v) for v in per.values())
    out = {"enabled": bool(os_cfg()), "updated": fields_status["updated"],
           "days": keep // 86400, "minSeen": minseen,
           "note": fields_status.get("note", ""), "fields": per}
    fields_cache.update(built=time.time(), data=out)
    return out


def fields_loop():
    cfg = os_cfg()
    if not cfg:
        return
    fields_status["state"] = "start"
    time.sleep(20)                                   # eerst de luchthavens laten laden
    while True:
        try:
            wacht = fields_round(cfg)
        except Exception as e:  # noqa: BLE001
            log(f"thuisvelden: {e}")
            fields_status.update(state="fout", note=str(e)[:60])
            wacht = 3600
        time.sleep(wacht)


def alt_pair(o, d):
    """Het alternatief van de tweede bron, met coördinaten, of een lege lijst."""
    ao, ad = airports_all.get((o or "").upper()), airports_all.get((d or "").upper())
    if not ao or not ad:
        return []
    return [o, ao[0], ao[1], ao[2], ao[3], ao[4], d, ad[0], ad[1], ad[2], ad[3], ad[4]]


def parse_box(q):
    bbox = (q.get("bbox") or [""])[0]
    if not bbox:
        return None
    try:
        box = tuple(float(v) for v in bbox.split(",")[:4])
        return box if len(box) == 4 else None
    except ValueError:
        return None


def box_has(box, lat, lon):
    la1, lo1, la2, lo2 = box
    return la1 <= lat <= la2 and (lo1 <= lon <= lo2 if lo1 <= lo2 else lon >= lo1 or lon <= lo2)


def routes_payload(box=None):
    """Routes van de toestellen in beeld, plus wat Schiphol over ze weet."""
    with lock:
        rows = [(r[0], r[1], r[10], r[2], r[3], r[7], r[8], r[13]) for r in snapshot["ac"]]
    out, sch = {}, {}
    for hexid, cs, reg, lat, lon, trk, vr, gnd in rows:
        if box and not box_has(box, lat, lon):
            continue
        if cs:
            m = routes_mem.get(cs)
            if m:
                out[cs] = m[:13] + alt_pair(m[13], m[14])
        if reg or cs:
            motion = {"lat": lat, "lon": lon, "track": trk, "vr": vr, "ground": bool(gnd)}
            info = schiphol_for(reg, cs, motion)
            if info.get("flight"):
                info["home"] = "EHAM"
                info["src"] = "ciss"
                info["hard"] = True
                sch[hexid] = info
            else:
                # geen Schiphol-vlucht: dan de luchthaven van het veld zelf
                v = veld_for(reg, cs, motion)
                if v and v.get("flight"):
                    sch[hexid] = v
    with lock:
        st = schiphol["status"]
    with veld_lock:
        vst = dict(velden_live["bron"])
    return {"routes": out, "sch": sch, "schStatus": st if sch_cfg() else "uit", "veldBron": vst}


# ---------------------------------------------------------------- vectorkaart (RadarPlot)

NE_BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
mapvector = {"ready": False, "gz": b""}


def clip_lines(geojson, lat0, lon0, dlat, dlon):
    out = []
    for feat in geojson.get("features", []):
        g = feat.get("geometry") or {}
        if g.get("type") == "LineString":
            lines = [g["coordinates"]]
        elif g.get("type") == "MultiLineString":
            lines = g["coordinates"]
        else:
            continue
        for line in lines:
            seg = []
            for pt in line:
                lon, lat = pt[0], pt[1]
                if abs(lat - lat0) < dlat and abs(lon - lon0) < dlon:
                    seg.append([round(lon, 3), round(lat, 3)])
                else:
                    if len(seg) > 1:
                        out.append(seg)
                    seg = []
            if len(seg) > 1:
                out.append(seg)
    return out


def _clip_ring(ring, x0, y0, x1, y1):
    """Sutherland-Hodgman: veelhoek bijsnijden tot de rechthoek [x0,x1] x [y0,y1] (lon, lat)."""
    def clip(pts, inside, cut):
        out = []
        for i, cur in enumerate(pts):
            prev = pts[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(cut(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cut(prev, cur))
        return out

    def at_x(x):
        return lambda a, b: [x, a[1] + (b[1] - a[1]) * (x - a[0]) / ((b[0] - a[0]) or 1e-12)]

    def at_y(y):
        return lambda a, b: [a[0] + (b[0] - a[0]) * (y - a[1]) / ((b[1] - a[1]) or 1e-12), y]

    pts = [[p[0], p[1]] for p in ring]
    for inside, cut in ((lambda p: p[0] >= x0, at_x(x0)), (lambda p: p[0] <= x1, at_x(x1)),
                        (lambda p: p[1] >= y0, at_y(y0)), (lambda p: p[1] <= y1, at_y(y1))):
        if not pts:
            break
        pts = clip(pts, inside, cut)
    # dunner maken: punten dichter dan ca. 150 m bij de vorige weglaten
    thin = []
    for lon, lat in pts:
        if not thin or abs(lon - thin[-1][0]) > 0.002 or abs(lat - thin[-1][1]) > 0.0014:
            thin.append([round(lon, 3), round(lat, 3)])
    return thin if len(thin) >= 3 else []


def clip_polys(geojson, lat0, lon0, dlat, dlon):
    """Vlakken (land, meren) bijgesneden tot het gebied; per vlak een lijst ringen (buiten + gaten)."""
    x0, x1, y0, y1 = lon0 - dlon, lon0 + dlon, lat0 - dlat, lat0 + dlat
    out = []
    for feat in geojson.get("features", []):
        g = feat.get("geometry") or {}
        if g.get("type") == "Polygon":
            polys = [g["coordinates"]]
        elif g.get("type") == "MultiPolygon":
            polys = g["coordinates"]
        else:
            continue
        for poly in polys:
            outer = poly[0]
            if (max(p[0] for p in outer) < x0 or min(p[0] for p in outer) > x1
                    or max(p[1] for p in outer) < y0 or min(p[1] for p in outer) > y1):
                continue
            rings = [r for r in (_clip_ring(ring, x0, y0, x1, y1) for ring in poly) if r]
            if rings:
                out.append(rings)
    return out


def mapvector_loop():
    """Kustlijn en landsgrenzen (Natural Earth) voor de radarondergrond."""
    path = CACHE / "mapvector.json"
    for attempt in range(1, 50):
      try:
        need = coverage_km() * 1.15
        data = None
        if path.exists() and time.time() - path.stat().st_mtime < 180 * 86400:
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("r", 0) < need * 0.95 or "land" not in data:
                data = None                     # groter gebied of oud formaat zonder land: opnieuw
        if data is None:
            c = CFG["center"]
            dlat = need / 110.6
            dlon = dlat / max(0.2, math.cos(math.radians(c["lat"])))
            data = {"coast": [], "border": [], "land": [], "lakes": [], "r": need}
            for key, name in (("coast", "ne_10m_coastline"),
                              ("border", "ne_50m_admin_0_boundary_lines_land")):
                raw = json.loads(http_get(NE_BASE + name + ".geojson", 180))
                data[key] = clip_lines(raw, c["lat"], c["lon"], dlat, dlon)
            for key, name in (("land", "ne_10m_land"), ("lakes", "ne_10m_lakes")):
                raw = json.loads(http_get(NE_BASE + name + ".geojson", 180))
                data[key] = clip_polys(raw, c["lat"], c["lon"], dlat, dlon)
                del raw
            path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
            log(f"vectorkaart geladen: {len(data['coast'])} kustlijnen, {len(data['border'])} grenzen, "
                f"{len(data['land'])} landvlakken, {len(data['lakes'])} meren")
        mapvector["gz"] = encode(data)
        mapvector["ready"] = True
        return
      except Exception as e:  # noqa: BLE001
        log(f"vectorkaart laden mislukt (poging {attempt}): {e}")
        time.sleep(min(600, 30 * attempt))


# ---------------------------------------------------------------- Schiphol (CISS via de publieke API)

schiphol = {"by_reg": {}, "by_flight": {}, "by_cs": {}, "updated": 0.0, "status": "uit", "count": 0}
_sch_token = {"value": "", "expires": 0.0}
sch_lock = threading.Lock()


def sch_cfg():
    c = CFG.get("schiphol") or {}
    return c if c.get("enabled") and c.get("client_id") and c.get("client_secret") else None


def sch_token(cfg):
    """JWT van Auth0, 30 minuten geldig; een minuut voor het einde vernieuwen."""
    with sch_lock:
        if _sch_token["value"] and time.time() < _sch_token["expires"] - 60:
            return _sch_token["value"]
        data = urllib.parse.urlencode({
            "grant_type": "client_credentials",
            "client_id": cfg["client_id"],
            "client_secret": cfg["client_secret"],
            "audience": cfg.get("audience", "https://api.schiphol.nl/public"),
        }).encode()
        req = urllib.request.Request(cfg.get("token_url", "https://api.auth.schiphol.nl/oauth/token"),
                                     data=data, headers={"Content-Type": "application/x-www-form-urlencoded",
                                                         "User-Agent": UA})
        with urllib.request.urlopen(req, timeout=20) as r:
            tok = json.loads(r.read())
        _sch_token["value"] = tok["access_token"]
        _sch_token["expires"] = time.time() + float(tok.get("expires_in", 1800))
        return _sch_token["value"]


def sch_get(cfg, path):
    req = urllib.request.Request(cfg.get("base_url", "").rstrip("/") + path,
                                 headers={"Authorization": f"Bearer {sch_token(cfg)}",
                                          "Accept": "application/json", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as r:
        body = r.read()
        status = r.status
    if status == 204 or not body:
        return None                     # voorbij de laatste pagina
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        raise RuntimeError(f"onverwacht antwoord (HTTP {status}): {body[:80]!r}") from None


def norm_reg(reg):
    return re.sub(r"[^0-9A-Za-z]", "", reg or "").upper()


def sch_entry(f):
    """Eén vlucht uit CISS terugbrengen tot wat de kaart nodig heeft."""
    pub = (f.get("publicFlightState") or {}).get("flightStates") or []
    route = (f.get("route") or {}).get("destinations") or []
    return {
        "flight": (f.get("flightName") or "").strip(),
        "dir": f.get("flightDirection"),                   # A = aankomst, D = vertrek
        "reg": norm_reg(f.get("aircraftRegistration")),
        "sched": f.get("scheduleDateTime"),
        "eta": f.get("estimatedLandingTime") or f.get("publicEstimatedOffBlockTime"),
        "actual": f.get("actualLandingTime") or f.get("actualOffBlockTime"),
        "gate": f.get("gate") or "",
        "pier": f.get("pier") or "",
        "terminal": f.get("terminal") or "",
        "belt": ", ".join(f.get("baggageClaim", {}).get("belts") or []) if f.get("baggageClaim") else "",
        "states": pub,
        "other": (route[-1] if f.get("flightDirection") == "D" else route[0]) if route else "",
    }


def schiphol_loop():
    cfg = sch_cfg()
    if not cfg:
        return
    fails = 0
    while True:
        try:
            t0 = time.strftime("%Y-%m-%dT%H:%M:%S",
                               time.gmtime(time.time() - float(cfg.get("hours_back", 2)) * 3600))
            t1 = time.strftime("%Y-%m-%dT%H:%M:%S",
                               time.gmtime(time.time() + float(cfg.get("hours_ahead", 4)) * 3600))
            # Schiphol geeft 20 records per pagina en ongeveer tweederde daarvan zijn
            # codeshare-records van dezelfde vlucht. Een venster van zes uur liep daardoor op tot
            # meer dan duizend records, terwijl hier op 40 pagina's werd gestopt: de laatste uren
            # van het venster kwamen nooit binnen. Dat ging stil mis - drie toestellen die op
            # Schiphol geparkeerd stonden hadden hun aankomst net buiten die grens. Nu wordt het
            # venster afgemaakt, en als de bovengrens toch geraakt wordt staat dat in het log.
            maxp = max(10, int(cfg.get("max_pages", 200)))
            raw, pages = [], 0
            while pages < maxp:
                d = sch_get(cfg, f"/flights?includedelays=true&page={pages}&sort=%2BscheduleTime"
                                 f"&fromDateTime={t0}&toDateTime={t1}")
                flights = (d or {}).get("flights") or []
                if not flights:
                    break
                raw.extend(flights)
                pages += 1
            if pages >= maxp:
                log(f"Schiphol: bij {maxp} pagina's gestopt terwijl er nog meer was; "
                    f"verhoog schiphol.max_pages of verklein het venster")
            # Codeshares komen als losse vluchten met hetzelfde kenteken binnen. Alleen de
            # uitvoerende vlucht (mainFlight) telt; de codeshare-nummers verwijzen daarnaar.
            by_reg, by_flight, by_cs, mains = {}, {}, {}, {}
            for f in raw:
                name = (f.get("flightName") or "").strip()
                main = (f.get("mainFlight") or name).strip()
                if name != main:
                    continue
                e = sch_entry(f)
                e["codeshares"] = [c for c in ((f.get("codeshares") or {}).get("codeshares") or [])
                                   if c != main]
                key = (main, f.get("scheduleDate"), f.get("flightDirection"))
                mains[key] = e
                if e["reg"]:
                    by_reg.setdefault(e["reg"], []).append(e)
                by_flight[main.upper()] = e
                pre, nr = (f.get("prefixICAO") or "").strip(), f.get("flightNumber")
                if pre and nr is not None:
                    by_cs[f"{pre}{int(nr)}".upper()] = e
            for f in raw:
                name = (f.get("flightName") or "").strip()
                main = (f.get("mainFlight") or name).strip()
                e = mains.get((main, f.get("scheduleDate"), f.get("flightDirection")))
                if e and name != main:
                    by_flight.setdefault(name.upper(), e)
            with lock:
                schiphol.update(by_reg=by_reg, by_flight=by_flight, by_cs=by_cs,
                                updated=time.time(), status="ok", count=len(mains))
            if fails:
                log(f"Schiphol weer bereikbaar ({len(by_reg)} vluchten met kenteken)")
            fails = 0
        except urllib.error.HTTPError as e:  # noqa: PERF203
            fails += 1
            hint = {401: "controleer client_id en client_secret",
                    403: "de applicatie is nog niet geabonneerd op de Flight API, of wacht op goedkeuring",
                    429: "te veel aanvragen, interval verhogen"}.get(e.code, "")
            if fails in (1, 5) or fails % 50 == 0:
                log(f"Schiphol API gaf HTTP {e.code}: {hint}")
            with lock:
                schiphol.update(status=f"HTTP {e.code}")
        except Exception as e:  # noqa: BLE001
            fails += 1
            if fails in (1, 5) or fails % 50 == 0:
                log(f"Schiphol ophalen mislukt: {e}")
            with lock:
                schiphol.update(status="fout")
        time.sleep(min(900, float(cfg.get("poll_s", 120)) * (1 + min(fails, 5))))


def sch_when(e):
    """Tijdstip dat bij deze vlucht hoort, in seconden sinds 1970."""
    for k in ("actual", "eta", "sched"):
        v = e.get(k)
        if v:
            try:
                return datetime.datetime.fromisoformat(v.replace("Z", "+00:00")).timestamp()
            except ValueError:
                pass
    return None


EHAM_POS = (52.3086, 4.7639)


def sch_direction(motion):
    """Uit positie en beweging afleiden of het toestel naar Schiphol toe vliegt ('A') of ervan
    weg ('D'). None als dat niet te zeggen is (op de grond, of dwars op de lijn naar Schiphol)."""
    if not motion or motion.get("ground") or motion.get("lat") is None:
        return None
    lat, lon = motion["lat"], motion["lon"]
    d = dist_km(lat, lon, *EHAM_POS)
    vr, trk = motion.get("vr"), motion.get("track")
    if d < 25 and vr is not None and abs(vr) >= 300:
        return "A" if vr < 0 else "D"           # vlak bij de baan: dalen of klimmen zegt genoeg
    if trk is None or d < 3:
        return None
    y = math.sin(math.radians(EHAM_POS[1] - lon)) * math.cos(math.radians(EHAM_POS[0]))
    x = (math.cos(math.radians(lat)) * math.sin(math.radians(EHAM_POS[0]))
         - math.sin(math.radians(lat)) * math.cos(math.radians(EHAM_POS[0])) * math.cos(math.radians(EHAM_POS[1] - lon)))
    brg = (math.degrees(math.atan2(y, x)) + 360) % 360
    diff = abs((brg - trk + 540) % 360 - 180)
    if diff < 70:
        return "A"
    if diff > 110:
        return "D"
    return None


def sch_plausible(e, motion, want):
    """Past deze Schiphol-vlucht bij wat het toestel nu doet?"""
    if want and e.get("dir") != want:
        return False
    if motion and not motion.get("ground"):
        now = time.time()

        def ts(v):
            try:
                return datetime.datetime.fromisoformat(v.replace("Z", "+00:00")).timestamp() if v else None
            except ValueError:
                return None
        if e.get("dir") == "A":
            landed = ts(e.get("actual"))
            if landed and landed < now - 600:
                return False                    # al geland, maar dit toestel vliegt nog
        else:
            sched, off = ts(e.get("sched")), ts(e.get("actual"))
            if not off and sched and sched > now + 3600:
                return False                    # vertrekt pas over een uur, maar vliegt al
    return True


def motion_of(reg, cs):
    """Positie en beweging van een toestel uit de laatste momentopname, gezocht op kenteken of callsign."""
    r_n, c_n = norm_reg(reg), (cs or "").strip().upper()
    with lock:
        rows = snapshot["ac"]
        for r in rows:
            if (r_n and norm_reg(r[10]) == r_n) or (c_n and (r[1] or "").strip().upper() == c_n):
                return {"lat": r[2], "lon": r[3], "track": r[7], "vr": r[8], "ground": bool(r[13])}
    return None


def schiphol_for(reg, cs, motion=None):
    if motion is None:
        motion = motion_of(reg, cs)
    want = sch_direction(motion)
    with lock:
        e = None
        cands = schiphol["by_reg"].get(norm_reg(reg)) if reg else None
        if cands:
            # hetzelfde toestel komt vaak aan en vertrekt weer binnen het venster: eerst de vlucht
            # die past bij de richting waarin het vliegt, dan de vlucht met het tijdstip het dichtst bij nu
            ok = [c for c in cands if sch_plausible(c, motion, want)]
            if ok:
                now = time.time()
                e = min(ok, key=lambda c: abs((sch_when(c) or now + 86400) - now))
        if not e and cs:
            c = schiphol["by_cs"].get(cs.upper()) or schiphol["by_flight"].get(cs.upper())
            if c and sch_plausible(c, motion, want):
                e = c
        st = schiphol["status"]
        age = time.time() - schiphol["updated"] if schiphol["updated"] else None
    if not e:
        return {"status": st, "age": age}
    out = dict(e)
    other = airports_iata.get(e["other"].upper()) if e["other"] else None
    if other:
        ams = airports_all.get("EHAM")
        if ams:
            o, d = (ams, other) if e["dir"] == "D" else (other, ams)
            oi = "EHAM" if e["dir"] == "D" else other[5]
            di = other[5] if e["dir"] == "D" else "EHAM"
            out["route"] = [oi, o[0], o[1], o[2], o[3], o[4], di, d[0], d[1], d[2], d[3], d[4]]
    out["status"] = st
    out["age"] = age
    return out


# ---------------------------------------------------------------- luchthavenbronnen
# Schiphol heeft CISS, maar voor Rotterdam, Eindhoven en Maastricht bestond er niets. Die
# publiceren hun vluchten alle drie zelf, en elk met een andere sleutel om aan een toestel te
# koppelen:
#   Rotterdam   - open REST API van hun eigen site, met het KENTEKEN erbij. Hard.
#   Eindhoven   - API achter hun vluchtpagina, met het CALLSIGN erbij: letterlijk wat het toestel
#                 uitzendt. Hard. Hun robots.txt sluit /api/ uit voor bots; deze bron staat daarom
#                 apart aan of uit in config.json.
#   Maastricht  - alleen NOS Teletekst 768. Hun eigen site toonde drie vluchten, teletekst zeven,
#                 inclusief het vrachtverkeer. Alleen een vluchtnummer, dus koppelen gaat via een
#                 vertaling naar het callsign en dat is ZWAK bewijs.
# Teletekst dient daarnaast als terugval: valt een API uit, dan komen de tijden daar vandaan.
TT_JSON = ((CFG.get("airports_live") or {}).get("teletext_url")
           or "https://teletekst-data.nos.nl/json/{page}")
veld_lock = threading.Lock()
velden_live = {"by_reg": {}, "by_cs": {}, "by_nr": {}, "bron": {}, "gezien": {},
               "updated": 0.0, "count": 0}

# Startset IATA -> ICAO voor de maatschappijen die op de Nederlandse velden vliegen. De tabel
# vult zichzelf aan: Schiphol, Rotterdam en Eindhoven geven bij elke vlucht beide codes.
IATA_ICAO = {
    "HV": "TRA", "KL": "KLM", "OR": "TFL", "FR": "RYR", "W6": "WZZ", "U2": "EZY", "EJU": "EZS",
    "TB": "JAF", "PC": "PGT", "XQ": "SXS", "A3": "AEE", "TK": "THY", "DL": "DAL", "ET": "ETH",
    "RJ": "RJA", "5Y": "GTI", "CV": "CLX", "VY": "VLG", "BA": "BAW", "LH": "DLH", "SK": "SAS",
    "AF": "AFR", "EW": "EWG", "LX": "SWR", "OS": "AUA", "SN": "BEL", "IB": "IBE", "TP": "TAP",
    "EI": "EIN", "AY": "FIN", "LO": "LOT", "OK": "CSA", "JU": "ASL", "MS": "MSR", "SU": "AFL",
    "EK": "UAE", "QR": "QTR", "EY": "ETD", "SQ": "SIA", "CX": "CPA", "NH": "ANA", "JL": "JAL",
    "UA": "UAL", "AA": "AAL", "AC": "ACA", "6E": "IGO", "HR": "HRZ", "VF": "AJT", "XM": "XMR",
    "C6": "CJT", "3V": "TAY", "QY": "BCS", "FX": "FDX", "5X": "UPS", "GG": "GTI",
}
# Namen van de maatschappijen die op de Nederlandse velden vliegen. Rotterdam levert ze bij elke
# vlucht en de routetabel van adsbdb kent er ook veel, dus deze lijst vult zichzelf aan; dit is
# de startset zodat het bord meteen leesbaar is.
AIRLINE_NAAM = {
    "KL": "KLM", "HV": "Transavia", "FR": "Ryanair", "W6": "Wizz Air", "W4": "Wizz Air Malta",
    "OR": "TUI fly", "TB": "TUI fly Belgium", "VY": "Vueling", "BA": "British Airways",
    "SK": "SAS", "PC": "Pegasus", "EY": "Etihad", "TK": "Turkish Airlines", "JU": "Air Serbia",
    "TP": "TAP Air Portugal", "LO": "LOT", "EK": "Emirates", "LX": "Swiss", "OS": "Austrian",
    "LY": "El Al", "QR": "Qatar Airways", "DY": "Norwegian", "D8": "Norwegian Sweden",
    "EI": "Aer Lingus", "CD": "Corendon", "LH": "Lufthansa", "ET": "Ethiopian",
    "5Y": "Atlas Air", "RJ": "Royal Jordanian", "AY": "Finnair", "KM": "Air Malta",
    "XQ": "SunExpress", "RO": "Tarom", "AZ": "ITA Airways", "MU": "China Eastern",
    "6E": "IndiGo", "KQ": "Kenya Airways", "AI": "Air India", "KE": "Korean Air",
    "CZ": "China Southern", "AM": "Aeroméxico", "MF": "Xiamen Air", "IB": "Iberia",
    "MP": "Martinair", "QY": "European Air Transport", "U2": "easyJet", "EJU": "easyJet Europe",
    "AF": "Air France", "EW": "Eurowings", "SN": "Brussels Airlines", "A3": "Aegean",
    "DL": "Delta", "UA": "United", "AA": "American", "AC": "Air Canada", "SQ": "Singapore",
    "CX": "Cathay Pacific", "NH": "ANA", "JL": "JAL", "MS": "EgyptAir", "TAY": "Tayaranjet",
    "CV": "Cargolux", "FX": "FedEx", "5X": "UPS", "3O": "Air Arabia Maroc", "VF": "AJet",
    # aangevuld met wat er op één dag Schiphol nog zonder naam overbleef
    "EZY": "easyJet", "BT": "airBaltic", "CI": "China Airlines", "GA": "Garuda Indonesia",
    "B6": "JetBlue", "UX": "Air Europa", "OU": "Croatia Airlines", "TG": "Thai Airways",
    "FI": "Icelandair", "TS": "Air Transat", "RB": "Syrian Air", "PY": "Surinam Airways",
    "WA": "KLM Cityhopper", "FB": "Bulgaria Air", "C6": "Cargojet", "GQ": "Sky Express",
    "2L": "Helvetic Airways", "A9": "Georgian Airways",
}
VLUCHTNR_ICAO = re.compile(r"^([A-Z]{3})(\d{1,4}[A-Z]?)$")
VLUCHTNR_IATA = re.compile(r"^([A-Z0-9]{2})\s?(\d{1,4}[A-Z]?)$")
# Een teletekstpagina bevat meer dan een luchthaven: op 768 staan Maastricht en Eindhoven, op
# 769 Rotterdam en Groningen, en de subpagina's wisselen halverwege. De kop van elke subpagina
# zegt welk veld het is, en die is dus leidend - niet het veld dat in de config staat.
TT_VELD = {"maastricht": "EHBK", "eindhoven": "EHEH", "rotterdam": "EHRD",
           "schiphol": "EHAM", "groningen": "EHGG", "eelde": "EHGG", "lelystad": "EHLE"}
TT_MAAND = {"januari": 1, "februari": 2, "maart": 3, "april": 4, "mei": 5, "juni": 6, "juli": 7,
            "augustus": 8, "september": 9, "oktober": 10, "november": 11, "december": 12}
TT_DAG = re.compile(r"^(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\s+(\d{1,2})\s+"
                    r"([a-z]+)\s+(\d{4})$", re.I)


def iata_leer(iata, icao, naam=""):
    if iata and icao and len(icao) == 3 and IATA_ICAO.get(iata.upper()) != icao.upper():
        IATA_ICAO[iata.upper()] = icao.upper()
    if iata and naam and iata.upper() not in AIRLINE_NAAM:
        AIRLINE_NAAM[iata.upper()] = naam.strip()


def airline_van(nr):
    """De naam bij een vluchtnummer, via het voorvoegsel."""
    s = re.sub(r"\s+", "", (nr or "").upper())
    m = re.match(r"^([A-Z]{3})(?=\d)", s) or re.match(r"^([A-Z0-9]{2})(?=\d)", s)
    return AIRLINE_NAAM.get(m.group(1), "") if m else ""


logo_slot = threading.Lock()


def logo_iata(code):
    """De logobron kent alleen IATA-codes van twee tekens. Een bord met een ICAO-voorvoegsel
    (EZY, TRA) wordt daarheen teruggerekend via dezelfde tabel die het callsign maakt."""
    c = re.sub(r"[^A-Z0-9]", "", (code or "").upper())
    if len(c) == 2:
        return c
    if len(c) == 3:
        for iata, icao in IATA_ICAO.items():
            if icao == c:
                return iata
    return ""


def logo_bytes(code):
    """Het logo bij een code, uit web/logos als het er staat, anders uit de cache, anders van de
    bron. Geeft None als er niets te halen valt; dat wordt onthouden met een leeg .miss-bestand,
    anders vraagt elke tekenronde het opnieuw aan een server die het toch niet heeft."""
    c = re.sub(r"[^A-Z0-9]", "", (code or "").upper())[:3]
    if not c:
        return None
    eigen = WEB / "logos" / f"{c}.png"
    if eigen.is_file():
        return eigen.read_bytes()
    cfg = CFG.get("logos") or {}
    if not cfg.get("enabled", True) or not cfg.get("url"):
        return None
    iata = logo_iata(c)
    if not iata:
        return None
    map_ = CACHE / "logos"
    bestand, mis = map_ / f"{iata}.png", map_ / f"{iata}.miss"
    nu = time.time()
    if bestand.is_file() and nu - bestand.stat().st_mtime < float(cfg.get("ttl_days", 180)) * 86400:
        return bestand.read_bytes()
    if mis.is_file() and nu - mis.stat().st_mtime < float(cfg.get("miss_ttl_days", 7)) * 86400:
        return bestand.read_bytes() if bestand.is_file() else None
    with logo_slot:                       # één tegelijk: het bord vraagt er tientallen ineens
        try:
            data = http_get(cfg["url"].format(iata=iata, icao=c), 15, accept_gzip=False)
        except Exception:                 # noqa: BLE001
            data = b""
        map_.mkdir(parents=True, exist_ok=True)
        if data[:4] == b"\x89PNG" and len(data) > 200:
            bestand.write_bytes(data)
            mis.unlink(missing_ok=True)
            return data
        mis.write_bytes(b"")
    return bestand.read_bytes() if bestand.is_file() else None


def nr_naar_cs(nr):
    """Een vluchtnummer als HV5374 of 'SK 553' naar het callsign dat een toestel uitzendt."""
    s = re.sub(r"\s+", "", (nr or "").upper())
    m = VLUCHTNR_ICAO.match(s)
    if m:
        return s                                   # staat er al als ICAO in (EJU8686)
    m = VLUCHTNR_IATA.match(s)
    if not m:
        return ""
    icao = IATA_ICAO.get(m.group(1))
    return f"{icao}{m.group(2)}" if icao else ""


def veld_entry(home, src, hard, **kw):
    """Eén vlucht in hetzelfde formaat als de Schiphol-koppeling, zodat de kaart niets hoeft te
    weten van de bron waar hij vandaan komt."""
    e = {"flight": "", "dir": "", "reg": "", "cs": "", "sched": None, "eta": None, "actual": None,
         "gate": "", "pier": "", "terminal": "", "belt": "", "states": [], "other": "",
         "other_icao": "", "codeshares": []}
    e.update(kw)
    e["home"] = home
    e["src"] = src
    e["hard"] = bool(hard)
    return e


def rtha_haal(bron):
    url = bron.get("url") or "https://www.rotterdamthehagueairport.nl/wp-json/rtha/v2/flights"
    uit = []
    for f in json.loads(http_get(url, 25)) or []:
        lucht = f.get("airline") or {}
        iata_leer(lucht.get("airlineIATA"), lucht.get("airlineICAO"), lucht.get("airlineName"))
        aankomst = (f.get("movementType") or "").upper() == "A"
        ander = (f.get("departureAirport") if aankomst else f.get("arrivalAirport")) or {}
        status = f.get("flightStatusName") or ""
        uit.append(veld_entry(
            "EHRD", "rtha", True,
            flight=(f.get("flightNumber") or "").strip(),
            dir="A" if aankomst else "D",
            reg=norm_reg(f.get("aircraftRegistration")),
            sched=f.get("sibt") if aankomst else f.get("sobt"),
            eta=f.get("eibt") if aankomst else f.get("eobt"),
            actual=f.get("aibt") if aankomst else f.get("aobt"),
            gate=f.get("gate") or f.get("aircraftParkingPosition") or "",
            belt=", ".join(f.get("baggageClaimUnits") or []),
            states=[status] if status else [],
            other=(ander.get("airportIATA") or ""), other_icao=(ander.get("airportICAO") or "")))
    return uit


def ein_haal(bron):
    """Eindhoven pagineert per richting; 30 per pagina is hun eigen standaard."""
    basis = bron.get("url") or "https://www.eindhovenairport.nl/api/flights"
    uit = []

    def lees(url):
        # Eindhoven antwoordt met een JSON-string waar base64 in zit, niet met kale JSON.
        d = json.loads(http_get(url, 25))
        if isinstance(d, str):
            d = json.loads(base64.b64decode(d))
        return d or {}

    for richting in ("D", "A"):
        for offset in range(0, int(bron.get("max", 120)), 30):
            url = f"{basis}?pageSize=30&offset={offset}&dayOffset=0&flightDirection={richting}"
            blok = lees(url).get("flights") or []
            for f in blok:
                nr = f.get("flightNumber") or {}
                iata_leer(nr.get("prefixIATA"), nr.get("prefixICAO"))
                route = f.get("route") or {}
                ander = (route.get("origin") if richting == "A" else route.get("destination")) or {}
                st = f.get("flightStatus") or ""
                aankomst = richting == "A"
                uit.append(veld_entry(
                    "EHEH", "ein", True,
                    flight=re.sub(r"\s+", "", nr.get("flightName") or ""),
                    dir=richting,
                    cs=(f.get("callSign") or "").strip().upper(),
                    sched=(f.get("scheduledInBlockTime") if aankomst
                           else f.get("scheduledOffBlockTime")) or f.get("publicTime"),
                    eta=(f.get("estimatedLandingTime") or f.get("estimatedInBlockTime")
                         if aankomst else f.get("estimatedOffBlockTime")) or f.get("publicTime"),
                    actual=(f.get("actualLandingTime") or f.get("actualInBlockTime")) if aankomst
                           else f.get("actualOffBlockTime"),
                    gate=", ".join(f.get("gateIds") or []),
                    belt=str(f.get("baggageBeltId") or ""),
                    states=[st] if st else [],
                    other=(ander.get("codeIATA") or ""), other_icao=(ander.get("codeICAO") or "")))
            if len(blok) < 30:
                break
    return uit


def tt_regels(page):
    """Eén teletekstpagina als platte regels, met de kop erbij."""
    d = json.loads(http_get(TT_JSON.format(page=urllib.parse.quote(str(page))), 20))
    tekst = re.sub(r"<[^>]+>", "", d.get("content") or "")
    tekst = html.unescape(tekst)
    tekst = re.sub(r"[-]", " ", tekst)
    regels = [r.rstrip() for r in tekst.split("\n")]
    return regels, d.get("nextSubPage") or ""


def tt_tijd(hhmm, dag):
    """Teletekst toont Nederlandse tijd zonder de zone erbij. Zonder die zone zou een browser in
    een ander land de tijd naar zichzelf omrekenen en schuiven de tijden. De Pi staat in dezelfde
    zone als de luchthavens, dus die hangen we eraan.

    Is de dag niet bekend (nog geen datumregel gezien), dan kiezen we de kalenderdag die het
    tijdstip het dichtst bij nu legt. Dat moet wel: boven aan een pagina staat vlak na middernacht
    eerst de late avond van gisteren, en die regels stonden anders 22 uur in de toekomst - een
    vlucht die al geland was kreeg dan de datum van vandaag."""
    if not hhmm:
        return None
    try:
        u, m = (int(x) for x in hhmm.split(":"))
    except ValueError:
        return None
    if dag is None:
        nu = datetime.datetime.now()
        keus = min((datetime.datetime.combine(nu.date() + datetime.timedelta(days=d),
                                              datetime.time(u, m)) for d in (-1, 0, 1)),
                   key=lambda x: abs((x - nu).total_seconds()))
        return keus.astimezone().isoformat(timespec="seconds")
    naief = datetime.datetime.combine(dag, datetime.time(u, m))
    return naief.astimezone().isoformat(timespec="seconds")


# Schiphol staat per dagdeel op teletekst: 756/759 tot 10:30, 757/760 tot 15:30, 758/761 daarna.
# Alleen de avondpagina's ophalen betekent dat je als terugval 's nachts niets hebt - een aankomst
# om 01:30 staat op 756. Daarom kiest de terugval het dagdeel dat bij de klok hoort, plus het
# volgende, want een bord kijkt ook vooruit.
TT_SCHIPHOL = ((10.5, (756, 759)), (15.5, (757, 760)), (24.0, (758, 761)))


def tt_dagdeel():
    nu = datetime.datetime.now()
    uur = nu.hour + nu.minute / 60
    delen = [p for grens, p in TT_SCHIPHOL if uur < grens]
    if not delen:
        delen = [TT_SCHIPHOL[-1][1]]
    uit = list(delen[0])
    if len(delen) > 1:
        uit += list(delen[1])
    return uit


def tt_haal(bron):
    """Teletekst: vaste kolommen. 'Schema Vlucht Herkomst Opmerkingen', waarbij de kop van elke
    subpagina zegt of het aankomsten of vertrekken zijn - op 768 wisselt dat halverwege."""
    uit, gezien = [], set()
    paginas = bron.get("pages") or []
    if paginas == "schiphol" or (bron.get("icao") == "EHAM" and not paginas):
        paginas = tt_dagdeel()
    todo = [str(p) for p in paginas]
    while todo:
        page = todo.pop(0)
        if page in gezien or len(gezien) > 80:
            continue
        gezien.add(page)
        try:
            regels, volgende = tt_regels(page)
        except Exception as e:  # noqa: BLE001
            log(f"teletekst {page}: {e}")
            continue
        # alleen de eigen subpagina's volgen; de keten wijst aan het eind naar een andere pagina
        hoofd = str(page).split("-")[0]
        if volgende and volgende not in gezien and str(volgende).split("-")[0] == hoofd:
            todo.append(volgende)
        richting, dag, veld = "", None, ""
        for r in regels:
            kaal = r.strip()
            laag = kaal.lower()
            if len(kaal) < 60 and not re.match(r"^\s*\d{2}:\d{2}", r):
                for woord, icao in TT_VELD.items():
                    if woord in laag:
                        veld = icao
                        break
            if "aankomst" in laag and len(kaal) < 60:
                richting = "A"
                continue
            if "vertrek" in laag and len(kaal) < 60 and not re.match(r"^\s*\d{2}:\d{2}", r):
                richting = "D"
                continue
            m = TT_DAG.match(kaal)
            if m:
                maand = TT_MAAND.get(m.group(3).lower())
                if maand:
                    jaar, dagnr = int(m.group(4)), int(m.group(2))
                    try:
                        dag = datetime.date(jaar, maand, dagnr)
                    except ValueError:
                        pass
                continue
            if not re.match(r"^\s\d{2}:\d{2}\s", r) or not richting or not veld:
                continue
            schema = r[1:6]
            nr = re.sub(r"\s+", "", r[7:14])
            plaats = r[15:28].strip()
            rest = r[28:].strip()
            if not nr:
                continue
            tijden = re.findall(r"\d{2}:\d{2}", rest)
            geland = "geland" in rest.lower() or "vertrokken" in rest.lower()
            weg = "geannuleerd" in rest.lower()
            uit.append(veld_entry(
                veld, "teletekst", False,
                flight=nr, dir=richting, cs=nr_naar_cs(nr),
                sched=tt_tijd(schema, dag),
                eta=None if geland else tt_tijd(tijden[0] if tijden else "", dag),
                actual=tt_tijd(tijden[0], dag) if (geland and tijden) else None,
                states=["Geannuleerd"] if weg else (["Geland" if richting == "A" else "Vertrokken"]
                                                   if geland else []),
                other="", other_icao="", plaats=plaats))
    return uit


def ciss_haal(bron):
    """Schiphol voedde wel de toestelkaart maar niet het bord; daar kwam EHAM dus uit teletekst
    terwijl CISS de hardere bron is. Dit haalt niets op - schiphol_loop doet dat al - maar zet
    om wat daar staat."""
    with lock:
        rijen = list(schiphol["by_flight"].values())
        st = schiphol["status"]
    if st != "ok":
        return []
    uit, gezien = [], set()
    for e in rijen:
        sleutel = (e.get("flight"), e.get("sched"))
        if sleutel in gezien:
            continue
        gezien.add(sleutel)
        uit.append(veld_entry(
            "EHAM", "ciss", True,
            flight=(e.get("flight") or "").strip(), dir=e.get("dir") or "",
            reg=e.get("reg") or "", sched=e.get("sched"), eta=e.get("eta"),
            actual=e.get("actual"), gate=e.get("gate") or "", belt=e.get("belt") or "",
            pier=e.get("pier") or "", terminal=e.get("terminal") or "",
            states=list(e.get("states") or []), codeshares=list(e.get("codeshares") or []),
            other=e.get("other") or "", other_icao=""))
    return uit


VELD_HAAL = {"rtha": rtha_haal, "ein": ein_haal, "teletekst": tt_haal, "ciss": ciss_haal}


def veld_tijd(iso):
    """Een tijdstip uit een van de bronnen als unixtijd; ze schrijven allemaal ISO, met of zonder
    tijdzone. Zonder zone is het de tijd van de Pi zelf, want dat is wat de luchthavens tonen."""
    if not iso:
        return None
    t = str(iso).strip().replace("Z", "+00:00")
    try:
        d = datetime.datetime.fromisoformat(t)
    except ValueError:
        return None
    if d.tzinfo is None:
        d = d.astimezone()
    return d.timestamp()


def veld_venster(entries, terug_u=6, vooruit_u=18):
    """Hetzelfde vluchtnummer komt elke dag terug. Zonder venster koppelt de vlucht van overmorgen
    net zo goed als die van nu, en dan staat er onzin in de kaart."""
    nu = time.time()
    vroeg, laat = nu - terug_u * 3600, nu + vooruit_u * 3600
    uit = []
    for e in entries:
        t = veld_tijd(e.get("actual") or e.get("eta") or e.get("sched"))
        if t is None or vroeg <= t <= laat:
            uit.append(e)
    return uit


def veld_bronnen():
    c = CFG.get("airports_live") or {}
    return [b for b in (c.get("sources") or []) if b.get("enabled", True)]


def veld_index(entries):
    """Drie ingangen: kenteken en callsign zijn hard, het vluchtnummer is de zwakke."""
    by_reg, by_cs, by_nr = {}, {}, {}
    for e in entries:
        if e.get("reg"):
            by_reg.setdefault(e["reg"], []).append(e)
        cs = e.get("cs") or ""
        if cs:
            by_cs.setdefault(cs, []).append(e)
        nr = re.sub(r"\s+", "", e.get("flight") or "")
        if nr:
            by_nr.setdefault(nr, []).append(e)
    return by_reg, by_cs, by_nr


def veld_loop():
    c = CFG.get("airports_live") or {}
    if not c.get("enabled", True) or not veld_bronnen():
        return
    # Staat Schiphol als bron in de lijst, dan eerst wachten tot die lus gevuld is. Anders vult
    # de eerste ronde de bordtabel zonder EHAM en duurt het drie minuten voor dat rechtgezet is -
    # precies de periode waarin je na een herstart naar het bord kijkt.
    if any(b.get("kind") == "ciss" for b in veld_bronnen()) and sch_cfg():
        for _ in range(60):
            with lock:
                klaar = schiphol["status"] == "ok"
            if klaar:
                break
            time.sleep(2)
    tt_elke = float(c.get("tt_poll_s", 600))
    laatste_tt = {}
    terug, vooruit = float(c.get("hours_back", 6)), float(c.get("hours_ahead", 18))
    while True:
        alles, status, eigen, gezien_op = [], {}, set(), {}
        # Eerst de luchthavens zelf. Die leveren een kenteken of een callsign en zijn dus hard.
        for b in veld_bronnen():
            if b.get("kind") == "teletekst":
                continue
            naam = f"{b.get('icao')}/{b.get('kind')}"
            haal = VELD_HAAL.get(b.get("kind"))
            if not haal:
                continue
            try:
                rijen = veld_venster(haal(b), terug, vooruit)
                alles.extend(rijen)
                status[naam] = "ok" if rijen else "leeg"
                gezien_op[naam] = time.time()
                if rijen:
                    eigen.add(b.get("icao"))
            except Exception as e:  # noqa: BLE001
                status[naam] = f"fout: {str(e)[:40]}"
                log(f"{naam}: {e}")
        if sch_cfg():
            with lock:
                if schiphol["status"] == "ok":
                    eigen.add("EHAM")
        # Dan teletekst, voor alles wat nog geen werkende eigen bron heeft. Een pagina bevat
        # meerdere velden, dus er wordt per vlucht gefilterd, niet per bron.
        for b in veld_bronnen():
            if b.get("kind") != "teletekst":
                continue
            naam = f"{b.get('icao')}/teletekst"
            if b.get("fallback") and b.get("icao") in eigen:
                status[naam] = "stand-by"
                continue
            vers = time.time() - laatste_tt.get(naam, 0) < tt_elke
            try:
                rijen = (laatste_tt.get(naam + ":data") if vers
                         else veld_venster(tt_haal(b), terug, vooruit))
                if not vers:
                    laatste_tt[naam] = time.time()
                    laatste_tt[naam + ":data"] = rijen
                houd = [e for e in (rijen or []) if e["home"] not in eigen]
                alles.extend(houd)
                velden = sorted({e["home"] for e in houd})
                status[naam] = (", ".join(velden) if velden else "stand-by")
                gezien_op[naam] = laatste_tt.get(naam, time.time())
            except Exception as e:  # noqa: BLE001
                status[naam] = f"fout: {str(e)[:40]}"
                log(f"{naam}: {e}")
        by_reg, by_cs, by_nr = veld_index(alles)
        bord_bewaar(alles)
        bord_verdring(eigen)
        bord_ruim(float(c.get("keep_hours", 24)))
        with veld_lock:
            velden_live.update(by_reg=by_reg, by_cs=by_cs, by_nr=by_nr, bron=status,
                               gezien=gezien_op, updated=time.time(), count=len(alles))
        time.sleep(max(60, float(c.get("poll_s", 180))))


def bord_bewaar(entries):
    """Zet wat er nu binnenkwam in de cache. Een zwakke bron overschrijft nooit een harde: als
    Rotterdam een vlucht met kenteken levert, mag teletekst die niet verdringen met alleen een
    vluchtnummer."""
    if db is None or not entries:
        return 0
    nu = time.time()
    n = 0
    # Rotterdam levert een kenteken maar geen callsign, en dat is nu juist wat er op de plot
    # staat. Staat het toestel in de lucht, dan weten wij het callsign uit de ontvanger zelf;
    # dat knopen we hier aan de vlucht zodat het in het bord komt en blijft staan.
    with lock:
        F = snapshot["fields"]
        ihex, ics, ireg = F.index("hex"), F.index("flight"), F.index("reg")
        live_cs = {}
        for r in snapshot["ac"]:
            cs = (r[ics] or "").strip().upper()
            reg = norm_reg(r[ireg])
            if cs and reg:
                live_cs[reg] = cs
    with db_lock:
        for e in entries:
            t = veld_tijd(e.get("actual") or e.get("eta") or e.get("sched"))
            if t is None:
                continue
            # De luchthaven-API's geven alleen codes; de plaatsnaam maakt het bord leesbaar.
            plaats = e.get("plaats") or ""
            if not plaats:
                rij = airports_all.get((e.get("other_icao") or "").upper())
                if not rij and e.get("other"):
                    rij = airports_iata.get(e["other"].upper())
                if rij:
                    plaats = rij[1] or ""
            eigen_cs = e.get("cs") or live_cs.get(norm_reg(e.get("reg"))) or ""
            naam = airline_van(e.get("flight"))
            if not naam and eigen_cs:
                m = routes_mem.get(eigen_cs)          # adsbdb kent de maatschappij per callsign
                if m and m[12]:
                    naam = m[12]
            dag = str(e.get("sched") or e.get("eta") or "")[:10]
            sleutel = f"{e['home']}|{e['dir']}|{re.sub(r'[^A-Z0-9]', '', (e.get('flight') or '').upper())}|{dag}"
            db.execute(
                "INSERT INTO bordvlucht (sleutel,home,dir,flight,reg,cs,sched,eta,actual,gate,belt,"
                "states,other,other_icao,plaats,src,hard,t,gezien,airline) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(sleutel) DO UPDATE SET "
                "reg=CASE WHEN excluded.hard>=bordvlucht.hard THEN excluded.reg ELSE bordvlucht.reg END,"
                "cs=CASE WHEN excluded.cs<>'' THEN excluded.cs ELSE bordvlucht.cs END,"
                "sched=CASE WHEN excluded.hard>=bordvlucht.hard THEN excluded.sched ELSE bordvlucht.sched END,"
                "eta=CASE WHEN excluded.hard>=bordvlucht.hard THEN excluded.eta ELSE bordvlucht.eta END,"
                "actual=CASE WHEN excluded.hard>=bordvlucht.hard THEN excluded.actual ELSE bordvlucht.actual END,"
                "gate=CASE WHEN excluded.hard>=bordvlucht.hard THEN excluded.gate ELSE bordvlucht.gate END,"
                "belt=CASE WHEN excluded.hard>=bordvlucht.hard THEN excluded.belt ELSE bordvlucht.belt END,"
                "states=CASE WHEN excluded.hard>=bordvlucht.hard THEN excluded.states ELSE bordvlucht.states END,"
                "other=CASE WHEN excluded.hard>=bordvlucht.hard THEN excluded.other ELSE bordvlucht.other END,"
                "other_icao=CASE WHEN excluded.hard>=bordvlucht.hard THEN excluded.other_icao ELSE bordvlucht.other_icao END,"
                "plaats=CASE WHEN excluded.hard>=bordvlucht.hard THEN excluded.plaats ELSE bordvlucht.plaats END,"
                "src=CASE WHEN excluded.hard>=bordvlucht.hard THEN excluded.src ELSE bordvlucht.src END,"
                "hard=max(excluded.hard, bordvlucht.hard),"
                "t=CASE WHEN excluded.hard>=bordvlucht.hard THEN excluded.t ELSE bordvlucht.t END,"
                "gezien=excluded.gezien,"
                "airline=CASE WHEN excluded.airline<>'' THEN excluded.airline ELSE bordvlucht.airline END",
                (sleutel, e["home"], e["dir"], e.get("flight") or "", e.get("reg") or "",
                 eigen_cs, e.get("sched"), e.get("eta"), e.get("actual"),
                 e.get("gate") or "", e.get("belt") or "",
                 json.dumps(e.get("states") or [], ensure_ascii=False),
                 e.get("other") or "", e.get("other_icao") or "", plaats,
                 e.get("src") or "", 1 if e.get("hard") else 0, t, nu, naam))
            n += 1
        db.commit()
    return n


def bord_verdring(eigen):
    """Heeft een veld weer een werkende eigen bron, dan hoeven de teletekstregels van datzelfde
    veld niet meer - die bron levert ze zelf, en harder. Alleen wat binnen zijn bereik ligt gaat
    weg; oudere regels blijven staan, anders verlies je de geschiedenis van een periode waarin de
    eigen bron uit stond."""
    if db is None or not eigen:
        return
    grens = time.time() - 3600
    with db_lock:
        db.execute("DELETE FROM bordvlucht WHERE hard=0 AND t>? AND home IN "
                   f"({','.join('?' * len(eigen))})", (grens, *sorted(eigen)))
        db.commit()


def bord_ruim(uren):
    if db is None:
        return
    with db_lock:
        db.execute("DELETE FROM bordvlucht WHERE t < ?", (time.time() - float(uren) * 3600,))
        db.commit()


BORD_COLS = ("home", "dir", "flight", "reg", "cs", "sched", "eta", "actual", "gate", "belt",
             "states", "other", "other_icao", "plaats", "src", "hard", "t", "airline")


def bord_payload(terug_u=24, vooruit_u=36):
    """Alles wat het bord kan laten zien, plus hoe oud elke bron is. De browser filtert zelf op
    1 uur, 4 uur of de hele dag, zodat schakelen geen nieuwe aanvraag kost."""
    nu = time.time()
    rijen = []
    if db is not None:
        with db_lock:
            cur = db.execute(
                f"SELECT {','.join(BORD_COLS)} FROM bordvlucht WHERE t>? AND t<? ORDER BY t",
                (nu - terug_u * 3600, nu + vooruit_u * 3600))
            for r in cur:
                d = dict(zip(BORD_COLS, r))
                try:
                    d["states"] = json.loads(d["states"] or "[]")
                except ValueError:
                    d["states"] = []
                d["hard"] = bool(d["hard"])
                rijen.append(d)
    with veld_lock:
        bron = dict(velden_live["bron"])
        oud = {k: round(nu - v) for k, v in velden_live.get("gezien", {}).items()}
    with lock:
        sch_st = schiphol["status"] if sch_cfg() else "uit"
        sch_oud = round(nu - schiphol["updated"]) if schiphol["updated"] else None
    return {"nu": nu, "vluchten": rijen, "bron": bron, "ouderdom": oud,
            "schiphol": {"status": sch_st, "ouderdom": sch_oud}}


def veld_for(reg, cs, motion=None):
    """De vlucht bij dit toestel, van de luchthaven zelf. Kenteken en callsign eerst, daarna het
    vluchtnummer (teletekst) - dat laatste blijft gemarkeerd als zwak."""
    if motion is None:
        motion = motion_of(reg, cs)
    want = sch_direction(motion)
    nr = re.sub(r"\s+", "", (cs or "").upper())
    with veld_lock:
        kandidaten = []
        if reg:
            kandidaten += velden_live["by_reg"].get(norm_reg(reg), [])
        if nr:
            kandidaten += velden_live["by_cs"].get(nr, [])
            kandidaten += velden_live["by_nr"].get(nr, [])
        updated = velden_live["updated"]
        bron = dict(velden_live["bron"])
    if not kandidaten:
        return None
    nu = time.time()
    ok = [e for e in kandidaten if sch_plausible(e, motion, want)] or kandidaten
    ok.sort(key=lambda e: (0 if e["hard"] else 1, abs((sch_when(e) or nu + 86400) - nu)))
    e = dict(ok[0])
    ao = airports_all.get(e["home"])
    an = airports_all.get((e.get("other_icao") or "").upper())
    if not an and e.get("other"):
        rij = airports_iata.get(e["other"].upper())
        if rij:
            an, e["other_icao"] = rij, rij[5]
    if ao and an:
        oi, di = ((e["home"], e["other_icao"]) if e["dir"] == "D" else (e["other_icao"], e["home"]))
        o, d = (ao, an) if e["dir"] == "D" else (an, ao)
        e["route"] = [oi, o[0], o[1], o[2], o[3], o[4], di, d[0], d[1], d[2], d[3], d[4]]
    e["age"] = nu - updated if updated else None
    e["bronnen"] = bron
    return e


# ---------------------------------------------------------------- OpenWebRX-profiel kiezen
# OpenWebRX neemt een frequentie uit #freq= alleen over als die binnen de band van het actieve
# profiel valt. Hier: het profiel zoeken waar de frequentie in past en dat via de websocket van
# OpenWebRX kiezen (hetzelfde bericht als het profielmenu in de webpagina stuurt).


_owrx_prof = {"mtime": 0, "list": []}


# Eén rondje tegelijk naar OpenWebRX: profielen wisselen en tegelijk een profiel kiezen
# gaat niet samen. Herbetreedbaar, zodat owrx_profiles() binnen het slot geen klem loopt.
owrx_lock = threading.RLock()


def owrx_host():
    """Waar OpenWebRX draait. Standaard deze machine, want zo stond het altijd; draait de
    tracker elders (Home Assistant-add-on), dan zet je hier het adres van de Pi."""
    ow = CFG.get("openwebrx") or {}
    return str(ow.get("host") or "127.0.0.1")


def owrx_ws(timeout=4):
    ow = CFG.get("openwebrx") or {}
    return MiniWS(owrx_host(), int(ow.get("port", 8073)), "/ws/", timeout)


# Uitkomst van het rondje langs OpenWebRX, ook op schijf zodat een herstart niet meteen weer
# de ontvanger laat rondspringen.
owrx_net = {"t": 0, "profiles": [], "bookmarks": []}


class OwrxBackoff(OSError):
    """OpenWebRX wil ons even niet. Doorgaan maakt het erger."""


def owrx_scan(bewaar=True):
    """Profielen en bookmarks rechtstreeks bij OpenWebRX ophalen, over de websocket.

    Dit is de TERUGVAL, niet de gewone weg. De gewone weg is settings.json en bookmarks.json
    lezen; draait de tracker ergens anders dan de ontvanger, zet die twee bestanden dan met
    tools/owrx-naar-ha.ps1 op een gedeelde map en wijs settings_file en bookmarks_file daarheen.

    Waarom terugval en niet andersom, gemeten 29-09-2026 op de Pi:
      * Het profiles-bericht is onvolledig. Het gaf 4 profielen terug terwijl de ontvanger er
        veel meer heeft (Airband 125-127, 129-131, Rotterdam Tower); blijkbaar alleen die van
        het op dat moment actieve SDR-apparaat. Via de bestanden kwamen alle profielen mee.
      * Bookmarks komen alleen binnen voor de band van het gekozen profiel: 95 over de
        websocket tegen 219 uit het bestand.
      * OpenWebRX bant een adres dat te vaak opnieuw verbindt ("Client address banned"), en
        dan is er geen geluid meer. Vandaar dat dit zelden gebeurt en backoff wordt gerespecteerd.

    Het rondje verzet de ontvanger, dus aan het eind gaat het oorspronkelijke profiel terug.
    """
    def lees(ws, tot, raak):
        """Berichten lezen tot 'raak' true geeft of de tijd om is."""
        einde = time.time() + tot
        while time.time() < einde:
            try:
                msg = ws.recv()
            except OwrxBackoff:
                raise
            except OSError:
                return False
            if not msg.startswith("{"):
                continue
            try:
                m = json.loads(msg)
            except ValueError:
                continue
            if m.get("type") == "backoff":
                raise OwrxBackoff(f"OpenWebRX weert ons af: {m.get('reason') or 'backoff'}")
            if m.get("type") == "bookmarks":
                for b in (m.get("value") or []):
                    if isinstance(b, dict) and b.get("frequency"):
                        marks[int(b["frequency"])] = b
            elif m.get("type") == "profiles":
                for p in (m.get("value") or []):
                    if isinstance(p, dict) and p.get("id"):
                        namen[str(p["id"])] = str(p.get("name") or p["id"])
            elif m.get("type") == "config":
                cur.update(m.get("value") or {})
            if raak(m):
                return True
        return False

    marks, namen, cur = {}, {}, {}
    gevonden = {}
    with owrx_lock:
        ws = owrx_ws(6)
        try:
            ws.send("SERVER DE CLIENT client=openwebrx.js type=receiver")
            ws.send(json.dumps({"type": "connectionproperties",
                                "params": {"output_rate": 12000, "hd_output_rate": 48000}}))
            # eerst kijken wat er is en waar hij nu staat
            lees(ws, 6, lambda m: bool(namen) and "center_freq" in cur and "profile_id" in cur)
            begin = f"{cur.get('sdr_id')}|{cur.get('profile_id')}"
            if "center_freq" in cur and "samp_rate" in cur and begin in namen:
                gevonden[begin] = (float(cur["center_freq"]), float(cur["samp_rate"]))
            for pid in list(namen):
                if pid in gevonden:
                    continue
                cur.pop("center_freq", None)
                ws.send(json.dumps({"type": "selectprofile", "params": {"profile": pid}}))
                ok = lees(ws, 5, lambda m: (m.get("type") == "config"
                                            and "center_freq" in cur and "samp_rate" in cur
                                            and f"{cur.get('sdr_id')}|{cur.get('profile_id')}" == pid))
                if ok:
                    gevonden[pid] = (float(cur["center_freq"]), float(cur["samp_rate"]))
            if begin in namen and len(gevonden) > 1:       # de ontvanger terugzetten waar hij stond
                ws.send(json.dumps({"type": "selectprofile", "params": {"profile": begin}}))
                lees(ws, 4, lambda m: f"{cur.get('sdr_id')}|{cur.get('profile_id')}" == begin)
        finally:
            try:
                ws.close()
            except Exception:                              # noqa: BLE001
                pass

    profs = [{"id": pid, "name": namen[pid], "center": c, "rate": r}
             for pid, (c, r) in gevonden.items()]
    owrx_net.update(t=time.time(), profiles=profs, bookmarks=list(marks.values()))
    log(f"OpenWebRX op {owrx_host()}: {len(profs)} profielen, {len(marks)} bookmarks")
    if bewaar:
        try:
            (CACHE / "owrx.json").write_text(json.dumps(owrx_net), encoding="utf-8")
        except OSError as e:
            log(f"owrx.json bewaren mislukt: {e}")
    return owrx_net


def owrx_net_laad():
    """Wat er de vorige keer uit OpenWebRX kwam, van schijf."""
    if owrx_net["t"]:
        return owrx_net
    try:
        d = json.loads((CACHE / "owrx.json").read_text(encoding="utf-8"))
        if isinstance(d, dict) and d.get("profiles"):
            owrx_net.update(t=float(d.get("t") or 0), profiles=d["profiles"],
                            bookmarks=d.get("bookmarks") or [])
    except (OSError, ValueError):
        pass
    return owrx_net


def owrx_vers(c=None):
    """Is het tijd voor een nieuw rondje? Alleen als we niet uit een bestand kunnen lezen."""
    ow = c if c is not None else (CFG.get("openwebrx") or {})
    uren = float(ow.get("scan_hours", 12) or 12)
    return time.time() - owrx_net_laad()["t"] > uren * 3600


def owrx_profiles():
    """Profielen uit settings.json als dat bestand er is, anders van OpenWebRX zelf.

    Op de Pi is het bestand er en is dit gratis. In de add-on is het er niet en komt alles
    over de websocket; dat kost een rondje langs de profielen, dus dat doen we zelden.
    """
    ow = CFG.get("openwebrx") or {}
    path = Path(ow.get("settings_file") or "/var/lib/openwebrx/settings.json")
    try:
        mt = path.stat().st_mtime
    except OSError:
        mt = 0
    if mt:
        if mt != _owrx_prof["mtime"]:
            d = json.loads(path.read_text(encoding="utf-8"))
            lst = []
            for sid, sd in (d.get("sdrs") or {}).items():
                for pid, p in (sd.get("profiles") or {}).items():
                    try:
                        lst.append({"id": f"{sid}|{pid}", "name": p.get("name") or pid,
                                    "center": float(p["center_freq"]), "rate": float(p["samp_rate"])})
                    except (KeyError, TypeError, ValueError):
                        continue
            _owrx_prof.update(mtime=mt, list=lst)
        return _owrx_prof["list"]
    if owrx_vers(ow):
        uren = float(ow.get("scan_hours", 12) or 12)
        try:
            owrx_scan()
        except OwrxBackoff as e:
            # Doorproberen is precies wat de ban veroorzaakt. Een dag stil, en wat we hadden
            # blijft staan; is dat niets, dan werkt alleen het profielwisselen niet.
            log(f"{e} -- ik laat hem 24 uur met rust")
            owrx_net["t"] = time.time() - uren * 3600 + 24 * 3600
        except Exception as e:                             # noqa: BLE001
            log(f"OpenWebRX uitlezen mislukt: {e}")
            owrx_net["t"] = time.time() - uren * 3600 + 3600      # over een uur nog eens
    return owrx_net_laad()["profiles"]


def owrx_fits(hz, center, rate, margin=0.45):
    return abs(hz - center) <= rate * margin


class MiniWS:
    """Kleinste websocket-client die nodig is: tekstframes sturen en lezen (alleen stdlib)."""

    def __init__(self, host, port, path, timeout=4):
        self.s = socket.create_connection((host, port), timeout=timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall((f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\n"
                        f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        head = b""
        while b"\r\n\r\n" not in head:
            chunk = self.s.recv(1024)
            if not chunk:
                raise OSError("websocket: verbinding gesloten")
            head += chunk
        if b" 101 " not in head.split(b"\r\n", 1)[0]:
            raise OSError("websocket: geen upgrade")
        self.buf = head.split(b"\r\n\r\n", 1)[1]

    def _read(self, n):
        while len(self.buf) < n:
            chunk = self.s.recv(65536)
            if not chunk:
                raise OSError("websocket: verbinding gesloten")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def send(self, text):
        data = text.encode()
        mask = os.urandom(4)
        n = len(data)
        head = bytes([0x81]) + (bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack(">H", n))
        self.s.sendall(head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def recv(self):
        """Volgend tekstbericht; binaire frames (audio, waterval) worden overgeslagen."""
        while True:
            b1, b2 = self._read(2)
            n = b2 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._read(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._read(8))[0]
            if b2 & 0x80:
                self._read(4)
            payload = self._read(n)
            op = b1 & 0x0F
            if op == 1:
                return payload.decode("utf-8", "replace")
            if op == 8:
                raise OSError("websocket: gesloten door OpenWebRX")

    def close(self):
        try:
            self.s.sendall(bytes([0x88, 0x80]) + os.urandom(4))
        except OSError:
            pass
        self.s.close()


# ---------------------------------------------------------------- audio doorgeven aan de browser
# Van buitenshuis kan je browser de ontvanger niet bereiken: die staat op een 192.168-adres en
# hangt niet aan het internet -- en zo willen we het houden. Deze server staat wel al voor je
# open (achter je tunnel of de ingress van Home Assistant) en heeft zelf een lijntje naar
# OpenWebRX, want daar haalt het meeluisteren zijn audio vandaan. Dus geeft hij de websocket
# gewoon door: browser -> tracker -> OpenWebRX. Er komt niets extra's aan het publieke net te
# staan, en omdat het nu dezelfde herkomst is als de pagina wordt het op een https-pagina
# vanzelf wss:// -- een ws:// naar 192.168.x.x weigert de browser daar als mixed content.
#
# De doorgifte is dom met opzet: elk frame gaat ongewijzigd door, met zijn opcode en fin-bit.
# Deze server kent het protocol van OpenWebRX dus niet en hoeft dat ook niet te kennen; audio,
# waterval, profielwissels en squelch lopen er doorheen zoals ze zijn, en een volgende versie
# van OpenWebRX breekt er niet op.
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
RELAY_MAX = 4          # zoveel luisteraars tegelijk; elke luisteraar is een eigen lijntje
RELAY_MIN_S = 1.0      # en nooit sneller dan dit een nieuw lijntje, zie hieronder
relay_n = 0
relay_t = 0.0
relay_lock = threading.Lock()


def owrx_relay_mode():
    """"auto" (alleen als de pagina via https binnenkomt), "aan" (altijd), "uit" (nooit)."""
    v = (CFG.get("openwebrx", {}) or {}).get("relay", "auto")
    if isinstance(v, str):
        return v.strip().lower() or "auto"
    return "aan" if v else "uit"


class WsPijp:
    """Websocketframes lezen en schrijven. mask=True aan de kant waar wij de client zijn.

    Leest via een functie in plaats van rechtstreeks van de socket, want aan de browserkant
    zit de gebufferde rfile van de http-server ertussen; daar zouden bytes in blijven staan.
    """

    def __init__(self, lees, schrijf, mask, rest=b""):
        self._lees_ruw = lees
        self._schrijf = schrijf
        self.mask = mask
        self.buf = rest

    def _lees(self, n):
        while len(self.buf) < n:
            brok = self._lees_ruw(65536)
            if not brok:
                raise OSError("websocket: verbinding gesloten")
            self.buf += brok
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def frame(self):
        b1, b2 = self._lees(2)
        n = b2 & 0x7F
        if n == 126:
            n = struct.unpack(">H", self._lees(2))[0]
        elif n == 127:
            n = struct.unpack(">Q", self._lees(8))[0]
        sleutel = self._lees(4) if b2 & 0x80 else b""
        data = self._lees(n) if n else b""
        if sleutel:
            data = bytes(b ^ sleutel[i % 4] for i, b in enumerate(data))
        return b1 & 0x80, b1 & 0x0F, data

    def stuur(self, fin, op, data):
        n = len(data)
        kop = bytes([(0x80 if fin else 0) | op])
        vlag = 0x80 if self.mask else 0
        if n < 126:
            kop += bytes([vlag | n])
        elif n < 65536:
            kop += bytes([vlag | 126]) + struct.pack(">H", n)
        else:
            kop += bytes([vlag | 127]) + struct.pack(">Q", n)
        if self.mask:
            sleutel = os.urandom(4)
            data = bytes(b ^ sleutel[i % 4] for i, b in enumerate(data))
            kop += sleutel
        self._schrijf(kop + data)


def owrx_pijp(timeout=8):
    """Een kale websocket naar OpenWebRX; MiniWS kan alleen tekst, dit moet ook audio door."""
    ow = CFG.get("openwebrx", {}) or {}
    host, port = owrx_host(), int(ow.get("port", 8073))
    s = socket.create_connection((host, port), timeout=timeout)
    key = base64.b64encode(os.urandom(16)).decode()
    s.sendall((f"GET /ws/ HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\n"
               f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
               f"Sec-WebSocket-Version: 13\r\n\r\n").encode())
    kop = b""
    while b"\r\n\r\n" not in kop:
        brok = s.recv(1024)
        if not brok:
            raise OSError("websocket: verbinding gesloten")
        kop += brok
    if b" 101 " not in kop.split(b"\r\n", 1)[0]:
        raise OSError("websocket: geen upgrade")
    # De time-out van het opzetten moet eraf: daarna is stilte normaal (niemand zendt) en een
    # leesfout na acht seconden zou de verbinding midden in een rustige band verbreken.
    s.settimeout(None)
    return s, WsPijp(s.recv, s.sendall, True, kop.split(b"\r\n\r\n", 1)[1])


def owrx_squelch(profile_name=""):
    """Squelch (dB, zoals #sql= in OpenWebRX): per profiel, anders openwebrx.squelch, anders uit tab_url."""
    ow = CFG.get("openwebrx") or {}
    per = ow.get("squelch_by_profile") or {}
    if profile_name and profile_name in per:
        return per[profile_name]
    if ow.get("squelch") is not None:
        return ow.get("squelch")
    m = re.search(r"sql=(-?\d+(?:\.\d+)?)", ow.get("tab_url") or "")
    if not m:
        return None
    v = float(m.group(1))
    return int(v) if v.is_integer() else v


def owrx_select(hz):
    """Zorg dat OpenWebRX op een profiel staat waarin hz past. Geeft uitleg terug voor de pagina."""
    ow = CFG.get("openwebrx") or {}
    profs = owrx_profiles()
    cands = [p for p in profs if owrx_fits(hz, p["center"], p["rate"])]
    if not cands:
        return {"ok": False, "reason": "geen profiel", "hz": hz, "sql": owrx_squelch()}
    # voorkeur voor de gewone airbandprofielen (naam begint met openwebrx.profile_prefer), daarbinnen
    # het profiel waar de frequentie het dichtst bij het midden ligt (randen ontvangen slechter)
    pref = (ow.get("profile_prefer") or "Airband").lower()
    best = min(cands, key=lambda p: (0 if p["name"].lower().startswith(pref) else 1,
                                     abs(hz - p["center"]) / p["rate"]))
    if not ow.get("switch_profile", True):
        return {"ok": True, "switched": False, "profile": best["name"], "hz": hz, "sql": owrx_squelch(best["name"])}
    with owrx_lock:
        ws = owrx_ws()
        try:
            ws.send("SERVER DE CLIENT client=openwebrx.js type=receiver")
            cur, t_end = {}, time.time() + 3
            while time.time() < t_end:
                msg = ws.recv()
                if not msg.startswith("{"):
                    continue
                m = json.loads(msg)
                if m.get("type") == "config":
                    cur.update(m.get("value") or {})
                    if "center_freq" in cur and "samp_rate" in cur:
                        break
            if "center_freq" in cur and "samp_rate" in cur and owrx_fits(hz, float(cur["center_freq"]), float(cur["samp_rate"])):
                name = next((p["name"] for p in profs if p["id"] == f"{cur.get('sdr_id')}|{cur.get('profile_id')}"), "")
                return {"ok": True, "switched": False, "profile": name, "hz": hz, "sql": owrx_squelch(name)}
            ws.send(json.dumps({"type": "selectprofile", "params": {"profile": best["id"]}}))
            t_end = time.time() + 4
            while time.time() < t_end:           # wachten tot OpenWebRX de nieuwe middenfrequentie meldt
                msg = ws.recv()
                if msg.startswith("{"):
                    m = json.loads(msg)
                    v = m.get("value") or {}
                    if m.get("type") == "config" and "center_freq" in v and abs(float(v["center_freq"]) - best["center"]) < 1:
                        break
            log(f"OpenWebRX: profiel {best['name']} voor {hz / 1e6:.3f} MHz")
            return {"ok": True, "switched": True, "profile": best["name"], "hz": hz, "sql": owrx_squelch(best["name"])}
        finally:
            ws.close()


# ---------------------------------------------------------------- luchtruim (openAIP)

airspace = {"ready": False, "gz": b"", "status": "laden"}
OPENAIP_URL = ((CFG.get("openaip") or {}).get("url")
               or "https://api.core.openaip.net/api/airspaces")
# openAIP-typen: 1 R, 2 D, 3 P, 4 CTR, 5 TMZ, 6 RMZ, 7 TMA, 8 TRA, 9 TSA, 10 FIR, 26 CTA
# openAIP-eenheden: 0 m, 1 ft, 6 FL; referentie: 0 GND, 1 MSL, 2 STD


def asp_limit(lim):
    """Grens naar [hoogte in honderden voet (voor de hoogteband), label zoals op de kaart]."""
    if not lim:
        return [0, "GND"]
    v, u, ref = lim.get("value", 0), lim.get("unit", 1), lim.get("referenceDatum", 1)
    if u == 6:
        return [v, "UNL" if v >= 999 else f"FL{int(v):03d}"]
    ft = v * 3.2808 if u == 0 else v
    if ft <= 0 and ref == 0:
        return [0, "GND"]
    return [round(ft / 100, 1), f"{int(round(ft))}{' AGL' if ref == 0 else ''}"]


def asp_slim(item):
    g = item.get("geometry") or {}
    if g.get("type") != "Polygon" or not g.get("coordinates"):
        return None
    ring, pts = g["coordinates"][0], []
    for lon, lat in ring:
        p = [round(lon, 4), round(lat, 4)]
        if not pts or p != pts[-1]:
            pts.append(p)
    if len(pts) < 4:
        return None
    return {"n": (item.get("name") or "").strip(), "t": item.get("type"), "c": item.get("icaoClass"),
            "lo": asp_limit(item.get("lowerLimit")), "hi": asp_limit(item.get("upperLimit")), "p": pts}


def asp_merge(tiles):
    """Blokken uit alle binnengekomen tegels, zonder dubbele (een blok kan over tegelgrenzen lopen)."""
    items, seen = [], set()
    for raw in tiles.values():
        for s in raw:
            if s.get("id") in seen:
                continue
            seen.add(s.get("id"))
            items.append({k: v for k, v in s.items() if k != "id"})
    return items


def airspace_loop():
    cfg = CFG.get("openaip") or {}
    if not cfg.get("enabled") or not cfg.get("api_key"):
        airspace["status"] = "uit"
        log("luchtruim uit: geen openaip.api_key in config.json")
        return
    path = CACHE / "airspace.json"
    part = CACHE / "airspace_tiles.json"         # voortgang per tegel, zodat een 429 geen werk kost
    types = set(cfg.get("types") or [])
    refresh = float(cfg.get("refresh_days", 7)) * 86400
    backoff = [120, 300, 600, 1200, 1800, 3600]    # na HTTP 429: 2, 5, 10, 20, 30, 60 min
    fails = 0
    while True:
      try:
        c = CFG["center"]
        rnm = float(cfg.get("radius_nm", 150))
        dlat = rnm / 60
        dlon = dlat / max(0.2, math.cos(math.radians(c["lat"])))
        box = [round(c["lon"] - dlon, 3), round(c["lat"] - dlat, 3), round(c["lon"] + dlon, 3), round(c["lat"] + dlat, 3)]
        data = None
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("box") != box:
                data = None
        if data is not None and not airspace["ready"]:
            # oude of verse cache meteen tonen; verversen gebeurt eventueel daarna
            airspace["gz"] = encode({"items": data["items"], "fetched": data.get("fetched")})
            airspace["ready"] = True
            airspace["status"] = "ok"
        if data is None or time.time() - data.get("fetched", 0) > refresh:
            # openAIP staat maximaal 250.000 km2 per vraag toe: het gebied in tegels opdelen
            km_w = (box[2] - box[0]) * 111.3 * math.cos(math.radians(c["lat"]))
            km_h = (box[3] - box[1]) * 111.3
            n = 1
            while km_w * km_h / (n * n) > 200000:
                n += 1
            prog = {}
            if part.exists():
                prog = json.loads(part.read_text(encoding="utf-8"))
                if prog.get("box") != box or time.time() - prog.get("started", 0) > refresh:
                    prog = {}
            prog.setdefault("box", box)
            prog.setdefault("started", time.time())
            prog.setdefault("tiles", {})

            def show_partial():
                # zolang er geen volledige cache is: laten zien wat al binnen is
                if data is None and prog["tiles"]:
                    airspace["gz"] = encode({"items": asp_merge(prog["tiles"]), "partial": True,
                                             "tiles": [len(prog["tiles"]), n * n]})
                    airspace["ready"] = True
            show_partial()
            calls = 0
            for ix in range(n):
                for iy in range(n):
                    tb = [round(box[0] + (box[2] - box[0]) * ix / n, 3), round(box[1] + (box[3] - box[1]) * iy / n, 3),
                          round(box[0] + (box[2] - box[0]) * (ix + 1) / n, 3), round(box[1] + (box[3] - box[1]) * (iy + 1) / n, 3)]
                    key = ",".join(str(v) for v in tb)
                    if key in prog["tiles"]:
                        continue                      # deze tegel is al binnen
                    raw, page = [], 1
                    while page <= 20:
                        if calls:
                            time.sleep(5)             # rustig aan: openAIP geeft anders HTTP 429
                        calls += 1
                        url = f"{OPENAIP_URL}?bbox={key}&limit=1000&page={page}"
                        req = urllib.request.Request(url, headers={"x-openaip-api-key": cfg["api_key"], "User-Agent": UA,
                                                                   "Accept": "application/json"})
                        with urllib.request.urlopen(req, timeout=60) as r:
                            d = json.loads(r.read())
                        got = d.get("items") or []
                        for it in got:
                            if types and it.get("type") not in types:
                                continue
                            s = asp_slim(it)
                            if s:
                                s["id"] = it.get("_id")
                                raw.append(s)
                        if len(got) < 1000:
                            break
                        page += 1
                    prog["tiles"][key] = raw
                    part.write_text(json.dumps(prog, separators=(",", ":")), encoding="utf-8")
                    log(f"luchtruim: tegel {len(prog['tiles'])}/{n * n} binnen ({len(raw)} blokken)")
                    show_partial()
            items = asp_merge(prog["tiles"])
            data = {"box": box, "items": items, "fetched": time.time()}
            path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
            part.unlink(missing_ok=True)
            log(f"luchtruim geladen (openAIP): {len(items)} blokken binnen {int(rnm)} NM")
            airspace["gz"] = encode({"items": data["items"], "fetched": data.get("fetched")})
            airspace["ready"] = True
            airspace["status"] = "ok"
        fails = 0
        time.sleep(max(3600, refresh - (time.time() - data.get("fetched", 0))))
      except urllib.error.HTTPError as e:
        fails += 1
        if not airspace["ready"]:
            airspace["status"] = f"HTTP {e.code}"
        try:
            body = e.read()[:400]
            msg = json.loads(body).get("message", "")[:160]
        except Exception:  # noqa: BLE001
            msg = "Cloudflare-limiet" if b"cloudflare" in (body or b"").lower() or b"<html" in (body or b"").lower() else ""
        wait = backoff[min(fails, len(backoff)) - 1] if e.code == 429 else min(3600, 60 * fails)
        ra = e.headers.get("Retry-After") if e.headers else None
        if ra and ra.isdigit():
            wait = max(wait, int(ra))
        log(f"luchtruim ophalen mislukt: HTTP {e.code}" + (" (controleer openaip.api_key)" if e.code in (401, 403) else "")
            + (f": {msg}" if msg else "") + f"; opnieuw over {wait // 60} min")
        time.sleep(wait)
      except Exception as e:  # noqa: BLE001
        fails += 1
        if not airspace["ready"]:
            airspace["status"] = "fout"
        log(f"luchtruim ophalen mislukt: {e}; opnieuw over {min(60, fails)} min")
        time.sleep(min(3600, 60 * fails))


# ---------------------------------------------------------------- navdata (bakens en luchtwegen)

navdata = {"ready": False, "gz": b""}


def parse_navdata(fix_txt, nav_txt, awy_txt, lat0, lon0, rkm):
    def near(lat, lon):
        return dist_km(lat0, lon0, lat, lon) <= rkm

    points, seen = [], set()
    for line in fix_txt.splitlines():
        p = line.split()
        if len(p) < 3:
            continue
        try:
            lat, lon = float(p[0]), float(p[1])
        except ValueError:
            continue
        ident = p[2]
        if len(ident) != 5 or not ident.isalpha() or not near(lat, lon) or ident in seen:
            continue
        seen.add(ident)
        points.append([ident, round(lat, 4), round(lon, 4), "fix"])

    # VOR, NDB en DME staan vaak op dezelfde plek met dezelfde naam; die worden samengevoegd
    KIND = {"2": "ndb", "3": "vor", "12": "dme", "13": "dme"}
    RANK = {"vor": 3, "ndb": 2, "dme": 1}
    best = {}
    for line in nav_txt.splitlines():
        p = line.split()
        if len(p) < 9 or p[0] not in KIND:
            continue
        try:
            lat, lon = float(p[1]), float(p[2])
        except ValueError:
            continue
        ident = p[7]
        kind = KIND[p[0]]
        if not near(lat, lon) or not ident.isalnum() or ident in seen:
            continue
        cur = best.get(ident)
        if cur is None or RANK[kind] > RANK[cur[3]]:
            best[ident] = [ident, round(lat, 4), round(lon, 4), kind]
    points.extend(best.values())

    ways, segs = [], set()
    for line in awy_txt.splitlines():
        p = line.split()
        if len(p) != 10:
            continue                      # alleen het 640-formaat met coördinaten in de regel
        try:
            la1, lo1, la2, lo2 = float(p[1]), float(p[2]), float(p[4]), float(p[5])
            lo_fl, hi_fl = int(p[6 + 1]), int(p[6 + 2])
        except ValueError:
            continue
        if not (near(la1, lo1) or near(la2, lo2)):
            continue
        name = p[9]
        key = (min(p[0], p[3]), max(p[0], p[3]), name)
        if key in segs:
            continue
        segs.add(key)
        ways.append([name, lo_fl, hi_fl, round(la1, 4), round(lo1, 4), round(la2, 4), round(lo2, 4)])
    return {"points": points, "ways": ways}


def navdata_loop():
    cfg = CFG.get("navdata") or {}
    if not cfg.get("enabled", True):
        return
    path = CACHE / "navdata.json"
    for attempt in range(1, 50):
      try:
        need = coverage_km() * 1.15
        data = None
        if path.exists() and time.time() - path.stat().st_mtime < float(cfg.get("refresh_days", 180)) * 86400:
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("r", 0) < need * 0.95:
                data = None
        if data is None:
            c = CFG["center"]
            rkm = need
            log("navdata ophalen (bakens en luchtwegen)")
            fix_txt = http_get(cfg["fix_url"], 300).decode("utf-8", "replace")
            nav_txt = http_get(cfg["nav_url"], 300).decode("utf-8", "replace")
            awy_txt = http_get(cfg["awy_url"], 300).decode("utf-8", "replace")
            data = parse_navdata(fix_txt, nav_txt, awy_txt, c["lat"], c["lon"], rkm)
            data["r"] = need
            path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
            log(f"navdata geladen: {len(data['points'])} punten, {len(data['ways'])} luchtwegsegmenten")
        navdata["gz"] = encode(data)
        navdata["ready"] = True
        return
      except Exception as e:  # noqa: BLE001
        log(f"navdata laden mislukt (poging {attempt}): {e}")
        time.sleep(min(600, 30 * attempt))


# ---------------------------------------------------------------- casco's (bouwjaar)

def airframe_loop():
    """Bouwjaar en serienummer uit de OpenSky-vliegtuigdatabase, één keer per maand."""
    cfg = CFG.get("airframes") or {}
    if not cfg.get("enabled", True):
        return
    while True:
        try:
            with db_lock:
                row = db.execute("SELECT v FROM meta WHERE k='airframes'").fetchone()
                have = db.execute("SELECT COUNT(*) FROM airframes").fetchone()[0]
            age = time.time() - float(row[0]) if row else 1e9
            if have and age < float(cfg.get("refresh_days", 30)) * 86400:
                time.sleep(6 * 3600)
                continue
            log("vliegtuigdatabase ophalen (ongeveer 90 MB, duurt even)")
            raw = http_get(cfg.get("url"), 600, accept_gzip=False).decode("utf-8", "replace")
            n = 0
            rows = []
            for r in csv.DictReader(io.StringIO(raw)):
                built = (r.get("built") or r.get("firstflightdate") or "").strip()[:10]
                hexid = (r.get("icao24") or "").strip().lower()
                if not hexid or not built:
                    continue
                rows.append((hexid, built, (r.get("serialnumber") or "").strip(),
                             (r.get("owner") or r.get("operator") or "").strip(),
                             (r.get("model") or "").strip()))
                n += 1
            with db_lock:
                db.execute("DELETE FROM airframes")
                db.executemany("INSERT OR REPLACE INTO airframes (hex,built,serial,owner,model) "
                               "VALUES (?,?,?,?,?)", rows)
                db.execute("INSERT OR REPLACE INTO meta (k,v) VALUES ('airframes',?)", (str(time.time()),))
                db.commit()
            log(f"vliegtuigdatabase geladen: {n} toestellen met bouwjaar")
        except Exception as e:  # noqa: BLE001
            log(f"vliegtuigdatabase laden mislukt: {e}")
            time.sleep(3600)


def airframe_of(hexid):
    if not hexid:
        return {}
    with db_lock:
        row = db.execute("SELECT built,serial,owner,model FROM airframes WHERE hex=?",
                         (hexid.lower(),)).fetchone()
    if not row:
        return {}
    return {"built": row[0], "serial": row[1], "owner": row[2], "model": row[3]}


# ---------------------------------------------------------------- foto's

PHOTO_TTL = 30 * 86400
PHOTO_TTL_MISS = 3 * 86400
# Een mislukte poging werd nergens bewaard. Gevolg: zolang planespotters hapert vraagt elke
# selectie het opnieuw, en juist dat houdt een tijdelijke storing in stand -- een dienst die
# afknijpt laat sneller los als je hem met rust laat. Tien minuten is lang genoeg om de bui
# voorbij te laten trekken en kort genoeg om niet in de weg te zitten.
PHOTO_TTL_FOUT = 600
photo_lock = threading.Semaphore(4)
# Gemeenschappelijke rem: gaat er één aanvraag onderuit met een tempofout of een serverfout, dan
# staan de volgende dat ook te doen. Tot dit tijdstip wordt er niet naar buiten gebeld; per keer
# verdubbelt de pauze, tot een kwartier, en één geslaagde aanvraag zet hem weer op nul.
foto_pauze = {"tot": 0.0, "stap": 60.0}


def photo_contact():
    p = CFG.get("photos") or {}
    return p.get("contact", "").strip() if p.get("enabled", True) else ""


def get_photo(hexid, reg):
    """Eén foto per toestel via planespotters.net (vereist contactgegevens in de User-Agent)."""
    contact = photo_contact()
    if not contact:
        return {"error": "geen contact ingesteld"}
    key = (hexid or reg or "").lower().replace("/", "")
    if not key:
        return {"error": "geen kenmerk"}
    p = CACHE / "photos" / f"{key}.json"
    if p.exists():
        age = time.time() - p.stat().st_mtime
        try:
            cached = json.loads(p.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            cached = None
        if cached is not None:
            bewaar = (PHOTO_TTL if cached.get("thumb")
                      else PHOTO_TTL_FOUT if cached.get("error") else PHOTO_TTL_MISS)
            if age < bewaar:
                return cached
    _ph = CFG.get("photos") or {}
    url = (( _ph.get("url_hex") or "https://api.planespotters.net/pub/photos/hex/{hex}").format(hex=hexid)
           if hexid else
           (_ph.get("url_reg") or "https://api.planespotters.net/pub/photos/reg/{reg}").format(reg=reg))
    if time.time() < foto_pauze["tot"]:
        # Nog in de pauze: meteen antwoorden in plaats van de rij te laten vollopen.
        return {"error": "even geen foto's", "tijdelijk": True}
    req = urllib.request.Request(url, headers={
        "User-Agent": f"flighttracknl/1.0 (+{contact})", "Accept-Encoding": "gzip"})
    out = {}
    try:
        with photo_lock:
            # Acht seconden, niet twintig. Er zijn vier plekken tegelijk; met twintig seconden
            # per mislukking staat de hele kaartweergave minutenlang op een foto te wachten.
            with urllib.request.urlopen(req, timeout=8) as r:
                raw = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
        photos = json.loads(raw).get("photos") or []
        if photos:
            ph = photos[0]
            out = {"thumb": (ph.get("thumbnail_large") or ph.get("thumbnail") or {}).get("src", ""),
                   "link": ph.get("link", ""), "by": ph.get("photographer", "")}
    except urllib.error.HTTPError as e:
        out = {"error": f"HTTP {e.code}", "tijdelijk": e.code == 429 or e.code >= 500}
        if e.code in (401, 403):
            log(f"planespotters weigert de aanvraag ({e.code}); controleer photos.contact in config.json")
        if out["tijdelijk"]:
            # Retry-After is het antwoord van de dienst zelf op "wanneer mag ik weer"; die telt
            # zwaarder dan onze eigen verdubbeling.
            na = 0.0
            try:
                na = float((e.headers or {}).get("Retry-After") or 0)
            except (TypeError, ValueError):
                na = 0.0
            foto_pauze["tot"] = time.time() + max(na, foto_pauze["stap"])
            foto_pauze["stap"] = min(foto_pauze["stap"] * 2, 900.0)
            log(f"foto's: {out['error']} -- {int(foto_pauze['tot'] - time.time())} s geen aanvragen meer")
    except Exception as e:  # noqa: BLE001
        out = {"error": str(e)[:120], "tijdelijk": True}
        foto_pauze["tot"] = time.time() + foto_pauze["stap"]
        foto_pauze["stap"] = min(foto_pauze["stap"] * 2, 900.0)
        log(f"foto's: {out['error']} -- {int(foto_pauze['tot'] - time.time())} s geen aanvragen meer")
    else:
        foto_pauze["tot"] = 0.0
        foto_pauze["stap"] = 60.0          # het werkt weer; de rem terug naar het begin
    # Ook een mislukking gaat de cache in, met een korte houdbaarheid. Anders vraagt elke
    # selectie het opnieuw en blijft de storing zichzelf voeden.
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(out), encoding="utf-8")
    tmp.replace(p)
    return out


# ---------------------------------------------------------------- kanalen

# In welke groep hoort een bookmark? De kanalenlijst van OpenWebRX is één lange rij op frequentie;
# om er een keuzelijst per veld van te maken moet elk kanaal weten waar het bij hoort. De naam
# beslist, niet de omschrijving: in een omschrijving staat vaak een ánder veld genoemd ("botst met
# EHAM APP backup" bij een Londense toren), en dan zou zo'n kanaal onder Schiphol belanden.
KAN_VELD = [("EHAM", re.compile(r"\bEHAM\b|schiphol", re.I)),
            ("EHRD", re.compile(r"\bEHRD\b|rotterdam", re.I)),
            ("EHEH", re.compile(r"\bEHEH\b|eindhoven", re.I))]
KAN_MIL = re.compile(r"dutchmil|mil atcc|rapcon|volkel|woensdrecht|leeuwarden|de kooy|\bklu\b"
                     r"|gilze|\bamc\b|awacs|tanker", re.I)
KAN_POL = re.compile(r"\bklpd\b|politie|kustwacht|trauma|lifeliner", re.I)
KAN_AMS = re.compile(r"\bAMS\s+(RDR|Info|Radar)\b|amsterdam radar", re.I)
KAN_ICAO = re.compile(r"^(E[BDGHIKNS]|L[FIEOSZ]|EG)[A-Z]{2}\b")     # naam begint met een ICAO-code


def kanaal_groep(naam, omschrijving=""):
    n = (naam or "").strip()
    for code, pat in KAN_VELD:
        if pat.search(n):
            return code
    if KAN_MIL.search(n):
        return "MIL"
    if KAN_POL.search(n):
        return "POL"
    if KAN_AMS.search(n):
        return "AMS"
    # Pas als de naam zelf geen veld noemt mag de omschrijving meepraten - en alleen als de naam
    # niet met een ánder vliegveld begint.
    if not KAN_ICAO.match(n.upper()):
        for code, pat in KAN_VELD:
            if pat.search(omschrijving or ""):
                return code
        if KAN_MIL.search(omschrijving or ""):
            return "MIL"
    return ""


def luisteren_aan():
    """Staat meeluisteren aan? Eén plek, want zowel de pagina als de adressen hangen ervan af."""
    return bool((CFG.get("openwebrx") or {}).get("enabled", True))


def load_channels():
    """Airband-kanalen uit config.json plus de bookmarks van OpenWebRX."""
    if not luisteren_aan():
        # Eén veld en verder niets: de pagina heeft dan geen enkel gegeven in handen om de
        # radiokant mee op te bouwen, ook niet per ongeluk.
        return {"enabled": False, "channels": []}
    ow = CFG.get("openwebrx") or {}
    band = ow.get("band_hz") or None
    out, seen = [], set()
    for ch in ow.get("channels", []):
        try:
            f = int(ch["freq"])
        except (KeyError, TypeError, ValueError):
            continue
        naam = ch.get("name") or f"{f / 1e6:.3f} MHz"
        out.append({"name": naam, "freq": f, "mod": (ch.get("mod") or "am").lower(),
                    "src": "config", "info": ch.get("description") or "",
                    "groep": kanaal_groep(naam, ch.get("description") or ""),
                    "scan": bool(ch.get("scannable"))})
        seen.add(f)
    # Bookmarks uit het bestand van OpenWebRX als dat er is (de tracker draait dan op dezelfde
    # machine), anders uit wat het rondje over de websocket opleverde.
    path = ow.get("bookmarks_file")
    data = None
    if path:
        try:
            data = json.loads(Path(path).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            data = None
    if data is None:
        data = owrx_net_laad()["bookmarks"]
    if data:
        try:
            for b in data if isinstance(data, list) else []:
                try:
                    f = int(b.get("frequency", 0))
                except (TypeError, ValueError):
                    continue
                if not f or f in seen:
                    continue
                if band and not (band[0] <= f <= band[1]):
                    continue
                naam = b.get("name") or f"{f / 1e6:.3f} MHz"
                info = (b.get("description") or "").strip()
                out.append({"name": naam, "freq": f,
                            "mod": (b.get("modulation") or "am").lower(),
                            "src": "openwebrx", "info": info,
                            "groep": kanaal_groep(naam, info),
                            "scan": bool(b.get("scannable"))})
                seen.add(f)
        except FileNotFoundError:
            pass
        except Exception as e:  # noqa: BLE001
            log(f"bookmarks lezen mislukt ({path}): {e}")
    out.sort(key=lambda c: c["freq"])
    return {"enabled": True,
            "channels": out, "url": ow.get("url") or "", "port": int(ow.get("port", 8073)),
            "tab_url": ow.get("tab_url") or "", "open_in_tab": bool(ow.get("open_in_tab", False)),
            "squelch": owrx_squelch(), "player_url": ow.get("player_url") or "",
            # De pagina heeft dit nodig om de speler naar de juiste machine te sturen: die
            # draait waar de SDR staat, niet waar deze server draait.
            "host": owrx_host(), "relay": owrx_relay_mode(),
            "stt": stt_status()}


# ---------------------------------------------------------------- spraak naar tekst (whisper.cpp)
# Eén transmissie per keer: de browser knipt op de squelch en stuurt een wav van 16 kHz hierheen.
# whisper.cpp krijgt alle kernen, dus nooit twee tegelijk; de wachtrij is kort want een transmissie
# die een halve minuut op zijn beurt wacht is toch geen meeluisteren meer.

STT_BIN_PATHS = ["/usr/local/bin/whisper-cli", "/opt/whisper.cpp/build/bin/whisper-cli",
                 "/opt/whisper.cpp/main", "/usr/local/bin/whisper"]
# /share/whisper staat erbij voor de Home Assistant-add-on: daar zet je het model neer met
# Samba, want in het image hoort het niet en een map van de add-on zelf overleeft geen update.
STT_MODEL_DIRS = ["/opt/whisper.cpp/models", "/usr/local/share/whisper",
                  "/opt/flighttracknl/models", "/share/whisper"]
# Een op luchtvaartradio bijgetraind model gaat voor: gewone whisper-modellen maken van ATC-audio
# weinig terecht (zie docs/ontwerp/meelezen-model.md). Bestandsnaam ggml-atc-*.bin
STT_MODEL_ORDER = ["atc-small", "atc-medium", "small.en", "base.en", "tiny.en", "small", "base", "tiny"]
STT_FAST_ORDER = ["atc-small", "base.en", "atc-medium", "small.en", "tiny.en", "base", "small", "tiny"]
# Een gekwantiseerd model rekent met kleinere getallen: hetzelfde model, ruwweg twee keer zo snel,
# met nauwelijks verlies. whisper.cpp maakt ze zelf (quantize ggml-<naam>.bin ggml-<naam>-q5_0.bin
# q5_0). Staat zo'n bestand er, dan gaat het voor op het gewone model.
STT_QUANT = ["-q5_0", "-q8_0", ""]
STT_NOISE = re.compile(r"[\[(](?:blank_audio|inaudible|silence|music|sound|noise|wind|static|"
                       r"beep|click|clicking|applause|laughter|breathing|typing|footsteps|"
                       r"engine|radio|speaking foreign language|unintelligible)[^\])]*[\])]", re.I)
stt_sem = threading.Semaphore(1)
stt_state = {"queue": 0, "last_ms": 0, "runs": 0, "fails": 0, "skipped": 0,
             # Laatste klacht van whisper zelf. Stond alleen in het log, en een log van een
             # add-on lees je niet even: op het scherm bleef het bij "luistert mee" terwijl
             # de binary al bij de eerste poging omviel. Nu komt de regel mee in de status.
             "fout": "", "fout_t": 0.0,
             # Waar de tijd van de laatste transcriptie heen ging, zoals whisper het zelf opgeeft:
             # laden, mel, encoder, decoder. De encoder is de grote post en dat staat vast, maar
             # laden is het niet: de server start per transmissie een nieuwe whisper-cli, die het
             # model opnieuw inleest. Of dat 200 ms of 2 seconden kost, was nooit gemeten -- en je
             # gaat geen blijvende dienst bouwen voor tijd die er niet is.
             "tijden": {},
             # De regel waarmee whisper zegt waarmee hij rekent: n_threads en welke
             # instructieuitbreidingen aanstaan. Zonder AVX2 is de encoder een factor twee tot
             # vier trager, en dat zou elke andere afweging overschaduwen. Het image wordt op de
             # machine zelf gebouwd, dus het hoort goed te staan -- maar "hoort" is geen meting.
             "cpu": ""}

# whisper drukt zijn eigen tijden op stderr af. Dat gebeurde niet omdat -np (geen prints) ze
# meenam; die vlag is eraf en de regels worden hier gelezen in plaats van weggegooid.
STT_TIJD_RE = re.compile(
    r"whisper_print_timings:\s+(load|mel|sample|encode|decode|batchd|prompt|total)"
    r"\s+time\s*=\s*([\d.]+)\s*ms")
# Regels van whisper zelf: nooit de foutmelding waar iemand iets aan heeft.
STT_RUIS_RE = re.compile(r"^(whisper_|ggml_|system_info|main:\s|\s*$)")
STT_SYS_RE = re.compile(r"^system_info:\s*(.+?)\s*$", re.M)
# De regel waarmee de Vulkan-versie zegt welk apparaat hij gevonden heeft, of dat er geen is.
STT_VK_RE = re.compile(r"^ggml_vulkan:.*$", re.M)


def stt_tijden(stderr_txt):
    """De tijden van whisper uit zijn eigen uitvoer; leeg als hij ze niet gaf."""
    return {naam: round(float(ms)) for naam, ms in STT_TIJD_RE.findall(stderr_txt)}
stt_flag_cache = {}


def stt_find_bin():
    for p in STT_BIN_PATHS:
        if os.access(p, os.X_OK):
            return p
    return shutil.which("whisper-cli") or ""


# De GPU-versie is een apart binair bestand en geen vlag, en dat is geen smaakkwestie. Een
# whisper.cpp die met Vulkan gebouwd is, maakt bij het starten een Vulkan-instantie aan -- ook
# met -ng, de vlag die de GPU juist uit zou zetten. Is er geen werkende driver, dan gooit hij
# vk::IncompatibleDriverError en valt om (gemeten). Eén bestand voor allebei zou dus betekenen
# dat een haperende driver de hele herkenning stillegt. Nu is de CPU-versie altijd aanwezig en
# ongemoeid, en is de GPU-versie iets wat je ernaast probeert.
stt_gpu = {"uit": False, "reden": "", "melding": ""}
STT_GPU_BOUWLOG = "/usr/local/share/whisper-gpu-build.log"


def stt_gpu_bestand(c):
    """Pad van de GPU-versie als die er is, anders leeg."""
    p = (c.get("bin") or "") + "-gpu"
    return p if p != "-gpu" and os.access(p, os.X_OK) else ""


def stt_gpu_bouwreden():
    """Waarom er geen GPU-versie is. Staat de schakelaar aan en is het bestand er niet, dan is
    dat tijdens het bouwen van het image misgegaan -- en dat wil je kunnen zien zonder een
    installatielog terug te zoeken dat er niet meer is."""
    try:
        regels = [r.strip() for r in
                  Path(STT_GPU_BOUWLOG).read_text(encoding="utf-8", errors="replace").splitlines()
                  if r.strip()]
    except OSError:
        return "geen bouwlog; deze versie bouwt de GPU-variant niet"
    for r in reversed(regels):                    # de laatste regel die iets zegt
        if "NOTE:" in r or "rror" in r or "annot compile" in r or "egmentation" in r:
            return r[:200]
    return regels[-1][:200] if regels else ""


def stt_bin_kies(c):
    """Het GPU-bestand als dat aan staat, bestaat en zich nog niet misdragen heeft."""
    basis = c.get("bin") or ""
    if not c.get("gpu") or stt_gpu["uit"] or not basis:
        return basis
    return stt_gpu_bestand(c) or basis


def stt_gpu_terug(reden):
    """De GPU-versie viel om: de rest van deze draai op de CPU, met één regel in het log."""
    if not stt_gpu["uit"]:
        stt_gpu["uit"] = True
        stt_gpu["reden"] = reden[:200]
        log(f"whisper op de iGPU mislukt, terug naar de CPU: {reden[:200]}")


STT_MIN_MB = 20          # elk bruikbaar whisper-model is groter; kleiner is een half bestand
stt_gemeld = set()       # welke paden al een keer in het log stonden, anders elke transmissie


def stt_model_bruikbaar(p, vol=None):
    """Half geschreven of mislukt gequantiseerde modellen overslaan.

    Een afgebroken `whisper-quantize` laat een bestand met alleen de eerste lagen achter. Dat
    laadt zonder klacht, is in tientallen milliseconden klaar en levert nooit een callsign op --
    en omdat een gequantiseerd bestand voorrang heeft, verdringt het het goede model. Gezien op
    28-09-2026: ggml-atc-small-q5_0.bin van 9 MB naast het volle bestand van 264 MB.
    """
    try:
        n = p.stat().st_size
    except OSError:
        return False
    reden = ""
    if n < STT_MIN_MB * 1024 * 1024:
        reden = f"maar {n // (1024 * 1024)} MB"
    elif vol and n < vol * 0.25:
        reden = f"maar {n * 100 // vol}% van het volle bestand"
    if not reden:
        return True
    if str(p) not in stt_gemeld:
        stt_gemeld.add(str(p))
        log(f"model overgeslagen ({reden}), lijkt half geschreven: {p}")
    return False


def stt_find_model(fast=False):
    """Het beste model dat op de Pi staat; voor callsigns telt snelheid zwaarder dan detail."""
    for name in (STT_FAST_ORDER if fast else STT_MODEL_ORDER):
        for d in STT_MODEL_DIRS:
            vol = Path(d) / f"ggml-{name}.bin"
            try:
                vn = vol.stat().st_size if vol.is_file() else 0
            except OSError:
                vn = 0
            for q in STT_QUANT:
                p = Path(d) / f"ggml-{name}{q}.bin"
                # een gequantiseerd bestand afzetten tegen het volle; het volle tegen niets
                if p.is_file() and stt_model_bruikbaar(p, vn if q else 0):
                    return str(p)
    return ""


def stt_flags(binpath):
    """Welke vlaggen kent deze whisper.cpp? Scheelt gedoe tussen versies."""
    if binpath in stt_flag_cache:
        return stt_flag_cache[binpath]
    txt = ""
    try:
        h = subprocess.run([binpath, "--help"], capture_output=True, timeout=20)
        txt = (h.stdout + h.stderr).decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        pass
    flags = set(re.findall(r"-{1,2}[A-Za-z][\w-]*", txt))
    stt_flag_cache[binpath] = flags
    return flags


def stt_is_atc(model):
    return "atc" in Path(str(model or "")).stem.lower()


def stt_cfg(fast=False):
    """Config aangevuld met wat er op deze Pi te vinden is; None als er niets te draaien valt."""
    c = dict(CFG.get("stt") or {})
    if not c.get("enabled", True):
        return None
    c["bin"] = c.get("bin") or stt_find_bin()
    m = str((c.get("model_fast") if fast else "") or c.get("model") or "")
    if m and "/" not in m:                       # korte naam mag ook: "small.en"
        m = next((str(Path(d) / f"ggml-{m}.bin") for d in STT_MODEL_DIRS
                  if (Path(d) / f"ggml-{m}.bin").is_file()), m)
    # Een handmatig ingesteld model dat er niet (meer) staat zette het meeluisteren stilzwijgend
    # uit: geen fout, geen regel, alleen "luistert mee" tot in de eeuwigheid. Nu valt hij terug op
    # wat er wel staat en zegt hij in het log wat hij miste.
    if m and not Path(m).is_file():
        if m not in stt_gemeld:
            stt_gemeld.add(m)
            log(f"model uit config.json niet gevonden: {m} -- ik zoek zelf verder")
        m = ""
    c["model"] = m or stt_find_model(fast)
    c["lokaal"] = bool(c["bin"]) and Path(c["model"] or "/").is_file()
    # Staat er een dienst elders, dan hoeft er hier niets te draaien. Andersom ook: valt die
    # dienst weg en staat er wel een model op deze machine, dan doet de Pi het zelf weer.
    if not c["lokaal"] and not stt_remote_url(c):
        return None
    return c


# ---- transcriberen op een andere machine (add-on whisper-atc) --------------------------------
# De Pi houdt het werk dat context nodig heeft: knippen per transmissie, de kandidaten uit wat er
# nu in de lucht is, het lexicon en het leren. Alleen het transcriberen mag elders gebeuren. De
# keuze van de vlaggen blijft hier, zodat de instellingen die we hebben uitgemeten op één plek
# staan; ze gaan als queryparameters mee.
stt_ver = {"url": "", "model": "", "ok": False, "t": 0, "fout": ""}
STT_VER_HERHAAL = 60          # zo vaak hooguit opnieuw kijken of de dienst er is


def stt_remote_url(c=None):
    c = c if c is not None else (CFG.get("stt") or {})
    return str(c.get("remote_url") or "").strip()


def stt_remote_check(url):
    """Draait de dienst, en met welk model? Het model bepaalt hier de keuze van de vlaggen."""
    nu = time.time()
    if stt_ver["url"] == url and nu - stt_ver["t"] < STT_VER_HERHAAL:
        return stt_ver["ok"]
    stt_ver["url"] = url
    stt_ver["t"] = nu
    health = url.rsplit("/", 1)[0] + "/health" if "/" in url.split("//", 1)[-1] else url + "/health"
    try:
        d = json.loads(http_get(health, 8, accept_gzip=False))
        stt_ver["ok"] = bool(d.get("ok"))
        stt_ver["model"] = str(d.get("model") or "")
        stt_ver["fout"] = "" if stt_ver["ok"] else str(d.get("reason") or "geen model")
    except Exception as e:                                  # noqa: BLE001
        if stt_ver["fout"] != str(e)[:60]:
            log(f"transcriptiedienst niet bereikbaar ({health}): {e}")
        stt_ver["ok"] = False
        stt_ver["fout"] = str(e)[:60]
    return stt_ver["ok"]


def stt_remote(wav, url, beam, best, ac, taal, timeout):
    q = urllib.parse.urlencode({"beam": beam, "best_of": best, "ac": ac, "lang": taal})
    req = urllib.request.Request(f"{url}?{q}", data=wav, method="POST",
                                 headers={"Content-Type": "audio/wav", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def stt_status():
    c = stt_cfg()
    if not c:
        return {"ready": False, "model": "", "reason": "geen whisper.cpp of model"}
    url = stt_remote_url(c)
    ver = bool(url) and stt_remote_check(url)
    model = stt_ver["model"] if ver else Path(c["model"]).stem.replace("ggml-", "") if c["lokaal"] else ""
    return {"ready": bool(model), "model": model,
            "ms": stt_state["last_ms"], "queue": stt_state["queue"], "record": stt_rec_on(),
            "learn": stt_leer_on(), "remote": ver,
            "atc": stt_is_atc(model), "slice": float(c.get("slice_seconds", 2.6) or 2.6),
            "fout": stt_state["fout"], "fails": stt_state["fails"], "runs": stt_state["runs"],
            "tijden": stt_state["tijden"], "cpu": stt_state["cpu"],
            "gpu": stt_gpu_status(c)}


def stt_gpu_status(c):
    """Wat er van de GPU-kant te zeggen valt, zonder dat je een log hoeft terug te zoeken."""
    bestand = stt_gpu_bestand(c)
    uit = {"aan": bool(c.get("gpu")) and not stt_gpu["uit"],
           "bestand": bool(bestand),
           "melding": stt_gpu["melding"], "terug": stt_gpu["reden"]}
    if c.get("gpu") and not bestand:
        uit["bouw"] = stt_gpu_bouwreden()
    return uit


def stt_clean(text):
    """Geluidsaanduidingen eruit; whisper verzint bij ruis graag [BLANK_AUDIO] of (wind blowing)."""
    out = []
    for line in text.splitlines():
        line = STT_NOISE.sub(" ", line)
        line = re.sub(r"\s+", " ", line).strip()
        if line and line not in ("-", ".", "...", "…"):
            out.append(line)
    txt = " ".join(out).strip()
    return "" if len(re.sub(r"[^0-9A-Za-z]", "", txt)) < 2 else txt[:400]


# --- luchtvaarttaal: cijfers, standaardfrases en callsigns van toestellen die nu in de lucht zijn ---
# Whisper is op nette spraak getraind, niet op radioverkeer. Twee dingen halen er het meeste uit:
# vooraf de callsigns van toestellen in de buurt meegeven (whisper luistert dan naar die woorden),
# en achteraf de tekst terugvertalen naar hoe het op papier hoort: FL070, baan 18R, QNH 1013.

STT_TELEPHONY = {
    "KLM": "KLM", "KLC": "City", "TRA": "Transavia", "TFL": "Orange", "CND": "Corendon",
    "EZY": "Easy", "EJU": "Alpine", "RYR": "Ryanair", "RUK": "Bluekite", "WZZ": "Wizz Air",
    "BAW": "Speedbird", "SHT": "Shuttle", "DLH": "Lufthansa", "CLH": "Hansaline", "EWG": "Eurowings",
    "AFR": "Air France", "BEL": "Beeline", "SWR": "Swiss", "AUA": "Austrian", "SAS": "Scandinavian",
    "FIN": "Finnair", "IBE": "Iberia", "VLG": "Vueling", "TAP": "Air Portugal", "AEE": "Academy",
    "THY": "Turkish", "PGT": "Sunturk", "ICE": "Iceair", "NAX": "Nordic", "SAS": "Scandinavian",
    "DAL": "Delta", "UAL": "United", "AAL": "American", "ACA": "Air Canada", "UAE": "Emirates",
    "QTR": "Qatari", "ETD": "Etihad", "SIA": "Singapore", "CCA": "Air China", "KAL": "Koreanair",
    "UPS": "UPS", "FDX": "FedEx", "GTI": "Giant", "CLX": "Cargolux", "MPH": "Martinair",
    "NJE": "Fraction", "TJS": "Yellow", "DCS": "Dutch Cargo", "RCH": "Reach", "NAF": "Netherlands Air Force",
    "PH": "Police", "LIF": "Lifeliner",
}
STT_DIGIT_WORDS = {
    "zero": "0", "oh": "0", "nought": "0", "one": "1", "two": "2", "three": "3", "tree": "3",
    "four": "4", "fower": "4", "five": "5", "fife": "5", "six": "6", "seven": "7", "eight": "8",
    "nine": "9", "niner": "9",
    # zoals whisper ze nogal eens opschrijft
    "free": "3", "fee": "3", "won": "1", "ate": "8", "fifer": "5", "niners": "9", "sics": "6",
}
STT_TENS = {"ten": "10", "eleven": "11", "twelve": "12", "thirteen": "13", "fourteen": "14",
            "fifteen": "15", "sixteen": "16", "seventeen": "17", "eighteen": "18", "nineteen": "19",
            "twenty": "20", "thirty": "30", "forty": "40", "fifty": "50", "sixty": "60",
            "seventy": "70", "eighty": "80", "ninety": "90", "hundred": "00", "thousand": "000"}
STT_AFTER = re.compile(r"(runway|level|squawk|heading|qnh|altitude|frequency|channel|track|"
                       r"knots|degrees|wind|contact|descend|climb|turn|flight)$", re.I)
STT_SIDE = {"right": "R", "left": "L", "center": "C", "centre": "C"}
LETTER = re.compile(r"[A-Z]")


def stt_airlines():
    tel = dict(STT_TELEPHONY)
    tel.update({str(k).upper(): str(v) for k, v in ((CFG.get("stt") or {}).get("airlines") or {}).items()})
    return tel


def stt_live(limit=40):
    """Callsigns van toestellen die nu in de lucht zijn, dichtstbij eerst."""
    c = CFG["center"]
    with lock:
        rows = list(snapshot["ac"])
    out = []
    for r in rows:
        cs = re.sub(r"[^0-9A-Za-z]", "", str(r[1] or "")).upper()
        if len(cs) < 3:
            continue
        try:
            d = dist_km(c["lat"], c["lon"], r[2], r[3])
        except (TypeError, ValueError):
            d = 9999
        out.append((d, cs))
    out.sort()
    seen, res = set(), []
    for _d, cs in out:
        if cs not in seen:
            seen.add(cs)
            res.append(cs)
        if len(res) >= limit:
            break
    return res


def stt_prompt():
    """Beginzin voor whisper: jargon plus de callsigns die nu te verwachten zijn."""
    c = CFG.get("stt") or {}
    base = c.get("prompt") or ""
    if not c.get("prompt_callsigns", True):
        return base[:600]
    tel = stt_airlines()
    spoken = []
    for cs in stt_live(int(c.get("prompt_max", 28) or 28)):
        m = re.match(r"^([A-Z]{3})([0-9A-Z]{1,5})$", cs)
        if m and m.group(1) in tel:
            spoken.append(f"{tel[m.group(1)]} {' '.join(m.group(2))}")
        else:
            spoken.append(cs)
    if not spoken:
        return base[:600]
    txt = (base + " Callsigns: " + ", ".join(spoken) + ".").strip()
    return txt[:900]


STT_TOKEN = re.compile(r"[A-Za-z]+[0-9][A-Za-z0-9]*|[0-9]+[A-Za-z][A-Za-z0-9]*|[0-9]+\.[0-9]+"
                       r"|[A-Za-z]+|[0-9]+|[^\sA-Za-z0-9]")
STT_TENS_MULT = {"twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"}
STT_NATO = {"alpha": "A", "alfa": "A", "bravo": "B", "charlie": "C", "delta": "D", "echo": "E",
            "foxtrot": "F", "golf": "G", "hotel": "H", "india": "I", "juliet": "J", "juliett": "J",
            "kilo": "K", "lima": "L", "mike": "M", "november": "N", "oscar": "O", "papa": "P",
            "quebec": "Q", "romeo": "R", "sierra": "S", "tango": "T", "uniform": "U", "victor": "V",
            "whiskey": "W", "whisky": "W", "x-ray": "X", "xray": "X", "yankee": "Y", "zulu": "Z"}


def stt_join(words):
    """Woorden weer aan elkaar, zonder spatie voor leestekens."""
    txt = ""
    for w in words:
        if not txt or re.fullmatch(r"[^\sA-Za-z0-9]", w) or txt.endswith(("(", "-", ".")):
            txt += w
        else:
            txt += " " + w
    return re.sub(r"\s+", " ", txt).strip()


def stt_numbers(text):
    """Cijferwoorden terug naar cijfers, maar alleen waar het radioverkeer is en geen gewone zin."""
    words = STT_TOKEN.findall(text)
    out, i = [], 0
    while i < len(words):
        low = words[i].lower()
        if low in STT_DIGIT_WORDS or low in STT_TENS:
            j, parts, n = i, [], 0
            while j < len(words) and (words[j].lower() in STT_DIGIT_WORDS or words[j].lower() in STT_TENS):
                w = words[j].lower()
                nxt = words[j + 1].lower() if j + 1 < len(words) else ""
                if w in STT_TENS_MULT and nxt in STT_DIGIT_WORDS and nxt not in ("zero", "oh"):
                    parts.append(str(int(STT_TENS[w]) + int(STT_DIGIT_WORDS[nxt])))   # "sixty one" = 61
                    j += 2
                else:
                    parts.append(STT_DIGIT_WORDS.get(w) or STT_TENS[w])
                    j += 1
                n += 1
            prev = out[-1] if out else ""
            nxt = words[j].lower() if j < len(words) else ""
            if n >= 2 or STT_AFTER.search(str(prev)) or nxt in STT_SIDE or nxt.isdigit():
                out.append("".join(parts))
                i = j
                continue
        out.append(words[i])
        i += 1
    return stt_join(out)


def stt_trim(wav, seconds):
    """Alleen de eerste seconden van een wav (16 kHz mono 16 bit) houden."""
    if len(wav) < 44 or wav[:4] != b"RIFF" or seconds <= 0:
        return wav
    keep = 44 + int(seconds * 16000) * 2
    if len(wav) <= keep:
        return wav
    body = len(wav[44:keep])
    return (wav[:4] + struct.pack("<I", 36 + body) + wav[8:40]
            + struct.pack("<I", body) + wav[44:keep])


def stt_spoken(cs, tel):
    """Callsign zoals het klinkt: TRA6215 -> 'transavia 6 2 1 5'."""
    m = re.match(r"^([A-Z]{3})([0-9A-Z]{1,5})$", cs)
    if not m:
        return cs.lower()
    name = tel.get(m.group(1), m.group(1))
    return (name + " " + " ".join(m.group(2))).lower()


def stt_cands(param=None):
    """Toestellen om uit te kiezen: precies wat de pagina meestuurt (wat er op het scherm staat).
    Alleen als de pagina niets meestuurt wordt teruggevallen op alles wat in de lucht zit."""
    if param is None:
        return stt_live(200)
    out = []
    for cs in re.split(r"[,\s]+", str(param).upper()):
        cs = re.sub(r"[^0-9A-Z]", "", cs)
        if 3 <= len(cs) <= 8:
            out.append(cs)
    return out[:200]


def stt_nato(word):
    """Spelalfabet, ook als whisper het net verkeerd hoort: alta/altar -> A, tanga -> T."""
    low = word.lower()
    if low in STT_NATO:
        return STT_NATO[low]
    if len(low) < 4:
        return ""
    for name, letter in STT_NATO.items():
        if abs(len(name) - len(low)) <= 1 and stt_near(low, name) <= 1:
            return letter
    return ""


def stt_key(text):
    """Tekst -> cijfers en losse letters, zoals een callsign klinkt. 'six two one five' -> '6215'."""
    text = re.sub(r"(?<=[0-9])[.\-](?=[0-9])", " ", str(text))     # "2.3" en "6-1" zijn twee cijfers
    words = STT_TOKEN.findall(stt_numbers(text))
    out = []
    for w in words:
        low = w.lower()
        if w.isdigit():
            out.append(("d", w))
        elif low in STT_DIGIT_WORDS:
            out.append(("d", STT_DIGIT_WORDS[low]))      # los cijferwoord: "three alpha" -> 3A
        elif len(w) == 1 and w.isalpha():
            out.append(("d", w.upper()))
        elif stt_nato(w):
            out.append(("d", stt_nato(w)))
        else:
            out.append(("w", low))
    return out


def stt_near(a, b):
    """Aantal tekens verschil, maar stopt zodra het er meer dan één zijn."""
    if a == b:
        return 0
    if abs(len(a) - len(b)) > 1:
        return 2
    if len(a) == len(b):
        d = sum(x != y for x, y in zip(a, b))
        return d if d <= 1 else 2
    short, long_ = (a, b) if len(a) < len(b) else (b, a)
    for i in range(len(long_)):                     # één teken weggevallen of erbij
        if long_[:i] + long_[i + 1:] == short:
            return 1
    return 2



def stt_namehit(name, icao, words, wordset):
    """Hoort deze maatschappij in de tekst? Ook als whisper hem verminkt: 'sun turkish' voor
    Sunturk, 's avia' en 'tuzavia' voor Transavia, 'elbair' voor El Al."""
    delen = name.split()
    if any(d in wordset for d in delen) or icao.lower() in wordset:
        return True
    kaal = name.replace(" ", "")
    for i, w in enumerate(words):
        if len(w) < 4 and i + 1 < len(words):
            w = w + words[i + 1]                 # 's avia' -> 'savia'
        if len(w) < 4:
            continue
        if w == kaal or stt_near(w, kaal) <= 1:
            return True
        if len(kaal) >= 5 and (w.startswith(kaal[:4]) or kaal.startswith(w[:4])) and abs(len(w) - len(kaal)) <= 3:
            return True                          # 'sunturkish' bij 'sunturk', 'transavia' bij 'transavi'
    return False


def stt_who(text, cands):
    """Beste callsign voor deze transmissie, met een maat voor hoe zeker dat is."""
    if not text or not cands:
        return None
    tel = stt_airlines()
    toks = stt_key(text)
    words = [w for k, w in toks if k == "w"]
    wordset = set(words)
    # alle aaneengesloten reeksen cijfers/letters, met het woord dat eraan voorafgaat
    runs = []
    i = 0
    while i < len(toks):
        if toks[i][0] == "d":
            j = i
            buf = ""
            while j < len(toks) and toks[j][0] == "d":
                buf += toks[j][1]
                j += 1
            runs.append((buf, words and toks[i - 1][1] if i and toks[i - 1][0] == "w" else "",
                         i == 0 or i == 1))
            i = j
        else:
            i += 1
    part = max(2, int((CFG.get("stt") or {}).get("who_partial", 2) or 2))
    scores = []
    for cs in cands:
        m = re.match(r"^([A-Z]{3})([0-9A-Z]{1,5})$", cs)
        if not m:
            continue
        icao, tail = m.group(1), m.group(2)
        name = tel.get(icao, icao).lower()
        namehit = stt_namehit(name, icao, words, wordset)
        best = 0.0
        for buf, before, early in runs:
            # elke regel levert een score; de gunstigste telt
            opts = []
            if buf == tail:
                opts.append(2.0 + 0.8 * len(tail))                       # precies goed
            if len(tail) >= 3 and stt_near(buf, tail) == 1:
                opts.append(0.9 + 0.5 * len(tail))                       # één teken ernaast
            if buf != tail and tail.endswith(buf) and len(buf) >= (part if LETTER.search(buf) else part + 1):
                # afgekort: zodra het contact staat laat de verkeersleiding het begin weg.
                # Met een letter erin (23A -> "3A") mag het korter dan bij kale cijfers.
                opts.append(1.0 + 1.0 * len(buf))
            if buf != tail and buf.endswith(tail) and len(tail) >= part + 1:
                opts.append(0.4 + 0.5 * len(tail))                       # er staat iets voor geplakt
            if buf != tail and buf.startswith(tail) and len(tail) >= part + 1:
                opts.append(0.5 + 0.6 * len(tail))                       # er is doorgeteld erachter
            if buf != tail and tail.startswith(buf) and len(buf) >= part + 1:
                opts.append(0.5 + 0.6 * len(buf))                        # het staartje ging verloren
            if not opts:
                continue
            sc = max(opts)
            if before and before in name.split():
                sc += 1.5
            if early:
                sc += 0.4               # aan het begin van de transmissie: waarschijnlijker
            best = max(best, sc)
        if namehit:
            best += 2.0 if best else 1.2
        if best:
            scores.append((best, cs))
    if not scores:
        return None
    scores.sort(reverse=True)
    top, cs = scores[0]
    second = scores[1][0] if len(scores) > 1 else 0.0
    need = float((CFG.get("stt") or {}).get("who_min", 3.0) or 3.0)
    if top < need or top - second < 0.8:
        return None
    conf = max(0.0, min(1.0, (top - max(second, need - 1)) / 4))
    return {"cs": cs, "score": round(top, 2), "conf": round(conf, 2),
            "alts": [c for _s, c in scores[1:4]]}


# ---------------------------------------------------------------- leren van eigen radio
# Elke transmissie wordt bewaard met wat whisper ervan maakte. Wat jij corrigeert levert twee dingen:
# een cijfer (hoeveel procent van de woorden klopt) en een woordenboekje met fouten die steeds
# terugkomen, dat meteen op nieuwe transmissies wordt toegepast. De opnames plus jouw tekst vormen
# samen een dataset waarmee later een model bijgetraind kan worden, door jou of door iemand anders.

STT_DIR = CACHE / "stt"
stt_lex_lock = threading.Lock()
stt_lex_cache = {"t": 0, "map": {}}


# De opnameschakelaar staat in de pagina, niet in config.json: config.json beheer je met de hand
# (daar staan ook de sleutels in) en die wil je niet door een knop laten overschrijven. Deze stand
# staat dus apart en overstemt wat er in de config staat.
stt_rec_cache = {"t": 0, "on": None}


def stt_rec_on():
    if time.time() - stt_rec_cache["t"] < 5 and stt_rec_cache["on"] is not None:
        return stt_rec_cache["on"]
    uit = None
    try:
        uit = bool(json.loads((STT_DIR / "record.json").read_text(encoding="utf-8")).get("on"))
    except (OSError, ValueError, AttributeError):
        uit = None
    if uit is None:
        uit = bool((CFG.get("stt") or {}).get("record", True))
    stt_rec_cache.update({"t": time.time(), "on": uit})
    return uit


def stt_rec_set(on):
    STT_DIR.mkdir(parents=True, exist_ok=True)
    (STT_DIR / "record.json").write_text(json.dumps({"on": bool(on), "t": time.time()}),
                                         encoding="utf-8")
    stt_rec_cache.update({"t": 0, "on": None})
    log(f"opnemen {'aan' if on else 'uit'}")
    return stt_rec_on()


stt_leer_cache = {"t": 0, "on": None}


def stt_leer_on():
    """Leert de herkenning uit zijn eigen zekere treffers? Zelfde opzet als de opnameschakelaar."""
    if time.time() - stt_leer_cache["t"] < 5 and stt_leer_cache["on"] is not None:
        return stt_leer_cache["on"]
    uit = None
    try:
        uit = bool(json.loads((STT_DIR / "learn.json").read_text(encoding="utf-8")).get("on"))
    except (OSError, ValueError, AttributeError):
        uit = None
    if uit is None:
        uit = bool((CFG.get("stt") or {}).get("learn", True))
    stt_leer_cache.update({"t": time.time(), "on": uit})
    return uit


def stt_leer_set(on):
    STT_DIR.mkdir(parents=True, exist_ok=True)
    (STT_DIR / "learn.json").write_text(json.dumps({"on": bool(on), "t": time.time()}),
                                        encoding="utf-8")
    stt_leer_cache.update({"t": 0, "on": None})
    log(f"automatisch leren {'aan' if on else 'uit'}")
    return stt_leer_on()


def stt_identify(wav, cands=None, hz=0):
    """Wie praat hier? Werkt per plakje van een paar seconden dat de pagina opstuurt."""
    c = CFG.get("stt") or {}
    tel = stt_airlines()
    lst = stt_cands(cands)
    base = str(c.get("prompt") or "")[:200].rsplit(" ", 1)[0]
    prompt = (base + " Callsigns: "
              + ", ".join(stt_spoken(cs, tel) for cs in lst[:int(c.get("prompt_max", 28) or 28)])).strip()
    res = stt_transcribe(stt_trim(wav, float(c.get("who_seconds", 6) or 6)),
                         fast=True, prompt=prompt[:900])
    if not res.get("ok"):
        return res
    raw = res.get("raw", "")
    tekst = stt_apply_lexicon(raw)
    who = stt_who(tekst, lst)
    buiten = False
    if not who and c.get("who_offscreen", True) and cands is not None:
        # niets in beeld dat past: dan alsnog kijken naar alles wat de Pi in de lucht ziet.
        # Zo'n toestel heeft geen datablok om te laten oplichten, maar het callsign is wel nieuws.
        ruim = [cs for cs in stt_live(2000) if cs not in set(lst)]
        who = stt_who(tekst, ruim)
        buiten = bool(who)
    out = {"ok": True, "raw": raw, "ms": res.get("ms", 0), "model": res.get("model", ""),
           "hz": hz, "cands": len(lst)}
    if who:
        out.update(who)
        out["offscreen"] = buiten
        # Licht automatisch leren. Een treffer waar geen twijfel over is, is hetzelfde bewijs als
        # een correctie van jou, alleen zonder mens erbij - dus telt hij licht. De voorwaarden:
        # de herkenning is zeker (conf boven de drempel), er was geen tweede kandidaat in de buurt,
        # en het toestel stond in beeld (buiten beeld is de kandidatenlijst duizenden lang en
        # wordt een toevallige gelijkenis te makkelijk). Er zijn er dan nog altijd drie nodig
        # voor hetzelfde woord voordat de vervanging blind wordt toegepast.
        if (stt_leer_on() and not buiten and not who.get("alts")
                and float(who.get("conf") or 0) >= float(c.get("learn_conf", 0.9) or 0.9)):
            try:
                stt_learn({"fix": who["cs"], "raw": raw}, gewicht=1, bron="auto")
            except Exception as e:  # noqa: BLE001
                log(f"automatisch leren mislukt: {e}")
    return out


# Hoeveel er gehoord is en hoeveel daarvan bewaard, zodat het leerscherm eerlijk kan zeggen dat
# zijn lijst een selectie is en geen doorsnee.
stt_tel = {"gehoord": 0, "bewaard": 0}


def stt_bewaren(res):
    """Is deze transmissie de moeite van het bewaren waard?

    Alles bewaren vult de schijf: op Schiphol Tower gaan er honderden transmissies per uur langs.
    En het leerscherm heeft er weinig aan, want een treffer waar geen twijfel over is heeft geen
    mens nodig - die leert het systeem inmiddels zelf. Wat je wél wilt nakijken zijn de gevallen
    waar het misging of twijfelde. Van de zekere treffers gaat er één op de tien mee, zodat je
    kunt zien of die inderdaad kloppen.
    """
    c = CFG.get("stt") or {}
    if str(c.get("record_keep") or "leerzaam").lower() == "alles":
        return True
    if not res.get("cs"):
        return True                                   # niemand herkend: juist interessant
    if res.get("alts"):
        return True                                   # er was een tweede kandidaat dichtbij
    if float(res.get("conf") or 0) < float(c.get("learn_conf", 0.9) or 0.9):
        return True                                   # niet zeker genoeg
    n = max(1, int(c.get("record_sample", 10) or 10))
    return random.randint(1, n) == 1                  # steekproef uit de zekere treffers


def stt_save(wav, res, hz, label):
    """Opname + wat er van gemaakt is bewaren. Geeft het id terug, of "" als bewaren uitstaat."""
    if not stt_rec_on():
        return ""
    try:
        day = time.strftime("%Y-%m-%d")
        sid = time.strftime("%H%M%S") + "-" + f"{random.randint(100, 999)}"
        d = STT_DIR / day
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{sid}.wav").write_bytes(wav)
        meta = {"id": f"{day}/{sid}", "t": time.time(), "hz": hz, "label": label,
                "raw": res.get("raw", ""), "cs": res.get("cs", ""), "conf": res.get("conf", 0),
                "alts": res.get("alts", []), "model": res.get("model", ""), "ms": res.get("ms", 0),
                "fix": None, "fix_t": 0}
        (d / f"{sid}.json").write_text(json.dumps(meta), encoding="utf-8")
        if random.random() < 0.05:
            stt_prune()
        return meta["id"]
    except OSError as e:
        log(f"opname bewaren mislukt: {e}")
        return ""


def stt_prune():
    """Oude opnames opruimen; gecorrigeerde regels blijven altijd staan, die zijn het waardevolst."""
    c = CFG.get("stt") or {}
    days = int(c.get("record_days", 30) or 30)
    cap = int(c.get("record_max_mb", 500) or 500) * 1024 * 1024
    files = sorted(STT_DIR.glob("*/*.json"))
    cutoff = time.time() - days * 86400
    total = 0
    keep = []
    for j in reversed(files):                 # nieuwste eerst
        w = j.with_suffix(".wav")
        try:
            meta = json.loads(j.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        size = w.stat().st_size if w.is_file() else 0
        if meta.get("fix"):
            keep.append(j)
            continue
        if meta.get("t", 0) < cutoff or total + size > cap:
            for f in (j, w):
                try:
                    f.unlink()
                except OSError:
                    pass
            continue
        total += size
        keep.append(j)
    for d in STT_DIR.glob("*"):
        if d.is_dir() and not any(d.iterdir()):
            try:
                d.rmdir()
            except OSError:
                pass


def stt_path(sid, ext):
    """Pad bij een id, met de deur op slot: alleen jjjj-mm-dd/hhmmss-nnn telt."""
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}/\d{6}-\d{3}", str(sid) or ""):
        return None
    p = (STT_DIR / f"{sid}{ext}").resolve()
    return p if STT_DIR.resolve() in p.parents else None


def stt_items(limit=200, todo=False):
    out = []
    for j in sorted(STT_DIR.glob("*/*.json"), reverse=True):
        try:
            meta = json.loads(j.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if todo and meta.get("fix"):
            continue
        out.append(meta)
        if len(out) >= limit:
            break
    return out


def stt_score():
    """Hoe vaak klopt het callsign, per model, over alles wat jij hebt nagekeken."""
    per = {}
    items = stt_items(2000)
    for m in items:
        if m.get("fix") is None:
            continue
        key = m.get("model") or "?"
        p = per.setdefault(key, {"model": key, "n": 0, "ok": 0, "wrong": 0, "missed": 0, "quiet": 0})
        said = str(m.get("fix") or "").strip().upper()
        got = str(m.get("cs") or "").strip().upper()
        p["n"] += 1
        if not said:
            p["quiet"] += 1                     # niets te herkennen (geen callsign in de transmissie)
            if got:
                p["wrong"] += 1
        elif got == said:
            p["ok"] += 1
        elif got:
            p["wrong"] += 1
        else:
            p["missed"] += 1
    out = []
    for p in per.values():
        real = p["n"] - p["quiet"]
        p["pct"] = round(100 * p["ok"] / real) if real else None
        out.append(p)
    out.sort(key=lambda x: -x["n"])
    rijen = stt_lex_rows()
    return {"models": out, "total": len(items),
            "done": sum(1 for m in items if m.get("fix") is not None),
            "lexicon": len(stt_lexicon()), "lexrows": rijen,
            "gehoord": stt_tel["gehoord"], "bewaard": stt_tel["bewaard"],
            "keep": str((CFG.get("stt") or {}).get("record_keep") or "leerzaam"),
            "lexauto": sum(1 for r in rijen if r["auto"] >= r["n"]),
            "learn": stt_leer_on()}


# --- woordenboekje: fouten die steeds terugkomen ------------------------------------------------

def stt_learn(meta, gewicht=2, bron="hand"):
    """Uit een callsign halen welk woord voor de maatschappij werd aangezien.

    Twee bronnen. Jouw correctie in het leerscherm weegt twee: je hebt de opname gehoord, maar
    één los geval mag nog geen blinde vervanging opleveren - een woord als "trans" komt in van
    alles voor. Een zekere treffer van de herkenning zelf weegt één: daar is geen mens bij
    geweest, dus er zijn er drie nodig. Corrigeer jij een woord dat eerder anders geleerd was,
    dan zakt die oude koppeling - anders zet een fout zich vast en komt hij er nooit meer uit.
    """
    said = str(meta.get("fix") or "").strip().upper()
    raw = str(meta.get("raw") or "")
    m = re.match(r"^([A-Z]{3})([0-9A-Z]{1,5})$", said)
    if not m or not raw:
        return
    tel = stt_airlines()
    if m.group(1) not in tel:
        # Zonder telefonienaam valt er niets te leren: dan zou "sunexpress" vervangen worden door
        # "Sxs", en daar hoort geen mens dat ooit zeggen. Zet de naam in config.json onder
        # stt.airlines en vanaf dan leert hij hem wel.
        return
    name = tel[m.group(1)].lower()
    parts = set(name.split())
    toks = stt_key(raw)
    pairs = []
    for i, (kind, val) in enumerate(toks):
        if kind != "d" or not i:
            continue
        buf, j = "", i
        while j < len(toks) and toks[j][0] == "d":
            buf += toks[j][1]
            j += 1
        if stt_near(buf, m.group(2)) > 1:
            continue                                  # dit is niet het nummer van dit toestel
        before = toks[i - 1][1]
        if before and before not in parts and len(before) >= 3 and before.isalpha():
            pairs.append((before, name.split()[0].capitalize()))
        break
    if not pairs:
        return
    path = STT_DIR / "lexicon.json"
    with stt_lex_lock:
        try:
            db = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            db = {}
        for wrong, right in pairs:
            row = db.setdefault(wrong, {})
            row[right] = int(row.get(right, 0)) + gewicht
            if bron == "auto":
                row["#auto"] = int(row.get("#auto", 0)) + gewicht
            else:
                # tegenbewijs: wat dit woord eerder anders geleerd had, weegt nu minder
                for ander in list(row):
                    if ander != right and not ander.startswith("#"):
                        row[ander] = int(row[ander]) - 1
                        if row[ander] <= 0:
                            del row[ander]
        STT_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(db), encoding="utf-8")
        stt_lex_cache["t"] = 0


def stt_lexicon():
    """De vervangingen die vaak genoeg zijn gezien om ze blind toe te passen."""
    c = CFG.get("stt") or {}
    if not c.get("lexicon", True):
        return {}
    if time.time() - stt_lex_cache["t"] < 30:
        return stt_lex_cache["map"]
    need = max(2, int(c.get("lexicon_min", 3) or 3))
    out = {}
    try:
        db = json.loads((STT_DIR / "lexicon.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        db = {}
    for wrong, opts in db.items():
        if not isinstance(opts, dict):
            continue
        opts = {k: v for k, v in opts.items() if not str(k).startswith("#")}
        if not opts:
            continue
        best = max(opts.items(), key=lambda kv: kv[1])
        rest = sum(opts.values()) - best[1]
        if best[1] >= need and best[1] > rest * 2:        # één duidelijke winnaar
            out[wrong.lower()] = best[0]
    stt_lex_cache.update({"t": time.time(), "map": out})
    return out


def stt_lex_rows():
    """Het woordenboekje zoals het leerscherm het toont: wat wordt waarin veranderd, hoe vaak het
    gezien is, hoeveel daarvan het systeem zelf leerde, en of het al blind wordt toegepast."""
    need = max(2, int((CFG.get("stt") or {}).get("lexicon_min", 3) or 3))
    try:
        db = json.loads((STT_DIR / "lexicon.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    uit = []
    for wrong, opts in db.items():
        if not isinstance(opts, dict):
            continue
        auto = int(opts.get("#auto", 0) or 0)
        opts = {k: v for k, v in opts.items() if not str(k).startswith("#")}
        if not opts:
            continue
        best = max(opts.items(), key=lambda kv: kv[1])
        rest = sum(opts.values()) - best[1]
        uit.append({"wrong": wrong, "right": best[0], "n": best[1], "auto": min(auto, best[1]),
                    "aan": bool(best[1] >= need and best[1] > rest * 2),
                    "anders": sorted((k for k in opts if k != best[0]))})
    uit.sort(key=lambda r: (-r["n"], r["wrong"]))
    return uit


def stt_lex_del(wrong):
    """Een geleerde vervanging weggooien. Komt hij later terug, dan begint hij weer bij nul."""
    path = STT_DIR / "lexicon.json"
    with stt_lex_lock:
        try:
            db = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return False
        if wrong not in db:
            return False
        del db[wrong]
        path.write_text(json.dumps(db), encoding="utf-8")
        stt_lex_cache["t"] = 0
    return True


def stt_apply_lexicon(text):
    lex = stt_lexicon()
    if not lex:
        return text
    return re.sub(r"[A-Za-z][A-Za-z0-9.]*",
                  lambda m: lex.get(m.group(0).lower(), m.group(0)), text)


def stt_export():
    """Alles wat jij hebt gecorrigeerd als zip: wavs plus metadata.jsonl, klaar voor trainen."""
    buf = io.BytesIO()
    n = 0
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        lines = []
        for m in stt_items(5000):
            fix = m.get("fix")
            w = stt_path(m.get("id", ""), ".wav")
            if fix is None or not w or not w.is_file():
                continue
            name = "data/" + str(m["id"]).replace("/", "_") + ".wav"
            z.write(w, name)
            lines.append(json.dumps({"file_name": name, "callsign": fix,
                                     "whisper": m.get("raw", ""), "guess": m.get("cs", ""),
                                     "t": m.get("t"), "hz": m.get("hz"),
                                     "model": m.get("model", "")}))
            n += 1
            if buf.tell() > 400 * 1024 * 1024:
                break
        z.writestr("metadata.jsonl", "\n".join(lines) + "\n")
        z.writestr("LEESMIJ.txt",
                   "FlightTrackNL - eigen ATC-opnames met gecorrigeerde tekst.\n"
                   f"{n} fragmenten, 16 kHz mono wav.\n"
                   "metadata.jsonl: file_name + callsign (door jou nagekeken), whisper (ruwe tekst),\n"
                   "guess (wat de herkenner ervan maakte).\n"
                   "Vorm: Hugging Face audiofolder; datasets.load_dataset('audiofolder', data_dir=...).\n"
                   "Alleen voor eigen gebruik: het gaat om radioverkeer dat niet voor jou bestemd is.\n")
    return buf.getvalue(), n


def stt_transcribe(wav, fast=False, prompt=None):
    """wav (16 kHz mono, 16 bit) -> tekst. Geeft altijd een dict terug, ook bij een fout."""
    c = stt_cfg(fast)
    if not c:
        return {"ok": False, "reason": "uit"}
    if stt_state["queue"] >= int(c.get("max_queue", 1) or 1):
        stt_state["skipped"] += 1
        return {"ok": True, "raw": "", "cs": "", "busy": True}   # bezet: overslaan, niet opsparen
    stt_state["queue"] += 1
    tmp = ""
    try:
        with stt_sem:
            with tempfile.NamedTemporaryFile(prefix="stt", suffix=".wav", delete=False) as f:
                f.write(wav)
                tmp = f.name
            binpath = stt_bin_kies(c)
            gpu_poging = binpath != c["bin"]
            fl = stt_flags(binpath)
            beam = 1 if fast else int(c.get("beam", 1) or 1)
            cmd = [binpath, "-m", c["model"], "-f", tmp, "-l", c.get("language") or "en",
                   "-nt", "-t", str(int(c.get("threads", 4) or 4)), "-bs", str(beam)]
            # Whisper vult elk fragment aan tot 30 seconden en rekent dat venster altijd helemaal
            # door, ook bij een transmissie van vier seconden. Inkorten scheelt dus ruwweg
            # evenredig rekentijd -- bij gewone modellen zonder verlies.
            #
            # Bij een bijgetraind ATC-model NIET. Gemeten 28-09-2026 op de Pi, 10 transmissies:
            # vol 9094 ms, ac1280 7517 (2 callsigns fout), ac1024 5959 (3 fout), ac768 4299
            # (4 fout). Geen knik, en niet eens monotoon -- 896 doet het beter dan 1024. Dat is
            # wat je krijgt als je de positie-inbedding bijsnijdt van een model dat daar nooit op
            # getraind is. Laat audio_ctx_atc dus op 0; zie docs/ontwerp/meelezen-snelheid.md.
            ac = c.get("audio_ctx", 512) if fast else c.get("audio_ctx_full", 0)
            if stt_is_atc(c["model"]):
                ac = c.get("audio_ctx_atc", 0)     # geldt voor beide stappen
            if ac is None:
                ac = 0
            opt = [("-bo", 1 if fast else c.get("best_of", 1)), ("-mc", c.get("max_context", 0)),
                   ("-ac", ac),
                   ("-et", c.get("entropy", 2.6)), ("-lpt", c.get("logprob", -1.0))]
            for flag, val in opt:                      # per versie verschillend; alleen wat hij kent
                if val is None or flag not in fl or (flag == "-ac" and not val):
                    continue
                cmd += [flag, str(val)]
            for flag in ("-sns", "--suppress-nst"):    # geen [wind], (static) en ander verzinsel
                if flag in fl:
                    cmd.append(flag)
                    break
            ptxt = stt_prompt() if prompt is None else prompt
            if stt_is_atc(c["model"]):
                ptxt = ""            # een bijgetraind ATC-model wordt er niet beter van (gemeten)
            if ptxt and "--prompt" in fl:
                cmd += ["--prompt", ptxt]

            def draai():
                """Eén poging; geeft het resultaat en de laatste zinnige regel van stderr."""
                t0 = time.time()
                res = subprocess.run(cmd, capture_output=True,
                                     timeout=float(c.get("timeout_s", 90)))
                stt_state["last_ms"] = int((time.time() - t0) * 1000)
                uit = (res.stderr or b"").decode("utf-8", "replace")
                vk = STT_VK_RE.search(uit)          # hier, niet erna: bij terugval naar de CPU
                if vk:                              # is de Vulkan-regel anders verdwenen en weet
                    stt_gpu["melding"] = vk.group(0)[:200]   # je niet meer wat hij wel zag
                regels = [l.strip() for l in uit.strip().splitlines()
                          if l.strip() and not STT_RUIS_RE.match(l)]
                return res, uit, (regels[-1] if regels
                                  else f"afgesloten met code {res.returncode}")

            try:
                r, foutuit, laatste = draai()
                # De GPU-versie valt om als de driver niet meewerkt -- en dat merk je pas hier,
                # want vk::createInstance gebeurt bij het starten. Dan meteen opnieuw op de CPU:
                # deze transmissie hoeft niet verloren te gaan aan een proef.
                if r.returncode != 0 and gpu_poging:
                    stt_gpu_terug(laatste)
                    cmd[0] = c["bin"]            # zelfde vlaggen, zelfde versie, ander bestand
                    r, foutuit, laatste = draai()
            except subprocess.TimeoutExpired:
                stt_state["fails"] += 1
                return {"ok": False, "reason": "te traag"}
            stt_state["runs"] += 1
            tijden = stt_tijden(foutuit)
            sys = STT_SYS_RE.search(foutuit)
            if sys:
                stt_state["cpu"] = sys.group(1)[:300]
            if tijden:
                stt_state["tijden"] = tijden
                if stt_state["runs"] <= 3:
                    # Drie keer in het log, zodat het er staat zonder dat je de API hoeft te
                    # bevragen, en daarna stil -- dit hoort geen vaste regel per transmissie te
                    # worden. De stand blijft opvraagbaar in /api/channels.
                    log("whisper tijden: "
                        + ", ".join(f"{k} {v} ms" for k, v in tijden.items())
                        + f" (met opstarten {stt_state['last_ms']} ms, "
                        + f"{int(c.get('threads', 4) or 4)} kernen)")
                    if stt_state["cpu"]:
                        log(f"whisper rekent met: {stt_state['cpu']}")
                    if stt_gpu["melding"]:
                        log(f"whisper op de iGPU: {stt_gpu['melding']}")
            if r.returncode != 0:
                stt_state["fails"] += 1
                stt_state["fout"] = laatste[:200]
                stt_state["fout_t"] = time.time()
                log(f"whisper mislukt ({r.returncode}): {laatste}")
                return {"ok": False, "reason": "whisper gaf een fout", "fout": laatste[:200]}
            stt_state["fout"] = ""
            raw = stt_clean(r.stdout.decode("utf-8", "replace"))
            return {"ok": True, "raw": raw,
                    "model": Path(c["model"]).stem.replace("ggml-", ""), "ms": stt_state["last_ms"]}
    finally:
        stt_state["queue"] -= 1
        if tmp:
            try:
                os.unlink(tmp)
            except OSError:
                pass


# ---------------------------------------------------------------- weer
# Drie bronnen, elk met een eigen tempo, in één lus. Alles wordt bewaard zoals het binnenkomt
# en pas bij het uitserveren uitgedund, zodat een bron die even wegvalt het beeld niet leegmaakt.

weer = {"metar": [], "sigmet": [], "rain": {"host": "", "frames": []},
        "t": {"metar": 0, "sigmet": 0, "rain": 0}, "fout": {}}
weer_lock = threading.Lock()
rain_cache = collections.OrderedDict()      # "frame/z/x/y" -> bytes


def weer_cfg():
    c = dict(CFG.get("weather") or {})
    return c if c.get("enabled", True) else None


def weer_box(km):
    """Venster van km rond het middelpunt, als lat0,lon0,lat1,lon1."""
    c = CFG["center"]
    dlat = km / 110.6
    dlon = dlat / max(0.2, math.cos(math.radians(c["lat"])))
    return (c["lat"] - dlat, c["lon"] - dlon, c["lat"] + dlat, c["lon"] + dlon)


def weer_metar():
    # Een ruim venster levert minder op, niet meer: de bron kapt de lijst af, en dan vallen juist
    # de kleine velden dichtbij eruit. Gemeten op 28-09: met heel West-Europa in het venster kwamen
    # er 252 stations terug zonder EHRD, EHEH en EHBK; met 260 km komt alles binnen het venster mee.
    c = weer_cfg()
    b = weer_box(float(c.get("metar_km", 260) or 260))
    url = c["metar_url"].format(box=f"{b[0]:.2f},{b[1]:.2f},{b[2]:.2f},{b[3]:.2f}")
    rows = json.loads(http_get(url, 25))
    home = CFG["center"]
    out = []
    for r in rows:
        if r.get("lat") is None or r.get("lon") is None:
            continue
        out.append({
            "icao": r.get("icaoId") or "", "naam": (r.get("name") or "").split(",")[0],
            "lat": r["lat"], "lon": r["lon"], "t": r.get("obsTime") or 0,
            "wdir": r.get("wdir"), "wspd": r.get("wspd"), "wgst": r.get("wgst"),
            "vis": r.get("visib"), "temp": r.get("temp"), "dewp": r.get("dewp"),
            "qnh": r.get("altim"), "wx": (r.get("wxString") or "").strip(),
            "cover": r.get("cover") or "", "cat": r.get("fltCat") or "",
            "clouds": [{"c": x.get("cover"), "b": x.get("base")} for x in (r.get("clouds") or [])
                       if isinstance(x, dict)][:4],
            "raw": (r.get("rawOb") or "").strip(),
            "km": round(dist_km(home["lat"], home["lon"], r["lat"], r["lon"])),
        })
    out.sort(key=lambda x: x["km"])
    return out[:int(c.get("metar_max", 60) or 60)]


def weer_sigmet():
    """Internationale SIGMET's; de Amerikaanse bron (airsigmet) dekt Europa niet.

    Ruimer venster dan de METAR's, maar niet grenzeloos: een gebied met onweer op FL350 boven
    Duitsland verklaart omvliegen dat je hier ziet, een gebied boven Spanje niet. Het bereik van
    de plot zelf is geen goede maat -- dat loopt hier tot ver over de 1500 km.
    """
    c = weer_cfg()
    rows = json.loads(http_get(c["sigmet_url"], 30))
    lat0, lon0, lat1, lon1 = weer_box(float(c.get("sigmet_km", 600) or 600))
    out = []
    for r in rows:
        pts = [(p.get("lat"), p.get("lon")) for p in (r.get("coords") or []) if isinstance(p, dict)]
        pts = [(a, o) for a, o in pts if a is not None and o is not None]
        if len(pts) < 3:
            continue
        la = [p[0] for p in pts]
        lo = [p[1] for p in pts]
        if max(la) < lat0 or min(la) > lat1 or max(lo) < lon0 or min(lo) > lon1:
            continue                                     # ligt buiten ons venster
        out.append({"fir": r.get("firId") or "", "hazard": r.get("hazard") or "",
                    "qual": r.get("qualifier") or "", "base": r.get("base"), "top": r.get("top"),
                    "van": r.get("validTimeFrom") or 0, "tot": r.get("validTimeTo") or 0,
                    "dir": r.get("dir"), "spd": r.get("spd"),
                    "pts": [[round(a, 3), round(o, 3)] for a, o in pts],
                    "raw": (r.get("rawSigmet") or "").strip()[:400]})
    return out


def weer_rain():
    c = weer_cfg()
    d = json.loads(http_get(c["rain_index"], 20))
    r = d.get("radar") or {}
    frames = []
    for soort in ("past", "nowcast"):
        for f in (r.get(soort) or []):
            p = str(f.get("path") or "")
            if re.fullmatch(r"/v2/radar/[A-Za-z0-9_-]{1,40}", p):   # alleen wat wij zelf ophalen
                frames.append({"t": int(f.get("time") or 0), "id": p.rsplit("/", 1)[-1],
                               "nu": soort == "nowcast"})
    frames.sort(key=lambda f: f["t"])
    return {"host": str(d.get("host") or ""), "frames": frames}


def weer_loop():
    """Elke bron op zijn eigen tempo; een mislukte ronde laat de vorige gegevens staan."""
    taken = (("metar", weer_metar, "metar_min", 5), ("sigmet", weer_sigmet, "sigmet_min", 10),
             ("rain", weer_rain, "rain_min", 4))
    while True:
        c = weer_cfg()
        if not c:
            time.sleep(60)
            continue
        nu = time.time()
        for naam, fn, sleutel, standaard in taken:
            if nu - weer["t"][naam] < float(c.get(sleutel, standaard) or standaard) * 60:
                continue
            try:
                data = fn()
                with weer_lock:
                    weer[naam] = data
                    weer["t"][naam] = nu
                    weer["fout"].pop(naam, None)
            except Exception as e:                            # noqa: BLE001
                weer["t"][naam] = nu - 60 * float(c.get(sleutel, standaard) or standaard) + 60
                if weer["fout"].get(naam) != str(e)[:80]:     # niet elke ronde dezelfde regel
                    weer["fout"][naam] = str(e)[:80]
                    log(f"weer: {naam} ophalen mislukt: {e}")
        time.sleep(20)


def weer_json():
    with weer_lock:
        return {"metar": weer["metar"], "sigmet": weer["sigmet"], "rain": weer["rain"],
                "t": dict(weer["t"]), "fout": dict(weer["fout"]),
                "attribution": CFG.get("weather_attribution") or ""}


RAIN_RE = re.compile(r"^/tiles/rain/([A-Za-z0-9_-]{1,40})/(\d{1,2})/(\d{1,6})/(\d{1,6})$")
RAIN_PLACEHOLDER = 1370      # bytes van de "Zoom Level Not Supported"-tegel (256 px, gemeten)


def get_rain_tile(frame, z, x, y):
    """Neerslagtegel via de Pi. Alleen frames die in onze eigen index staan, en niet naar schijf:
    ze verlopen binnen het uur, dus een begrensde cache in het geheugen is genoeg."""
    c = weer_cfg()
    if not c or z > int(c.get("rain_max_z", 7) or 7) or x >= 2 ** z or y >= 2 ** z:
        return None
    with weer_lock:
        host = weer["rain"].get("host") or ""
        bekend = any(f["id"] == frame for f in weer["rain"].get("frames") or [])
    if not bekend or not host:
        return None
    key = f"{frame}/{z}/{x}/{y}"
    hit = rain_cache.get(key)
    if hit is not None:
        rain_cache.move_to_end(key)
        return hit
    url = c["rain_tile"].format(host=host, path=f"/v2/radar/{frame}", z=z, x=x, y=y)
    try:
        data = http_get(url, 20)
    except Exception:                                   # noqa: BLE001
        return None
    # Vangnet voor een verkeerd ingestelde rain_max_z: boven de ondersteunde zoomstap stuurt
    # RainViewer een plaatje met "Zoom Level Not Supported" erin, altijd even groot. Dat hoort
    # niet in de cache en al helemaal niet op de kaart.
    if len(data) == RAIN_PLACEHOLDER:
        return None
    rain_cache[key] = data
    while len(rain_cache) > int(c.get("rain_cache", 900) or 900):
        rain_cache.popitem(last=False)
    return data


# ---------------------------------------------------------------- tiles

TILE_RE = re.compile(r"^/tiles/(?:(day|sat|ref|radar)/)?(\d{1,2})/(\d{1,6})/(\d{1,6})$")
TILE_LAGEN = ("", "day", "sat", "ref", "radar")   # leeg = de nachtkaart, het oude adres
tile_lock = threading.Semaphore(6)


# Ophogen zodra hetzelfde adres iets anders gaat opleveren dan eerst. Dat klinkt als iets wat
# nooit gebeurt, maar in 0.5.7 stond de configuratie op CARTO terwijl de cache nog Esri-tegels
# uitserveerde; wie de tracker in dat uurtje openhad, heeft die verkeerde plaatjes een maand in
# zijn browser staan -- onder precies het adres dat nu wél klopt. Eén ronde erbij en ze zijn
# onbereikbaar.
TILE_RONDE = "3"

PNG_KOP = b"\x89PNG\r\n\x1a\n"


def kleur_uit(tekst, terug=None):
    """#rrggbb of rrggbb naar (r, g, b). Onleesbaar? Dan terug wat je meegaf."""
    s = str(tekst or "").lstrip("#").strip()
    if len(s) != 6:
        return terug
    try:
        return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))
    except ValueError:
        return terug


def palet_recept(laag):
    """Het omzetrecept voor deze laag, of None."""
    r = (CFG.get("tile_palet") or {}).get(laag or "night")
    return r if isinstance(r, dict) and r else None


def palet_tekst(laag):
    """Het recept als vaste tekst, voor de cachenaam en het merkje: een ander recept is een
    andere tegel, en die moet je niet uit de oude map of uit de browsercache terugkrijgen."""
    r = palet_recept(laag)
    return json.dumps(r, sort_keys=True, ensure_ascii=False) if r else ""


def palet_omzetten(data, recept):
    """De kleurtabel van een paletplaatje herschrijven.

    Een PNG met palet draagt zijn kleuren in één PLTE-blok: driemaal een byte per kleur, hooguit
    256 stuks. De beeldgegevens zelf verwijzen alleen naar een plek in die tabel, dus de kleuren
    omzetten is de tabel overschrijven en de controlesom opnieuw uitrekenen -- de rest van het
    bestand blijft letterlijk zoals hij binnenkwam.

    Is het geen PNG of heeft hij geen palet (satellietbeeld is JPEG, en dat heeft geen tabel maar
    pixels), dan gaat het beeld onveranderd terug. Liever niets doen dan er met een omweg aan
    gaan rekenen."""
    if not data.startswith(PNG_KOP):
        return data
    vervang = {}
    for k, v in (recept.get("vervang") or {}).items():
        van, naar = kleur_uit(k), kleur_uit(v)
        if van and naar:
            vervang[van] = naar
    g0 = kleur_uit(recept.get("grijs_van"))
    g1 = kleur_uit(recept.get("grijs_tot"))
    n0 = kleur_uit(recept.get("wordt_van"))
    n1 = kleur_uit(recept.get("wordt_tot"))
    ramp = bool(g0 and g1 and n0 and n1 and g1[0] > g0[0])
    neutraal = bool(recept.get("neutraal"))
    w0 = kleur_uit(recept.get("water_van"))
    w1 = kleur_uit(recept.get("water_tot"))
    try:
        wmin = int(recept.get("water_min"))
    except (TypeError, ValueError):
        wmin = None
    water = bool(wmin is not None and w0 and w1)
    if not vervang and not ramp and not water:
        return data

    def helder(k):
        """Helderheid van een kleur, zoals het oog hem weegt."""
        return 0.299 * k[0] + 0.587 * k[1] + 0.114 * k[2]

    def meng(a, b, f):
        f = min(max(f, 0.0), 1.0)
        return tuple(int(round(p + (q - p) * f)) for p, q in zip(a, b))
    i = len(PNG_KOP)
    while i + 8 <= len(data):
        lengte = int.from_bytes(data[i:i + 4], "big")
        soort = data[i + 4:i + 8]
        if soort == b"PLTE":
            begin = i + 8
            tabel = bytearray(data[begin:begin + lengte])
            # Het water eerst opmeten: de kustrand moet tussen de donkerste en de lichtste
            # waterkleur van déze tegel in komen te liggen, niet tussen vaste getallen.
            wlo, whi = None, None
            if water:
                for j in range(0, lengte - 2, 3):
                    if tabel[j + 2] - tabel[j] >= wmin:
                        h = helder((tabel[j], tabel[j + 1], tabel[j + 2]))
                        wlo = h if wlo is None else min(wlo, h)
                        whi = h if whi is None else max(whi, h)
            for j in range(0, lengte - 2, 3):
                kleur = (tabel[j], tabel[j + 1], tabel[j + 2])
                nieuw = vervang.get(kleur)
                if nieuw is None and water and kleur[2] - kleur[0] >= wmin:
                    nieuw = meng(w0, w1, (helder(kleur) - wlo) / (whi - wlo) if whi > wlo else 0.0)
                if nieuw is None and ramp and (neutraal or kleur[0] == kleur[1] == kleur[2]):
                    # waar in de oude ramp zat deze tint, daar komt hij in de nieuwe terug
                    nieuw = meng(n0, n1, ((helder(kleur) if neutraal else kleur[0]) - g0[0])
                                 / (g1[0] - g0[0]))
                if nieuw:
                    tabel[j:j + 3] = bytes(nieuw)
            uit = bytearray(data)
            uit[begin:begin + lengte] = tabel
            crc = zlib.crc32(soort + bytes(tabel)) & 0xFFFFFFFF
            uit[begin + lengte:begin + lengte + 4] = crc.to_bytes(4, "big")
            return bytes(uit)
        if soort == b"IDAT":            # voorbij de kleurtabel; er komt er geen meer
            break
        i += 12 + lengte
    return data



def dag_is_licht():
    """Is de dagkaart een lichte kaart? Bepaalt de tegeltint; zie tile_day_light hierboven."""
    keuze = CFG.get("tile_day_light")
    if isinstance(keuze, bool):
        return keuze
    return "dark" not in str(CFG.get("tile_url_day") or "").lower()


def tile_merk():
    """Kort merkje van alle kaartadressen samen.

    De pagina haalt een tegel op als /tiles/<laag>/z/x/y, en dat adres verandert niet als je een
    andere kaart instelt -- terwijl de browser ze een maand bewaart. Je zou dus je oude kaart
    blijven zien en denken dat er niets werkt. Met dit merkje in de queryreeks is een andere
    kaart ook een ander adres, en haalt hij hem vanzelf opnieuw op."""
    bron = TILE_RONDE + "|" + "|".join(str(CFG.get("tile_url_" + l if l else "tile_url") or "")
                                       + "|" + palet_tekst(l)
                                       for l in ("", "day", "sat", "ref", "radar"))
    return hashlib.sha256(bron.encode()).hexdigest()[:8]


def tile_map(laag):
    """Cachemap voor deze laag, met het adres erin verwerkt.

    Wissel je van kaartleverancier, dan liggen de tegels van de vorige er nog en zou je die
    blijven zien zonder te begrijpen waarom. De naam van de map hangt daarom af van het adres:
    een ander adres is een andere map, en de oude blijft staan tot je hem zelf weggooit.

    Het merk staat er altijd in. Eerst hield een adres dat op de standaard stond de kale naam,
    en dat leek netjes -- tot de standaard zelf veranderde van Esri naar CARTO. Toen vielen de
    nieuwe kaarten precies in de mappen waar de oude tegels al lagen, en kreeg je Esri te zien
    terwijl de configuratie CARTO zei. Een uitzondering die alleen goed gaat zolang niemand de
    standaard aanraakt, is geen uitzondering die je wilt."""
    tpl = CFG.get("tile_url_" + laag) if laag else CFG.get("tile_url")
    basis = "tiles_" + laag if laag else "tiles"
    sleutel = (tpl or "") + "|" + palet_tekst(laag)
    return CACHE / f"{basis}_{hashlib.sha256(sleutel.encode()).hexdigest()[:8]}"


def tiles_bruikbaar():
    """Is er een kaart om te tonen?

    Zonder CARTO-sleutel is er van de standaardkaarten niets te halen. De pagina moet dat weten
    voordat ze tegels gaat vragen: in 3D blijft de ondergrond dan weg en in de RadarPlot vervalt
    SAT, in plaats van een scherm vol mislukte verzoeken. Een zelf ingevuld adres zonder {key}
    (een eigen tegelserver bijvoorbeeld) werkt gewoon."""
    return bool(CFG.get("tile_key")) or not any(
        "{key}" in str(CFG.get("tile_url_" + l if l else "tile_url") or "") for l in TILE_LAGEN)


def get_tile(z, x, y, laag=""):
    """Kaarttegel uit de gevraagde laag; elke laag heeft een eigen cachemap."""
    if z > 16 or x >= 2 ** z or y >= 2 ** z or laag not in TILE_LAGEN:
        return None
    p = tile_map(laag) / str(z) / str(x) / str(y)
    if p.exists():
        return p.read_bytes()
    tpl = CFG.get("tile_url_" + laag) if laag else CFG.get("tile_url")
    if not tpl:
        return None
    # Vraagt deze kaart een sleutel en is er geen, dan niets ophalen. CARTO zou tegels met
    # "API KEY REQUIRED" sturen -- niet te bewerken of te omzeilen volgens hun voorwaarden -- en
    # die zouden zich ook nog een maand in de cache nestelen. De pagina meldt zelf dat de
    # sleutel ontbreekt; zie tiles_bruikbaar().
    if "{key}" in tpl and not CFG.get("tile_key"):
        return None
    with tile_lock:
        url = tpl.format(s="abcd"[(x + y) % 4], z=z, x=x, y=y, key=CFG.get("tile_key") or "")
        data = http_get(url, 20)
    recept = palet_recept(laag)
    if recept:
        data = palet_omzetten(data, recept)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_bytes(data)
    tmp.replace(p)
    return data


# ---------------------------------------------------------------- http

CTYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8", ".json": "application/json",
          ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon"}


class Handler(BaseHTTPRequestHandler):
    server_version = "luchtruim/1.0"

    def log_message(self, fmt, *args):
        pass

    def send(self, code, body, ctype, gz=False, cache="no-store"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        if gz:
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Vary", "Accept-Encoding")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_json(self, obj=None, gz_body=None):
        accepts = "gzip" in self.headers.get("Accept-Encoding", "")
        if gz_body is None:
            gz_body = encode(obj)
        if accepts:
            self.send(200, gz_body, "application/json", gz=True)
        else:
            self.send(200, gzip.decompress(gz_body), "application/json")

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(n) if 0 < n <= 8_000_000 else b""
            # Meeluisteren uit: de pagina biedt de radiokant niet meer aan, maar een tabblad dat
            # al openstond weet dat niet. Daarom hier ook dicht, in plaats van erop te vertrouwen
            # dat er niemand meer aanbelt.
            if path.startswith("/api/stt") and not luisteren_aan():
                return self.send(404, b"", "text/plain")
            if path == "/api/stt":
                if len(body) < 1000:
                    return self.send_json({"ok": False, "reason": "audio"})
                q = urllib.parse.parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "")
                try:
                    hz0 = int(float((q.get("hz") or ["0"])[0]))
                except ValueError:
                    hz0 = 0
                first = (q.get("first") or [""])[0] == "1"
                res = stt_identify(body, q["cands"][0] if "cands" in q else None, hz0)
                # bewaren voor het leerscherm: het plakje waarin iemand herkend is, en anders het
                # eerste plakje van een transmissie. Niet elk plakje, dan loopt de schijf vol
                if res.get("ok") and (res.get("cs") or first):
                    stt_tel["gehoord"] += 1
                    if stt_bewaren(res):
                        res["id"] = stt_save(body, res, hz0, (q.get("label") or [""])[0][:60])
                        if res.get("id"):
                            stt_tel["bewaard"] += 1
                return self.send_json(res)
            if path == "/api/stt/fix":
                try:
                    req = json.loads(body.decode("utf-8", "replace"))
                except ValueError:
                    return self.send_json({"ok": False})
                j = stt_path(req.get("id", ""), ".json")
                if not j or not j.is_file():
                    return self.send_json({"ok": False, "reason": "onbekend"})
                meta = json.loads(j.read_text(encoding="utf-8"))
                fix = re.sub(r"[^0-9A-Za-z]", "", str(req.get("text") or ""))[:10].upper()
                meta["fix"] = fix if "text" in req else None
                meta["fix_t"] = time.time()
                j.write_text(json.dumps(meta), encoding="utf-8")
                if fix:
                    stt_learn(meta)
                return self.send_json({"ok": True, "lexicon": len(stt_lexicon())})
            if path == "/api/stt/record":
                req = json.loads(body or b"{}") or {}
                if "on" in req or "record" in req:
                    stt_rec_set(bool(req.get("record", req.get("on"))))
                if "learn" in req:
                    stt_leer_set(bool(req.get("learn")))
                return self.send_json({"ok": True, "record": stt_rec_on(), "learn": stt_leer_on()})
            if path == "/api/stt/lexdel":
                wrong = str((json.loads(body or b"{}") or {}).get("wrong") or "")
                ok = stt_lex_del(wrong) if wrong else False
                return self.send_json({"ok": ok, "lexrows": stt_lex_rows()})
            if path == "/api/stt/redo":
                try:
                    req = json.loads(body.decode("utf-8", "replace"))
                except ValueError:
                    return self.send_json({"ok": False})
                w = stt_path(req.get("id", ""), ".wav")
                j = stt_path(req.get("id", ""), ".json")
                if not w or not w.is_file() or not j:
                    return self.send_json({"ok": False, "reason": "onbekend"})
                res = stt_identify(w.read_bytes(), req.get("cands") if "cands" in req else None)
                if res.get("ok"):
                    meta = json.loads(j.read_text(encoding="utf-8"))
                    meta.update({"raw": res.get("raw", ""), "cs": res.get("cs", ""),
                                 "conf": res.get("conf", 0), "alts": res.get("alts", []),
                                 "model": res.get("model", ""), "ms": res.get("ms", 0)})
                    j.write_text(json.dumps(meta), encoding="utf-8")
                return self.send_json(res)
            return self.send(404, b"niet gevonden", "text/plain; charset=utf-8")
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:  # noqa: BLE001
            log(f"fout bij POST {path}: {e}")
            try:
                self.send(500, b"interne fout", "text/plain; charset=utf-8")
            except Exception:  # noqa: BLE001
                pass

    def owrx_doorgeef(self):
        """Websocket van de browser aan OpenWebRX knopen en de frames heen en weer pompen."""
        global relay_n, relay_t
        if owrx_relay_mode() == "uit":
            return self.send(404, b"doorgeven staat uit", "text/plain; charset=utf-8")
        sleutel = self.headers.get("Sec-WebSocket-Key") or ""
        if not sleutel or "websocket" not in (self.headers.get("Upgrade") or "").lower():
            return self.send(400, b"hier hoort een websocket", "text/plain; charset=utf-8")
        with relay_lock:
            if relay_n >= RELAY_MAX:
                return self.send(503, b"te veel luisteraars", "text/plain; charset=utf-8")
            # Elke luisteraar is een eigen verbinding naar OpenWebRX, en OpenWebRX bant een
            # adres dat te snel achter elkaar verbindt. Nu alle luisteraars vanaf deze ene
            # machine komen, is dat risico groter dan vroeger: vandaar deze rem.
            wacht = RELAY_MIN_S - (time.time() - relay_t)
            if wacht > 0:
                time.sleep(min(wacht, RELAY_MIN_S))
            relay_t = time.time()
            relay_n += 1
        boven_s = boven = None
        try:
            boven_s, boven = owrx_pijp()
        except Exception as e:  # noqa: BLE001
            with relay_lock:
                relay_n -= 1
            log(f"doorgeven: OpenWebRX niet bereikbaar: {e}")
            return self.send(502, b"ontvanger niet bereikbaar", "text/plain; charset=utf-8")

        antwoord = base64.b64encode(hashlib.sha1((sleutel + WS_GUID).encode()).digest()).decode()
        self.wfile.write(("HTTP/1.1 101 Switching Protocols\r\n"
                          "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                          f"Sec-WebSocket-Accept: {antwoord}\r\n\r\n").encode())
        self.wfile.flush()
        self.close_connection = True          # de http-lus is klaar, wij nemen het over
        self.connection.settimeout(None)
        onder = WsPijp(self.rfile.read1, self.wfile.write, False)

        dicht = threading.Event()

        def sluit():
            if dicht.is_set():
                return
            dicht.set()
            for s in (boven_s, self.connection):
                try:
                    s.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
                try:
                    s.close()
                except OSError:
                    pass

        def omlaag():
            try:
                while not dicht.is_set():
                    fin, op, data = boven.frame()
                    if op == 1 and b'"backoff"' in data:
                        log("doorgeven: OpenWebRX stuurt backoff -- "
                            + data[:160].decode("utf-8", "replace"))
                    onder.stuur(fin, op, data)
                    if op == 8:
                        break
            except Exception:  # noqa: BLE001
                pass
            finally:
                sluit()

        t = threading.Thread(target=omlaag, daemon=True)
        t.start()
        try:
            while not dicht.is_set():
                fin, op, data = onder.frame()
                boven.stuur(fin, op, data)
                if op == 8:
                    break
        except Exception:  # noqa: BLE001
            pass
        finally:
            sluit()
            t.join(timeout=2)
            with relay_lock:
                relay_n -= 1
        return None

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        global last_client
        path = self.path.split("?", 1)[0]
        try:
            if (path == "/owrx" or path.startswith("/api/stt") or path.startswith("/api/owrx")) \
                    and not luisteren_aan():
                return self.send(404, b"", "text/plain")
            if path == "/owrx":
                return self.owrx_doorgeef()
            if path == "/api/aircraft":
                last_client = time.time()
                q = urllib.parse.parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "")
                bbox = (q.get("bbox") or [""])[0]
                with lock:
                    body, snap = snapshot_gz, snapshot
                if not body:
                    return self.send_json({"now": time.time(), "fields": FIELDS, "ac": [],
                                           "status": "starting", "error": None})
                if bbox:
                    box = parse_box(q)
                    if box:
                        note_view(box)
                    try:
                        la1, lo1, la2, lo2 = (float(v) for v in bbox.split(",")[:4])
                        rows = [r for r in snap["ac"]
                                if la1 <= r[2] <= la2 and (lo1 <= r[3] <= lo2 if lo1 <= lo2
                                                           else r[3] >= lo1 or r[3] <= lo2)]
                        return self.send_json(dict(snap, ac=rows))
                    except ValueError:
                        pass
                return self.send_json(gz_body=body)
            if path == "/api/trails":
                last_client = time.time()
                q = urllib.parse.parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "")
                bbox = (q.get("bbox") or [""])[0]
                box = None
                if bbox:
                    try:
                        box = tuple(float(v) for v in bbox.split(",")[:4])
                    except ValueError:
                        box = None
                with lock:
                    keep = {r[0] for r in snapshot["ac"]} if not box else {
                        r[0] for r in snapshot["ac"]
                        if box[0] <= r[2] <= box[2] and (box[1] <= r[3] <= box[3] if box[1] <= box[3]
                                                         else r[3] >= box[1] or r[3] <= box[3])}
                    obj = {"now": snapshot["now"],
                           "trails": {h: [v for p in tr for v in p]
                                      for h, tr in trails.items() if h in keep}}
                return self.send_json(obj)
            if path == "/api/airports":
                with lock:
                    obj = airports_payload
                return self.send_json(obj)
            if path == "/api/airspace":
                if not airspace["ready"]:
                    return self.send_json({"items": [], "loading": airspace["status"] != "uit", "status": airspace["status"]})
                return self.send_json(gz_body=airspace["gz"])
            if path == "/api/navdata":
                if not navdata["ready"]:
                    return self.send_json({"points": [], "ways": [], "loading": True})
                return self.send_json(gz_body=navdata["gz"])
            if path == "/api/mapvector":
                if not mapvector["ready"]:
                    return self.send_json({"coast": [], "border": [], "loading": True})
                return self.send_json(gz_body=mapvector["gz"])
            if path == "/api/weather":
                if not weer_cfg():
                    return self.send_json({"off": True, "metar": [], "sigmet": [],
                                           "rain": {"host": "", "frames": []}})
                return self.send_json(weer_json())
            if path == "/api/airframe":
                q = urllib.parse.parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "")
                hexid = re.sub(r"[^0-9a-fA-F]", "", (q.get("hex") or [""])[0])[:6]
                return self.send_json(airframe_of(hexid))
            if path == "/api/flightinfo":
                q = urllib.parse.parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "")
                reg = (q.get("reg") or [""])[0][:12]
                cs = (q.get("cs") or [""])[0][:12]
                return self.send_json(schiphol_for(reg, cs))
            if path == "/api/route":
                q = urllib.parse.parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "")
                cs = re.sub(r"[^0-9A-Za-z]", "", (q.get("cs") or [""])[0])[:12].upper()
                if not cs:
                    return self.send_json({})
                if (q.get("refresh") or [""])[0] == "1" or cs not in route_fresh():
                    route_lookup(cs)          # direct opzoeken, buiten de wachtrij om
                with db_lock:
                    row = db.execute(
                        "SELECT cs,o_icao,o_iata,o_name,o_lat,o_lon,o_cc,"
                        "d_icao,d_iata,d_name,d_lat,d_lon,d_cc,airline,alt_o,alt_d "
                        "FROM routes WHERE cs=? AND found=1", (cs,)).fetchone()
                payload = {row[0]: list(row[1:14]) + alt_pair(row[14], row[15])} if row else {}
                return self.send_json({"routes": payload})
            if path == "/api/board":
                last_client = time.time()
                return self.send_json(bord_payload())
            if path == "/api/fields":
                return self.send_json(fields_payload())
            if path == "/api/routes":
                last_client = time.time()
                q = urllib.parse.parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "")
                return self.send_json(routes_payload(parse_box(q)))
            if path == "/api/photo":
                q = urllib.parse.parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "")
                hexid = re.sub(r"[^0-9a-fA-F]", "", (q.get("hex") or [""])[0])[:6]
                reg = re.sub(r"[^0-9A-Za-z\-]", "", (q.get("reg") or [""])[0])[:12]
                return self.send_json(get_photo(hexid, reg))
            if path == "/api/stt/list":
                q = urllib.parse.parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "")
                lim = max(1, min(400, int(float((q.get("limit") or ["120"])[0] or 120))))
                todo = (q.get("todo") or [""])[0] == "1"
                return self.send_json({"items": stt_items(lim, todo), "score": stt_score()})
            if path == "/api/stt/audio":
                q = urllib.parse.parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "")
                w = stt_path((q.get("id") or [""])[0], ".wav")
                if not w or not w.is_file():
                    return self.send(404, b"niet gevonden", "text/plain; charset=utf-8")
                return self.send(200, w.read_bytes(), "audio/wav", cache="private, max-age=3600")
            if path == "/api/stt/export":
                data, n = stt_export()
                self.send_response(200)
                self.send_header("Content-Type", "application/zip")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Content-Disposition",
                                 f'attachment; filename="flighttracknl_atc_{n}.zip"')
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(data)
                return None
            if path == "/api/channels":
                return self.send_json(load_channels())
            if path == "/api/owrx/tune":
                q = urllib.parse.parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "")
                try:
                    hz = int(float((q.get("hz") or ["0"])[0]))
                    res = owrx_select(hz) if 1e6 < hz < 3e9 else {"ok": False, "reason": "frequentie"}
                except Exception as e:  # noqa: BLE001
                    res = {"ok": False, "reason": str(e)[:120], "sql": owrx_squelch()}
                return self.send_json(res)
            if path == "/api/config":
                obj = {k: CFG.get(k) for k in
                       ("center", "radius_nm", "home_airport", "trail_max_min",
                        "tile_attribution", "tile_attribution_sat")}
                obj["tile_ref"] = bool(CFG.get("tile_ref", True))
                obj["tile_ver"] = tile_merk()
                obj["day_light"] = dag_is_licht()
                # Wat er daadwerkelijk als kaart is ingesteld en welke velden uit het
                # add-on-scherm zijn overgenomen. Zonder dit is "hij verandert niet" alleen met
                # gokken te onderzoeken; een sleutel in het adres wordt afgeschermd.
                obj["tiles"] = {l or "night": re.sub(r"(key=)[^&]+", r"\1***",
                                                     str(CFG.get("tile_url_" + l if l else "tile_url") or ""))
                                for l in ("", "day", "sat", "ref", "radar")}
                obj["tile_key_set"] = bool(CFG.get("tile_key"))
                obj["tile_map"] = tiles_bruikbaar()
                obj["versie"] = VERSIE
                obj["opties"] = list(OPTIES_OVER)
                obj["observer"] = CFG.get("observer") or {}
                obj["schiphol"] = bool(sch_cfg())
                obj["photos"] = bool(photo_contact())
                obj["source"] = (sources()[0] or {}).get("name", "")
                obj["areas"] = [{"name": a["name"], "lat": a["lat"], "lon": a["lon"],
                                 "radius_nm": a["radius"]} for a in areas()]
                obj["routes"] = bool((CFG.get("routes") or {}).get("enabled", True))
                obj["airframes"] = bool((CFG.get("airframes") or {}).get("enabled", True))
                obj["fields"] = bool(os_cfg())
                return self.send_json(obj)
            m = RAIN_RE.match(path)          # vóór TILE_RE: /tiles/rain/... is geen kaartlaag
            if m:
                frame, z, x, y = m.groups()
                data = get_rain_tile(frame, int(z), int(x), int(y))
                if data is None:
                    return self.send(404, b"", "text/plain")
                # een beeld hoort bij een vast tijdstip en verandert niet meer
                return self.send(200, data, "image/png", cache="public, max-age=3600")
            m = TILE_RE.match(path)
            if m:
                laag, z, x, y = m.groups()
                data = get_tile(int(z), int(x), int(y), laag or "")
                if data is None:
                    return self.send(404, b"", "text/plain")
                ctype = "image/png" if data[:4] == b"\x89PNG" else "image/jpeg"
                return self.send(200, data, ctype, cache="public, max-age=2592000")
            if path.startswith("/logos/") and path.endswith(".png"):
                data = logo_bytes(path[7:-4])
                if data is None:
                    return self.send(404, b"", "text/plain")
                return self.send(200, data, "image/png", cache="public, max-age=604800")
            return self.static(path)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except urllib.error.URLError as e:
            self.send(502, str(e).encode(), "text/plain; charset=utf-8")
        except Exception as e:  # noqa: BLE001
            log(f"fout bij {path}: {e}")
            try:
                self.send(500, b"interne fout", "text/plain; charset=utf-8")
            except Exception:  # noqa: BLE001
                pass

    def static(self, path):
        rel = "index.html" if path in ("", "/") else path.lstrip("/")
        p = (WEB / rel).resolve()
        if WEB not in p.parents or not p.is_file():
            return self.send(404, b"niet gevonden", "text/plain; charset=utf-8")
        cache = "public, max-age=31536000, immutable" if "/vendor/" in p.as_posix() else "no-cache"
        body = p.read_bytes()
        ctype = CTYPES.get(p.suffix, "application/octet-stream")
        if "gzip" in self.headers.get("Accept-Encoding", "") and p.suffix in (".js", ".css", ".html"):
            return self.send(200, gzip.compress(body, 6), ctype, gz=True, cache=cache)
        self.send(200, body, ctype, cache=cache)


def main():
    CACHE.mkdir(exist_ok=True)
    port = int(CFG.get("port", 8090))
    srv = ThreadingHTTPServer((CFG.get("bind", "0.0.0.0"), port), Handler)
    srv.daemon_threads = True
    db_open()
    threading.Thread(target=poll_loop, daemon=True, name="poller").start()
    threading.Thread(target=route_loop, daemon=True, name="routes").start()
    threading.Thread(target=airframe_loop, daemon=True, name="airframes").start()
    threading.Thread(target=mapvector_loop, daemon=True, name="mapvector").start()
    threading.Thread(target=navdata_loop, daemon=True, name="navdata").start()
    threading.Thread(target=airspace_loop, daemon=True, name="airspace").start()
    threading.Thread(target=schiphol_loop, daemon=True, name="schiphol").start()
    threading.Thread(target=load_airports, daemon=True, name="airports").start()
    threading.Thread(target=fields_loop, daemon=True, name="velden").start()
    threading.Thread(target=veld_loop, daemon=True, name="luchthavens").start()
    threading.Thread(target=weer_loop, daemon=True, name="weer").start()
    log(f"FlightTrackNL luistert op poort {port}")
    if OPTIES_PAD:
        log(f"instellingen uit het add-on-scherm overgenomen: {', '.join(OPTIES_OVER)}"
            if OPTIES_OVER else "add-on-scherm: niets ingevuld dat afwijkt, config.json is leidend")
    if TILES_OUD_WEG:
        log(f"Esri uit config.json genegeerd ({', '.join(TILES_OUD_WEG)}); de standaardkaarten "
            "gelden weer. Esri-tegels mogen niet zonder ArcGIS-abonnement worden gebruikt")
    if ATTR_GEWISSELD:
        log("bronvermelding onder de kaart noemde nog Esri; de kaartcredit is meegewisseld "
            "naar CARTO (de rest van je regel is ongemoeid)")
    log("Kaarten: CARTO" if tiles_bruikbaar()
        else "Geen kaart: er is geen CARTO-sleutel ingevuld. Vul key_carto in (gratis op "
             "carto.com/basemaps); tot dan blijft de ondergrond weg en vervalt SAT.")
    log("Meeluisteren actief" if luisteren_aan()
        else "Meeluisteren uit: geen speler, geen kanalen en geen frequenties bij een vlucht; "
             "niets is gewist, aanzetten brengt alles terug")
    log("Schiphol-koppeling actief" if sch_cfg()
        else "Schiphol-koppeling uit: geen client_id/client_secret in config.json onder schiphol")
    log(f"Thuisvelden via OpenSky actief, ronde om {int((CFG['opensky'] or {}).get('run_hour', 4))}:07"
        if os_cfg()
        else "Thuisvelden uit: geen client_id/client_secret in config.json onder opensky")
    _lb = veld_bronnen()
    log(f"Luchthavenbronnen: {', '.join(sorted({b['icao'] + '/' + b['kind'] for b in _lb}))}"
        if _lb else "Luchthavenbronnen uit")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()
