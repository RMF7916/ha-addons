// Bliksem van Blitzortung.org, alleen om te bekijken.
//
// Blitzortung gaf toestemming voor gebruik in deze tracker onder twee voorwaarden: alleen
// weergave (geen onweerswaarschuwing, geen risicoanalyse) en bronvermelding. De server maakt
// daarom alleen verbinding zolang deze laag aan staat en bekeken wordt (zie blitz_loop in
// server.py), en de bron staat in de bronregel zodra de laag aan is.
//
// Kleur: wit, vervagend naar grijs met de ouderdom. Wit komt verder alleen voor als de zwaarste
// regenlijn en de straalstroom, en de vorm (een klein bliksemsymbool) is anders dan alles wat
// er verder op de kaart staat. Een nieuwe ontlading krijgt de eerste seconden een ring die
// uitdijt, zodat je hem ziet vallen.

export const BLITZ_BEWAAR_MS = 30 * 60 * 1000;
export const BLITZ_PULS_MS = 8000;

// ouderdom -> [helderheid 0..1, dekking 0..1]; zes treden zodat de plot per trede één pad tekent
export const BLITZ_TREDEN = [
  { tot: 60e3, grijs: 255, a: 1.0 },
  { tot: 3 * 60e3, grijs: 240, a: 0.9 },
  { tot: 6 * 60e3, grijs: 225, a: 0.75 },
  { tot: 12 * 60e3, grijs: 205, a: 0.6 },
  { tot: 20 * 60e3, grijs: 185, a: 0.45 },
  { tot: Infinity, grijs: 165, a: 0.32 },
];
export function blitzTrede(oud) {
  let k = 0;
  while (oud >= BLITZ_TREDEN[k].tot) k++;
  return k;
}

// Klein bliksemsymbool rond (0,0), ongeveer 10 beeldpunten hoog, als pad voor de radarplot.
export function bliksemPad(p, x, y, s = 1) {
  p.moveTo(x + 1.6 * s, y - 5 * s);
  p.lineTo(x - 2.2 * s, y + 0.6 * s);
  p.lineTo(x + 0.2 * s, y + 0.6 * s);
  p.lineTo(x - 1.6 * s, y + 5 * s);
  p.lineTo(x + 2.6 * s, y - 1.0 * s);
  p.lineTo(x + 0.2 * s, y - 1.0 * s);
  p.closePath();
}

// ---------------------------------------------------------------- 3D

// Ontladingen als bliksemsymbooltjes op de grond, met een vaste schermgrootte; een verse
// ontlading krijgt ook een flits van het wolkendek naar de grond.
export function bliksem3D({ THREE, scene, toXZ, wolkY }) {
  const MAX = 4000;
  const doek = document.createElement('canvas');
  doek.width = doek.height = 64;
  const c = doek.getContext('2d');
  c.fillStyle = '#fff';
  const p = new Path2D();
  bliksemPad(p, 32, 32, 5.6);
  c.fill(p);
  const tex = new THREE.CanvasTexture(doek);
  tex.colorSpace = THREE.SRGBColorSpace;

  const pos = new Float32Array(MAX * 3), kl = new Float32Array(MAX * 4);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(kl, 4).setUsage(THREE.DynamicDrawUsage));
  g.setDrawRange(0, 0);
  const punten = new THREE.Points(g, new THREE.PointsMaterial({
    map: tex, size: 14, sizeAttenuation: false, vertexColors: true, transparent: true,
    depthWrite: false, depthTest: false, alphaTest: 0.02,
  }));
  punten.frustumCulled = false;
  punten.renderOrder = -37;                 // boven regen en wind, onder het verkeer

  const FLITS = 200;
  const fpos = new Float32Array(FLITS * 2 * 3), fkl = new Float32Array(FLITS * 2 * 4);
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(fpos, 3).setUsage(THREE.DynamicDrawUsage));
  fg.setAttribute('color', new THREE.BufferAttribute(fkl, 4).setUsage(THREE.DynamicDrawUsage));
  fg.setDrawRange(0, 0);
  const flitsen = new THREE.LineSegments(fg, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, depthTest: false,
  }));
  flitsen.frustumCulled = false;
  flitsen.renderOrder = -37;
  scene.add(punten, flitsen);

  let lijst = [], aan = false;
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };

  function bouw() {
    punten.visible = flitsen.visible = aan;
    if (!aan) return;
    const nu = Date.now();
    let n = 0, f = 0;
    for (let i = lijst.length - 1; i >= 0 && n < MAX; i--) {
      const [t, lat, lon] = lijst[i];
      const oud = nu - t;
      if (oud > BLITZ_BEWAAR_MS) break;
      const tr = BLITZ_TREDEN[blitzTrede(oud)], gr = lin(tr.grijs);
      const [x, z] = toXZ(lat, lon);
      pos[n * 3] = x; pos[n * 3 + 1] = 0.02; pos[n * 3 + 2] = z;
      kl.set([gr, gr, gr, tr.a], n * 4);
      n++;
      if (oud < BLITZ_PULS_MS && f < FLITS) {     // flits: wolkendek -> grond, vervaagt in 8 s
        const a = 1 - oud / BLITZ_PULS_MS;
        fpos.set([x, wolkY(x, z), z, x, 0.02, z], f * 6);
        fkl.set([1, 1, 1, a * 0.5, 1, 1, 1, a], f * 8);
        f++;
      }
    }
    g.setDrawRange(0, n); g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    fg.setDrawRange(0, f * 2); fg.attributes.position.needsUpdate = true; fg.attributes.color.needsUpdate = true;
  }

  return {
    zet(nieuw, a) { lijst = nieuw; aan = a; bouw(); },
    tik() { if (aan) bouw(); },
  };
}
