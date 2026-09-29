# web/logos

Logo's van luchtvaartmaatschappijen voor het vluchtenbord, als `<IATA>.png` — dus `HV.png` voor
Transavia, `KL.png` voor KLM, `FR.png` voor Ryanair.

Deze map is niet verplicht. De server haalt een logo dat hier niet staat eenmalig zelf op en
bewaart het in `cache/logos/`; wat je hier neerzet gaat daar altijd vóór. De bron staat in
`config.json` onder `logos`:

```json
"logos": {
  "enabled": true,
  "url": "https://images.kiwi.com/airlines/64/{iata}.png",
  "ttl_days": 180,
  "miss_ttl_days": 7
}
```

`{iata}` wordt de tweeletterige code, `{icao}` de drieletterige. Zet `enabled` op `false` en er
gaat niets naar buiten: dan zie je alleen wat in deze map staat. Een code die de bron niet heeft
wordt onthouden en pas na `miss_ttl_days` opnieuw geprobeerd.

De browser vraagt het logo altijd aan de eigen server, nooit rechtstreeks aan de bron. Zo praat
alleen de Pi naar buiten en blijft het bord werken als er geen internet is.

Aanbevolen formaat voor eigen bestanden: PNG met doorzichtige achtergrond, ongeveer 88 bij 40
beeldpunten (het bord schaalt naar 44 bij 20, dus twee keer zo groot is scherp op een 4K-scherm).
Een vierkant merkicoon van 64 bij 64 werkt ook; dat wordt links uitgelijnd in hetzelfde vak.

Let op: dit zijn merken van de maatschappijen zelf. Er bestaat geen vrij te gebruiken
logobibliotheek; de logo-CDN's van reisplatforms werken technisch wel maar leveren geen
gebruiksrecht, en Airhex is betaald. Voor een scherm bij je eigen ontvanger is dat een andere
afweging dan voor iets wat je publiceert — zet hier wat je zelf mag gebruiken als dat laatste
speelt, bijvoorbeeld uit de perskit van een maatschappij.

Welke codes je nodig hebt zie je vanzelf: elke regel zonder logo laat het vak leeg.
