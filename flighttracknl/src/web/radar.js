import { HOLDINGS, holdPattern } from './holdings.js';
import { FIRS } from './firs.js';
import { icoonVan, ICOON_MAAT } from './acicons.js';

// RadarPlot: tweedimensionale weergave in de stijl van een verkeersleidersscherm.
// Deelt de toestelgegevens met de 3D-weergave; hier alleen het tekenwerk.

const NM = 1.852;                      // km per zeemijl
// Kleuren per thema. 'nacht' = nachtblauw (standaard), 'klassiek' = de oorspronkelijke groene ondergrond.
// Datablokken, symbolen en logica zijn in beide thema's gelijk; alleen de kleuren verschillen.
const THEMES = {
  klassiek: {
    BG: '#04100a', LAND: null, SHADOW: '#04100a',
    GREEN: '#22e36b', GREEN_DIM: '#1b8f45', LEADER: '#137a3b', LABEL: '#f2f5f2',
    RING: '#2f6a94', AWY: '#2a4c6b', AWY_TXT: '#3f6f93', FIX: '#63839e', HOLD: '#7d9bb5',
    GROUND: '#7fa8c9', APT: '#ffd24a', MAP_STD: { coast: '#2a5f86', border: '#1b3d5c' },
  },
  nacht: {
    BG: '#06111d', LAND: '#0c1b2c', SHADOW: '#040b13',
    GREEN: '#3cf08f', GREEN_DIM: '#4f82aa', LEADER: '#1f8a52', LABEL: '#eaf2f8',
    RING: '#2d5f88', AWY: '#1f4a6e', AWY_TXT: '#4a7aa0', FIX: '#5381a4', HOLD: '#79a9d1',
    GROUND: '#86aecb', APT: '#ffd24a', MAP_STD: { coast: '#2f76a8', border: '#1f4a70' },
  },
};
// APT: de naam van een luchthaven. Die had de kleur van grondverkeer, en dat is hij niet -- het
// is een plek op de kaart. Amber, dezelfde kleur waarmee de balk een gekozen veld aanwijst.
let BG, LAND, SHADOW, GREEN, GREEN_DIM, LEADER, LABEL, RING, AWY, AWY_TXT, FIX, HOLD, GROUND, APT;
// Conflict en liniaal staan los van het thema: een waarschuwing hoort niet van kleur te
// veranderen omdat je een ander scherm hebt gekozen.
const STCA_KLEUR = '#ffb020', STCA_NU = '#ff4b3e', MEET_KLEUR = '#7fd4ff';
// kust en landsgrenzen: standaard (per thema), donkerpaars of donkerblauw
const MAP_COLORS = {
  std: null,
  purple: { coast: '#5a3a94', border: '#4a2f7a' },
  blue: { coast: '#2447a8', border: '#1f3f8a' },
};
function applyTheme(name) {
  const th = THEMES[name] || THEMES.nacht;
  ({ BG, LAND, SHADOW, GREEN, GREEN_DIM, LEADER, LABEL, RING, AWY, AWY_TXT, FIX, HOLD, GROUND, APT } = th);
  MAP_COLORS.std = th.MAP_STD;
}
applyTheme('nacht');
// luchtruim per openAIP-type: kleur, streepjespatroon, lijndikte, soort
const ASP_STYLE = {
  4: ['#5fb3e6', [], 1.3, 'civ'],               // CTR
  7: ['#4f93c8', [8, 4], 1.2, 'civ'],           // TMA
  26: ['#3f7aa8', [4, 4], 1.1, 'civ'],          // CTA
  10: ['#6b7f93', [12, 4, 2, 4], 1, 'civ'],     // FIR
  5: ['#6f8799', [2, 4], 1, 'civ'],             // TMZ
  6: ['#6f8799', [2, 4], 1, 'civ'],             // RMZ
  1: ['#e0606a', [3, 3], 1.2, 'mil'],           // restricted
  3: ['#e0606a', [3, 3], 1.2, 'mil'],           // prohibited
  2: ['#e0a050', [3, 3], 1.1, 'mil'],           // danger
  8: ['#b07fd6', [6, 3], 1.1, 'mil'],           // TRA
  9: ['#b07fd6', [6, 3], 1.1, 'mil'],           // TSA
};
export const ASP_TYPE = { 1: 'R', 2: 'D', 3: 'P', 4: 'CTR', 5: 'TMZ', 6: 'RMZ', 7: 'TMA', 8: 'TRA', 9: 'TSA', 10: 'FIR', 26: 'CTA' };

// De FIR-grens is geen gebied waar je in of uit vliegt maar de rand van je wereld: een eigen,
// rustige lijn die altijd staat, los van de hoogteband en van de keuze civiel of militair.
const FIR_STYLE = ['#8fa3b8', [14, 5, 3, 5], 1.1];

// openAIP levert de gebieden met hun eigen naam en een nummer voor de soort. Hieruit leiden we
// twee dingen af: bij welk veld een gebied hoort en in welke laag het valt. De namen volgen in
// Nederland een vast patroon (EHAM TMA1, CTR EHRD, CTA EHAM W, EHTRA 81 MAAS/WAAL,
// HTA10B AALTEN HELI, LFA11 KOKSIJDE TRA), dus dat is met een handvol regels te vangen.
// Dit is herkennen, geen hernoemen: het label op de kaart blijft de naam zoals openAIP hem geeft.
const ASP_VELD = /\bEH([A-Z]{2})\b/;
const ASP_NAAM_VELD = [
  [/\bAMSTERDAM\b|\bSCHIPHOL\b/, 'EHAM'],
  [/\bROTTERDAM\b/, 'EHRD'],
  [/\bEINDHOVEN\b/, 'EHEH'],
  [/\bGRONINGEN\b|\bEELDE\b/, 'EHGG'],
  [/\bMAASTRICHT\b|\bBEEK\b/, 'EHBK'],
  [/\bLELYSTAD\b/, 'EHLE'],
  [/\bVOLKEL\b/, 'EHVK'],
  [/\bLEEUWARDEN\b/, 'EHLW'],
  [/\bDE\s*KOOY\b|\bDEN\s*HELDER\b/, 'EHKD'],
  [/\bGILZE\b|\bRIJEN\b/, 'EHGR'],
  [/\bWOENSDRECHT\b/, 'EHWO'],
  [/\bDEELEN\b/, 'EHDL'],
];

// Bij welk veld hoort dit gebied? Een ICAO-code in de naam wint; anders de plaatsnaam.
// Alleen voor de gecontroleerde lagen: een oefengebied dat toevallig EHTRA 80 DEELEN heet hoort
// niet bij het veld Deelen, en zo'n koppeling zou de nadruk hieronder verkeerd laten uitvallen.
export function aspVeld(it) {
  if (!['ctr', 'tma', 'cta'].includes(aspLaag(it))) return '';
  const n = (it.n || '').toUpperCase();
  const m = n.match(ASP_VELD);
  if (m) return m[0];
  for (const [re, icao] of ASP_NAAM_VELD) if (re.test(n)) return icao;
  return '';
}

// In welke laag valt het? De soort van openAIP is leidend, de naam verfijnt hem: een
// helikoptergebied (HTA) is formeel een TRA of TSA, maar hoort in het beeld bij de helikopters.
export function aspLaag(it) {
  const n = (it.n || '').toUpperCase();
  if (it.t === 10) return 'fir';
  if (/\bHTA\b|\bHELI/.test(n)) return 'heli';
  if (it.t === 4) return 'ctr';
  if (it.t === 7) return 'tma';
  if (it.t === 26) return 'cta';
  if ([1, 2, 3, 8, 9].includes(it.t)) return 'mil';
  return 'overig';
}
export const ASP_CLASS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const SEL = '#ffd24a';
const TALK = '#58d6ff';           // dit toestel is net op de radio gehoord
const ALARM = '#ff5a4f';

// Kleur per soort verkeer. Lijnvluchten houden de themagroene kleur; de rest is vast, want de
// betekenis is vast. Militair is rood zoals in de opzet gevraagd, en ligt daarmee dicht bij het
// alarmrood — daarom krijgt een noodgeval er een ring omheen, zodat het nooit te verwarren is.
const SOORT_KLEUR = {
  mil: '#ff5252',                 // rood
  heli: '#49a9ff',                // blauw
  vracht: '#ff8a1f',              // oranje
  klein: '#8fd3a8',               // bleekgroen: familie van de lijnvlucht, maar lichter
  sport: '#c9a0ff',               // lila: zweef, ultralicht, onbemand
  grond: '#6e7f8f',               // grijs: voertuigen en obstakels, geen verkeer
};
function soortKleur(s) {
  if (s === 'onbekend') return GREEN_DIM;
  return SOORT_KLEUR[s] || GREEN;
}
// Dezelfde kleur, maar los van welk thema er nu getekend wordt: de 3D-weergave vraagt hem op
// zonder dat de radarplot draait, en dan staat GREEN nog op het thema van het laatste beeld.
export function soortHex(s, thema) {
  const th = THEMES[thema] || THEMES.nacht;
  if (s === 'onbekend') return th.GREEN_DIM;
  return SOORT_KLEUR[s] || th.GREEN;
}
const HOME = '#58d6ff';
const RWY = '#c9d3de';            // baan
const RWY_LDG = '#58d6ff';        // landen: cyaan
const RWY_DEP = '#b69cff';        // opstijgen: violet
const RWY_ALL = '#5d7185';        // middellijn van een baan die niet in gebruik is
const RWY_ID = '#93a4b6';         // baannummer bij de drempel, lichter dan de middellijn
const RWY_ID_NM = 40;             // tot en met dit bereik staan de baannummers op de kaart

export const radarOpts = {
  range: 60,            // NM van het midden tot de rand
  vector: 1,            // minuten vooruit
  history: true,
  icon: false,          // toestelsilhouet in plaats van het radarsymbool
  blocks: true,
  airways: true,
  fixes: true,
  line3: 'levels',      // 'levels' = C en X, 'dest' = bestemmingscode
  dim: 0.2,
  ringDim: 0.6,         // helderheid van ringen en peilschaal
  aspDim: 0.6,          // helderheid van de luchtruimblokken
  map: true,            // geografische kaart aan of uit
  mapDim: 0.7,          // helderheid van kust, grenzen en landvlak
  rwyDim: 0.6,          // helderheid van banen en naderingslijnen
  rwyLen: 10,           // lengte van de landingslijn in NM
  rwyShow: 'active',    // 'active' = alleen banen in gebruik, 'all' = elke baan een middellijn
  mapColor: 'std',      // 'std' | 'purple' | 'blue'
  // Plaatsnamen over de kaart. Komt van de server (tile_ref) en niet uit bewaarde instellingen:
  // of die laag zin heeft hangt af van welke kaart er onder ligt, niet van wat jij ooit koos.
  mapRef: true,
  // Merkje van de ingestelde kaartadressen, uit api/config. Hangt in het tegeladres, zodat een
  // andere kaart ook een ander adres is en de browser zijn maand oude tegels niet blijft tonen.
  tileVer: '',
  theme: 'nacht',       // 'nacht' | 'klassiek'
  home: true,
  step: 4,              // s tussen beeldverversingen; 0 = vloeiend
  rings: true,
  holds: true,           // wachtcircuits (bij NAV)
  blockMode: 'full',     // 'full' = volledig datablok, 'short' = beknopt (callsign + hoogte)
  airspace: true,        // luchtruimblokken (openAIP)
  aspKind: 'all',        // 'civ' = CTR/TMA/CTA/FIR/TMZ/RMZ, 'mil' = R/D/P/TRA/TSA, 'all'
  stcaKruis: true,       // conflictmelding boven 6000 ft, norm 5 NM
  stcaTma: true,         // onder 6000 ft, norm 3 NM
  stcaFinal: false,      // allebei onder 2000 ft, norm 2 NM -- standaard uit, zie het blok verderop
  meet: false,           // de liniaal: klik twee punten of doelen aan
  rain: false,           // neerslag over de kaart (RainViewer)
  rainDim: 0.75,         // helderheid van de neerslag
  sigmet: true,          // SIGMET-gebieden, als er welke zijn
};

export function createRadar(ctxApi) {
  const talking = new Map();            // hex -> tijdstip tot wanneer het toestel oplicht

  const { canvas, state, motionAt, visible, routeOf, fmtLevel, onSelect, band, home } = ctxApi;
  const ctx = canvas.getContext('2d');
  const center = { x: 0, z: 0 };          // in lokale km
  let vectorMap = { coast: [], border: [] };
  let nav = { points: [], ways: [] };
  let running = false, dpr = 1, W = 0, H = 0, scale = 1;
  let lastStep = 0, frozen = new Map();
  const blocks = [];                      // schermposities voor aanwijzen

  const compact = () => W < 760;
  const HIST_PT = 1;                     // grootte van een historiepunt in CSS-pixels

  // Alle tekst op de plot schaalt mee met de schuif in het weergavepaneel. Eén plek, zodat
  // datablokken, bakens en luchthavens even groot blijven ten opzichte van elkaar.
  let txtScale = 1;
  const fpx = px => Math.max(7, Math.round(px * txtScale));
  const mono = (px, vet = false) => `${vet ? 'bold ' : ''}${fpx(px)}px "B612 Mono", monospace`;
  function setTextScale(v) {
    const n = Math.max(0.7, Math.min(1.6, +v || 1));
    if (n !== txtScale) { txtScale = n; kick(); }
  }

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function project(x, z) {
    return [W / 2 + (x - center.x) * scale, H / 2 + (z - center.z) * scale];
  }
  function unproject(sx, sy) {
    return [center.x + (sx - W / 2) / scale, center.z + (sy - H / 2) / scale];
  }

  function setMap(data) { if (data) vectorMap = data; }
  function refreshLabels() { frozen.clear(); }
  function setNav(data) { if (data) nav = data; }
  let aspItems = [], aspCache = null;
  // De FIR-grenzen komen niet uit openAIP maar uit de eigen tabel; zie firs.js voor waarom.
  // Vorm van een luchtruimblok: lo en hi zijn [vluchtniveau, label zoals op de kaart].
  const firGrens = (v, grond) => v >= 999 ? [999, 'UNL'] : v <= 0 ? [0, grond] : [v, 'FL' + String(v).padStart(3, '0')];
  const FIR_ITEMS = FIRS.map(f => ({ n: f.n, t: 10, c: null, lo: firGrens(f.lo, 'GND'), hi: firGrens(f.hi, 'GND'), p: f.p }));
  // Alleen de gebieden die hier in de buurt liggen. De tabel dekt heel Europa, en een vlakke
  // projectie rond Schiphol maakt van een rand bij de Canarische Eilanden een lijn die nergens
  // op slaat; die hoort niet in beeld te kunnen komen. 3000 km is ruim: Amsterdam FIR is er 600.
  function firsHier() {
    return FIR_ITEMS.filter(it => {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [lon, lat] of it.p) {
        const [x, z] = state.toXZ(lat, lon);
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
      return x1 - x0 < 4000 && z1 - z0 < 4000
        && Math.min(Math.abs(x0), Math.abs(x1)) < 3000 && Math.min(Math.abs(z0), Math.abs(z1)) < 3000;
    });
  }
  function setAirspace(items) {
    // openAIP levert zelf ook FIR's, maar onvolledig; die vallen hier weg ten gunste van firs.js.
    aspItems = (items || []).filter(it => it.t !== 10);
    aspCache = null;
  }

  // De FIR-grens is een eigen laag, met een eigen cache en een eigen knop. Hij hoorde eerst bij
  // het luchtruim en werd met LUCHTRUIM meegeschakeld, maar dat is niet wat hij is: de CTR's en
  // TMA's zijn gebieden waar je in- en uitvliegt en die je per hoogteband en per soort filtert,
  // en de FIR-grens is de rand van je wereld. Die wil je zien terwijl je alle gebieden uit hebt.
  let firCache = null;
  function buildFir() {
    const toXZ = state.toXZ;
    firCache = { probe: toXZ(52, 5)[0], items: firsHier().map(it => {
      const a = new Float32Array(it.p.length * 2);
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      it.p.forEach(([lon, lat], i) => {
        const [x, z] = toXZ(lat, lon);
        a[i * 2] = x; a[i * 2 + 1] = z;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
      });
      return { it, a, box: [x0, z0, x1, z1] };
    }) };
  }
  // Waar kijk je naar? Dat kan een veld zijn (de gebieden met die ICAO in de naam) of een sector
  // (een of meer lagen, bijvoorbeeld de militaire gebieden). Wat eronder valt krijgt nadruk, de
  // rest blijft staan maar gedempt.
  let aspFocus = '';
  let aspLagen = new Set();
  function setFocus(icao, lagen) {
    const v = icao || '';
    const l = new Set(lagen || []);
    const zelfde = v === aspFocus && l.size === aspLagen.size && [...l].every(x => aspLagen.has(x));
    if (zelfde) return;
    aspFocus = v; aspLagen = l; kick();
  }
  function centerOn(x, z) { center.x = x; center.z = z; }
  function pan(dxKm, dzKm) { center.x += dxKm; center.z += dzKm; }
  function setRange(nm) { radarOpts.range = Math.max(3, Math.min(400, nm)); }

  // De omhullende van alles wat nu nadruk krijgt, binnen de ingestelde hoogteband. Daarmee kan
  // een knop in de bovenbalk het beeld precies zo zetten dat zijn eigen gebieden erin passen,
  // in plaats van met een vast bereik te gokken.
  function focusBox(alleen) {
    if (!aspItems.length) return null;
    if (!aspCache || aspCache.probe !== state.toXZ(52, 5)[0]) buildAsp();
    const [floorFL, ceilFL] = band();
    const beperk = alleen && alleen.length ? new Set(alleen) : null;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, n = 0;
    for (const e of aspCache.items) {
      const past = (aspFocus && e.veld === aspFocus) || (aspLagen.size > 0 && aspLagen.has(e.laag));
      if (!past) continue;
      if (beperk && !beperk.has(e.laag)) continue;      // bv. bij een veld alleen CTR en TMA
      const hi = e.it.hi[0] >= 999 ? 999 : e.it.hi[0];
      if (hi < floorFL || e.it.lo[0] > ceilFL) continue;      // buiten de band telt niet mee
      const [bx0, bz0, bx1, bz1] = e.box;
      if (bx0 < x0) x0 = bx0; if (bz0 < z0) z0 = bz0;
      if (bx1 > x1) x1 = bx1; if (bz1 > z1) z1 = bz1;
      n++;
    }
    if (!n) return null;
    return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, bkm: Math.max(1, x1 - x0), hkm: Math.max(1, z1 - z0), n };
  }

  // Zet midden en bereik zo dat die omhullende past, met wat lucht eromheen. Het bereik is de
  // straal in NM langs de kortste as, dus reken terug via dezelfde schaal die de plot gebruikt.
  function fitFocus(opt = {}) {
    const { marge = 1.25, lagen = null, min = 8, max = 400 } = opt;
    const b = focusBox(lagen);
    if (!b || !W || !H) return null;
    centerOn(b.x, b.z);
    const nodig = Math.min(W / (b.bkm * marge), H / (b.hkm * marge));
    const nm = (Math.min(W, H) / 2) / (nodig * NM);
    setRange(Math.max(min, Math.min(max, nm)));
    kick();
    return { ...b, nm: radarOpts.range };
  }

  // ---------------------------------------------------------------- ondergrond
  // Satellietbeeld. De tegels zijn Web Mercator, de plot is een vlakke projectie om het eigen
  // veld heen -- dus elke tegel wordt apart geplaatst tussen zijn twee geprojecteerde hoeken.
  // Binnen een tegel is het verschil tussen beide projecties op deze breedtegraad ruim onder
  // een beeldpunt; de hele kaart in een rechthoek leggen zou kilometers schelen.
  const SAT_MAX_Z = 16;              // hoger levert de server niet
  const RAIN_MAX_Z = 7;              // gemeten: daarboven stuurt RainViewer geen beeld maar
                                     // een plaatje met "Zoom Level Not Supported" erin
  const SAT_MAX_TEGELS = 240;        // rem: bij meer zakt hij een zoomstap terug
  let weerFrame = '';                // welk beeld van de regenradar; leeg = niets tekenen
  let sigmets = [];
  // kleur per gevaarsoort; de rest valt terug op oranje
  const SIG_KLEUR = { TS: '#ff5f4a', TSGR: '#ff5f4a', TURB: '#ffb020', ICE: '#58d6ff',
                      MTW: '#ffb020', DEFAULT: '#ffb020' };
  const fl = ft => (ft >= 1000 ? `FL${String(Math.round(ft / 100)).padStart(3, '0')}` : `${ft}ft`);
  const rasterCache = new Map();     // "laag/z/x/y" -> Image, of null als de tegel er niet is
  const RASTER_MAX = 800;            // verloopcache, oudste eruit; de regenlus vraagt
                                     // dertien beelden na elkaar op

  const lon2tile = (lon, n) => (lon + 180) / 360 * n;
  const lat2tile = (lat, n) => {
    const r = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
  };
  const tile2lon = (x, n) => x / n * 360 - 180;
  const tile2lat = (y, n) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;

  function rasterTegel(laag, z, x, y) {
    const key = `${laag}/${z}/${x}/${y}`;
    if (rasterCache.has(key)) {
      const v = rasterCache.get(key);
      rasterCache.delete(key); rasterCache.set(key, v);      // net gebruikt: achteraan
      return v;
    }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => kick();
    img.onerror = () => rasterCache.set(key, null);
    img.src = `tiles/${laag}/${z}/${x}/${y}` + (radarOpts.tileVer ? `?v=${radarOpts.tileVer}` : '');
    rasterCache.set(key, img);
    while (rasterCache.size > RASTER_MAX) rasterCache.delete(rasterCache.keys().next().value);
    return img;
  }

  // Welke tegels het beeld nu vullen, en op welke zoomstap. Geeft null als er niets te tekenen
  // valt. maxZ verschilt per laag: satellietbeeld gaat tot 16, de regenradar heeft boven 9 geen
  // eigen detail meer en zou alleen maar meer tegels kosten.
  function tegelVlak(maxZ) {
    const { toXZ, toLat, toLon } = state;
    if (!toLat || !toLon) return null;              // aanroeper zonder omgekeerde projectie
    const kmPerGraadLon = toXZ(0, 1)[0] - toXZ(0, 0)[0];
    if (!(kmPerGraadLon > 0)) return null;
    const [vx0, vz0] = unproject(0, 0), [vx1, vz1] = unproject(W, H);
    const latN = toLat(vz0), latZ = toLat(vz1), lonW = toLon(vx0), lonO = toLon(vx1);
    if (!(latN > latZ) || !(lonO > lonW)) return null;
    // zoomstap waarbij een tegel ongeveer op zijn eigen 256 beeldpunten uitkomt
    let z = Math.round(Math.log2(Math.max(1e-6, 360 * kmPerGraadLon * scale / 256)));
    z = Math.max(3, Math.min(maxZ, z));
    for (;;) {
      const n = 2 ** z;
      const x0 = Math.max(0, Math.floor(lon2tile(lonW, n)));
      const x1 = Math.min(n - 1, Math.floor(lon2tile(lonO, n)));
      const y0 = Math.max(0, Math.floor(lat2tile(Math.min(85, latN), n)));
      const y1 = Math.min(n - 1, Math.floor(lat2tile(Math.max(-85, latZ), n)));
      if (z <= 3 || (x1 - x0 + 1) * (y1 - y0 + 1) <= SAT_MAX_TEGELS) return { z, n, x0, x1, y0, y1 };
      z--;
    }
  }

  function tekenTegels(lagen, vlak, alpha) {
    const toXZ = state.toXZ;
    const { z, n, x0, x1, y0, y1 } = vlak;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = alpha;
    for (const laag of lagen) {
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const img = rasterTegel(laag, z, x, y);
          if (!img || !img.complete || !img.naturalWidth) continue;
          const [ax, az] = toXZ(tile2lat(y, n), tile2lon(x, n));
          const [bx, bz] = toXZ(tile2lat(y + 1, n), tile2lon(x + 1, n));
          const [sx0, sy0] = project(ax, az), [sx1, sy1] = project(bx, bz);
          // beide randen gelijk afronden, dan sluiten buurtegels naadloos aan
          const rx = Math.round(sx0), ry = Math.round(sy0);
          ctx.drawImage(img, rx, ry, Math.round(sx1) - rx + 1, Math.round(sy1) - ry + 1);
        }
      }
    }
    ctx.restore();
  }

  function drawRaster() {
    if (radarOpts.map === false || radarOpts.mapColor !== 'sat') return;
    const vlak = tegelVlak(SAT_MAX_Z);
    // Eigen laag, niet die van 3D: een plan view vraagt een andere kaart dan een schuine blik,
    // en met één gedeelde laag kon je daar niet in verschillen.
    //
    // De helderheid loopt via dezelfde KAART-schuif als kust en grenzen: het beeld mengt met
    // de donkere ondergrond, en dat is precies de waas die de labels leesbaar houdt.
    if (vlak) tekenTegels(radarOpts.mapRef === false ? ['radar'] : ['radar', 'ref'],
                          vlak, radarOpts.mapDim ?? 0.7);
  }

  // Neerslag. Het frame komt van buiten (app.js haalt de index op), want de plot weet niet
  // welke beelden er zijn; zonder frame is er simpelweg niets te tekenen.
  function drawRain() {
    if (!radarOpts.rain || !weerFrame) return;
    const vlak = tegelVlak(RAIN_MAX_Z);
    if (vlak) tekenTegels([`rain/${weerFrame}`], vlak, radarOpts.rainDim ?? 0.75);
  }

  // SIGMET: onweer, turbulentie of ijsvorming als omlijnd gebied, met de hoogteband erbij.
  // Zeldzaam boven Nederland, dus meestal is deze lus leeg -- dat is geen fout.
  function drawSigmet() {
    if (!radarOpts.sigmet || !sigmets.length) return;
    const toXZ = state.toXZ;
    ctx.save();
    ctx.lineWidth = 1.8;
    ctx.setLineDash([7, 5]);
    for (const s of sigmets) {
      const kleur = SIG_KLEUR[s.hazard] || SIG_KLEUR.DEFAULT;
      const pts = s.pts.map(([la, lo]) => project(...toXZ(la, lo)));
      if (pts.length < 3) continue;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.globalAlpha = 0.14; ctx.fillStyle = kleur; ctx.fill();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = kleur; ctx.stroke();
      // bijschrift in het zwaartepunt, zodat het niet op de rand valt
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
      const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      if (cx > -200 && cx < W + 200 && cy > -200 && cy < H + 200) {
        ctx.setLineDash([]);
        ctx.globalAlpha = 1; ctx.fillStyle = kleur;
        ctx.font = mono(11, true);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const band = s.top ? `${s.base ? fl(s.base) : 'GND'}-${fl(s.top)}` : '';
        ctx.fillText(`${s.qual ? s.qual + ' ' : ''}${s.hazard}`.trim(), cx, cy - 7);
        if (band) ctx.fillText(band, cx, cy + 7);
        ctx.setLineDash([7, 5]);
      }
    }
    ctx.restore();
    ctx.setLineDash([]);
  }

  function drawMap() {
    if (radarOpts.map === false || radarOpts.mapColor === 'sat') return;  // sat heeft eigen grenzen
    const toXZ = state.toXZ;
    const mc = MAP_COLORS[radarOpts.mapColor] || MAP_COLORS.std;
    ctx.save();
    ctx.globalAlpha = radarOpts.mapDim ?? 0.7;
    ctx.lineWidth = 1.6;                    // iets dikker dan voorheen
    for (const [key, color] of [['coast', mc.coast], ['border', mc.border]]) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      for (const line of vectorMap[key] || []) {
        let started = false;
        for (const [lon, lat] of line) {
          const [x, z] = toXZ(lat, lon);
          const [sx, sy] = project(x, z);
          if (!started) { ctx.moveTo(sx, sy); started = true; } else ctx.lineTo(sx, sy);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // land iets lichter dan water (alleen in thema's met een landkleur).
  // De km-coördinaten worden één keer per kaart berekend; per beeld alleen schalen en wat
  // buiten beeld valt overslaan.
  let landCache = null;
  function buildLand() {
    const toXZ = state.toXZ;
    const conv = polys => (polys || []).map(poly => {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      const rings = poly.map(ring => {
        const a = new Float32Array(ring.length * 2);
        ring.forEach(([lon, lat], i) => {
          const [x, z] = toXZ(lat, lon);
          a[i * 2] = x; a[i * 2 + 1] = z;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
        });
        return a;
      });
      return { rings, box: [x0, z0, x1, z1] };
    });
    landCache = { src: vectorMap, probe: toXZ(52, 5)[0], land: conv(vectorMap.land), lakes: conv(vectorMap.lakes) };
  }
  function drawLand() {
    if (radarOpts.map === false || radarOpts.mapColor === 'sat') return;   // beeld vult het land al
    if (!LAND || !vectorMap.land || !vectorMap.land.length) return;
    ctx.save();
    ctx.globalAlpha = radarOpts.mapDim ?? 0.7;      // het landvlak hoort bij de kaart, niet bij de rest
    if (!landCache || landCache.src !== vectorMap || landCache.probe !== state.toXZ(52, 5)[0]) buildLand();
    const [vx0, vz0] = unproject(0, 0), [vx1, vz1] = unproject(W, H);
    const fill = (polys, color) => {
      ctx.fillStyle = color;
      for (const { rings, box } of polys) {
        if (box[2] < vx0 || box[0] > vx1 || box[3] < vz0 || box[1] > vz1) continue;
        ctx.beginPath();
        for (const a of rings) {
          for (let i = 0; i < a.length; i += 2) {
            const sx = W / 2 + (a[i] - center.x) * scale, sy = H / 2 + (a[i + 1] - center.z) * scale;
            i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
          }
          ctx.closePath();
        }
        ctx.fill('evenodd');
      }
    };
    fill(landCache.land, LAND);
    fill(landCache.lakes, BG);
    ctx.restore();
  }

  // wachtcircuits (HOLDINGS uit holdings.js); zichtbaar met NAV, helderheid volgt AWY / NAVAID
  function drawHolds() {
    if (!radarOpts.fixes || !radarOpts.holds) return;
    const [floorFL, ceilFL] = band();
    const toXZ = state.toXZ;
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0.35, radarOpts.dim * 1.6));
    ctx.strokeStyle = HOLD; ctx.fillStyle = HOLD; ctx.lineWidth = 1.2;
    ctx.font = mono(9);
    for (const h of HOLDINGS) {
      if (h.maxFl < floorFL || h.minFl > ceilFL) continue;
      const pts = holdPattern(h);
      const scr = pts.map(([lat, lon]) => { const [x, z] = toXZ(lat, lon); return project(x, z); });
      if (scr.every(([sx, sy]) => sx < 0 || sy < 0 || sx > W || sy > H)) continue;
      ctx.setLineDash(h.dashed ? [5, 4] : []);
      ctx.beginPath();
      scr.forEach(([sx, sy], i) => i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy));
      ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);
      // pijl op het inbound been, vlak voor het punt
      const [ax, ay] = scr[0], [bx, by] = scr[1];
      const L = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / L, uy = (by - ay) / L;
      const px = ax + ux * L * 0.6, py = ay + uy * L * 0.6;
      ctx.beginPath();
      ctx.moveTo(px - ux * 6 - uy * 3.5, py - uy * 6 + ux * 3.5); ctx.lineTo(px, py);
      ctx.lineTo(px - ux * 6 + uy * 3.5, py - uy * 6 - ux * 3.5); ctx.stroke();
      if (scale * NM > (compact() ? 4 : 1.5)) {
        // label voorbij het verste punt van het circuit, weg van het vaste punt
        const far = scr[Math.floor(scr.length * 0.75)], [fx, fy] = scr[1];
        const d = Math.hypot(far[0] - fx, far[1] - fy) || 1;
        const tw = ctx.measureText(h.label).width;
        const lx = far[0] + (far[0] - fx) / d * (tw / 2 + 6), ly = far[1] + (far[1] - fy) / d * 10;
        ctx.shadowColor = SHADOW; ctx.shadowBlur = 4;
        ctx.fillText(h.label, lx - tw / 2, ly + 3);
        ctx.shadowBlur = 0;
      }
    }
    ctx.restore();
  }

  // De FIR-grenzen. Eigen functie, eigen knop: niets hier kijkt naar LUCHTRUIM, naar de
  // hoogteband of naar de keuze civiel/militair. Wel volgt de helderheid dezelfde schuif als het
  // luchtruim, zodat de lijnen niet luider staan dan de rest van de achtergrond.
  let firTel = 0;
  function drawFirs() {
    firTel = 0;
    if (radarOpts.fir === false) return;
    if (!firCache || firCache.probe !== state.toXZ(52, 5)[0]) buildFir();
    const [vx0, vz0] = unproject(0, 0), [vx1, vz1] = unproject(W, H);
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0.08, radarOpts.aspDim ?? 0.6));
    ctx.strokeStyle = FIR_STYLE[0]; ctx.lineWidth = FIR_STYLE[2];
    ctx.setLineDash(FIR_STYLE[1]);
    for (const { a, box } of firCache.items) {
      if (box[2] < vx0 || box[0] > vx1 || box[3] < vz0 || box[1] > vz1) continue;
      firTel++;
      ctx.beginPath();
      for (let i = 0; i < a.length; i += 2) {
        const sx = W / 2 + (a[i] - center.x) * scale, sy = H / 2 + (a[i + 1] - center.z) * scale;
        i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
      }
      ctx.closePath(); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // luchtruimblokken met onder- en bovengrens; zichtbaar volgens de hoogteband.
  // Het blok waarin het geselecteerde toestel nu vliegt, is dikker en krijgt altijd een label.
  function buildAsp() {
    const toXZ = state.toXZ;
    aspCache = { probe: toXZ(52, 5)[0], items: aspItems.map(it => {
      const a = new Float32Array(it.p.length * 2);
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, cx = 0, cz = 0;
      it.p.forEach(([lon, lat], i) => {
        const [x, z] = toXZ(lat, lon);
        a[i * 2] = x; a[i * 2 + 1] = z; cx += x; cz += z;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
      });
      // oppervlak via de schoenveterformule: bij gestapelde gebieden wint onder de muis het
      // kleinste, anders zou de CTA altijd de CTR eronder wegdrukken
      let opp = 0;
      for (let i = 0, n = a.length / 2; i < n; i++) {
        const j = (i + 1) % n;
        opp += a[i * 2] * a[j * 2 + 1] - a[j * 2] * a[i * 2 + 1];
      }
      return { it, a, veld: aspVeld(it), laag: aspLaag(it), opp: Math.abs(opp) / 2,
               box: [x0, z0, x1, z1], c: [cx / it.p.length, cz / it.p.length] };
    }) };
  }

  // ---- aanwijzen van luchtruim -------------------------------------------------
  // aspDrawn houdt bij wat er dit beeld werkelijk getekend is; alleen dát is aan te wijzen.
  // Staat het luchtruim uit, of valt een gebied buiten de hoogteband of buiten de keuze
  // civ/mil, dan staat het niet in beeld en is het ook niet aan te wijzen.
  let aspDrawn = [], aspHover = null;
  let aspTel = { uit: false, geen: true, totaal: 0, getekend: 0, filter: 0, band: 0, buiten: 0 };

  function inPolyXZ(a, x, z) {
    let raak = false;
    for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2) {
      const xi = a[i], zi = a[i + 1], xj = a[j], zj = a[j + 1];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) raak = !raak;
    }
    return raak;
  }

  function aspAt(mx, my) {
    if (!radarOpts.airspace || !aspDrawn.length) return null;
    const [wx, wz] = unproject(mx, my);
    let best = null;
    for (const d of aspDrawn) {
      const b = d.e.box;
      if (wx < b[0] || wx > b[2] || wz < b[1] || wz > b[3]) continue;
      if (!inPolyXZ(d.e.a, wx, wz)) continue;
      if (!best || d.e.opp < best.e.opp) best = d;
    }
    return best;
  }

  // Naamkaartje bij de muis: naam, ondergrens en bovengrens, in de kleur van de laag.
  function drawAspHover() {
    if (!aspHover || !aspHover.at) return;
    const { e, st, at } = aspHover;
    const regels = [e.it.n, `${e.it.lo[1]} — ${e.it.hi[1]}`];
    ctx.save();
    ctx.font = mono(10);
    const w = Math.max(...regels.map(r => ctx.measureText(r).width)) + 10;
    const h = 28;
    let bx = at[0] + 14, by = at[1] + 14;
    if (bx + w > W - 4) bx = at[0] - 14 - w;          // tegen de rand: naar de andere kant
    if (by + h > H - 4) by = at[1] - 14 - h;
    ctx.fillStyle = SHADOW; ctx.globalAlpha = 0.85;
    ctx.fillRect(bx, by, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = st[0]; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
    ctx.fillStyle = LABEL; ctx.fillText(regels[0], bx + 5, by + 12);
    ctx.fillStyle = st[0]; ctx.fillText(regels[1], bx + 5, by + 24);
    ctx.restore();
  }

  function drawAirspace() {
    aspDrawn = [];
    // Tellen waarom een gebied er niet staat. Zonder dit is "het filter doet niets" niet te
    // onderscheiden van "er is niets om te filteren": laag uit, niets binnen, alles buiten de
    // hoogteband of alles buiten beeld geven alle vier hetzelfde lege scherm.
    aspTel = { uit: !radarOpts.airspace, geen: !aspItems.length,
               totaal: aspItems.length, getekend: 0, filter: 0, band: 0, buiten: 0 };
    if (!radarOpts.airspace || !aspItems.length) return;
    if (!aspCache || aspCache.probe !== state.toXZ(52, 5)[0]) buildAsp();
    const [floorFL, ceilFL] = band();
    const [vx0, vz0] = unproject(0, 0), [vx1, vz1] = unproject(W, H);
    const inside = new Set((ctxApi.airspaceOf && state.selected()) ? ctxApi.airspaceOf(state.selected()) : []);
    const base = Math.min(1, Math.max(0.08, radarOpts.aspDim ?? 0.6));
    const labels = [], taken = [];
    ctx.save();

    for (const e of aspCache.items) {
      const { it, a, box } = e;
      const st = ASP_STYLE[it.t];
      if (!st) continue;
      if (radarOpts.aspKind !== 'all' && st[3] !== radarOpts.aspKind) { aspTel.filter++; continue; }
      const hi = it.hi[0] >= 999 ? 999 : it.hi[0];
      if (hi < floorFL || it.lo[0] > ceilFL) { aspTel.band++; continue; }
      if (box[2] < vx0 || box[0] > vx1 || box[3] < vz0 || box[1] > vz1) { aspTel.buiten++; continue; }
      aspTel.getekend++;
      aspDrawn.push({ e, st });
      // Nadruk: het gebied waar het geselecteerde toestel in zit, en de gebieden van de
      // luchthaven die je bovenin hebt gekozen. De rest blijft staan maar gedempt, zodat het
      // beeld niet dichtslibt en je toch ziet wat er om je eigen gebied heen ligt.
      const eigen = (aspFocus && e.veld === aspFocus) || (aspLagen.size > 0 && aspLagen.has(e.laag));
      const nadruk = !!aspFocus || aspLagen.size > 0;
      const sel = inside.has(it) || eigen;
      // Nadruk is relatief: het gebied met nadruk staat op de ingestelde helderheid en de rest
      // wordt daaronder gedempt. Stond nadruk op 1, dan negeerde het de schuifregelaar helemaal
      // en bleven juist de gebieden die je had aangeklikt op volle sterkte staan.
      ctx.globalAlpha = sel ? base : (nadruk ? base * 0.45 : base);
      ctx.strokeStyle = st[0]; ctx.lineWidth = sel ? st[2] + 1.2 : st[2];
      ctx.setLineDash(st[1]);
      ctx.beginPath();
      for (let i = 0; i < a.length; i += 2) {
        const sx = W / 2 + (a[i] - center.x) * scale, sy = H / 2 + (a[i + 1] - center.z) * scale;
        i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
      }
      ctx.closePath(); ctx.stroke();
      const wPx = (box[2] - box[0]) * scale, hPx = (box[3] - box[1]) * scale;
      if (sel || (wPx > 90 && hPx > 45 && it.t !== 10)) labels.push([e, st, sel]);
    }
    ctx.setLineDash([]);
    // labels: naam, bovengrens, streep, ondergrens (zoals op een luchtvaartkaart)
    ctx.font = mono(9);
    labels.sort((p, q) => q[2] - p[2]);
    for (const [e, st, sel] of labels) {
      const [px, py] = project(e.c[0], e.c[1]);
      const name = e.it.n.length > 18 ? e.it.n.slice(0, 18) : e.it.n;
      const w = Math.max(ctx.measureText(name).width, ctx.measureText(e.it.hi[1]).width, ctx.measureText(e.it.lo[1]).width);
      const bx = px - w / 2, by = py - 18;
      if (!sel && taken.some(b => bx < b[0] + b[2] + 6 && bx + w + 6 > b[0] && by < b[1] + 36 && by + 36 > b[1])) continue;
      taken.push([bx, by, w]);
      ctx.globalAlpha = sel ? base : base * 0.8;
      ctx.fillStyle = st[0]; ctx.strokeStyle = st[0]; ctx.lineWidth = 1;
      ctx.shadowColor = SHADOW; ctx.shadowBlur = 3;
      ctx.fillText(name, bx, by + 8);
      ctx.fillText(e.it.hi[1], px - ctx.measureText(e.it.hi[1]).width / 2, by + 19);
      ctx.beginPath(); ctx.moveTo(px - w / 2, by + 22); ctx.lineTo(px + w / 2, by + 22); ctx.stroke();
      ctx.fillText(e.it.lo[1], px - ctx.measureText(e.it.lo[1]).width / 2, by + 31);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function drawRings() {
    if (!radarOpts.rings) return;
    const [cx, cy] = project(center.x, center.z);
    const stepNm = radarOpts.range <= 15 ? 5 : radarOpts.range <= 40 ? 10
      : radarOpts.range <= 120 ? 20 : 50;
    ctx.save();
    ctx.globalAlpha = Math.max(0.05, radarOpts.ringDim);
    ctx.strokeStyle = RING;
    ctx.fillStyle = GREEN_DIM;
    ctx.font = mono(10);
    ctx.lineWidth = 1;
    for (let nm = stepNm; nm <= radarOpts.range * 1.45; nm += stepNm) {
      const r = nm * NM * scale;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillText(`${nm}`, cx + 3, cy - r + 11);
    }
    // peilschaal langs de rand van het scherm, niet meebewegend met het bereik
    const outer = Math.min(W, H) / 2 - 18;
    for (let deg = 0; deg < 360; deg += 10) {
      const a = (deg - 90) * Math.PI / 180;
      const long = deg % 30 === 0;
      const r1 = outer - (long ? 14 : 7), r2 = outer;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.stroke();
      if (long) {
        const rt = outer - 24;
        ctx.fillText(String(deg / 10).padStart(2, '0'),
          cx + Math.cos(a) * rt - 6, cy + Math.sin(a) * rt + 4);
      }
    }
    ctx.restore();
  }

  // luchtwegen en bakens; zichtbaar volgens de ingestelde hoogteband
  function drawNav() {
    const [floorFL, ceilFL] = band();
    const toXZ = state.toXZ;
    ctx.save();
    ctx.globalAlpha = Math.max(0.05, radarOpts.dim);
    if (radarOpts.airways) {
      ctx.strokeStyle = AWY;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const labels = [];
      for (const [name, lo, hi, la1, lo1, la2, lo2] of nav.ways) {
        if (hi < floorFL || lo > ceilFL) continue;
        const [x1, z1] = toXZ(la1, lo1), [x2, z2] = toXZ(la2, lo2);
        const [ax, ay] = project(x1, z1), [bx, by] = project(x2, z2);
        if ((ax < 0 && bx < 0) || (ay < 0 && by < 0) || (ax > W && bx > W) || (ay > H && by > H)) continue;
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
        if (labels.length < 90 && Math.hypot(bx - ax, by - ay) > 120) {
          labels.push([name, lo, hi, (ax + bx) / 2, (ay + by) / 2]);
        }
      }
      ctx.stroke();
      if (scale * NM > (compact() ? 4 : 1.2)) {    // alleen bij genoeg zoom de routenamen
        ctx.fillStyle = AWY_TXT;
        ctx.font = mono(9);
        ctx.shadowColor = SHADOW; ctx.shadowBlur = 4;
        // vanaf 40 NM bereik ook de onder- en bovengrens (FL), zoals bij de wachtcircuits: L602 055-195.
        // Eén label per route en hoogteband; verschilt de band per stuk, dan krijgt elk stuk er één.
        const levels = radarOpts.range <= 40;
        const fl = v => (v <= 0 ? 'GND' : String(v).padStart(3, '0'));
        const done = new Set(), taken = [];
        for (const [name, lo, hi, lx, ly] of labels) {
          const key = levels ? `${name}|${lo}|${hi}` : name;
          if (done.has(key)) continue;
          const text = levels ? `${name} ${fl(lo)}-${fl(hi)}` : name;
          const w = ctx.measureText(text).width;
          // routes die over elkaar liggen: label een regel lager, of weglaten als ook dat bezet is
          let y = ly - 3, ok = false;
          for (let k = 0; k < 3 && !ok; k++, y += 11) {
            ok = !taken.some(b => lx + 3 < b[0] + b[2] + 4 && lx + 3 + w + 4 > b[0] && y - 9 < b[1] && y > b[1] - 9);
            if (ok) { taken.push([lx + 3, y, w]); ctx.fillText(text, lx + 3, y); }
          }
          if (ok) done.add(key);
        }
        ctx.shadowBlur = 0;
      }
    }
    if (radarOpts.fixes && !(compact() && radarOpts.range > 120)) {
      const showNames = scale * NM > (compact() ? 6 : 2.2);
      ctx.strokeStyle = FIX; ctx.fillStyle = FIX; ctx.lineWidth = 1;
      ctx.font = mono(9);
      for (const [ident, lat, lon, kind] of nav.points) {
        const [x, z] = toXZ(lat, lon);
        const [sx, sy] = project(x, z);
        if (sx < 0 || sy < 0 || sx > W || sy > H) continue;
        if (kind === 'fix') {
          ctx.beginPath();
          ctx.moveTo(sx, sy - 3.5); ctx.lineTo(sx + 3, sy + 2.5); ctx.lineTo(sx - 3, sy + 2.5);
          ctx.closePath(); ctx.stroke();
        } else if (kind === 'vor') {
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = i * Math.PI / 3 + Math.PI / 6;
            const px = sx + Math.cos(a) * 4.5, py = sy + Math.sin(a) * 4.5;
            i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
          }
          ctx.closePath(); ctx.stroke();
          ctx.fillRect(sx - 1, sy - 1, 2, 2);
        } else {
          ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, Math.PI * 2); ctx.stroke();
        }
        if (showNames) {
          ctx.shadowColor = SHADOW; ctx.shadowBlur = 4;
          ctx.fillText(ident, sx + 5, sy + 3);
          ctx.shadowBlur = 0;
        }
      }
    }
    ctx.restore();
  }

  function drawHome() {
    if (!home || !home.ok || !radarOpts.home) return;
    const [sx, sy] = project(home.x, home.z);
    if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) return;
    ctx.strokeStyle = HOME; ctx.fillStyle = HOME; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx - 8, sy); ctx.lineTo(sx + 8, sy);
    ctx.moveTo(sx, sy - 8); ctx.lineTo(sx, sy + 8);
    ctx.stroke();
    ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
    ctx.font = mono(10);
    ctx.shadowColor = SHADOW; ctx.shadowBlur = 4;
    ctx.fillText(home.label || '', sx + 10, sy + 12);
    ctx.shadowBlur = 0;
  }

  function drawAirports() {
    const mon = ctxApi.runways;
    const now = Date.now() / 1000;
    const nmPx = scale * 1.852;
    const vis = (x, y) => x > -300 && y > -300 && x < W + 300 && y < H + 300;
    ctx.save();
    ctx.globalAlpha = Math.max(0.1, radarOpts.rwyDim);
    // de banen zelf, dikker naarmate je verder inzoomt
    ctx.strokeStyle = RWY;
    ctx.lineWidth = Math.max(1.6, Math.min(4, scale * 0.25));
    ctx.lineCap = 'butt';
    for (const ap of state.airports) {
      const [sx, sy] = project(ap.x, ap.z);
      if (!vis(sx, sy)) continue;
      for (const r of ap.runways || []) {
        const [x1, z1] = state.toXZ(r.lat1, r.lon1), [x2, z2] = state.toXZ(r.lat2, r.lon2);
        const [ax, ay] = project(x1, z1), [bx, by] = project(x2, z2);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }
    }
    // landen, opstijgen en eventueel de middellijn van alle banen
    if (mon) {
      ctx.font = mono(10);
      ctx.shadowColor = SHADOW;
      const used = [];
      for (const e of mon.ends()) {
        const [tx, ty] = project(e.T[0], e.T[1]);
        if (!vis(tx, ty)) continue;
        const [ox, oy] = project(e.O[0], e.O[1]);
        const len = Math.hypot(ox - tx, oy - ty) || 1;
        const ux = (ox - tx) / len, uy = (oy - ty) / len;      // richting van start naar einde, op het scherm
        const ldg = mon.state(e.ldg, now), dep = mon.state(e.dep, now);
        const base = Math.max(0.1, radarOpts.rwyDim);
        // De twee standen sluiten elkaar uit. IN GEBR laat zien wat er nu gebeurt: de volledige
        // landingslijn met de tikken per NM en de pijl naar de drempel, en de vertrekpijl voorbij
        // het baaneinde. ALLE laat zien wat er ligt: van elk baaneinde een gestippelde middellijn
        // met zijn nummer aan het uiteinde, en niets anders. Alleen het nummer draagt daar de
        // kleur van de beweging; de lijn blijft grijs, ook bij een baan in gebruik.
        if (radarOpts.rwyShow === 'all') {
          const L = radarOpts.rwyLen * nmPx;
          const ex = tx - ux * L, ey = ty - uy * L;
          ctx.globalAlpha = base * 0.5;
          ctx.strokeStyle = RWY_ALL; ctx.lineWidth = 1;
          ctx.setLineDash([4, 5]);
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(ex, ey); ctx.stroke();
          ctx.setLineDash([]);
          // Het nummer aan het uiteinde van de middellijn, waar je vandaan komt: 24 aan het eind
          // van de lijn naar 24 toe, 06 aan de andere kant. Tot en met 40 NM; daarboven zet elk
          // veld in beeld zijn nummers erbij en slibt de kaart dicht.
          if (radarOpts.range <= RWY_ID_NM && e.id !== '?') {
            ctx.globalAlpha = base * (ldg || dep ? 0.95 : 0.85);
            ctx.fillStyle = ldg ? RWY_LDG : dep ? RWY_DEP : RWY_ID;
            ctx.font = mono(10);
            label(e.id, ex - ux * 10, ey - uy * 10, used);
          }
        } else {
          if (ldg) {
            ctx.globalAlpha = base * (ldg === 'active' ? 1 : 0.4);
            const L = radarOpts.rwyLen * nmPx;
            const ex = tx - ux * L, ey = ty - uy * L;
            ctx.strokeStyle = RWY_LDG; ctx.fillStyle = RWY_LDG; ctx.lineWidth = 1.2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(ex, ey); ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            for (let k = 1; k <= radarOpts.rwyLen; k++) {         // tik per NM, lang bij 5 en 10
              const px = tx - ux * k * nmPx, py = ty - uy * k * nmPx, h = k % 5 === 0 ? 6 : 3;
              ctx.moveTo(px - uy * h, py + ux * h); ctx.lineTo(px + uy * h, py - ux * h);
            }
            ctx.stroke();
            const ax = tx - ux * 1.2 * nmPx, ay = ty - uy * 1.2 * nmPx;  // pijlpunt naar de drempel
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(ax - ux * 8 - uy * 5, ay - uy * 8 + ux * 5); ctx.lineTo(ax, ay);
            ctx.lineTo(ax - ux * 8 + uy * 5, ay - uy * 8 - ux * 5); ctx.stroke();
            rim(tx, ty, ox, oy, ux, uy, RWY_LDG);
            label(`${e.id} LDG`, ex - ux * 10, ey - uy * 10, used);
          }
          if (dep) {
            ctx.globalAlpha = base * (dep === 'active' ? 1 : 0.4);
            const fx = ox + ux * 3 * nmPx, fy = oy + uy * 3 * nmPx;
            ctx.strokeStyle = RWY_DEP; ctx.fillStyle = RWY_DEP; ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(fx, fy); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(fx - ux * 9 - uy * 6, fy - uy * 9 + ux * 6); ctx.lineTo(fx, fy);
            ctx.lineTo(fx - ux * 9 + uy * 6, fy - uy * 9 - ux * 6); ctx.stroke();
            if (!ldg) rim(tx, ty, ox, oy, ux, uy, RWY_DEP);
            label(`${e.id} DEP`, fx + ux * 10, fy + uy * 10, used);
          }
        }
      }
      ctx.shadowBlur = 0;
    }
    ctx.restore();

    // luchthavennamen
    ctx.fillStyle = APT;
    ctx.font = mono(10);
    for (const ap of state.airports) {
      const [sx, sy] = project(ap.x, ap.z);
      if (sx < -60 || sy < -60 || sx > W + 60 || sy > H + 60) continue;
      // De naam buiten de baanfiguur, niet in het midden ervan: op het middelpunt lag hij
      // precies over de banen heen, en juist als je ingezoomd bent kijk je daarnaar.
      // ap._straal is de afstand van het middelpunt tot de verste baankop, in wereldeenheden.
      if (scale * NM * 10 > (compact() ? 45 : 26)) {
        let sr = 0;
        if (ap._straal) {
          const [ex, ey] = project(ap.x + ap._straal, ap.z);
          sr = Math.min(Math.hypot(ex - sx, ey - sy), 140);
        }
        ctx.fillText(ap.icao, sx + sr + 5, sy - 5);
      }
      else ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
    }

    function rim(tx, ty, ox, oy, ux, uy, color) {
      const n = Math.max(3, Math.min(6, scale * 0.35));
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx - uy * n, ty + ux * n); ctx.lineTo(ox - uy * n, oy + ux * n);
      ctx.moveTo(tx + uy * n, ty - ux * n); ctx.lineTo(ox + uy * n, oy - ux * n);
      ctx.stroke();
    }
    function label(text, x, y, taken) {
      // labels van meerdere banen niet op elkaar: schuif door tot er plek is
      const w = ctx.measureText(text).width + 4;
      let bx = x - w / 2, by = y - 6;
      for (let i = 0; i < 6; i++) {
        if (!taken.some(b => bx < b[0] + b[2] && bx + w > b[0] && by < b[1] + 12 && by + 12 > b[1])) break;
        by += 12;
      }
      taken.push([bx, by, w]);
      ctx.shadowBlur = 4;
      ctx.fillText(text, bx + 2, by + 9);
      ctx.shadowBlur = 0;
    }
  }

  // ---------------------------------------------------------------- doelen
  // Een soort krijgt een eigen vorm én een eigen kleur. Alleen kleur is te weinig: op de grond is
  // alles gedempt grijsblauw, en wie kleuren slecht scheidt houdt dan niets over. De vorm draagt
  // de betekenis, de kleur bevestigt hem.
  // ------------------------------------------------------------ pictogram in plaats van symbool
  // Met ICON aan staat er geen radarsymbool meer maar een tekening van het toestel zelf, in
  // bovenaanzicht en op koers gedraaid. De tekeningen komen uit web/icons/ (zie acicons.js voor
  // waar ze vandaan komen en onder welke voorwaarde); de kleur komt van ons.
  //
  // Doorkleuren gebeurt één keer per combinatie van tekening en kleur, op een eigen vlakje: de
  // tekening erop, dan alles wat niet doorzichtig is overschilderen. Daarna is het per toestel
  // nog één drawImage. Zonder die tussenstap zou elk beeld opnieuw een SVG moeten ontleden, en
  // dat is bij vijfhonderd doelen het verschil tussen soepel en niet.
  //
  // Dit is een keuze, geen vervanging. Een radarsymbool zegt in vijf beeldpunten wát iets is en
  // staat er bij vijfhonderd doelen nog; een tekening zegt hoe het eruitziet en vraagt ruimte.
  // Daarom gaan met ICON ook de historiepunten weg: anders wordt het onder de drukte een vlek.
  const ICOON_PX = 96;                  // waarop de tekening wordt vastgelegd; groter dan hij staat
  const icoonBeeld = new Map();         // naam -> Image (of null zolang hij laadt)
  const icoonVlak = new Map();          // naam|kleur -> vlakje in die kleur
  function icoonLaad(naam) {
    if (icoonBeeld.has(naam)) return icoonBeeld.get(naam);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { icoonBeeld.set(naam, img); kick(); };
    img.onerror = () => icoonBeeld.set(naam, false);   // niet blijven proberen
    img.src = `icons/${naam}.svg`;
    icoonBeeld.set(naam, null);
    return null;
  }
  function icoonGekleurd(naam, kleur) {
    const sleutel = naam + '|' + kleur;
    let vlak = icoonVlak.get(sleutel);
    if (vlak) return vlak;
    const img = icoonBeeld.get(naam);
    if (!img) return null;
    vlak = document.createElement('canvas');
    vlak.width = vlak.height = ICOON_PX;
    const g = vlak.getContext('2d');
    g.drawImage(img, 0, 0, ICOON_PX, ICOON_PX);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = kleur;
    g.fillRect(0, 0, ICOON_PX, ICOON_PX);
    if (icoonVlak.size > 400) icoonVlak.clear();       // thema om, kleuren om: opnieuw beginnen
    icoonVlak.set(sleutel, vlak);
    return vlak;
  }

  // Aan de grond en ver uitgezoomd: dan niet. Op een platform staan tientallen toestellen naast
  // elkaar en op 60 NM is dat bij elkaar één witte vlek waarin niets meer te onderscheiden valt;
  // het kruisje van het radarsymbool blijft daar leesbaar. Gemeten bij EHAM op 60 NM: de hele
  // westkant van de luchthaven liep dicht. Zoom je in tot 10 NM, dan ligt het platform
  // ver genoeg uit elkaar en krijgen ze hun tekening wel.
  const ICOON_GROND_NM = 10;

  function iconSymbol(sx, sy, a, color, ex, ey) {
    if (a.ground && radarOpts.range > ICOON_GROND_NM) return false;
    const naam = a.icoon || 'a3';            // gezet waar ook de soort bepaald wordt
    if (!icoonBeeld.get(naam)) { icoonLaad(naam); return false; }
    const vlak = icoonGekleurd(naam, color);
    if (!vlak) return false;
    const dx = ex - sx, dy = ey - sy;
    // Koers op het scherm: de neus wijst waar de snelheidsvector heen wijst. Staat het toestel
    // stil, dan is er geen vector en blijft alleen de uitgezonden koers over.
    const th = (dx * dx + dy * dy) > 1 ? Math.atan2(dx, -dy) : ((a.track ?? 0) * Math.PI / 180);
    const m = Math.max(11, (compact() ? 15 : 17) * txtScale) * (ICOON_MAAT[naam] || 1);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(th);
    ctx.drawImage(vlak, -m / 2, -m / 2, m, m);
    ctx.restore();
    return true;
  }

  function symbol(sx, sy, a, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    const soort = a.soort || 'lijn';
    const s = compact() ? 6 : 5, d = s * 0.72;
    ctx.beginPath();
    // Een toestel op de grond is een kruis, wat voor soort het ook is. Op een platform staan er
    // tientallen naast elkaar en dan telt alleen nog dát er iets staat; de soortvorm werd daar een
    // kluwen. Een grondvoertuig houdt zijn eigen blokje, want dat is juist geen verkeer.
    if (a.ground && soort !== 'grond') {
      ctx.moveTo(sx - 3, sy); ctx.lineTo(sx + 3, sy);
      ctx.moveTo(sx, sy - 3); ctx.lineTo(sx, sy + 3);
      ctx.stroke();
      return;
    }
    switch (soort) {
      case 'grond':                       // voertuig of obstakel: gevuld vierkantje, geen verkeer
        ctx.fillStyle = color;
        ctx.fillRect(sx - 2.5, sy - 2.5, 5, 5);
        return;
      case 'mil':                         // ruit
        ctx.lineWidth = 1.5;
        ctx.moveTo(sx, sy - s * 1.15); ctx.lineTo(sx + s * 0.9, sy);
        ctx.lineTo(sx, sy + s * 1.15); ctx.lineTo(sx - s * 0.9, sy);
        ctx.closePath();
        break;
      case 'heli':                        // cirkel met kruis: de rotorschijf
        ctx.moveTo(sx + s * 0.75, sy);
        ctx.arc(sx, sy, s * 0.75, 0, Math.PI * 2);
        ctx.moveTo(sx - d, sy - d); ctx.lineTo(sx + d, sy + d);
        ctx.moveTo(sx - d, sy + d); ctx.lineTo(sx + d, sy - d);
        break;
      case 'vracht':                      // asterisk in een vierkant
        ctx.moveTo(sx - s, sy); ctx.lineTo(sx + s, sy);
        ctx.moveTo(sx, sy - s); ctx.lineTo(sx, sy + s);
        ctx.moveTo(sx - s, sy - s); ctx.lineTo(sx + s, sy - s);
        ctx.lineTo(sx + s, sy + s); ctx.lineTo(sx - s, sy + s); ctx.closePath();
        break;
      case 'sport':                       // zweef, ultralicht, UAV: lange smalle vleugel met romp
        // De vleugel moet duidelijk breder dan hoog zijn, anders is hij op vijf beeldpunten niet
        // van het kruisje van de kleine luchtvaart te onderscheiden en draagt alleen de kleur.
        ctx.moveTo(sx - s * 1.4, sy); ctx.lineTo(sx + s * 1.4, sy);
        ctx.moveTo(sx, sy - s * 0.35); ctx.lineTo(sx, sy + s * 0.35);
        break;
      case 'klein':                       // kleine luchtvaart: kruis met vier armen
        ctx.moveTo(sx - s * 0.8, sy); ctx.lineTo(sx + s * 0.8, sy);
        ctx.moveTo(sx, sy - s * 0.8); ctx.lineTo(sx, sy + s * 0.8);
        break;
      case 'onbekend':                    // geen categorie en geen vluchtnummer: open driehoek
        ctx.moveTo(sx, sy - s * 0.8); ctx.lineTo(sx + s * 0.8, sy + s * 0.6);
        ctx.lineTo(sx - s * 0.8, sy + s * 0.6); ctx.closePath();
        break;
      default:                            // lijnvlucht: asterisk met acht armen
        ctx.lineWidth = 1.5;
        ctx.moveTo(sx - s, sy); ctx.lineTo(sx + s, sy);
        ctx.moveTo(sx, sy - s); ctx.lineTo(sx, sy + s);
        ctx.moveTo(sx - d, sy - d); ctx.lineTo(sx + d, sy + d);
        ctx.moveTo(sx - d, sy + d); ctx.lineTo(sx + d, sy - d);
    }
    ctx.stroke();
  }

  function blockLines(a) {
    const r = routeOf(a);
    const alt = a.ground ? null : (a.altb ?? a.altg);
    // De klim- en daalaanwijzing wordt getekend, niet getypt: de schuine pijlen \u2197 en \u2198 zitten
    // niet in B612 Mono en vielen terug op het systeemlettertype, met een andere letterbreedte.
    // Hier blijft alleen een lege cel op de goede plek staan; dataBlock zet de pijl erin.
    const dir = a.ground ? 0 : a.vr > 300 ? 1 : a.vr < -300 ? -1 : 0;
    const fl = alt == null ? 'GND' : `F${String(Math.max(0, Math.round(alt / 10))).padStart(4, '0')}`;
    const gs = `G${String(Math.round(a.gs)).padStart(3, '0')}`;
    const lvl = v => `${String(Math.round(v / 100)).padStart(3, '0')}`;
    const third = [];
    if (radarOpts.line3 === 'dest') {
      if (r && r.dIcao) third.push(r.dIcao);                          // bestemming, bijvoorbeeld EHAM
    } else {
      if (a.mcp != null && a.mcp > 0) third.push(`C${lvl(a.mcp)}`);    // ingestelde hoogte (MCP/FCU)
      if (a.fms != null && a.fms > 0) third.push(`X${lvl(a.fms)}`);    // hoogte volgens de FMS
      if (!third.length && r && r.dIcao) third.push(r.dIcao);          // anders de bestemming
    }
    // Achter het callsign het toesteltype, als de bron dat meegeeft.
    const kop = a.cs || a.reg || a.hex.toUpperCase();
    const lines = [a.type ? `${kop} ${a.type}` : kop, `${fl}${dir ? ' ' : ''} ${gs}`];
    if (third.length) lines.push(third.join(' '));
    lines.trend = dir ? { rij: 1, kol: fl.length, dir } : null;
    return lines;
  }

  // Stijgen en dalen: hetzelfde gevulde driehoekje als in de 3D-weergave, omhoog of omlaag.
  // Eerder stonden hier de schuine pijlen \u2197 en \u2198. Die zitten niet in B612 Mono, dus
  // ze vielen terug op het systeemlettertype met een andere letterbreedte, en er was een hele
  // proefroutine nodig om te meten of het glyph er wel was. Een driehoekje tekent zichzelf,
  // staat op elk systeem gelijk, en is dezelfde vorm als in de 3D-plot.
  // hoog is de kaphoogte van de cijfers ernaast, zodat het even hoog staat als de tekst.
  function driehoek(cx, basis, dir, hoog) {
    const h = hoog * 0.86, b = hoog * 0.78;          // iets kleiner dan een cijfer: het is een teken
    const top = basis - hoog + (hoog - h) / 2, onder = top + h;
    ctx.beginPath();
    if (dir > 0) {
      ctx.moveTo(cx, top); ctx.lineTo(cx + b / 2, onder); ctx.lineTo(cx - b / 2, onder);
    } else {
      ctx.moveTo(cx, onder); ctx.lineTo(cx + b / 2, top); ctx.lineTo(cx - b / 2, top);
    }
    ctx.closePath();
    ctx.fill();
  }

  function dataBlock(sx, sy, lines, color, place, labelColor, dim = 1) {
    const [w, h] = blokMaat(lines);
    const alphaWas = ctx.globalAlpha;
    if (dim !== 1) ctx.globalAlpha = alphaWas * dim;   // krappe plek: het blok houdt zich in
    const lh = fpx(compact() ? 12 : 13);
    ctx.font = mono(compact() ? 10 : 11, true);
    const bx = sx + place[0], by = sy + place[1];
    // De arm wijst naar het midden van de tekst en stopt er vlak voor: hij raakt het midden van
    // de zijkant die naar het doel toe ligt. schuinPlaats heeft het blok daar al op gelegd, dus
    // dat punt valt precies op de 45-gradenlijn vanaf het doel. Geen liggende streep onder de
    // tekst meer; die voegde niets toe aan de aanwijzing en maakte het beeld onrustiger.
    const near = place[0] >= 0 ? bx - 3 : bx + w + 3;
    const ly = by + h / 2;
    // De leader is een aanwijzing, geen gegeven: hij mag dunner staan dan de koerslijnen.
    ctx.strokeStyle = color === GREEN ? LEADER : color; ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(sx, sy); ctx.lineTo(near, ly);
    ctx.stroke();
    ctx.fillStyle = labelColor;
    ctx.shadowColor = SHADOW; ctx.shadowBlur = 3;
    lines.forEach((l, i) => ctx.fillText(l, bx, by + lh - 2 + i * lh));
    if (lines.trend) {
      const { rij, kol, dir } = lines.trend;
      const m = ctx.measureText('0');
      const hoog = m.actualBoundingBoxAscent || fpx(8);   // kaphoogte van de cijfers ernaast
      const basis = by + lh - 2 + rij * lh;               // dezelfde basislijn als de tekst
      const px = bx + ctx.measureText((lines[rij] || '').slice(0, kol)).width + m.width / 2;
      ctx.fillStyle = labelColor;
      ctx.shadowBlur = 2;
      driehoek(px, basis, dir, hoog);
      ctx.shadowBlur = 3;
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = alphaWas;
    return [bx - 3, by - 3, w + 6, h + 6];
  }

  function segHitsBox(x1, y1, x2, y2, b, pad = 7) {
    const L = b[0] - pad, T = b[1] - pad, R = b[0] + b[2] + pad, B = b[1] + b[3] + pad;
    const inside = (x, y) => x >= L && x <= R && y >= T && y <= B;
    if (inside(x1, y1) || inside(x2, y2)) return true;
    // Liang-Barsky: snijdt het lijnstuk de rechthoek?
    let t0 = 0, t1 = 1;
    const dx = x2 - x1, dy = y2 - y1;
    for (const [p, q] of [[-dx, x1 - L], [dx, R - x1], [-dy, y1 - T], [dy, B - y1]]) {
      if (p === 0) { if (q < 0) return false; continue; }
      const t = q / p;
      if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
  }

  // ---------------------------------------------------------------- labels rustig houden
  // De plek van een datablok werd elk beeld opnieuw gekozen: de eerste van de acht kandidaten die
  // helemaal vrij lag. Binair en zonder geheugen, en dat kostte twee dingen. Eén pixel overlap
  // liet het blok naar een andere hoek springen, en lag geen enkele kandidaat vrij - bij ruim
  // zestig toestellen was dat meer dan de helft van de tijd - dan verdween het label tot het
  // volgende beeld. Gemeten op een normaal beeld: vijf hoeksprongen en vier keer verschijnen of
  // verdwijnen per seconde.
  //
  // Nu krijgt elke kandidaat een prijs in plaats van een ja of nee, en onthoudt elk toestel waar
  // zijn blok stond. De oude plek krijgt korting, een wissel moet even standhouden voordat hij
  // doorgaat, en een blok dat een hoekje overlapt mag blijven staan (gedimd, zodat je ziet dat
  // het krap is) in plaats van te verdwijnen.
  //
  // De getallen hieronder zijn uitgemeten, niet gegokt. Wat het meeste hielp bleek de boete voor
  // een plek die een koerslijn kruist: die stond zo hoog dat hij dwars door de kleefkracht heen
  // brak, en omdat de koerslijnen elk beeld opnieuw worden gerekend wipte een blok dat een lijn
  // net wel of net niet raakte heen en weer. Boete omlaag tot onder de kleefkracht: van vijf
  // sprongen per seconde naar één. Kleefkracht daarna omhoog: naar nul.
  // Gemeten op hetzelfde beeld, per seconde: sprongen 4,9 -> 0, knipperen 3,9 -> 2,2, en
  // evenveel blokken met een label als eerst.
  // Wat NIET hielp: de volgorde waarin toestellen hun plek kiezen vastzetten op hun hex. Dat
  // klonk logisch - wie het eerst kiest krijgt de beste plek - maar het maakte het meetbaar
  // erger (4,8 sprongen en 5,2 keer knipperen), want dan wijkt altijd dezelfde.
  const lblPlek = new Map();          // hex -> { idx, wil, sinds, aan, wilAan, aanSinds }
  const KLEEF = 9000;               // korting op de prijs van de plek waar het blok nu staat
  const WISSEL_MS = 1200;           // zo lang moet een betere plek beter blijven
  const LIJNBOETE = 2200;           // boete voor een plek die een koerslijn kruist
  const TOON_MS = 2500;             // zo lang moet 'past niet meer' aanhouden voor het weggaat
  const DRUK = 0.10;                  // hierboven overlapt het blok merkbaar: dimmen
  const VOL = 0.30;                   // hierboven is het te druk en blijft het blok weg

  // Hoeveel beeldpunten overlapt deze doos met wat er al staat? Oppervlak, want een hoekje van
  // tien punten is minder erg dan een blok dat half onder een ander ligt.
  function overlapOpp(box, boxes) {
    let som = 0;
    for (const b of boxes) {
      const w = Math.min(box[0] + box[2], b[0] + b[2]) - Math.max(box[0], b[0]);
      const h = Math.min(box[1] + box[3], b[1] + b[3]) - Math.max(box[1], b[1]);
      if (w > 0 && h > 0) som += w * h;
    }
    return som;
  }

  function fits(box, boxes) {
    for (const b of boxes) {
      if (box[0] < b[0] + b[2] && box[0] + box[2] > b[0] && box[1] < b[1] + b[3] && box[1] + box[3] > b[1]) return false;
    }
    return true;
  }

  // Het datablok staat altijd schuin op de koers: de leader verlaat het doel onder 45 graden.
  // Welke van de vier hoeken het wordt maakt niet uit, als het maar geen koerslijn kruist en
  // niet op een ander blok valt. De twee achterwaartse hoeken gaan voor, want daar ligt alleen
  // het spoor en niet de snelheidsvector.
  const HOEKEN = [135, -135, 45, -45];
  const ARM = () => (compact() ? 44 : 36);           // afstand doel -> aanhechtpunt van de arm
  const ARM2 = () => ARM() + 26;                     // tweede ring, als de eerste vol zit

  // De maat van de tekst zelf; dataBlock en de botsingsdoos rekenen er allebei mee, zodat de
  // hoek waar de arm op uitkomt en de doos die hij bezet niet uit elkaar lopen.
  function blokMaat(lines) {
    ctx.font = mono(compact() ? 10 : 11, true);
    return [Math.max(...lines.map(l => ctx.measureText(l).width)),
            lines.length * fpx(compact() ? 12 : 13)];
  }

  // Eenheidsvector van de koers op het scherm. De snelheidsvector is de eerste bron; staat die
  // uit of staat het toestel stil, dan de gemelde koers (noord is boven).
  function koersOpScherm(a, sx, sy, ex, ey) {
    const dx = ex - sx, dy = ey - sy, L = Math.hypot(dx, dy);
    if (L > 2) return [dx / L, dy / L];
    const t = (a.track ?? 0) * Math.PI / 180;
    return [Math.sin(t), -Math.cos(t)];
  }

  // De arm eindigt op het midden van de zijkant van het blok die naar het doel toe ligt: links
  // als het blok rechts van het doel staat, rechts als het links staat. Het blok wordt zo gelegd
  // dat dát punt precies op (ux*R, uy*R) valt — de 3 px tussenruimte zit in de plaatsing en niet
  // in de arm, zodat de hoek exact 45 graden blijft.
  function schuinPlaats(ux, uy, w, h, R) {
    return [ux > 0 ? ux * R + 3 : ux * R - 3 - w, uy * R - h / 2];
  }

  // De vier plaatsen op een rij, eerst dichtbij en dan een ring verder.
  function schuinePlaatsen(kx, ky, w, h) {
    const basis = Math.atan2(ky, kx), uit = [];
    for (const R of [ARM(), ARM2()]) {
      for (const g of HOEKEN) {
        const r = basis + g * Math.PI / 180;
        uit.push(schuinPlaats(Math.cos(r), Math.sin(r), w, h, R));
      }
    }
    return uit;
  }

  // ---------------------------------------------------------------- labels verplaatsen en quick-look
  // Handmatig plaatsen kiest uit dezelfde vier hoeken als de automaat: ook een zelf gezet blok
  // staat schuin op de koers. Wat je kiest is welke van de vier.
  const pins = new Map();                 // hex -> hoek 0..3, index in HOEKEN
  const pinSeen = new Map();              // hex -> laatst in beeld (ms)
  let quickLook = false;
  let hoverHex = null;
  let labelHits = [];                     // [{ a, box }] van het laatst getekende beeld
  function pinnedPlace(dir, w, h, kx, ky) {
    const r = Math.atan2(ky, kx) + HOEKEN[dir % HOEKEN.length] * Math.PI / 180;
    return schuinPlaats(Math.cos(r), Math.sin(r), w, h, ARM());
  }
  // Welke van de vier hoeken ligt het dichtst bij waar je het blok naartoe sleept?
  function dirToward(dx, dy, kx, ky) {
    const basis = Math.atan2(ky, kx), doel = Math.atan2(dy, dx);
    let best = 0, bd = Infinity;
    for (let i = 0; i < HOEKEN.length; i++) {
      const r = basis + HOEKEN[i] * Math.PI / 180;
      let d = Math.abs(((doel - r + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function shortLines(lines) {
    // kort: alleen het callsign zonder type, en van de tweede regel alleen de hoogte
    const kort = [(lines[0] || '').split(' ')[0],
                  (lines[1] || '').split(' ')[0] + (lines.trend ? ' ' : '')];
    kort.trend = lines.trend;
    return kort;
  }
  function callLines(lines) {
    // alleen het callsign: één regel, dus ook geen hoogte en geen trendpijl ernaast
    return [(lines[0] || '').split(' ')[0]];
  }
  function kick() { lastStep = 0; }                  // direct opnieuw tekenen
  function setQuickLook(on) { if (quickLook !== on) { quickLook = on; kick(); } }


  // Alle koerslijnen (spoor -> doel -> vector) van deze plot in een grof raster. Een datablok mag
  // door geen enkele daarvan lopen, ook niet van een ander toestel, dus moet dat snel te vragen zijn.
  const CEL = 96;
  const lijnen = new Map();                 // "cx,cy" -> [[x1,y1,x2,y2], ...]

  function lijnenLeeg() { lijnen.clear(); }

  function lijnToe(x1, y1, x2, y2) {
    const cx0 = Math.floor(Math.min(x1, x2) / CEL), cx1 = Math.floor(Math.max(x1, x2) / CEL);
    const cy0 = Math.floor(Math.min(y1, y2) / CEL), cy1 = Math.floor(Math.max(y1, y2) / CEL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const k = cx + ',' + cy;
        let arr = lijnen.get(k);
        if (!arr) { arr = []; lijnen.set(k, arr); }
        arr.push([x1, y1, x2, y2]);
      }
    }
  }

  function raaktLijn(b) {
    const cx0 = Math.floor((b[0] - 8) / CEL), cx1 = Math.floor((b[0] + b[2] + 8) / CEL);
    const cy0 = Math.floor((b[1] - 8) / CEL), cy1 = Math.floor((b[1] + b[3] + 8) / CEL);
    const gezien = new Set();
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const arr = lijnen.get(cx + ',' + cy);
        if (!arr) continue;
        for (const L of arr) {
          if (gezien.has(L)) continue;
          gezien.add(L);
          if (segHitsBox(L[0], L[1], L[2], L[3], b, 3)) return true;
        }
      }
    }
    return false;
  }

  function drawTargets(tNow) {
    const boxes = [];
    blocks.length = 0;
    const step = radarOpts.step;
    const vectorKm = radarOpts.vector * 60;             // seconden vooruit
    const M = { x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, stale: 0, ok: false, i: 0 };
    const list = [];
    for (const a of state.aircraft.values()) {
      if (!visible(a) || a.pt === undefined) continue;
      let pos = null;
      if (step > 0) {                                   // stapsgewijs, zoals een echte radar
        const tStep = Math.floor(a.pt / step) * step;
        const prev = frozen.get(a.hex);
        if (prev && prev.t === tStep) pos = prev;
        else {
          motionAt(a, tStep, M);
          if (!M.ok) continue;
          pos = { t: tStep, x: M.x, z: M.z, vx: M.vx, vz: M.vz, lines: blockLines(a) };
          frozen.set(a.hex, pos);
        }
      } else {
        motionAt(a, a.pt, M);
        if (!M.ok) continue;
        pos = { x: M.x, z: M.z, vx: M.vx, vz: M.vz };
      }
      const [sx, sy] = project(pos.x, pos.z);
      if (sx < -80 || sy < -80 || sx > W + 80 || sy > H + 80) continue;
      list.push({ a, pos, sx, sy, lines: pos.lines || blockLines(a) });
    }
    // eerst van alle doelen de koerslijn uitrekenen: spoorpunt -> doel -> punt van de vector
    lijnenLeeg();
    for (const it of list) {
      const a = it.a, pos = it.pos;
      it.ex = it.sx; it.ey = it.sy;
      it.tx = it.sx; it.ty = it.sy;
      if (!a.ground) {
        const [ex, ey] = project(pos.x + pos.vx * vectorKm, pos.z + pos.vz * vectorKm);
        it.ex = ex; it.ey = ey;
        const tr = a.trail;
        let shown = 0, lastT = Infinity;
        for (let k = tr.length - 1; k >= 0 && shown < 5; k--) {
          const pnt = tr[k];
          if (pnt.t > a.pt - 6 || lastT - pnt.t < 15) continue;
          const [hx, hy] = project(pnt.x, pnt.z);
          it.tx = hx; it.ty = hy;
          lastT = pnt.t; shown++;
        }
      }
      lijnToe(it.sx, it.sy, it.ex, it.ey);
      lijnToe(it.sx, it.sy, it.tx, it.ty);
    }
    doelen = list;                   // conflictmelding en meetlijn rekenen met dit beeld
    if (stcaAan() && performance.now() - conflictTijd > 900) {
      conflictTijd = performance.now();
      stcaZoek();
    } else if (!stcaAan()) conflicten = [];
    list.sort((p, q) => (q.a === state.selected() ? 1 : 0) - (p.a === state.selected() ? 1 : 0));
    const maxBlocks = compact() && !quickLook ? 22 : 1e9;      // telefoon: rustiger beeld
    let blocksDrawn = 0;
    const showBlocks = radarOpts.blocks || quickLook;
    labelHits = [];
    // volledig, kort of alleen het callsign; geselecteerd, onder de muis en noodgeval altijd
    // volledig -- juist datgene waar je naar kijkt of wat je alarmeert mag niet ingekort zijn
    const nowMs = Date.now();
    const stand = radarOpts.blockMode === 'short' || radarOpts.blockMode === 'call'
      ? radarOpts.blockMode : 'full';
    for (const it of list) {
      const a = it.a;
      const full = quickLook || stand === 'full' || a === state.selected()
        || a.hex === hoverHex || a.emerg !== 'none';
      it.show = full ? it.lines : stand === 'call' ? callLines(it.lines) : shortLines(it.lines);
      if (pins.has(a.hex)) pinSeen.set(a.hex, nowMs);
    }
    for (const [hex, seen] of pinSeen) {
      if (nowMs - seen > 30000) { pinSeen.delete(hex); pins.delete(hex); }   // toestel weg: positie vergeten
    }
    // het geheugen van de labelplekken mag niet eindeloos groeien
    if (lblPlek.size > 400) {
      const leeft = new Set(list.map(x => x.a.hex));
      for (const hex of lblPlek.keys()) if (!leeft.has(hex)) lblPlek.delete(hex);
    }
    // handmatig geplaatste blokken eerst reserveren, de automatische ontwijken ze
    if (showBlocks) {
      for (const it of list) {
        if (!pins.has(it.a.hex)) continue;
        const [bw, bh] = blokMaat(it.show);
        const [kx, ky] = koersOpScherm(it.a, it.sx, it.sy, it.ex, it.ey);
        it.pinPlace = pinnedPlace(pins.get(it.a.hex), bw, bh, kx, ky);
        boxes.push(dataBlockBox(it.sx, it.sy, it.show, it.pinPlace));
      }
    }

    for (const { a, sx, sy, ex, ey, show: lines, pinPlace } of list) {
      const sel = a === state.selected();
      const talk = (talking.get(a.hex) || 0) > nowMs;
      const nood = a.emerg !== 'none';
      const [kx, ky] = koersOpScherm(a, sx, sy, ex, ey);    // koers op het scherm, voor de arm
      const color = talk ? TALK : sel ? SEL : nood ? ALARM : a.ground ? GROUND : soortKleur(a.soort);
      if (!a.ground && radarOpts.history && !radarOpts.icon) {   // spoor als losse punten
        const tr = a.trail;
        let shown = 0, lastT = Infinity;
        ctx.fillStyle = sel ? SEL : soortKleur(a.soort);
        for (let k = tr.length - 1; k >= 0 && shown < 5; k--) {
          const p = tr[k];
          if (p.t > a.pt - 6 || lastT - p.t < 15) continue;
          const [hx, hy] = project(p.x, p.z);
          // Zo klein als een punt kan zijn en toch scherp: een vierkantje van precies één
          // CSS-pixel, uitgelijnd op het beeldpuntenraster. Een cirkel van straal 1,2 werd door
          // de antialiasing een wolkje van vier tot zes beeldpunten; dit is er één (of vier bij
          // een scherm met dubbele pixeldichtheid) en blijft daardoor hard.
          const px = Math.round(hx * dpr) / dpr, py = Math.round(hy * dpr) / dpr;
          ctx.fillRect(px, py, HIST_PT, HIST_PT);
          lastT = p.t; shown++;
        }
      }
      // De snelheidsvector voor het doel uit. Met ICON aan blijft hij weg, net als de
      // historiepunten: de tekening wijst zelf al waar het toestel heen gaat, en een streep
      // eruit maakt er een symbool mét vector van in plaats van een toestel. Het eindpunt wordt
      // nog wel uitgerekend -- daar komt de koers vandaan waarop de tekening draait, en het is
      // de plek waar het datablok omheen moet.
      if (!a.ground && !radarOpts.icon) {
        ctx.strokeStyle = color; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      }
      // geen enkel datablok over een koerslijn heen, van wie dan ook
      const crossesTrack = b => raaktLijn(b);
      if (!radarOpts.icon || !iconSymbol(sx, sy, a, color, ex, ey)) symbol(sx, sy, a, color);
      if (nood) {                                    // noodgeval: ring eromheen, want militair is
        ctx.strokeStyle = ALARM; ctx.lineWidth = 1.2;   // ook rood en dat mag nooit verwarren
        ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2); ctx.stroke();
      }
      if (talk) {                                    // pulserende ring: hier komt de stem vandaan
        const left = (talking.get(a.hex) - nowMs) / 1000;
        const ph = (nowMs % 900) / 900;
        ctx.strokeStyle = TALK;
        ctx.globalAlpha = Math.max(0.15, Math.min(1, left / 2)) * (1 - ph);
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(sx, sy, 8 + ph * 14, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (sel) {
        ctx.strokeStyle = SEL; ctx.lineWidth = 1;
        ctx.strokeRect(sx - 7, sy - 7, 14, 14);
      }
      blocks.push({ a, sx, sy, kx, ky });
      if (showBlocks && pinPlace) {
        const lblColor = talk ? TALK : sel ? SEL : a.emerg !== 'none' ? ALARM : a.ground ? GROUND : LABEL;
        const box = dataBlock(sx, sy, lines, color, pinPlace, lblColor);
        labelHits.push({ a, box });
      } else if (showBlocks && (blocksDrawn < maxBlocks || sel)) {
        blocksDrawn++;
        let box = null;
        const lblColor = talk ? TALK : sel ? SEL : a.emerg !== 'none' ? ALARM : a.ground ? GROUND : LABEL;
        const [bw, bh] = blokMaat(lines);
        const plaatsen = schuinePlaatsen(kx, ky, bw, bh);
        const staat = lblPlek.get(a.hex);
        // Prijs per kandidaat: wat hij overlapt, plus een boete als hij over een koerslijn valt,
        // plus een kleine opslag voor de verder weg liggende ring. De plek waar het blok nu
        // staat krijgt korting, zodat hij pas wijkt als een ander duidelijk beter is.
        let besteIdx = 0, besteKost = Infinity;
        for (let i = 0; i < plaatsen.length; i++) {
          const doos = dataBlockBox(sx, sy, lines, plaatsen[i]);
          let kost = overlapOpp(doos, boxes);
          if (crossesTrack(doos)) kost += LIJNBOETE;      // over een koerslijn: bijna altijd erger
          if (i >= HOEKEN.length) kost += 700;           // tweede ring: langere arm, iets duurder
          kost += i * 40;                                // bij gelijke stand wint de voorkeurshoek
          if (staat && staat.idx === i) kost -= KLEEF;
          if (kost < besteKost) { besteKost = kost; besteIdx = i; }
        }
        // Ontdenderen: een andere hoek moet WISSEL_MS lang de beste blijven voordat het blok
        // verhuist. Anders wipt hij heen en weer zodra twee toestellen elkaar net raken.
        let idx = besteIdx;
        if (staat) {
          if (besteIdx === staat.idx) { staat.wil = -1; staat.sinds = 0; idx = staat.idx; }
          else {
            if (staat.wil !== besteIdx) { staat.wil = besteIdx; staat.sinds = nowMs; }
            idx = (nowMs - staat.sinds >= WISSEL_MS) ? besteIdx : staat.idx;
          }
        }
        const place = plaatsen[idx];
        // Hoe erg overlapt de gekozen plek, als deel van het blok zelf? Een tiende is een hoekje
        // en mag, een derde maakt beide blokken onleesbaar en dan blijft dit label weg.
        const opp = Math.max(1, bw * bh);
        const deel = overlapOpp(dataBlockBox(sx, sy, lines, place), boxes) / opp;
        const raakt = crossesTrack(dataBlockBox(sx, sy, lines, place));
        // Alleen echte overlap met een ander blok is een reden om weg te blijven. Een koerslijn
        // kruisen was dat ook, en dat werkte zichzelf tegen: de prijs hierboven kiest een plek
        // die een lijn mag raken als dat goedkoper is dan overlappen, en hier werd diezelfde
        // plek daarna alsnog afgekeurd. In een rustig beeld met lange koerslijnen raakte elke
        // kandidaat wel een lijn en bleven vier van de vijf toestellen zonder blok staan.
        const past = sel || deel <= VOL;
        // Verschijnen en verdwijnen gaat met dezelfde rem als het verspringen: een blok dat net
        // niet meer past blijft nog even staan, en een blok dat weg is komt niet bij de eerste
        // gelegenheid terug. Anders knippert het bij elk beeld aan en uit.
        const st = staat || { idx, wil: -1, sinds: 0, aan: past, wilAan: past, aanSinds: 0 };
        if (past === st.aan) { st.wilAan = past; st.aanSinds = 0; }
        else {
          if (st.wilAan !== past) { st.wilAan = past; st.aanSinds = nowMs; }
          if (nowMs - st.aanSinds >= TOON_MS) st.aan = past;
        }
        st.idx = idx;
        lblPlek.set(a.hex, st);
        if (st.aan) {
          box = dataBlock(sx, sy, lines, color, place, lblColor, (deel > DRUK || raakt) ? 0.6 : 1);
          if (box) { boxes.push(box); labelHits.push({ a, box }); }
        }
      }
    }
  }

  function dataBlockBox(sx, sy, lines, place) {
    const [w, h] = blokMaat(lines);
    return [sx + place[0] - 3, sy + place[1] - 3, w + 6, h + 6];
  }


  // ---------------------------------------------------------------- conflicten en meetlijn
  // Twee dingen die een verkeersleider wel heeft en een tracker niet: zien dat twee toestellen
  // elkaar gaan naderen vóórdat het zover is, en een liniaal om afstand en peiling af te lezen.
  //
  // De conflictmelding rekent met wat er op het scherm staat: positie, grondsnelheid, koers en
  // stijgsnelheid, rechtdoor doorgetrokken. Een bocht of een klaring kent hij niet, dus dit is een
  // waarschuwing en geen voorspelling -- precies zoals de STCA van een echt systeem, die ook
  // regelmatig afgaat op twee toestellen die allang afspraken hebben.
  // De norm is niet overal dezelfde, en wat er waarschuwing is hangt af van waar je kijkt. Daarom
  // drie banden met elk een eigen toets, in plaats van één schakelaar die alles aan of uit zet:
  //
  //   KRUIS   boven 6000 ft, 5 NM -- de klassieke norm op hoogte
  //   TMA     onder 6000 ft, 3 NM -- onder radarbegeleiding mag het dichter
  //   FINAL   allebei onder 2000 ft, 2 NM -- daar staan toestellen bewust op drie mijl achter
  //           elkaar op dezelfde hoogte; die band staat standaard uit, want anders is het rond
  //           Schiphol één doorlopend alarm en kijk je er binnen een dag overheen
  //
  // De band volgt het hoogste van de twee toestellen; alleen als ze allebei laag zitten geldt
  // FINAL. Een vertrekkende op 3000 ft tegen een naderende op 1500 ft is dus TMA en geen final.
  const STCA_NM = 5;         // horizontale norm in zeemijlen, boven STCA_LAAG
  const STCA_NM_TMA = 3;     // en eronder, waar radarbegeleiding dichter toestaat
  const STCA_NM_FINAL = 2;   // op de eindnadering: krapper dan de drie mijl die daar normaal is
  const STCA_LAAG = 6000;    // voet; hieronder geldt de krappere norm
  const STCA_GEEN = 2000;    // allebei hieronder: eindnadering
  const STCA_FT = 1000;      // verticale norm in voet
  const STCA_T = 300;        // zoveel seconden vooruitkijken
  const STCA_MAX = 12;       // meer paren tegelijk tekenen maakt het beeld onleesbaar
  let doelen = [];           // de doelen van het laatste beeld, met positie en snelheid
  let conflicten = [];
  let conflictTijd = 0;

  function hoogteVan(a) { return a.ground ? null : (a.altb ?? a.altg ?? null); }

  // Twee doelen die rechtdoor vliegen: wanneer staan ze binnen de norm, horizontaal én verticaal
  // tegelijk? Horizontaal is dat een vierkantsvergelijking (de afstand tussen twee punten die
  // lineair bewegen), verticaal een gewone lijn. Allebei leveren ze een tijdvak op; overlappen die
  // binnen het venster, dan is er een conflict en is het begin van die overlap het moment.
  function paarCheck(p, q) {
    let nm;
    if (p.h < STCA_GEEN && q.h < STCA_GEEN) nm = radarOpts.stcaFinal ? STCA_NM_FINAL : 0;
    else if (Math.max(p.h, q.h) < STCA_LAAG) nm = radarOpts.stcaTma ? STCA_NM_TMA : 0;
    else nm = radarOpts.stcaKruis ? STCA_NM : 0;
    if (!nm) return null;                                       // deze band staat uit
    const R = nm * NM;
    const dx = q.x - p.x, dz = q.z - p.z;
    const dvx = q.vx - p.vx, dvz = q.vz - p.vz;
    const A = dvx * dvx + dvz * dvz;
    const B = 2 * (dx * dvx + dz * dvz);
    const C = dx * dx + dz * dz - R * R;
    let h0, h1;
    if (A < 1e-12) {                       // zelfde snelheid: de afstand verandert niet
      if (C >= 0) return null;
      h0 = 0; h1 = STCA_T;
    } else {
      const D = B * B - 4 * A * C;
      if (D <= 0) return null;             // ze komen nooit binnen de norm
      const s = Math.sqrt(D);
      h0 = (-B - s) / (2 * A); h1 = (-B + s) / (2 * A);
    }
    const dh = q.h - p.h, dvh = q.vh - p.vh;
    let v0, v1;
    if (Math.abs(dvh) < 1e-6) {
      if (Math.abs(dh) >= STCA_FT) return null;
      v0 = 0; v1 = STCA_T;
    } else {
      const ta = (-STCA_FT - dh) / dvh, tb = (STCA_FT - dh) / dvh;
      v0 = Math.min(ta, tb); v1 = Math.max(ta, tb);
    }
    const t0 = Math.max(0, h0, v0), t1 = Math.min(STCA_T, h1, v1);
    if (t1 < t0) return null;
    // de kleinste horizontale afstand binnen dat tijdvak: dat is wat je wil weten
    let tc = A < 1e-12 ? t0 : -B / (2 * A);
    tc = Math.min(Math.max(tc, t0), t1);
    const mx = dx + dvx * tc, mz = dz + dvz * tc;
    return { t0, mind: Math.hypot(mx, mz) / NM, vert: Math.abs(dh + dvh * tc) };
  }

  function stcaAan() {
    return !!(radarOpts.stcaKruis || radarOpts.stcaTma || radarOpts.stcaFinal);
  }

  function stcaZoek() {
    conflicten = [];
    if (!stcaAan()) return;
    const R = STCA_NM * NM;                       // de ruimste norm, alleen voor de grove zeef
    const lijst = [];
    for (const it of doelen) {
      const h = hoogteVan(it.a);
      if (h == null) continue;                        // aan de grond of geen hoogte: overslaan
      lijst.push({ a: it.a, sx: it.sx, sy: it.sy, x: it.pos.x, z: it.pos.z,
                   vx: it.pos.vx, vz: it.pos.vz, h, vh: (it.a.vr || 0) / 60 });
    }
    // De grove zeef eerst: twee doelen die zelfs op volle snelheid naar elkaar toe de norm niet
    // halen binnen het venster, hoeven niet door de vergelijking. Dat scheelt het leeuwendeel.
    for (let i = 0; i < lijst.length; i++) {
      const p = lijst[i];
      for (let j = i + 1; j < lijst.length; j++) {
        const q = lijst[j];
        const dx = q.x - p.x, dz = q.z - p.z;
        const vmax = Math.hypot(q.vx - p.vx, q.vz - p.vz);
        if (Math.hypot(dx, dz) - vmax * STCA_T > R) continue;
        if (Math.abs(q.h - p.h) - Math.abs(q.vh - p.vh) * STCA_T >= STCA_FT) continue;
        const c = paarCheck(p, q);
        if (c) conflicten.push({ p, q, ...c });
      }
    }
    conflicten.sort((a, b) => a.t0 - b.t0);
    if (conflicten.length > STCA_MAX) conflicten.length = STCA_MAX;
  }

  function mmss(s) {
    const n = Math.max(0, Math.round(s));
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  }

  function drawStca() {
    if (!stcaAan() || !conflicten.length) return;
    ctx.save();
    ctx.font = mono(10);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const c of conflicten) {
      const nu = c.t0 <= 1;                      // nu al binnen de norm, of pas straks
      const kleur = nu ? STCA_NU : STCA_KLEUR;
      ctx.strokeStyle = kleur;
      ctx.fillStyle = kleur;
      ctx.lineWidth = nu ? 1.6 : 1.2;
      ctx.setLineDash(nu ? [] : [5, 4]);
      ctx.beginPath();
      ctx.moveTo(c.p.sx, c.p.sy);
      ctx.lineTo(c.q.sx, c.q.sy);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const d of [c.p, c.q]) {
        ctx.beginPath();
        ctx.arc(d.sx, d.sy, 9, 0, Math.PI * 2);
        ctx.stroke();
      }
      const mx = (c.p.sx + c.q.sx) / 2, my = (c.p.sy + c.q.sy) / 2;
      const tekst = `${mmss(c.t0)}  ${c.mind.toFixed(1)} NM  ${Math.round(c.vert / 100) * 100} ft`;
      const w = ctx.measureText(tekst).width + 8;
      ctx.fillStyle = SHADOW;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(mx - w / 2, my - 7, w, 14);
      ctx.globalAlpha = 1;
      ctx.fillStyle = kleur;
      ctx.fillText(tekst, mx, my);
    }
    ctx.restore();
  }

  // De meetlijn: twee punten, elk een doel of een plek op de kaart. Hangt hij aan doelen, dan
  // loopt hij mee en staat erbij hoe snel ze naar elkaar toe gaan.
  let meet = null;            // { a, b, muis }
  function meetPunt(doel, sx, sy) {
    if (doel) return { hex: doel.hex };
    const [x, z] = unproject(sx, sy);
    return { x, z };
  }
  function meetPlek(p) {
    if (!p) return null;
    if (p.hex == null) return { x: p.x, z: p.z, v: null };
    const it = doelen.find(d => d.a.hex === p.hex);
    return it ? { x: it.pos.x, z: it.pos.z, v: { vx: it.pos.vx, vz: it.pos.vz }, a: it.a } : null;
  }
  function meetKlik(doel, sx, sy) {
    const punt = meetPunt(doel, sx, sy);
    if (!meet || meet.b) meet = { a: punt, b: null, muis: [sx, sy] };
    else meet.b = punt;
    kick();
  }
  function meetWissen() { if (meet) { meet = null; kick(); } }

  function drawMeet() {
    if (!radarOpts.meet || !meet) return;
    const A = meetPlek(meet.a);
    if (!A) { meet = null; return; }                  // het doel is uit beeld verdwenen
    const B = meet.b ? meetPlek(meet.b) : null;
    const [ax, ay] = project(A.x, A.z);
    const [bx, by] = B ? project(B.x, B.z) : (meet.muis || [ax, ay]);
    const dx = (B ? B.x : unproject(bx, by)[0]) - A.x;
    const dz = (B ? B.z : unproject(bx, by)[1]) - A.z;
    const nm = Math.hypot(dx, dz) / NM;
    let brg = Math.atan2(dx, -dz) * 180 / Math.PI;
    if (brg < 0) brg += 360;
    const regels = [`${nm.toFixed(1)} NM  ${String(Math.round(brg) % 360).padStart(3, '0')}°`];
    // Allebei een doel: dan is er ook een naderingssnelheid en een moment van kleinste afstand.
    if (A.v && B && B.v) {
      const dvx = B.v.vx - A.v.vx, dvz = B.v.vz - A.v.vz;
      const d = Math.hypot(dx, dz);
      const sluit = d > 0 ? -((dx * dvx + dz * dvz) / d) : 0;      // km/s, positief = naar elkaar toe
      const kt = sluit / NM * 3600;
      const A2 = dvx * dvx + dvz * dvz;
      const tc = A2 > 1e-12 ? -(dx * dvx + dz * dvz) / A2 : -1;
      let staart = `${kt >= 0 ? '−' : '+'}${Math.abs(Math.round(kt))} kt`;
      if (tc > 0 && tc < 3600) {
        const mind = Math.hypot(dx + dvx * tc, dz + dvz * tc) / NM;
        staart += `  CPA ${mmss(tc)} ${mind.toFixed(1)} NM`;
      }
      regels.push(staart);
    }
    ctx.save();
    ctx.strokeStyle = MEET_KLEUR;
    ctx.fillStyle = MEET_KLEUR;
    ctx.lineWidth = 1.1;
    ctx.setLineDash(B ? [] : [4, 4]);
    ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.setLineDash([]);
    for (const [px, py] of [[ax, ay], [bx, by]]) {
      ctx.beginPath(); ctx.moveTo(px - 5, py); ctx.lineTo(px + 5, py);
      ctx.moveTo(px, py - 5); ctx.lineTo(px, py + 5); ctx.stroke();
    }
    ctx.font = mono(10);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const w = Math.max(...regels.map(r => ctx.measureText(r).width)) + 8;
    const hgt = regels.length * 13 + 4;
    let tx = (ax + bx) / 2 + 8, ty = (ay + by) / 2;
    if (tx + w > W) tx = W - w - 2;
    ctx.globalAlpha = 0.78; ctx.fillStyle = SHADOW;
    ctx.fillRect(tx - 4, ty - hgt / 2, w, hgt);
    ctx.globalAlpha = 1; ctx.fillStyle = MEET_KLEUR;
    regels.forEach((r, i) => ctx.fillText(r, tx, ty - hgt / 2 + 9 + i * 13));
    ctx.restore();
  }

  // ---------------------------------------------------------------- lus
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (radarOpts.step > 0 && now - lastStep < 200) return;   // rustig verversen
    lastStep = now;
    if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize();
    scale = (Math.min(W, H) / 2) / (radarOpts.range * NM);
    applyTheme(radarOpts.theme);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    drawRaster();
    drawLand();
    drawMap();
    drawRain();                // neerslag hoort bij de ondergrond, onder het luchtruim
    drawSigmet();
    drawFirs();
    drawAirspace();
    drawNav();
    drawHolds();
    drawRings();
    drawAirports();
    drawHome();
    drawTargets();
    drawStca();                // over de doelen heen: een conflict hoort op te vallen
    drawMeet();
    drawAspHover();            // helemaal bovenop, anders loopt het kaartje onder een doel door
  }

  function start() { if (running) return; running = true; resize(); requestAnimationFrame(frame); }
  function stop() { running = false; }

  // ---------------------------------------------------------------- bediening
  let drag = null;
  const touches = new Map();
  let pinch = 0;

  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, e);
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        pinch = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        drag = null;
        return;
      }
    }
    const hitL = labelAt(e);
    if (hitL) {                                      // op een datablok: verplaatsen in plaats van schuiven
      labelDrag = { a: hitL.a, x: e.clientX, y: e.clientY, moved: false };
      drag = null;
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    drag = { x: e.clientX, y: e.clientY, moved: false, cx: center.x, cz: center.z };
    if (aspHover) { aspHover = null; kick(); }        // tijdens slepen geen naamkaartje
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, e);
      if (touches.size === 2 && pinch) {
        const [a, b] = [...touches.values()];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (d > 10) {
          setRange(radarOpts.range * (pinch / d));
          pinch = d;
          ctxApi.onMoved();
        }
        return;
      }
    }
    if (labelDrag) {
      if (Math.abs(e.clientX - labelDrag.x) + Math.abs(e.clientY - labelDrag.y) > 4) labelDrag.moved = true;
      if (labelDrag.moved) {
        const tb = blocks.find(b => b.a === labelDrag.a);
        if (tb) {
          const r = canvas.getBoundingClientRect();
          const d = dirToward(e.clientX - r.left - tb.sx, e.clientY - r.top - tb.sy, tb.kx, tb.ky);
          if (pins.get(labelDrag.a.hex) !== d) { pins.set(labelDrag.a.hex, d); kick(); }
        }
      }
      return;
    }
    if (!drag) {
      if (radarOpts.meet && meet && !meet.b) {        // het tweede punt hangt nog aan de muis
        const r = canvas.getBoundingClientRect();
        meet.muis = [e.clientX - r.left, e.clientY - r.top];
        kick();
      }
      updateHover(e);
      return;
    }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    center.x = drag.cx - dx / scale;
    center.z = drag.cz - dy / scale;
  });
  canvas.addEventListener('pointerup', e => {
    if (e.pointerType === 'touch') {
      touches.delete(e.pointerId);
      if (touches.size < 2) pinch = 0;
    }
    if (labelDrag) {
      const a = labelDrag.a, now = performance.now();
      if (!labelDrag.moved) {
        if (lastLabelClick && lastLabelClick.a === a && now - lastLabelClick.t < 350) {
          pins.delete(a.hex);                        // dubbelklik: weer automatisch
          lastLabelClick = null;
        } else {
          // klik: de volgende van de vier hoeken, vanaf waar het blok nu staat
          const hit = labelHits.find(h => h.a === a), tb = blocks.find(b => b.a === a);
          let cur = pins.get(a.hex);
          if (cur == null && hit && tb) cur = dirToward(hit.box[0] + hit.box[2] / 2 - tb.sx, hit.box[1] + hit.box[3] / 2 - tb.sy, tb.kx, tb.ky);
          pins.set(a.hex, ((cur ?? 3) + 1) % HOEKEN.length);
          lastLabelClick = { a, t: now };
        }
      }
      pinSeen.set(a.hex, Date.now());
      labelDrag = null;
      kick();
      return;
    }
    if (drag && !drag.moved) {
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      let best = null, bd = compact() ? 28 : 18;
      for (const b of blocks) {
        const d = Math.hypot(b.sx - mx, b.sy - my);
        if (d < bd) { bd = d; best = b.a; }
      }
      // Staat de liniaal aan, dan zet een klik een meetpunt in plaats van een toestel te kiezen:
      // anders springt de vluchtinformatie open terwijl je aan het meten bent.
      if (radarOpts.meet) meetKlik(best, mx, my);
      else onSelect(best);
    }
    if (drag && drag.moved) ctxApi.onMoved();
    drag = null;
  });
  canvas.addEventListener('pointerleave', () => {
    if (hoverHex || aspHover) { hoverHex = null; aspHover = null; kick(); }
  });

  let labelDrag = null, lastLabelClick = null;
  function labelAt(e) {
    if (!(radarOpts.blocks || quickLook)) return null;
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top, pad = e.pointerType === 'touch' ? 6 : 2;
    for (let i = labelHits.length - 1; i >= 0; i--) {
      const [x, y, w, h] = labelHits[i].box;
      if (mx >= x - pad && mx <= x + w + pad && my >= y - pad && my <= y + h + pad) return labelHits[i];
    }
    return null;
  }
  function updateHover(e) {
    if (e.pointerType === 'touch') return;
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = null, bd = 18;
    for (const b of blocks) {
      const d = Math.hypot(b.sx - mx, b.sy - my);
      if (d < bd) { bd = d; best = b.a.hex; }
    }
    if (!best) { const l = labelAt(e); if (l) best = l.a.hex; }
    canvas.style.cursor = labelAt(e) ? 'move' : '';
    if (best !== hoverHex) { hoverHex = best; if (radarOpts.blockMode !== 'full') kick(); }
    // Luchtruim aanwijzen gaat pas als er geen doel en geen label onder de muis zit: een toestel
    // aanwijzen is altijd belangrijker dan de naam van het gebied eronder.
    const vorig = aspHover && aspHover.e;
    const nu = best ? null : aspAt(mx, my);
    if (nu) nu.at = [mx, my];
    aspHover = nu;
    // Het kaartje loopt met de muis mee, dus elke beweging vraagt om een heel nieuw beeld. Op een
    // Pi telt dat: bij vijftien keer per seconde ging het tekenwerk tijdens muisbewegen met de
    // helft omhoog. Tien keer per seconde is voor een label dat de muis volgt niet van vloeiend te
    // onderscheiden en scheelt een derde. Een ánder gebied onder de muis gaat wel meteen.
    const t = performance.now();
    if ((nu && nu.e) !== vorig) { aspKick = t; kick(); }
    else if ((nu || vorig) && t - aspKick > 100) { aspKick = t; kick(); }
  }
  let aspKick = 0;

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    setRange(radarOpts.range * (e.deltaY > 0 ? 1.15 : 1 / 1.15));
    ctxApi.onMoved();
  }, { passive: false });

  // callsigns van de doelen die nu op het scherm staan (dat is waar de radio bij hoort)
  function shown() {
    const out = [];
    for (const b of blocks) if (b.a && b.a.cs) out.push(b.a.cs);
    return out;
  }

  // hex laten oplichten omdat dit toestel op de radio te horen was
  function setTalking(hex, seconds = 3) {
    if (!hex) return;
    talking.set(hex, Date.now() + seconds * 1000);
    for (const [h, t] of talking) if (t < Date.now() - 60000) talking.delete(h);
    kick();
  }

  // Het weer komt van buiten: app.js haalt de bronnen op en geeft door welk beeld getoond wordt.
  function setWeather(w) {
    if (!w) return;
    if ('frame' in w) weerFrame = w.frame || '';
    if (Array.isArray(w.sigmet)) sigmets = w.sigmet;
    kick();
  }

  return { start, stop, resize, setMap, setNav, refreshLabels, centerOn, pan, setRange, center, project, unproject,
    setQuickLook, redraw: kick, setAirspace, setTalking, shown, setTextScale, setFocus, fitFocus, setWeather,
          aspStats: () => aspTel, firAantal: () => firTel, stcaAantal: () => conflicten.length, meetWissen,
    get scale() { return scale; } };
}
