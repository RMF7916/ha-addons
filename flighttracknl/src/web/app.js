import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { createRadar, radarOpts, ASP_TYPE, ASP_CLASS, soortHex } from './radar.js';
import { t, setLang, getLang, applyStatic, FLAG } from './i18n.js';
import { createRunwayMonitor } from './runways.js';
import { createPlayer } from './player.js';

// ------------------------------------------------------------ constants
const FT = 0.0003048;            // km per ft
const KT = 1.852 / 3600;         // km/s per knot
const KX = 111.320, KZ = 110.574;
// Verste luchthaven die in de 3D-weergave nog een code krijgt, in km vanaf het kijkpunt.
const APT_ZICHT_MAX_KM = 400;
// Tot deze camera-afstand staan de baannummers in de 3D-weergave op de banen.
const RWY_ID_3D_KM = 60;
const MAXAC = 3000;
const POLL_MS = 1500;
const SAMPLE_MIN = 1;            // s minimale afstand tussen bewaarde metingen
const FULL_WINDOW = 90;          // s waarin alle metingen bewaard blijven
const THIN_STEP = 8;             // s waarnaar oudere metingen worden uitgedund
const TRAIL_KEEP = 15 * 60;      // s spoorgeheugen in de browser
const HERMITE_MAX = 20;          // s; grotere gaten worden recht geïnterpoleerd
const STALE_S = 30;
const MAGENTA = '#e23fa0';
const ALARM = '#ff5a4f';
const NIGHT = '#0b1a2e';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const PITCH_BOOST = 2.2;      // klim- en daalhoek wordt overdreven, net als de hoogte
const PITCH_MAX = 0.7;        // rad
const GAP_FADE = 8;           // s zonder verse data: toestel begint te vervagen
const GAP_HIDE = 20;          // s zonder verse data: toestel uit beeld

const RAMP_NIGHT = [
  [0, '#ffb547'], [4000, '#f2e35b'], [10000, '#8fe38a'],
  [20000, '#4fd1c5'], [30000, '#5aa8ff'], [40000, '#8c8cff'],
].map(([ft, hex]) => [ft, new THREE.Color(hex)]);
// op een lichte kaart zijn de nachtkleuren te licht: zelfde volgorde, donkerder
const RAMP_DAY = [
  [0, '#c46a00'], [4000, '#9a8a00'], [10000, '#2f8f2a'],
  [20000, '#0f8a80'], [30000, '#1f5fc4'], [40000, '#4b3fc0'],
].map(([ft, hex]) => [ft, new THREE.Color(hex)]);
let RAMP = RAMP_NIGHT;

// Grondvoertuigen staan standaard uit: het zijn sleepwagens, volgauto's en vogelwachten op de
// platformen, en ze waren binnen 150 NM bijna 7% van het beeld. Een radarscherm laat ze niet als
// verkeer zien. De rest staat aan.
const SOORT_AAN = { lijn: true, klein: true, heli: true, mil: true, vracht: true, sport: true, grond: false, onbekend: true };
const DEFAULTS = { mode: 'lint', trailMin: 5, exag: 3, floor: 0, ceiling: Infinity, labels: true, drops: true, rwyid: true, ground: true, home: true, delay: 8, daynight: 'night', lblScale: 1, alarm: true, sector: 'all', colorBy: 'alt', lokaal: true, soort: { ...SOORT_AAN } };
const opts = { ...DEFAULTS, soort: { ...SOORT_AAN } };
const STORE = 'luchtruim.v1';

// ------------------------------------------------------------ geo
let ORIGIN = { lat: 52.13, lon: 4.60 };
let COSLAT = Math.cos(ORIGIN.lat * Math.PI / 180);
let RADIUS_KM = 463;
function toXZ(lat, lon) { return [(lon - ORIGIN.lon) * KX * COSLAT, -(lat - ORIGIN.lat) * KZ]; }
const toLat = z => ORIGIN.lat - z / KZ;
const toLon = x => ORIGIN.lon + x / (KX * COSLAT);

function altColor(ft, out) {
  if (ft <= RAMP[0][0]) return out.copy(RAMP[0][1]);
  for (let i = 1; i < RAMP.length; i++) {
    if (ft <= RAMP[i][0]) {
      const [f0, c0] = RAMP[i - 1], [f1, c1] = RAMP[i];
      return out.copy(c0).lerp(c1, (ft - f0) / (f1 - f0));
    }
  }
  return out.copy(RAMP[RAMP.length - 1][1]);
}
const C_SEL = new THREE.Color(MAGENTA);
const C_ALARM = new THREE.Color(ALARM);
const tmpC = new THREE.Color();
const colA = new THREE.Color();

// ------------------------------------------------------------ renderer / scene
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, 2);
renderer.setPixelRatio(pixelRatio);
const scene = new THREE.Scene();
const BG = new THREE.Color(NIGHT);
scene.background = BG;
const FOG_DENSITY = 0.0014;
scene.fog = new THREE.FogExp2(BG, FOG_DENSITY);

const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 6000);
const controls = new MapControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.09;
controls.screenSpacePanning = false;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 1.2;
controls.maxDistance = 1300;
controls.zoomToCursor = true;
controls.zoomSpeed = 1.2;

canvas.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  $('statusAge').textContent = 'grafische context verloren, herstellen…';
});
canvas.addEventListener('webglcontextrestored', () => {
  renderer.resetState();
  trailsDirty = true;
  $('statusAge').textContent = '';
});


function layoutPanel() {
  // Hoogte van de overlays in JavaScript bepalen: iOS-Safari kent dvh niet altijd,
  // en dan valt een calc() met dvh helemaal weg.
  const root = document.documentElement;
  const bar = document.querySelector('.bar');
  const cam = document.getElementById('camctl');
  const rb = document.getElementById('radio');
  const top = bar ? bar.getBoundingClientRect().bottom + 10 : 80;
  let bottomY = innerHeight - 70;
  // de kaartcontrols staan in de kopbalk; alleen als ze (op een smal scherm) onderaan zweven
  // houden de overlays daar rekening mee
  if (cam && getComputedStyle(cam).position === 'fixed') {
    bottomY = Math.min(bottomY, cam.getBoundingClientRect().top - 10);
  }
  const maxH = Math.max(140, Math.round(bottomY - top));
  root.style.setProperty('--bartop', `${Math.round(top)}px`);
  root.style.setProperty('--overlaybottom', `${Math.max(12, Math.round(innerHeight - bottomY))}px`);
  root.style.setProperty('--overlaymax', `${maxH}px`);

  // De indeling: één rechterkolom (instellingen of vluchtinformatie, nooit allebei) en de
  // spelerbalk over de volle breedte eronder. Het kaartvlak is wat daarvan overblijft.
  const kaart = document.getElementById('card');
  const paneel = document.getElementById('panel');
  const speler = document.getElementById('player');
  const zichtbaar = el => el && !el.hidden && getComputedStyle(el).display !== 'none';
  const breed = el => (zichtbaar(el) ? Math.round(el.getBoundingClientRect().width) : 0);
  const smal = innerWidth <= 900;                 // dan zweven de panelen, zie style.css
  const kolom = smal ? 0 : Math.max(breed(paneel), breed(kaart), breed(rb));
  const balkh = zichtbaar(speler) ? Math.round(speler.getBoundingClientRect().height) : 0;

  root.style.setProperty('--playl', `${smal ? 12 : 0}px`);
  root.style.setProperty('--playr', `${smal ? 12 : kolom}px`);

  const rand = smal ? { t: 0, r: 0, b: 0, l: 0 }
                    : { t: Math.round(top), r: kolom, b: balkh, l: 0 };
  for (const [k, v] of [['--map-t', rand.t], ['--map-r', rand.r],
                        ['--map-b', rand.b], ['--map-l', rand.l]]) {
    root.style.setProperty(k, `${v}px`);
  }
  // De kolom zet zelf een boven- en onderkant; een losse maximumhoogte zou de verticale
  // ruimte juist weer weggooien. Op de telefoon is die grens er wel, want daar groeit het
  // paneel naar beneden.
  for (const el of [paneel, kaart]) {
    if (el) el.style.maxHeight = innerWidth <= 760 ? `${maxH}px` : '';
  }
  // Het paneel en de toestelkaart horen in de kolomindeling nooit zelf te scrollen: hun body doet
  // dat. Zet iets ze toch scheef — een element dat focus krijgt en volgens de browser buiten beeld
  // staat — dan is er met overflow:hidden geen scrollbalk om terug te gaan en blijft de kop weg.
  // Deze regel haalt ze hoe dan ook terug.
  for (const el of [paneel, kaart]) if (el && el.scrollTop) el.scrollTop = 0;
  refreshCamBox();                                // de 3D-labels rekenen met deze maat
}
addEventListener('resize', layoutPanel);
setInterval(layoutPanel, 1000);
// De spelerbalk bepaalt waar het kaartvlak en de rechterkolom ophouden. Hij kan van maat
// veranderen door te slepen, maar ook door te verschijnen of te verdwijnen, en dat ging tot nu
// toe pas mee bij de volgende ronde van de bewaking hierboven: tot een seconde lang liep de
// kolom dan onder de balk door of bleef er een gat onder staan. Nu wordt elke maatverandering
// direct doorgegeven.
if (typeof ResizeObserver === 'function') {
  const speler = document.getElementById('player');
  if (speler) new ResizeObserver(() => layoutPanel()).observe(speler);
}

// Het kaartvlak is niet meer het hele venster: de kopbalk, de rechterkolom en de spelerbalk
// nemen er een rand van af. Projecteren moet dus over de maat van het canvas gaan en daarna
// verschoven worden naar venstercoördinaten, want daarin staan de labels en de muis. Rekenen
// met innerWidth/innerHeight gaf een verkeerde schaal, waardoor labels bij draaien en kantelen
// van hun toestel wegliepen.
let camBox = { l: 0, t: 0, w: 1, h: 1 };
function refreshCamBox() {
  const r = canvas.getBoundingClientRect();
  camBox = { l: r.left, t: r.top, w: r.width || innerWidth, h: r.height || innerHeight };
}
function resize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  refreshCamBox();
}
addEventListener('resize', resize);
resize();

// ------------------------------------------------------------ ground tiles
const texLoader = new THREE.TextureLoader();
const TINT = new THREE.Color('#7f9cc8');
let dayOn = false;
// kaartlaag onder de 3D: 'night' (grijs donker), 'day' (grijs licht) of 'sat' (satelliet met
// een doorzichtige laag plaatsnamen erover). De kleuren van labels en symbolen volgen dayOn,
// dus 'sat' gedraagt zich verder als nacht.
let mapMode = 'night';
const MAP_PAD = { night: 'tiles/', day: 'tiles/day/', sat: 'tiles/sat/' };
const TINT_SAT = '#8d8d8d';      // vermenigvuldigt met het beeld: donkerder, labels leesbaar
// bronvermelding per kaartlaag; gevuld uit api/config, gezet door setAttrib() verderop
const ATTRIB = { std: '', sat: '' };
const tiles = new Map();
const maxAniso = renderer.capabilities.getMaxAnisotropy();
const tile2lon = (x, n) => x / n * 360 - 180;
const tile2lat = (y, n) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
const lon2tile = (lon, n) => (lon + 180) / 360 * n;
const lat2tile = (lat, n) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n; };

function makeTile(z, x, y) {
  const n = 2 ** z, geo = new THREE.PlaneGeometry(1, 1, 4, 4);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const [px, pz] = toXZ(tile2lat(y + 1 - uv.getY(i), n), tile2lon(x + uv.getX(i), n));
    pos.setXYZ(i, px, 0, pz);
  }
  geo.computeBoundingSphere();
  // Bij satelliet is de ondergrond ook als doorzichtig gemerkt, hoewel hij dekkend is:
  // three.js tekent doorzichtige objecten altijd na alle ondoorzichtige, dus anders zou de
  // naamlaag van een grove tegel over een fijne ondergrond heen komen -- ongeacht renderOrder.
  const mat = new THREE.MeshBasicMaterial({ color: TINT, depthWrite: false, depthTest: false,
                                            transparent: mapMode === 'sat',
                                            side: THREE.DoubleSide, fog: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -100 + z;
  mesh.visible = false;
  texLoader.load(`${MAP_PAD[mapMode] || MAP_PAD.night}${z}/${x}/${y}`, tex => {
    if (mesh.userData.dead) { tex.dispose(); return; }
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    mat.map = tex; mat.needsUpdate = true; mesh.visible = true;
  }, undefined, () => {});
  scene.add(mesh);
  // Satellietbeeld heeft zelf geen letters, dus daar komt de doorzichtige laag met
  // plaatsnamen en grenzen overheen: hetzelfde vlak, eigen materiaal. De tekenvolgorde is
  // die van de eigen tegel plus een half: boven de eigen ondergrond, maar onder een fijnere
  // tegel. Anders drukken de grove namen van z7 door een z13-beeld heen en staat
  // "Rotterdam" uitgerekt over het halve scherm.
  if (mapMode === 'sat' && radarOpts.mapRef !== false) {
    const rmat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false,
                                               depthTest: false, side: THREE.DoubleSide, fog: true });
    const ref = new THREE.Mesh(geo, rmat);
    ref.renderOrder = -100 + z + 0.5;
    ref.visible = false;
    texLoader.load(`tiles/ref/${z}/${x}/${y}`, tex => {
      if (mesh.userData.dead) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      rmat.map = tex; rmat.needsUpdate = true; ref.visible = true;
    }, undefined, () => {});
    scene.add(ref);
    mesh.userData.ref = ref;
  }
  return mesh;
}

// Tegel opruimen. De geometrie is gedeeld met de laag plaatsnamen, dus die gaat één keer weg.
function dropTile(m) {
  m.userData.dead = true;
  const ref = m.userData.ref;
  if (ref) { scene.remove(ref); ref.material.map?.dispose(); ref.material.dispose(); }
  scene.remove(m);
  m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose();
}

// ---- weer -----------------------------------------------------------------------------------
// De server haalt METAR's, SIGMET's en de index van de regenradar op; hier kies je welk beeld
// je ziet. idx -1 betekent het nieuwste, anders een plek in de reeks van de afgelopen twee uur.
const weer = {
  metar: [], sigmet: [], frames: [], host: '', t: {}, fout: {}, attribution: '',
  idx: -1, spelen: false, timer: 0, geladen: false,
  get frameId() {
    if (!weer.frames.length) return '';
    const i = weer.idx < 0 ? weer.frames.length - 1
      : Math.max(0, Math.min(weer.idx, weer.frames.length - 1));
    return weer.frames[i].id;
  },
  get frameT() {
    if (!weer.frames.length) return 0;
    const i = weer.idx < 0 ? weer.frames.length - 1
      : Math.max(0, Math.min(weer.idx, weer.frames.length - 1));
    return weer.frames[i].t;
  },
};

// ---- neerslag en SIGMET in 3D ---------------------------------------------------------------
// De regenradar heeft boven zoomstap 8 geen eigen detail meer, dus één stap over het hele bereik
// volstaat; dat scheelt ook tegels op een Pi. Het beeld ligt vlak op de grond, boven de kaart maar
// onder alles wat vliegt, en wordt in zijn geheel vervangen als je een ander tijdstip kiest.
// Zoomstap 7: een beeldpunt is dan ruim een kilometer, ruim genoeg om losse buien te zien, en
// het hele bereik past in zo'n 36 tegels. Op stap 8 worden het er 144 -- vier keer zoveel vlakken
// en texturen voor detail dat de regenradar zelf niet heeft.
const RAIN_Z = 7;
const rainTiles = new Map();
let rainFrameOn = '';

function makeRainTile(z, x, y, frame) {
  const n = 2 ** z, geo = new THREE.PlaneGeometry(1, 1, 4, 4);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const [px, pz] = toXZ(tile2lat(y + 1 - uv.getY(i), n), tile2lon(x + uv.getX(i), n));
    pos.setXYZ(i, px, 0.004, pz);            // net boven de kaart, anders vechten ze om dezelfde laag
  }
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false,
                                            depthTest: false, side: THREE.DoubleSide, fog: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -40;
  mesh.visible = false;
  texLoader.load(`tiles/rain/${frame}/${z}/${x}/${y}`, tex => {
    if (mesh.userData.dead) { tex.dispose(); return; }
    tex.colorSpace = THREE.SRGBColorSpace;
    mat.map = tex; mat.needsUpdate = true; mesh.visible = true;
  }, undefined, () => {});
  scene.add(mesh);
  return mesh;
}

function dropRain() {
  for (const [, m] of rainTiles) {
    m.userData.dead = true;
    scene.remove(m); m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose();
  }
  rainTiles.clear();
  rainFrameOn = '';
}

function updateRain() {
  const aan = radarOpts.rain && weer.frameId && mode !== 'radar';
  if (!aan) { if (rainTiles.size) dropRain(); return; }
  if (weer.frameId !== rainFrameOn) dropRain();          // ander tijdstip: alles opnieuw
  rainFrameOn = weer.frameId;
  const want = new Set();
  addTileRange(want, RAIN_Z, 0, 0, RADIUS_KM * 1.25);
  for (const k of want) if (!rainTiles.has(k)) {
    const [z, x, y] = k.split('/').map(Number);
    rainTiles.set(k, makeRainTile(z, x, y, weer.frameId));
  }
}

// SIGMET als volume: de omtrek op de onderkant en de bovenkant, met staanders ertussen. Geen
// dichte wanden -- je moet er doorheen kunnen kijken naar het verkeer, daar gaat het om.
let sigmetGroup = null;
const SIG_KLEUR_3D = { TS: 0xff5f4a, TSGR: 0xff5f4a, TURB: 0xffb020, ICE: 0x58d6ff, MTW: 0xffb020 };

function buildSigmet3D() {
  if (sigmetGroup) {
    scene.remove(sigmetGroup);
    sigmetGroup.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
    sigmetGroup = null;
  }
  if (!radarOpts.sigmet || !weer.sigmet.length || mode === 'radar') return;
  sigmetGroup = new THREE.Group();
  for (const s of weer.sigmet) {
    const pts = (s.pts || []).map(([la, lo]) => toXZ(la, lo));
    if (pts.length < 3) continue;
    const yb = (s.base || 0) * FT * opts.exag, yt = (s.top || 45000) * FT * opts.exag;
    const v = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
      v.push(ax, yb, az, bx, yb, bz);            // onderrand
      v.push(ax, yt, az, bx, yt, bz);            // bovenrand
      v.push(ax, yb, az, ax, yt, az);            // staander
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    sigmetGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      color: SIG_KLEUR_3D[s.hazard] ?? 0xffb020, transparent: true, opacity: 0.55 })));
  }
  scene.add(sigmetGroup);
}

function addTileRange(want, z, cx, cz, half) {
  const n = 2 ** z;
  const x0 = Math.floor(lon2tile(toLon(cx - half), n)), x1 = Math.floor(lon2tile(toLon(cx + half), n));
  const y0 = Math.floor(lat2tile(toLat(cz - half), n)), y1 = Math.floor(lat2tile(toLat(cz + half), n));
  for (let x = Math.max(0, x0); x <= Math.min(n - 1, x1); x++)
    for (let y = Math.max(0, y0); y <= Math.min(n - 1, y1); y++) want.add(`${z}/${x}/${y}`);
}

function updateTiles() {
  const t = controls.target, d = camera.position.distanceTo(t);
  const want = new Set();
  addTileRange(want, 7, 0, 0, RADIUS_KM * 1.25);
  if (d < 420) addTileRange(want, 9, t.x, t.z, THREE.MathUtils.clamp(d * 1.1, 40, 150));
  if (d < 80) addTileRange(want, 11, t.x, t.z, THREE.MathUtils.clamp(d * 0.9, 12, 34));
  if (d < 16) addTileRange(want, 13, t.x, t.z, THREE.MathUtils.clamp(d * 0.8, 3, 7));
  for (const k of want) if (!tiles.has(k)) tiles.set(k, makeTile(...k.split('/').map(Number)));
  for (const [k, m] of tiles) if (!want.has(k)) { dropTile(m); tiles.delete(k); }
}

// ------------------------------------------------------------ airports / runways
let airports = [];
const runwayMon = createRunwayMonitor(toXZ);   // welke banen in gebruik zijn, uit het verkeer
let runwayMesh = null, runwayLines = null;
const RWY_NIGHT = '#eef3fa';   // bijna wit op de donkere kaart
const RWY_DAY = '#1f2d40';     // donker leisteen op de lichte kaart
function buildRunways() {
  const rws = airports.flatMap(a => a.runways);
  if (!rws.length) return;
  const pos = new Float32Array(rws.length * 12), idx = [];
  rws.forEach((r, i) => {
    const [ax, az] = toXZ(r.lat1, r.lon1), [bx, bz] = toXZ(r.lat2, r.lon2);
    let dx = bx - ax, dz = bz - az; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const hw = Math.max(r.w, 45) / 2000, px = -dz * hw, pz = dx * hw;
    pos.set([ax + px, 0, az + pz, ax - px, 0, az - pz, bx + px, 0, bz + pz, bx - px, 0, bz - pz], i * 12);
    const o = i * 4; idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: dayOn ? RWY_DAY : RWY_NIGHT, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
  m.renderOrder = -50;
  scene.add(m);
  runwayMesh = m;
  // middellijnen als lijnen: altijd minstens één pixel breed, dus ook van ver zichtbaar
  const lp = new Float32Array(rws.length * 6);
  rws.forEach((r, i) => {
    const [ax, az] = toXZ(r.lat1, r.lon1), [bx, bz] = toXZ(r.lat2, r.lon2);
    lp.set([ax, 0, az, bx, 0, bz], i * 6);
  });
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  runwayLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: dayOn ? RWY_DAY : RWY_NIGHT, depthWrite: false, depthTest: false }));
  runwayLines.renderOrder = -49;
  scene.add(runwayLines);
}

// ------------------------------------------------------------ aircraft model
// In 3D hoeft een symbool geen teken te zijn; het mag het toestel zelf zijn. Elke soort heeft
// daarom een eigen romp. De neus wijst naar -z, de staart naar +z, y is omhoog.
//
// Eén InstancedMesh kan maar één vorm, dus acht vormen betekent acht meshes. Dat kost zeven
// tekenaanroepen erbij op de vijfenzeventig die de kaart al doet; het aantal exemplaren en het
// aantal driehoeken blijft ongeveer gelijk.
//
// De tweede kolom per driehoek is de tint: 1 is vol, lager is donkerder. Daarmee komt een
// staartvin of een romp los van de vleugel te staan zonder extra materiaal.
const AC_VORM = {
  lijn: [                                        // gepijlde vleugel met staartvin: de norm
    [0, 0, -1, -0.8, 0.16, 0.7, 0, 0, 0.35, 1],
    [0, 0, -1, 0, 0, 0.35, 0.8, 0.16, 0.7, 1],
    [0, 0, -0.55, 0, 0, 0.35, 0, 0.34, 0.45, 0.72],
  ],
  klein: [                                       // kleiner, rechte vleugel, geen staartvin
    [0, 0, -0.7, -0.7, 0.05, 0.1, 0, 0, 0.3, 1],
    [0, 0, -0.7, 0, 0, 0.3, 0.7, 0.05, 0.1, 1],
  ],
  heli: [                                        // rotorschijf van vier bladen, plus staartboom
    [0, 0.16, 0, -0.9, 0.16, -0.07, -0.9, 0.16, 0.07, 1],
    [0, 0.16, 0, 0.9, 0.16, 0.07, 0.9, 0.16, -0.07, 1],
    [0, 0.16, 0, 0.07, 0.16, -0.9, -0.07, 0.16, -0.9, 1],
    [0, 0.16, 0, -0.07, 0.16, 0.9, 0.07, 0.16, 0.9, 1],
    [-0.13, 0, -0.28, 0.13, 0, -0.28, 0, 0, 0.95, 0.72],
  ],
  mil: [                                         // korte brede delta, rechte achterrand
    [0, 0, -0.95, -0.85, 0.05, 0.55, 0, 0, 0.55, 1],
    [0, 0, -0.95, 0, 0, 0.55, 0.85, 0.05, 0.55, 1],
  ],
  vracht: [                                      // de chevron, met een tweede hogere vin
    [0, 0, -1, -0.8, 0.16, 0.7, 0, 0, 0.35, 1],
    [0, 0, -1, 0, 0, 0.35, 0.8, 0.16, 0.7, 1],
    [0, 0, -0.55, 0, 0, 0.35, 0, 0.34, 0.45, 0.72],
    [0, 0, -0.3, 0, 0, 0.1, 0, 0.62, 0.2, 0.72],
  ],
  sport: [                                       // zweefverhoudingen: spanwijdte 3,2 tegen 1,6
    [0, 0, -0.45, -1.6, 0.1, 0.18, 0, 0, 0.22, 1],
    [0, 0, -0.45, 0, 0, 0.22, 1.6, 0.1, 0.18, 1],
    [-0.05, 0, -0.45, 0.05, 0, -0.45, 0, 0, 0.75, 0.72],
  ],
  grond: [                                       // plat vierkantje: het beweegt niet als verkeer
    [-0.35, 0.02, -0.35, 0.35, 0.02, -0.35, 0.35, 0.02, 0.35, 1],
    [-0.35, 0.02, -0.35, 0.35, 0.02, 0.35, -0.35, 0.02, 0.35, 1],
  ],
  onbekend: [                                    // viervlak: de richting is niet bekend
    [0, 0.5, 0, -0.4, 0, -0.28, 0.4, 0, -0.28, 1],
    [0, 0.5, 0, 0.4, 0, -0.28, 0, 0, 0.46, 0.8],
    [0, 0.5, 0, 0, 0, 0.46, -0.4, 0, -0.28, 0.66],
    [-0.4, 0, -0.28, 0.4, 0, -0.28, 0, 0, 0.46, 0.72],
  ],
};
// De volgorde van deze tabel is ook de volgorde van de knoppen in het weergavepaneel en van de
// regels in de legenda: één lijst, zodat ze niet uit elkaar kunnen lopen.
const SOORTEN = Object.keys(AC_VORM);

function acGeometry(driehoeken) {
  const v = [], c = [];
  for (const d of driehoeken) {
    v.push(...d.slice(0, 9));
    const t = d[9];
    for (let i = 0; i < 3; i++) c.push(t, t, t);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  return g;
}

const acMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true });
const acMeshes = {};
for (const s of SOORTEN) {
  const m = new THREE.InstancedMesh(acGeometry(AC_VORM[s]), acMat, MAXAC);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.setColorAt(0, tmpC.set(1, 1, 1));
  m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false;
  m.count = 0;
  scene.add(m);
  acMeshes[s] = m;
}
const telSoort = {};

// Kleur per soort voor de 3D-weergave. De radarplot kent de kleuren al; die worden hier alleen
// naar THREE-kleuren omgezet, en opnieuw als het thema wisselt (lijnvlucht volgt het thema).
const SOORT_C = {};
let soortCThema = '';
function soortColor3D(s) {
  if (soortCThema !== radarOpts.theme) {
    soortCThema = radarOpts.theme;
    for (const k of SOORTEN) SOORT_C[k] = new THREE.Color(soortHex(k, radarOpts.theme));
  }
  return SOORT_C[s] || SOORT_C.lijn;
}

// drop lines
const dropPos = new Float32Array(MAXAC * 6), dropCol = new Float32Array(MAXAC * 6);
const dropGeo = new THREE.BufferGeometry();
dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3).setUsage(THREE.DynamicDrawUsage));
dropGeo.setAttribute('color', new THREE.BufferAttribute(dropCol, 3).setUsage(THREE.DynamicDrawUsage));
const drops = new THREE.LineSegments(dropGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false }));
drops.frustumCulled = false;
scene.add(drops);

// ------------------------------------------------------------ trail shader
const shared = {
  uNow: { value: 0 }, uTrail: { value: opts.trailMin * 60 }, uExag: { value: opts.exag },
  uFogColor: { value: BG.clone() }, uFogDensity: { value: FOG_DENSITY },
};
const VERT = /* glsl */`
  attribute vec3 acolor; attribute float tstamp; attribute float edge;
  uniform float uExag;
  varying vec3 vColor; varying float vT; varying float vEdge; varying float vDepth;
  void main() {
    vec3 p = position; p.y *= uExag;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDepth = -mv.z; vColor = acolor; vT = tstamp; vEdge = edge;
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */`
  uniform float uNow, uTrail, uOpacity, uBottom, uFogDensity; uniform vec3 uFogColor;
  varying vec3 vColor; varying float vT; varying float vEdge; varying float vDepth;
  void main() {
    if (vT > uNow) discard;                       // nog niet aan de beurt: ligt in de toekomst
    float a = clamp(1.0 - (uNow - vT) / uTrail, 0.0, 1.0);
    a = a * a * (3.0 - 2.0 * a) * uOpacity * mix(uBottom, 1.0, vEdge);
    float f = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
    a *= 1.0 - 0.85 * f;
    if (a < 0.004) discard;
    gl_FragColor = vec4(mix(vColor, uFogColor, f), a);
    #include <colorspace_fragment>
  }`;
function trailMaterial(opacity, bottom) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uOpacity: { value: opacity }, uBottom: { value: bottom } },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}
const matLine = trailMaterial(0.95, 1);
const matBand = trailMaterial(0.5, 1);
const matCurtain = trailMaterial(0.3, 0.04);

const trailLines = new THREE.LineSegments(new THREE.BufferGeometry(), matLine);
const trailSurf = new THREE.Mesh(new THREE.BufferGeometry(), matBand);
for (const o of [trailLines, trailSurf]) { o.frustumCulled = false; o.renderOrder = 1; scene.add(o); }

function dynAttr(n, size) {
  return new THREE.BufferAttribute(new Float32Array(n * size), size).setUsage(THREE.DynamicDrawUsage);
}

const BAND_HALF = 0.16; // km

// ------------------------------------------------------------ soort verkeer
// Eén toestel krijgt één soort, zodat kleur, symbool en filter nooit uit elkaar kunnen lopen.
//
// De ADS-B-categorie (`cat`) is de belangrijkste bron: het toestel zendt die zelf uit en in een
// gemeten momentopname van 3155 toestellen had 91% er een. Maar het is een zelfverklaring en die
// klopt niet altijd — er zat een Learjet bij die zich als A7 (hefschroef) meldde en een Super Puma
// die zich als A0 meldde. Daarom staat de typecode ernaast als tweede bron: die haalde er 25
// helikopters bij die geen A7 voeren, waaronder een Chinook en twee politie-AS350's.
//
// Militair gaat op de hex-reeks, niet op het callsign. Gemeten: de hex-blokken leverden 92
// treffers zonder valse, een callsignlijst 31 waarvan er 15 al gevonden waren. De hex-reeks vindt
// ook wat geen herkenbaar callsign voert. De blokgrenzen luisteren nauw: een ruimere lijst haalde
// Brussels Airlines-A320's binnen omdat die ook in 44xxxx zitten.

// Militaire ICAO-blokken. Alleen blokken die als militair toegewezen zijn, geen hele landreeksen.
const MIL_HEX = [
  [0x010070, 0x01008F], [0x0A4000, 0x0A4FFF], [0x33FF00, 0x33FFFF], [0x3AA000, 0x3AFFFF],
  [0x3B7000, 0x3BFFFF], [0x3EA000, 0x3EBFFF], [0x3F4000, 0x3FBFFF], [0x43C000, 0x43CFFF],
  [0x444000, 0x446FFF], [0x447000, 0x447FFF], [0x44F000, 0x44FFFF], [0x457000, 0x457FFF],
  [0x45F400, 0x45F4FF], [0x468000, 0x4683FF], [0x473C00, 0x473C0F], [0x478100, 0x4781FF],
  [0x480000, 0x480FFF], [0x48D800, 0x48D87F], [0x497C00, 0x497CFF], [0x498420, 0x49842F],
  [0x4B7000, 0x4B7FFF], [0x4B8200, 0x4B82FF], [0x506F00, 0x506FFF], [0x738A00, 0x738AFF],
  [0x7CF800, 0x7CFAFF], [0xADF7C8, 0xADF7CF], [0xAE0000, 0xAFFFFF], [0xC20000, 0xC3FFFF],
  [0xE40000, 0xE41FFF],
];

// Typecodes van hefschroefvliegtuigen, als tweede bron naast categorie A7.
const HELI_TYPE = new Set(['EC20', 'EC25', 'EC30', 'EC35', 'EC45', 'EC55', 'EC75', 'AS32', 'AS50',
  'AS55', 'AS65', 'A109', 'A119', 'A139', 'A169', 'A189', 'R22', 'R44', 'R66', 'B06', 'B06T',
  'B407', 'B412', 'B429', 'B430', 'B505', 'S76', 'S92', 'S61', 'H47', 'H60', 'H64', 'H500',
  'H269', 'H160', 'EH10', 'W3', 'NH90', 'GAZL', 'BK17', 'PUMA', 'LYNX', 'KMAX']);

// Vrachtmaatschappijen op hun callsign-voorvoegsel. Het voorvoegsel telt alleen als er een cijfer
// op volgt: `GEC` is Lufthansa Cargo, maar `G-ECAM` is een Britse lesvlieger die zijn kenteken
// als callsign uitzendt. Met die eis erbij bleven er dertien schone treffers over en geen valse.
const VRACHT_CS = new Set(['FDX', 'UPS', 'GTI', 'CLX', 'ABW', 'MSX', 'BOX', 'CKS', 'GEC', 'CAO',
  'CKK', 'TAY', 'ICL', 'MPH', 'BCS', 'EAT', 'NPT', 'SWN', 'ASX', 'RUN', 'CWC', 'SQC', 'ABD',
  'QAC', 'CLU', 'DHK', 'AHK', 'GSS', 'NCA']);

// Lichte types die een motorvliegtuigje verraden waar de categorie ontbreekt.
const KLEIN_TYPE = new Set(['C172', 'C152', 'C182', 'C206', 'P28A', 'P28B', 'PA18', 'PA28', 'DA40',
  'DA42', 'DA62', 'SR20', 'SR22', 'AT3', 'BE20', 'BE33', 'BE36', 'C42', 'RV7', 'RV8', 'TB20']);

const VLUCHTNR = /^[A-Z]{3}\d/;

function isMil(hex) {
  if (!/^[0-9a-f]{6}$/.test(hex || '')) return false;
  const v = parseInt(hex, 16);
  for (const [a, b] of MIL_HEX) if (v >= a && v <= b) return true;
  return false;
}

// De volgorde is de regel: wat hoger staat wint. Een militaire helikopter is militair, want dát
// is waarom je hem eruit wilt pikken.
function soortVan(a) {
  const cat = a.cat || '', type = a.type || '', cs = (a.cs || '').trim();
  if (cat[0] === 'C') return 'grond';              // C0/C1/C2: voertuig of obstakel, geen verkeer
  if (isMil(a.hex)) return 'mil';
  if (cat === 'A7' || HELI_TYPE.has(type)) return 'heli';
  if (cat === 'B1' || cat === 'B4' || cat === 'B6') return 'sport';
  if (VLUCHTNR.test(cs) && VRACHT_CS.has(cs.slice(0, 3))) return 'vracht';
  if (cat === 'A1' || cat === 'A2' || KLEIN_TYPE.has(type)) return 'klein';
  if (cat === 'A3' || cat === 'A4' || cat === 'A5' || cat === 'A6') return 'lijn';
  return cs ? 'lijn' : 'onbekend';                 // callsign maar geen categorie: behandel als lijn
}

// SOORTEN staat bij AC_VORM hierboven: die tabel bepaalt de soorten én hun volgorde.

// ------------------------------------------------------------ aircraft state
const aircraft = new Map();
let schStatus = '--';
let T0 = 0, skew = null, lastNow = 0, lastOk = 0, serverStatus = 'starting', source = '', primary = '';
let selected = null, follow = false, photosOn = false;
const nowRel = () => Date.now() / 1000 + (skew ?? 0) - T0;

// ------------------------------------------------------------ lokaal verkeer bij een veld
// Een lesvlucht of pleziervlucht staat in geen enkele routetabel: hij stijgt op van EHRD, maakt
// een rondje boven het Groene Hart en landt er weer. Het filter van/naar keek alleen naar de
// routetabel en liet daardoor precies dat verkeer wegvallen: met een koude routecache hield EHRD
// er één van de 327 over. Daarom twee extra regels.
//
// 1. Thuisveld. Zien we een toestel aan de grond of net boven een veld, dan knopen we het hex aan
//    dat veld. Die knoop blijft staan zolang het toestel in beeld is, dus een toestel dat van EHRD
//    opstijgt blijft bij EHRD horen tot het uit de lucht verdwijnt - ook zonder callsign of route.
//    Dit geldt voor elke soort: een lijnvlucht zonder route die van EHRD vertrekt hoort er net zo
//    goed bij.
// 2. Rondom. Vliegt een klein toestel, hefschroef, zweef- of ultralicht nu laag binnen een straal
//    van het gekozen veld, dan telt het mee. Dit vangt het toestel dat al in de lucht was toen de
//    Pi begon te kijken. Lijn- en vrachtvluchten blijven hiervan uitgesloten: een Boeing die op
//    5000 ft over Rotterdam kruist is geen Rotterdams verkeer.
const LOK_KNOOP_KM = 4;         // binnen deze straal knopen we een laag toestel aan het veld
const LOK_KNOOP_FT = 1500;      // en alleen onder deze hoogte
const LOK_RONDOM_KM = 28;       // ~15 NM: zo ver reikt een circuit- of pleziervlucht
const LOK_RONDOM_FT = 6000;
const LOK_GROND_KM = 6;         // aan de grond hoort bij het veld waar het toestel staat
const LOK_SOORT = new Set(['klein', 'sport', 'heli', 'onbekend']);
const thuisveld = new Map();    // hex -> ICAO van het veld waar we het toestel laag zagen

// 3. Geleerde thuisvelden. De Pi haalt 's nachts bij OpenSky op wie er de afgelopen weken van elk
//    veld vertrok of er landde; OpenSky stelt dat achteraf vast uit de waarnemingen zelf, dus ook
//    voor toestellen zonder vluchtnummer. Een clubtoestel dat er tweemaal van opsteeg, hoort
//    daarmee bij dat veld zodra het in beeld komt - nog voor het iets doet dat erop lijkt.
const geleerdVeld = new Map();  // hex -> Set van ICAO's
const veldBron = { aan: false, updated: 0, hex: 0, dagen: 0 };

// bijVeld() draait per toestel per beeld; een lus over alle 326 luchthavens is dan te duur.
// Dit is dezelfde verzameling als apFilter, maar als objecten met x en z erbij.
let apVelden = [];
function syncApVelden() { apVelden = airports.filter(ap => apFilter.has(ap.icao)); }

function veldKnoop(a) {
  if (a.x === undefined || !airports.length) return;
  const alt = a.altg ?? a.altb;
  if (!a.ground && !(alt != null && alt <= LOK_KNOOP_FT)) return;
  for (const ap of airports) {
    if (Math.hypot(ap.x - a.x, ap.z - a.z) <= LOK_KNOOP_KM) { thuisveld.set(a.hex, ap.icao); return; }
  }
}

// Staat of vliegt dit toestel nu bij een gekozen veld? Met alleenGrond kijken we enkel naar wat er
// op het veld staat; dat was er in 1.36.1 al en blijft ook gelden met lokaal verkeer uit.
function bijVeld(a, alleenGrond) {
  if (a.x === undefined) return false;
  const alt = a.altg ?? a.altb;
  const grond = a.ground || alt == null;
  if (!grond && (alleenGrond || alt > LOK_RONDOM_FT || !LOK_SOORT.has(a.soort))) return false;
  const r = grond ? LOK_GROND_KM : LOK_RONDOM_KM;
  for (const ap of apVelden) {
    if (Math.hypot(ap.x - a.x, ap.z - a.z) <= r) return true;
  }
  return false;
}

function visible(a) {
  if (opts.soort && opts.soort[a.soort] === false) return false;     // soort uitgevinkt
  if (a.ground && !(opts.ground && opts.floor <= 0)) return false;   // grond valt buiten een hoogteband
  if (!a.ground) {
    const alt = a.altb ?? a.altg;
    if (alt > opts.ceiling || alt < opts.floor) return false;
  }
  if (apFilter.size) {                                  // ook voor grondverkeer
    const r = routeOf(a);
    if (r) {
      // De route is het harde bewijs. Staat het gekozen veld er niet in, dan hoort deze vlucht er
      // niet bij - ook niet als het toestel er wel vaker komt. EZY18ZQ vloog EDDB->EGCC over
      // Zeeland op FL371 en stond toch in het EHAM-filter, omdat dat toestel Schiphol als
      // thuisbasis heeft. Een toestel dat op het veld aan de grond staat is de enige uitzondering:
      // dat is net geland of vertrekt zo, en dan loopt de routetabel achter.
      return apFilter.has(r.oIcao) || apFilter.has(r.dIcao) || bijVeld(a, true);
    }
    if (bijVeld(a, true)) return true;                  // staat op een gekozen veld
    if (opts.lokaal === false) return false;            // strikt: alleen de routetabel
    const thuis = thuisveld.get(a.hex);                 // opgestegen van een gekozen veld
    if (thuis && apFilter.has(thuis)) return true;
    const geleerd = geleerdVeld.get(a.hex);             // hoort hier vaker thuis (OpenSky)
    if (geleerd) { for (const icao of geleerd) if (apFilter.has(icao)) return true; }
    return bijVeld(a, false);
  }
  return true;
}

// Alles wordt met vertraging getoond: de weergaveklok loopt opts.delay seconden achter,
// zodat elke positie tussen twee gemeten punten in ligt. Er wordt dus niets vooruit geraden
// en er hoeft nooit iets gecorrigeerd te worden.
const tRender = () => nowRel() - opts.delay;

const M = { x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, stale: 0, ok: false, i: 0 };

function atPoint(p, out) {
  out.x = p.x; out.z = p.z; out.y = p.y;
  if (p.gs != null && p.tr != null) {
    out.vx = Math.sin(p.tr) * p.gs * KT;
    out.vz = -Math.cos(p.tr) * p.gs * KT;
  } else { out.vx = out.vz = 0; }
  out.vy = (p.vr ?? 0) * FT / 60;
  out.ok = true;
}

function motionAt(a, t, out) {
  const tr = a.trail;
  out.ok = false; out.stale = 0;
  if (!tr.length) return out;
  const last = tr[tr.length - 1];
  if (t < tr[0].t) return out;   // buffer nog niet gevuld: dit toestel later tonen
  if (t >= last.t) { atPoint(last, out); out.i = tr.length - 1; out.stale = t - last.t; return out; }
  let i = a.si || 0;
  if (i > tr.length - 2 || tr[i].t > t) i = 0;
  while (i < tr.length - 2 && tr[i + 1].t <= t) i++;
  a.si = out.i = i;
  const p0 = tr[i], p1 = tr[i + 1], h = p1.t - p0.t;
  if (h <= 0) { atPoint(p1, out); return out; }
  const u = (t - p0.t) / h, u2 = u * u, u3 = u2 * u;
  const curve = h <= HERMITE_MAX && p0.gs != null && p1.gs != null;
  const v0x = curve ? Math.sin(p0.tr) * p0.gs * KT : 0, v0z = curve ? -Math.cos(p0.tr) * p0.gs * KT : 0;
  const v1x = curve ? Math.sin(p1.tr) * p1.gs * KT : 0, v1z = curve ? -Math.cos(p1.tr) * p1.gs * KT : 0;
  const v0y = curve ? (p0.vr ?? 0) * FT / 60 : 0, v1y = curve ? (p1.vr ?? 0) * FT / 60 : 0;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  out.x = h00 * p0.x + h10 * h * v0x + h01 * p1.x + h11 * h * v1x;
  out.z = h00 * p0.z + h10 * h * v0z + h01 * p1.z + h11 * h * v1z;
  out.y = Math.max(0, h00 * p0.y + h10 * h * v0y + h01 * p1.y + h11 * h * v1y);
  const d00 = 6 * u2 - 6 * u, d10 = 3 * u2 - 4 * u + 1, d01 = -6 * u2 + 6 * u, d11 = 3 * u2 - 2 * u;
  out.vx = (d00 * p0.x + d01 * p1.x) / h + d10 * v0x + d11 * v1x;
  out.vz = (d00 * p0.z + d01 * p1.z) / h + d10 * v0z + d11 * v1z;
  out.vy = (d00 * p0.y + d01 * p1.y) / h + d10 * v0y + d11 * v1y;
  out.ok = true;
  return out;
}

function pruneTrail(a, tNow) {
  const tr = a.trail;
  const drop = tNow - TRAIL_KEEP, full = tNow - FULL_WINDOW;
  let i = 0;
  while (i < tr.length && tr[i].t < drop) i++;
  if (i) { tr.splice(0, i); a.si = 0; }
  // oude metingen uitdunnen; het recente venster blijft op volle resolutie voor de interpolatie
  let kept = -1e9, changed = false;
  const out = [];
  for (let k = 0; k < tr.length; k++) {
    const p = tr[k];
    if (p.t >= full || k === tr.length - 1 || p.t - kept >= THIN_STEP) { out.push(p); kept = p.t; }
    else changed = true;
  }
  if (changed) { a.trail = out; a.si = 0; }
}

function applySnapshot(s) {
  if (!T0) T0 = s.now;
  const raw = s.now - Date.now() / 1000;
  if (skew === null || Math.abs(raw - skew) > 10) skew = raw;   // eerste meting of echte sprong
  else if (raw > skew) skew = raw;                              // verse data: meteen bijtrekken
  else skew += Math.max(-0.05, (raw - skew) * 0.1);             // achterlopen: langzaam terug
  serverStatus = s.status;
  source = s.source || '';
  if (s.status === 'ok' && s.now !== lastNow) lastOk = Date.now();
  lastNow = s.now;
  const tNow = nowRel(), F = s.fields, I = Object.fromEntries(F.map((f, i) => [f, i]));
  for (const r of s.ac) {
    const hex = r[I.hex];
    let a = aircraft.get(hex);
    const t = r[I.t] - T0;
    if (a && t <= a.t) { a.seen = tNow; continue; }
    if (!a) { a = { hex, trail: [], si: 0, t: -1e9, gap: 4 }; aircraft.set(hex, a); }
    else if (t - a.t > 0.5) {
      // gemiddelde tijd tussen metingen; ver weg ververst trager dan in het thuisgebied
      a.gap = a.gap ? a.gap * 0.7 + Math.min(60, t - a.t) * 0.3 : Math.min(60, t - a.t);
    }
    a.cs = r[I.flight]; a.type = r[I.type]; a.reg = r[I.reg]; a.cat = r[I.cat];
    a.sq = r[I.squawk]; a.emerg = r[I.emerg]; a.ground = !!r[I.ground];
    a.soort = soortVan(a);
    a.altg = r[I.altg]; a.altb = r[I.altb]; a.gs = r[I.gs]; a.vr = r[I.vr];
    a.mcp = I.mcp !== undefined ? r[I.mcp] : null; a.fms = I.fms !== undefined ? r[I.fms] : null;
    if (r[I.track] != null) a.track = r[I.track];
    a.lat = r[I.lat]; a.lon = r[I.lon]; a.t = t; a.seen = tNow;
    [a.x, a.z] = toXZ(a.lat, a.lon);
    veldKnoop(a);                        // laag bij een veld: onthoud van welk veld het toestel is
    const last = a.trail[a.trail.length - 1];
    if (!last || t - last.t >= SAMPLE_MIN) {
      a.trail.push({
        t, x: a.x, z: a.z, y: a.ground ? 0 : a.altg * FT,
        tr: a.track == null ? null : a.track * Math.PI / 180,
        gs: a.gs, vr: a.ground ? 0 : a.vr,
      });
    }
  }
  for (const [h, a] of aircraft) {
    if (tNow - a.seen > 60) {
      aircraft.delete(h); thuisveld.delete(h);
      if (selected === a) select(null);
      continue;
    }
    pruneTrail(a, tNow);
  }
  trailsDirty = true;
  alarmScan();
  if (selected) updateCard();          // kaart meteen bij met de verse waarden
  runwayMon.build(airports);
  runwayMon.update(aircraft.values(), Date.now() / 1000);
}

// ------------------------------------------------------------ noodmeldingen
// Een toestel dat 7500, 7600 of 7700 zet, of waar de bron zelf een noodmelding bij geeft,
// meldt zich boven in het kaartvlak. Dat gebeurt over alles wat de Pi ziet, dus ook buiten
// het huidige beeld en ook als een filter het toestel wegdrukt.
const ALARM_SQ = { 7500: 'unlawful', 7600: 'nordo', 7700: 'general' };
const ALARM_EMERG = ['general', 'nordo', 'unlawful', 'minfuel', 'downed'];
const ALARM_MAX = 3;                               // meer dan drie tegelijk wordt onleesbaar
const alarm = { aan: true, open: new Map(), weg: new Set() };

function alarmSoort(a) {
  const sq = ALARM_SQ[Number(a.sq)];
  if (sq) return sq;
  return ALARM_EMERG.includes(a.emerg) ? a.emerg : null;
}

function alarmScan() {
  if (!alarm.aan) return;
  const nu = Date.now();
  const levend = new Set();
  for (const a of aircraft.values()) {
    const soort = alarmSoort(a);
    if (!soort) continue;
    const sleutel = `${a.hex}:${soort}`;
    levend.add(sleutel);
    if (alarm.weg.has(sleutel)) continue;          // deze had je al weggeklikt
    if (!alarm.open.has(sleutel)) alarm.open.set(sleutel, { hex: a.hex, soort, t: nu });
  }
  let veranderd = false;
  for (const k of [...alarm.open.keys()]) if (!levend.has(k)) { alarm.open.delete(k); veranderd = true; }
  for (const k of [...alarm.weg]) if (!levend.has(k)) alarm.weg.delete(k);   // weer melden als het opnieuw gebeurt
  alarmRender(veranderd);
}

// afstand en peiling vanaf het eigen punt, of anders vanaf de standaardluchthaven
function alarmPeil(a) {
  const o = home.ok ? home : (homeAirport || { x: 0, z: 0 });
  const dx = a.x - o.x, dz = a.z - o.z;
  const nm = Math.hypot(dx, dz) / 1.852;
  const brg = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
  return { nm: Math.round(nm), brg: Math.round(brg) };
}

function alarmRender() {
  const vak = $('alarm'), lijst = $('alarmList');
  if (!vak || !lijst) return;
  const rijen = [...alarm.open.values()].sort((p, q) => q.t - p.t).slice(0, ALARM_MAX);
  vak.hidden = !rijen.length;
  if (!rijen.length) { lijst.textContent = ''; return; }
  const sleutel = rijen.map(r => `${r.hex}:${r.soort}`).join('|');
  if (lijst.dataset.k === sleutel) return;         // niets veranderd: niet opnieuw opbouwen
  lijst.dataset.k = sleutel;
  lijst.textContent = '';
  for (const r of rijen) {
    const a = aircraft.get(r.hex);
    if (!a) continue;
    const li = document.createElement('li');

    const kop = document.createElement('div');
    kop.className = 'kop';
    const sq = document.createElement('span');
    sq.className = 'sq';
    sq.textContent = a.sq && ALARM_SQ[Number(a.sq)] ? `SQ ${a.sq}` : t('alarm.kop');
    const wat = document.createElement('span');
    wat.textContent = t(`emerg.${r.soort}`);
    const tijd = document.createElement('span');
    tijd.className = 'tijd';
    tijd.textContent = new Date(r.t).toLocaleTimeString(getLang() === 'en' ? 'en-GB' : 'nl-NL', { hour12: false });
    kop.append(sq, wat, tijd);

    const wie = document.createElement('div');
    wie.className = 'wie';
    const naam = document.createElement('b');
    naam.textContent = a.cs || a.reg || a.hex.toUpperCase();
    const sub = document.createElement('span');
    sub.className = 'sub';
    const p = alarmPeil(a);
    sub.textContent = [[a.type, a.reg].filter(Boolean).join(' '),
                       a.ground ? t('alarm.grond') : fmtAlt(a),
                       `${Math.round(a.gs)} kt`,
                       t('alarm.peil', { nm: p.nm, brg: String(p.brg).padStart(3, '0') })]
                      .filter(Boolean).join('  ·  ');
    wie.append(naam, sub);

    const toon = document.createElement('button');
    toon.type = 'button';
    toon.textContent = t('alarm.toon');
    toon.title = t('alarm.toontitel');
    toon.addEventListener('click', () => alarmToon(r.hex));

    const weg = document.createElement('button');
    weg.type = 'button';
    weg.className = 'weg';
    weg.textContent = '\u00d7';
    weg.title = t('alarm.weg');
    weg.setAttribute('aria-label', t('alarm.weg'));
    weg.addEventListener('click', () => {
      alarm.weg.add(`${r.hex}:${r.soort}`);
      alarm.open.delete(`${r.hex}:${r.soort}`);
      lijst.dataset.k = '';
      alarmRender();
    });

    li.append(kop, wie, toon, weg);
    lijst.appendChild(li);
  }
}

// Laten zien: eerst de filters die hem verbergen opzij, dan selecteren en volgen.
function alarmToon(hex) {
  const a = aircraft.get(hex);
  if (!a) return;
  if (!visible(a)) {
    opts.floor = 0; opts.ceiling = Infinity; opts.ground = true;
    apFilter.clear();
    optsToUI(); updateFilterNote(); trailsDirty = true;
    for (const b of document.querySelectorAll('#apChips button')) {
      b.setAttribute('aria-pressed', String(b.textContent === t('opt.filter.all')));
    }
  }
  select(a);
  follow = true;
  $('cFollow').setAttribute('aria-pressed', 'true');
  if (mode === 'radar' && radarView) { radarView.centerOn(a.x, a.z); radarView.redraw(); }
  else { controls.target.set(a.dx, a.dy * opts.exag, a.dz); }
  saveState();
}

function applyTrails(obj) {
  for (const [hex, flat] of Object.entries(obj.trails)) {
    const a = aircraft.get(hex);
    if (!a) continue;
    const pts = [];
    for (let i = 0; i < flat.length; i += 4) {
      const t = flat[i] - T0;
      if (a.trail.length && t >= a.trail[0].t) break;
      const [x, z] = toXZ(flat[i + 1], flat[i + 2]);
      pts.push({ t, x, z, y: flat[i + 3] * FT, tr: null, gs: null, vr: 0 });
    }
    a.trail = pts.concat(a.trail);
    a.si = 0;
  }
  buildTrails();
}

// ------------------------------------------------------------ trail geometry
function trailColor(a, p) {
  if (a === selected) return C_SEL;
  return altColor(p.y / FT, tmpC);
}

const MAX_TRAIL_PTS = 140000;      // vaste buffergrootte; voorkomt nieuwe allocaties per ronde
const trailBuf = {
  lp: new Float32Array(MAX_TRAIL_PTS * 3), lc: new Float32Array(MAX_TRAIL_PTS * 3),
  lt: new Float32Array(MAX_TRAIL_PTS), le: new Float32Array(MAX_TRAIL_PTS).fill(1),
  li: new Uint32Array(MAX_TRAIL_PTS * 2),
  sp: new Float32Array(MAX_TRAIL_PTS * 6), sc: new Float32Array(MAX_TRAIL_PTS * 6),
  st: new Float32Array(MAX_TRAIL_PTS * 2), se: new Float32Array(MAX_TRAIL_PTS * 2),
  si: new Uint32Array(MAX_TRAIL_PTS * 6),
};
{
  const g = trailLines.geometry;
  g.setAttribute('position', new THREE.BufferAttribute(trailBuf.lp, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('acolor', new THREE.BufferAttribute(trailBuf.lc, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('tstamp', new THREE.BufferAttribute(trailBuf.lt, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('edge', new THREE.BufferAttribute(trailBuf.le, 1));
  g.setIndex(new THREE.BufferAttribute(trailBuf.li, 1));
  const s = trailSurf.geometry;
  s.setAttribute('position', new THREE.BufferAttribute(trailBuf.sp, 3).setUsage(THREE.DynamicDrawUsage));
  s.setAttribute('acolor', new THREE.BufferAttribute(trailBuf.sc, 3).setUsage(THREE.DynamicDrawUsage));
  s.setAttribute('tstamp', new THREE.BufferAttribute(trailBuf.st, 1).setUsage(THREE.DynamicDrawUsage));
  s.setAttribute('edge', new THREE.BufferAttribute(trailBuf.se, 1).setUsage(THREE.DynamicDrawUsage));
  s.setIndex(new THREE.BufferAttribute(trailBuf.si, 1));
}
let trailsDirty = true;

function buildTrails() {
  const { lp, lc, lt, li, sp, sc, st, se, si } = trailBuf;
  const surfMode = opts.mode !== 'lijn';
  const curtain = opts.mode === 'gordijn';
  const tNow = tRender();
  const from = tNow - opts.trailMin * 60 - 10;          // ouder dan het spoor: niet tekenen
  let n = 0, s = 0;
  for (const a of aircraft.values()) {
    const tr = a.trail;
    if (!visible(a) || tr.length < 2) continue;
    const shift = a.pt === undefined ? 0 : tNow - a.pt;  // spoor volgt de klok van dit toestel
    let k0 = 0;
    while (k0 < tr.length - 2 && tr[k0 + 1].t < from) k0++;
    if (tr.length - k0 < 2) continue;
    if (n + (tr.length - k0) > MAX_TRAIL_PTS) break;
    for (let k = k0; k < tr.length; k++) {
      const p = tr[k], c = trailColor(a, p);
      lp[n * 3] = p.x; lp[n * 3 + 1] = p.y; lp[n * 3 + 2] = p.z;
      lc[n * 3] = c.r; lc[n * 3 + 1] = c.g; lc[n * 3 + 2] = c.b;
      lt[n] = p.t + shift;
      if (k > k0) { li[s * 2] = n - 1; li[s * 2 + 1] = n; }
      if (surfMode) {
        let ax, ay, az, bx, by, bz;
        if (curtain) {
          ax = p.x; ay = p.y; az = p.z; bx = p.x; by = 0; bz = p.z;
          se[n * 2] = 1; se[n * 2 + 1] = 0;
        } else {
          const q0 = tr[Math.max(k0, k - 1)], q1 = tr[Math.min(tr.length - 1, k + 1)];
          const dx = q1.x - q0.x, dz = q1.z - q0.z, L = Math.hypot(dx, dz) || 1;
          const px = -dz / L * BAND_HALF, pz = dx / L * BAND_HALF;
          ax = p.x + px; ay = p.y; az = p.z + pz;
          bx = p.x - px; by = p.y; bz = p.z - pz;
          se[n * 2] = se[n * 2 + 1] = 1;
        }
        sp[n * 6] = ax; sp[n * 6 + 1] = ay; sp[n * 6 + 2] = az;
        sp[n * 6 + 3] = bx; sp[n * 6 + 4] = by; sp[n * 6 + 5] = bz;
        sc[n * 6] = sc[n * 6 + 3] = c.r; sc[n * 6 + 1] = sc[n * 6 + 4] = c.g;
        sc[n * 6 + 2] = sc[n * 6 + 5] = c.b;
        st[n * 2] = st[n * 2 + 1] = p.t + shift;
        if (k > k0) { const A = (n - 1) * 2, B = n * 2; si.set([A, A + 1, B, B, A + 1, B + 1], s * 6); }
      }
      if (k > k0) s++;
      n++;
    }
  }
  for (const k of ['position', 'acolor', 'tstamp']) {
    trailLines.geometry.attributes[k].needsUpdate = true;
    trailSurf.geometry.attributes[k].needsUpdate = true;
  }
  trailSurf.geometry.attributes.edge.needsUpdate = true;
  trailLines.geometry.index.needsUpdate = true;
  trailSurf.geometry.index.needsUpdate = true;
  trailLines.geometry.setDrawRange(0, s * 2);
  trailSurf.geometry.setDrawRange(0, s * 6);
  trailSurf.material = curtain ? matCurtain : matBand;
  trailSurf.visible = surfMode && s > 0;
  trailsDirty = false;
}

// ------------------------------------------------------------ labels
const labelLayer = document.getElementById('labels');
const labelPool = [];
function getLabel(i) {
  let el = labelPool[i];
  if (!el) {
    el = document.createElement('div'); el.className = 'lbl';
    el.innerHTML = '<span></span><small></small>';
    labelLayer.appendChild(el); labelPool[i] = el; el._k = '';
  }
  return el;
}
function fmtAlt(a) {
  if (a.ground) return t('val.ground');
  const b = a.altb ?? a.altg;
  if (b >= 3000) return `FL${String(Math.round(b / 100)).padStart(3, '0')}`;
  return `${Math.max(0, Math.round(a.altg / 50) * 50)} ft`;
}
const proj = new THREE.Vector3();
function screenPos(x, y, z) {
  proj.set(x, y, z).project(camera);
  if (proj.z > 1 || proj.z < -1) return null;
  const sx = camBox.l + (proj.x + 1) / 2 * camBox.w;
  const sy = camBox.t + (1 - proj.y) / 2 * camBox.h;
  if (sx < camBox.l - 40 || sy < camBox.t - 40
      || sx > camBox.l + camBox.w + 40 || sy > camBox.t + camBox.h + 40) return null;
  return [sx, sy];
}

// Hoe ver de banen van het middelpunt af liggen, in wereldeenheden. Eén keer per veld: de
// baanposities veranderen niet, en dit per beeld uitrekenen voor elk veld in zicht is zonde.
function aptStraal(ap) {
  if (ap._straal === undefined) {
    let r = 0;
    for (const w of ap.runways || []) {
      for (const [la, lo] of [[w.lat1, w.lon1], [w.lat2, w.lon2]]) {
        const [x, z] = toXZ(la, lo);
        r = Math.max(r, Math.hypot(x - ap.x, z - ap.z));
      }
    }
    // Niet onthouden wat geen getal is: wie te vroeg vraagt (ap.x bestaat dan nog niet) zou
    // anders een NaN vastzetten en de naam voorgoed op het middelpunt laten staan.
    if (Number.isFinite(r)) ap._straal = r;
    else return 0;
  }
  return ap._straal;
}

let obstacles = [];
function refreshObstacles() {
  obstacles = [];
  for (const el of document.querySelectorAll('.panel, .card, .bar > *, .attrib')) {
    if (el.hidden || !el.offsetParent) continue;
    const r = el.getBoundingClientRect();
    if (r.width && r.height) obstacles.push([r.left - 4, r.top - 4, r.width + 8, r.height + 8]);
  }
}
setInterval(refreshObstacles, 300);

function updateLabels(list) {
  let used = 0;
  const boxes = obstacles.slice();
  const fits = (x, y, w, h) => {
    for (const b of boxes) if (x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]) return false;
    boxes.push([x, y, w, h]); return true;
  };
  const place = (cls, key, top, bottom, sx, sy, w) => {
    const el = getLabel(used++);
    if (el._k !== key) { el._k = key; el.firstChild.textContent = top; el.lastChild.textContent = bottom; }
    if (el.className !== cls) el.className = cls;
    el.style.transform = `translate(${sx | 0}px, ${sy | 0}px)`;
    el.style.display = '';
  };
  if (home.ok && opts.home) {
    const s = screenPos(home.x, 0, home.z);
    if (s && fits(s[0] + 8, s[1] - 24, 54, 16)) place('lbl apt home', 'home', home.label, '', s[0] + 8, s[1] - 24);
  }
  // airports first
  const camD = camera.position.distanceTo(controls.target);
  // Alleen de velden rond het punt waar je naar kijkt. Wie laag over Noord-Holland kijkt, kijkt
  // ook over de Noordzee heen: zonder deze grens plakt half Engeland als een rij codes tegen de
  // horizon. De straal groeit mee met hoe ver je uitzoomt - dan hoort er ook meer in beeld -
  // maar loopt niet mee met hoe ver de camera toevallig kijkt.
  const zicht = Math.min(APT_ZICHT_MAX_KM, Math.max(90, camD * 2.5));
  // En niets in de bovenste strook van het beeld: daar ligt bij een lage camerastand de horizon,
  // en alles wat daar staat is samengeperst tot een rij codes op één lijn - onleesbaar en niet
  // te plaatsen. Kijk je van boven, dan is die strook gewoon het verste stuk kaart en pakt het
  // afstandsfilter hierboven het al.
  const horizon = camBox.t + camBox.h * 0.10;
  // Baannummers aan beide uiteinden van elke baan, achter de knop BAAN. Niet in gebruik is
  // lichtgrijs; is de baan in gebruik, dan krijgt alleen het nummer de kleur van die beweging -
  // cyaan voor landen, violet voor opstijgen, net als op de radarplot. Alleen van dichtbij: op
  // 40 km hoogte zijn het twaalf codes op een speldenknop.
  if (opts.rwyid && camD <= RWY_ID_3D_KM) {
    const nu = Date.now() / 1000;
    for (const e of runwayMon.ends()) {
      if (e.id === '?') continue;
      // Ook hier de straal rond het kijkpunt, en een krappere dan bij de luchthavencodes: een
      // baannummer zonder de baan erbij zegt niets. Zonder deze grens stonden de velden van
      // Engeland en Duitsland als een rij losse nummers tegen de horizon.
      if (Math.hypot(e.T[0] - controls.target.x, e.T[1] - controls.target.z) > RWY_ID_3D_KM) continue;
      const s = screenPos(e.T[0], 0, e.T[1]); if (!s || s[1] < horizon) continue;
      const ldg = runwayMon.state(e.ldg, nu), dep = runwayMon.state(e.dep, nu);
      const cls = 'lbl rwy' + (ldg ? ' ldg' : dep ? ' dep' : '');
      if (fits(s[0] - 12, s[1] - 7, 26, 14)) place(cls, `${e.ap}${e.id}${cls}`, e.id, '', s[0] - 12, s[1] - 7);
    }
  }
  const vliegPos = [];                               // schermposities van de toestellen zelf
  const labelsAan = opts.labels || ql3d;             // QL toont ze ook als ze uit staan
  if (labelsAan || selected) {
    const cand = [];
    for (const a of list) {
      const s = screenPos(a.dx, a.dy * opts.exag, a.dz); if (!s) continue;
      vliegPos.push(s);                       // ook zonder label: het symbool staat er wel
      if (!labelsAan && a !== selected) continue;
      const pr = a === selected ? -1 : (a.emerg !== 'none' ? 0 : camera.position.distanceToSquared(proj.set(a.dx, a.dy * opts.exag, a.dz)));
      cand.push([pr, a, s]);
    }
    cand.sort((p, q) => p[0] - q[0]);
    for (const [, a, s] of cand) {
      if (used >= (innerWidth < 760 ? 28 : 90)) break;
      const x = s[0] + 9, y = s[1] - 13;
      if (!fits(x, y, 62, 26) && a !== selected) continue;
      const cls = a === selected ? 'lbl sel' : (a.emerg !== 'none' ? 'lbl alarm' : 'lbl');
      const top = a.cs || a.reg || a.hex.toUpperCase();
      const vs = a.ground || Math.abs(a.vr) < 300 ? '' : (a.vr > 0 ? ' \u25b2' : ' \u25bc');
      const bottom = `${fmtAlt(a)}${vs}  ${Math.round(a.gs)} kt`;
      place(cls, top + bottom, top, bottom, x, y);
    }
  }
  // Luchthavencodes als laatste. Twee redenen, allebei uit wat je ziet gebeuren:
  //
  // 1. De code stond midden op de banen, want daar ligt het middelpunt van het veld. Juist op
  //    Schiphol, waar je naar de banen kijkt, lag hij er dwars overheen. Hij wordt nu buiten de
  //    banen gezet: de straal van de baanfiguur wordt geprojecteerd en de code zoekt langs acht
  //    richtingen daarbuiten een vrije plek.
  // 2. Een veldnaam hoort te wijken voor een vlucht, niet andersom. Door hem NA de toestellen te
  //    plaatsen claimen die eerst hun ruimte. Past de code nergens vrij, of staat er een toestel
  //    overheen, dan verdwijnt hij niet -- dan blijft hij staan maar gedimd, zodat je weet welk
  //    veld je ziet zonder dat hij de lijst eronder onleesbaar maakt.
  const RICHTING = [[1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1]];
  for (const ap of airports) {
    if (ap.size !== 'large' && camD > 120) continue;
    if (Math.hypot(ap.x - controls.target.x, ap.z - controls.target.z) > zicht) continue;
    const s = screenPos(ap.x, 0, ap.z); if (!s || s[1] < horizon) continue;
    const straal = aptStraal(ap);
    let sr = 0;
    if (straal > 0) {
      for (const [dx, dz] of [[straal, 0], [0, straal]]) {
        const e = screenPos(ap.x + dx, 0, ap.z + dz);
        if (e) sr = Math.max(sr, Math.hypot(e[0] - s[0], e[1] - s[1]));
      }
    }
    const d = Math.min(sr, 160) + 10;             // niet eindeloos ver weg bij diep inzoomen
    let x = 0, y = 0, vrij = false;
    for (const [rx, ry] of RICHTING) {
      x = s[0] + rx * d + (rx < 0 ? -44 : 6);
      y = s[1] + ry * d - 8;
      if (fits(x, y, 44, 16)) { vrij = true; break; }
    }
    if (!vrij) { x = s[0] + d + 6; y = s[1] - 8; }
    const bezet = !vrij || vliegPos.some(v => v[0] > x - 6 && v[0] < x + 50 && v[1] > y - 6 && v[1] < y + 22);
    place('lbl apt' + (bezet ? ' dim' : ''), ap.icao + (bezet ? '.' : ''), ap.icao, '', x, y);
  }
  for (let i = used; i < labelPool.length; i++) if (labelPool[i].style.display !== 'none') labelPool[i].style.display = 'none';
}

// ------------------------------------------------------------ frame loop
const dummy = new THREE.Object3D();
dummy.rotation.order = 'YXZ';
const pC = { x: 0, z: 0, alt: 0 };
let lastFrame = performance.now(), lastBuild = 0, visList = [];
let fpsFrames = 0, fpsSince = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dtr = Math.min(1.0, (now - lastFrame) / 1000);   // echte tijdstap, voor de afspeelklok
  const dtf = Math.min(0.1, dtr);                        // begrensde stap, voor camerademping
  lastFrame = now;
  const t = tRender();
  if (trailsDirty && now - lastBuild > 1200) { buildTrails(); lastBuild = now; }
  // bij een lage beeldsnelheid minder pixels renderen; scheelt het meest op grote schermen
  fpsFrames++;
  if (now - fpsSince > 3000) {
    const fps = fpsFrames * 1000 / (now - fpsSince);
    fpsFrames = 0; fpsSince = now;
    const want = fps < 20 ? Math.max(0.75, pixelRatio - 0.5) : (fps > 50 ? Math.min(Math.min(devicePixelRatio, 2), pixelRatio + 0.25) : pixelRatio);
    if (want !== pixelRatio) { pixelRatio = want; renderer.setPixelRatio(pixelRatio); resize(); }
  }
  shared.uNow.value = t;
  const ex = opts.exag;
  // afspeelklok van ELK toestel bijwerken, ook als het even niet in beeld is
  for (const a of aircraft.values()) {
    const tr = a.trail;
    if (!tr.length) continue;
    const lastT = tr[tr.length - 1].t;
    const target = Math.min(t, lastT);                 // nooit voorbij de laatste meting
    // Normaal is pt gelijk aan target. Na een gat in de data blijft het toestel gewoon achterlopen
    // en haalt het met hooguit 15% extra snelheid in; dat is niet te zien. Is het gat zo groot dat
    // het toestel toch al vervaagd is, dan mag de klok in één keer bij.
    if (a.pt === undefined || Math.abs(target - a.pt) > Math.max(GAP_HIDE, (a.gap || 4) * 4)) a.pt = target;
    else a.pt = Math.min(target, a.pt + dtr * 1.15);
    a.lag = t - lastT;                                 // achterstand van de data zelf
  }

  if (mode === 'radar') {              // RadarPlot tekent zelf; alleen meedraaien met Volgen
    if (follow && selected && radarView && selected.pt !== undefined) {
      const M2 = { ok: false };
      motionAt(selected, selected.pt, M2);
      if (M2.ok) {
        const k = 1 - Math.exp(-dtr * 3);
        radarView.center.x += (M2.x - radarView.center.x) * k;
        radarView.center.z += (M2.z - radarView.center.z) * k;
      }
    }
    return;
  }

  let n = 0;
  visList = [];
  for (const s of SOORTEN) telSoort[s] = 0;         // emmertje per vorm, elk beeld opnieuw
  const opSoort = opts.colorBy === 'soort';
  for (const a of aircraft.values()) {
    if (!visible(a) || n >= MAXAC || a.pt === undefined) continue;
    const hideAt = THREE.MathUtils.clamp((a.gap || 4) * 4 + 10, GAP_HIDE, 150);
    if (a.lag > hideAt && a !== selected) continue;   // te oud om te tonen; komt terug met verse data
    motionAt(a, a.pt, M);
    if (!M.ok) continue;
    const soort = acMeshes[a.soort] ? a.soort : 'lijn';
    a.dx = M.x; a.dz = M.z; a.dy = M.y; a.stale = M.stale;
    const y = a.dy * ex;
    const dist = camera.position.distanceTo(proj.set(a.dx, y, a.dz));
    dummy.position.set(a.dx, y, a.dz);
    const speed = Math.hypot(M.vx, M.vz);
    const head = speed > 1e-5 ? Math.atan2(M.vx, -M.vz) : (a.track ?? 0) * Math.PI / 180;
    // Een helikopter kantelt niet mee. De klimhoek wordt hier met 2,2 overdreven om een klim in
    // een schuine camera zichtbaar te maken; bij een toestel dat vrijwel verticaal stijgt gaat de
    // romp daardoor rechtovereind staan, en dat is precies wat een helikopter níet doet.
    const climb = a.ground || speed < 1e-5 || soort === 'heli' || soort === 'grond' ? 0
      : Math.atan2(M.vy * ex * PITCH_BOOST, Math.max(speed, 60 * KT));
    dummy.rotation.set(THREE.MathUtils.clamp(climb, -PITCH_MAX, PITCH_MAX), -head, 0);
    dummy.scale.setScalar(THREE.MathUtils.clamp(dist * 0.0085, 0.05, 5) * (a === selected ? 1.5 : 1));
    dummy.updateMatrix();
    const mesh = acMeshes[soort], i = telSoort[soort]++;
    mesh.setMatrixAt(i, dummy.matrix);
    const col = colA.copy(a === selected ? C_SEL : a.emerg !== 'none' ? C_ALARM
      : opSoort ? soortColor3D(soort) : altColor(a.ground ? 0 : a.altg, tmpC));
    const fadeAt = Math.max(GAP_FADE, (a.gap || 4) * 2 + 6);
    if (a.lag > fadeAt) col.lerp(BG, Math.min(0.85, (a.lag - fadeAt) / Math.max(8, hideAt - fadeAt)));
    mesh.setColorAt(i, col);
    dropPos.set([a.dx, y, a.dz, a.dx, 0, a.dz], n * 6);
    dropCol.set([col.r, col.g, col.b, col.r, col.g, col.b], n * 6);
    n++;
    visList.push(a);
  }
  for (const s of SOORTEN) {
    const m = acMeshes[s];
    m.count = telSoort[s];
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
  dropGeo.setDrawRange(0, n * 2);
  dropGeo.attributes.position.needsUpdate = dropGeo.attributes.color.needsUpdate = true;
  drops.visible = opts.drops;

  if (follow && selected && aircraft.has(selected.hex)) {
    const tx = selected.dx, ty = selected.dy * ex, tz = selected.dz;
    const k = 1 - Math.exp(-dtf * 4);
    const dx = (tx - controls.target.x) * k, dy = (ty - controls.target.y) * k, dz = (tz - controls.target.z) * k;
    controls.target.x += dx; controls.target.y += dy; controls.target.z += dz;
    camera.position.x += dx; camera.position.y += dy; camera.position.z += dz;
  }
  if (routeLine.visible || selected) updateRouteLine();
  runFly(now);
  controls.update();
  const fogD = 0.5 / (camera.position.distanceTo(controls.target) + 300);
  scene.fog.density = fogD; shared.uFogDensity.value = fogD;
  updateLabels(visList);
  renderer.render(scene, camera);
}

// ------------------------------------------------------------ camera moves
let fly = null;
function flyTo(x, z, dist, polar = 0.95, theta = null) {
  const off = camera.position.clone().sub(controls.target);
  const sph = new THREE.Spherical().setFromVector3(off);
  sph.radius = dist; sph.phi = polar;
  if (theta !== null) sph.theta = theta;
  const endT = new THREE.Vector3(x, 0, z);
  const endP = endT.clone().add(new THREE.Vector3().setFromSpherical(sph));
  if (reduceMotion) { controls.target.copy(endT); camera.position.copy(endP); return; }
  fly = { t0: performance.now(), dur: 1400, fromT: controls.target.clone(), fromP: camera.position.clone(), endT, endP };
}
function runFly(now) {
  if (!fly) return;
  const k = Math.min(1, (now - fly.t0) / fly.dur), e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
  controls.target.lerpVectors(fly.fromT, fly.endT, e);
  camera.position.lerpVectors(fly.fromP, fly.endP, e);
  if (k >= 1) fly = null;
}
controls.addEventListener('start', () => { fly = null; });
controls.addEventListener('end', saveState);

const sphTmp = new THREE.Spherical(), vecTmp = new THREE.Vector3();
function orbitBy(dTheta, dPhi, zoomFactor) {
  fly = null;
  vecTmp.copy(camera.position).sub(controls.target);
  sphTmp.setFromVector3(vecTmp);
  sphTmp.theta += dTheta;
  sphTmp.phi = THREE.MathUtils.clamp(sphTmp.phi + dPhi, 0.05, controls.maxPolarAngle - 0.01);
  sphTmp.radius = THREE.MathUtils.clamp(sphTmp.radius * (zoomFactor || 1), controls.minDistance, controls.maxDistance);
  camera.position.copy(controls.target).add(vecTmp.setFromSpherical(sphTmp));
}

const CAM_ACTS = {
  left: s => orbitBy(-0.55 * s, 0, 1),
  right: s => orbitBy(0.55 * s, 0, 1),
  up: s => orbitBy(0, -0.4 * s, 1),        // camera omhoog: meer van bovenaf kijken
  down: s => orbitBy(0, 0.4 * s, 1),       // camera omlaag: meer vanaf de zijkant
  in: s => orbitBy(0, 0, Math.pow(0.55, s)),
  out: s => orbitBy(0, 0, Math.pow(1.8, s)),
};

let held = null, heldSince = 0;
function holdStep(now) {
  if (!held) return;
  const dt = Math.min(0.1, (now - heldSince) / 1000);
  heldSince = now;
  camAct(held, dt);
  requestAnimationFrame(holdStep);
}
const RADAR_ACTS = {
  left: s => radarView.pan(-s * radarOpts.range * 1.4, 0),
  right: s => radarView.pan(s * radarOpts.range * 1.4, 0),
  up: s => radarView.pan(0, -s * radarOpts.range * 1.4),
  down: s => radarView.pan(0, s * radarOpts.range * 1.4),
  in: s => { radarView.setRange(radarOpts.range * Math.pow(0.55, s)); updateRangeOut(); },
  out: s => { radarView.setRange(radarOpts.range * Math.pow(1.8, s)); updateRangeOut(); },
};

function camAct(act, s) {
  if (mode === 'radar' && radarView) RADAR_ACTS[act](s);
  else CAM_ACTS[act](s);
}

function startHold(act) {
  if (act === 'reset') { resetView(); return; }
  camAct(act, 0.12);                       // één tik bij een korte klik
  held = act; heldSince = performance.now();
  requestAnimationFrame(holdStep);
}
function stopHold() { if (held) { held = null; saveState(); } }

for (const b of document.querySelectorAll('.camctl button[data-act]')) {
  const act = b.dataset.act;
  b.addEventListener('pointerdown', e => { e.preventDefault(); startHold(act); });
  b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startHold(act); } });
  b.addEventListener('keyup', stopHold);
}
addEventListener('pointerup', stopHold);
addEventListener('pointercancel', stopHold);
addEventListener('blur', stopHold);

addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
  const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', '+': 'in', '=': 'in', '-': 'out', '_': 'out' };
  const act = map[e.key];
  if (act) { e.preventDefault(); camAct(act, 0.18); saveState(); }
  else if (e.key === '0') { e.preventDefault(); resetView(); }
});

// ------------------------------------------------------------ picking + card
let down = null;
canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
  let best = null, bd = innerWidth < 760 ? 32 : 22;
  for (const a of visList) {
    const s = screenPos(a.dx, a.dy * opts.exag, a.dz); if (!s) continue;
    const d = Math.hypot(s[0] - e.clientX, s[1] - e.clientY);
    if (d < bd) { bd = d; best = a; }
  }
  select(best);
});

const card = document.getElementById('card');
const $ = id => document.getElementById(id);
function requestRoute(a, refresh = false) {
  if (!routesOn || !a || !a.cs || pendingRoutes.has(a.cs)) return;
  if (!refresh && routes.has(a.cs)) return;
  if (refresh) {
    if (refreshed.has(a.cs)) return;         // hoogstens één keer opnieuw opzoeken
    refreshed.add(a.cs);
  }
  pendingRoutes.add(a.cs);
  getJSON(`api/route?cs=${encodeURIComponent(a.cs)}${refresh ? '&refresh=1' : ''}`)
    .then(r => { applyRoutes(r); })
    .catch(() => {})
    .finally(() => pendingRoutes.delete(a.cs));
}

function select(a) {
  selected = a;
  requestRoute(a);
  if (!a) {
    follow = false; $('cFollow').setAttribute('aria-pressed', 'false');
    $('cPhoto').hidden = true; $('cFlight').hidden = true; $('cSch').hidden = true; $('cSchHead').hidden = true;
  }
  // Een toestel kiezen zet de kolom op de vluchtinformatie, loslaten zet hem terug.
  setKolom(a ? 'vlucht' : 'inst', false);
  buildTrails();
  updateCard();
  updateRouteLine();
  if (!radioEl.hidden) renderChannels();
}
let typeNames = null, typesLoading = false;
function loadTypes() {
  if (typeNames || typesLoading) return;
  typesLoading = true;
  getJSON('types.json').then(t => { typeNames = t; updateCard(); }).catch(() => { typeNames = {}; });
}
function compass(deg) { return t('compass')[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16]; }

function buildAge(built) {
  const y = parseInt(built.slice(0, 4), 10);
  if (!y || y < 1930) return '';
  const age = new Date().getFullYear() - y;
  return t('card.built', { year: y, age });
}

function typeLabel(a) {
  const full = typeNames && a.type ? typeNames[a.type.toUpperCase()] : null;
  return full ? `${full} (${a.type})` : (a.type || t('card.typeunknown'));
}

const photoCache = new Map();
// Een mislukte poging is iets anders dan "dit toestel heeft geen foto", en dat verschil werd
// niet gemaakt: bij een hapering onthield de pagina `null` en vroeg hij het voor dat toestel
// nooit meer. Ook na herstel bleef de foto dan weg tot je de pagina opnieuw laadde -- precies
// het "het duurt even voordat het weer werkt" dat je ziet. Een fout wordt nu met een tijdstip
// onthouden en na anderhalve minuut opnieuw geprobeerd; "geen foto" blijft wel definitief.
const PHOTO_HERKANS_MS = 90000;
function showPhoto(a) {
  const box = $('cPhoto');
  if (!photosOn || !a) { box.hidden = true; return; }
  const key = a.hex;
  const cached = photoCache.get(key);
  const opnieuw = cached && cached.fout && Date.now() - cached.fout > PHOTO_HERKANS_MS;
  if (cached === undefined || opnieuw) {
    box.hidden = true;
    photoCache.set(key, { bezig: true });        // voorkomt dat er twee tegelijk uitgaan
    getJSON(`api/photo?hex=${encodeURIComponent(a.hex)}&reg=${encodeURIComponent(a.reg || '')}`)
      .then(p => {
        if (p && p.thumb) photoCache.set(key, p);
        else if (p && p.error) photoCache.set(key, { fout: Date.now() });
        else photoCache.set(key, null);          // antwoord zonder foto: die is er gewoon niet
        if (selected === a) showPhoto(a);
      })
      .catch(() => { photoCache.set(key, { fout: Date.now() }); });
    return;
  }
  if (!cached || !cached.thumb) { box.hidden = true; return; }
  const img = $('cPhotoImg'), link = $('cPhotoLink');
  if (img.dataset.key !== key) { img.dataset.key = key; img.src = cached.thumb; img.alt = `Foto van ${a.reg || a.hex}`; }
  link.href = cached.link || 'https://www.planespotters.net/';
  link.textContent = cached.by ? t('card.photo', { by: cached.by }) : t('card.photo.anon');
  box.hidden = false;
}

const KM_PER_NM = 1.852;
function hhmm(d) { return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function gcKm(lat1, lon1, lat2, lon2) {
  const R = 6371, p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const dp = p2 - p1, dl = (lon2 - lon1) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------- luchtruim (openAIP)
let airspaceItems = [];
// blijft vragen zolang de server nog bezig is (openAIP kan even afremmen); status onder LUCHTRUIM
function pollAirspace() {
  getJSON('api/airspace').then(d => {
    const items = (d && d.items) || [];
    if (items.length) {
      if (items.length !== airspaceItems.length) {
        airspaceItems = items;
        if (radarView) radarView.setAirspace(items);
        if (selected) updateCard();
      }
      if (d.partial) {                       // nog niet alles binnen: tonen wat er is en blijven vragen
        $('aspNote').textContent = t('asp.partial', { k: d.tiles ? d.tiles[0] : '?', n: d.tiles ? d.tiles[1] : '?' });
        setTimeout(pollAirspace, 30000);
      } else {
        $('aspNote').textContent = '';
      }
      return;
    }
    const st = (d && d.status) || '';
    if (st === 'uit') { $('aspNote').textContent = t('asp.off'); return; }
    $('aspNote').textContent = st && st !== 'ok' && st !== 'laden' ? t('asp.wait', { st }) : t('asp.loading');
    setTimeout(pollAirspace, 30000);
  }).catch(() => setTimeout(pollAirspace, 30000));
}
function inPoly(lat, lon, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const ASP_ORDER = { 4: 0, 7: 1, 26: 2, 5: 3, 6: 4, 1: 5, 3: 5, 2: 6, 8: 7, 9: 7, 10: 9 };
// blokken waarin het toestel nu vliegt, horizontaal én binnen onder- en bovengrens
function airspaceOf(a) {
  if (!a || a.lat == null || !airspaceItems.length) return [];
  const h = a.ground ? 0 : (a.altb ?? a.altg ?? 0) / 100;
  return airspaceItems.filter(it => h >= it.lo[0] && h <= (it.hi[0] >= 999 ? 9999 : it.hi[0]) && inPoly(a.lat, a.lon, it.p))
    .sort((p, q) => (ASP_ORDER[p.t] ?? 8) - (ASP_ORDER[q.t] ?? 8));
}
function updateAirspace(a) {
  const el = $('cAsp');
  const list = airspaceOf(a).filter(it => it.t !== 10);
  if (!list.length) { el.hidden = true; return; }
  const uniq = list.filter((it, i) => list.findIndex(o => o.n === it.n && o.lo[1] === it.lo[1] && o.hi[1] === it.hi[1]) === i);
  el.replaceChildren(...uniq.slice(0, 3).map(it => {
    const ty = ASP_TYPE[it.t] || '';
    const name = it.n.toUpperCase().includes(ty) ? it.n : `${ty} ${it.n}`;
    const cls = it.c != null && it.c < ASP_CLASS.length ? ` ${t('card.aspclass', { c: ASP_CLASS[it.c] })}` : '';
    const s = document.createElement('span');
    s.textContent = `${name}${cls} \u00b7 ${it.lo[1]}\u2013${it.hi[1]}`;     // tekst, geen HTML: namen komen van buiten
    return s;
  }));
  el.hidden = false;
}

// ---------------------------------------------------------------- radiofrequenties
// Bron: OurAirports airport-frequencies (per luchthaven). Voor Schiphol komen de Amsterdam
// Radar-frequenties per naderingspunt uit AIP EHAM STAR-1 (AIRAC AMDT 03/2026); OurAirports heeft
// daar 127.87 waar de AIP 127.780 geeft. Dat OurAirports fout zit is na te rekenen: 127.870 is
// geen geldige 8,33 kHz-kanaalaanduiding (die eindigen per 25 kHz-blok op .x05, .x10 of .x15),
// 127.780 wel, en die hoort bij draaggolf 127.775.
const EHAM_ACC = [
  { fix: 'SUGOL', lat: 52.525556, lon: 3.967222, ch: 118.805 },
  { fix: 'ARTIP', lat: 52.511111, lon: 5.569167, ch: 120.555 },
  { fix: 'RIVER', lat: 51.912778, lon: 4.132500, ch: 127.780 },
];

// ---------------------------------------------------------------- hoger luchtruim
// Nederland is in twee lagen verdeeld. Tot FL245 werkt Amsterdam ACC ("Amsterdam Radar"),
// vanaf FL245 tot FL660 doet Maastricht UAC ("Maastricht Radar") het, voor Nederland, België,
// Luxemburg en noordwest-Duitsland. Bron voor de grens en het bereik: LVNL eAIP ENR 2.1 en
// EUROCONTROL. Boven FL245 kreeg je hiervoor niets te zien, want er werd alleen naar
// luchthavens gekeken.
const FL_UAC = 24500;                                // FL245: hier begint Maastricht UAC

// De sectoren die Nederlands luchtruim dekken, met hun lagen. Delta hoort bij de DECO-groep en
// dekt het grootste deel van Nederland; Ruhr (Hannover-groep) dekt de zuidoosthoek richting
// Duitsland. Frequenties uit de Belgische eAIP ENR 2.1 (skeyes), die ze als enige officiële
// bron met sectornaam publiceert; alle vijf komen ook voor in de lijst van de LVNL eAIP ENR 2.1
// voor Amsterdam UTA, wat ze onafhankelijk bevestigt. De LVNL-AIP noemt zelf geen sectornamen.
// Wat hier een benadering is en geen AIP-gegeven: waar de grens tussen Delta en Ruhr precies
// ligt. Die publiceert niemand openbaar; de lijn hieronder is op het verzorgingsgebied geschat.
const MUAC = {
  delta: { naam: 'Delta', lagen: [[FL_UAC, 33500, 135.960], [33500, 36500, 135.510], [36500, 66000, 132.085]] },
  ruhr:  { naam: 'Ruhr',  lagen: [[FL_UAC, 37500, 124.435], [37500, 66000, 122.835]] },
};
function muacSector(a) {
  // ruwweg: ten zuidoosten van de lijn Nijmegen - Aken zit je in Ruhr, de rest is Delta
  const zuidoost = a.lat < 51.9 && a.lon > 5.6;
  return zuidoost ? MUAC.ruhr : MUAC.delta;
}
function muacFreq(a, alt) {
  const s = muacSector(a);
  const laag = s.lagen.find(([lo, hi]) => alt >= lo && alt < hi) || s.lagen[s.lagen.length - 1];
  return fq(`Maastricht Radar (${s.naam})`, laag[2], true);
}

// Amsterdam Radar onder FL245. De LVNL eAIP publiceert de frequenties per luchtruimvolume en
// niet per sectornaam, dus de keuze gaat op ligging ten opzichte van Schiphol: west, zuid of
// oost. De hoofdfrequentie (PRI) staat vooraan. Bron: LVNL eAIP ENR 2.1, Amsterdam CTA West,
// South 1/2 en East 1/2, en Amsterdam UTA daarboven.
const AMS_ACC = [
  { naam: 'West',  van: 225, tot: 360, ch: 123.705 },
  { naam: 'Zuid',  van: 135, tot: 225, ch: 123.850 },
  { naam: 'Oost',  van: 0,   tot: 135, ch: 124.880 },
];
function amsFreq(a, eham) {
  const brg = bearingTo(eham.lat, eham.lon, a.lat, a.lon);
  const s = AMS_ACC.find(x => (x.van <= x.tot ? brg >= x.van && brg < x.tot
                                              : brg >= x.van || brg < x.tot)) || AMS_ACC[2];
  return fq(`Amsterdam Radar (${s.naam})`, s.ch, true);
}
// Kanaalnaam naar frequentie in Hz. Bij 8,33 kHz-kanalen is de naam niet de frequentie zelf:
// 118.280 is 118,275 MHz, 118.105 is 118,100 MHz, 135.110 is 135,1083 MHz.
function channelHz(ch) {
  const khz = Math.round(ch * 1000), r = khz % 25;
  const off = { 0: 0, 5: 0, 10: 25 / 3, 15: 50 / 3 }[r];
  return Math.round(((khz - r) + (off ?? r)) * 1000);
}
function rwyMatch(desc, ids) {
  const tok = new Set(String(desc).toUpperCase().split(/[^0-9A-Z]+/));
  for (const id of ids) {
    const n = id.replace(/^0/, '');
    if (tok.has(id) || tok.has(n)) return true;
    // "18R/36L" in de omschrijving staat als twee tokens; "4/22" als "4" en "22"
  }
  return false;
}
function activeRunways(icao, kind) {
  const now = Date.now() / 1000, ids = new Set();
  for (const e of runwayMon.ends()) {
    if (e.ap !== icao) continue;
    if ((kind !== 'dep' && runwayMon.state(e.ldg, now) === 'active')
      || (kind !== 'ldg' && runwayMon.state(e.dep, now) === 'active')) ids.add(e.id.toUpperCase());
  }
  return ids;
}
function freqsOf(ap, types) {
  return (ap && ap.freqs || []).filter(f => types.includes(f[0]));
}
function fq(label, ch, primary) { return { label, ch, hz: channelHz(ch), primary: !!primary }; }
function towerLike(ap, types, kind) {
  const all = freqsOf(ap, types);
  if (!all.length) return [];
  const act = activeRunways(ap.icao, kind);
  const hit = act.size ? all.filter(f => rwyMatch(f[1], act)) : [];
  const use = (hit.length ? hit : all).slice(0, 2);
  return use.map(f => fq(`${f[0]} ${f[1].replace(/^RWY\s*/i, '')}`.trim(), f[2], hit.length > 0));
}
// De waarschijnlijke frequentie(s) voor dit toestel, op basis van positie, hoogte en route
function radioFor(a) {
  // Eén plek voor de hele radiokant van de vluchtdetails: geen frequenties betekent geen
  // RADIO-regel en geen knoppen, zonder dat elke plek apart de schakelaar hoeft te kennen.
  if (radio.uit) return [];
  if (!a || a.lat == null || !airports.length) return [];
  const alt = a.ground ? 0 : (a.altb ?? a.altg ?? 0);
  const withF = airports.filter(ap => ap.freqs && ap.freqs.length);
  let near = null, nd = Infinity;
  for (const ap of withF) {
    const d = gcKm(a.lat, a.lon, ap.lat, ap.lon);
    if (d < nd) { nd = d; near = ap; }
  }
  const eham = withF.find(ap => ap.icao === 'EHAM');
  const dE = eham ? gcKm(a.lat, a.lon, eham.lat, eham.lon) : Infinity;
  const r = routeOf(a);
  let arr = r && r.dIcao === 'EHAM', dep = r && r.oIcao === 'EHAM';
  if (!arr && !dep && dE < 80 && a.track != null && !a.ground) {
    const diff = Math.abs(((bearingTo(a.lat, a.lon, eham.lat, eham.lon) - a.track + 540) % 360) - 180);
    arr = diff < 70; dep = diff > 110 && dE < 40;
  }
  // op de grond: klaring en grondverkeersleiding van de luchthaven waar het toestel staat
  if (a.ground) {
    if (!near || nd > 6) return [];
    const gnd = towerLike(near, ['GND'], null);
    const dels = freqsOf(near, ['CLD', 'DEL']).sort((p, q) => /DEL/i.test(q[1]) - /DEL/i.test(p[1]));
    const del = !(a.gs > 3) ? dels.slice(0, 1).map(f => fq(`DEL ${f[1].replace(/CLNC\s*DEL/i, '').trim()}`.trim(), f[2])) : [];
    return [...gnd, ...del].slice(0, 3);
  }
  // laag bij een luchthaven: toren (bij Schiphol de toren van de baan in gebruik)
  const twrKm = near && near.icao === 'EHAM' ? 20 : 15;
  if (near && nd < twrKm && alt < 3500) {
    const twr = towerLike(near, ['TWR'], arr ? 'ldg' : dep ? 'dep' : null);
    if (twr.length) return twr;
  }
  // vanaf FL245 is het Maastricht UAC, waar ook in het land
  if (alt >= FL_UAC) return [muacFreq(a, alt)];

  if (eham && dE < 110 && alt < FL_UAC) {
    const acc = () => {
      const s = EHAM_ACC.reduce((b, f) => (gcKm(a.lat, a.lon, f.lat, f.lon) < gcKm(a.lat, a.lon, b.lat, b.lon) ? f : b));
      return fq(`Amsterdam Radar (${s.fix})`, s.ch, true);
    };
    const own = (types, max) => freqsOf(eham, types).slice(0, max).map(f => fq(f[1] || f[0], f[2]));
    if (arr) return alt > 10000 ? [acc(), ...own(['ARR'], 1)] : [...own(['ARR'], 2), ...own(['APP'], 1)];
    if (dep) return alt < 10000 ? own(['DEP'], 2) : [acc()];
    if (alt >= 3000) return dE < 60 && alt < 10000 ? own(['APP'], 1) : [acc()];     // TMA: Approach, hoger: Radar
  }
  // laag bij een andere luchthaven: naderingsleiding en toren daarvan
  if (near && near.icao !== 'EHAM' && nd < 30 && alt < 6000) {
    const l = [...freqsOf(near, ['APP']).slice(0, 1).map(f => fq(`${near.icao} ${f[1] || 'APP'}`, f[2])),
               ...towerLike(near, ['TWR'], null).map(f => ({ ...f, label: `${near.icao} ${f.label}` }))];
    if (l.length) return l.slice(0, 3);
  }
  // laag VFR-verkeer in Nederland: Amsterdam Information
  if (eham && dE < 200 && alt < 4500) return freqsOf(eham, ['FIS']).slice(0, 1).map(f => fq(f[1] || 'FIS', f[2]));
  // verder van Schiphol maar nog onder FL245: het gebiedsdeel van Amsterdam Radar
  if (eham && dE < 260 && alt >= 5500) return [amsFreq(a, eham)];
  return [];
}
// ---------------------------------------------------------------- luisterspeler in de pagina
let playing = null;                          // { hz, ch, label }
const player = createPlayer(renderPlayer, sttSegment);
// wie praat er: elke transmissie gaat als wav naar de Pi, die er het callsign uit haalt
const stt = { ready: false, model: '', fout: '', on: true, record: false, learn: true, rows: [],
              hits: new Set(), hitPart: 0, busy: false, busySince: 0, wacht: [], auto: false,
              tel: { tx0: 0, sent: 0, drop: 0, hit: 0, miss: 0, t0: 0 } };
function playerUrl() {
  if (radio.playerUrl) return radio.playerUrl;                   // met de hand ingesteld wint
  // Via de tracker zelf, die de audio bij OpenWebRX ophaalt en doorgeeft. Dat is de weg naar
  // buiten: je ontvanger hoeft niet aan het internet, en omdat dit dezelfde herkomst is als de
  // pagina wordt het vanzelf wss:// -- een ws:// naar een 192.168-adres weigert de browser op
  // een https-pagina als mixed content. Het pad is relatief, zodat het ook klopt achter de
  // ingress van Home Assistant, waar de pagina onder een lang tokenpad hangt.
  if (radio.relay === 'aan' || (radio.relay !== 'uit' && location.protocol === 'https:')) {
    const map = location.pathname.replace(/[^/]*$/, '');
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${map}owrx`;
  }
  if (location.protocol === 'https:' && radio.url) return radio.url.replace(/^http/, 'ws').replace(/\/+$/, '') + '/ws/';
  // De SDR staat waar OpenWebRX draait, en dat hoeft niet de machine te zijn die deze pagina
  // levert. Draait de tracker als add-on op een andere machine, dan wijst location.hostname
  // naar die machine en hoor je niets; openwebrx.host uit de config wijst wel goed.
  const h = radio.host && !/^(127\.0\.0\.1|localhost|::1)$/.test(radio.host)
    ? radio.host : location.hostname;
  return `ws://${h}:${radio.port || 8073}/ws/`;
}
async function playFreq(f) {
  if (playing && playing.hz === f.hz) { stopPlayer(); return; }          // nogmaals klikken = stoppen
  playing = { hz: f.hz, ch: f.ch, label: f.label };
  renderPlayer({ playing: false, hz: f.hz, connecting: true });
  await owrxProfile(f.hz);                                               // eerst het juiste profiel
  if (!playing || playing.hz !== f.hz) return;                           // intussen iets anders gekozen
  player.play(playerUrl(), f.hz, f.label, radio.sql);
  player.setCapture(stt.on);
}
function stopPlayer() {
  playing = null;
  player.stop();
  if (selected) updateFreqs(selected);
}
let lastPl = {};
function renderPlayer(st) {
  lastPl = st || {};
  scanNiveau(lastPl);
  const el = $('player');
  if (!playing) { el.hidden = true; return; }
  el.hidden = false;
  $('plLabel').textContent = playing.label;
  $('plFreq').textContent = playing.ch.toFixed(3);
  $('plProf').textContent = radio.profile ? radio.profile : '';
  const lvl = st.level ?? -150, sql = st.sql ?? radio.sql ?? -150;
  const pct = v => `${Math.max(0, Math.min(100, (v + 110) / 90 * 100))}%`;
  $('plBar').style.width = pct(lvl);
  $('plBar').classList.toggle('open', lvl >= sql);
  $('plSq').style.left = pct(sql);
  const sl = $('plSql');
  if (document.activeElement !== sl) { sl.value = String(Math.round(sql)); }
  $('plSqlOut').textContent = `${Math.round(sql)}`;
  $('plStatus').textContent = st.error ? t('pl.noconn', { url: playerUrl() })
    : st.closed ? t('pl.closed')
    : st.outOfBand ? t('pl.outofband')
    : st.connecting || !st.playing ? t('pl.connecting')
    : radio.noProfile === playing.hz ? t('card.radio.noprof') : '';
  if (selected && (st.connecting || st.closed)) updateFreqs(selected);
}
// ---- hoogte van de spelerbalk: slepen aan de bovenrand, of met de pijltoetsen -----------------
// De hoogte is vast (dus het kaartvlak springt niet bij elke nieuwe regel) maar instelbaar.
const PLAY_MIN = 60;
const PLAY_STD = 74;                             // twee regels: bediening, en de lijst eronder
let playH = PLAY_STD;
function setPlayH(px, save = true) {
  playH = Math.round(Math.max(PLAY_MIN, Math.min(px, innerHeight * 0.4)));
  document.documentElement.style.setProperty('--playh', `${playH}px`);
  layoutPanel();
  if (radarView) radarView.resize();
  resize();
  if (save) saveState();
}
{
  const grip = $('plGrip');
  let van = 0, hoog = 0;
  grip.addEventListener('pointerdown', e => {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    van = e.clientY; hoog = playH;
    document.body.classList.add('playresize');
  });
  grip.addEventListener('pointermove', e => {
    if (!grip.hasPointerCapture(e.pointerId)) return;
    setPlayH(hoog + (van - e.clientY), false);          // omhoog slepen maakt hem hoger
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    grip.addEventListener(ev, () => {
      if (!document.body.classList.contains('playresize')) return;
      document.body.classList.remove('playresize');
      saveState();
    });
  }
  grip.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp') { e.preventDefault(); setPlayH(playH + 8); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setPlayH(playH - 8); }
  });
}
addEventListener('resize', () => setPlayH(playH, false));

// Lichtkrant: past de kanaalnaam met frequentie niet in het vakje, dan schuift hij heen en
// weer. De afstand en de duur komen uit de werkelijke maat, zodat het tempo altijd hetzelfde
// aanvoelt (ongeveer 28 px per seconde) en stilstaat als het wel past.
function plKrant() {
  const vak = $('plInfo'), tekst = $('plScroll');
  if (!vak || !tekst) return;
  const over = Math.ceil(tekst.scrollWidth - vak.clientWidth);
  if (over > 4) {
    vak.style.setProperty('--krantpx', `${over + 8}px`);
    vak.style.setProperty('--krantms', `${Math.max(2600, Math.round((over + 8) / 28 * 1000))}ms`);
    vak.classList.add('krant');
    vak.title = [...tekst.children].map(e => e.textContent.trim()).filter(Boolean).join(' \u00b7 ');
  } else {
    vak.classList.remove('krant');
    vak.style.removeProperty('--krantpx');
    vak.removeAttribute('title');
  }
}
addEventListener('resize', plKrant);
setInterval(plKrant, 1500);

$('plStop').addEventListener('click', stopPlayer);
$('plSql').addEventListener('input', e => {
  const v = +e.target.value;
  radio.sql = v;
  player.setSquelch(v);
  $('plSqlOut').textContent = `${v}`;
});
$('plVol').addEventListener('input', e => player.setVolume(+e.target.value / 100));

// --- spraak naar tekst -------------------------------------------------------------------------
const STT_MAX = 60;                                 // zoveel transmissies blijven in beeld staan

// Eén aanvraag tegelijk: komt er een plakje binnen terwijl de Pi nog bezig is, dan blijft het
// nieuwste klaarliggen en gaat dat zodra de vorige klaar is. Zo blijft de speler doorluisteren en
// kan de herkenning nooit achterop raken of blijven hangen.
const STT_TIMEOUT = 20000;
// Wachtrij voor transmissies die binnenkomen terwijl er nog een bij whisper ligt. Er lag er
// precies één klaar, en elke volgende gooide die eruit: op een drukke frequentie viel daardoor
// het meeste weg terwijl de machine wel degelijk nog aan de beurt kwam. Nu blijven er twee
// liggen.
//
// Dieper heeft geen zin. Een transcriptie duurt op deze hardware ongeveer tien seconden, dus
// nummer drie is een halve minuut oud tegen de tijd dat hij aan de beurt is -- dan licht er een
// toestel op dat allang ergens anders vliegt. Wat te lang heeft gelegen gaat er daarom bij het
// ophalen alsnog uit; liever niets aanwijzen dan de verkeerde.
const STT_WACHT_MAX = 2;
const STT_WACHT_OUD = 30000;

function sttSegment(seg) {
  if (!stt.on || !stt.ready) return;
  if (stt.hits.has(seg.t0) && seg.part <= stt.hitPart) return;   // dit stuk is al afgehandeld
  if (stt.busy) {
    if (Date.now() - stt.busySince > STT_TIMEOUT) stt.busy = false;    // vastgelopen: weer vrijgeven
    else {
      sttWacht(seg);
      return;
    }
  }
  sttSend(seg);
}

// Een nieuw plakje van dezelfde transmissie vervangt het wachtende: dat is hetzelfde fragment
// met meer audio erin, niet iets nieuws. Een andere transmissie komt erachter in de rij. Zit de
// rij vol, dan gaat de oudste eruit -- die is het verst weg van wat er nu in de lucht is.
function sttWacht(seg) {
  const i = stt.wacht.findIndex(s => s.t0 === seg.t0);
  if (i >= 0) {
    if ((seg.part || 0) >= (stt.wacht[i].part || 0)) stt.wacht[i] = seg;
    return;
  }
  stt.wacht.push(seg);
  while (stt.wacht.length > STT_WACHT_MAX) { stt.wacht.shift(); stt.tel.drop++; }
}

function sttVolgende() {
  while (stt.wacht.length) {
    const seg = stt.wacht.shift();
    if (stt.hits.has(seg.t0) && (seg.part || 0) <= stt.hitPart) continue;   // al herkend
    if (Date.now() - seg.t0 > STT_WACHT_OUD) { stt.tel.drop++; continue; }  // te oud om te wijzen
    return seg;
  }
  return null;
}

async function sttSend(seg) {
  const cands = sttCandidates();
  if (!cands.length) return;                   // niets in beeld: dan valt er ook niets aan te wijzen
  stt.busy = true;
  stt.busySince = Date.now();
  stt.tel.sent++;
  if (!stt.tel.t0) { stt.tel.t0 = Date.now(); stt.tel.tx0 = player.counts.tx; }
  const row = { t: seg.t0, ch: playing ? playing.ch : (seg.hz || 0) / 1e6,
                naam: seg.label || (playing ? playing.label : ''), wait: true };
  stt.rows.push(row);
  while (stt.rows.length > 6) stt.rows.shift();
  sttRender();
  let r = null;
  try {
    const q = `?hz=${Math.round(seg.hz || 0)}&label=${encodeURIComponent(seg.label || '')}`
      + `&cands=${encodeURIComponent(cands.join(','))}${seg.first ? '&first=1' : ''}`;
    const ctl = new AbortController();
    const kill = setTimeout(() => ctl.abort(), STT_TIMEOUT);
    const res = await fetch('api/stt' + q, { method: 'POST', body: seg.wav, signal: ctl.signal,
                                             headers: { 'Content-Type': 'audio/wav' } });
    r = await res.json();
    clearTimeout(kill);
  } catch { r = null; }
  const idx = stt.rows.indexOf(row);
  if (r && r.ok && r.cs) {
    const a = sttFind(r.cs);
    row.wait = false;
    row.cs = a && a.cs ? a.cs.trim() : r.cs;         // zoals het in het datablok staat
    row.key = r.cs;
    row.conf = r.conf || 0;
    row.raw = r.raw || '';
    row.hex = a ? a.hex : '';
    row.buiten = !!r.offscreen;
    if (a && radarView) radarView.setTalking(a.hex, 3);
    if (a && stt.auto) select(a);                    // toestelkaart meteen openen
    stt.tel.hit++;
    stt.hits.add(seg.t0);                            // even niets meer uit deze stroom
    stt.hitPart = seg.part || 0;
    player.stopSegment(seg.t0);
    for (const t0 of stt.hits) if (Date.now() - t0 > 120000) stt.hits.delete(t0);
  } else if (idx >= 0) {
    if (r && r.ok && !r.busy) stt.tel.miss++; else stt.tel.drop++;
    stt.rows.splice(idx, 1);                         // niemand herkend: geen regel
  }
  sttRender();
  stt.busy = false;
  const next = sttVolgende();                        // wachtende transmissie alsnog doen
  if (next) sttSend(next);
}

// waar mag hij uit kiezen? Alleen de toestellen die nu op de radarplot staan. Staat er niets bij
// wat past, dan gebeurt er ook niets: liever niemand aanwijzen dan de verkeerde.
function sttCandidates() {
  const hz = playing ? playing.hz : 0;
  const seen = new Set();
  const list = [];
  let onScreen = radarView && radarView.shown ? radarView.shown() : [];
  if (!onScreen.length) {                  // 3D-weergave: dan maar wat de pagina in beeld heeft
    onScreen = [];
    for (const a of aircraft.values()) if (a.cs) onScreen.push(a.cs);
  }
  for (const raw of onScreen) {
    const cs = String(raw || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (!cs || seen.has(cs)) continue;
    seen.add(cs);
    const a = sttFind(cs);
    list.push({ cs, a, fit: 1 });
  }
  if (hz) {                       // wie volgens zijn vliegfase op deze frequentie hoort, gaat voorop
    for (const n of list.slice(0, 70)) {
      if (!n.a) continue;
      const fr = radioFor(n.a);
      if (fr.some(f => Math.abs(f.hz - hz) < 2000)) n.fit = 0;
    }
  }
  list.sort((p, q) => p.fit - q.fit);
  return list.map(n => n.cs);
}

function sttFind(cs) {
  for (const a of aircraft.values()) {
    if ((a.cs || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase() === cs) return a;
  }
  return null;
}

function sttPick(cs) {
  const a = sttFind(cs);
  if (a) { select(a); if (radarView) radarView.setTalking(a.hex, 3); }
}

function sttRender() {
  const el = $('sttList');
  if (!el) return;
  el.hidden = !stt.on;
  document.getElementById('player')?.classList.toggle('loglive', stt.on);
  if (!stt.on) return;
  // Vaste kolommen: tijd, frequentie, kanaal, callsign, type, registratie. Elke regel heeft
  // er altijd zes, ook als er nog niets te melden valt, anders verspringt de tabel.
  const cel = (tag, cls, tekst) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (tekst != null) e.textContent = tekst;
    return e;
  };
  el.textContent = '';
  if (!stt.rows.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    if (stt.fout) {
      li.classList.add('e');
      li.textContent = `${t('stt.kapot')} ${stt.fout}`;
      li.title = stt.fout;
    } else {
      li.textContent = t('stt.wait');
    }
    el.appendChild(li);
    return;
  }
  // Nieuwste bovenaan: je kijkt naar wie er nét praatte, niet naar wie er zes transmissies
  // geleden praatte. De lijst is kort en staat vast, dus onderaan bijschuiven betekende dat
  // je elke keer je blik naar beneden moest verplaatsen.
  for (const r of [...stt.rows].reverse()) {
    const li = document.createElement('li');
    if (r.raw) li.title = r.raw;                       // wat whisper er letterlijk van maakte
    const tm = cel('time', null, new Date(r.t).toLocaleTimeString(getLang() === 'en' ? 'en-GB' : 'nl-NL',
                                                                 { hour12: false }));
    li.append(tm, cel('b', null, r.ch ? r.ch.toFixed(3) : ''), cel('span', 'kanaal', r.naam || ''));
    if (r.wait || r.err) {
      li.append(cel('span', r.wait ? 'w' : 'e', r.wait ? '\u2026' : r.err), cel('span'), cel('span'));
    } else {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cs';
      b.textContent = r.cs;
      if (r.conf < 0.5) b.classList.add('maybe');      // aan de twijfelachtige kant
      if (r.buiten) {                                  // stond niet op de radarplot
        b.classList.add('buiten');
        b.title = t('stt.offscreen');
      }
      b.addEventListener('click', () => sttPick(r.key || r.cs));
      const a = r.hex ? aircraft.get(r.hex) : null;
      li.append(b, cel('span', 'sub', a ? (a.type || '') : ''), cel('span', 'sub', a ? (a.reg || '') : ''));
    }
    el.appendChild(li);
  }
}


// --- leren: transcripties nakijken -------------------------------------------------------------
// Wat hier gecorrigeerd wordt telt dubbel: het levert een cijfer (hoeveel woorden kloppen er) en
// een woordenboekje met fouten die steeds terugkomen, dat meteen op nieuwe transmissies werkt.
const learn = { open: false, todo: true, items: [], lex: [], audio: null, busy: false };

function learnOpen(on) {
  learn.open = on;
  $('learn').hidden = !on;
  $('player').classList.toggle('logoff', on);      // anders staat het paneel op de spelerbalk

  if (on) learnLoad(); else if (learn.audio) learn.audio.pause();
}
$('plAuto').addEventListener('click', () => {
  stt.auto = !stt.auto;
  $('plAuto').setAttribute('aria-pressed', stt.auto ? 'true' : 'false');
  saveState();
});
$('plLearn').addEventListener('click', () => learnOpen(!learn.open));
$('learnClose').addEventListener('click', () => learnOpen(false));
$('learnLex').addEventListener('click', () => {
  const box = $('learnLexBox');
  const open = box.hidden;
  box.hidden = !open;
  $('learnLex').setAttribute('aria-pressed', String(open));
  $('learnList').hidden = open;
  if (open) learnLexList();
});
$('learnTodo').addEventListener('click', () => {
  learn.todo = !learn.todo;
  $('learnTodo').setAttribute('aria-pressed', learn.todo ? 'true' : 'false');
  learnLoad();
});
$('learnInfo').addEventListener('click', () => {
  const box = $('learnInfoText');
  box.hidden = !box.hidden;
  $('learnInfo').setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
});
$('learnExport').addEventListener('click', () => { window.location.href = 'api/stt/export'; });

function learnCands() {
  const dl = $('learnCands');
  if (!dl) return;
  dl.textContent = '';
  for (const cs of sttCandidates().slice(0, 60)) {
    const o = document.createElement('option');
    o.value = cs;
    dl.appendChild(o);
  }
}

async function learnLoad() {
  learnCands();
  let r;
  try { r = await getJSON(`api/stt/list?limit=120${learn.todo ? '&todo=1' : ''}`); }
  catch { return; }
  learn.items = r.items || [];
  learn.lex = (r.score && r.score.lexrows) || [];
  learnStats(r.score || {});
  learnList();
  learnLexList();
}

// Het woordenboekje: elke regel is een woord dat whisper verkeerd opschrijft en waar het voor
// staat. "zelf" betekent dat de herkenning het uit zijn eigen zekere treffers leerde, zonder dat
// jij ernaar gekeken hebt; die wegen licht, dus er zijn er drie nodig voor hij blind wordt
// toegepast. Klopt een regel niet, dan gooi je hem hier weg.
function learnLexList() {
  const box = $('learnLexBox');
  if (!box || box.hidden) return;
  box.innerHTML = '';
  if (!learn.lex.length) {
    const p = document.createElement('p');
    p.className = 'learn-leeg';
    p.textContent = t('learn.lexleeg');
    box.appendChild(p);
    return;
  }
  for (const r of learn.lex) {
    const rij = document.createElement('div');
    rij.className = 'lx-rij' + (r.aan ? ' aan' : '');
    const w = document.createElement('b');
    w.textContent = r.wrong;
    const pijl = document.createElement('i');
    pijl.textContent = '\u2192';
    const g = document.createElement('span');
    g.textContent = r.right;
    const n = document.createElement('em');
    n.textContent = r.auto >= r.n ? t('learn.lexself', { n: r.n }) : t('learn.lexn', { n: r.n });
    n.title = r.aan ? t('learn.lexon') : t('learn.lexoff');
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '\u00d7';
    x.title = t('learn.lexdel');
    x.addEventListener('click', async () => {
      try {
        const res = await fetch('api/stt/lexdel', { method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wrong: r.wrong }) });
        const d = await res.json();
        learn.lex = (d && d.lexrows) || [];
        learnLexList();
      } catch { /* volgende ronde */ }
    });
    for (const el of [w, pijl, g, n, x]) rij.appendChild(el);
    box.appendChild(rij);
  }
}

function learnStats(sc) {
  const best = (sc.models || [])[0];
  const parts = [t('learn.count', { done: sc.done ?? 0, total: sc.total ?? 0 })];
  if (best && best.pct != null) {
    parts.push(t('learn.pct', { model: best.model, pct: best.pct, wrong: best.wrong,
                                missed: best.missed }));
  }
  if (sc.lexicon) {
    parts.push(t(sc.lexauto ? 'learn.lexboth' : 'learn.lex',
                 { n: sc.lexicon, auto: sc.lexauto }));
  }
  const m = sttRate();
  if (m) parts.push(m);
  $('learnStats').textContent = parts.join(' · ');
}

// hoe druk is het op deze frequentie, en houdt de Pi het bij?
function sttRate() {
  const c = player.counts, tel = stt.tel;
  if (!tel.t0) return '';
  const min = Math.max(0.2, (Date.now() - tel.t0) / 60000);
  const tx = Math.max(0, c.tx - tel.tx0);
  return t('learn.rate', { tx: (tx / min).toFixed(1), hit: tel.hit, miss: tel.miss, drop: tel.drop });
}

function learnPlay(id) {
  if (!learn.audio) learn.audio = new Audio();
  learn.audio.src = `api/stt/audio?id=${encodeURIComponent(id)}`;
  learn.audio.play().catch(() => {});
}

async function learnSave(item, input, row) {
  if (learn.busy) return;
  learn.busy = true;
  try {
    const res = await fetch('api/stt/fix', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, text: input.value }) });
    const ok = (await res.json()).ok;
    row.classList.toggle('done', !!ok);
    item.fix = input.value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    const next = row.nextElementSibling && row.nextElementSibling.querySelector('input');
    if (next) { next.focus(); learnPlay(next.dataset.id); }
  } catch { /* volgende keer beter */ }
  learn.busy = false;
}

async function learnRedo(item, input, row) {
  row.classList.add('busy');
  try {
    const res = await fetch('api/stt/redo', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, cands: sttCandidates().join(',') }) });
    const r = await res.json();
    if (r && r.ok) {
      item.cs = r.cs || ''; item.raw = r.raw || ''; item.model = r.model;
      input.value = r.cs || '';
      const sp = row.querySelector('.raw');
      if (sp) sp.textContent = item.raw;
    }
  } catch { /* niets */ }
  row.classList.remove('busy');
}

function learnList() {
  const el = $('learnList');
  el.textContent = '';
  if (!learn.items.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = t('learn.empty');
    el.appendChild(li);
    return;
  }
  for (const item of learn.items) {
    const li = document.createElement('li');
    if (item.fix != null) li.classList.add('done');
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'ply';
    play.textContent = '▶';
    play.title = t('learn.play');
    play.addEventListener('click', () => learnPlay(item.id));
    const tm = document.createElement('time');
    tm.textContent = new Date((item.t || 0) * 1000).toISOString().slice(11, 19);
    const fq = document.createElement('b');
    fq.textContent = item.hz ? (item.hz / 1e6).toFixed(3) : '';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'cs';
    inp.value = item.fix != null ? item.fix : (item.cs || '');
    inp.placeholder = t('learn.none');
    inp.dataset.id = item.id;
    inp.setAttribute('list', 'learnCands');
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); learnSave(item, inp, li); }
      if (e.key === 'Escape') inp.blur();
    });
    inp.addEventListener('focus', () => {
      if (!inp.dataset.played) { inp.dataset.played = '1'; learnPlay(item.id); }
    });
    const raw = document.createElement('span');
    raw.className = 'raw';
    raw.textContent = item.raw || '';                  // wat whisper hoorde, als geheugensteun
    const redo = document.createElement('button');
    redo.type = 'button';
    redo.className = 'redo';
    redo.textContent = '↻';
    redo.title = t('learn.redo');
    redo.addEventListener('click', () => learnRedo(item, inp, li));
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'ok';
    save.textContent = '✓';
    save.title = t('learn.save');
    save.addEventListener('click', () => learnSave(item, inp, li));
    li.append(play, tm, fq, inp, raw, redo, save);
    el.appendChild(li);
  }
}

function updateFreqs(a) {
  const el = $('cFreq');
  const list = radioFor(a);
  if (!list.length) { el.hidden = true; return; }
  const key = list.map(f => f.hz).join(',') + '|' + (playing ? playing.hz : '') + '|' + (radio.profile || '') + '|' + (radio.noProfile || '');
  if (el.dataset.key === key && !el.hidden) return;        // niet elke seconde opnieuw opbouwen
  el.dataset.key = key;
  const head = document.createElement('span');
  head.className = 'fqhead';
  const mine = !!playing && list.some(f => f.hz === playing.hz);
  head.textContent = t('card.radio') + (mine && radio.noProfile === playing.hz ? ` \u00b7 ${t('card.radio.noprof')}`
    : mine && radio.profile ? ` \u00b7 OpenWebRX: ${radio.profile}` : '');
  const rows = list.map(f => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fq';
    const on = !!playing && playing.hz === f.hz;
    b.setAttribute('aria-pressed', String(on));
    b.title = t(on ? 'card.radio.stop' : 'card.radio.play');
    const p = document.createElement('span'); p.className = 'play'; p.textContent = on ? '\u25A0' : '\u25B6';
    const l = document.createElement('span'); l.className = 'fl'; l.textContent = f.label;
    const m = document.createElement('span'); m.className = 'mhz'; m.textContent = f.ch.toFixed(3);
    b.append(p, l, m);
    b.addEventListener('click', () => { playFreq(f).then(() => updateFreqs(a)); });
    return b;
  });
  el.replaceChildren(head, ...rows);
  el.hidden = false;
}

const schInfo = new Map();              // hex -> vluchtinformatie van Schiphol
function loadSchiphol(a) {
  // niet afhankelijk van de vlag uit api/config: die kan verouderd zijn als de pagina al openstond
  if (!a || schInfo.has(a.hex)) return;
  schInfo.set(a.hex, null);
  getJSON(`api/flightinfo?reg=${encodeURIComponent(a.reg || '')}&cs=${encodeURIComponent(a.cs || '')}`)
    .then(f => {
      schInfo.set(a.hex, f && f.flight ? f : {});
      if (f && f.route) {                       // Schiphol weet de route zeker: die wint
        const leg = legFrom(f.route, 0);
        leg.airline = (routes.get(a.cs) || {}).airline;
        leg.fixed = true;
        if (a.cs) { routes.set(a.cs, leg); routeChoice.delete(a.cs); }
      }
      if (selected === a) updateCard();
    })
    .catch(() => {});
}

function hhmmLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : hhmm(d);
}

function stateText(states) {
  return (states || []).map(s => {
    const k = `state.${s}`, v = t(k);
    return v === k ? s : v;
  }).join(', ');
}

function delayMinutes(sched, real) {
  if (!sched || !real) return null;
  const min = Math.round((new Date(real) - new Date(sched)) / 60000);
  return Number.isFinite(min) ? min : null;
}

function delayText(sched, real) {
  const min = delayMinutes(sched, real);
  if (min === null) return '';
  if (min >= 3) return `<span class="delay-late">${t('card.delay.late', { n: min })}</span>`;
  if (min <= -3) return `<span class="delay-early">${t('card.delay.early', { n: -min })}</span>`;
  return t('card.delay.ontime');
}

function updateSchiphol(a) {
  const box = $('cSch'), head = $('cSchHead'), f = schInfo.get(a.hex);
  if (!f || !f.flight) { box.hidden = true; head.hidden = true; return; }
  const rr = routeOf(a);                     // Schiphol-vlucht in de andere richting dan de gekozen route: niet tonen
  // De vlucht van de luchthaven hoort bij dit toestel zolang de route het veld noemt. Op de
  // richting toetsen ging mis bij een zwakke koppeling: die laat de koerscontrole de route
  // omdraaien, en dan verdween het blok terwijl het uit precies dezelfde bron kwam.
  const veld = f.home || 'EHAM';
  if (rr && rr.oIcao && rr.dIcao && rr.oIcao !== veld && rr.dIcao !== veld) {
    box.hidden = true; head.hidden = true; return;
  }
  const arrival = f.dir === 'A';
  const r = routeOf(a);
  const other = f.other || (arrival ? (r && r.oIata) : (r && r.dIata)) || '';
  const late = delayMinutes(f.sched, f.actual || f.eta);
  const tags = (f.states || []).map(s => `<span class="tag">${stateText([s])}</span>`);
  tags.unshift(`<span class="tag${f.hard === false ? ' zwak' : ''}">${bronNaam(f.src)}</span>`);
  if (late !== null && late >= 15) tags.push(`<span class="tag late">${t('card.delayed', { n: late })}</span>`);
  head.innerHTML = `<span class="schtitle">${t(arrival ? 'card.sch.arr' : 'card.sch.dep', { flight: f.flight, from: other, to: other })}</span>`
    + (tags.length ? `<span class="tags">${tags.join('')}</span>` : '')
    + (f.codeshares && f.codeshares.length
      ? `<span class="sub">${t('card.codeshares', { list: f.codeshares.join(', ') })}</span>` : '');
  head.hidden = false;

  $('cSchedLbl').textContent = t('card.sched');
  $('cSched').textContent = hhmmLocal(f.sched) || '–';
  $('cSchedM').textContent = arrival ? t('card.eta') : t('card.dep');

  const real = f.actual || f.eta;
  $('cExpLbl').textContent = t(f.actual ? 'card.actual' : 'card.expected');
  $('cEtaReal').textContent = hhmmLocal(real) || '–';
  $('cEtaRealM').innerHTML = delayText(f.sched, real);

  // bij aankomst is de bagageband nuttiger dan de gate zodra die bekend is
  const useBelt = arrival && f.belt;
  $('cGateLbl').textContent = t(useBelt ? 'card.belt' : 'card.gate');
  $('cGate').textContent = (useBelt ? f.belt : f.gate) || '–';
  $('cGateM').textContent = [f.pier && `pier ${f.pier}`, f.terminal && `T${f.terminal}`,
    (!useBelt && arrival && f.belt) ? `band ${f.belt}` : ''].filter(Boolean).join(' ');
  box.hidden = false;
}

// ------------------------------------------------------------ vluchtenbord
// Een overlay over de kaart met de aankomsten en vertrekken van de Nederlandse velden, uit de
// bronnen van de luchthavens zelf. De klok in de kop is de lokale tijd en loopt mee; hoe oud de
// gegevens zijn staat los onderaan, want dat is iets anders - een status van tien minuten
// geleden ziet er hetzelfde uit als een verse.
const bord = { vluchten: [], bron: {}, ouderdom: {}, schiphol: null, uren: 1, veld: '', dir: '',
               open: false, nu: 0 };
const BORD_LOGO = new Map();          // IATA -> true als het logobestand bestaat, false zo niet

// Material Design Icons, als pad meegeleverd in plaats van via een font of een CDN: dezelfde
// vorm als in het dashboard, maar zonder externe afhankelijkheid en zonder dat een ontbrekend
// lettertype een leeg vakje oplevert. Ze nemen de kleur van de tekst over.
const MDI = {
  landing: 'M2.5,19H21.5V21H2.5V19M9.68,13.27L14.03,14.43L19.34,15.85C20.14,16.06 20.96,15.59 '
    + '21.18,14.79C21.39,14 20.92,13.17 20.12,12.95L14.81,11.53L12.05,2.5L10.12,2V10.28L5.15,'
    + '8.95L4.22,6.63L2.77,6.24V11.41L4.37,11.84L9.68,13.27Z',
  takeoff: 'M2.5,19H21.5V21H2.5V19M22.07,9.64C21.86,8.84 21.03,8.36 20.23,8.58L14.92,10L8,3.57'
    + 'L6.09,4.08L10.23,11.25L5.26,12.58L3.29,11.04L1.84,11.43L3.66,14.59L4.43,15.92L6.03,15.5'
    + 'L11.34,14.07L15.69,12.91L21,11.5C21.81,11.26 22.28,10.44 22.07,9.64Z',
};
const SVGNS = 'http://www.w3.org/2000/svg';

function mdi(d, klasse = 'mdi') {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('class', klasse);
  const p = document.createElementNS(SVGNS, 'path');
  p.setAttribute('d', d);
  p.setAttribute('fill', 'currentColor');
  s.appendChild(p);
  return s;
}

// Logo plus naam. De server levert het logo op logos/<code>.png: uit web/logos als je er zelf
// een neerzet, anders uit zijn cache, anders haalt hij het eenmalig op. Lukt dat niet, dan
// blijft het vakje leeg maar houdt het wel zijn breedte, zodat de namen onder elkaar uitlijnen.
function bordLogo(v) {
  // Eerst drie letters (EZY1234), dan twee tekens (HV5314, W64242). Eén patroon met {2,3} pakt
  // greedy 'HV5' en vraagt dan een logo op dat niet bestaat.
  const s = (v.flight || '').toUpperCase().replace(/\s+/g, '');
  const m = /^([A-Z]{3})(?=\d)/.exec(s) || /^([A-Z0-9]{2})(?=\d)/.exec(s);
  const iata = m ? m[1] : '';
  const wrap = document.createElement('span');
  wrap.className = 'bmij';
  if (iata && BORD_LOGO.get(iata) !== false) {
    const im = document.createElement('img');
    im.alt = '';
    im.loading = 'lazy';
    im.src = `logos/${iata}.png`;
    im.addEventListener('error', () => { BORD_LOGO.set(iata, false); im.classList.add('leeg'); });
    im.addEventListener('load', () => BORD_LOGO.set(iata, true));
    wrap.appendChild(im);
  } else {
    wrap.appendChild(document.createElement('i'));      // houdt de kolom op breedte
  }
  const naam = document.createElement('b');
  naam.textContent = v.airline || '';
  naam.title = iata;
  wrap.appendChild(naam);
  return wrap;
}

// De bronnen leveren het kenteken zonder streepje; zo staat het ook in de toestelkaart.
function bordReg(reg) {
  const r = (reg || '').toUpperCase();
  return r.length > 2 ? `${r.slice(0, 2)}-${r.slice(2)}` : r;
}

function bordTijd(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : hhmmLocal(iso);
}

function bordStatus(v) {
  const st = ((v.states || [])[0] || '').toLowerCase();
  if (st.includes('annul') || st.includes('cancel')) return [t('board.cancelled'), 'weg'];
  if (v.actual) return [t(v.dir === 'A' ? 'board.landed' : 'board.departed'), 'klaar'];
  const s = bordTijd(v.sched), e = bordTijd(v.eta);
  if (s && e && s !== e) return [t('board.expected', { tijd: e }), 'laat'];
  return [t('board.ontime'), ''];
}

// Staat dit toestel nu in de plot? Dan mag de regel oplichten en erheen springen.
function bordToestel(v) {
  const cs = (v.cs || '').toUpperCase();
  const reg = (v.reg || '').toUpperCase();
  for (const a of aircraft.values()) {
    if (cs && (a.cs || '').trim().toUpperCase() === cs) return a;
    if (reg && (a.reg || '').replace(/[^0-9A-Z]/gi, '').toUpperCase() === reg) return a;
  }
  return null;
}

// Het bereik begrenst beide kanten. Alleen naar achteren begrenzen hielp niet: dan staat om
// middernacht de hele volgende dag in beeld, hoe klein je het venster ook zet. Vooruit mag het
// ruimer dan terug, want een bord gaat vooral over wat er nog komt.
const BORD_VOORUIT = { 1: 3, 4: 12, 24: 48 };

// De server sorteert op de beste tijd die hij heeft (werkelijk, dan verwacht, dan volgens plan);
// het bord toont de tijd volgens plan. Zou de lijst op die eerste staan, dan leest hij niet meer
// op tijd - een vlucht van 01:40 met verwachting 02:05 belandt dan tussen de kwart-overs. Daarom
// bepaalt de regel zijn plek, zijn datumkop en de nu-lijn met de tijd die je ziet staan.
function bordKlokTijd(v) {
  const d = v.sched ? new Date(v.sched).getTime() : NaN;
  return Number.isNaN(d) ? (v.t || 0) : d / 1000;
}

function bordFilter() {
  const nu = Date.now() / 1000;
  const vroeg = nu - bord.uren * 3600;
  const laat = nu + (BORD_VOORUIT[bord.uren] || bord.uren * 3) * 3600;
  return bord.vluchten
    .filter(v => v.t >= vroeg && v.t <= laat && (!bord.veld || v.home === bord.veld)
                 && (!bord.dir || v.dir === bord.dir))
    .sort((a, b) => bordKlokTijd(a) - bordKlokTijd(b));
}

function bordTeken() {
  if (!bord.open) return;
  const box = $('boardRows');
  const lijst = bordFilter();
  const scrollWas = box.scrollTop;                  // anders springt de lijst bij elke ronde
  box.innerHTML = '';
  if (!lijst.length) {
    const p = document.createElement('p');
    p.className = 'board-leeg';
    p.textContent = t('board.empty');
    box.appendChild(p);
  }
  const nuS = Date.now() / 1000;
  let vorigeDag = '', lijnGezet = false;
  for (const v of lijst) {
    const kt = bordKlokTijd(v);
    // teletekst zet er zelf een datumregel tussen; dat doen we hier ook, zodra de dag wisselt
    const dag = new Date(kt * 1000).toDateString();
    if (dag !== vorigeDag) {
      vorigeDag = dag;
      const k = document.createElement('div');
      k.className = 'bdag';
      k.textContent = bordDag(kt);
      box.appendChild(k);
    }
    // de paarse streep komt vlak voor de eerste vlucht die nog moet gebeuren
    if (!lijnGezet && kt > nuS) {
      lijnGezet = true;
      box.appendChild(bordNuLijn());
    }
    const a = bordToestel(v);                       // staat dit toestel nu in de plot?
    const r = document.createElement(a ? 'button' : 'div');
    r.className = 'brow' + (a ? ' klik inbeeld' : '');
    if (a) { r.type = 'button'; r.addEventListener('click', () => bordSpring(a)); }

    const tijd = document.createElement('span');
    tijd.className = 'btijd';
    tijd.textContent = bordTijd(v.sched) || '--:--';
    r.appendChild(tijd);
    r.appendChild(bordLogo(v));

    // Het vluchtnummer is wat de reiziger kent, het callsign is wat op de plot staat. Die twee
    // naast elkaar maken de koppeling zichtbaar: HV6789 is TRA44E. Staat het toestel nu in
    // beeld, dan wint wat de ontvanger hoort boven wat de luchthaven opgaf.
    const vl = document.createElement('span');
    vl.className = 'bvlucht';
    vl.textContent = v.flight || '';
    const roep = (a && (a.cs || '').trim().toUpperCase()) || (v.cs || '').toUpperCase();
    const tweede = roep || (v.reg ? bordReg(v.reg) : '');
    if (tweede) {
      const i = document.createElement('i');
      i.textContent = tweede;
      if (!roep) i.className = 'reg';
      i.title = t(roep ? 'board.cs' : 'board.reg');
      vl.appendChild(i);
    }
    r.appendChild(vl);

    const plek = document.createElement('span');
    plek.className = 'bplek';
    const naam = document.createElement('b');
    naam.textContent = v.plaats || v.other_icao || v.other || '?';
    plek.appendChild(naam);
    if (v.other_icao) {
      const c = document.createElement('i');
      c.textContent = v.other_icao;
      plek.appendChild(c);
    }
    r.appendChild(plek);

    const veld = document.createElement('span');
    veld.className = 'bveld' + (v.hard ? '' : ' zwak');
    // Landen cyaan, opstijgen violet: dezelfde twee kleuren als de landings- en vertreklijn op de
    // radarplot, zodat een regel in het bord en een baan op de kaart hetzelfde zeggen.
    veld.appendChild(mdi(v.dir === 'A' ? MDI.landing : MDI.takeoff,
                         v.dir === 'A' ? 'mdi land' : 'mdi dep'));
    veld.appendChild(document.createTextNode(v.home));
    veld.title = t('board.src', { bron: bronNaam(v.src) });
    r.appendChild(veld);

    const [tekst, klasse] = bordStatus(v);
    if (klasse === 'laat' || klasse === 'weg') r.classList.add('afwijkend');
    const st = document.createElement('span');
    st.className = 'bst ' + klasse;
    st.textContent = tekst;
    r.appendChild(st);
    box.appendChild(r);
  }
  if (lijst.length && !lijnGezet) box.appendChild(bordNuLijn());   // alles ligt in het verleden
  box.scrollTop = scrollWas;
  // Bij het openen begint de lijst bovenaan, bij de vlucht van gisteravond. Je wilt
  // beginnen bij nu: de paarse streep in het midden, met wat er net geweest is erboven
  // en wat eraan komt eronder.
  if (bord.centreer) {
    const lijn = box.querySelector('.bnu');
    if (lijn) {
      bord.centreer = false;                      // pas loslaten als er echt een lijn stond: bij
      box.scrollTop = Math.max(0, lijn.offsetTop - box.clientHeight / 2);   // het openen is de
    }                                             // lijst nog leeg en komt hij een ronde later
  }
  $('boardCount').textContent = t('board.count', { n: lijst.length, tot: bord.vluchten.length });
}

// Klikken op een regel doet hetzelfde als een alarm aanklikken: filters die het toestel
// verbergen gaan opzij, het wordt geselecteerd en gevolgd. Het bord gaat dicht, anders kijk je
// er tegenaan in plaats van naar het toestel.
// De streep die aangeeft waar we nu zijn; hij staat tussen twee vluchtregels en schuift mee.
function bordNuLijn() {
  const d = document.createElement('div');
  d.className = 'bnu';
  const p = new Date();
  const pad = n => String(n).padStart(2, '0');
  d.innerHTML = `<span>${pad(p.getHours())}:${pad(p.getMinutes())}</span>`;
  return d;
}

// Vandaag, morgen en gisteren bij naam; verder weg de datum voluit.
function bordDag(ts) {
  const d = new Date((ts || 0) * 1000);
  const nul = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const verschil = Math.round((nul(d) - nul(new Date())) / 86400000);
  const naam = { '-1': t('board.yesterday'), 0: t('board.today'), 1: t('board.tomorrow') }[verschil];
  const datum = d.toLocaleDateString(getLang() === 'en' ? 'en-GB' : 'nl-NL',
    { weekday: 'long', day: 'numeric', month: 'long' });
  return naam ? `${naam} \u00b7 ${datum}` : datum;
}

function bordSpring(a) {
  setBoard(false);
  alarmToon(a.hex);
}

function bordVelden() {
  const box = $('boardFields');
  const velden = [...new Set(bord.vluchten.map(v => v.home))].sort();
  const huidig = [...box.querySelectorAll('button')].map(b => b.dataset.v).join(',');
  if (huidig === ['', ...velden].join(',')) {         // niets veranderd: knoppen laten staan
    for (const b of box.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String((b.dataset.v || '') === bord.veld));
    }
    return;
  }
  box.innerHTML = '';
  for (const v of ['', ...velden]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.v = v;
    b.textContent = v || t('board.all');
    b.setAttribute('aria-pressed', String(v === bord.veld));
    b.addEventListener('click', () => { bord.veld = v; bord.centreer = true; bordVelden(); bordTeken(); });
    box.appendChild(b);
  }
}

function bordBronnen() {
  const el = $('boardSrc');
  const delen = [];
  for (const [naam, st] of Object.entries(bord.bron || {})) {
    const [veld, soort] = naam.split('/');
    // twee teletekstbronnen heten allebei TT; het veld erbij maakt duidelijk welke hapert
    const kort = soort === 'teletekst' ? `TT ${veld}` : soort.toUpperCase();
    if (soort === 'ciss' && st === 'leeg') continue;        // nog aan het vullen, geen melding
    const oud = bord.ouderdom[naam];
    const min = oud == null ? null : Math.round(oud / 60);
    const fout = String(st).startsWith('fout') || (min != null && min > 30);
    delen.push(`<span class="${fout ? 'bron-oud' : ''}">${kort} ${st === 'stand-by' ? 'stand-by'
      : (min == null ? '?' : min + 'm')}</span>`);
  }
  // De losse Schiphol-regel stamt van voor CISS een eigen bordbron werd; nu die in de lijst
  // staat zou hij er twee keer in komen.
  const alCiss = Object.keys(bord.bron || {}).some(n => n.endsWith('/ciss'));
  if (!alCiss && bord.schiphol && bord.schiphol.status !== 'uit') {
    const m = bord.schiphol.ouderdom == null ? '?' : Math.round(bord.schiphol.ouderdom / 60) + 'm';
    delen.push(`<span class="${bord.schiphol.status !== 'ok' ? 'bron-oud' : ''}">CISS ${m}</span>`);
  }
  el.innerHTML = delen.length ? t('board.sources') + ' ' + delen.join(' · ') : '';
}

async function pollBoard() {
  try {
    const d = await getJSON('api/board');
    bord.vluchten = d.vluchten || [];
    bord.bron = d.bron || {};
    bord.ouderdom = d.ouderdom || {};
    bord.schiphol = d.schiphol || null;
    bord.nu = d.nu || 0;
    if (bord.open) { bordVelden(); bordBronnen(); bordTeken(); }
  } catch { /* volgende ronde */ }
  finally { setTimeout(pollBoard, bord.open ? 60000 : 300000); }
}

function bordKlok() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  $('boardClock').textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function setBoard(open) {
  bord.open = open;
  if (open) bord.centreer = true;
  $('board').hidden = !open;
  $('boardBtn').setAttribute('aria-expanded', String(open));
  if (open) {
    bordVelden(); bordBronnen(); bordTeken(); bordKlok();
    if (!bord.vluchten.length) pollBoard();
  }
}
$('boardBtn').addEventListener('click', () => setBoard($('board').hidden));
$('boardClose').addEventListener('click', () => setBoard(false));
setInterval(() => { if (bord.open) bordKlok(); }, 1000);
setInterval(() => { if (bord.open) bordTeken(); }, 30000);   // status en oplichten bijwerken
for (const [id, sleutel, veld] of [['boardRange', 'u', 'uren'], ['boardDir', 'd', 'dir']]) {
  $(id).addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    bord[veld] = veld === 'uren' ? Number(b.dataset[sleutel]) : (b.dataset[sleutel] || '');
    for (const x of $(id).querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
    bord.centreer = true;                          // een ander bereik: weer bij nu beginnen
    bordTeken();
  });
}

const airframes = new Map();
function loadAirframe(a) {
  if (!airframesOn || !a || airframes.has(a.hex)) return;
  airframes.set(a.hex, null);
  getJSON(`api/airframe?hex=${encodeURIComponent(a.hex)}`)
    .then(f => { airframes.set(a.hex, f && f.built ? f : {}); if (selected === a) updateCard(); })
    .catch(() => {});
}

function updateFlightFacts(a) {
  const box = $('cFlight'), r = routeOf(a);
  if (!r || r.oLat == null || r.dLat == null || a.lat == null) { box.hidden = true; return; }
  const total = gcKm(r.oLat, r.oLon, r.dLat, r.dLon);
  const left = gcKm(a.lat, a.lon, r.dLat, r.dLon);
  const done = Math.max(0, total - left);
  const pct = total > 1 ? Math.round(done / total * 100) : 0;
  $('cPct').textContent = `${pct}%`;
  const bar = $('cProg');
  if (bar.children.length !== 20) {
    bar.innerHTML = '';
    for (let i = 0; i < 20; i++) bar.appendChild(document.createElement('span'));
  }
  [...bar.children].forEach((s, i) => s.classList.toggle('on', i < Math.round(pct / 5)));
  $('cDone').textContent = `${Math.round(done)} km`;
  $('cDoneM').textContent = t('card.pct', { pct, total: Math.round(total) });
  $('cLeft').textContent = `${Math.round(left)} km`;
  $('cLeftM').textContent = `${Math.round(left / KM_PER_NM)} NM`;
  const kmh = a.gs * KM_PER_NM;
  if (kmh > 60 && left > 2) {
    const mins = Math.round(left / kmh * 60);
    $('cEta').textContent = hhmm(new Date(Date.now() + mins * 60000));
    const span = mins < 60 ? `${mins} ${t('val.min')}` : `${Math.floor(mins / 60)} ${t('val.hour')} ${mins % 60} ${t('val.min')}`;
    $('cEtaM').textContent = t('card.eta.in', { t: span });
  } else {
    $('cEta').textContent = left <= 2 ? t('card.eta.there') : '–';
    $('cEtaM').textContent = '';
  }
  box.hidden = false;
}

function updateCard() {
  const a = selected; if (!a) return;
  loadTypes();
  loadAirframe(a);
  loadSchiphol(a);
  $('cCallsign').textContent = a.cs || a.reg || a.hex.toUpperCase();
  $('cSub').textContent = [a.reg && a.reg !== a.cs ? a.reg : '', typeLabel(a)].filter(Boolean).join(', ');
  const alt = a.ground ? t('card.onground') : (a.altb ?? a.altg) < 3000 ? `${Math.max(0, Math.round(a.altg / 10) * 10)} ft` : fmtAlt(a);
  $('cAlt').textContent = alt;
  const ftShown = a.ground ? 0
    : ((a.altb ?? a.altg) >= 3000 ? (a.altb ?? a.altg) : Math.max(0, a.altg));
  $('cAltM').textContent = a.ground ? '' : `${Math.round(ftShown * 0.3048 / 10) * 10} m`;
  $('cGs').textContent = `${Math.round(a.gs)} kt`;
  $('cGsM').textContent = `${Math.round(a.gs * KM_PER_NM)} ${t('unit.kmh')}`;
  $('cVr').textContent = a.ground ? '–' : `${a.vr > 0 ? '+' : ''}${Math.round(a.vr / 10) * 10}`;
  $('cVrM').textContent = a.ground ? '' : `ft/min, ${(a.vr * 0.3048 / 60).toFixed(1)} m/s`;
  $('cTrk').textContent = a.track == null ? '–' : `${String(Math.round(a.track) % 360).padStart(3, '0')}°`;
  $('cTrkM').textContent = a.track == null ? '' : compass(a.track);
  $('cSq').textContent = a.sq || '–';
  const af = airframes.get(a.hex);
  $('cSqM').textContent = af && af.serial ? t('card.cn', { serial: af.serial }) : '';
  $('cHex').textContent = a.hex.toUpperCase();
  $('cHexM').textContent = af && af.built ? buildAge(af.built) : '';
  updateFlightFacts(a);
  updateSchiphol(a);
  updateAirspace(a);
  updateFreqs(a);
  const em = ['general', 'nordo', 'unlawful', 'minfuel', 'downed', 'lifeguard'].includes(a.emerg) ? t(`emerg.${a.emerg}`) : '';
  $('cEmerg').hidden = !em; $('cEmerg').textContent = em || '';
  const r = routeOf(a), el = $('cRoute');
  if (r) {
    if (r.weak) requestRoute(a, true);
    el.className = r.weak && !r.fixed ? 'route weak' : 'route';
    el.innerHTML = '';
    const codes = document.createElement('span');
    codes.className = 'codes';
    codes.textContent = `${r.oIcao || '?'} → ${r.dIcao || '?'}${r.weak ? ' ?' : ''}`;
    if (r.fixed) {
      const v = document.createElement('span');
      v.className = 'verified';
      v.textContent = `\u2713 ${bronNaam(r.bron)}`;
      v.title = t('card.verified', { bron: bronNaam(r.bron) });
      codes.appendChild(v);
    }
    const places = document.createElement('span');
    places.className = 'places';
    const side = (place, cc) => [place, cc].filter(Boolean).join(' ');
    places.textContent = [side(r.oPlace, r.oCc), side(r.dPlace, r.dCc)].filter(Boolean).join(' → ')
      + (r.weak ? ` — ${t('card.route.weak')}` : '');
    el.append(codes, places);
  } else {
    el.className = 'route unknown';
    el.textContent = a.cs ? t(routesOn ? 'card.route.searching' : 'card.route.unknown') : t('card.route.nocs');
  }
  $('cLink').href = `https://globe.adsb.lol/?icao=${encodeURIComponent(a.hex)}`;
  showPhoto(a);
}
setInterval(updateCard, 1000);
$('cClose').addEventListener('click', () => select(null));
$('cFollow').addEventListener('click', () => {
  follow = !follow; fly = null;
  $('cFollow').setAttribute('aria-pressed', String(follow));
  saveState();
});
addEventListener('keydown', e => { if (e.key === 'Escape') select(null); });

// ------------------------------------------------------------ panel controls
const panel = $('panel');
// De rechterkolom staat vast en toont of de weergave-instellingen of de vluchtinformatie.
// De knop in de kopbalk zegt waar je heen gaat, dus op de instellingen staat er "Vlucht info".
// Is er geen toestel gekozen, dan valt er niets te tonen en blijft hij op de instellingen staan.
// De rechterkolom heeft drie standen die elkaar uitsluiten: de instellingen, de toestelkaart en
// het luisterpaneel. Het luisterpaneel stond er eerst onder, maar dan houden twee panelen samen
// één kolom bezet en blijft er van allebei weinig over. Sluit je het, dan kom je terug bij de
// instellingen.
const KOLOM = ['inst', 'vlucht', 'radio', 'weer'];
let kolom = 'inst';

function setKolom(stand, save = true) {
  kolom = KOLOM.includes(stand) ? stand : 'inst';
  if (kolom === 'vlucht' && !selected) kolom = 'inst';
  panel.classList.toggle('open', kolom === 'inst');
  card.hidden = kolom !== 'vlucht';
  radioEl.hidden = kolom !== 'radio';
  radioEl.classList.toggle('open', kolom === 'radio');   // zelfde kolomregels als de andere twee
  weerEl.hidden = kolom !== 'weer';
  weerEl.classList.toggle('open', kolom === 'weer');
  document.body.classList.toggle('radio-open', kolom === 'radio' || kolom === 'weer');
  $('radioToggle')?.setAttribute('aria-expanded', String(kolom === 'radio'));
  $('weerToggle').setAttribute('aria-expanded', String(kolom === 'weer'));
  if (kolom !== 'radio') {                      // volgende keer weer met de kanalenrij beginnen
    $('radioPick').hidden = true;
    $('radioChansGrp').hidden = false;
    $('radioPickBtn').setAttribute('aria-expanded', 'false');
  }
  // De knop in de balk wisselt tussen de instellingen en de toestelkaart; vanuit het
  // luisterpaneel brengt hij je terug naar de instellingen.
  const heen = kolom === 'inst' ? 'vlucht' : 'inst';
  const knop = $('panelToggle');
  knop.textContent = t(heen === 'vlucht' ? 'bar.toflight' : 'bar.todisplay');
  knop.setAttribute('aria-controls', heen === 'vlucht' ? 'card' : 'panel');
  knop.disabled = heen === 'vlucht' && !selected;
  knop.dataset.stand = kolom;
  layoutPanel();
  if (save) saveState();
}
function setPanel(open, save = true) { setKolom(open ? 'inst' : 'vlucht', save); }

$('panelToggle').addEventListener('click', () => setKolom(kolom === 'inst' ? 'vlucht' : 'inst'));
addEventListener('keydown', e => {
  if (e.key === 'Escape' && kolom === 'vlucht' && !(e.target instanceof HTMLInputElement)) setKolom('inst');
});
$('infoBtn').addEventListener('click', () => {
  const t = $('infoText'); t.hidden = !t.hidden;
  $('infoBtn').setAttribute('aria-expanded', String(!t.hidden));
});
document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener('change', () => { opts.mode = r.value; buildTrails(); saveState(); }));
$('trail').addEventListener('input', e => { opts.trailMin = +e.target.value; shared.uTrail.value = opts.trailMin * 60; $('trailOut').textContent = `${opts.trailMin} ${t('val.min')}`; trailsDirty = true; saveState(); });
$('exag').addEventListener('input', e => { opts.exag = +e.target.value; shared.uExag.value = opts.exag; $('exagOut').textContent = `${opts.exag}×`; saveState(); });
$('delay').addEventListener('input', e => {
  opts.delay = +e.target.value; $('delayOut').textContent = `${opts.delay} s`; saveState();
});
$('floor').addEventListener('input', e => {
  const v = +e.target.value;
  opts.floor = v * 100;
  $('floorOut').textContent = v === 0 ? t('val.ground') : `FL${String(v).padStart(3, '0')}`;
  if (opts.ceiling !== Infinity && opts.ceiling < opts.floor) {
    opts.ceiling = opts.floor; optsToUI();
  }
  buildTrails(); saveState();
});
$('ceil').addEventListener('input', e => {
  const v = +e.target.value; opts.ceiling = v >= 450 ? Infinity : v * 100;
  $('ceilOut').textContent = v >= 450 ? t('val.all') : `FL${String(v).padStart(3, '0')}`; buildTrails(); saveState();
});
$('optLabels').addEventListener('change', e => { opts.labels = e.target.checked; saveState(); });
// Werkplekken in de bovenbalk. Een veldknop centreert op dat veld en legt de nadruk op zijn
// luchtruim; een sectorknop doet daarnaast de hoogteband, het bereik en de nadruk op de lagen die
// bij die sector horen. Zo kies je waar je naar kijkt in plaats van alleen waarheen je vliegt.
const SECTOREN = {
  ams: { vloer: 0, plafond: FL_UAC, nm: 120, lagen: ['cta', 'tma'], thuis: true, kind: 'civ' },
  uac: { vloer: FL_UAC, plafond: Infinity, nm: 250, lagen: ['cta'], thuis: false, kind: 'civ' },
  mil: { vloer: 0, plafond: 19500, nm: 150, lagen: ['mil', 'heli'], thuis: true, kind: 'mil' },
};

// Een knop in de bovenbalk zet ook het luchtruimfilter, want anders zie je bij MIL de oefen-
// gebieden tussen alle CTA's door en bij AMS RADAR de oefengebieden die er niet bij horen.
// CIV of MIL hoort bij de werkplek; OVERZICHT zet hem terug op ALLE.
function setAspKind(kind) {
  if (radarOpts.aspKind === kind) return;
  radarOpts.aspKind = kind;
  for (const r of document.querySelectorAll('input[name="raspkind"]')) r.checked = r.value === kind;
  if (radarView) radarView.redraw();
}

function setSector(naam, save = true) {
  const s = SECTOREN[naam];
  if (s) { opts.floor = s.vloer; opts.ceiling = s.plafond; }
  else { opts.floor = 0; opts.ceiling = Infinity; }
  opts.sector = s ? naam : 'all';
  aspFocus = '';
  if (radarView) radarView.setFocus('', s ? s.lagen : []);
  optsToUI(); buildTrails(); trailsDirty = true;
  if (save) saveState();
}

// De hele werkplek: hoogteband, nadruk, bereik en camerastand in één klik. Het bereik komt uit
// de gebieden die nadruk krijgen, zodat precies die in beeld passen; levert dat niets op (nog
// geen luchtruim binnen, of niets in deze hoogteband) dan valt hij terug op het vaste getal.
function gaNaarSector(naam) {
  const s = SECTOREN[naam];
  if (!s) return;
  setSector(naam, false);
  setAspKind(s.kind);
  setApFilter([]);                    // een sector gaat niet over één luchthaven
  let x = s.thuis && homeAirport ? homeAirport.x : 0;
  let z = s.thuis && homeAirport ? homeAirport.z : 0;
  let nm = s.nm;
  // Het vaste getal per sector is tegelijk het plafond. Zonder dat plafond rekt de fit door tot de
  // rand van wat er aan luchtruim geladen is — militaire gebieden liggen tot 150 NM uit elkaar, en
  // dan kijk je naar half Europa in plaats van naar de sector. Passen mag alleen naar binnen.
  const fit = radarView ? radarView.fitFocus({ lagen: s.lagen, min: 30, max: s.nm }) : null;
  if (fit) { x = fit.x; z = fit.z; nm = fit.nm; }
  else if (radarView) { radarView.centerOn(x, z); radarOpts.range = s.nm; }
  updateRangeOut();
  vliegNaarGebied(x, z, nm);
  saveState();
}

// Een veldknop geeft altijd hetzelfde zicht, welk veld je ook kiest: 40 NM straal. Dat is een
// keuze voor herkenbaarheid boven passendheid — je weet na één klik hoe ver je kijkt, en twee
// velden naast elkaar zijn op het oog te vergelijken. Het luchtruim bepaalt alleen nog de nadruk.
const VELD_NM = 40;

// 3D: de camera zo ver terug dat je er ongeveer evenveel ziet als in de radarplot op datzelfde
// bereik. De radarstraal loopt langs de kortste schermas; de camera staat gekanteld, dus een echte
// gelijkheid bestaat niet — de horizon rekt het beeld naar achteren hoe dan ook uit. 1,6 km camera-
// afstand per kilometer radarstraal is de verhouding die de Overzicht-knop al gebruikte, en die
// houdt het gebied rond het middelpunt op dezelfde schaal.
const CAM_PER_KM = 1.6;

function vliegNaarGebied(x, z, nm) {
  const dist = THREE.MathUtils.clamp(nm * 1.852 * CAM_PER_KM, controls.minDistance, controls.maxDistance);
  flyTo(x, z, dist);
}

// Welke sector past bij de huidige hoogteband? Verzet je die met de hand, dan hoort er geen
// werkplek meer aan te staan.
function sectorVanBand() {
  for (const [naam, s] of Object.entries(SECTOREN)) {
    if (opts.floor === s.vloer && opts.ceiling === s.plafond) return naam;
  }
  return !opts.floor && opts.ceiling === Infinity ? 'all' : '';
}
function syncSector() {
  const sec = sectorVanBand();
  for (const b of document.querySelectorAll('#airports button[data-sector]')) {
    if (b.dataset.sector === sec) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
  }
}
$('optAlarm').addEventListener('change', e => {
  alarm.aan = e.target.checked;
  opts.alarm = alarm.aan;
  if (!alarm.aan) { alarm.open.clear(); $('alarmList').dataset.k = ''; alarmRender(); }
  else alarmScan();
  saveState();
});
// De knoppenrij voor de soorten wordt in JS gebouwd, zodat de lijst op één plek staat: SOORTEN.
function buildSoortKeys() {
  const box = $('soortKeys');
  box.textContent = '';
  for (const s of SOORTEN) {
    const lab = document.createElement('label');
    lab.className = 'key';
    lab.title = t(`s.${s}.t`);
    lab.dataset.i18nTitle = `s.${s}.t`;
    const inp = document.createElement('input');
    inp.type = 'checkbox'; inp.id = `soort_${s}`; inp.checked = opts.soort[s] !== false;
    inp.addEventListener('change', () => {
      opts.soort[s] = inp.checked;
      buildTrails(); trailsDirty = true;
      if (selected && !visible(selected)) select(null);   // net weggefilterd: kaart sluiten
      if (radarView) radarView.redraw();
      saveState();
    });
    const face = document.createElement('span');
    face.className = 'face';
    const lamp = document.createElement('i'); lamp.className = 'lamp';
    const b = document.createElement('b'); b.dataset.i18n = `s.${s}`; b.textContent = t(`s.${s}`);
    face.append(lamp, b);
    lab.append(inp, face);
    box.appendChild(lab);
  }
}
// De 3D-weergave kleurt standaard op hoogte — daar is die weergave voor, en er staat een schaal
// onder. In stand SOORT nemen de toestellen de acht kleuren van de radarplot over, zodat je kunt
// omschakelen zodra je iets zoekt in plaats van iets afleest.
function buildSoortLegend() {
  const ul = $('legendSoort');
  ul.textContent = '';
  for (const s of SOORTEN) {
    const li = document.createElement('li');
    const i = document.createElement('i');
    i.style.background = soortHex(s, radarOpts.theme);
    const b = document.createElement('span');
    b.dataset.i18n = `s.${s}`; b.textContent = t(`s.${s}`);
    li.append(i, b);
    ul.appendChild(li);
  }
}
function colorByToUI() {
  const soort = opts.colorBy === 'soort';
  // Allebei de legenda's zijn only3d: in de radarplot blijven ze weg, ongeacht de keuze.
  const in3d = !document.body.classList.contains('radar');
  $('legendAlt').hidden = !in3d || soort;
  $('legendSoort').hidden = !in3d || !soort;
  if (soort) buildSoortLegend();
  for (const r of document.querySelectorAll('input[name="colorby"]')) r.checked = r.value === (soort ? 'soort' : 'alt');
}
for (const r of document.querySelectorAll('input[name="colorby"]')) {
  r.addEventListener('change', e => {
    if (!e.target.checked) return;
    opts.colorBy = e.target.value;
    colorByToUI();
    saveState();
  });
}
$('sttInfo').addEventListener('click', e => {
  const open = $('sttNote').hidden;
  $('sttNote').hidden = !open;
  e.currentTarget.setAttribute('aria-expanded', String(open));
});
$('soortInfo').addEventListener('click', e => {
  const open = $('soortNote').hidden;
  $('soortNote').hidden = !open;
  e.currentTarget.setAttribute('aria-expanded', String(open));
});
$('lokInfo').addEventListener('click', e => {
  const open = $('lokNote').hidden;
  $('lokNote').hidden = !open;
  e.currentTarget.setAttribute('aria-expanded', String(open));
});
$('optLokaal').addEventListener('click', e => {
  opts.lokaal = !opts.lokaal;
  e.currentTarget.setAttribute('aria-pressed', String(opts.lokaal));
  buildTrails(); trailsDirty = true;
  if (selected && !visible(selected)) select(null);
  updateFilterNote();
  saveState();
});
$('optDrops').addEventListener('change', e => { opts.drops = e.target.checked; saveState(); });
$('optRwyId').addEventListener('change', e => { opts.rwyid = e.target.checked; saveState(); });
$('optGround').addEventListener('change', e => { opts.ground = e.target.checked; buildTrails(); saveState(); });
$('optHome').addEventListener('change', e => {
  opts.home = e.target.checked;
  radarOpts.home = opts.home;
  if (homeMarker) homeMarker.visible = opts.home;
  saveState();
});

let airportChips = null;
function rebuildAirportChips() {
  if (!airportChips) return;
  const nav = $('airports');
  nav.innerHTML = '';
  airportChips();
}

function buildFilterChips(chips) {
  const box = $('apChips');
  $('apFilterBox').hidden = false;
  box.innerHTML = '';
  const all = document.createElement('button');
  all.type = 'button';
  all.textContent = t('opt.filter.all');
  all.setAttribute('aria-pressed', 'true');
  box.appendChild(all);
  const buttons = [];
  for (const ap of chips) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = ap.icao;
    b.title = ap.name;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      if (apFilter.has(ap.icao)) apFilter.delete(ap.icao); else apFilter.add(ap.icao);
      syncApVelden();
      b.setAttribute('aria-pressed', String(apFilter.has(ap.icao)));
      all.setAttribute('aria-pressed', String(apFilter.size === 0));
      buildTrails();
      updateFilterNote();
      saveState();
    });
    buttons.push(b);
    box.appendChild(b);
  }
  all.addEventListener('click', () => {
    apFilter.clear();
    syncApVelden();
    buttons.forEach(b => b.setAttribute('aria-pressed', 'false'));
    all.setAttribute('aria-pressed', 'true');
    buildTrails();
    updateFilterNote();
    saveState();
  });
  updateFilterNote();
}

// De vinkjes van het filter van/naar gelijkzetten met wat er werkelijk in apFilter staat.
function syncFilterChips() {
  const alles = t('opt.filter.all');
  for (const b of document.querySelectorAll('#apChips button')) {
    b.setAttribute('aria-pressed',
      String(b.textContent === alles ? apFilter.size === 0 : apFilter.has(b.textContent)));
  }
}

// Het filter van/naar zetten vanuit de bovenbalk. Een veldknop kiest dat veld, een sectorknop en
// OVERZICHT zetten het filter weer open: een sector gaat over een stuk luchtruim, niet over één
// luchthaven. Zonder routegegevens bestaat het filter niet, dan doet dit niets.
function setApFilter(icaos) {
  if (!routesOn) return;
  const wil = new Set(icaos || []);
  if (wil.size === apFilter.size && [...wil].every(x => apFilter.has(x))) return;
  apFilter.clear();
  for (const x of wil) apFilter.add(x);
  syncApVelden();
  syncFilterChips();
  buildTrails(); trailsDirty = true;
  if (selected && !visible(selected)) select(null);
  updateFilterNote();
}

function updateFilterNote() {
  const note = $('apNote');
  if (!apFilter.size) {
    const known = [...aircraft.values()].filter(a => routeOf(a)).length;
    note.textContent = t('filter.known', { known, total: aircraft.size });
    return;
  }
  // Wat er in beeld staat, en hoeveel daarvan er niet op een route maar op het veld zelf
  // binnenkomt: lokaal verkeer zonder routegegevens.
  const alle = [...aircraft.values()];
  const zicht = mode === 'radar'
    ? alle.filter(a => visible(a) && a.pt !== undefined)
    : visList;
  const lok = zicht.filter(a => {
    const r = routeOf(a);
    return !(r && (apFilter.has(r.oIcao) || apFilter.has(r.dIcao)));
  }).length;
  let tekst = t('filter.active', { vis: zicht.length, lok, hidden: alle.length - zicht.length });
  if (!veldBron.aan) tekst += ` ${t('filter.nofields')}`;
  else if (veldBron.aan && veldBron.hex) {
    const gekozen = [...apFilter];
    let n = 0;
    for (const set of geleerdVeld.values()) { for (const icao of gekozen) if (set.has(icao)) { n++; break; } }
    tekst += ` ${t('filter.learned', { n, dagen: veldBron.dagen, wanneer: veldDatum() })}`;
  }
  note.textContent = tekst;
}

// Wanneer de thuisveldtabel voor het laatst is bijgewerkt, kort genoteerd.
function veldDatum() {
  if (!veldBron.updated) return t('filter.never');
  const d = new Date(veldBron.updated * 1000);
  const uur = Date.now() / 1000 - veldBron.updated;
  if (uur < 86400) return d.toLocaleTimeString(getLang() === 'en' ? 'en-GB' : 'nl-NL',
    { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString(getLang() === 'en' ? 'en-GB' : 'nl-NL', { day: 'numeric', month: 'short' });
}
setInterval(() => { if (!$('apFilterBox').hidden) updateFilterNote(); }, 2000);

// ------------------------------------------------------------ status line
function updateStatus() {
  const total = aircraft.size;
  const vis = mode === 'radar' ? [...aircraft.values()].filter(a => visible(a) && a.pt !== undefined).length : visList.length;
  $('statusCount').textContent = total ? `${vis}/${total}` : '--';
  $('stripSrc').textContent = (source || primary || '--').toUpperCase();
  $('stripDelay').textContent = `${opts.delay} S`;
  $('stripSch').textContent = schStatus;
  $('stripSch').classList.toggle('bad', schStatus !== 'OK' && schStatus !== t('strip.sch.off'));
  const age = lastOk ? Math.round((Date.now() - lastOk) / 1000) : null;
  const stale = age == null ? serverStatus === 'error' : age > STALE_S;
  let warn = '';
  if (serverStatus === 'offline') warn = t('status.offline');
  else if (stale && age != null) warn = t('status.stale', { age });
  else if (stale) warn = t('status.stalenoage');
  $('statusAge').textContent = warn;
  $('statusAge').hidden = !warn;
}
setInterval(updateStatus, 1000);

// ------------------------------------------------------------ routes
const routes = new Map();          // callsign -> {oIcao,oIata,oPlace,oLat,oLon,dIcao,...}
const apFilter = new Set();        // ICAO-codes waarop gefilterd wordt
let routesOn = false, airframesOn = false, schipholOn = false;
const pendingRoutes = new Set();
const refreshed = new Set();

const routeChoice = new Map();          // callsign -> gekozen richting, met score

function bearingTo(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Hoe goed past deze route bij waar het toestel is en waar het heen vliegt?
// Lager is beter: 1.0 betekent precies op de lijn en recht op de bestemming af.
function scoreLeg(a, leg) {
  if (!leg || leg.oLat == null || leg.dLat == null || a.lat == null) return 99;
  const total = gcKm(leg.oLat, leg.oLon, leg.dLat, leg.dLon);
  const toDest = gcKm(a.lat, a.lon, leg.dLat, leg.dLon);
  const fromOrig = gcKm(leg.oLat, leg.oLon, a.lat, a.lon);
  const detour = total > 20 ? (fromOrig + toDest) / total : 1;
  let heading = 0;
  if (a.track != null && toDest > 15) {
    const diff = Math.abs(((bearingTo(a.lat, a.lon, leg.dLat, leg.dLon) - a.track + 540) % 360) - 180);
    heading = diff / 60;                              // 60° eraf telt als 1 punt
  }
  return detour + heading;
}

// Kies uit beide bronnen en beide richtingen wat het beste bij de vlucht past.
function routeOf(a) {
  if (!a || !a.cs) return null;
  const base = routes.get(a.cs);
  if (!base) return null;
  const cached = routeChoice.get(a.cs);
  if (cached && cached.t > nowRel() - 20 && cached.hex === a.hex) return cached.leg;
  // door Schiphol bevestigd; maar vliegt het toestel duidelijk de andere kant op, dan hoort de
  // Schiphol-vlucht bij een andere etappe van hetzelfde toestel en kiezen we zelf
  if (base.fixed && !(scoreLeg(a, flipLeg(base)) < scoreLeg(a, base) - 1)) return base;
  const cands = [base, flipLeg(base)];
  if (base.alt) cands.push(base.alt, flipLeg(base.alt));
  let best = cands[0], bestScore = scoreLeg(a, cands[0]);
  for (const c of cands.slice(1)) {
    const s = scoreLeg(a, c);
    if (s < bestScore - 0.15) { best = c; bestScore = s; }   // alleen wisselen bij duidelijk beter
  }
  const leg = { ...best, airline: base.airline, weak: bestScore > 2.6, score: bestScore };
  routeChoice.set(a.cs, { leg, t: nowRel(), hex: a.hex });
  return leg;
}

function legFrom(v, i) {
  const r = {
    oIcao: v[i], oIata: v[i + 1], oPlace: v[i + 2], oLat: v[i + 3], oLon: v[i + 4], oCc: v[i + 5],
    dIcao: v[i + 6], dIata: v[i + 7], dPlace: v[i + 8], dLat: v[i + 9], dLon: v[i + 10], dCc: v[i + 11],
  };
  if (r.oLat != null) [r.ox, r.oz] = toXZ(r.oLat, r.oLon);
  if (r.dLat != null) [r.dx, r.dz] = toXZ(r.dLat, r.dLon);
  return r;
}

function flipLeg(r) {
  const f = {
    oIcao: r.dIcao, oIata: r.dIata, oPlace: r.dPlace, oLat: r.dLat, oLon: r.dLon, oCc: r.dCc,
    dIcao: r.oIcao, dIata: r.oIata, dPlace: r.oPlace, dLat: r.oLat, dLon: r.oLon, dCc: r.oCc,
    flipped: true,
  };
  if (f.oLat != null) [f.ox, f.oz] = toXZ(f.oLat, f.oLon);
  if (f.dLat != null) [f.dx, f.dz] = toXZ(f.dLat, f.dLon);
  return f;
}

function applyRoutes(obj) {
  for (const [cs, v] of Object.entries(obj.routes || {})) {
    const cur = routes.get(cs);
    if (cur && cur.fixed) continue;                  // een Schiphol-route niet overschrijven
    const r = legFrom(v, 0);
    r.airline = v[12];
    if (v.length > 13) r.alt = legFrom(v, 13);      // kandidaat van de tweede bron
    routes.set(cs, r);
    routeChoice.delete(cs);
  }
  applySchiphol(obj.sch);
  if (obj.schStatus !== undefined) {
    schStatus = obj.schStatus === 'ok' ? 'OK' : obj.schStatus === 'uit' ? t('strip.sch.off') : obj.schStatus.toUpperCase();
  }
  if (apFilter.size) trailsDirty = true;
  updateCard();
  updateRouteLine();
}

// De thuisveldtabel verandert één keer per nacht; elk uur ophalen is ruim genoeg.
async function pollFields() {
  try {
    const d = await getJSON('api/fields');
    veldBron.aan = !!d.enabled;
    veldBron.updated = d.updated || 0;
    veldBron.dagen = d.days || 0;
    geleerdVeld.clear();
    for (const [icao, lijst] of Object.entries(d.fields || {})) {
      for (const hex of lijst) {
        let set = geleerdVeld.get(hex);
        if (!set) geleerdVeld.set(hex, set = new Set());
        set.add(icao);
      }
    }
    veldBron.hex = geleerdVeld.size;
    if (apFilter.size) { buildTrails(); trailsDirty = true; updateFilterNote(); }
  } catch { /* volgende ronde */ }
  finally { setTimeout(pollFields, 3600000); }
}

async function pollRoutes() {
  // routes en Schiphol-gegevens voor alles in beeld, in één verzoek
  try { applyRoutes(await getJSON(`api/routes?bbox=${viewBox(60)}`)); } catch { /* volgende ronde */ }
  finally { setTimeout(pollRoutes, 8000); }
}

// Hoe de bronnen in beeld heten. ciss is de vluchtinformatie van Schiphol zelf.
const BRON_NAAM = { ciss: 'Schiphol', rtha: 'Rotterdam', ein: 'Eindhoven', teletekst: 'Teletekst' };
function bronNaam(src) { return BRON_NAAM[src] || 'Schiphol'; }

function applySchiphol(sch) {
  for (const [hex, f] of Object.entries(sch || {})) {
    schInfo.set(hex, f);
    const a = aircraft.get(hex);
    if (f.route && a && a.cs) {
      // Een harde bron - Schiphol, Rotterdam op kenteken, Eindhoven op callsign - weet de route
      // zeker en die wint van hexdb en adsbdb. Teletekst koppelt op een vluchtnummer dat we zelf
      // naar een callsign vertaald hebben; dat is een aanname, dus die vult alleen aan waar nog
      // niets stond en laat de koerscontrole gewoon zijn werk doen.
      const hard = f.hard !== false;
      if (hard || !routes.has(a.cs)) {
        const leg = legFrom(f.route, 0);
        leg.airline = (routes.get(a.cs) || {}).airline;
        leg.fixed = hard;
        leg.bron = f.src || 'ciss';
        routes.set(a.cs, leg);
        routeChoice.delete(a.cs);
      }
    }
  }
}

// lijn van herkomst via het toestel naar de bestemming
const MAXLEG = 1800;               // km; verder weg wordt de lijn ingekort
const routeGeo = new THREE.BufferGeometry();
routeGeo.setAttribute('position', dynAttr(4, 3));
routeGeo.setAttribute('color', dynAttr(4, 3));
const routeLine = new THREE.LineSegments(routeGeo,
  new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false }));
routeLine.frustumCulled = false;
routeLine.visible = false;
routeLine.renderOrder = 2;
scene.add(routeLine);

function clampLeg(fromX, fromZ, toX, toZ) {
  const dx = toX - fromX, dz = toZ - fromZ, L = Math.hypot(dx, dz);
  if (L <= MAXLEG) return [toX, toZ];
  return [fromX + dx / L * MAXLEG, fromZ + dz / L * MAXLEG];
}

function updateRouteLine() {
  routeLine.visible = false;               // bewust uit: geen lijn naar herkomst en bestemming
  return;
  const a = selected, r = routeOf(a);
  if (!a || !r || a.dx === undefined) { routeLine.visible = false; return; }
  const p = routeGeo.attributes.position.array, c = routeGeo.attributes.color.array;
  const y = a.dy * opts.exag;
  const from = r.ox !== undefined ? clampLeg(a.dx, a.dz, r.ox, r.oz) : null;
  const to = r.dx !== undefined ? clampLeg(a.dx, a.dz, r.dx, r.dz) : null;
  let n = 0;
  const dim = [0.45, 0.28, 0.42], hot = [0.89, 0.25, 0.63];
  if (from) { p.set([from[0], 0, from[1], a.dx, y, a.dz], n * 6); c.set([...dim, ...hot], n * 6); n++; }
  if (to) { p.set([a.dx, y, a.dz, to[0], 0, to[1]], n * 6); c.set([...hot, ...dim], n * 6); n++; }
  routeGeo.attributes.position.needsUpdate = routeGeo.attributes.color.needsUpdate = true;
  routeGeo.setDrawRange(0, n * 2);
  routeLine.visible = n > 0;
}

// ------------------------------------------------------------ meeluisteren (OpenWebRX)
const radio = { url: '', host: '', relay: 'auto', channels: [], active: null, timer: 0,
                // Meeluisteren uit (schakelaar in de add-on, of openwebrx.enabled in config.json).
                // Lang niet iedereen heeft een SDR met OpenWebRX; voor hen hoort er nergens een
                // knop, een frequentie of een speler te staan die naar iets wijst wat er niet is.
                uit: false,
                pick: new Set(), scanSet: new Set(), alleenGekozen: false };
// Scannen: de aangevinkte kanalen worden één voor één afgestemd met de eigen speler (die
// levert het signaalniveau, het OpenWebRX-venster niet). Is het niveau boven de squelch, dan
// blijft hij hangen tot het weer stil is; anders door naar het volgende.
const scan = { on: false, i: -1, lijst: [], timer: 0, hangt: false, sinds: 0, stil: 0 };
const SCAN_LUISTER_MS = 1600;    // zo lang wachten we op een signaal voordat we doorgaan
const SCAN_STIL_MS = 2500;       // zo lang stilte sluit een kanaal af en gaat de scan verder
const SCAN_WISSEL_MS = 4500;     // een profielwissel duurt langer: dan extra geduld
const radioEl = $('radio');
const weerEl = $('weer');

function owrxBase(cfg) {
  if (cfg.url) return cfg.url.replace(/\/+$/, '');
  // Net als bij de speler: de ontvanger staat waar OpenWebRX draait, niet per se waar deze
  // pagina vandaan komt. Zonder cfg.host is dat dezelfde machine, zoals vroeger op de Pi.
  const h = cfg.host && !/^(127\.0\.0\.1|localhost|::1)$/.test(cfg.host) ? cfg.host : location.hostname;
  return `${location.protocol}//${h}:${cfg.port || 8073}`;
}
// Eerst het OpenWebRX-profiel kiezen waar de frequentie in valt (via de Pi), dan pas afstemmen.
// OpenWebRX negeert #freq= buiten de band van het actieve profiel.
async function owrxProfile(freq) {
  try {
    const r = await getJSON(`api/owrx/tune?hz=${Math.round(freq)}`);
    radio.profile = r && r.profile ? r.profile : '';
    if (r && r.sql != null) radio.sql = r.sql;              // squelch van dit profiel
    radio.noProfile = !!(r && r.ok === false && r.reason === 'geen profiel') ? Math.round(freq) : 0;
    return r || {};
  } catch { return {}; }
}
// Een kanaal kiezen start de eigen speler: dezelfde als bij een frequentie in de vluchtinfokaart
// en bij de scan. Daarvoor stond hier een OpenWebRX-venster in een iframe; dan draaiden er twee
// ontvangers door elkaar en had je twee keer geluid, twee squelchinstellingen en geen meelezen.
async function tune(freq, mod, label) {
  if (scan.on) scanStop(false);                       // handmatig kiezen stopt de scan
  await playFreq({ hz: Math.round(freq), ch: freq / 1e6, label: label || `${(freq / 1e6).toFixed(3)} MHz` });
  renderChannels();
}

function nearestAirport(a) {
  let best = null, bd = Infinity;
  for (const ap of airports) {
    const d = Math.hypot(ap.x - a.dx, ap.z - a.dz);
    if (d < bd) { bd = d; best = ap; }
  }
  return bd < 60 ? best : null;
}
function channelMatches(ch, ap) {
  if (!ap) return false;
  const n = ch.name.toLowerCase();
  return n.includes(ap.icao.toLowerCase()) || (ap.iata && n.includes(ap.iata.toLowerCase()))
    || (ap.city && n.includes(ap.city.toLowerCase()));
}
function renderChannels() {
  const box = $('radioChans');
  const ap = selected ? nearestAirport(selected) : null;
  // Dezelfde indeling als de keuzelijst: per veld gegroepeerd, binnen een groep op frequentie.
  // Op alfabet of op frequentie door elkaar zoek je je scheel; zo staat wat bij elkaar hoort ook
  // bij elkaar, en herken je de volgorde terug uit de lijst waarin je ze aanvinkte.
  const lijst = radio.channels.filter(ch => radio.pick.has(ch.freq));
  const rang = ch => {
    const i = KAN_GROEP.indexOf(ch.groep);
    return i < 0 ? KAN_GROEP.length : i;
  };
  const list = lijst.map(ch => ({ ch, near: channelMatches(ch, ap) }))
    .sort((p, q) => rang(p.ch) - rang(q.ch) || p.ch.freq - q.ch.freq);
  box.innerHTML = '';
  let groep = null;
  for (const { ch, near } of list) {
    if (ch.groep !== groep) {
      groep = ch.groep;
      const k = document.createElement('div');
      k.className = 'rc-kop';
      k.textContent = t(`radio.g.${groep || 'rest'}`);
      box.appendChild(k);
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = ch.name;
    const s = document.createElement('span');
    s.className = 'mhz';
    s.textContent = (ch.freq / 1e6).toFixed(3);
    b.appendChild(s);
    if (near) b.classList.add('near');
    b.setAttribute('aria-pressed', String(!!playing && playing.hz === ch.freq));
    b.addEventListener('click', () => tune(ch.freq, ch.mod, ch.name));
    box.appendChild(b);
  }
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'radio-empty';
    p.textContent = t(radio.channels.length ? 'radio.nopick' : 'radio.nochannels');
    box.appendChild(p);
  }
  $('radioCount').textContent = list.length ? String(list.length) : '';
}

// ---- kiezen welke kanalen in de rij staan en welke meedoen in de scan ------------------------
// De Pi levert alle bookmarks van OpenWebRX - dat zijn er ruim tweehonderd, van Schiphol Ground
// tot Karlsruhe Upper. Als rij knoppen is dat niet te overzien, dus de server hangt er een groep
// aan (EHAM, EHRD, EHEH, AMS Radar, militair, hulpdiensten) en hier kies je per kanaal of het in
// de rij staat en of het meedoet in de scan. Twee aparte vinkjes: een kanaal dat je zelden kiest
// maar wel wilt horen als er iets gebeurt, hoort in de scan en niet in de rij.
const KAN_GROEP = ['EHAM', 'EHRD', 'EHEH', 'AMS', 'MIL', 'POL', ''];

function kanaalStandaard() {
  // Eerste keer: de Nederlandse velden en de sectoren eromheen in de rij, en wat OpenWebRX zelf
  // als scanbaar heeft gemarkeerd in de scan. De rest staat uit en is met een vinkje te halen.
  radio.pick = new Set(radio.channels.filter(c => c.groep && c.groep !== 'POL').map(c => c.freq));
  radio.scanSet = new Set(radio.channels.filter(c => c.scan).map(c => c.freq));
  if (!radio.scanSet.size) {
    radio.scanSet = new Set(radio.channels.filter(c => /TWR|APP|ARR|RDR/i.test(c.name)
      && ['EHAM', 'EHRD', 'EHEH'].includes(c.groep)).map(c => c.freq));
  }
}

function renderPick() {
  const box = $('radioPickList');
  box.innerHTML = '';
  const per = new Map(KAN_GROEP.map(g => [g, []]));
  // De lijst toont alle tweehonderd-en-nog-wat bookmarks, want je moet er ook nog uit kunnen
  // kiezen. Dat maakt hem onoverzichtelijk zodra je een keuze hebt gemaakt: je ziet je eigen
  // selectie niet meer terug tussen de rest. Met GEKOZEN blijft alleen over wat je aanvinkte.
  const alleen = radio.alleenGekozen;
  for (const ch of radio.channels) {
    if (alleen && !radio.pick.has(ch.freq) && !radio.scanSet.has(ch.freq)) continue;
    per.get(per.has(ch.groep) ? ch.groep : '').push(ch);
  }
  for (const g of KAN_GROEP) {
    const lijst = (per.get(g) || []).sort((a, b) => a.freq - b.freq);
    if (!lijst.length) continue;
    const sec = document.createElement('section');
    sec.className = 'rp-groep';
    const kop = document.createElement('div');
    kop.className = 'rp-gkop';
    const naam = document.createElement('b');
    naam.textContent = t(`radio.g.${g || 'rest'}`);
    kop.appendChild(naam);
    // Per groep alles aan of uit: bij vijfentwintig militaire kanalen wil je niet vijfentwintig
    // keer klikken om ze allemaal weg te halen.
    for (const [veld, sleutel] of [['pick', 'radio.allshow'], ['scanSet', 'radio.allscan']]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rp-alles';
      b.textContent = t(sleutel);
      b.addEventListener('click', () => {
        const aan = lijst.some(c => !radio[veld].has(c.freq));
        for (const c of lijst) radio[veld][aan ? 'add' : 'delete'](c.freq);
        kanaalKlaar();
      });
      kop.appendChild(b);
    }
    sec.appendChild(kop);
    for (const ch of lijst) {
      const r = document.createElement('div');
      r.className = 'rp-rij' + (radio.pick.has(ch.freq) ? ' aan' : '')
        + (radio.scanSet.has(ch.freq) ? ' scant' : '');
      for (const [veld, titel] of [['pick', 'radio.showtitle'], ['scanSet', 'radio.scantitle2']]) {
        const l = document.createElement('label');
        l.className = `rp-vink rp-${veld === 'pick' ? 'toon' : 'scan'}`;
        l.title = t(titel);
        const i = document.createElement('input');
        i.type = 'checkbox';
        i.checked = radio[veld].has(ch.freq);
        i.addEventListener('change', () => {
          radio[veld][i.checked ? 'add' : 'delete'](ch.freq);
          r.classList.toggle('aan', radio.pick.has(ch.freq));
          r.classList.toggle('scant', radio.scanSet.has(ch.freq));
          kanaalKlaar(true);
        });
        l.appendChild(i);
        r.appendChild(l);
      }
      const n = document.createElement('span');
      n.className = 'rp-naam';
      n.textContent = ch.name;
      if (ch.info) n.title = ch.info;
      const f = document.createElement('span');
      f.className = 'rp-mhz';
      f.textContent = (ch.freq / 1e6).toFixed(3);
      r.appendChild(n); r.appendChild(f);
      sec.appendChild(r);
    }
    box.appendChild(sec);
  }
  kanaalTel();
}

function kanaalTel() {
  $('radioPickTel').textContent = t('radio.picktel', { toon: radio.pick.size, scan: radio.scanSet.size });
}

function kanaalKlaar(alleenTel) {
  kanaalTel();
  renderChannels();
  if (!alleenTel) renderPick();
  saveState();
}

// ---- scannen ---------------------------------------------------------------------------------
// De volgorde is op frequentie binnen een OpenWebRX-profiel: elke sprong naar een ander profiel
// herstart de SDR en kost seconden, dus hoe minder wissels hoe sneller de ronde. De server weet
// welk profiel bij een frequentie hoort; hier houden we het simpel en lopen we op frequentie,
// want de profielen liggen zelf ook op frequentie.
function scanLijst() {
  return radio.channels.filter(c => radio.scanSet.has(c.freq)).sort((a, b) => a.freq - b.freq);
}

function scanStart() {
  scan.lijst = scanLijst();
  if (!scan.lijst.length) { $('radioNote').textContent = t('radio.scanleeg'); return; }
  scan.on = true;
  scan.i = -1;
  $('radioScan').setAttribute('aria-pressed', 'true');
  scanVolgende();
}

function scanStop(stopSpeler = true) {
  scan.on = false;
  scan.hangt = false;
  clearTimeout(scan.timer);
  $('radioScan').setAttribute('aria-pressed', 'false');
  if (stopSpeler && playing && playing.scan) stopPlayer();
  renderChannels();
}

async function scanVolgende() {
  if (!scan.on) return;
  clearTimeout(scan.timer);
  scan.hangt = false;
  scan.i = (scan.i + 1) % scan.lijst.length;
  const ch = scan.lijst[scan.i];
  const vorige = playing && playing.hz;
  playing = { hz: ch.freq, ch: ch.freq / 1e6, label: ch.name, scan: true };
  renderPlayer({ playing: false, hz: ch.freq, connecting: true });
  const r = await owrxProfile(ch.freq);
  if (!scan.on || !playing || playing.hz !== ch.freq) return;
  player.play(playerUrl(), ch.freq, ch.name, radio.sql);
  player.setCapture(stt.on);
  scan.sinds = Date.now();
  renderChannels();
  // na een profielwissel komt er pas na een paar seconden weer audio
  const wacht = r && r.switched ? SCAN_WISSEL_MS : SCAN_LUISTER_MS;
  scan.timer = setTimeout(() => { if (scan.on && !scan.hangt) scanVolgende(); }, wacht);
}

// Wordt aangeroepen vanuit renderPlayer: het niveau komt per audioblok binnen.
function scanNiveau(st) {
  if (!scan.on || !playing || !playing.scan) return;
  const lvl = st.level ?? -150, sql = st.sql ?? radio.sql ?? -150;
  const nu = Date.now();
  if (lvl >= sql) {
    scan.hangt = true;
    scan.stil = 0;
    clearTimeout(scan.timer);
    return;
  }
  if (!scan.hangt) return;
  if (!scan.stil) scan.stil = nu;
  if (nu - scan.stil >= SCAN_STIL_MS) { scan.stil = 0; scanVolgende(); }
}
$('radioPickBtn').addEventListener('click', () => {
  const box = $('radioPick');
  const open = box.hidden;
  box.hidden = !open;
  // De keuzelijst neemt de plaats van de kanalenrij in: allebei tegelijk maakt het paneel
  // twee keer zo hoog en je bent op dat moment toch aan het kiezen, niet aan het luisteren.
  $('radioChansGrp').hidden = open;
  $('radioPickBtn').setAttribute('aria-expanded', String(open));
  if (open) renderPick();
  layoutPanel();
});
$('radioScan').addEventListener('click', () => (scan.on ? scanStop() : scanStart()));
$('radioPickOnly').addEventListener('click', () => {
  radio.alleenGekozen = !radio.alleenGekozen;
  $('radioPickOnly').setAttribute('aria-pressed', String(radio.alleenGekozen));
  renderPick();
});
// Aparte ingang naast Luister: staat OpenWebRX op 'in een tabblad openen', dan komt het
// radiopaneel nooit in beeld en zou de keuzelijst onbereikbaar zijn.
// Opnemen en automatisch leren. Allebei een stand op de Pi en niet in de browser: ze gelden voor
// de ontvanger, niet voor dit ene scherm. Daarom gaan ze over de lijn en niet via saveState.
async function sttSchakel(veld, aan) {
  try {
    const r = await fetch('api/stt/record', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [veld]: aan }) });
    const d = await r.json();
    stt.record = !!d.record;
    stt.learn = !!d.learn;
  } catch { /* de knoppen hieronder zetten zichzelf terug op wat de Pi zegt */ }
  $('optRec').checked = stt.record;
  $('optLearn').checked = stt.learn;
  $('plLearn').hidden = !(stt.ready && stt.record);
}
$('optRec').addEventListener('change', e => sttSchakel('record', e.target.checked));
$('optLearn').addEventListener('change', e => sttSchakel('learn', e.target.checked));

// RADIO in de weergavevoet opent het luchtbandpaneel op de kanalenrij: de kanalen die je hebt
// gekozen, direct aanklikbaar. Hij sprong eerder meteen door naar de vinklijst, en dan moest je
// eerst iets wegklikken voor je kon luisteren. Die lijst zit achter KANALEN in de voet daaronder.
$('chanToggle').addEventListener('click', () => setRadio(kolom !== 'radio'));
// Het luisterpaneel openen of sluiten. Het deelt de rechterkolom met de instellingen en de
// toestelkaart en sluit ze uit; dichtdoen brengt je terug bij de instellingen.
function setRadio(open) {
  setKolom(open ? 'radio' : 'inst');
  if (open) renderChannels();        // de rij bijwerken, anders zie je de stand van vorige keer
}
// LUISTER opent altijd de kanalenrij. Hij keek hier naar openwebrx.open_in_tab en opende dan
// een tabblad in plaats van het paneel - dat hoorde bij het OpenWebRX-venster dat vroeger in het
// paneel stond. Dat venster is weg, dus die aftakking liet je met een lege klik achter: geen
// paneel, geen kanalen, geen speler. Wie het hele OpenWebRX wil, klikt TABBLAD.
$('radioToggle')?.addEventListener('click', () => setRadio(radioEl.hidden));
$('radioClose').addEventListener('click', () => {
  setRadio(false);
  if (scan.on) scanStop();
  renderChannels();
});

// ------------------------------------------------------------ weerpaneel
// Vierde stand van de rechterkolom. De lagen staan op de kaart, de cijfers staan hier.
const WEER_POLL_MS = 120000;        // METAR's veranderen per half uur, de radar per tien minuten
const WEER_LUS_MS = 700;            // tempo van de lus door de beelden
const SIG_NL = { TS: 'onweer', TSGR: 'onweer met hagel', TURB: 'turbulentie', ICE: 'ijsvorming',
                 MTW: 'berggolven', DS: 'stofstorm', SS: 'zandstorm', VA: 'vulkaanas' };

function weerKlok(ts) {
  return new Date(ts * 1000).toLocaleTimeString(getLang() === 'en' ? 'en-GB' : 'nl-NL',
                                                { hour: '2-digit', minute: '2-digit', hour12: false });
}
// Windpijl: wijst de kant op waar de wind heen waait, dus de meldrichting plus 180 graden.
function windPijl(dir) {
  if (dir == null) return '○';                       // variabel of stil
  return '↑↗→↘↓↙←↖'[Math.round(((dir + 180) % 360) / 45) % 8];
}

async function laadWeer() {
  try {
    const d = await getJSON('api/weather');
    weer.metar = d.metar || [];
    weer.sigmet = d.sigmet || [];
    weer.frames = (d.rain && d.rain.frames) || [];
    weer.host = (d.rain && d.rain.host) || '';
    weer.t = d.t || {}; weer.fout = d.fout || {};
    weer.attribution = d.attribution || '';
    weer.geladen = true;
  } catch {
    weer.geladen = true;                                  // paneel toont dan gewoon wat er is
  }
  weerNaarKaart();
  renderWeer();
}

// Wat de twee weergaven van het weer moeten weten. De RadarPlot tekent zelf, de 3D-wereld
// krijgt zijn tegels en gebieden hier opgebouwd.
function weerNaarKaart() {
  if (radarView) radarView.setWeather({ frame: weer.frameId, sigmet: weer.sigmet });
  updateRain();
  buildSigmet3D();
}

function renderWeer() {
  if (weerEl.hidden) return;
  const lijst = $('weerList');
  lijst.textContent = '';
  for (const m of weer.metar) {
    const r = document.createElement('div');
    r.className = 'wm' + (m.cat ? ' cat-' + m.cat.toLowerCase() : '');
    r.title = m.raw || '';
    const wind = m.wdir == null && !m.wspd ? t('weer.calm')
      : `${windPijl(m.wdir)} ${m.wdir == null ? 'VRB' : String(m.wdir).padStart(3, '0')}/${m.wspd ?? 0}`
        + (m.wgst ? `G${m.wgst}` : '');
    const wolk = m.clouds && m.clouds.length
      ? m.clouds.map(c => `${c.c}${c.b != null ? String(Math.round(c.b / 100)).padStart(3, '0') : ''}`).join(' ')
      : (m.cover || '');
    const veld = document.createElement('b');
    veld.textContent = m.icao;
    const naam = document.createElement('span');
    naam.className = 'wm-naam';
    naam.textContent = m.naam || '';
    const w = document.createElement('span');
    w.className = 'wm-wind';
    w.textContent = wind;
    const rest = document.createElement('span');
    rest.className = 'wm-rest';
    rest.textContent = [wolk, m.vis != null ? `${m.vis}` : '', m.qnh ? `Q${m.qnh}` : '', m.wx]
      .filter(Boolean).join(' · ');
    r.append(veld, naam, w, rest);
    lijst.appendChild(r);
  }
  $('weerTel').textContent = weer.metar.length
    ? t('weer.tel', { n: weer.metar.length, tijd: weer.metar[0] ? weerKlok(weer.metar[0].t) : '' })
    : t('weer.leeg');

  const sg = $('weerSigGrp');
  sg.hidden = !weer.sigmet.length;
  if (weer.sigmet.length) {
    const sl = $('weerSigList');
    sl.textContent = '';
    for (const s of weer.sigmet) {
      const r = document.createElement('div');
      r.className = 'ws';
      r.title = s.raw || '';
      const h = document.createElement('b');
      h.textContent = `${s.qual ? s.qual + ' ' : ''}${SIG_NL[s.hazard] || s.hazard}`;
      const band = document.createElement('span');
      const flv = ft => (ft >= 1000 ? 'FL' + String(Math.round(ft / 100)).padStart(3, '0') : ft + 'ft');
      band.textContent = s.top ? `${s.base ? flv(s.base) : 'GND'}–${flv(s.top)}` : '';
      const fir = document.createElement('span');
      fir.className = 'ws-fir';
      fir.textContent = `${s.fir}${s.tot ? ' · ' + t('weer.until', { tijd: weerKlok(s.tot) }) : ''}`;
      r.append(h, band, fir);
      sl.appendChild(r);
    }
    $('weerSigTel').textContent = String(weer.sigmet.length);
  }

  const tg = $('weerTimeGrp');
  tg.hidden = !radarOpts.rain || weer.frames.length < 2;
  if (!tg.hidden) {
    const s = $('weerTime');
    s.max = String(weer.frames.length - 1);
    s.value = String(weer.idx < 0 ? weer.frames.length - 1 : weer.idx);
    $('weerTimeOut').textContent = weer.frameT ? weerKlok(weer.frameT) : '';
  }
  $('weerTag').textContent = weer.fout && Object.keys(weer.fout).length ? t('weer.bronfout') : '';
}

function setWeer(open) {
  setKolom(open ? 'weer' : 'inst');
  if (open) { renderWeer(); if (!weer.geladen) laadWeer(); }
}
$('weerToggle').addEventListener('click', () => setWeer(weerEl.hidden));
$('weerClose').addEventListener('click', () => setWeer(false));

$('weerRain').addEventListener('click', () => {
  radarOpts.rain = !radarOpts.rain;
  $('weerRain').setAttribute('aria-pressed', String(radarOpts.rain));
  if (!radarOpts.rain) weerLusStop();
  weerNaarKaart(); renderWeer(); saveState();
});
$('weerSig').addEventListener('click', () => {
  radarOpts.sigmet = !radarOpts.sigmet;
  $('weerSig').setAttribute('aria-pressed', String(radarOpts.sigmet));
  weerNaarKaart(); saveState();
});
$('weerTime').addEventListener('input', e => {
  weerLusStop();
  const i = +e.target.value;
  weer.idx = i >= weer.frames.length - 1 ? -1 : i;    // op het eind weer meelopen met het nieuwste
  $('weerTimeOut').textContent = weer.frameT ? weerKlok(weer.frameT) : '';
  weerNaarKaart();
});
function weerLusStop() {
  if (weer.timer) { clearInterval(weer.timer); weer.timer = 0; }
  weer.spelen = false;
  $('weerPlay').setAttribute('aria-pressed', 'false');
}
$('weerPlay').addEventListener('click', () => {
  if (weer.spelen) { weerLusStop(); return; }
  if (!radarOpts.rain) $('weerRain').click();          // zonder neerslag valt er niets te zien
  if (weer.frames.length < 2) return;
  weer.spelen = true;
  $('weerPlay').setAttribute('aria-pressed', 'true');
  weer.idx = 0;
  weer.timer = setInterval(() => {
    weer.idx = weer.idx < 0 || weer.idx >= weer.frames.length - 1 ? 0 : weer.idx + 1;
    weerNaarKaart();
    if (!weerEl.hidden) {
      $('weerTime').value = String(weer.idx);
      $('weerTimeOut').textContent = weer.frameT ? weerKlok(weer.frameT) : '';
    }
  }, WEER_LUS_MS);
  weerNaarKaart();
});
$('radioFreq').addEventListener('change', e => {
  const mhz = parseFloat(e.target.value);
  if (mhz > 0) tune(mhz * 1e6, 'am');
});

// Meeluisteren uit: alles wat met de ontvanger te maken heeft gaat weg en blijft weg. Niet
// alleen de speler, maar ook de knoppen die hem oproepen -- een knop die niets doet is erger
// dan geen knop. Er wordt niets gewist; de schakelaar bepaalt alleen wat je ziet.
function radioWeg() {
  radio.uit = true;
  stt.ready = false;
  stt.on = false;
  player.setCapture(false);
  for (const id of ['player', 'radio', 'radioPick', 'chanToggle', 'radioToggle',
                    'sttGrp', 'plLearn', 'plAuto', 'cFreq']) {
    const el = $(id);
    if (el) el.hidden = true;
  }
  if (kolom === 'radio') setKolom('inst');
}

async function loadRadio() {
  let cfg;
  try { cfg = await getJSON('api/channels'); } catch { return; }
  if (cfg.enabled === false) return radioWeg();
  radio.uit = false;
  radio.url = owrxBase(cfg);
  radio.channels = cfg.channels || [];
  radio.sql = cfg.squelch ?? null;
  radio.port = cfg.port || 8073;
  radio.playerUrl = cfg.player_url || '';
  radio.host = cfg.host || '';
  radio.relay = (cfg.relay || 'auto').toLowerCase();
  stt.ready = !!(cfg.stt && cfg.stt.ready);
  stt.model = (cfg.stt && cfg.stt.model) || '';
  // Wat whisper zelf klaagde bij de laatste mislukte poging. Zonder dit bleef er "luistert mee"
  // staan terwijl de binary al bij de eerste transmissie omviel, en stond de reden alleen in
  // een logboek dat je bij een add-on niet zomaar opslaat.
  stt.fout = (cfg.stt && cfg.stt.fout) || '';
  // Meelezen staat altijd aan zodra de Pi het kan; er is geen knop meer om het uit te zetten.
  stt.on = stt.ready;
  player.setCapture(stt.on);
  sttRender();
  stt.record = !!(cfg.stt && cfg.stt.record);
  stt.learn = !!(cfg.stt && cfg.stt.learn);
  if (cfg.stt && cfg.stt.slice) player.setSlice(cfg.stt.slice);
  $('plLearn').hidden = !(stt.ready && stt.record);
  $('sttGrp').hidden = !stt.ready;
  $('optRec').checked = !!stt.record;
  $('optLearn').checked = !!stt.learn;
  $('plAuto').hidden = !stt.ready;
  $('plAuto').setAttribute('aria-pressed', stt.auto ? 'true' : 'false');
  if ($('radioToggle')) $('radioToggle').hidden = false;
  $('chanToggle').hidden = false;
  if (!radio.pick.size && !radio.scanSet.size) kanaalStandaard();
  else {
    // kanalen die intussen uit de bookmarks verdwenen zijn, vallen vanzelf weg
    const bestaat = new Set(radio.channels.map(c => c.freq));
    for (const s of [radio.pick, radio.scanSet]) for (const f of [...s]) if (!bestaat.has(f)) s.delete(f);
  }
  renderChannels();
  if (!$('radioPick').hidden) renderPick();
}

// ------------------------------------------------------------ eigen locatie
const home = { lat: null, lon: null, x: 0, z: 0, label: 'HQ', ok: false, source: '' };
let homeMarker = null;

function placeHome(lat, lon, source, label) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  home.lat = lat; home.lon = lon; home.source = source;
  if (label) home.label = label;
  [home.x, home.z] = toXZ(lat, lon);
  const eerste = !home.ok;
  home.ok = true;
  // De knoppenrij wordt gebouwd zodra de luchthavens binnen zijn, en dat is vóórdat de eigen
  // positie uit de config bekend is. Zonder deze regel bleef HQ dus altijd weg.
  if (eerste) rebuildAirportChips();
  if (!homeMarker) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.62, 32),
      new THREE.MeshBasicMaterial({ color: dayOn ? '#0a7fa6' : '#58d6ff', side: THREE.DoubleSide, depthTest: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 3;
    const mast = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1.2, 0)]),
      new THREE.LineBasicMaterial({ color: dayOn ? '#0a7fa6' : '#58d6ff', transparent: true, opacity: 0.8, depthTest: false }));
    mast.renderOrder = 3;
    g.add(ring, mast);
    homeMarker = g;
    scene.add(g);
  }
  homeMarker.position.set(home.x, 0, home.z);
}

function findHome(cfgObserver) {
  const obs = cfgObserver || {};
  if (Number.isFinite(obs.lat) && Number.isFinite(obs.lon)) placeHome(obs.lat, obs.lon, 'config', obs.label);
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    p => placeHome(p.coords.latitude, p.coords.longitude, 'browser', obs.label),
    () => { if (!home.ok) $('homeNote').textContent = t('home.denied'); },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
}

// ------------------------------------------------------------ RadarPlot
let radarView = null, mode = 'radar';

function fmtLevel(a) {
  if (a.ground) return 'GND';
  const b = a.altb ?? a.altg;
  return b >= 3000 ? String(Math.round(b / 100)).padStart(3, '0') : `A${String(Math.round(Math.max(0, a.altg) / 100)).padStart(2, '0')}`;
}

function initRadar() {
  if (radarView) return radarView;
  radarView = createRadar({
    canvas: $('radar'),
    state: {
      aircraft, toXZ, toLat, toLon, get airports() { return airports; }, selected: () => selected,
    },
    motionAt, visible, routeOf, fmtLevel, home,
    get runways() { return runwayMon; },
    band: () => [Math.round(opts.floor / 100), opts.ceiling === Infinity ? 999 : Math.round(opts.ceiling / 100)],
    onSelect: a => select(a),
    airspaceOf,
    onMoved: () => { updateRangeOut(); saveState(); },
  });
  radarView.setTextScale(opts.lblScale || 1);
  radarView.setFocus(aspFocus, (SECTOREN[opts.sector] || {}).lagen || []);
  loadOverlay('api/mapvector', 'coast', d => radarView.setMap(d));
  loadOverlay('api/navdata', 'points', d => radarView.setNav(d), true);
  pollAirspace();
  return radarView;
}

// de Pi haalt kaart en navdata op de achtergrond op; blijven proberen tot ze er zijn
function loadOverlay(url, key, apply, note = false, tries = 0) {
  getJSON(url).then(d => {
    if (d && Array.isArray(d[key]) && d[key].length) {
      apply(d);
      if (note) $('navNote').textContent = '';
      return;
    }
    throw new Error('nog leeg');
  }).catch(() => {
    if (tries < 60) {
      if (note && tries > 1) $('navNote').textContent = t('nav.loading');
      setTimeout(() => loadOverlay(url, key, apply, note, tries + 1), 5000);
    } else if (note) {
      $('navNote').textContent = t('nav.failed');
    }
  });
}

function updateRangeOut() {
  $('rrange').value = Math.round(radarOpts.range);
  $('rangeOut').textContent = `${Math.round(radarOpts.range)} NM`;
}

function setMode(next, save = true) {
  mode = next;
  const radar = mode === 'radar';
  document.body.classList.toggle('radar', radar);
  $('radar').hidden = !radar;
  $('mode3d').setAttribute('aria-pressed', String(!radar));
  $('modeRadar').setAttribute('aria-pressed', String(radar));
  for (const el of document.querySelectorAll('.only3d')) el.hidden = radar;
  if (!radar) colorByToUI();      // de twee legenda's zijn allebei only3d; wisselen doet deze
  if (!radar) setLegend(false);
  $('panelMode').textContent = radar ? 'RADAR' : '3D';
  setFavicon(radar);
  applyDayNight();
  for (const el of document.querySelectorAll('.onlyradar')) el.hidden = !radar;
  for (const b of document.querySelectorAll('.camctl button')) {
    const g = { left: ['\u21b6', '\u2190'], right: ['\u21b7', '\u2192'],
                up: ['\u25b2', '\u2191'], down: ['\u25bc', '\u2193'] }[b.dataset.act];
    if (g) b.textContent = radar ? g[1] : g[0];
    if (g) b.title = t(radar
      ? { left: 'cam.panleft', right: 'cam.panright', up: 'cam.panup', down: 'cam.pandown' }[b.dataset.act]
      : { left: 'cam.left', right: 'cam.right', up: 'cam.up', down: 'cam.down' }[b.dataset.act]);
  }
  $('infoText').textContent = t(radar ? 'info.radar' : 'info.3d');
  weerNaarKaart();        // de 3D-lagen bestaan alleen in 3D; de plot tekent het weer zelf
  if (radar) {
    const r = initRadar();
    if (!r.center.x && !r.center.z) r.centerOn(controls.target.x, controls.target.z);
    r.start(); updateRangeOut();
  } else if (radarView) radarView.stop();
  if (save) saveState();
}
$('mode3d').addEventListener('click', () => setMode('3d'));
$('modeRadar').addEventListener('click', () => setMode('radar'));

for (const r of document.querySelectorAll('input[name="rvector"]'))
  r.addEventListener('change', () => { radarOpts.vector = +r.value; saveState(); });
for (const r of document.querySelectorAll('input[name="rstep"]'))
  r.addEventListener('change', () => { radarOpts.step = +r.value; saveState(); });
$('rrange').addEventListener('input', e => {
  radarOpts.range = +e.target.value; updateRangeOut(); saveState();
});
function setBlocks(on) {
  radarOpts.blocks = on;
  $('rblocks').checked = on;
  saveState();
}
$('rblocks').addEventListener('change', e => setBlocks(e.target.checked));

function setLine3(mode3) {
  radarOpts.line3 = mode3;
  $('rdest').checked = mode3 === 'dest';
  if (radarView) radarView.refreshLabels();     // meteen tonen, niet pas bij de volgende stap
  saveState();
}
$('rdest').addEventListener('change', e => setLine3(e.target.checked ? 'dest' : 'levels'));

function setLegend(open) {
  $('legend').hidden = !open;
  $('legendBtn').setAttribute('aria-expanded', String(open));
}
$('legendBtn').addEventListener('click', () => setLegend($('legend').hidden));
addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); if (!e.repeat) quickLook(true); return; }
  if (mode !== 'radar') return;
  if (e.key === 'd' || e.key === 'D') { e.preventDefault(); setBlocks(!radarOpts.blocks); }
  else if (e.key === 'b' || e.key === 'B') { e.preventDefault(); setLine3(radarOpts.line3 === 'dest' ? 'levels' : 'dest'); }
  else if (e.key === 'Escape' && !$('legend').hidden) setLegend(false);
});
// Quick-look: zolang Q of de knop QL ingedrukt is alles volledig in beeld, ook wat uit staat.
// In de RadarPlot zijn dat de datablokken, in 3D de labels. Zo doet de knop in beide weergaven
// hetzelfde en is de kopbalk in beide even breed.
let ql3d = false;
function quickLook(on) {
  if (radarView) radarView.setQuickLook(on);
  ql3d = on;
  $('qlBtn').classList.toggle('on', on);
}
addEventListener('keyup', e => { if (e.key === 'q' || e.key === 'Q') quickLook(false); });
addEventListener('blur', () => quickLook(false));
$('qlBtn').addEventListener('pointerdown', e => { e.preventDefault(); $('qlBtn').setPointerCapture(e.pointerId); quickLook(true); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) $('qlBtn').addEventListener(ev, () => quickLook(false));
$('qlBtn').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); quickLook(true); } });
$('qlBtn').addEventListener('keyup', () => quickLook(false));
for (const r of document.querySelectorAll('input[name="rblockmode"]')) {
  r.addEventListener('change', () => { radarOpts.blockMode = r.value; if (radarView) radarView.redraw(); saveState(); });
}
$('rhistory').addEventListener('change', e => { radarOpts.history = e.target.checked; saveState(); });
$('rrings').addEventListener('change', e => { radarOpts.rings = e.target.checked; saveState(); });
$('rairways').addEventListener('change', e => { radarOpts.airways = e.target.checked; saveState(); });
$('rairspace').addEventListener('change', e => { radarOpts.airspace = e.target.checked; saveState(); });
for (const r of document.querySelectorAll('input[name="raspkind"]')) {
  r.addEventListener('change', () => { radarOpts.aspKind = r.value; saveState(); });
}
$('rfixes').addEventListener('change', e => { radarOpts.fixes = e.target.checked; saveState(); });
$('rdim').addEventListener('input', e => {
  radarOpts.dim = +e.target.value / 100;
  $('dimOut').textContent = `${e.target.value}%`;
  saveState();
});

// ------------------------------------------------------------ kaartlaag: dag, nacht, satelliet (alleen 3D)
const mqLight = matchMedia('(prefers-color-scheme: light)');
function wantMapMode() {
  if (opts.daynight === 'sat') return 'sat';
  if (opts.daynight === 'day') return 'day';
  if (opts.daynight === 'auto') return mqLight.matches ? 'day' : 'night';
  return 'night';
}
// Satellietbeeld komt van andere leveranciers dan de grijze kaart, dus de bronvermelding
// wisselt mee met de laag: in 3D met de kaartlaagknop, in de RadarPlot met SAT.
function setAttrib(m3) {
  const sat = mode === 'radar' ? radarOpts.mapColor === 'sat' : (m3 || mapMode) === 'sat';
  const el = $('attrib');
  if (el) el.textContent = (sat && ATTRIB.sat) || ATTRIB.std;
}

function applyDayNight(force = false) {
  const m3 = mode !== 'radar' ? wantMapMode() : 'night';
  const day = m3 === 'day';
  document.body.classList.toggle('day', day);
  setAttrib(m3);
  if (m3 === mapMode && !force) return;
  mapMode = m3;
  dayOn = day;
  RAMP = day ? RAMP_DAY : RAMP_NIGHT;
  BG.set(day ? '#dde6ef' : NIGHT);
  scene.fog.color.copy(BG);
  shared.uFogColor.value.copy(BG);
  TINT.set(m3 === 'sat' ? TINT_SAT : day ? '#f4f6f9' : '#7f9cc8');
  for (const [, m] of tiles) dropTile(m);        // tegels opnieuw laden uit de andere bron
  tiles.clear();
  updateTiles();
  if (runwayMesh) runwayMesh.material.color.set(day ? RWY_DAY : RWY_NIGHT);
  if (runwayLines) runwayLines.material.color.set(day ? RWY_DAY : RWY_NIGHT);
  if (homeMarker) for (const c of homeMarker.children) c.material.color.set(day ? '#0a7fa6' : '#58d6ff');
  C_SEL.set(day ? '#c2257f' : MAGENTA);
  trailsDirty = true;
}
mqLight.addEventListener?.('change', () => applyDayNight());
for (const r of document.querySelectorAll('input[name="daynight"]')) {
  r.addEventListener('change', () => { opts.daynight = r.value; applyDayNight(); saveState(); });
}

// ------------------------------------------------------------ favicon: FT-monogram in de kleur van de weergave
// Zelfde monogram als in de kopbalk: gelijke viewBox, ronding, lijndikte en lettergrootte,
// en de FT met text-anchor in het midden in plaats van met een vaste x links.
function setFavicon(radar) {
  const bg = radar ? '#06110d' : '#0a1628';
  const line = radar ? '#159545' : '#e23fa0';                 // even zwaar, zie --brand-line
  const txt = radar ? '#f2f5f2' : '#ffffff';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 132 132'>`
    + `<rect x='5' y='5' width='122' height='122' rx='12' fill='${bg}' stroke='${line}' stroke-width='6'/>`
    + `<text x='66' y='88' text-anchor='middle' font-family='monospace' font-weight='700'`
    + ` font-size='64' fill='${txt}'>FT</text></svg>`;
  $('favicon').href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// ------------------------------------------------------------ consolebediening
// Stappers en snelkeuzes zetten de verborgen schuifregelaar en sturen een input-event,
// zodat alle bestaande logica (opslaan, tekenen, uitlezing) gewoon meeloopt.
function nudge(id, dir) {
  const el = $(id);
  const step = +el.step || 1, min = +el.min, max = +el.max;
  let v = +el.value + dir * step;
  if (id === 'rrange') v = +el.value + dir * (el.value >= 100 ? 25 : el.value >= 30 ? 10 : 5);
  el.value = String(Math.max(min, Math.min(max, v)));
  el.dispatchEvent(new Event('input'));
}
for (const b of document.querySelectorAll('[data-step]')) {
  let timer = 0, rep = 0;
  const go = () => nudge(b.dataset.step, +b.dataset.dir);
  const stopRep = () => { clearTimeout(timer); clearInterval(rep); };
  b.addEventListener('pointerdown', e => {
    e.preventDefault(); go();
    timer = setTimeout(() => { rep = setInterval(go, 90); }, 380);   // ingedrukt houden herhaalt
  });
  b.addEventListener('pointerup', stopRep);
  b.addEventListener('pointerleave', stopRep);
  b.addEventListener('pointercancel', stopRep);
  b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
}
for (const b of document.querySelectorAll('[data-set]')) {
  b.addEventListener('click', () => {
    const el = $(b.dataset.set);
    el.value = b.dataset.val;
    el.dispatchEvent(new Event('input'));
  });
}
function syncPresets() {
  for (const b of document.querySelectorAll('#rangePresets [data-set]')) {
    b.setAttribute('aria-pressed', String(Math.round(radarOpts.range) === +b.dataset.val));
  }
}
// helderheid als balk van tien segmenten: AWY/NAVAID en de afstandsringen
function makeSegBar(barId, inputId, waarden = null) {
  const bar = $(barId);
  const lijst = waarden || Array.from({ length: 10 }, (_, i) => (i + 1) * 10);
  for (const v of lijst) {
    const s = document.createElement('button');
    s.type = 'button';
    s.setAttribute('aria-label', `${v}%`);
    s.addEventListener('click', () => { $(inputId).value = String(v); $(inputId).dispatchEvent(new Event('input')); });
    bar.appendChild(s);
  }
}
function litSegBar(barId, frac) {
  const lit = Math.round(frac * 10);
  [...$(barId).children].forEach((s, i) => s.classList.toggle('on', i < lit));
}
// segbalk met eigen stappen: branden tot en met de gekozen waarde
function litSegBarVal(barId, waarden, v) {
  let lit = waarden.findIndex(w => w >= v) + 1;
  if (!lit) lit = waarden.length;
  [...$(barId).children].forEach((s, i) => s.classList.toggle('on', i < lit));
}

// Grootte van de labelteksten: datablokken en bakens op de plot, labels in 3D.
const LBL_STEPS = [70, 80, 90, 100, 110, 125, 140, 160];
function applyLabelScale() {
  const v = Math.max(0.7, Math.min(1.6, opts.lblScale || 1));
  const pct = Math.round(v * 100);
  document.documentElement.style.setProperty('--lblscale', String(v));
  if (radarView) radarView.setTextScale(v);
  litSegBarVal('lblBar', LBL_STEPS, pct);
  $('lblOut').textContent = `${pct}%`;
  $('rlbl').value = String(pct);
}
makeSegBar('dimBar', 'rdim');
makeSegBar('lblBar', 'rlbl', LBL_STEPS);
$('rlbl').addEventListener('input', ev => { opts.lblScale = +ev.target.value / 100; applyLabelScale(); saveState(); });
makeSegBar('ringBar', 'rring');
makeSegBar('rwyBar', 'rrwy');
makeSegBar('aspBar', 'rasp');
makeSegBar('mapBar', 'rmapdim');
function syncDim() {
  litSegBar('dimBar', radarOpts.dim);
  litSegBar('ringBar', radarOpts.ringDim ?? 0.6);
  $('rring').value = String(Math.round((radarOpts.ringDim ?? 0.6) * 100));
  $('ringOut').textContent = `${Math.round((radarOpts.ringDim ?? 0.6) * 100)}%`;
  for (const r of document.querySelectorAll('input[name="rmap"]')) r.checked = r.value === (radarOpts.mapColor || 'std');
  for (const r of document.querySelectorAll('input[name="rtheme"]')) r.checked = r.value === (radarOpts.theme || 'nacht');
  for (const r of document.querySelectorAll('input[name="rblockmode"]')) r.checked = r.value === (radarOpts.blockMode || 'full');
  const rd = radarOpts.rwyDim ?? 0.6;
  litSegBar('rwyBar', rd);
  $('rrwy').value = String(Math.round(rd * 100));
  $('rwyOut').textContent = `${Math.round(rd * 100)}%`;
  const ad = radarOpts.aspDim ?? 0.6;
  litSegBar('aspBar', ad);
  $('rasp').value = String(Math.round(ad * 100));
  $('aspOut').textContent = `${Math.round(ad * 100)}%`;
  const md = radarOpts.mapDim ?? 0.7;
  litSegBar('mapBar', md);
  $('rmapdim').value = String(Math.round(md * 100));
  $('mapOut').textContent = `${Math.round(md * 100)}%`;
  $('rmapon').checked = radarOpts.map !== false;
  for (const r of document.querySelectorAll('input[name="rrwylen"]')) r.checked = +r.value === (radarOpts.rwyLen || 10);
  for (const r of document.querySelectorAll('input[name="rrwyshow"]')) r.checked = r.value === (radarOpts.rwyShow || 'active');
}
$('rrwy').addEventListener('input', e => { radarOpts.rwyDim = +e.target.value / 100; syncDim(); saveState(); });
$('rasp').addEventListener('input', e => { radarOpts.aspDim = +e.target.value / 100; syncDim(); if (radarView) radarView.redraw(); saveState(); });
$('rmapdim').addEventListener('input', e => { radarOpts.mapDim = +e.target.value / 100; syncDim(); if (radarView) radarView.redraw(); saveState(); });
$('rmapon').addEventListener('change', e => { radarOpts.map = e.target.checked; if (radarView) radarView.redraw(); saveState(); });
for (const r of document.querySelectorAll('input[name="rrwylen"]')) {
  r.addEventListener('change', () => { radarOpts.rwyLen = +r.value; saveState(); });
}
for (const r of document.querySelectorAll('input[name="rrwyshow"]')) {
  r.addEventListener('change', () => { radarOpts.rwyShow = r.value; saveState(); });
}
$('rring').addEventListener('input', e => {
  radarOpts.ringDim = +e.target.value / 100;
  syncDim(); saveState();
});
for (const r of document.querySelectorAll('input[name="rmap"]')) {
  r.addEventListener('change', () => { radarOpts.mapColor = r.value; setAttrib(); saveState(); });
}
for (const r of document.querySelectorAll('input[name="rtheme"]')) {
  r.addEventListener('change', () => { radarOpts.theme = r.value; saveState(); });
}
function syncBand() {
  const lo = (opts.floor || 0) / 45000;
  const hi = opts.ceiling === Infinity ? 1 : opts.ceiling / 45000;
  const f = $('bandFill');
  f.style.left = `${Math.max(0, lo) * 100}%`;
  f.style.width = `${Math.max(0, hi - lo) * 100}%`;
}
$('rrange').addEventListener('input', syncPresets);
$('rdim').addEventListener('input', syncDim);
$('floor').addEventListener('input', syncBand);
$('ceil').addEventListener('input', syncBand);
$('ceil').addEventListener('input', syncSector);
$('floor').addEventListener('input', syncSector);

// klokken in de statusstrook
function pad2(n) { return String(n).padStart(2, '0'); }
function tickClock() {
  const d = new Date();
  // seconden in een eigen span, zodat ze op een smal scherm kunnen wegvallen
  $('clkUtc').innerHTML = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}<span class="sec">:${pad2(d.getUTCSeconds())}</span>`;
  $('clkLt').innerHTML = `${pad2(d.getHours())}:${pad2(d.getMinutes())}<span class="sec">:${pad2(d.getSeconds())}</span>`;
}
tickClock();
setInterval(tickClock, 1000);

// ------------------------------------------------------------ taal
function applyLang(next, save = true) {
  setLang(next);
  applyStatic();
  $('langBtn').innerHTML = FLAG[next === 'nl' ? 'en' : 'nl'];
  optsToUI();
  radarToUI();
  updateRangeOut();
  setMode(mode, false);                    // hints, uitleg en knoptitels opnieuw zetten
  if (selected) updateCard();
  updateFilterNote();
  if (radioEl && !radioEl.hidden) renderChannels();
  rebuildAirportChips();
  setKolom(kolom, false);                  // de knop draagt zijn tekst zelf, dus opnieuw zetten
  layoutPanel();
  if (save) saveState();
}
$('langBtn').addEventListener('click', () => applyLang(getLang() === 'nl' ? 'en' : 'nl'));

// ------------------------------------------------------------ instellingen bewaren
let homeAirport = null, saveTimer = 0;
let aspFocus = '';                                  // veld waarvan het luchtruim nadruk krijgt

function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      vecTmp.copy(camera.position).sub(controls.target);
      sphTmp.setFromVector3(vecTmp);
      localStorage.setItem(STORE, JSON.stringify({
        opts: { ...opts, ceiling: opts.ceiling === Infinity ? null : opts.ceiling },
        filter: [...apFilter],
        cam: { x: controls.target.x, z: controls.target.z, r: sphTmp.radius, phi: sphTmp.phi, theta: sphTmp.theta },
        radio: { open: !radioEl.hidden,
                 pick: [...radio.pick], scanSet: [...radio.scanSet] },
        mode,
        lang: getLang(),
        kolom,
        playH,
        aspFocus,
        sttAuto: stt.auto,
        radar: { ...radarOpts, x: radarView ? radarView.center.x : 0, z: radarView ? radarView.center.z : 0 },
      }));
    } catch { /* privémodus of vol: dan gewoon niet bewaren */ }
  }, 400);
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORE)) || null; } catch { return null; }
}

function radarToUI() {
  $('rrange').value = Math.round(radarOpts.range);
  $('rangeOut').textContent = `${Math.round(radarOpts.range)} NM`;
  for (const r of document.querySelectorAll('input[name="rvector"]')) r.checked = +r.value === radarOpts.vector;
  for (const r of document.querySelectorAll('input[name="rstep"]')) r.checked = +r.value === radarOpts.step;
  $('rblocks').checked = radarOpts.blocks;
  $('rdest').checked = radarOpts.line3 === 'dest';
  syncPresets(); syncDim();
  $('rairways').checked = radarOpts.airways;
  $('rairspace').checked = radarOpts.airspace !== false;
  for (const r of document.querySelectorAll('input[name="raspkind"]')) r.checked = r.value === (radarOpts.aspKind || 'all');
  $('rfixes').checked = radarOpts.fixes;
  $('rdim').value = Math.round(radarOpts.dim * 100);
  $('dimOut').textContent = `${Math.round(radarOpts.dim * 100)}%`;
  $('rhistory').checked = radarOpts.history;
  $('rrings').checked = radarOpts.rings;
}

function optsToUI() {
  for (const r of document.querySelectorAll('input[name="mode"]')) r.checked = r.value === opts.mode;
  $('trail').value = opts.trailMin; $('trailOut').textContent = `${opts.trailMin} ${t('val.min')}`;
  shared.uTrail.value = opts.trailMin * 60;
  $('exag').value = opts.exag; $('exagOut').textContent = `${opts.exag}×`;
  shared.uExag.value = opts.exag;
  $('delay').value = opts.delay; $('delayOut').textContent = `${opts.delay} s`;
  const fl = opts.ceiling === Infinity ? 450 : Math.round(opts.ceiling / 100);
  $('ceil').value = fl;
  $('ceilOut').textContent = opts.ceiling === Infinity ? t('val.all') : `FL${String(fl).padStart(3, '0')}`;
  const ffl = Math.round((opts.floor || 0) / 100);
  $('floor').value = ffl;
  $('floorOut').textContent = ffl === 0 ? t('val.ground') : `FL${String(ffl).padStart(3, '0')}`;
  syncSector();
  $('optLabels').checked = opts.labels;
  alarm.aan = opts.alarm !== false;
  $('optAlarm').checked = alarm.aan;
  $('optDrops').checked = opts.drops;
  $('optRwyId').checked = opts.rwyid;
  $('optGround').checked = opts.ground;
  $('optHome').checked = opts.home;
  $('optLokaal').setAttribute('aria-pressed', String(opts.lokaal !== false));
  for (const s of SOORTEN) { const el = $(`soort_${s}`); if (el) el.checked = opts.soort[s] !== false; }
  colorByToUI();
  syncBand();
  for (const r of document.querySelectorAll('input[name="daynight"]')) r.checked = r.value === (opts.daynight || 'night');
  radarOpts.home = opts.home;
  if (homeMarker) homeMarker.visible = opts.home;
}

function defaultView() {
  const sph = new THREE.Spherical(48, 0.98, 0);     // noorden boven
  const t = homeAirport ? new THREE.Vector3(homeAirport.x, 0, homeAirport.z) : new THREE.Vector3();
  controls.target.copy(t);
  camera.position.copy(t).add(new THREE.Vector3().setFromSpherical(sph));
}

function resetView() {
  fly = null;
  if (mode === 'radar' && radarView) {
    radarView.centerOn(homeAirport ? homeAirport.x : 0, homeAirport ? homeAirport.z : 0);
    radarOpts.range = 60; updateRangeOut(); saveState();
    return;
  }
  if (homeAirport) flyTo(homeAirport.x, homeAirport.z, 48, 0.98, 0);
  else flyTo(0, 0, RADIUS_KM * 1.6, 0.75, 0);
  saveState();
}

function resetAll() {
  Object.assign(opts, DEFAULTS, { soort: { ...SOORT_AAN } });
  Object.assign(radarOpts, { range: 60, vector: 1, history: true, blocks: true, step: 4, rings: true, airways: true, fixes: true, dim: 0.2, line3: 'levels', ringDim: 0.6, mapColor: 'std', theme: 'nacht', holds: true, blockMode: 'full', airspace: true, aspKind: 'all', aspDim: 0.6, map: true, mapDim: 0.7, rwyDim: 0.6, rwyLen: 10, rwyShow: 'active' });
  radarToUI();
  apFilter.clear();
  syncApVelden();
  syncFilterChips();
  optsToUI();
  applyDayNight();
  buildTrails();
  resetView();
  try { localStorage.removeItem(STORE); } catch { /* niets aan te doen */ }
  saveState();
}
$('resetOpts').addEventListener('click', resetAll);

// ------------------------------------------------------------ data
async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}
function viewBox(marginKm = 120) {
  // grenzen van wat er nu te zien is, met marge, als lat/lon voor de server
  let cx = controls.target.x, cz = controls.target.z, half;
  if (mode === 'radar' && radarView) {
    cx = radarView.center.x; cz = radarView.center.z;
    half = radarOpts.range * 1.852 * 1.6;
  } else {
    half = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) * 1.4, 60, 1400);
  }
  half += marginKm;
  const lat1 = toLat(cz + half), lat2 = toLat(cz - half);
  const lon1 = toLon(cx - half), lon2 = toLon(cx + half);
  return `${lat1.toFixed(2)},${lon1.toFixed(2)},${lat2.toFixed(2)},${lon2.toFixed(2)}`;
}

async function poll() {
  try { applySnapshot(await getJSON(`api/aircraft?bbox=${viewBox()}`)); }
  catch { serverStatus = 'offline'; }
  finally { setTimeout(poll, POLL_MS); }
}

// De parameter heette eerst 'home' en verduisterde daarmee het module-brede `home` met je eigen
// positie: binnen deze functie betekende home.ok dan "EHAM".ok, dus undefined. Vandaar de
// eenduidige naam -- dit is een ICAO-code, geen positie.
async function loadAirports(thuisIcao) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await getJSON('api/airports');
      if (!r.loading) {
        airports = r.airports;
        break;
      }
    } catch { /* retry */ }
    await new Promise(res => setTimeout(res, 3000));
  }
  for (const ap of airports) [ap.x, ap.z] = toXZ(ap.lat, ap.lon);
  // Pas hier, want aptStraal meet vanaf ap.x/ap.z en die bestaan een regel eerder nog niet.
  // Meteen voor alle velden: de RadarPlot gebruikt dezelfde objecten en zet zijn naam ook
  // buiten de banen, dus die mag er niet op wachten tot de 3D een veld in beeld heeft gehad.
  for (const ap of airports) aptStraal(ap);
  syncApVelden();
  buildRunways();
  const nav = $('airports');
  const large = airports.filter(a => a.size === 'large');
  const homeAp = airports.find(a => a.icao === thuisIcao);
  const chips = [homeAp, ...large.filter(a => a !== homeAp)].filter(Boolean).slice(0, 7);
  const mk = (label, iata, onClick) => {
    const b = document.createElement('button'); b.type = 'button';
    b.textContent = label;
    if (iata) { const s = document.createElement('span'); s.className = 'iata'; s.textContent = iata; b.appendChild(s); }
    b.addEventListener('click', () => { nav.querySelectorAll('button').forEach(x => x.removeAttribute('aria-current')); b.setAttribute('aria-current', 'true'); follow = false; $('cFollow').setAttribute('aria-pressed', 'false'); onClick(); });
    nav.appendChild(b); return b;
  };
  airportChips = () => {
    // HQ vooraan: springt naar je eigen positie met hetzelfde bereik als een veld. Alleen als er
    // een positie is ingesteld -- een knop die niets doet is erger dan een knop die er niet is.
    if (home.ok) {
      const b = mk(t('bar.hq'), '', () => {
        aspFocus = '';                 // thuis is geen luchthaven: geen naderingsnadruk
        setApFilter([]);
        if (radarView) { radarView.setFocus('', []); radarView.setRange(VELD_NM); radarView.centerOn(home.x, home.z); }
        updateRangeOut();
        vliegNaarGebied(home.x, home.z, VELD_NM);
        saveState();
      });
      b.title = t('bar.hq.t');
      b.classList.add('aphq');
    }
    for (const ap of chips) {
      const b = mk(ap.icao, ap.iata, () => {
        aspFocus = ap.icao;
        setAspKind('civ');            // een veld is naderingswerk: de oefengebieden mogen weg
        setApFilter([ap.icao]);       // en het filter van/naar op dit veld
        // Elk veld hetzelfde bereik, zodat je na één klik weet hoe ver je kijkt. Het luchtruim
        // van dit veld krijgt wel nadruk, maar bepaalt het zicht niet meer.
        if (radarView) { radarView.setFocus(ap.icao, []); radarView.setRange(VELD_NM); radarView.centerOn(ap.x, ap.z); }
        updateRangeOut();
        vliegNaarGebied(ap.x, ap.z, VELD_NM);
        saveState();
      });
      b.title = ap.name;
      if (ap === homeAp) b.setAttribute('aria-current', 'true');
    }
    // sectorknoppen: hele werkplekken, met eigen hoogteband, bereik en nadruk
    const sep = document.createElement('span');
    sep.className = 'apsep';
    sep.setAttribute('aria-hidden', 'true');
    nav.appendChild(sep);
    for (const naam of ['ams', 'uac', 'mil']) {
      const b = mk(t(`sec.${naam}`), '', () => gaNaarSector(naam));
      b.dataset.sector = naam;
      b.title = t(`sec.${naam}.t`);
      b.classList.add('apsector');
    }
    mk(t('airports.overview'), '', () => {
      flyTo(0, 0, RADIUS_KM * 1.6, 0.75, 0);
      if (radarView) { radarView.centerOn(0, 0); radarOpts.range = Math.round(RADIUS_KM / 1.852); updateRangeOut(); radarView.setFocus('', []); }
      aspFocus = '';                                  // overzicht: alles even zwaar
      setAspKind('all');
      setApFilter([]);
      opts.floor = 0; opts.ceiling = Infinity; opts.sector = 'all';
      optsToUI(); buildTrails(); trailsDirty = true;
      saveState();
    });
  };
  airportChips();

  if (routesOn) buildFilterChips(chips);
  return homeAp;
}

async function start() {
  const saved = loadState();
  setLang(saved && saved.lang ? saved.lang : 'nl');     // standaard Nederlands
  applyStatic();
  $('langBtn').innerHTML = FLAG[getLang() === 'nl' ? 'en' : 'nl'];
  if (saved && saved.opts) {
    Object.assign(opts, saved.opts);
    if (opts.ceiling === null || opts.ceiling === undefined) opts.ceiling = Infinity;
    // een opgeslagen instelling van vóór de soorten heeft er geen; en een nieuwe soort in een
    // latere versie moet niet onzichtbaar blijven omdat hij niet in de oude opslag stond
    opts.soort = { ...SOORT_AAN, ...(saved.opts.soort || {}) };
  }
  buildSoortKeys();
  optsToUI();
  radarToUI();
  let cfg = { center: ORIGIN, radius_nm: 250, home_airport: 'EHRD' };
  try { cfg = await getJSON('api/config'); } catch { /* defaults */ }
  if (cfg.tile_attribution) {
    // Satellietbeeld komt van andere leveranciers dan de grijze kaart, dus de bronvermelding
    // wisselt mee met de laag. Geldt voor beide weergaven: 3D via de kaartlaagknop, 2D via SAT.
    ATTRIB.std = cfg.tile_attribution;
    ATTRIB.sat = cfg.tile_attribution_sat || '';
    setAttrib();
  }
  // Of de laag met plaatsnamen over de kaart gaat, bepaalt de server en niet je bewaarde
  // instellingen: dat hangt af van welke kaart eronder ligt. Heeft die zijn eigen letters, dan
  // staat alles er anders twee keer.
  radarOpts.mapRef = cfg.tile_ref !== false;
  photosOn = !!cfg.photos;
  routesOn = !!cfg.routes;
  airframesOn = !!cfg.airframes;
  schipholOn = !!cfg.schiphol;
  primary = cfg.source || '';
  ORIGIN = cfg.center; COSLAT = Math.cos(ORIGIN.lat * Math.PI / 180); RADIUS_KM = cfg.radius_nm * 1.852;

  // start view over home airport until airports arrive
  controls.target.set(0, 0, 0);
  camera.position.set(-30, 45, 60);
  setInterval(() => { if (mode !== 'radar') updateTiles(); }, 400);
  updateTiles();
  requestAnimationFrame(frame);

  try { applySnapshot(await getJSON(`api/aircraft?bbox=${viewBox()}`)); } catch { serverStatus = 'offline'; }
  try { applyTrails(await getJSON(`api/trails?bbox=${viewBox()}`)); } catch { /* sporen zijn extra */ }
  setTimeout(poll, POLL_MS);

  loadRadio();
  if (routesOn) {
    try { applyRoutes(await getJSON(`api/routes?bbox=${viewBox(60)}`)); } catch { /* komt later */ }
    setTimeout(pollRoutes, 8000);
  }
  if (cfg.fields) pollFields();
  findHome(cfg.observer);
  homeAirport = await loadAirports(cfg.home_airport);
  aspFocus = saved && saved.aspFocus !== undefined ? saved.aspFocus : (cfg.home_airport || '');
  if (radarView) radarView.setFocus(aspFocus, []);

  if (saved && saved.cam) {                       // bewaarde camerastand terugzetten
    const c = saved.cam;
    controls.target.set(c.x, 0, c.z);
    const sph = new THREE.Spherical(
      THREE.MathUtils.clamp(c.r, controls.minDistance, controls.maxDistance),
      THREE.MathUtils.clamp(c.phi, 0.05, controls.maxPolarAngle - 0.01), c.theta);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
  } else defaultView();

  if (saved && saved.filter && saved.filter.length && routesOn) {
    for (const icao of saved.filter) apFilter.add(icao);
    syncApVelden();
    syncFilterChips();                 // stond hier hardgecodeerd op 'Alles' en werkte dus niet in het Engels
    trailsDirty = true;
    updateFilterNote();
  }

  if (saved && saved.sttAuto) stt.auto = true;     // toestelkaart openen bij een herkenning
  setKolom(saved && saved.kolom === 'vlucht' ? 'vlucht' : 'inst', false);
  setPlayH(saved && saved.playH ? saved.playH : PLAY_STD, false);
  applyLabelScale();
  if (saved && saved.radar) {
    const { x, z, ...ro } = saved.radar;
    Object.assign(radarOpts, ro);
    radarToUI();
    if (saved.mode === 'radar' || x || z) { initRadar().centerOn(x || 0, z || 0); }
  }
  setMode(saved && saved.mode === '3d' ? '3d' : 'radar', false);

  if (saved && saved.radio) {
    // De keuze staat hier al klaar voordat de kanalen binnen zijn; loadRadio() gooit er later
    // alleen de frequenties uit die niet meer in de bookmarks staan.
    if (Array.isArray(saved.radio.pick)) radio.pick = new Set(saved.radio.pick);
    if (Array.isArray(saved.radio.scanSet)) radio.scanSet = new Set(saved.radio.scanSet);
  }
  if (saved && saved.radio && saved.radio.open) {
    radioEl.hidden = false;
    document.body.classList.add('radio-open');
    $('radioToggle')?.setAttribute('aria-expanded', 'true');
  }

  // Weer: één keer bij het opstarten en daarna om de twee minuten. De knoppen staan in de
  // stand die is opgeslagen, en de lagen komen mee zodra de eerste ronde binnen is.
  $('weerRain').setAttribute('aria-pressed', String(!!radarOpts.rain));
  $('weerSig').setAttribute('aria-pressed', String(radarOpts.sigmet !== false));
  laadWeer();
  setInterval(laadWeer, WEER_POLL_MS);
}
start();

