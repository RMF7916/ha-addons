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
//     bui is daaraan te lezen zonder dat het vlak zelf dik hoeft te zijn. Die lijnen zijn geen
//     beeldpunten in de tegel maar lijnstukken (marching squares over het dBZ-veld), en de
//     radarplot en de 3D-weergave tekenen ze zelf met een vaste dikte: bij elk bereik even smal
//     en strak, in plaats van mee te vergroten met de tegel.
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
const LIJN_EXTRA = 0.30;                              // isolijn: zoveel dekking extra, en lichter

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

// Kleur van de isolijnen, per drempel: de kleur van het vlak op die drempel, lichter en
// dekkender. Als [r, g, b, a] met a van 0 tot 1, en als CSS-kleur.
export const LIJN_KLEUR = LIJNEN.map(l => {
  const i = (l + 32) * 4;
  const r = Math.round(LUT_REGEN[i] + (255 - LUT_REGEN[i]) * 0.35);
  const g = Math.round(LUT_REGEN[i + 1] + (255 - LUT_REGEN[i + 1]) * 0.35);
  const b = Math.round(LUT_REGEN[i + 2] + (255 - LUT_REGEN[i + 2]) * 0.35);
  const a = Math.min(1, LUT_REGEN[i + 3] / 255 + LIJN_EXTRA);
  return { rgb: [r, g, b], a, css: `rgba(${r},${g},${b},${a.toFixed(3)})` };
});

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

// Per tegel wordt alleen het dBZ-veld bewaard (een byte per beeldpunt: de index uit de tabel,
// 0 = niets), niet het beeld. Daarmee kan een tegel bij het gladstrijken en het zoeken naar
// isolijnen een rand van zijn buren meenemen. Zonder die rand rekende elke tegel zijn eigen rand
// anders uit dan de buurtegel, en lag er op de tegelgrens een rechte naad door de regen.
// Komt een buur pas later binnen, dan kan de aanroeper de tegel opnieuw laten uitrekenen
// (regenOpnieuw); volledig zegt of dat nog nodig is.
const P = 4;                                           // rand van de buren, in bronbeeldpunten
const velden = new Map();                              // "frame/z/x/y" -> { v: Uint8Array, w, h } | 'leeg'
const VELD_MAX = 700;                                  // 64 kB per stuk; dertien beelden passen ruim

function veldUit(img) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (!w || !h) return undefined;
  const bron = document.createElement('canvas');
  bron.width = w; bron.height = h;
  const bc = bron.getContext('2d', { willReadFrequently: true });
  bc.drawImage(img, 0, 0);
  let d;
  try { d = bc.getImageData(0, 0, w, h); } catch (e) { return undefined; }
  const p = d.data, v = new Uint8Array(w * h);
  let iets = 0;
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    if (!p[j + 3]) continue;
    const c = zoek(p[j], p[j + 1], p[j + 2], p[j + 3]);
    if (c === undefined || (c & 127) === 0) continue;
    v[i] = c; iets++;
  }
  return iets ? { v, w, h } : 'leeg';
}

function bewaar(sleutel, veld) {
  velden.delete(sleutel);
  velden.set(sleutel, veld);
  while (velden.size > VELD_MAX) velden.delete(velden.keys().next().value);
}

function deel(sleutel) {
  const d = sleutel.split('/');
  const y = +d.pop(), x = +d.pop(), z = +d.pop();
  return { voor: d.join('/'), z, x, y };
}

// De acht buren van een tegel, in dezelfde vorm als de sleutel.
export function regenBuren(sleutel) {
  const { voor, z, x, y } = deel(sleutel), n = 2 ** z, uit = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const yy = y + dy;
      if (yy < 0 || yy >= n) continue;
      uit.push(`${voor}/${z}/${(x + dx + n) % n}/${yy}`);
    }
  }
  return uit;
}

// Een tegel die niet bestaat (404, open zee): telt voor de buren als leeg, niet als onbekend.
export function regenLeeg(sleutel) { bewaar(sleutel, 'leeg'); }

// Tegel binnengekomen: veld bewaren en uitrekenen. Geeft { doek, volledig }: doek is null als er
// niets te zien is, of het beeld zelf als het niet te lezen is (nooit erger dan voorheen).
export function regenTegel(sleutel, img, schaal = 1) {
  const veld = veldUit(img);
  if (veld === undefined) return { doek: img, volledig: true };
  bewaar(sleutel, veld);
  return teken(sleutel, schaal);
}

// Opnieuw uitrekenen met de buren die er nu zijn. null als de tegel zelf (nog) niet bekend is.
export function regenOpnieuw(sleutel, schaal = 1) {
  return velden.has(sleutel) ? teken(sleutel, schaal) : null;
}

// Zonder sleutel en zonder buren, voor wie alleen een losse tegel heeft.
export function regenStijl(img, schaal = 1) {
  const veld = veldUit(img);
  if (veld === undefined) return img;
  if (veld === 'leeg') return null;
  return tekenVeld(veld, () => undefined, schaal).doek;
}

function teken(sleutel, schaal) {
  const veld = velden.get(sleutel);
  if (!veld || veld === 'leeg') return { doek: null, volledig: true };
  const { voor, z, x, y } = deel(sleutel), n = 2 ** z;
  const buur = (dx, dy) => {
    const yy = y + dy;
    if (yy < 0 || yy >= n) return 'leeg';
    return velden.get(`${voor}/${z}/${(x + dx + n) % n}/${yy}`);
  };
  return tekenVeld(veld, buur, schaal);
}

// schaal: het doek wordt zoveel keer fijner uitgerekend, met de dBZ-waarden tussen de
// beeldpunten geïnterpoleerd. De 3D-weergave kijkt van dichtbij op zoomstap 7 en zag daar
// trapjes in de isolijnen; die houdt maar één beeld vast en kan het geheugen missen. De
// radarplot houdt dertien beelden voor de regenlus vast en blijft op 1.
function tekenVeld(veld, buur, schaal) {
  const { v: eigen, w: w0, h: h0 } = veld;
  const k = Math.max(1, Math.min(4, Math.round(schaal)));
  // 1. veld met rand: dBZ, en leeg telt als 0 dBZ, niet als -32 - anders is de rand van een bui
  //    een sprong van veertig dBZ en volgt de drempel daar precies de blokjes van de bron.
  //    Een buur die er (nog) niet is: de eigen rand doorgetrokken.
  const Wp = w0 + 2 * P, Hp = h0 + 2 * P, np = Wp * Hp;
  const g = new Float32Array(np), sn = new Uint8Array(np);
  let volledig = true;
  const bc = new Array(9);                             // (dy+1)*3 + (dx+1)
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const b = dx || dy ? buur(dx, dy) : veld;
      const ok = b === 'leeg' || (b && b.w === w0 && b.h === h0);
      if (!ok) volledig = false;
      bc[(dy + 1) * 3 + dx + 1] = ok ? b : null;
    }
  }
  for (let py = 0; py < Hp; py++) {
    let sy = py - P, ty = 0;
    if (sy < 0) ty = -1; else if (sy >= h0) ty = 1;
    for (let px = 0; px < Wp; px++) {
      let sx = px - P, tx = 0;
      if (sx < 0) tx = -1; else if (sx >= w0) tx = 1;
      let b = bc[(ty + 1) * 3 + tx + 1], lx = sx - tx * w0, ly = sy - ty * h0;
      if (b === null) {                                // onbekend: eigen rand
        b = veld;
        lx = Math.max(0, Math.min(w0 - 1, sx)); ly = Math.max(0, Math.min(h0 - 1, sy));
      }
      if (b === 'leeg') continue;
      const c = b.v[ly * w0 + lx];
      if (!c) continue;
      const d = (c & 127) - 32;
      g[py * Wp + px] = d > 0 ? d : 0;
      sn[py * Wp + px] = c >= 128 ? 1 : 0;
    }
  }
  // 2. licht gladstrijken (3x3, midden dubbel): losse beeldpunten en trapjes verdwijnen, een
  //    echte bui blijft staan. Twee keer: de isolijnen worden uit dit veld getrokken en volgen
  //    anders de blokjes van de bron. Fijner uitgerekend drie keer, want daar komt de camera dichtbij.
  let g0 = g;
  for (let pass = 0; pass < (k > 1 ? 3 : 2); pass++) {
    const uit = new Float32Array(np);
    for (let yy = 0; yy < Hp; yy++) {
      for (let xx = 0; xx < Wp; xx++) {
        let s = 0, m = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const y2 = yy + dy;
          if (y2 < 0 || y2 >= Hp) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const x2 = xx + dx;
            if (x2 < 0 || x2 >= Wp) continue;
            const gw = dx === 0 && dy === 0 ? 2 : 1;
            s += g0[y2 * Wp + x2] * gw; m += gw;
          }
        }
        uit[yy * Wp + xx] = s / m;
      }
    }
    g0 = uit;
  }
  // 3. uitrekenen op de gevraagde schaal, met één beeldpunt marge rondom voor de isolijnen:
  //    bilineair tussen de gladgestreken bronpunten, sneeuw van het dichtstbijzijnde
  const w = w0 * k, h = h0 * k, wm = w + 2, hm = h + 2;
  const glad = new Float32Array(wm * hm), sneeuw = new Uint8Array(wm * hm);
  for (let oy = -1; oy <= h; oy++) {
    const fy = Math.max(0, Math.min(Hp - 1, (oy + 0.5) / k - 0.5 + P));
    const ya = Math.floor(fy), yb = Math.min(Hp - 1, ya + 1), ty = fy - ya;
    for (let ox = -1; ox <= w; ox++) {
      const fx = Math.max(0, Math.min(Wp - 1, (ox + 0.5) / k - 0.5 + P));
      const xa = Math.floor(fx), xb = Math.min(Wp - 1, xa + 1), tx = fx - xa;
      const a = g0[ya * Wp + xa], b = g0[ya * Wp + xb], c2 = g0[yb * Wp + xa], e = g0[yb * Wp + xb];
      const i = (oy + 1) * wm + (ox + 1);
      glad[i] = (a * (1 - tx) + b * tx) * (1 - ty) + (c2 * (1 - tx) + e * tx) * ty;
      sneeuw[i] = sn[Math.round(fy) * Wp + Math.round(fx)];
    }
  }
  // 4. inkleuren; de isolijnen komen er los bij (stap 5)
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  const d = c.createImageData(w, h);
  const px = d.data;
  let zicht = 0;
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const i = (yy + 1) * wm + (xx + 1), j = (yy * w + xx) * 4, v = glad[i];
      if (v < ONDER) continue;
      const lut = sneeuw[i] ? LUT_SNEEUW : LUT_REGEN;
      const li = (Math.max(-32, Math.min(95, Math.round(v))) + 32) * 4;
      const a = lut[li + 3];
      px[j] = lut[li]; px[j + 1] = lut[li + 1]; px[j + 2] = lut[li + 2]; px[j + 3] = a;
      if (a) zicht++;
    }
  }
  if (!zicht) return { doek: null, volledig, lijnen: null };
  c.putImageData(d, 0, 0);
  cv.complete = true;                                 // zelfde vorm als een Image voor de tekenaar
  cv.naturalWidth = w; cv.naturalHeight = h;
  // 5. isolijnen als lijnstukken, in tegelcoördinaten (0..1, y naar beneden)
  const lijnen = isolijnen(g0, Wp, Hp, w0, h0);
  cv.lijnen = lijnen;                                 // de radarplot bewaart alleen het doek
  return { doek: cv, volledig, lijnen };
}

// Marching squares over het gladgestreken veld met rand. Een tegel neemt de cellen tussen de
// beeldpuntmiddens van -1 tot w-1: de rechter buur begint precies waar deze ophoudt, dus over
// de tegelgrens loopt een lijn door zonder gat of dubbel stuk. Een cel waar de drempel doorheen
// loopt wordt in DEEL x DEEL deelcellen verdeeld, met bicubische waarden (Catmull-Rom over 4x4
// bronpunten); zo buigt de lijn binnen een bronbeeldpunt (ruim een kilometer) mee en loopt hij
// vloeiend over de celgrens, in plaats van er met een knik recht doorheen te snijden. Per
// drempel { fijn, grof }: lijsten van doorlopende lijnen, elk een Float32Array [u0, v0, u1, v1,
// ...] in tegelcoördinaten (0..1, y naar beneden), uitgedund op twee detailniveaus.
const DEEL = 4;
// Catmull-Rom-gewichten voor de DEEL+1 punten binnen een cel, eenmalig uitgerekend
const CR = [];
for (let i = 0; i <= DEEL; i++) {
  const t = i / DEEL, t2 = t * t, t3 = t2 * t;
  CR.push([(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2]);
}
function isolijnen(f, Wp, Hp, w0, h0) {
  const uit = [];
  const q = new Float32Array((DEEL + 1) * (DEEL + 1));
  const rij = new Float32Array(4);
  for (const L of LIJNEN) {
    const seg = [];
    const vak = (x0, y0, st, a, b, c, d) => {        // één (deel)cel; a b / d c, linksboven a
      const ci = (a >= L ? 8 : 0) | (b >= L ? 4 : 0) | (c >= L ? 2 : 0) | (d >= L ? 1 : 0);
      if (ci === 0 || ci === 15) return;
      const t = (va, vb) => (L - va) / (vb - va);
      const B = () => [x0 + st * t(a, b), y0];
      const R = () => [x0 + st, y0 + st * t(b, c)];
      const O = () => [x0 + st * t(d, c), y0 + st];
      const Li = () => [x0, y0 + st * t(a, d)];
      const s2 = (p1, p2) => seg.push(p1[0], p1[1], p2[0], p2[1]);
      switch (ci) {
        case 1: case 14: s2(Li(), O()); break;
        case 2: case 13: s2(O(), R()); break;
        case 3: case 12: s2(Li(), R()); break;
        case 4: case 11: s2(B(), R()); break;
        case 6: case 9: s2(B(), O()); break;
        case 7: case 8: s2(Li(), B()); break;
        case 5: case 10: {                           // zadel: het midden beslist
          const m = (a + b + c + d) / 4 >= L;
          if ((ci === 5) === m) { s2(Li(), B()); s2(O(), R()); } else { s2(Li(), O()); s2(B(), R()); }
          break;
        }
      }
    };
    for (let y = P - 1; y < P + h0 - 1; y++) {
      for (let x = P - 1; x < P + w0 - 1; x++) {
        const a = f[y * Wp + x], b = f[y * Wp + x + 1], c = f[(y + 1) * Wp + x + 1], d = f[(y + 1) * Wp + x];
        const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
        if (L <= lo || L > hi) continue;              // geen lijn in deze cel
        // de rand (P = 4) zorgt dat x-1 .. x+2 en y-1 .. y+2 altijd binnen het veld liggen
        for (let i = 0; i <= DEEL; i++) {
          const wx = CR[i];
          for (let j = 0; j <= DEEL; j++) {
            const wy = CR[j];
            for (let r = 0; r < 4; r++) {
              const o = (y - 1 + r) * Wp + x - 1;
              rij[r] = f[o] * wx[0] + f[o + 1] * wx[1] + f[o + 2] * wx[2] + f[o + 3] * wx[3];
            }
            q[j * (DEEL + 1) + i] = rij[0] * wy[0] + rij[1] * wy[1] + rij[2] * wy[2] + rij[3] * wy[3];
          }
        }
        const st = 1 / DEEL;
        for (let j = 0; j < DEEL; j++) {
          for (let i = 0; i < DEEL; i++) {
            const r = j * (DEEL + 1) + i;
            vak(x + i * st, y + j * st, st, q[r], q[r + 1], q[r + DEEL + 2], q[r + DEEL + 1]);
          }
        }
      }
    }
    // beeldpuntindex met rand -> tegelcoördinaat: midden van beeldpunt i ligt op (i + 0.5) / w
    for (let i = 0; i < seg.length; i += 2) {
      seg[i] = (seg[i] - P + 0.5) / w0;
      seg[i + 1] = (seg[i + 1] - P + 0.5) / h0;
    }
    const ketens = keten(seg);
    uit.push({ fijn: ketens.map(k => dunUit(k, TOL_FIJN)), grof: ketens.map(k => dunUit(k, TOL_GROF)) });
  }
  return uit;
}

// Uitdunnen, in tegelcoördinaten (1 = de hele tegel, 256 bronbeeldpunten). Fijn: voor dichtbij,
// waar een tegel duizenden beeldpunten groot op het scherm staat. Grof: als de tegel klein in
// beeld is; beide wijken daar minder dan ongeveer een beeldpunt af. De radarplot kiest per tegel.
const TOL_FIJN = 0.0003, TOL_GROF = 0.003;

// Losse lijnstukken aan elkaar tot doorlopende lijnen. Buurcellen rekenen het snijpunt op hun
// gedeelde ribbe met dezelfde twee waarden uit, dus de eindpunten vallen precies samen.
function keten(seg) {
  const n = seg.length / 4;
  if (!n) return [];
  const sleutel = (x, y) => `${Math.round(x * 1e6)},${Math.round(y * 1e6)}`;
  const bij = new Map();
  const voeg = (k, i) => { const l = bij.get(k); if (l) l.push(i); else bij.set(k, [i]); };
  const ka = new Array(n), kb = new Array(n);
  for (let i = 0; i < n; i++) {
    ka[i] = sleutel(seg[i * 4], seg[i * 4 + 1]); kb[i] = sleutel(seg[i * 4 + 2], seg[i * 4 + 3]);
    voeg(ka[i], i); voeg(kb[i], i);
  }
  const gedaan = new Uint8Array(n), uit = [];
  const volgende = (k, niet) => { for (const j of bij.get(k) || []) if (!gedaan[j] && j !== niet) return j; return -1; };
  for (let i = 0; i < n; i++) {
    if (gedaan[i]) continue;
    gedaan[i] = 1;
    const pts = [seg[i * 4], seg[i * 4 + 1], seg[i * 4 + 2], seg[i * 4 + 3]];
    // vooruit vanaf b
    let k = kb[i];
    for (let j = volgende(k, i); j >= 0; j = volgende(k, j)) {
      gedaan[j] = 1;
      const vooraan = ka[j] === k;
      pts.push(vooraan ? seg[j * 4 + 2] : seg[j * 4], vooraan ? seg[j * 4 + 3] : seg[j * 4 + 1]);
      k = vooraan ? kb[j] : ka[j];
    }
    // achteruit vanaf a
    const terug = [];
    k = ka[i];
    for (let j = volgende(k, i); j >= 0; j = volgende(k, j)) {
      gedaan[j] = 1;
      const vooraan = ka[j] === k;
      terug.push(vooraan ? seg[j * 4 + 3] : seg[j * 4 + 1], vooraan ? seg[j * 4 + 2] : seg[j * 4]);
      k = vooraan ? kb[j] : ka[j];
    }
    const lijn = [];
    for (let t = terug.length - 2; t >= 0; t -= 2) lijn.push(terug[t + 1], terug[t]);
    uit.push(lijn.concat(pts));
  }
  return uit;
}

// Douglas-Peucker, zonder recursie; begin- en eindpunt blijven altijd staan.
function dunUit(pts, tol) {
  const n = pts.length / 2;
  if (n <= 2) return Float32Array.from(pts);
  const houd = new Uint8Array(n);
  houd[0] = houd[n - 1] = 1;
  const stapel = [0, n - 1], t2 = tol * tol;
  while (stapel.length) {
    const b = stapel.pop(), a = stapel.pop();
    const ax = pts[a * 2], ay = pts[a * 2 + 1], bx = pts[b * 2], by = pts[b * 2 + 1];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let max = -1, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i * 2] - ax, py = pts[i * 2 + 1] - ay;
      let d2;
      if (l2 === 0) d2 = px * px + py * py;
      else { const c = px * dy - py * dx; d2 = (c * c) / l2; }
      if (d2 > max) { max = d2; mi = i; }
    }
    if (max > t2) { houd[mi] = 1; stapel.push(a, mi, mi, b); }
  }
  const uit = [];
  for (let i = 0; i < n; i++) if (houd[i]) uit.push(pts[i * 2], pts[i * 2 + 1]);
  return Float32Array.from(uit);
}
