// Wachtcircuits (holdings) voor Schiphol.
// Bron: AIP Netherlands, AD 2 EHAM STAR-1 (19 MAR 2026, AIRAC AMDT 03/2026), eAIP LVNL.
// Koersen op de kaart zijn magnetisch; de kaart geeft een gemiddelde variatie van 2° E (2025).
// Coördinaten van de punten gecontroleerd tegen dezelfde kaart.
// Bij een nieuwe AIRAC: STAR-kaart naast deze lijst leggen en bijwerken.

export const MAG_VAR = 2;                // ° oost: ware koers = magnetische koers + 2

export const HOLDINGS = [
  // inbound = magnetische koers van het inbound been (naar het punt toe)
  // turn: 'R' = rechtsom (standaard), 'L' = linksom; min = minuten per been; kias = maximale snelheid
  { fix: 'ARTIP', lat: 52.511111, lon: 5.569167, inbound: 251, turn: 'R', min: 1, kias: 250,
    minFl: 70, maxFl: 100, label: 'ARTIP 070-100' },
  { fix: 'SUGOL', lat: 52.525556, lon: 3.967222, inbound: 109, turn: 'R', min: 1, kias: 250,
    minFl: 70, maxFl: 100, label: 'SUGOL 070-100' },
  { fix: 'RIVER', lat: 51.912778, lon: 4.132500, inbound: 40, turn: 'R', min: 1, kias: 250,
    minFl: 70, maxFl: 100, label: 'RIVER 070-100' },
  // NARSO: alleen op aanwijzing van de verkeersleiding (gestippeld op de kaart), FL200, max 220 KIAS
  { fix: 'NARSO', lat: 52.715278, lon: 6.709444, inbound: 354, turn: 'L', min: 1, kias: 220,
    minFl: 200, maxFl: 200, label: 'NARSO 200', dashed: true },
];

// Racetrack als lijst [lat, lon], beginnend aan het begin van het inbound been en eindigend
// net voor dat begin. Beenlengte = snelheid x tijd; bocht = standaardbocht (180° in 1 minuut).
export function holdPattern(h) {
  const leg = h.kias / 60 * h.min;                     // NM
  const r = h.kias / 60 / Math.PI;                     // NM, halve cirkel in 1 minuut
  const crs = (h.inbound + MAG_VAR) * Math.PI / 180;   // ware koers
  const u = [Math.sin(crs), Math.cos(crs)];            // [oost, noord], richting inbound
  const side = h.turn === 'L' ? -1 : 1;
  const s = [Math.cos(crs) * side, -Math.sin(crs) * side];   // naar de wachtkant
  const pts = [];
  const add = (e, n) => pts.push([h.lat + n / 60, h.lon + e / (60 * Math.cos(h.lat * Math.PI / 180))]);
  add(-u[0] * leg, -u[1] * leg);                       // begin inbound been
  const N = 14;
  for (let i = 0; i <= N; i++) {                       // bocht na het punt
    const f = Math.PI * i / N;
    add(r * s[0] - r * s[0] * Math.cos(f) + r * u[0] * Math.sin(f),
        r * s[1] - r * s[1] * Math.cos(f) + r * u[1] * Math.sin(f));
  }
  for (let i = 0; i <= N; i++) {                       // outbound been + bocht terug
    const f = Math.PI * i / N;
    const cx = r * s[0] - u[0] * leg, cy = r * s[1] - u[1] * leg;
    add(cx + r * s[0] * Math.cos(f) - r * u[0] * Math.sin(f),
        cy + r * s[1] * Math.cos(f) - r * u[1] * Math.sin(f));
  }
  return pts;
}
