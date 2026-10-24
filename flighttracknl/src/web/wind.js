// Wind als stroming over de kaart, zoals Windy.
//
// De server haalt per uur een raster van Open-Meteo op (zie weer_wind in server.py): per laag,
// per uur, u en v in knopen op een regelmatig raster rond het middelpunt. u wijst naar het
// oosten, v naar het noorden: de richting waar de lucht heen gaat. Hier wordt dat veld bilineair
// geïnterpoleerd in de ruimte en lineair tussen de uren, zodat de stroming niet op het hele uur
// verspringt.
//
// Twee tekenaars, met dezelfde opbouw: deeltjes die met de wind meedrijven, een paar seconden
// leven en een korte, vervagende staart achterlaten.
//   - Radarplot: een eigen doorzichtige laag boven de plot. De plot zelf ververst rustig (vijf
//     keer per seconde) en dat is te schokkerig voor stroming; deze laag loopt mee met het scherm.
//     De strepen zijn licht en neutraal van kleur en worden opgeteld bij wat eronder ligt (CSS
//     mix-blend-mode: screen), zodat een toestel zijn eigen kleur houdt en nooit afgedekt wordt.
//   - 3D: lijnstukken op de hoogte van de gekozen laag, onder het verkeer getekend. De snelheid
//     schaalt met de afstand van de camera, zoals bij Windy: ingezoomd blijft het rustig te volgen.
//
// De snelheid is beeldsnelheid, geen echte snelheid: 30 kn wordt zo'n 45 beeldpunten per seconde.
// Wat telt is de verhouding: een straalstroom van 130 kn trekt zichtbaar harder dan de grondwind.

export const WIND_LAGEN = ['grond', 'FL050', 'FL100', 'FL180', 'FL300', 'FL390'];

export function windVeld(d) {
  if (!d || !d.lagen || !d.nlat || !d.nlon) return null;
  const { lat0, lon0, dlat, dlon, nlat, nlon } = d;
  const uren = (d.uren || []).map(t => Date.parse(t));
  return {
    ft: k => (d.lagen[k] ? d.lagen[k].ft : null),
    heeft: k => !!d.lagen[k],
    bijgewerkt: d.bijgewerkt || 0,
    // [u, v] in knopen op lat/lon voor laag k op tijdstip t (ms), of null buiten het raster
    monster(lat, lon, k, t, uit) {
      const L = d.lagen[k];
      if (!L || !uren.length) return null;
      const fy = (lat - lat0) / dlat, fx = (lon - lon0) / dlon;
      if (!(fx >= 0 && fy >= 0 && fx <= nlon - 1 && fy <= nlat - 1)) return null;
      const x0 = Math.min(nlon - 2, Math.floor(fx)), y0 = Math.min(nlat - 2, Math.floor(fy));
      const tx = fx - x0, ty = fy - y0;
      // uur: het laatste dat al begonnen is, en het volgende
      let h = 0;
      while (h < uren.length - 1 && uren[h + 1] <= t) h++;
      const h1 = Math.min(uren.length - 1, h + 1);
      const th = h1 > h ? Math.max(0, Math.min(1, (t - uren[h]) / (uren[h1] - uren[h]))) : 0;
      const i00 = y0 * nlon + x0, i01 = i00 + 1, i10 = i00 + nlon, i11 = i10 + 1;
      const bi = a => (a[i00] * (1 - tx) + a[i01] * tx) * (1 - ty) + (a[i10] * (1 - tx) + a[i11] * tx) * ty;
      const ua = L.u[h], va = L.v[h], ub = L.u[h1], vb = L.v[h1];
      const u = bi(ua) * (1 - th) + bi(ub) * th;
      const v = bi(va) * (1 - th) + bi(vb) * th;
      const o = uit || [0, 0];
      o[0] = u; o[1] = v;
      return o;
    },
  };
}

// ---------------------------------------------------------------- radarplot

const PX_PER_KN = 1.5;          // beeldpunten per seconde per knoop
const STAART_S = 0.9;           // zo lang blijft een streep zichtbaar (tijdconstante van het vervagen)
const LEVEN_MIN = 2.5, LEVEN_MAX = 6;
// vier helderheden, naar snelheid; licht en koel, geen kleur die het verkeer gebruikt
const TREDEN = [[12, 0.22], [25, 0.32], [45, 0.42], [Infinity, 0.50]];

export function windPlot({ doek, naarLL, beeldSleutel }) {
  const ctx = doek.getContext('2d');
  let veld = null, laag = 'grond', aan = false, loopt = false;
  let W = 0, H = 0, dpr = 1, laatst = 0, sleutel = '';
  let px = new Float32Array(0), py = px, leeft = px, max = px;
  const uv = [0, 0];

  function maat() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    const w = doek.clientWidth, h = doek.clientHeight;
    if (w === W && h === H && doek.width === Math.round(w * dpr)) return false;
    W = w; H = h;
    doek.width = Math.round(W * dpr); doek.height = Math.round(H * dpr);
    const n = Math.max(200, Math.min(1800, Math.round(W * H / 2400)));
    px = new Float32Array(n); py = new Float32Array(n); leeft = new Float32Array(n); max = new Float32Array(n);
    for (let i = 0; i < n; i++) nieuw(i, true);
    return true;
  }
  function nieuw(i, verspreid) {
    px[i] = Math.random() * W; py[i] = Math.random() * H;
    max[i] = LEVEN_MIN + Math.random() * (LEVEN_MAX - LEVEN_MIN);
    leeft[i] = verspreid ? Math.random() * max[i] : 0;   // niet allemaal tegelijk opnieuw
  }
  function wis() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, doek.width, doek.height);
  }

  function stap(nu) {
    if (!aan || !veld || !veld.heeft(laag) || doek.hidden) { loopt = false; wis(); return; }
    requestAnimationFrame(stap);
    const dt = Math.min(0.1, laatst ? (nu - laatst) / 1000 : 0.016);
    laatst = nu;
    if (maat()) wis();
    const s = beeldSleutel();
    if (s !== sleutel) { sleutel = s; wis(); }       // geschoven of gezoomd: de staarten kloppen niet meer
    // vervagen: een deel van wat er staat weghalen, naar tijd en niet naar beeldsnelheid
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${(1 - Math.exp(-dt / STAART_S * 2.2)).toFixed(4)})`;
    ctx.fillRect(0, 0, doek.width, doek.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    const t = Date.now();
    const paden = TREDEN.map(() => new Path2D());
    for (let i = 0; i < px.length; i++) {
      leeft[i] += dt;
      if (leeft[i] > max[i]) { nieuw(i, false); continue; }
      const [lat, lon] = naarLL(px[i], py[i]);
      const w = veld.monster(lat, lon, laag, t, uv);
      if (!w) { nieuw(i, false); continue; }
      const nx = px[i] + w[0] * PX_PER_KN * dt, ny = py[i] - w[1] * PX_PER_KN * dt;
      if (nx < 0 || ny < 0 || nx > W || ny > H) { nieuw(i, false); continue; }
      const kn = Math.hypot(w[0], w[1]);
      let k = 0;
      while (kn >= TREDEN[k][0]) k++;
      paden[k].moveTo(px[i], py[i]); paden[k].lineTo(nx, ny);
      px[i] = nx; py[i] = ny;
    }
    for (let k = 0; k < TREDEN.length; k++) {
      ctx.strokeStyle = `rgba(225,235,248,${TREDEN[k][1]})`;
      ctx.stroke(paden[k]);
    }
  }
  function start() {
    if (loopt || !aan) return;
    loopt = true; laatst = 0;
    requestAnimationFrame(stap);
  }
  return {
    zet({ data, laag: l, aan: a }) {
      if (data !== undefined) veld = data;
      if (l !== undefined && l !== laag) { laag = l; wis(); }
      if (a !== undefined) aan = a;
      doek.hidden = !aan;
      if (aan) start(); else wis();
    },
  };
}

// ---------------------------------------------------------------- 3D

const N3 = 1800, K3 = 12, STAP3 = 0.07;   // deeltjes, punten per staart, seconden per staartpunt
const KMS_PER_KN_PER_KM = 0.0007;          // beeldsnelheid: km/s per knoop per km camera-afstand

export function wind3D({ THREE, scene, toLat, toLon, FT, exag, doel, afstand }) {
  const nSeg = N3 * (K3 - 1);
  const pos = new Float32Array(nSeg * 2 * 3), kleur = new Float32Array(nSeg * 2 * 4);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(kleur, 4).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false,
                                            depthTest: false, fog: true });
  const lijnen = new THREE.LineSegments(g, mat);
  lijnen.frustumCulled = false;
  lijnen.renderOrder = -38;                 // boven de regen, onder het verkeer
  lijnen.visible = false;
  scene.add(lijnen);
  const hx = new Float32Array(N3 * K3), hz = new Float32Array(N3 * K3);   // staart, nieuwste vooraan
  const leeft = new Float32Array(N3), max = new Float32Array(N3), kn = new Float32Array(N3);
  const x = new Float32Array(N3), z = new Float32Array(N3);
  let veld = null, laag = 'grond', aan = false, tel = 0;
  const uv = [0, 0];

  function nieuw(i, verspreid) {
    const d = doel(), r = afstand() * 1.4 * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
    x[i] = d.x + Math.cos(a) * r; z[i] = d.z + Math.sin(a) * r;
    for (let k = 0; k < K3; k++) { hx[i * K3 + k] = x[i]; hz[i * K3 + k] = z[i]; }
    max[i] = LEVEN_MIN + Math.random() * (LEVEN_MAX - LEVEN_MIN);
    leeft[i] = verspreid ? Math.random() * max[i] : 0;
  }

  return {
    zet({ data, laag: l, aan: a }) {
      if (data !== undefined) veld = data;
      if (l !== undefined) laag = l;
      if (a !== undefined) aan = a;
      const zicht = aan && veld && veld.heeft(laag);
      if (zicht && !lijnen.visible) for (let i = 0; i < N3; i++) nieuw(i, true);
      lijnen.visible = !!zicht;
    },
    tik(dt) {
      if (!lijnen.visible) return;
      dt = Math.min(0.1, dt);
      const t = Date.now(), d = doel(), rd = afstand(), rmax = rd * 1.6;
      const y = (veld.ft(laag) || 0) * FT * exag();
      const snel = KMS_PER_KN_PER_KM * rd;
      tel += dt;
      const schuif = tel >= STAP3;
      if (schuif) tel = 0;
      for (let i = 0; i < N3; i++) {
        leeft[i] += dt;
        const w = leeft[i] <= max[i] && veld.monster(toLat(z[i]), toLon(x[i]), laag, t, uv);
        if (!w || Math.hypot(x[i] - d.x, z[i] - d.z) > rmax) { nieuw(i, false); kn[i] = 0; continue; }
        x[i] += w[0] * snel * dt; z[i] -= w[1] * snel * dt;   // z wijst naar het zuiden
        kn[i] = Math.hypot(w[0], w[1]);
        const o = i * K3;
        if (schuif) for (let k = K3 - 1; k > 0; k--) { hx[o + k] = hx[o + k - 1]; hz[o + k] = hz[o + k - 1]; }
        hx[o] = x[i]; hz[o] = z[i];
      }
      // naar de buffers: per deeltje K3-1 stukken, de staart loopt uit naar doorzichtig
      let p = 0, c = 0;
      for (let i = 0; i < N3; i++) {
        const o = i * K3;
        const leven = Math.min(1, leeft[i] / 0.6, (max[i] - leeft[i]) / 0.6);  // zacht op en af
        let a0 = 0.62;
        for (const [grens, a] of TREDEN) if (kn[i] < grens) { a0 = a + 0.1; break; }
        for (let k = 0; k < K3 - 1; k++) {
          pos[p++] = hx[o + k]; pos[p++] = y; pos[p++] = hz[o + k];
          pos[p++] = hx[o + k + 1]; pos[p++] = y; pos[p++] = hz[o + k + 1];
          const a1 = a0 * leven * (1 - k / (K3 - 1)), a2 = a0 * leven * (1 - (k + 1) / (K3 - 1));
          kleur[c++] = 0.88; kleur[c++] = 0.92; kleur[c++] = 0.97; kleur[c++] = a1;
          kleur[c++] = 0.88; kleur[c++] = 0.92; kleur[c++] = 0.97; kleur[c++] = a2;
        }
      }
      g.attributes.position.needsUpdate = true;
      g.attributes.color.needsUpdate = true;
    },
  };
}
