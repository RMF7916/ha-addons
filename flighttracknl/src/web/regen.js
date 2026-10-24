// Neerslag in een eigen, rustig palet.
//
// RainViewer levert sinds 2025 alleen nog het schema "Universal Blue": felblauw, geel, oranje,
// rood en roze. Dat zijn precies de kleuren waarmee de plot het verkeer onderscheidt (groen
// lijnvlucht, oranje vracht, blauw heli, rood militair), en bij 75% dekking lag er een bonte
// lap over de kaart waar de toestellen in wegvielen. Daaronder lag ook nog een bruingeel waas
// van motregen en grondruis onder de 12 dBZ, over grote delen van het land.
//
// Elke kleur in dat schema hoort bij precies één dBZ-waarde (de kleurentabel van RainViewer,
// hieronder ingesloten; 331.627 beeldpunten nagemeten, 73 vielen ertussen). De tegel wordt dus
// teruggerekend naar dBZ, licht gladgestreken en opnieuw ingekleurd:
//   - onder 12 dBZ niets: geen waas meer;
//   - daarboven één koele, grijsblauwe reeks die met de intensiteit lichter en dekkender wordt,
//     maar nooit verzadigd - een toestel blijft altijd het felste wat er op die plek staat;
//   - dunne lijnen op 25, 35, 45 en 55 dBZ, zoals isolijnen op een weerkaart: de vorm van een
//     bui is daaraan te lezen zonder dat het vlak zelf dik hoeft te zijn.
// Sneeuw krijgt dezelfde opbouw, iets witter.
//
// Gebruikt door de radarplot (radar.js) en de 3D-weergave (app.js), zodat beide hetzelfde tonen.

const REGEN_TAB = '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006361591466635a1969665c1e6c685d246f6b5f29726e612e75706234787364397c75653e7f786744827b6949857d6a4e88806c548b826d598e856f5e928871649e93756eaa9e7978b6a97e82c2b4828ccec08796d2c48ba0d6c88faadacc93b4ded097be88ddeeff6cd1ebff51c5e8ff36bae5ff1baee2ff00a3e0ff009ad5ff0091caff0088bfff007fb4ff0077aaff0070a3ff00699cff006295ff005b8eff005588ff005180ff004e78ff004a70ff004768ffffee00ffffe000ffffd200ffffc500ffffb700ffffaa00ffff9f00ffff9500ffff8b00ffff8100ffff4400fff23600ffe62800ffd91b00ffcd0d00ffc10000ffa80000ff8f0000ff760000ff5d0000ffffaaffffff9fffffff95ffffff8bffffff81ffffff77ffffff6cffffff62ffffff58ffffff4effffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff';
const SNEEUW_TAB = '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000cfffff00ceffff0ccdffff19ccffff26cbffff33cbffff3fcaffff4cc9ffff59c8ffff66c7ffff72c7ffff7fc6ffff8cc5ffff99c4ffffa5c3ffffb2c3ffffbfc2ffffccc1ffffd8c0ffffe5bffffff2bfffffffb8f8ffffb2f2ffffabebffffa5e5ffff9fdfffff98d8ffff92d2ffff8bcbffff85c5ffff7fbfffff78b8ffff72b2ffff6babffff65a5ffff5f9fffff5b9bffff5898ffff5595ffff5292ffff4f8fffff4b8bffff4888ffff4585ffff4282ffff3f7fffff3b7bffff3878ffff3575ffff3272ffff2f6fffff2b6bffff2868ffff2565ffff2262ffff1f5fffff1b5bffff1858ffff1555ffff1252ffff0f4fffff0c4bffff0948ffff0645ffff0242ffff003fffff003bffff0038ffff0035ffff0032ffff002fffff002bffff0028ffff0025ffff0022ffff001fffff001bffff0018ffff0015ffff0012ffff000fffff000cffff0009ffff0006ffff0002ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff0000ffff';

const ONDER = 12;                                     // dBZ; hieronder wordt niets getekend
const LIJNEN = [25, 35, 45, 55];                      // dBZ; isolijnen
// [dBZ, r, g, b, dekking] - tussen de stappen wordt geïnterpoleerd
const STAPPEN_REGEN = [
  [12,  76, 104, 132, 0.00],
  [17,  82, 112, 142, 0.12],
  [25,  96, 132, 164, 0.20],
  [35, 136, 168, 198, 0.32],
  [45, 192, 206, 226, 0.46],
  [55, 230, 220, 242, 0.56],
  [65, 250, 240, 252, 0.62],
];
const STAPPEN_SNEEUW = STAPPEN_REGEN.map(([d, r, g, b, a]) =>
  [d, Math.round(r + (235 - r) * 0.55), Math.round(g + (240 - g) * 0.55), Math.round(b + (248 - b) * 0.55), a]);
const LIJN_EXTRA = 0.26;                              // isolijn: zoveel dekking extra, en lichter

function palet(stappen) {
  const lut = new Uint8ClampedArray(128 * 4);         // index dBZ + 32
  for (let i = 0; i < 128; i++) {
    const dbz = i - 32;
    if (dbz < ONDER) continue;
    let k = 0;
    while (k < stappen.length - 1 && stappen[k + 1][0] <= dbz) k++;
    const a = stappen[k], b = stappen[Math.min(k + 1, stappen.length - 1)];
    const f = b[0] > a[0] ? Math.min(1, (dbz - a[0]) / (b[0] - a[0])) : 0;
    for (let c = 0; c < 4; c++) {
      const v = a[c + 1] + (b[c + 1] - a[c + 1]) * f;
      lut[i * 4 + c] = c === 3 ? Math.round(v * 255) : Math.round(v);
    }
  }
  return lut;
}
const LUT_REGEN = palet(STAPPEN_REGEN), LUT_SNEEUW = palet(STAPPEN_SNEEUW);

// kleur (RGBA als getal) -> dBZ + 32, met 128 erbij voor sneeuw
const KLEUR = new Map();
function leesTab(tab, extra) {
  for (let i = 0; i < 128; i++) {
    const h = tab.substr(i * 8, 8);
    if (h.endsWith('00')) continue;                   // doorzichtig: geen neerslag
    const k = parseInt(h, 16) >>> 0;
    if (!KLEUR.has(k)) KLEUR.set(k, i + extra);
  }
}
leesTab(REGEN_TAB, 0);
leesTab(SNEEUW_TAB, 128);
const BEKEND = [...KLEUR.entries()].map(([k, v]) => [k >>> 24, (k >>> 16) & 255, (k >>> 8) & 255, k & 255, v]);
const tussen = new Map();                              // kleuren die niet in de tabel staan: dichtstbijzijnde
function zoek(r, g, b, a) {
  const k = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
  const v = KLEUR.get(k);
  if (v !== undefined) return v;
  let w = tussen.get(k);
  if (w !== undefined) return w;
  let best = 1e9;
  for (const [br, bg, bb, ba, bv] of BEKEND) {
    const d = (br - r) ** 2 + (bg - g) ** 2 + (bb - b) ** 2 + (ba - a) ** 2;
    if (d < best) { best = d; w = bv; }
  }
  if (tussen.size < 4096) tussen.set(k, w);
  return w;
}

// Eén tegel (Image, geladen) -> doek in het eigen palet, of null als er geen neerslag in staat.
// Geeft de tegel zelf terug als de beeldpunten niet te lezen zijn: nooit erger dan voorheen.
// schaal: het doek wordt zoveel keer fijner uitgerekend, met de dBZ-waarden tussen de
// beeldpunten geïnterpoleerd. De 3D-weergave kijkt van dichtbij op zoomstap 7 en zag daar
// trapjes in de isolijnen; die houdt maar één beeld vast en kan het geheugen missen. De
// radarplot houdt dertien beelden voor de regenlus vast en blijft op 1.
export function regenStijl(img, schaal = 1) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  if (!w0 || !h0) return img;
  const bron = document.createElement('canvas');
  bron.width = w0; bron.height = h0;
  const bc = bron.getContext('2d', { willReadFrequently: true });
  bc.drawImage(img, 0, 0);
  let d0;
  try { d0 = bc.getImageData(0, 0, w0, h0); } catch (e) { return img; }
  const p0 = d0.data, n0 = w0 * h0;
  // 1. terug naar dBZ (-32 = niets), sneeuw apart
  const dbz0 = new Float32Array(n0).fill(-32);
  const sneeuw0 = new Uint8Array(n0);
  let iets = 0;
  for (let i = 0, j = 0; i < n0; i++, j += 4) {
    if (!p0[j + 3]) continue;
    const v = zoek(p0[j], p0[j + 1], p0[j + 2], p0[j + 3]);
    if (v === undefined) continue;
    dbz0[i] = (v & 127) - 32;
    sneeuw0[i] = v >= 128 ? 1 : 0;
    iets++;
  }
  if (!iets) return null;
  // 2. licht gladstrijken (3x3, midden dubbel), op de eigen resolutie van de bron: losse
  //    beeldpunten en trapjes verdwijnen, een echte bui blijft staan. Rand: alleen wat binnen de
  //    tegel ligt.
  // Een leeg beeldpunt telt hierbij als 0 dBZ, niet als -32: anders is de rand van een bui een
  // sprong van veertig dBZ en volgt de drempel daar precies de blokjes van de bron.
  const k = Math.max(1, Math.min(4, Math.round(schaal)));
  let g0 = dbz0.map(v => (v < 0 ? 0 : v));
  for (let pass = 0; pass < (k > 1 ? 3 : 1); pass++) {    // fijner uitgerekend: ook gladder
    const uit = new Float32Array(n0);
    for (let y = 0; y < h0; y++) {
      for (let x = 0; x < w0; x++) {
        let s = 0, m = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h0) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w0) continue;
            const g = dx === 0 && dy === 0 ? 2 : 1;
            s += g0[yy * w0 + xx] * g; m += g;
          }
        }
        uit[y * w0 + x] = s / m;
      }
    }
    g0 = uit;
  }
  // 2b. fijner uitrekenen: bilineair tussen de gladgestreken beeldpunten, zodat een rand een
  //     vloeiende lijn wordt in plaats van een trap; sneeuw van het dichtstbijzijnde beeldpunt
  const w = w0 * k, h = h0 * k, n = w * h;
  let glad = g0, sneeuw = sneeuw0;
  if (k > 1) {
    glad = new Float32Array(n); sneeuw = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      const fy = Math.max(0, Math.min(h0 - 1, (y + 0.5) / k - 0.5));
      const ya = Math.floor(fy), yb = Math.min(h0 - 1, ya + 1), ty = fy - ya;
      for (let x = 0; x < w; x++) {
        const fx = Math.max(0, Math.min(w0 - 1, (x + 0.5) / k - 0.5));
        const xa = Math.floor(fx), xb = Math.min(w0 - 1, xa + 1), tx = fx - xa;
        const a = g0[ya * w0 + xa], b = g0[ya * w0 + xb], c2 = g0[yb * w0 + xa], e = g0[yb * w0 + xb];
        glad[y * w + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c2 * (1 - tx) + e * tx) * ty;
        sneeuw[y * w + x] = sneeuw0[Math.round(fy) * w0 + Math.round(fx)];
      }
    }
  }
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  const d = c.createImageData(w, h);
  const px = d.data;
  // 3. inkleuren, met isolijnen waar een buur onder de drempel zit
  const band = v => { let b = 0; for (const l of LIJNEN) if (v >= l) b++; return b; };
  let zicht = 0;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const j = i * 4, v = glad[i];
      if (v < ONDER) { px[j + 3] = 0; continue; }
      const lut = sneeuw[i] ? LUT_SNEEUW : LUT_REGEN;
      const li = (Math.max(-32, Math.min(95, Math.round(v))) + 32) * 4;
      let r = lut[li], g = lut[li + 1], b = lut[li + 2], a = lut[li + 3];
      const bi = band(v);
      if (bi > 0) {
        const lager = (x > 0 && band(glad[i - 1]) < bi) || (x < w - 1 && band(glad[i + 1]) < bi) ||
                      (y > 0 && band(glad[i - w]) < bi) || (y < h - 1 && band(glad[i + w]) < bi);
        if (lager) {
          r += (255 - r) * 0.35; g += (255 - g) * 0.35; b += (255 - b) * 0.35;
          a = Math.min(255, a + LIJN_EXTRA * 255);
        }
      }
      px[j] = r; px[j + 1] = g; px[j + 2] = b; px[j + 3] = a;
      if (a) zicht++;
    }
  }
  if (!zicht) return null;
  c.putImageData(d, 0, 0);
  cv.complete = true;                                 // zelfde vorm als een Image voor de tekenaar
  cv.naturalWidth = w; cv.naturalHeight = h;
  return cv;
}
