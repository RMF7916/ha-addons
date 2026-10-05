# FlightTrackNL

Vluchtvolger op de Raspberry Pi, naast OpenWebRX+. De RadarPlot is de standaardweergave, de
3D-weergave in de stijl van Airloom is de secundaire weergave.
Posities komen van adsb.lol. De Pi haalt ze server-side op (adsb.lol staat geen CORS toe),
houdt 15 minuten spoorgeheugen bij en serveert de weergave. Rendering gebeurt in de browser.

## Installeren / bijwerken

    unzip -o flighttracknl.zip && cd flighttracknl
    sudo ./install.sh

Daarna: `http://<pi>:8090` (lokaal of via Tailscale). OpenWebRX+ op 8073 blijft ongemoeid.
Bij bijwerken blijft `/opt/flighttracknl/config.json` staan; een nieuwe standaard komt in `config.json.nieuw`.
Blokken die in jouw bestand ontbreken vult de server zelf aan met de standaardwaarden, dus een oude
configuratie blijft werken.
Wil je de meegeleverde configuratie wél overnemen, gebruik dan `sudo ./install.sh --config`;
je oude bestand wordt dan bewaard als `config.json.oud`.

## config.json

| sleutel | betekenis |
|---|---|
| `center`, `radius_nm` | gebied dat bij adsb.lol wordt opgevraagd (max. 250 NM) en oorsprong van de 3D-scène |
| `geoid_offset_m` | geoïdehoogte ter plaatse; GNSS-hoogte wordt hiermee naar MSL gecorrigeerd (NL ca. 43 m) |
| `home_airport` | startweergave |
| `poll_active_s` / `poll_idle_s` | ophaalinterval met / zonder open browser (2 min na laatste bezoek) |
| `sources`, `retry_primary_s` | databronnen in volgorde van voorkeur; na een echte storing wordt de eerste bron na zoveel seconden opnieuw geprobeerd |
| `min_gap_s` | minimale tijd tussen twee aanvragen aan dezelfde bron (standaard 2). Is de eerste bron nog niet aan de beurt, dan haalt de volgende het gebied op. Bij een HTTP 429 verdubbelt die tijd voor die bron (tot 60 s) en na elke 10 geslaagde aanvragen wordt hij weer 10% korter; zo zoekt de server zelf het tempo dat de bron toestaat. Een 429 geldt niet als storing |
| `trail_step_s`, `trail_max_min` | dichtheid en lengte van het spoorgeheugen |
| `tile_url_day` | kaartondergrond voor de dagweergave in 3D |
| `tile_url`, `tile_attribution` | kaartondergrond; tegels worden in `cache/tiles` bewaard |
| `tile_key` | CARTO-sleutel; zonder sleutel geen kaart (zie hieronder) |
| `tile_palet` | kleuren van een kaartlaag omzetten voordat de tegel in de cache gaat |
| `tile_day_light` | is de dagkaart een lichte kaart? Stuurt de tegeltint en de kleuren van labels en banen. `null` = afleiden uit het adres |
| `openwebrx.url` / `.port` | adres van OpenWebRX; leeg = dezelfde host, poort 8073 |
| `openwebrx.open_in_tab` | Luister opent een adres in een nieuw tabblad in plaats van het paneel |
| `openwebrx.player_url` | websocket voor de speler in de pagina; leeg = `ws://<host>:8073/ws/` |
| `stt.enabled` | callsigns herkennen aan of uit; `bin` en `model` leeg = zelf zoeken op de Pi |
| `stt.threads` / `.beam` / `.timeout_s` | kernen voor whisper.cpp, beam search en de tijdslimiet |
| `stt.max_queue` / `.language` / `.prompt` | wachtrij, taal (`en`) en de beginzin met luchtvaartjargon |
| `stt.best_of` / `.max_context` / `.entropy` / `.logprob` | decodeerinstellingen; alleen gebruikt als deze whisper ze kent |
| `stt.model_fast` / `.who_seconds` / `.who_min` | apart model voor het spotten, hoeveel seconden erdoor gaan, en hoe zeker het moet zijn |
| `stt.audio_ctx` / `.max_queue` | ingekort rekenvenster (0 = uit, en bij een ATC-model altijd uit) en hoeveel transmissies tegelijk |
| `stt.slice_seconds` | hoeveel van het begin van een transmissie naar de Pi gaat (standaard 2,6) |
| `stt.who_partial` | kortste staartstuk van een afgekort callsign dat nog meetelt |
| `stt.who_offscreen` | ook toestellen buiten beeld meenemen als er in beeld niets past |
| `stt.prompt_callsigns` / `.prompt_max` | de beginzin met live callsigns, en hoeveel er in passen |
| `stt.airlines` | eigen maatschappijnamen, bijvoorbeeld `{"TRA": "Transavia"}` |
| `stt.record` / `.record_days` / `.record_max_mb` | transmissies bewaren voor het leerscherm, en hoelang |
| `stt.lexicon` / `.lexicon_min` | geleerde correcties toepassen, en hoe vaak een fout gezien moet zijn |
| `stt.beam` / `.best_of` / `.max_context` | decodeerinstellingen voor de trage, nauwkeurige stand |
| `schiphol.enabled` / `.client_id` / `.client_secret` | koppeling met de Schiphol Flight API |
| `schiphol.hours_back` / `.hours_ahead` / `.poll_s` | venster en ophaalinterval van die koppeling |
| `schiphol.max_pages` | bovengrens aan het aantal pagina's per ronde; wordt die geraakt, dan meldt het log dat |
| `observer.lat` / `.lon` / `.label` | waar jij staat; leeg = de browser, of met de hand op de kaart |
| `antenne.lat` / `.lon` / `.label` / `.agl_m` | waar de ontvangstantenne staat; leeg = vragen aan OpenWebRX |
| `openwebrx.tab_url` | het adres dat die knop opent, inclusief eventuele `#freq=...,mod=am,sql=...` |
| `openwebrx.bookmarks_file` | bookmarks van OpenWebRX; alles in `band_hz` verschijnt als kanaal |
| `openwebrx.channels` | eigen kanalen: `{"name": "EHRD Tower", "freq": 118200000, "mod": "am"}` |
| `routes.enabled` | route-opzoeken bij adsbdb.com aan of uit |
| `routes.lookups_per_s` | tempo van het opzoeken; lager = vriendelijker voor adsbdb |
| `routes.ttl_days` / `.miss_ttl_days` | hoelang een gevonden of niet-gevonden callsign geldig blijft |
| `routes.second_source` | hexdb.io raadplegen; die is leidend, adsbdb is de tweede kandidaat |
| `airframes.enabled` | bouwjaar en serienummer uit de OpenSky-database ophalen |
| `airports_live.enabled` / `.poll_s` / `.tt_poll_s` | vluchtinformatie van de luchthavens zelf, en hoe vaak |
| `airports_live.hours_back` / `.hours_ahead` | het venster; daarbuiten botsen vluchtnummers van verschillende dagen |
| `airports_live.keep_hours` | hoelang de server vluchten bewaart voor de geschiedenis in het bord |
| `airports_live.sources[]` | per bron: `icao`, `kind` (`rtha`, `ein`, `teletekst`), `enabled`, `fallback`, `pages` |
| `opensky.enabled` / `.client_id` / `.client_secret` | thuisveldtabel en route-aanvulling via de OpenSky API |
| `opensky.airports` | velden waarvoor de tabel gevuld wordt; leeg = dezelfde knoppen als in de balk |
| `opensky.days_back` | hoe ver terug bij de eerste vulling |
| `opensky.keep_days` / `.min_seen` | hoelang een koppeling meetelt, en hoe vaak een toestel gezien moet zijn |
| `opensky.run_hour` / `.max_requests` | het uur van de nachtronde, en het plafond aan aanvragen per ronde |
| `opensky.learn_routes` | vluchten met een vertrek- én aankomstveld ook in de routetabel zetten |
| `opensky.min_flights` / `.pair_days` | hoe vaak dezelfde route gezien moet zijn voor hij telt, en binnen hoeveel dagen |
| `navdata.enabled` | bakens en luchtwegen ophalen voor de RadarPlot |
| `navdata.fix_url` / `.nav_url` / `.awy_url` | bronbestanden in X-Plane-formaat; vervangbaar door eigen, actuelere bestanden |
| `airframes.refresh_days` | hoe vaak die database wordt ververst |
| `photos.contact` | e-mail of URL; planespotters.net eist contactgegevens in de User-Agent, leeg = geen foto's |

Na wijzigen: `sudo systemctl restart flighttracknl`.

## Foto's en types

De toestelkaart toont de volledige typenaam uit `web/types.json` (ICAO Doc 8643, 2660 codes)
en een foto van planespotters.net. Die API weigert aanvragen zonder contactgegevens, dus vul
`photos.contact` in `config.json` met je e-mailadres of een URL:

    "photos": { "enabled": true, "contact": "mailto:jij@voorbeeld.nl" }

Foto's worden 30 dagen in `cache/photos` bewaard, missers 3 dagen. Zonder contactgegevens
blijft de rest gewoon werken, alleen zonder foto.

## Vluchtinformatie van de luchthavens zelf

Schiphol heeft CISS. Voor Rotterdam, Eindhoven en Maastricht was er niets, en daar kwam de route
dus van hexdb of adsbdb — met de foutmarge van dien. Alle drie publiceren hun vluchten zelf, en
elk met een andere sleutel om aan een toestel te koppelen:

| bron | `kind` | wat het geeft | koppeling |
| --- | --- | --- | --- |
| Schiphol CISS | `ciss` | kenteken, tijden, gate, pier, terminal, band, codeshares | kenteken — hard |
| Rotterdam The Hague | `rtha` | kenteken, ICAO-route, gate, parkeerpositie, bagageband, off- en in-blocktijden | kenteken — hard |
| Eindhoven | `ein` | callsign, ICAO-route, gate, bagageband, landings- en blocktijden | callsign — hard |
| NOS Teletekst | `teletekst` | vluchtnummer, plaatsnaam, geplande tijd, status | vluchtnummer → callsign — zwak |

Een harde koppeling wint van hexdb en adsbdb, precies zoals de Schiphol-gegevens dat al deden.
Een zwakke vult alleen aan waar nog niets stond, laat de koerscontrole gewoon zijn werk doen, en
krijgt geen bevestigingsstempel in de toestelkaart — alleen de naam van de bron, doffer gezet.

Teletekst dekt alle vijf de Nederlandse velden, met twee pagina's:

| pagina | subpagina's | velden |
| --- | --- | --- |
| 768 | 1–2 / 3–6 | Maastricht-Aachen / Eindhoven, elk aankomsten en vertrekken |
| 769 | 1–4 / 5–6 | Rotterdam / Groningen Eelde, elk aankomsten en vertrekken |
| 756–761 | veel | Schiphol, aankomsten en vertrekken per dagdeel |

Een subpagina wisselt dus niet alleen van richting maar ook van luchthaven, en de kop van elke
subpagina bepaalt bij welk veld de regels horen — niet het veld dat in de config staat. De
subpagina-keten wijst aan het eind naar een andere hoofdpagina; die sprong wordt niet gevolgd.

Wat teletekst oplevert voor een veld dat zijn eigen bron heeft, wordt weggelaten zodra die bron
werkt. Daarom staat er in de status per bron welke velden hij feitelijk levert: `EHBK` betekent
dat de Eindhovense helft van pagina 768 is afgevallen omdat hun eigen API het doet. Valt die weg,
dan verschijnt `EHBK, EHEH` en neemt teletekst het over. Alleen de Schiphol-pagina's staan op
`"fallback": true`, want daar zitten vijftien subpagina's aan vast en niets wat elders ontbreekt.

De pagina's hebben vaste kolommen (`Schema Vlucht Herkomst Opmerkingen`). Een datumregel als
"Dinsdag 29 September 2026" verzet de dag voor alles wat erna komt. Het vluchtnummer wordt naar
een callsign vertaald met een IATA-naar-ICAO-tabel die zichzelf bijvult: Schiphol, Rotterdam en
Eindhoven geven bij elke vlucht beide codes.

Alles buiten `hours_back` / `hours_ahead` valt af. Dat is nodig: hetzelfde vluchtnummer komt elke
dag terug, en zonder venster koppelt de vlucht van overmorgen net zo goed als die van nu.

De robots.txt van Eindhoven sluit `/api/` uit voor bots. Die bron staat daarom als eigen regel in
`sources` en is met één `"enabled": false` uit te zetten.

## Het vluchtenbord

De knop BORD in de bovenbalk opent een overlay over de kaart met de aankomsten en vertrekken van
de Nederlandse velden, uit dezelfde bronnen als hierboven. Knoppen per veld, per richting, en
voor het tijdsbereik. Een regel die oplicht is een toestel dat op dat moment in de plot staat;
erop klikken zet de filters die het verbergen opzij, selecteert het toestel, zet volgen aan en
sluit het bord — hetzelfde als het aanklikken van een alarm.

Naast het vluchtnummer staat het callsign: `HV6789 TRA44E`. Dat is de koppeling tussen wat de
reiziger kent en wat er op de plot staat. Heeft de bron geen callsign — Rotterdam levert alleen
een kenteken — dan zoekt de server het erbij zodra dat toestel in de lucht is en zijn callsign
uitzendt, en blijft het daarna staan. Is er nog geen callsign, dan toont het bord het kenteken,
gedimd in plaats van in de accentkleur, zodat je het verschil ziet.

De datum van een teletekstregel komt niet van de pagina maar van het tijdstip zelf, zolang er
nog geen datumregel gepasseerd is. Dat moet: boven aan een pagina staat vlak na middernacht eerst
de late avond van gisteren, en die regels kwamen anders op vandaag te staan — een vlucht die al
geland was stond dan 22 uur in de toekomst. Nu wordt de kalenderdag gekozen die het tijdstip het
dichtst bij nu legt; na een datumregel is de datum hard.

Alle tijden zijn lokale tijd. De bronnen leveren die verschillend aan: Rotterdam met `+02:00`,
Eindhoven in UTC met een `Z`, en teletekst zonder enige zone. Die laatste krijgt de zone van de
Pi mee voordat hij de deur uitgaat — zonder dat zou een browser in een andere tijdzone de
Nederlandse tijden naar zichzelf omrekenen en dus verschuiven.

In de kop staan twee dingen die niet hetzelfde zijn. De **klok** is de lokale tijd en loopt per
seconde. De **ouderdom van de bronnen** staat onderaan: `RTHA 2m · EIN 2m · TT EHBK 5m`. De
luchthaven-API's worden elke drie minuten opgehaald, teletekst elke tien, dus wat je ziet kan
tien minuten oud zijn terwijl de klok klopt. Loopt een bron meer dan een halfuur achter of geeft
hij een fout, dan kleurt dat rood.

Het bereik telt naar twee kanten, en vooruit ruimer dan terug, want een bord gaat vooral over wat
er nog komt: `1 u` toont een uur terug tot drie uur vooruit, `4 u` vier terug tot twaalf vooruit,
en `Dag` alles wat er is. Alleen naar achteren begrenzen hielp niet — dan staat om middernacht de
hele volgende dag in beeld, hoe klein je het venster ook zet.

De geschiedenis komt niet van de bronnen. Die geven de kalenderdag, geen voortschrijdend venster:
om middernacht slaat Rotterdam om en is de hele vorige dag weg. Daarom bewaart de server zelf wat
hij ziet, `airports_live.keep_hours` lang (standaard 24 uur), in de tabel `bordvlucht`. Een zwakke
bron overschrijft daarbij nooit een harde: een vlucht die Rotterdam met kenteken leverde wordt
niet verdrongen door dezelfde vlucht uit teletekst. Wat de server niet gezien heeft is er ook
niet — draait de Pi een paar uur niet, dan zit er een gat in de geschiedenis dat niet in te halen
is.

De logo's komen uit `web/logos/<IATA>.png`; staat er geen bestand, dan toont het bord de
IATA-code in een klein kader. Zie `web/logos/LEESMIJ.md` — er bestaat geen vrij te gebruiken
logobibliotheek, dus die map vul je zelf.

## Thuisvelden via OpenSky

Het filter van/naar leunt op de routetabel, en daar staat geen lesvlucht in: wie van EHRD opstijgt,
een rondje vliegt en er weer landt heeft geen vluchtnummer en dus geen route. OpenSky stelt
achteraf per vlucht het vertrek- en aankomstveld vast uit de waarnemingen zelf, ook zonder
vluchtnummer. Die batch draait 's nachts, dus live is er niets aan te hebben — maar wie gisteren
van EHRD vertrok, vertrekt er volgende week waarschijnlijk weer. Eén ronde per nacht levert de
vaste klanten van elk veld op, en die kent de plot dan meteen bij de eerste meting.

Staat er een sleutelpaar onder `opensky` in `config.json`, dan haalt de server om het ingestelde
uur per veld de vertrekken en de aankomsten op, in vensters van twee dagen (meer staat OpenSky per
aanvraag niet toe). Tot waar elk veld gehaald is staat in de cache, dus een onderbroken ronde gaat
de volgende nacht verder waar hij was. Bij de eerste vulling wordt `days_back` dagen ingehaald,
afgekapt op `max_requests` aanvragen per ronde.

Een toestel telt pas als vaste klant van een veld zodra het er `min_seen` keer (standaard twee) is
gezien, en een koppeling vervalt na `keep_days` dagen. In het paneel staat onder de veldknoppen
hoeveel toestellen er voor het gekozen veld in staan en wanneer de tabel is bijgewerkt. De knop
LOKAAL VERKEER zet deze tabel samen met de andere lokale herkenning uit.

Vluchten die zowel een vertrek- als een aankomstveld hebben én een echt vluchtnummer vullen de
routetabel aan — maar pas bij herhaling. Elke waarneming wordt geteld als (callsign, herkomst,
bestemming); een callsign krijgt zijn route pas als dezelfde combinatie `min_flights` keer (twee)
is gezien binnen `pair_days` (30 dagen) én de meerderheid vormt van wat er voor dat callsign
geteld is. Dat is geen overdreven voorzichtigheid: van de callsigns die in een week rond Schiphol
langskwamen was 26% er maar één keer, en juist daar zaten de onzinroutes. En ook wie vaker komt
wisselt weleens, doordat OpenSky een uitwijkveld schat: KLM1361 stond vijf keer op LKPR en één
keer op LKLT. De meerderheid beslist, niet de eerste of de laatste vlucht. Nagemeten over een
week Schiphol: 1423 van de 2058 callsigns kregen een route, en alle 1423 kwamen overeen met de
meerderheid in de ruwe gegevens. Zet `learn_routes` op `false` als je alleen de thuisvelden wilt.

Zo'n geleerde route staat in de kolom `src` als `opensky` en telt als gewone route: hij wordt door
Schiphol overruled en door de koerscontrole omgedraaid als het toestel duidelijk de andere kant
op vliegt. Na `routes.ttl_days` vervalt hij en wordt hij opnieuw bepaald.

Aanmelden gaat via opensky-network.org: maak een account, vraag onder je accountinstellingen een
API-client aan, en zet de Client ID en het Client Secret in `config.json`. Een gewone gebruiker
heeft 4000 credits per dag; een venster van een of twee dagen kost er 30, dus een ronde over acht
velden in beide richtingen komt op ongeveer 480. Bij HTTP 429 stopt de ronde en gaat hij de
volgende nacht verder; bij 401 of 403 kloppen de sleutels niet en staat dat in het log. Of de
koppeling aanstaat zie je bij het opstarten: "Thuisvelden via OpenSky actief" of "Thuisvelden uit".

Let op wat deze tabel niet is: geen vluchtplan. Echte ingediende vluchtplannen lopen in Europa via
IFPS van EUROCONTROL, en de NM B2B-webdiensten daarvoor zijn alleen toegankelijk voor
luchtvaartmaatschappijen, luchtverkeersleiding, luchthavens en afhandelaars. Een lokale lesvlucht
dient bovendien helemaal geen vluchtplan in. Waarneming achteraf is daarom de enige bron die dit
verkeer kent.

## Schiphol-vluchtinformatie

Staat er een sleutelpaar in `config.json` onder `schiphol`, dan haalt de server elke twee minuten
de vluchten van de publieke Schiphol Flight API op (CISS, dezelfde bron als de borden op de
luchthaven) voor een venster van twee uur terug tot vier uur vooruit. Koppelen gebeurt op kenteken,
en anders op IATA-vluchtnummer.

Of de koppeling aanstaat zie je bij het opstarten in het log: "Schiphol-koppeling actief" of
"Schiphol-koppeling uit". Blijft het log daarna stil, dan gaat het ophalen goed.

Schiphol levert elke codeshare als aparte vlucht met hetzelfde kenteken. Alleen de uitvoerende
vlucht (`mainFlight`) wordt gebruikt, de codeshare-nummers staan eronder als "ook als ...". Komt
hetzelfde toestel binnen het venster aan en vertrekt het weer, dan kiest de server de vlucht
waarvan het tijdstip het dichtst bij nu ligt. Koppelen gebeurt op kenteken, anders op het
callsign (bijvoorbeeld TRA6873 voor HV6873) of het vluchtnummer.

Bij een treffer toont de toestelkaart een extra blok met de geplande tijd, de verwachte of
werkelijke tijd, de gate met pier en terminal, en het vluchtnummer zoals Schiphol dat kent.
De route van Schiphol is leidend: die overschrijft wat hexdb of adsbdb zei en wordt niet meer
omgedraaid door de koerscontrole. Achter de route staat dan `✓ Schiphol`. De kop van het blok
vermeldt het vluchtnummer, of het een aankomst of vertrek is, de andere luchthaven en de status
uit CISS, en bij 15 minuten of meer verschil komt daar "vertraagd, N min" bij. Bij de tijd staat
hoeveel later of eerder die is dan gepland. De tijden van Schiphol dragen hun tijdzone mee en
worden omgerekend naar de tijd van je eigen apparaat. Bij aankomsten komt de
bagageband in beeld zodra Schiphol die publiceert.

Het venster wordt in pagina's van twintig opgehaald tot het op is. Dat zijn er meer dan je zou
denken: ongeveer tweederde van wat Schiphol teruggeeft zijn codeshare-records van dezelfde vlucht,
en een venster van zes uur liep daardoor op tot meer dan duizend records. Hier werd vroeger na
veertig pagina's gestopt, waardoor de laatste uren van het venster nooit binnenkwamen — en dat
ging stil mis. Raakt de server `max_pages`, dan staat dat nu in het log.

Aanmelden gaat via developer.schiphol.nl: maak een applicatie, abonneer je op de Flight API v4,
en zet de Client ID en het Client Secret in `config.json`. Die staan daar in leesbare tekst, dus
bewaar het bestand met zorg. Bij HTTP 403 is de applicatie nog niet geabonneerd of wacht die op
goedkeuring; dat staat dan in het log.

Hetzelfde toestel komt vaak aan op Schiphol en vertrekt een uur later weer; beide vluchten staan dan
met hetzelfde kenteken in de Schiphol-gegevens. De server kiest de vlucht die past bij wat het
toestel doet: vliegt het naar Schiphol toe (of daalt het vlak bij de baan), dan de aankomst; vliegt
het ervan weg (of klimt het), dan het vertrek. Een aankomst die al meer dan 10 minuten geleden is
geland, of een vertrek dat pas over meer dan een uur is, hoort nooit bij een toestel dat in de lucht
is. Past er niets, dan toont de kaart geen Schiphol-gegevens in plaats van die van de verkeerde vlucht.

## Dekking: meerdere gebieden

adsb.lol levert per aanvraag één cirkel van maximaal 250 NM. Om groter te kijken staan er in
`areas` meerdere cirkels; standaard tien, samen van Ierland tot Polen en van Denemarken tot
Noord-Italië. Elke ronde wordt het eerste gebied opgehaald, plus om beurten één van de andere.
Je eigen omgeving ververst dus elke drie seconden en de rest ongeveer elke halve minuut.

De weergave past zich daarop aan: per toestel wordt bijgehouden hoe vaak het werkelijk bijwerkt,
en pas daarna vervaagt of verdwijnt het. Ver verkeer knippert dus niet.

De browser vraagt alleen op wat in beeld is. Zoom je in op Schiphol, dan gaan er een paar tientallen
toestellen over de lijn in plaats van alle duizenden. Kustlijn, luchthavens, bakens en luchtwegen
worden automatisch over het hele dekkingsgebied bijgesneden; wordt het gebied groter, dan haalt de
server ze opnieuw op.

## Vertraagde weergave

De weergave loopt bewust achter op de data, standaard 8 seconden (schuifregelaar Vertraging,
3 tot 20 s). Daardoor ligt elke getoonde positie tussen twee gemeten punten in: er wordt niets
vooruit geraden en dus ook nooit teruggecorrigeerd, wat het rubberbanden wegneemt. Tussen de
punten wordt met een Hermite-curve geïnterpoleerd, zodat bochten rond blijven en het spoor exact
op de neus van het toestel eindigt. Een toestel dat net nieuw in beeld is verschijnt pas zodra de
buffer tot zijn eerste meting is gevorderd.

Elk toestel heeft zijn eigen afspeelklok, die nooit voorbij zijn laatste meting loopt. Valt de
data even weg, dan blijft het toestel gewoon doorvliegen op de laatste bekende gegevens en haalt
het daarna met hooguit 15% extra snelheid in, wat niet te zien is. Is de laatste meting ouder dan
8 seconden, dan vervaagt het toestel; na 20 seconden verdwijnt het en komt het terug zodra er
verse data is. Zo hoeft er nooit een positie gecorrigeerd of versprongen te worden.

De sporen gebruiken vaste buffers die één keer worden aangemaakt en per ronde worden overschreven.
Dat voorkomt de geheugendruk die de browser eerder kon laten vastlopen. Raakt de pagina toch zijn
grafische context kwijt, dan wordt dat opgevangen en hersteld.

De toestelkaart toont altijd de laatste live gegevens, niet de vertraagde weergave, en werkt bij
zodra er nieuwe data binnenkomt. Klik je een toestel aan waarvan de route nog niet bekend is, dan
wordt die meteen opgezocht in plaats van te wachten op de achtergrondwachtrij.

## RadarPlot (2D)

De RadarPlot opent standaard; met de knop 3D in de bovenbalk ga je naar de secundaire weergave. Die is opgezet als een verkeersleidersscherm:

- twee thema's, te kiezen onder Thema in het weergavepaneel: NACHT (standaard: nachtblauwe zee,
  land een tint lichter, cyaan kustlijn) en KLASSIEK (de oorspronkelijke donkergroene ondergrond).
  Datablokken, symbolen en labelplaatsing zijn in beide gelijk. Kustlijn, landsgrenzen, land en
  meren komen uit Natural Earth
- wachtcircuits van de Schiphol-naderingspunten ARTIP, SUGOL en RIVER (rechtsom, 1 min, FL070-100)
  en NARSO (linksom, FL200, gestippeld: alleen op aanwijzing). Ze horen bij NAV, volgen de
  helderheid van AWY / NAVAID en de hoogteband. De gegevens staan in `web/holdings.js`, met de
  bron (AIP Netherlands AD 2 EHAM STAR-1, AIRAC AMDT 03/2026); controleer ze bij een nieuwe AIRAC
- afstandsringen en een peilschaal langs de rand, te centreren op elke luchthavenknop
- een eigen symbool en kleur per soort verkeer (zie **Soort verkeer** verderop)
- schuifregelaars voor de helderheid, allemaal bij elkaar onder het knoppenblok LABELS EN LAGEN:
  grootte labeltekst, AWY / NAVAID, LUCHTRUIM, RNG RINGEN, BANEN en KAART. De geografische kaart
  heeft daarnaast een eigen aan/uit-knop in datzelfde knoppenblok.
- luchtwegen met hun routenaam, plus bakens en punten (SUGOL, ARTIP, RIVER, PAM) met een
  driehoek voor een punt, een zeshoek voor een VOR en een cirkel voor een NDB. Vanaf 40 NM bereik
  staat bij de routenaam ook de onder- en bovengrens in FL, zoals bij de wachtcircuits:
  `L602 055-195`, `UL602 195-660`. Verschilt de band per stuk van een route, dan krijgt elk stuk
  een eigen label; labels van routes die over elkaar liggen komen onder elkaar
- een snelheidsvector die laat zien waar het toestel over 30 s, 1 min of 2 min is
- fijne groene historiepunten achter het doel, ongeveer elke 15 seconden
- wit label in drie regels, met een dunne donkergroene leader van het doel naar het label. Achter
  het callsign staat het toesteltype als de bron dat meegeeft: `KLM900 B738`. In de korte stand
  vervalt het type.
- **klimmen en dalen als schuine pijl**: klimmen loopt van linksonder naar rechtsboven, dalen van
  linksboven naar rechtsonder, vanaf 300 voet per minuut.

  De pijl is het echte teken `↗` of `↘`, maar hij staat niet in de tekstregel. B612 Mono kent
  het teken niet, dus het viel terug op het systeemlettertype met een andere letterbreedte —
  gemeten 12,04 tegen 13 px — en dan breekt het monospace-raster. In de tekst staat daarom een
  lege cel; het teken wordt daar los in gezet, midden in die cel en op de basislijn van de tekst.
  Het wordt bovendien opgeschaald: in de terugvalfont is het teken maar 5 van de 8 beeldpunten
  hoog tegen de cijfers ernaast, dus het wordt vergroot tot precies de kaphoogte, waarmee de
  schacht vanzelf dikker wordt.

  Kent het lettertype het teken helemaal niet, dan wordt de pijl getekend. Die controle gebeurt
  één keer, door het teken te vergelijken met een teken uit het privégebied.
- **De arm wijst naar het midden van de labeltekst en stopt er vlak voor**, op het midden van de
  zijkant die naar het doel toe ligt. Er loopt geen streep meer langs de tekst; die voegde niets
  toe aan de aanwijzing en maakte het beeld onrustiger.
- **De arm staat altijd onder 45 graden op de koers, zonder uitzondering.** Het blok ligt op een
  van de vier hoeken van de koers — twee achterwaarts, twee voorwaarts — en welke van de vier
  maakt niet uit. De achterwaartse gaan voor, want daar ligt alleen het spoor en niet de
  snelheidsvector; past het daar niet, dan de voorwaartse, en anders een ring verder naar buiten.
  De arm is 36 beeldpunten lang (44 op een smal scherm), 62 in de tweede ring.
  Zie `docs/voorbeelden-armen.png` voor alle acht de koersen naast elkaar.
- De 3 px tussenruimte tussen doel en blok zit in de plaatsing, niet in de arm: het blok wordt zo
  gelegd dat het aanhechtpunt precies op de 45-gradenlijn valt. Nagemeten over 128 armen in een
  echt beeld: 0,000 graden afwijking.
  Een label ligt nooit over de eigen koers: het spoor achter het
  doel en de snelheidsvector ervoor worden vrijgehouden, en het label schuift naar de andere kant:
  `KLM900` / `F0328↓ G202` / `C020 X020`. F is de hoogte in tientallen voet met stijg- of
  daalpijl, G de grondsnelheid in knopen. C is de ingestelde hoogte: wat de bemanning op het
  autopilotpaneel (MCP/FCU) heeft gezet, meestal de door de verkeersleiding gegeven hoogte.
  X is de FMS-hoogte: het doel van de vluchtcomputer, zoals een hoogtebeperking op de route of de
  kruishoogte. Tijdens een beheerde klim of daling wijken ze af, verder zijn ze vaak gelijk. C en X komen rechtstreeks uit ADS-B en staan er alleen als het
  toestel ze uitzendt; anders staat op die regel de bestemming
- verversing in stappen van 4 of 8 seconden zoals een echte radar, of vloeiend. Bij stappen
  ververst ook het label pas bij de volgende stap, samen met de positie
- luchtruim uit openAIP (toets LRM): CTR, TMA, CTA, TMZ, RMZ en FIR, plus de militaire gebieden
  (beperkt, gevaarlijk, verboden, TRA, TSA), elk met een eigen lijnstijl: CTR doorgetrokken, TMA en
  CTA gestreept, militair rood/oranje/paars gestippeld. Grote blokken krijgen een label zoals op een
  luchtvaartkaart: naam, bovengrens, streep, ondergrens. Onder LUCHTRUIM kies je CIV, MIL of ALLE; de
  hoogteband bepaalt welke blokken zichtbaar zijn. Het blok waarin het geselecteerde toestel vliegt,
  wordt dikker getekend en staat op de toestelkaart onder de route (bijvoorbeeld
  `EHAM TMA1 klasse A · 1500–FL095`). Nodig: `openaip.api_key` in `config.json` (gratis account op
  accounts.openaip.net). De server haalt eens per 7 dagen alles binnen `openaip.radius_nm` (150 NM)
  op, in tegels van hooguit 200.000 km2 met 5 s tussen de aanvragen, en bewaart het in
  `cache/airspace.json`. openAIP remt na een paar snelle aanvragen af (HTTP 429): de tegels die al
  binnen zijn blijven bewaard (`cache/airspace_tiles.json`) en de rest volgt na 2, 5, 10 ... 60 min.
  Wat al binnen is, is meteen zichtbaar; de pagina blijft vragen tot alles er is en onder LUCHTRUIM staat zolang hoeveel stukken er binnen zijn
- luchtruim met nadruk op je eigen gebied: de gebieden van de luchthaven die je bovenin hebt
  gekozen krijgen volle lijn en label, de rest blijft staan maar gedempt. Zo slibt het beeld niet
  dicht en zie je toch wat er omheen ligt. De koppeling gaat op de naam van het gebied: een
  ICAO-code erin (`CTR EHRD`, `EHAM TMA1`, `CTA EHAM W`) telt, en anders een plaatsnaam
  (`ROTTERDAM`, `EINDHOVEN`, `GRONINGEN`). Alleen voor CTR, TMA en CTA, want een oefengebied dat
  `EHTRA 80 DEELEN` heet hoort niet bij het veld Deelen. Het geselecteerde toestel licht zijn eigen
  gebieden op zoals altijd
- de FIR-grens is een eigen laag: hij wordt apart getekend, vóór alle filters, en blijft dus staan
  ongeacht de hoogteband en ongeacht de keuze civiel of militair. Hij is de rand van je gebied, geen
  laag om doorheen te bladeren. Uit te zetten met de knop FIR onder LABELS EN LAGEN
- radio op de toestelkaart: de waarschijnlijke frequentie(s) voor dit toestel, met ▶ om OpenWebRX
  erop af te stemmen. Op de grond Ground (en Delivery bij stilstand), laag bij een luchthaven de toren
  (bij Schiphol die van de baan in gebruik), naar Schiphol Arrival/Approach, van Schiphol Departure,
  hoger Amsterdam Radar van het dichtstbijzijnde naderingspunt (SUGOL 118.805, ARTIP 120.555, RIVER
  127.780, uit de AIP), laag VFR Amsterdam Information, verder van Schiphol maar nog onder FL245 het
  gebiedsdeel van Amsterdam Radar (west 123.705, zuid 123.850, oost 124.880), en vanaf FL245
  Maastricht Radar (zie hieronder). Frequenties per luchthaven uit OurAirports
  (`airport-frequencies.csv`). 8,33 kHz-kanaalnamen worden omgerekend naar de echte frequentie
  (118.280 = 118,275 MHz). Hoe de verkeersleiding het werk verdeelt is niet openbaar: het blijft een
  goede gok
- hoger luchtruim: Nederland is in twee lagen verdeeld. Tot FL245 werkt Amsterdam ACC
  ("Amsterdam Radar"), vanaf FL245 tot FL660 doet Maastricht UAC ("Maastricht Radar") het, voor
  Nederland, België, Luxemburg en noordwest-Duitsland. Voor Nederlands luchtruim zijn twee MUAC-
  sectoren van belang, elk met eigen lagen:

  | sector | laag | frequentie |
  | --- | --- | --- |
  | Delta | FL245-FL335 | 135.960 |
  | Delta | FL335-FL365 | 135.510 |
  | Delta | boven FL365 | 132.085 |
  | Ruhr | FL245-FL375 | 124.435 |
  | Ruhr | boven FL375 | 122.835 |

  De frequenties komen uit de Belgische eAIP (ENR 2.1, skeyes), die ze als enige officiële bron met
  sectornaam publiceert; alle vijf staan ook in de lijst van de Nederlandse eAIP (ENR 2.1) voor
  Amsterdam UTA, wat ze onafhankelijk bevestigt. De LVNL-AIP noemt zelf geen sectornamen. Wat hier
  een benadering is en geen AIP-gegeven: waar de grens tussen Delta en Ruhr precies ligt — die
  publiceert niemand openbaar, dus de lijn in `app.js` is op het verzorgingsgebied geschat
  (ruwweg: ten zuidoosten van Nijmegen zit je in Ruhr). Pas die aan als je het beter weet
- de RIVER-frequentie is 127.780 en niet de 127.870 die in OurAirports staat. Dat is na te rekenen:
  8,33 kHz-kanaalaanduidingen eindigen per 25 kHz-blok op .x05, .x10 of .x15, dus 127.870 bestaat
  niet als kanaal en 127.780 wel (draaggolf 127.775). De code gebruikt de juiste waarde; de data van
  OurAirports wordt hiervoor niet geraadpleegd
- OpenWebRX neemt `#freq=` alleen over binnen de band van het actieve profiel. Daarom kiest de Pi bij
  ▶ (en bij de kanaalknoppen in het radiopaneel) eerst het juiste profiel: hij leest de profielen uit
  `openwebrx.settings_file` (/var/lib/openwebrx/settings.json), kijkt via de websocket van OpenWebRX
  welk profiel actief is, en wisselt alleen als de frequentie daar niet in past. Voorkeur voor profielen
  waarvan de naam met `openwebrx.profile_prefer` begint ("Airband"), daarbinnen het profiel waar de
  frequentie het dichtst bij het midden ligt. Let op: OpenWebRX heeft één ontvanger, een wissel geldt
  voor iedereen die luistert. Uitzetten met `openwebrx.switch_profile: false`. Valt een frequentie in
  geen enkel profiel, dan staat dat op de toestelkaart
- squelch: bij het afstemmen gaat `sql=` mee in de link, zodat OpenWebRX meteen met squelch opent.
  Waarde per profiel via `openwebrx.squelch_by_profile` (bijvoorbeeld `{"Airband 127-129": -72}`),
  anders `openwebrx.squelch`, anders de `sql=` uit `openwebrx.tab_url` (nu -69). In dB, zoals de
  squelchschuif van OpenWebRX; lager is gevoeliger
- luisteren in de pagina: ▶ op de toestelkaart speelt de frequentie af in FlightTrackNL zelf, zonder
  OpenWebRX te openen. De browser praat rechtstreeks met de websocket van OpenWebRX (poort 8073, die
  moet vanaf de browser bereikbaar zijn) en vraagt één AM-kanaal op, net als OpenWebRX zelf. Onderin
  verschijnt een spelerbalk met signaalmeter (gele streep = squelch, groen = squelch open), SQL-schuif
  (-110 tot -20 dB), volume en ↗ om de volledige OpenWebRX met waterval op dezelfde frequentie te
  openen. ■ stopt. Het juiste profiel wordt eerst gekozen, zoals hierboven. Luistert iemand anders al
  in OpenWebRX, dan hoor je dezelfde ontvanger; elke luisteraar krijgt wel een eigen kanaal binnen het
  profiel. Andere websocket-URL (bijvoorbeeld wss achter een proxy): `openwebrx.player_url`,
  zoals `wss://openwebrx.example.net/ws/`. Leeg = `ws://<zelfde host>:8073/ws/`
- Meelezen: wie praat er? Geen zinnen, alleen het callsign. De browser knipt de audio per transmissie
  (OpenWebRX stuurt alleen geluid als de squelch open is, dus een gat in de stroom is het einde van
  een transmissie), stuurt die naar de Pi, en daar haalt whisper.cpp het callsign eruit. Het
  datablok van dat toestel licht op de radarplot drie seconden cyaan op met een pulserende ring, en
  in de spelerbalk staan de laatste sprekers met type en registratie; klikken selecteert het
  toestel. Eerst installeren: `sudo /opt/flighttracknl/install-whisper.sh` (duurt op een Pi 5 een
  minuut of tien). Meelezen staat altijd aan zodra de Pi het kan; staat whisper er niet, dan blijft
  de rechterhelft van de spelerbalk leeg
- het model is het belangrijkst, belangrijker dan alle instellingen hieronder samen. Gewone
  whisper-modellen maken van echte ATC-audio weinig terecht. Gemeten op eigen opnames van 119.050:
  waar in werkelijkheid "Transavia 5793, climb to level 130" werd gezegd, maakte `base.en` ervan
  "I'll be 573, flight to level 1, please hit up" en `small.en` "L'Avia 5793, flank to level 130",
  terwijl het bijgetrainde ATC-model er "s avia five seven nine three climb to level one three zero"
  van maakte. Met base.en werd op een hele middag geen enkel callsign herkend
- het ATC-model installeren: `.\tools\zet-atc-model.ps1`. Dat plakt de delen uit `ATC\model\` aan
  elkaar, controleert het bestand, zet het op de Pi in /opt/whisper.cpp/models/ggml-atc-small.bin en
  herstart de service. Staat er een `ggml-atc-*.bin`, dan kiest FlightTrackNL dat vanzelf, tenzij
  `stt.model` expliciet iets anders aanwijst. Het is whisper-small bijgetraind op luchtvaartradio
  (nbaker/whisper-small-atc), omgezet naar ggml en gekwantiseerd naar q8_0: 264 MB, en omgerekend
  ongeveer twee seconden per transmissie op een Pi 5 — even snel als base.en, maar bruikbaar.
  Groter kan (borisdiakur/whisper-finetuned-for-ATC-ggml, medium of large), maar dat is met zo'n
  25 seconden per transmissie te traag voor een Pi
- waarom dit veel beter werkt dan hele zinnen herkennen:
  - de transmissies worden uit het geluid zelf geknipt, niet uit gaten in de audiostroom. Dat laatste
    werkt niet op een drukke frequentie: daar volgt de ene transmissie de andere binnen een halve
    seconde, en met een ruime squelch loopt de stroom zelfs door. Wel betrouwbaar is het niveau: dat
    valt even weg als de zendknop wordt losgelaten. Er loopt een ruisvloer mee, alles wat daar ruim
    bovenuit komt geldt als spraak, en een dip van meer dan een kwart seconde sluit de transmissie af
  - van elke transmissie gaat alleen het begin naar de Pi (2,6 s, of de hele transmissie als die
    korter is) — daar staat het callsign. Eén aanvraag per transmissie dus, niet één per twee
    seconden. Daardoor hangt de belasting van de Pi aan hoeveel er gepraat wordt, niet aan de klok.
    Het datablok licht op terwijl de verkeersleider nog praat. Praat iemand langer dan twaalf
    seconden door, dan wordt er nog eens gekeken
  - de browser luistert altijd door. Is de Pi nog bezig, dan blijft alleen het nieuwste plakje
    klaarliggen en gaat dat zodra de vorige klaar is — oudere vervallen. Blijft een aanvraag twintig
    seconden hangen, dan wordt hij afgebroken en gaat het luisteren gewoon verder
  - in het leerscherm staat hoe het loopt: hoeveel transmissies per minuut er binnenkomen, hoeveel er
    herkend zijn, bij hoeveel er niemand uit kwam en hoeveel er vervielen omdat de Pi bezig was.
    Staan daar veel vervallen bij, dan is de Pi de rem: zet dan `stt.model_fast` op `tiny.en`
  - het zwaarste werk in whisper is de encoder, en die rekent standaard altijd een venster van
    dertig seconden door — ook bij drie seconden audio. Met `stt.audio_ctx` (standaard 512) wordt dat
    venster ingekort: bij gewone modellen scheelt dat een factor drie zonder verlies. Bij een
    ATC-model kost het juist de maatschappijnaam ("klm nine five nine" wordt dan "nine five nine",
    "austrian seven nine juliett" wordt "oscar seven nine juliett"), dus daar wordt het volledige
    venster gebruikt — dat herkent de server zelf aan de modelnaam. Beam search maakt bij dit model
    geen verschil, en een beginzin met callsigns evenmin: letterlijk dezelfde tekst met en zonder
  - verder de snelste instellingen (greedy in plaats van beam search) en desgewenst een apart,
    lichter model: `stt.model_fast` (bijvoorbeeld `tiny.en`)
  - op de Pi draait er één tegelijk (`stt.max_queue`); komt er toch iets binnen terwijl hij bezig is,
    dan wordt dat overgeslagen zonder melding in beeld
  - whisper krijgt vooraf de callsigns mee van de toestellen die nu in de buurt zijn, in de vorm
    waarin ze worden uitgesproken ("transavia 6 2 1 5"). De pagina zet daarbij de toestellen vooraan
    die volgens hun vliegfase op de afgestemde frequentie horen te zitten
  - er wordt eerst gekozen uit de toestellen die op dat moment op de radarplot staan. Past daar
    niets bij, dan wordt alsnog gekeken naar alles wat de Pi in de lucht ziet: dat callsign komt dan
    wel in de balk (met een streepjesrand), maar er licht niets op — er is immers geen datablok.
    Uit te zetten met `stt.who_offscreen: false`. Staat er niets op het scherm, dan wordt de
    herkenner niet eens gestart
  - wat whisper eruit krijgt hoeft niet te kloppen als tekst. Er wordt alleen gezocht naar reeksen
    cijfers en spelalfabet, die worden vergeleken met de callsigns die in beeld zijn. Eén teken
    verschil mag, zolang er maar één toestel op past. Is de beste gok niet duidelijk beter dan de
    tweede, dan zegt hij liever niets (`stt.who_min`)
  - in de balk staat per regel de lokale tijd, de frequentie, de naam van het kanaal ("Schiphol
    Arrival", "Amsterdam Radar (RIVER)"), het callsign zoals het in het datablok staat, en het type
    met de registratie. Onder de muis staat wat whisper er letterlijk van maakte
  - de knop ⊙ in de spelerbalk opent de toestelkaart zodra er iemand herkend is. Die stand blijft
    bewaard. Staat het toestel niet op de radarplot, dan is er geen kaart om te openen
  - er wordt ook doorgeteld achter het callsign ("scandinavian one five five six, two one climbing"
    levert de reeks 155621 op); dan telt het begin van die reeks ook mee
  - de maatschappijnaam wordt herkend ook als whisper hem verhaspelt: "s avia" en "tuzavia" voor
    Transavia, "sun turkish" voor Sunturk, "elbair" voor El Al
  - afgekorte callsigns tellen mee. KLM23A heet aan de radio "KLM two three alpha", maar zodra het
    contact staat vaak alleen nog "three alpha" of "two three alpha". Een staartstuk met een letter
    erin mag vanaf twee tekens meetellen, kale cijfers pas vanaf drie ("three six one" voor
    KLM1361) — en alleen als er precies één toestel in beeld op dat staartstuk eindigt
    (`stt.who_partial`)
  - de browser stuurt de audio gefilterd (250-3800 Hz) en op vaste luidheid door
- opnemen staat standaard uit (`stt.record`). Zonder opnames is er geen potloodknop en wordt er niets
  op de Pi weggeschreven; herkennen werkt gewoon door. Aanzetten alleen als je wilt meten of
  bijtrainen
- leren: wie praatte er? (potloodknop in de spelerbalk, alleen als opnemen aanstaat): elke
  transmissie wordt bewaard met de wav,
  het herkende callsign en wat whisper letterlijk hoorde, in `cache/stt/`. Luister terug, vul het
  juiste callsign in en druk op Enter; laat het veld leeg als er niets te herkennen viel. Dat levert:
  - een cijfer: hoe vaak het callsign klopt, per model, plus hoe vaak hij ernaast zat en hoe vaak hij
    niets zei. Wissel van model, druk op ↻ om dezelfde opnames opnieuw te laten beoordelen, en je
    ziet zwart op wit of het beter is geworden
  - een woordenboekje: een verkeerd verstane maatschappijnaam die je drie keer op dezelfde manier
    goedzet, wordt voortaan vanzelf gecorrigeerd (`cache/stt/lexicon.json`, drempel
    `stt.lexicon_min`)
  Met Export haal je alles wat je hebt nagekeken op als zip: 16 kHz wavs plus `metadata.jsonl` met
  jouw callsign per fragment, klaar om een model mee bij te trainen. Opnemen uit met
  `stt.record: false`; opruimen gaat via `stt.record_days` en `stt.record_max_mb`, waarbij nagekeken
  opnames altijd blijven staan. Houd die opnames lokaal: het gaat om radioverkeer dat niet voor jou
  bestemd is. De routes naar een beter model staan in docs/ontwerp/meelezen-model.md
- datablokken en koerslijnen: een datablok komt nooit over een koerslijn te liggen, ook niet over die
  van een ander toestel. Bij elke plot worden eerst alle sporen en snelheidsvectoren verzameld (in een
  grof raster, anders wordt het te duur) en daarna pas de blokken geplaatst, dus het klopt na elke
  verversing opnieuw
- de kopbalk: links de naam, de weergavesoort en de statusstrip, rechts Luister, Weergave en de
  taalknop. Alles even hoog en in dezelfde stijl, en dat rechterblok valt nooit half af: past het
  niet meer, dan wijkt het in zijn geheel. De kaartcontrols (draaien, kantelen, zoomen, STD, QL)
  zweven linksonder over de weergave, in beide weergaven
- de toestelkaart heet Vluchtinformatie en heeft dezelfde titelbalk als het weergavepaneel
- datablokken verplaatsen: klik op een datablok en het springt met de klok mee naar de volgende
  van 8 richtingen rond het doel (N, NO, O ... NW), of sleep het naar de gewenste kant. Dubbelklik
  zet het weer op automatisch. Een zelf geplaatst blok blijft staan zolang het toestel in beeld is
  (30 s uit beeld: vergeten); de automatische blokken ontwijken het. Klikken op het doel zelf
  selecteert zoals altijd
- DATABLOK VOL of KORT in het weergavepaneel. KORT toont callsign en hoogte (`KLM900` /
  `F0328↓`); het geselecteerde toestel, het toestel onder de muis en noodgevallen blijven volledig
- historiepunten: de laatste posities staan als losse punten achter het toestel, hoogstens vijf en
  minstens 15 s uit elkaar. Ze zijn precies één CSS-pixel groot en uitgelijnd op het
  beeldpuntenraster, want een cirkel wordt door de antialiasing een vaag wolkje; zo blijven ze hard
  en nemen ze niets weg van het beeld
- quick-look: houd Q ingedrukt (of de knop QL in de kopbalk, ook op de telefoon) en alles is
  direct volledig in beeld, ook wat uit staat: de datablokken op de RadarPlot en de labels in de
  3D-weergave. Loslaten zet het terug. De knop werkt dus in beide weergaven, en daardoor is de
  kopbalk er ook in beide even breed

In het weergavepaneel staan alle vinkjes bij elkaar, per weergave. In de RadarPlot: Datablokken
(sneltoets D), Bestemming in plaats van C/X (sneltoets B), Historiepunten, Afstandsringen,
Luchtwegen en Bakens; in 3D: Labels en Loodlijnen. Toestellen op de grond en Mijn locatie staan in
beide weergaven in dezelfde groep. Linksboven in de RadarPlot staat alleen nog het info-knopje
met de legenda. Het info-knopje ernaast opent direct
eronder een legenda van het radarbeeld: de symbolen, de velden van het label, de kleuren en de
kaartsymbolen, in beide talen.

De bedieningsbalk verandert mee: de vier richtingsknoppen verschuiven het beeld, de zoomknoppen
veranderen het bereik. Slepen en scrollen doen hetzelfde. De toestelkaart blijft dezelfde, maar
in de radarstijl. Alle radarinstellingen worden net als de rest bewaard.

## Versienummer

`VERSIE` bovenin `server.py` is de enige plek waar het nummer staat. Het gaat mee in `/api/config`
en de pagina zet het naast de naam in de kopbalk. Bij het inpakken wordt gecontroleerd dat het
gelijk is aan `VERSION` in de projectmap; wijkt het af, dan wordt er geen zip gemaakt. Zo kan een
oplevering nooit een ander nummer dragen dan wat het scherm laat zien.

## Uitleg bij elke kop

Elke kop in het weergavepaneel heeft rechts een informatieknopje; daarachter opent in een regel of
drie wat dat blok doet. De tekst hoort bij de vertaalsleutel van de kop — een kop met
`data-i18n="k.band"` krijgt `uitleg.k.band` — en de knopjes worden bij het opstarten geplaatst, niet
in de HTML gezet. Een kop zonder uitlegtekst krijgt dus ook geen knopje, en een nieuwe kop is één
regel in `i18n.js` van een eigen uitleg voorzien.

Eén ding om te onthouden als je een kop aanpast: zet `data-i18n` niet op de kop zelf maar op een
`<span>` erbinnen. `applyStatic` schrijft de tekst van zo'n element met `textContent`, en dat zou
het knopje bij elke taalwissel weer weggooien. De code doet die omzetting zelf, maar handmatig
toegevoegde koppen kun je meteen goed zetten.

## Conflictmelding

Een lijn tussen twee toestellen die binnen vijf minuten te dicht bij elkaar komen, met de tijd tot
dat moment, de kleinste afstand en het hoogteverschil daar. Rood als ze nu al binnen de norm zitten,
amber als het eraan komt.

De norm is niet overal dezelfde, en wat ergens een waarschuwing is, is elders de bedoeling. Daarom
drie banden met elk een eigen toets in plaats van één schakelaar:

| toets | wanneer | norm |
|---|---|---|
| KRUIS | boven 6000 ft | 5 NM en 1000 ft |
| TMA | onder 6000 ft | 3 NM en 1000 ft |
| FINAL | allebei onder 2000 ft | 2 NM en 1000 ft |

FINAL staat standaard uit. Op de eindnadering staan toestellen bewust op drie mijl achter elkaar op
dezelfde hoogte; een scherm dat daar bij Schiphol permanent voor waarschuwt kijk je binnen een dag
niet meer op. De band volgt het hoogste van de twee toestellen — een vertrekkende op 3000 ft tegen
een naderende op 1500 ft valt dus onder TMA en niet onder FINAL. Achter het informatieknopje van
het blok staat hoeveel paren er op dit moment gemeld worden.

Het rekenwerk is exact, niet bemonsterd. Twee doelen die rechtdoor vliegen leveren horizontaal een
vierkantsvergelijking op en verticaal een rechte lijn; allebei geven ze het tijdvak waarin de norm
geschonden wordt, en overlappen die tijdvakken binnen het venster, dan is er een conflict. Dat is
nagerekend tegen botweg uitproberen per kwartseconde over 200.000 willekeurige paren: geen enkel
verschil in tijd of afstand, en drie keer melde de exacte versie een conflict dat de steekproef
miste omdat het korter duurde dan een stap.

Wat het niet weet: bochten, klaringen en wat de verkeersleiding al heeft afgesproken. Het trekt
koers, snelheid en stijgsnelheid rechtdoor door. Daarmee is het een waarschuwing, net als de STCA
van een echt systeem — die ook regelmatig afgaat op twee toestellen die al lang uit elkaar gestuurd
zijn.

## Meetlijn (MEET)

Een liniaal. Zet MEET aan en klik twee punten aan: afstand in zeemijlen en de peiling van het
eerste naar het tweede. Klik je een toestel aan, dan hangt het uiteinde daaraan vast en loopt de
lijn mee; met een toestel aan beide kanten komt de naderingssnelheid erbij, en het moment en de
afstand van de kleinste nadering. Esc wist de lijn, en zolang MEET aan staat opent een klik geen
vluchtinformatie — anders springt de kaart open terwijl je aan het meten bent.

## Hoogteband

In plaats van één plafond staan er nu twee schuifregelaars: hoogte vanaf en hoogte tot. Die band
bepaalt welk verkeer je ziet én welke luchtwegen: een route verschijnt zodra zijn hoogtebereik de
ingestelde band raakt. Zet je de band op FL240 en hoger, dan blijven alleen de bovenste routes en
het hoge verkeer over. Staat de ondergrens boven de grond, dan valt grondverkeer weg.

## Jij en je antenne zijn twee plekken

Het middelpunt van de kaart is waar je naar kijkt. **Jij** bent waar je staat, en dat verhuist: op
een spottersplaats sta je ergens anders dan thuis. De **antenne** is waar het signaal binnenkomt,
en dat is een vaste installatie die niet met je meegaat.

Alleen de antenne zegt iets over ontvangst, dus daar hangen de bereikcijfers aan en daarvandaan
wordt bij elke opname in het leerscherm de afstand gemeten. Alleen jouw plek zegt iets over waar je
heen moet kijken, dus daarvandaan worden de afstand, peiling en elevatie in de vluchtdetails
gerekend.

De schakelaar "Mijn locatie" zet beide symbolen aan: een vakwerkmast met uitstralende bogen op de
antenne, een cirkel met kruis op jouw plek. Het voetpunt van de mast is de werkelijke coördinaat.
Sta je op de mast -- binnen tweehonderd meter -- dan is alleen de mast te zien; twee symbolen op
dezelfde plek zijn geen extra informatie.

### De antenne

    "antenne": { "lat": null, "lon": null, "label": "MAST", "agl_m": 10, "auto": true }

Laat je `lat` en `lon` leeg, dan vraagt de server het aan OpenWebRX: een ontvanger weet zijn eigen
positie en zet hem op `/status.json`, samen met zijn naam en hoogte boven zeeniveau. Het antwoord
gaat naar `cache/antenne.json`, zodat een herstart terwijl de ontvanger uit staat de mast niet van
de kaart haalt. Werkt dat ook niet, dan telt `antenne.fallback` met `lat`, `lon` en `asl_m`. Zet
`antenne.auto` op `false` om alleen de ingevulde waarden te gebruiken.

`agl_m` is de hoogte van de antenne boven de grond, niet de hoogte van het terrein. Die bepaalt de
radiohorizon en daarmee de bereikcijfers in het troposfeerblok. Stond er al een `tropo.rx_m`
ingevuld, dan wint die -- daar hoorde het vroeger.

### Jouw plek

    "observer": { "lat": 52.0575, "lon": 4.4930, "label": "HQ" }

Ingevuld wint dat en blijft het staan. Anders wordt de browser gevraagd -- maar browsers geven hun
locatie alleen vrij op een beveiligde verbinding, dus via `http://<pi>:8090` komt daar niets uit.
Hoe dan ook kun je jezelf met een lange druk (of een rechtsklik) op de kaart neerzetten waar je
staat; dat blijft staan na herladen, en dezelfde druk op de markering haalt hem weer weg.

## Dag en nacht in 3D

In het 3D-paneel staat bovenaan Dag / nacht met drie toetsen:

- NACHT: de donkere kaart en bediening zoals altijd (standaard)
- DAG: een lichte kaartondergrond (Esri World Light Gray), een lichte console, donkere labels en
  een donkerder hoogteschaal, zodat gele en groene sporen op de lichte kaart leesbaar blijven
- AUTO: volgt de licht- of donkerinstelling van je browser of systeem, en schakelt direct mee
  als die verandert, bijvoorbeeld wanneer je telefoon 's avonds naar donker gaat

Landingsbanen zijn in beide standen goed te zien: bijna wit op de donkere kaart, donker leisteen
op de lichte. Naast het baanvlak wordt de middellijn als lijn getekend, zodat een baan ook van
ver nog minstens één pixel breed is.

De RadarPlot blijft altijd donker, zoals op een echt radarscherm. De lichte tegels hebben een
eigen cachemap (`cache/tiles_day`) en komen van `tile_url_day` in `config.json`.

## Banen in gebruik (RadarPlot)

Welke baan in gebruik is, wordt afgeleid uit het verkeer zelf, voor elk veld in beeld:

- landen: een toestel onder 3500 ft dat daalt, binnen 12 NM vóór de drempel, recht op de
  verlengde middellijn (binnen 1 NM opzij en 15° van de baanrichting)
- opstijgen: een toestel onder 3500 ft dat klimt, tot 5 NM voorbij het baaneinde in de
  baanrichting, of een toestel met meer dan 60 knopen op de baan zelf

Elk toestel telt alleen voor de baan waar het het dichtst op de middellijn zit, zodat parallelle
banen elkaars verkeer niet overnemen. Meerdere banen tegelijk kan gewoon.

Een baan blijft in gebruik zolang de laatste beweging binnen twee keer de gemiddelde tijd tussen
bewegingen valt, minimaal 10 en maximaal 60 minuten; daarna nog een uur gedimd als "laatst
gebruikt". Op Schiphol wisselt het beeld dus snel mee, op een rustig veld blijft het staan.

Landen: cyaan stippellijn vóór de drempel met een tik per NM en `18R LDG`. Opstijgen: violette
lijn van 3 NM voorbij het baaneinde met een pijl naar buiten en `24 DEP`. In het paneel onder
BANEN: de helderheid, de lengte van de landingslijn (5, 10 of 15 NM), en IN GEBR of ALLE, waarbij
ALLE elke baan een gedimde verlengde middellijn geeft.

## Woordlogo

Het logo is een FT-monogram in een vierkant kader met daarnaast FlightTrack**NL**. Kader en NL
nemen de leidende kleur van de weergave aan: groen in de RadarPlot, magenta in 3D. Het tabblad
krijgt hetzelfde monogram als favicon, dat meewisselt met de weergave. Op een smal scherm blijft
alleen het monogram staan.

## Consolestijl

De bediening is opgezet als een radarconsole. Bovenin een statusstrook met UTC en lokale tijd,
het aantal toestellen in beeld, de bron, de vertraging en de Schiphol-koppeling. Het
weergavepaneel werkt met toetsen in plaats van vinkjes en schuiven:

- lamptoetsen voor labels en lagen: het lampje brandt als de functie aan staat
- uitlezingen met − en + voor bereik, spoorlengte, hoogte ×, hoogteband en vertraging;
  ingedrukt houden laat de waarde doorlopen
- snelkeuzes voor het bereik (10, 20, 40, 60, 120, 250 NM)
- helderheid als balk van tien segmenten: AWY / NAVAID voor luchtwegen en navaids, RNG RINGEN
  voor de afstandsringen en de peilschaal
- kust en grenzen in standaardkleur, donkerpaars of donkerblauw, met een iets dikkere lijn

Toetsen dragen afkortingen (AWY, NAV, HIST, BEST); de volledige naam staat erbij als je de muis
erop houdt. De RadarPlot is groen met amber voor selectie, de 3D-weergave houdt zijn eigen
nachtblauw met magenta lampjes. De toestelkaart gebruikt dezelfde opbouw: uitleesvakken, een
voortgangsbalk in segmenten en Schiphol-statussen als losse labels.

## Weergavepaneel

Het paneel is een uitklapmenu: de knop Weergave rechtsboven opent en sluit het, op elk scherm.
De toestelkaart gebruikt dezelfde opmaak: op een telefoon hangt hij net als het paneel onder de
balk en groeit hij naar beneden, met dezelfde randen en dezelfde hoogtegrens, en hij scrollt in
zijn eigen kader. Die hoogtegrens wordt in JavaScript berekend uit de werkelijke onderkant van de
bovenbalk en de bovenkant van de bedieningsbalk, en rechtstreeks op het element gezet. Dat is
bewust: iOS-Safari kent `dvh` niet in elke versie, en dan vervalt een hoogtegrens die in CSS wordt
uitgerekend.
Escape sluit het ook. Of het openstond wordt bewaard; op een breed scherm staat het de eerste keer
open, daarna volgt het jouw keuze.

### Indeling

Het scherm bestaat uit drie vlakken: de kopbalk, één rechterkolom en de spelerbalk onderaan.
Wat overblijft is de kaart.

De statusvelden in de kopbalk staan zonder kader of vulling: alleen het gedempte kopje met de
waarde erachter.

De **kopbalk** is altijd twee regels: boven de naam, de weergavesoort, de statusstrip en het
knoppenblok, daaronder de luchthavens. Dat is een raster, geen doorloop, want anders valt het
rechterblok op een derde regel zodra het net niet past. Wordt het krap, dan valt er telkens een
statusveld weg — eerst BRON, dan SCH, VERTR, UTC en LT — in plaats van dat de strip halverwege
wordt afgekapt. De grenzen staan in `style.css` en komen uit de gemeten breedtes.

De **rechterkolom** staat vast en toont of de weergave-instellingen of de vluchtinformatie. De
knop rechtsboven zegt waar je heen gaat: op de instellingen staat er "Vlucht info", op de
vluchtinformatie "Weergave". Een toestel aanklikken zet de kolom zelf op de vluchtinformatie,
Escape zet hem terug. Is er geen toestel gekozen, dan valt er niets te tonen en staat de knop uit.

De **spelerbalk** loopt over de volle breedte van het scherm en is twee regels hoog, verdeeld in
twee gelijke helften. Links de bediening: boven stoppen, het kanaal met de frequentie en de
knoppen Auto-track en leren, daaronder RSSI, SQL en VOL als drie even brede balken (gemeten 232
bij 16 px elk). Rechts het meelezen: een tabel met tijd, frequentie, kanaal, callsign, type en
registratie, met een koprij die blijft staan en een eigen scrollbalk. Nieuwste regel bovenaan.

Meelezen staat altijd aan zodra de Pi het kan; de knop WIE is er niet meer. **Auto-track** laat de
vluchtinformatie meespringen naar wie er praat, en die stand blijft bewaard.

Past de kanaalnaam met frequentie niet in zijn vakje, dan wordt het een lichtkrant: de tekst
schuift heen en weer, ongeveer 28 px per seconde, staat stil als je de muis erop houdt en heeft
de volledige tekst als zweeftekst. Past hij wel, dan beweegt er niets.

De hoogte van de balk staat standaard op twee regels, maar is te slepen aan de bovenrand (of met
de pijltoetsen als die rand focus heeft). De keuze wordt bewaard.

De ruimte die dit alles overlaat komt in `--map-t/r/b/l` te staan, en `--playh` houdt de hoogte
van de balk vast. Het kaartvlak moet een uitgerekende breedte en hoogte krijgen: een canvas is een
vervangen element, dus alleen `inset` zetten laat hem op zijn eigen 300x150 staan.

Dat het kaartvlak kleiner is dan het venster heeft ook gevolgen voor de 3D-weergave: de labels
liggen als gewone HTML over de scène, en de omrekening van wereld- naar schermpositie moet over
de maat van het canvas gaan en daarna verschoven worden naar venstercoördinaten. Reken je met
`innerWidth`/`innerHeight`, dan klopt de schaal niet en lopen labels bij draaien en kantelen van
hun toestel weg, steeds verder naarmate ze dichter bij de rand staan. De labellaag wordt met
`clip-path` op hetzelfde vlak bijgesneden.

Smaller dan 900 px is er geen ruimte voor een vaste kolom: dan zweeft de kolom over de kaart. Op
een telefoon (onder 760 px) geldt de gewone telefoonindeling, met de bediening boven het meelezen
in plaats van ernaast.

Meeluisteren via OpenWebRX zit niet meer in de kopbalk maar als knop **Luister** in de voet van
het weergavepaneel, naast Standaard en Legenda.

### Werkplekken in de bovenbalk

De luchthavenbalk is de plek waar je kiest waar je naar kijkt. Links de velden, dan een streepje,
dan drie werkplekken:

| Knop | Hoogteband | Bereik | Nadruk | Midden |
| --- | --- | --- | --- | --- |
| AMS RADAR | grond tot FL245 | 120 NM | CTA's en TMA's | thuisveld |
| UAC | FL245 en hoger | 250 NM | CTA's | hele gebied |
| MIL | grond tot FL195 | 150 NM | oefen- en helikoptergebieden | thuisveld |

Elke knop zet ook twee filters in het weergavepaneel:

- **Luchtruim** CIV / MIL / ALLE: AMS RADAR en UAC op CIV, MIL op MIL, een veldknop op CIV (een
  veld is naderingswerk) en OVERZICHT terug op ALLE. Zonder dat stonden bij MIL de oefengebieden
  tussen alle CTA's door en bij AMS RADAR de oefengebieden die er niet bij horen.
- **Van / naar**: een veldknop zet het filter op dat veld, een sectorknop en OVERZICHT zetten het
  weer open. Een sector gaat over een stuk luchtruim, niet over één luchthaven.

Je kunt beide in het paneel meteen weer omzetten; de knop dwingt niets af na de klik.

Het filter van / naar bestaat alleen als `routes.enabled` aan staat, en het verbergt alles waarvan
de route nog niet bekend is. Met een koude routecache blijft er dus weinig over: gemeten op een
verse server hield EHAM er 23 van 327 over en EHRD één. Het regeltje onder de knoppen zegt hoeveel
er zichtbaar zijn en hoeveel er wegvallen zonder bekende route. Toestellen die op het gekozen veld
aan de grond staan tellen altijd mee, ook zonder route.

Een veldknop centreert op dat veld, zet het bereik op **40 NM** en legt de nadruk op zijn
luchtruim. Elk veld krijgt hetzelfde bereik, zodat je na één klik weet hoe ver je kijkt en twee
velden naast elkaar op het oog te vergelijken zijn; het luchtruim bepaalt alleen nog de nadruk.
Een sectorknop doet daarnaast de hoogteband en de camerastand: één klik en je zit op die werkplek.
OVERZICHT zet alles terug.

Bij een sectorknop wordt het bereik wél uitgerekend uit de gebieden die nadruk krijgen: de
omhullende daarvan wordt met wat lucht eromheen in beeld gepast, via dezelfde schaal die de plot
gebruikt (`bereik = (kortste as / 2) / (schaal × NM)`). Gebieden buiten de ingestelde hoogteband
tellen niet mee, dus UAC zoomt op het hoge luchtruim en AMS RADAR op het lage.

Het getal in de tabel is daarbij het **plafond**, niet alleen de terugval. Zonder plafond rekt de
omhullende door tot de rand van wat er aan luchtruim geladen is: met de echte openAIP-gegevens
kwam AMS RADAR op 261 NM en MIL op 335 NM uit, omdat de militaire gebieden tot 150 NM uit elkaar
liggen. Passen mag dus alleen naar binnen. Is er nog geen luchtruim binnen, dan geldt het vaste
getal onveranderd.

De 3D-camera gaat op hetzelfde bereik mee: 1,6 km camera-afstand per kilometer radarstraal, de
verhouding die de OVERZICHT-knop al gebruikte. Een exacte gelijkheid bestaat niet — de camera
staat gekanteld, dus de horizon rekt het beeld naar achteren hoe dan ook uit — maar het gebied
rond het middelpunt staat in beide weergaven op dezelfde schaal. Vóór deze versie ging de camera
op de langste as van de omhullende staan, wat bij AMS RADAR op 910 km afstand uitkwam terwijl de
plot 142 NM aangaf.

Verzet je de hoogteband daarna met de hand, dan laat de sectorknop los, want dan klopt hij niet
meer. De band zelf blijft de fijnregeling in het weergavepaneel.

### Onzichtbare keuzeknoppen

De radio in een keuzeknop (`.seg`) en het vinkje in een toetsknop (`.key`) staan op `opacity: 0`
en liggen precies over hun eigen knop. Dat *precies* is niet cosmetisch: een absoluut geplaatst
element zonder eigen `position` op de ouder hangt aan het paneel, en dan denkt de browser dat het
ver onder de zichtbare rand staat. Bij een klik krijgt het focus, de browser scrolt het paneel
ernaartoe, en omdat het paneel `overflow: hidden` heeft is er geen scrollbalk om terug te gaan:
de kop verdwijnt en de voet blijft halverwege hangen. Houd `position: relative` dus op het label
staan als je hier iets aan verandert.

### Luchtruim aanwijzen

Wijs een gebied aan in de radarplot en er verschijnt een kaartje bij de muis met de naam en de
onder- en bovengrens, in de kleur van die laag. Het werkt alleen op wat er op dat moment ook
werkelijk staat: staat het luchtruim uit, of valt het gebied buiten de ingestelde hoogteband of
buiten de keuze CIV/MIL, dan is het niet aan te wijzen. Liggen er gebieden over elkaar, dan wint
het kleinste — anders zou de CTA altijd de CTR eronder wegdrukken.

Een doel gaat altijd vóór: zit er een toestel of een datablok onder de muis, dan blijft het
kaartje weg. Tijdens slepen ook.

De schuifregelaar KAART regelt de kust, de landsgrenzen **en het landvlak**. Dat laatste liep tot
1.35.0 niet mee: de lijnen dimden wel, de achtergrond niet.

De schuifregelaar LUCHTRUIM regelt **alles** wat er aan luchtruim getekend wordt, ook de gebieden
die nadruk hebben. Nadruk is relatief: het gebied met nadruk staat op de ingestelde helderheid en
de rest wordt daaronder gedempt op 45%. Stond nadruk op vol, zoals tot 1.34.0, dan negeerde het de
regelaar helemaal en bleven juist de gebieden die je had aangeklikt op volle sterkte staan.

Het kaartje volgt de muis, en dat vraagt per beweging om een heel nieuw beeld. Daarom wordt het
hooguit tien keer per seconde opnieuw getekend; een ánder gebied onder de muis gaat wel meteen.
Gemeten tijdens muisbewegen: het tekenwerk ging met 42% omhoog, en alleen zolang de muis beweegt.

### Soort verkeer

Elk toestel krijgt één soort, met een eigen vorm én kleur. Alleen kleur is te weinig: op de grond
is alles gedempt grijsblauw, en wie kleuren slecht scheidt houdt dan niets over. De vorm draagt de
betekenis, de kleur bevestigt hem.

| Soort | Symbool | Kleur | Waaraan herkend |
| --- | --- | --- | --- |
| LIJN | achtarmige ster | groen (volgt het thema) | ADS-B-categorie A3 t/m A6, of een callsign zonder categorie |
| KLEIN | kruis | bleekgroen | categorie A1 en A2, of een licht typecode |
| HELI | cirkel met kruis | blauw | categorie A7 of een helikoptertypecode |
| MIL | ruit | rood | militaire ICAO-adresreeks |
| VRACHT | ster in een vierkant | oranje | callsign van een vrachtmaatschappij, gevolgd door een cijfer |
| SPORT | lange vleugel | lila | categorie B1, B4 en B6: zweef, ultralicht, onbemand |
| VOERTUIG | gevuld blokje | grijs | categorie C0 t/m C2 |
| ONBEKEND | driehoek | gedimd | geen categorie en geen vluchtnummer |

**Een toestel op de grond is altijd een kruis**, in grijsblauw, wat voor soort het ook is. Op een
platform staan er tientallen naast elkaar en dan telt alleen nog dát er iets staat; de soortvorm
werd daar een kluwen. Een grondvoertuig houdt wel zijn eigen blokje, want dat is juist geen
verkeer.

De volgorde van herkennen is de regel: wat hoger in de tabel staat wint. Een militaire helikopter
is dus militair, want dát is waarom je hem eruit wilt pikken.

**Waarom de categorie leidend is.** `cat` is een ADS-B-veld dat het toestel zelf uitzendt. In een
gemeten momentopname van 3155 toestellen had 91% er een. Maar het is een zelfverklaring en die
klopt niet altijd: er zat een Learjet bij die zich als A7 (hefschroef) meldde en een Super Puma die
zich als A0 meldde. Daarom staat de typecode ernaast als tweede bron — die haalde er 25
helikopters bij die geen A7 voeren, waaronder een Chinook en twee politie-AS350's.

**Waarom militair op de hex-reeks gaat en niet op het callsign.** Gemeten op dezelfde
momentopname: de negenentwintig militaire ICAO-blokken leverden 92 treffers en geen valse; een
lijst met militaire callsign-voorvoegsels leverde er 31, waarvan er 15 al door de hex-reeks
gevonden waren. De hex-reeks vindt ook wat geen herkenbaar callsign voert. De blokgrenzen
luisteren wel nauw: een ruimere lijst haalde Brussels Airlines-A320's binnen, omdat die ook in
`44xxxx` zitten. De blokken staan in `MIL_HEX` in `web/app.js`.

**Waarom een vrachtvoorvoegsel door een cijfer gevolgd moet worden.** `GEC` is Lufthansa Cargo,
maar `G-ECAM` is een Britse lesvlieger die zijn kenteken als callsign uitzendt. Zonder die eis
liepen er vier van zulke kentekens mee; met de eis bleven er dertien schone treffers over.

**Voertuigen staan standaard uit.** Het zijn sleepwagens, volgauto's en vogelwachten op de
platformen — `TXLU00`, `LEADER 9`, `BIRD380`, `SUPP515` — en ze waren binnen 150 NM van Schiphol
bijna 7% van het beeld. Tot nu toe kon je ze alleen wegkrijgen door ál het grondverkeer uit te
zetten, waarmee de taxiënde toestellen mee verdwenen. Een radarscherm laat ze niet als verkeer
zien.

**Militair is rood, en een noodgeval dus ook bijna.** Het alarmrood zat er al. Daarom krijgt een
toestel in nood er een ring omheen: de ring, niet de kleur, is het onderscheid.

Uitvinken van een soort haalt hem uit beeld, uit het spoor en uit de teller, in de radarplot én in
de 3D-weergave. Stond het geselecteerde toestel in die soort, dan sluit de toestelkaart.

#### In de 3D-weergave

Daar is een symbool geen teken maar het toestel zelf. Elke soort heeft een eigen romp, gedefinieerd
als een lijst driehoeken in `AC_VORM` in `web/app.js`. De neus wijst naar `-z`, de staart naar `+z`,
`y` is omhoog; het getal achter elke driehoek is de tint, waarmee een staartvin of romp los komt te
staan van de vleugel zonder een tweede materiaal.

| Soort | 3D-vorm |
| --- | --- |
| LIJN | gepijlde vleugel met staartvin — de norm, want dit is het merendeel |
| KLEIN | kleiner, rechte vleugel, geen staartvin |
| HELI | rotorschijf van vier bladen met staartboom |
| MIL | korte brede delta met rechte achterrand |
| VRACHT | de chevron met een tweede, hogere vin |
| SPORT | zweefverhoudingen: spanwijdte 3,2 tegen 1,6, geen staartvin |
| VOERTUIG | plat vierkantje op de grond |
| ONBEKEND | viervlak |

`AC_VORM` bepaalt ook de lijst `SOORTEN` en daarmee de volgorde van de knoppen in het paneel en
de regels in de legenda: één lijst, zodat ze niet uit elkaar kunnen lopen.

Een helikopter en een grondvoertuig **kantelen niet mee**. De klimhoek wordt voor de andere soorten
met 2,2 overdreven (`PITCH_BOOST`) om een klim in een schuine camera zichtbaar te maken; bij een
toestel dat vrijwel verticaal stijgt ging de romp daardoor rechtovereind staan, en dat is precies
wat een helikopter niet doet.

**Kosten.** Eén `InstancedMesh` kan maar één vorm, dus er zijn er nu acht met één gedeeld materiaal.
Gemeten met 522 toestellen in beeld: 81 tekenaanroepen per beeld tegen 75 daarvoor, en 1455
driehoeken voor de toestellen — minder dan de circa 1560 van de oude chevron, doordat KLEIN, MIL en
VOERTUIG met twee driehoeken toe kunnen. Het aantal shaderprogramma's bleef 6.

**Kleur: HOOGTE of SOORT.** De 3D-weergave kleurt standaard op hoogte; daar is die weergave voor en
er staat een schaal onder. De keuzeknop **KLEUR** zet hem op SOORT, waarna de toestellen dezelfde
acht kleuren krijgen als in de radarplot en de legenda meewisselt. Zo blijft de hoogtelezing de
standaard en schakel je om zodra je iets zoekt in plaats van afleest.

Vracht is in 3D alleen in de stand SOORT betrouwbaar te zien. Een vrachtvliegtuig en een
lijnvlucht zijn allebei grote straalvliegtuigen; op twintig beeldpunten is er geen eerlijk
vormverschil te maken, en van recht boven valt die tweede staartvin weg.

### Noodmeldingen

Zet een toestel 7500 (kaping), 7600 (radiostoring) of 7700 (noodsituatie), of geeft de bron zelf
een noodmelding mee (`minfuel`, `downed`), dan verschijnt er boven in het kaartvlak een rood blok
met de squawk, het callsign, type en registratie, hoogte en snelheid, en de afstand en peiling
vanaf je eigen punt (of anders vanaf de standaardluchthaven).

Dat gebeurt over alles wat de Pi ziet, dus ook als het toestel buiten het huidige beeld staat of
door een filter is weggedrukt. De knop **Toon** zet de hoogteband en het van/naar-filter zo nodig
terug op alles, selecteert het toestel zodat de vluchtinformatie opengaat, en zet Volgen aan, zodat
zowel de RadarPlot als de 3D-weergave ernaartoe schuift. Het kruisje sluit die ene melding; komt
dezelfde squawk later opnieuw, dan meldt hij zich weer.

Er staan er hoogstens drie tegelijk, nieuwste bovenaan. Uit te zetten met de knop NOOD onder
LABELS EN LAGEN; die stand wordt bewaard.

### Grootte van de labelteksten

Onder LABELS EN LAGEN staat een balk van acht segmenten: 70, 80, 90, 100, 110, 125, 140 en 160
procent. Die schaalt alle tekst die op de kaart getekend wordt — datablokken, bakens, luchthavens
en de regelafstand in het blok op de RadarPlot, en de labels in 3D. Handig op een 4K-scherm of van
een meter afstand. De keuze wordt bewaard.

## Telefoon

Onder 760 pixels schakelt de weergave naar een compacte opzet: de bovenbalk staat op één regel,
het paneel opent als overlay en scrollt mee, de toestelkaart is hoogstens 58% van het scherm hoog
en scrollt, en die kan nooit onder de bovenbalk komen. Knoppen en schuifregelaars zijn groter
gemaakt voor bediening met de duim.

In de RadarPlot wordt het beeld rustiger gehouden: hoogstens 22 datablokken tegelijk, namen van
bakens en routes pas bij flink inzoomen, en geen bakens meer boven 120 NM bereik. Symbolen zijn
iets groter, het raakvlak om een doel aan te tikken is 28 pixels in plaats van 18, en je kunt
knijpen om te zoomen. In de 3D-weergave gelden vergelijkbare grenzen voor labels en aantikken.

## Taal

De vlagknop in de balk schakelt tussen Nederlands en Engels, voor beide weergaven en de
toestelkaart. De keuze wordt bewaard; bij een eerste bezoek volgt hij de taal van de browser.

## Bediening en instellingen

Onderin staat een balk om de camera te draaien, te kantelen en te zoomen; ingedrukt houden laat
de beweging doorlopen. Dezelfde acties zitten op de pijltoetsen, op + en &minus;, en 0 zet het
beeld terug op het standaardzicht boven `home_airport`. Slepen verschuift nog steeds, rechts
slepen of twee vingers draait en kantelt, scrollen zoomt.

Alle instellingen, het luchthavenfilter, de camerastand en het luisterpaneel worden in de browser
bewaard (localStorage) en komen terug na een verversing. Per browser en per apparaat apart.
"Alles terug naar standaard" onderin het weergavepaneel wist die opslag en zet alles terug.

## Routes en filteren op luchthaven

ADS-B bevat geen route, alleen het callsign. De Pi zoekt per callsign de geplande route op bij
adsbdb.com en bewaart die in `cache/routes.db` (SQLite). Dat is een planningsgegeven: lijnvluchten
kloppen vrijwel altijd, GA en militair leveren meestal niets op, en bij een uitwijk blijft de oude
bestemming staan.

Routes komen van twee bronnen: adsbdb.com en hexdb.io. Die zijn het vaak oneens, en een callsign
wordt voor heen- en terugvlucht gebruikt, waardoor je de vorige vlucht te zien kreeg. De weergave
kiest daarom zelf: van beide bronnen worden beide richtingen beoordeeld op hoe goed ze passen bij
de positie en de koers van het toestel, en de beste wint. Past er niets goed, dan staat er een `?`
achter de route met de melding dat hij mogelijk verouderd is, en wordt hij één keer opnieuw
opgezocht.

De toestelkaart toont `EHAM → LEMG` met plaatsnaam en landcode eronder, en bij een geselecteerd toestel
loopt er een lijn van de herkomst via het toestel naar de bestemming (ingekort op 1800 km).
In het paneel staan knoppen per luchthaven: daarmee zie je alleen nog verkeer van en naar die
luchthaven. Toestellen zonder bekende route vallen dan weg; het aantal staat onder de knoppen.

De cache vult zich vanzelf. Wat een browser op dat moment in beeld heeft gaat voor, daarna de
toestellen het dichtst bij het middelpunt. De server onthoudt daarvoor wat er de afgelopen minuut
bekeken is, en werkt in porties van 120 zodat een nieuw beeld snel aan de beurt komt. Het tempo
richting adsbdb blijft gelijk; alleen de volgorde verandert.

De browser haalt elke acht seconden in één verzoek de routes én de Schiphol-gegevens op voor alles
in beeld, niet meer per aangeklikt toestel. Routes staan daarvoor in het geheugen van de server,
zodat zo'n verzoek geen databasezoektocht kost: in de test 5 kB in 5 ms voor het Randstad-venster.

Het luchthavenfilter werkt daardoor ook voor Schiphol-verkeer waarvan adsbdb de route (nog) niet
kent: meldt Schiphol een vertrek of aankomst, dan hoort het toestel bij EHAM. Toestellen die op de
grond staan binnen 6 km van een gekozen luchthaven blijven ook zichtbaar, met of zonder route. Na een paar uur draaien zit het
meeste vaste verkeer erin en gaan er nog nauwelijks aanvragen naar buiten.

## Volgen

De knop Volgen in de toestelkaart houdt het beeld bij het gekozen toestel. In de RadarPlot
verschuift het middelpunt mee, dus het toestel blijft in het midden staan en de kaart schuift
eronder door; het bereik verandert niet. In de 3D-weergave gaat het draaipunt van de camera mee,
zodat je erop kunt blijven inzoomen en eromheen kunt draaien terwijl het vliegt.

Het volgen stopt zodra je op een luchthavenknop drukt of een ander toestel kiest, en met een
tweede druk op de knop. Zelf slepen kan gewoon: in 3D verschuif je dan het beeld ten opzichte van
het toestel, in de RadarPlot neemt het volgen het daarna weer over.

## Wat de toestelkaart toont

Naast callsign, kenteken en type staan de waarden dubbel: voet en meter, knopen en km/u,
voet per minuut en meter per seconde, koers in graden en als windstreek. Daaronder de afgelegde
en resterende afstand plus een geschatte aankomsttijd, berekend uit de route en de grondsnelheid.
ADS-B zendt geen vertrek- of aankomsttijden uit en de gratis bronnen leveren geen vluchtschema,
dus dat blijft een schatting.

Bouwjaar, leeftijd en serienummer komen uit de vliegtuigdatabase van OpenSky, die de server één
keer per maand ophaalt (90 MB, wordt uitgepakt tot ongeveer 20 MB in `cache/routes.db`). Ongeveer
een derde van het verkeer staat erin; de rest toont eenvoudig geen bouwjaar. Uitzetten kan met
`airframes.enabled`.

## Meeluisteren

Staat `openwebrx.open_in_tab` op `true` (standaard), dan opent de knop Luister simpelweg
`openwebrx.tab_url` in een nieuw tabblad, inclusief een eventuele frequentie in de hash. Op `false` opent hij in plaats daarvan een paneel met
airband-kanalen uit `openwebrx.channels` en uit de
bookmarks van OpenWebRX (alleen 118–137 MHz). Een kanaal opent OpenWebRX in een venster
in de pagina met `#freq=...,mod=am`; er is ook een veld voor een losse frequentie en een
knop om OpenWebRX in een tabblad te openen. Staat er een toestel geselecteerd, dan komen
de kanalen van de dichtstbijzijnde luchthaven bovenaan.

Afstemmen via de URL werkt alleen binnen het SDR-profiel dat op dat moment in OpenWebRX
actief is. Met de RSPdx-R2 is dat maximaal 10 MHz breed, dus 118–137 MHz past niet in één
profiel; maak zo nodig twee airband-profielen. Kan de gebruiker van de service het
bookmarks-bestand niet lezen, dan blijft de lijst leeg en gebruik je `openwebrx.channels`.

## Beheer

    journalctl -u flighttracknl -f          # log
    sudo systemctl restart flighttracknl    # herstart
    rm -rf /opt/flighttracknl/cache/tiles   # kaartcache legen

## Bestanden

- `server.py`: backend, alleen Python-standaardbibliotheek
- `web/`: frontend (Three.js r160 lokaal in `web/vendor`, geen CDN nodig)
- `web/landen.js`: ICAO-adresblokken per land (ICAO Annex 10, deel III, hoofdstuk 9) plus de
  vlaggetjes. Het land komt uit het adres van het toestel, niet uit de registratie op de romp
- `web/firs.js`: FIR- en UIR-grenzen, afgeleid van de EUROCONTROL Network Manager (MIT)
- `web/acvorm.js`: de toestelvormen voor de 3D-weergave, hier getekend
- `web/acicons.js` en `web/icons/`: de toestelpictogrammen voor de RadarPlot (knop ICON). De
  tekeningen zijn van ADS-B Radar for macOS en mogen vrij gebruikt worden, ook commercieel, op
  voorwaarde van een verwijzing terug -- die staat in `LICENSES.md` bij de add-on en in de
  bronnenlijst onder de kaart. `acicons.js` bepaalt alleen wélk pictogram bij welk toestel hoort
  en hoe groot het staat; de kleur komt van de soortindeling
- `install.sh`: installatie als systemd-service `flighttracknl`

## De kaart

Vijf lagen, allemaal van CARTO, allemaal met dezelfde gratis sleutel in `tile_key`:

| laag | kaart |
|---|---|
| `tile_url` | 3D nacht: Dark Matter, mét plaatsnamen |
| `tile_url_day` | 3D dag: Positron zonder plaatsnamen, hermaakt (zie hieronder) |
| `tile_url_sat` | de SAT-knop in 3D: Voyager |
| `tile_url_radar` | de SAT-knop in de RadarPlot: Dark Matter zonder plaatsnamen |
| `tile_url_ref` | doorzichtige laag met alleen plaatsnamen, voor een kaart die er zelf geen heeft |

Zonder sleutel haalt de server geen tegels op: CARTO stuurt dan beelden met "API KEY REQUIRED"
erin en die mogen niet weggepoetst of omzeild worden. De pagina laat de kaart dan weg, zet SAT uit
en zegt onder de kaart waarom.

### Kleuren omzetten: `tile_palet`

De CARTO-kaarten zijn paletplaatjes: een kleurtabel van vijftig tot negentig kleuren per tegel,
meer niet. Een kleur veranderen is daarom één regel in die tabel overschrijven -- geen
beeldbewerking, geen extra bibliotheek, en het gebeurt eenmalig voordat de tegel in de cache gaat.

De dagkaart gebruikt dat standaard: Positron wordt bijgetrokken naar een licht canvas, met het
land in één rustig grijs en het water er net onder.

```json
"tile_palet": {
  "day": {
    "neutraal": true,
    "grijs_van": "#cdcdcd", "grijs_tot": "#fafafa",
    "wordt_van": "#dcdcdc", "wordt_tot": "#efefef",
    "water_min": 3, "water_van": "#d0cfd4", "water_tot": "#e9e9eb"
  }
}
```

- `vervang` zet losse kleuren om. Gaat vóór al het andere.
- `grijs_van`/`grijs_tot` zijn de donkerste en lichtste tint die de kaart zelf gebruikt,
  `wordt_van`/`wordt_tot` wat daarvoor in de plaats komt. Alles ertussen schuift evenredig mee.
  Zet de lichte kleur bij `wordt_van` om de ramp om te draaien; dat is wat de oude dagkaart deed,
  want in Dark Matter is het land juist het donkerste grijs.
- `neutraal` laat de ramp op helderheid lopen in plaats van op echt grijs (r=g=b). Zonder die
  regel blijft een kaart met een kleurzweem onaangeroerd -- Positron kleurt zijn wegen roze, en
  die horen op een grijs canvas grijs te worden.
- `water_min` is het blauwoverschot (blauw min rood) vanaf waar een kleur water is. Gemeten in het
  Positron-palet: land en wegen zitten op 0 of lager, water en zijn kustrand op 3 tot 12.
  `water_van`/`water_tot` zijn de donkerste en de lichtste waterkleur; de rand tussen zee en kust
  schuift daar netjes doorheen.
- Geen palet in het beeld (satellietbeeld is JPEG) of geen recept voor die laag: dan gaat de tegel
  onveranderd door.

Een ander recept is een andere tegel: het recept zit in de naam van de cachemap en in het merkje
achter het tegeladres, dus de browser en de schijf houden de oude kleuren niet vast.

## Licentie en voorbehoud

FlightTrackNL is MIT. Dit scherm is gemaakt om naar te kijken, niet om op te vliegen: de posities
komen van vrijwilligers met een eigen ontvanger, lopen achter, zijn onvolledig en kunnen onjuist
zijn. Niet gebruiken voor navigatie, verkeersleiding of enige beslissing waar veiligheid van
afhangt. De MIT-tekst staat in `LICENSE` hiernaast; het volledige voorbehoud en de licenties van
alle bronnen staan in
<https://github.com/RMF7916/ha-addons/blob/main/flighttracknl/LICENSES.md>. Het voorbehoud staat
ook in het scherm zelf, achter de i naast de bronvermelding.

## Bronnen en voorwaarden

- adsb.lol API (ODbL 1.0), met backoff bij rate limiting (HTTP 429)
- adsb.fi als tweede bron: alleen persoonlijk, niet-commercieel gebruik, vermelding met link verplicht
- OurAirports (luchthavens, banen en radiofrequenties, publiek domein), maandelijks ververst
- CARTO-basemaps met gratis sleutel (`tile_key`); vermelding "© OpenStreetMap-bijdragers, © CARTO"
  is voorgeschreven en moet zichtbaar blijven. Esri is er sinds 1.72.0 uit: dat mag niet zonder
  ArcGIS-abonnement, ook al antwoordt hun server zonder token
- NOAA Aviation Weather Center (METAR en SIGMET, publiek domein); RainViewer voor neerslag,
  persoonlijk en educatief gebruik, vermelding "Weather data by RainViewer"
- planespotters.net foto-API: contactgegevens in de User-Agent verplicht, bronvermelding bij de foto
- adsbdb.com en hexdb.io voor routes per callsign. De routegegevens zijn het werk van
  David J Taylor en Jim Mason en mogen niet worden herpubliceerd; `cache/routes.db` is een
  cache met vervaltermijn en blijft op je eigen machine
- OpenSky aircraft database voor bouwjaar en serienummer
- Natural Earth (publiek domein) voor kustlijn, grenzen, land en meren in de RadarPlot
- openAIP (luchtruim), met eigen API-sleutel, CC BY-NC 4.0: vermelding verplicht, niet-commercieel
- Open-Meteo voor het verticale profiel waaruit de troposferische buiging wordt berekend
  (CC BY 4.0, niet-commercieel, geen sleutel nodig)
- EUROCONTROL Network Manager voor de FIR- en UIR-grenzen (MIT, copyright (c) 2019 EUROCONTROL)
- ADS-B Radar for macOS voor de toestelpictogrammen in de RadarPlot: vrij te gebruiken, ook
  commercieel, mits je terugverwijst (<https://adsb-radar.com>)
- AIP Netherlands (LVNL) STAR-kaart EHAM voor de wachtcircuits in `web/holdings.js`
- Navigatiegegevens in X-Plane-formaat (GPL, AIRAC-cyclus 2012.08) voor bakens en luchtwegen.
  Dat is een oude cyclus: ARTIP, SUGOL, RIVER en NARSO kloppen nog, maar andere punten en routes
  zijn sinds 2012 gewijzigd (BLUFA ligt nu bijvoorbeeld bij de Duitse grens, niet meer boven zee). Heb je actuelere `earth_fix.dat`, `earth_nav.dat` en `earth_awy.dat`
  (in het 640-formaat), zet die dan in `cache/` of verwijs ernaar met `navdata.*_url`
- ICAO Doc 8643 typeaanduidingen
