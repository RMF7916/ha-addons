// Welke baan is in gebruik? Afgeleid uit het verkeer zelf, zonder instellingen.
//
// Per baaneinde (18R, 36L, ...) houden we bij welke toestellen er landden of vertrokken.
// Landen: laag, dalend, recht op de verlengde middellijn vóór de drempel.
// Opstijgen: laag, klimmend, recht voorbij het baaneinde; of snel over de baan zelf.
// Een baan blijft "in gebruik" zolang de laatste beweging recent genoeg is; hoe lang dat is,
// hangt af van hoe druk het er is. Daarna nog een uur "laatst gebruikt", gedimd.

const KM_NM = 1.852;
const MAX_ALT = 3500;          // ft, daarboven telt een toestel niet mee
const MAX_HDG = 15;            // graden afwijking van de baanrichting
const MAX_CROSS = KM_NM;       // km opzij van de middellijn

function hdgDiff(a, b) { return Math.abs(((a - b + 540) % 360) - 180); }

export function createRunwayMonitor(toXZ) {
  let ends = [];
  let source = null;

  function build(airports) {
    if (airports === source) return;
    source = airports;
    ends = [];
    for (const ap of airports || []) {
      for (const r of ap.runways || []) {
        const [ida, idb] = String(r.id || '').split('/');
        const A = toXZ(r.lat1, r.lon1), B = toXZ(r.lat2, r.lon2);
        const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
        if (!(L > 0.4)) continue;                          // geen bruikbare baan
        const make = (id, T, O) => {
          const ux = (O[0] - T[0]) / L, uz = (O[1] - T[1]) / L;
          return {
            ap: ap.icao, id: (id || '').trim() || '?', T, O, ux, uz, L,
            hdg: (Math.atan2(ux, -uz) * 180 / Math.PI + 360) % 360,
            ldg: [], dep: [],
          };
        };
        ends.push(make(ida, A, B), make(idb, B, A));
      }
    }
  }

  function note(list, hex, now) {
    for (let i = list.length - 1; i >= 0 && i >= list.length - 8; i--) {
      if (list[i].hex === hex && now - list[i].t < 240) { list[i].t = now; return; }
    }
    list.push({ hex, t: now });
    if (list.length > 24) list.shift();
  }

  function update(aircraft, now) {
    if (!ends.length) return;
    for (const a of aircraft) {
      if (a.lat == null || a.track == null) continue;
      const alt = a.altb ?? a.altg ?? 0;
      if (!a.ground && alt > MAX_ALT) continue;
      if (a.ground && !(a.gs > 60)) continue;             // taxiënd verkeer telt niet
      const [px, pz] = toXZ(a.lat, a.lon);
      // per soort beweging alleen de baan waar het toestel het dichtst op de middellijn zit,
      // anders telt verkeer naar een baan ook voor de parallelle baan ernaast
      let best = null, bestCross = Infinity, bestKind = null;
      for (const e of ends) {
        const rx = px - e.T[0], rz = pz - e.T[1];
        if (rx > 30 || rx < -30 || rz > 30 || rz < -30) continue;
        if (hdgDiff(a.track, e.hdg) > MAX_HDG) continue;
        const along = rx * e.ux + rz * e.uz;
        const cross = Math.abs(rx * e.uz - rz * e.ux);
        let kind = null;
        if (a.ground) {
          if (along > 0 && along < e.L && cross < 0.12) kind = 'dep';
        } else if (cross < MAX_CROSS) {
          if (a.vr < -150 && along < 0.5 && along > -12 * KM_NM) kind = 'ldg';
          else if (a.vr > 150 && along > e.L - 0.8 && along < e.L + 5 * KM_NM) kind = 'dep';
        }
        if (kind && cross < bestCross) { best = e; bestCross = cross; bestKind = kind; }
      }
      if (best) note(best[bestKind], a.hex, now);
    }
  }

  // Hoe lang een baan in gebruik blijft: twee keer de tijd tussen bewegingen, 10 tot 60 minuten.
  function hold(list) {
    if (list.length < 2) return 600;
    const gap = (list[list.length - 1].t - list[0].t) / (list.length - 1);
    return Math.max(600, Math.min(3600, 2 * gap));
  }

  function state(list, now) {
    if (!list.length) return null;
    const age = now - list[list.length - 1].t;
    if (age < hold(list)) return 'active';
    if (age < 3600) return 'recent';
    return null;
  }

  return { build, update, state, ends: () => ends };
}
