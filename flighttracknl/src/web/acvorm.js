// ------------------------------------------------------------ aircraft model
// Elk toestel krijgt zijn eigen silhouet in bovenaanzicht, zoals een tracker dat doet: je ziet
// aan de omtrek wat er vliegt voordat je het label leest. Een viermotorige is langer en heeft
// vier gondels, een turboprop heeft rechte vleugels, een straaljager is een driehoek.
//
// De vorm staat los van de kleur. De kleur zegt wát het is -- lijnvlucht, vracht, militair,
// hefschroef, klein, onbekend -- en die indeling bestond al; de vorm zegt hoe het eruitziet. Een
// vrachttoestel is dus een oranje 747-silhouet en geen apart symbool.
//
// De neus wijst naar -z, de staart naar +z, x is de spanwijdte, y is omhoog. Een vorm bestaat uit
// vlakken in het grondvlak (bovenaanzicht) en eventueel een vin in het middenvlak, zodat het
// toestel ook van opzij nog iets is. Een vlak is bolrond opgeschreven en wordt in driehoeken
// gewaaierd; `spiegel` zet het ook aan de andere kant neer, dus een vleugel schrijf je één keer op.
//
//   maat:    hoe groot dit silhouet staat ten opzichte van een smalle romp (1,0). Een lesvlieger
//            hoort kleiner op het scherm te staan dan een 747, anders zegt de vorm wel iets maar
//            de omvang niets.
//   vlak:    [tint, [[x, z], ...]]        in het grondvlak, y = 0
//   spiegel: [tint, [[x, z], ...]]        idem, en gespiegeld in x
//   vin:     [tint, [[z, y], ...]]        in het middenvlak, x = 0
//
// Tint 1 is de volle kleur; lager is donkerder. Daarmee komt een gondel of een staartvlak los van
// de vleugel te staan zonder dat er een tweede materiaal bij komt.

export const AC_VORM = {
  // Smalle romp met twee motoren onder gepijlde vleugels: 737, A320, de meeste lijnvluchten.
  jet: {
    maat: 1,
    spiegel: [
      [1, [[-0.07, -0.02], [-0.95, 0.40], [-0.95, 0.50], [-0.06, 0.30]]],      // vleugel
      [0.8, [[-0.05, 0.62], [-0.40, 0.82], [-0.40, 0.88], [-0.04, 0.76]]],     // stabilo
      [0.62, [[-0.27, 0.10], [-0.40, 0.14], [-0.40, 0.34], [-0.27, 0.30]]],    // gondel
    ],
    vlak: [[1, [[0, -1], [0.055, -0.88], [0.09, -0.6], [0.09, 0.58], [0.04, 0.97], [-0.04, 0.97], [-0.09, 0.58], [-0.09, -0.6], [-0.055, -0.88]]]],
    vin: [[0.72, [[0.52, 0], [0.95, 0], [0.95, 0.32], [0.84, 0.32]]]],
  },
  // Brede romp, twee grote motoren: 777, 787, A330, A350. Groter en voller dan de smalle romp.
  jet_breed: {
    maat: 1.25,
    spiegel: [
      [1, [[-0.09, -0.06], [-1.12, 0.38], [-1.12, 0.50], [-0.08, 0.32]]],
      [0.8, [[-0.06, 0.60], [-0.48, 0.80], [-0.48, 0.88], [-0.05, 0.74]]],
      [0.62, [[-0.30, 0.06], [-0.46, 0.11], [-0.46, 0.36], [-0.30, 0.31]]],
    ],
    vlak: [[1, [[0, -1.05], [0.07, -0.92], [0.12, -0.58], [0.12, 0.58], [0.05, 1.0], [-0.05, 1.0], [-0.12, 0.58], [-0.12, -0.58], [-0.07, -0.92]]]],
    vin: [[0.72, [[0.52, 0], [1.0, 0], [1.0, 0.38], [0.86, 0.38]]]],
  },
  // Vier motoren: 747, A380, A340, en aan de militaire kant de tankers en de zware transporten.
  jet_vier: {
    maat: 1.4,
    spiegel: [
      [1, [[-0.10, -0.08], [-1.20, 0.36], [-1.20, 0.50], [-0.09, 0.32]]],
      [0.8, [[-0.06, 0.60], [-0.50, 0.80], [-0.50, 0.88], [-0.05, 0.74]]],
      [0.62, [[-0.30, 0.04], [-0.44, 0.09], [-0.44, 0.32], [-0.30, 0.27]]],    // binnenste gondel
      [0.62, [[-0.62, 0.16], [-0.76, 0.20], [-0.76, 0.40], [-0.62, 0.36]]],    // buitenste gondel
    ],
    vlak: [[1, [[0, -1.1], [0.075, -0.96], [0.13, -0.6], [0.13, 0.58], [0.05, 1.02], [-0.05, 1.02], [-0.13, 0.58], [-0.13, -0.6], [-0.075, -0.96]]]],
    vin: [[0.72, [[0.50, 0], [1.02, 0], [1.02, 0.40], [0.88, 0.40]]]],
  },
  // Regionale straal: korte romp, motoren achter op de romp, staart in T-vorm. CRJ, Embraer.
  regio: {
    maat: 0.82,
    spiegel: [
      [1, [[-0.07, 0.02], [-0.80, 0.36], [-0.80, 0.46], [-0.06, 0.28]]],
      [0.8, [[-0.04, 0.80], [-0.34, 0.80], [-0.34, 0.88], [-0.04, 0.88]]],     // T-staart, recht
      [0.62, [[-0.10, 0.44], [-0.22, 0.46], [-0.22, 0.68], [-0.10, 0.66]]],    // gondel op de romp
    ],
    vlak: [[1, [[0, -0.92], [0.05, -0.8], [0.08, -0.54], [0.08, 0.56], [0.04, 0.92], [-0.04, 0.92], [-0.08, 0.56], [-0.08, -0.54], [-0.05, -0.8]]]],
    vin: [[0.72, [[0.56, 0], [0.92, 0], [0.92, 0.40], [0.84, 0.40]]]],
  },
  // Turboprop: rechte vleugel, twee gondels met een schijf ervoor. ATR, Dash 8, Twin Otter.
  prop: {
    maat: 0.8,
    spiegel: [
      [1, [[-0.07, 0.04], [-0.92, 0.06], [-0.92, 0.22], [-0.06, 0.28]]],
      [0.8, [[-0.04, 0.68], [-0.34, 0.70], [-0.34, 0.78], [-0.04, 0.80]]],
      [0.62, [[-0.28, -0.18], [-0.40, -0.18], [-0.40, 0.26], [-0.28, 0.26]]],  // gondel
      [0.45, [[-0.28, -0.30], [-0.40, -0.30], [-0.40, -0.22], [-0.28, -0.22]]], // schroefschijf
    ],
    vlak: [[1, [[0, -0.86], [0.05, -0.76], [0.08, -0.52], [0.08, 0.56], [0.04, 0.88], [-0.04, 0.88], [-0.08, 0.56], [-0.08, -0.52], [-0.05, -0.76]]]],
    vin: [[0.72, [[0.52, 0], [0.88, 0], [0.88, 0.30], [0.80, 0.30]]]],
  },
  // Licht motorvliegtuig: één schroef voor, rechte vleugel. Cessna, Piper, de lesvlieger.
  prop_klein: {
    maat: 0.55,
    spiegel: [
      [1, [[-0.06, -0.12], [-0.78, -0.10], [-0.78, 0.06], [-0.05, 0.14]]],
      [0.8, [[-0.04, 0.56], [-0.28, 0.58], [-0.28, 0.66], [-0.04, 0.68]]],
    ],
    vlak: [
      [1, [[0, -0.72], [0.045, -0.64], [0.07, -0.42], [0.07, 0.44], [0.035, 0.76], [-0.035, 0.76], [-0.07, 0.44], [-0.07, -0.42], [-0.045, -0.64]]],
      [0.45, [[-0.26, -0.78], [0.26, -0.78], [0.26, -0.72], [-0.26, -0.72]]],  // schroefschijf
    ],
    vin: [[0.72, [[0.44, 0], [0.76, 0], [0.76, 0.26], [0.68, 0.26]]]],
  },
  // Hefschroef: rotorschijf van vier bladen met een staartboom. Die leest van bovenaf meteen.
  heli: {
    maat: 0.62,
    vlak: [
      [0.72, [[-0.13, -0.28], [0.13, -0.28], [0.05, 0.95], [-0.05, 0.95]]],   // staartboom
      [0.6, [[-0.18, 0.82], [0.18, 0.82], [0.18, 0.90], [-0.18, 0.90]]],      // staartvlak
    ],
    los: [
      [0, 0.16, 0, -0.9, 0.16, -0.07, -0.9, 0.16, 0.07, 1],                   // rotorbladen
      [0, 0.16, 0, 0.9, 0.16, 0.07, 0.9, 0.16, -0.07, 1],
      [0, 0.16, 0, 0.07, 0.16, -0.9, -0.07, 0.16, -0.9, 1],
      [0, 0.16, 0, -0.07, 0.16, 0.9, 0.07, 0.16, 0.9, 1],
    ],
  },
  // Straaljager: korte brede delta met twee staartvlakken. F-16, F-35, Eurofighter.
  jager: {
    maat: 0.78,
    spiegel: [
      [1, [[-0.04, -0.55], [-0.78, 0.48], [-0.78, 0.60], [-0.05, 0.42]]],
      [0.8, [[-0.08, 0.60], [-0.42, 0.74], [-0.42, 0.82], [-0.07, 0.74]]],
    ],
    vlak: [[1, [[0, -0.98], [0.07, -0.55], [0.09, 0.50], [0.05, 0.86], [-0.05, 0.86], [-0.09, 0.50], [-0.07, -0.55]]]],
    vin: [[0.72, [[0.38, 0], [0.80, 0], [0.74, 0.34], [0.60, 0.34]]]],
  },
  // Zweeftoestel: spanwijdte 3,2 tegen een romp van 1,2. Die verhouding is het hele kenmerk.
  zweef: {
    maat: 0.68,
    spiegel: [[1, [[-0.04, -0.34], [-1.6, 0.10], [-1.6, 0.20], [-0.03, 0.22]]]],
    vlak: [[1, [[0, -0.52], [0.045, -0.3], [0.045, 0.5], [0.02, 0.78], [-0.02, 0.78], [-0.045, 0.5], [-0.045, -0.3]]]],
    vin: [[0.72, [[0.5, 0], [0.78, 0], [0.78, 0.24], [0.72, 0.24]]]],
  },
  // Aan de grond en geen verkeer: een plat vierkantje dat niet doet alsof het vliegt.
  grond: {
    maat: 0.6,
    vlak: [[1, [[-0.35, -0.35], [0.35, -0.35], [0.35, 0.35], [-0.35, 0.35]]]],
  },
  // Richting onbekend: een viervlak, zodat het van elke kant hetzelfde is.
  onbekend: {
    maat: 0.6,
    los: [
      [0, 0.5, 0, -0.4, 0, -0.28, 0.4, 0, -0.28, 1],
      [0, 0.5, 0, 0.4, 0, -0.28, 0, 0, 0.46, 0.8],
      [0, 0.5, 0, 0, 0, 0.46, -0.4, 0, -0.28, 0.66],
      [-0.4, 0, -0.28, 0.4, 0, -0.28, 0, 0, 0.46, 0.72],
    ],
  },
};

export const VORMEN = Object.keys(AC_VORM);

// De maat van een vorm; ontbreekt hij, dan is het er één van een smalle romp.
export const vormMaat = v => AC_VORM[v]?.maat ?? 1;

// Een vorm naar losse driehoeken: [x,y,z, x,y,z, x,y,z, tint] per stuk, zoals de meetkunde ze wil.
export function vormDriehoeken(v) {
  const uit = [];
  const waaier = (tint, punten) => {
    for (let i = 1; i < punten.length - 1; i++) uit.push([...punten[0], ...punten[i], ...punten[i + 1], tint]);
  };
  for (const [tint, p] of v.vlak || []) waaier(tint, p.map(([x, z]) => [x, 0, z]));
  for (const [tint, p] of v.spiegel || []) {
    waaier(tint, p.map(([x, z]) => [x, 0, z]));
    waaier(tint, p.map(([x, z]) => [-x, 0, z]));
  }
  for (const [tint, p] of v.vin || []) waaier(tint, p.map(([z, y]) => [0, y, z]));
  for (const d of v.los || []) uit.push(d);
  return uit;
}

// ------------------------------------------------------------ welke vorm hoort bij welk toestel
//
// De soort (lijn, vracht, mil, heli, klein, sport, grond, onbekend) bepaalt de kleur en is elders
// vastgesteld. Hier komt daar de vorm bij, en die hangt van het toestel af, niet van de soort.
//
// Eerst de typecode, want die is hard: B744 is viermotorig, punt. Staat het type er niet bij, dan
// de ADS-B-categorie, die het toestel zelf uitzendt: A1 licht, A2 klein, A3 groot, A4 zwaar
// zog (757), A5 zwaar, A6 hoge prestatie, A7 hefschroef. Die is grover maar bijna altijd aanwezig
// -- in een momentopname van 3155 toestellen had 91% er een.

// Viermotorig, of in elk geval met vier gondels onder de vleugel: 747, A380, A340, en aan de
// militaire kant de tankers, de AWACS en de zware transporten.
const T_VIER = /^(B74|A38|A34[0-9]|IL76|IL86|IL96|A400|C5M?$|C17$|E3(TF|CF|DF)|K35|VC10|B52)/;
// Brede romp met twee motoren. A31 staat er niet als geheel in: dat zou ook de A318 en de A319
// vangen, en dat zijn smalle rompen. Alleen de A310 en de A300 horen hier.
const T_BREED = /^(B76|B77|B78|A30|A310|A33|A35|MD11|DC10|L101|B74[0-9]SF)/;
// Regionaal en zakelijk straalverkeer: korte romp, motoren achter op de romp, T-staart.
const T_REGIO = /^(CRJ|E1[0-9]{2}|E2[0-9]{2}|E7[0-9]|RJ[0-9]{2}|SU95|F70$|F100$|BA11|YK4|GL[0-9]|GLEX|CL3|CL6|C5[0-9]{2}|C6[0-9]|C7[0-9]{2}|LJ[0-9]|FA[0-9]|F2TH|F900|E5[0-9]|E55|PC24|H25|BE40|ASTR|G150|G280|G2[0-9]{2}|GALX|GLF[0-9])/;
// Schroefvliegtuig met twee motoren onder de vleugel, of een zware enkelmotorige turboprop.
const T_PROP = /^(AT4|AT5|AT7|DH8|SF34|SW4|E110|E120|B190|JS3|JS4|D228|D328|L410|AN2[0-9]|AN12|AN2$|C130|C295|CN35|P180|PC12|PC6|TBM|C208|DHC[67]|BE9|B350|B200|BE20|C425|C441|MU2|PA31|PA34|C310|C340|C402|C404|C414|C421|P68|DA62|F406)/;
// Lichte toestellen: lesvliegers, clubtoestellen en ultralichten. Veel daarvan zenden geen
// categorie uit -- gemeten: van de C172's in beeld had bijna de helft een leeg categorieveld --
// dus die moeten op hun typecode herkend worden en niet op wat ze over zichzelf zeggen.
const T_KLEIN = /^(C1[0-9]{2}|C2[0-9]{2}|C3[0-9]{2}|C8[0-9]|P28|P32|PA1|PA2|PA3|PA4|DA[0-9]|DR[0-9]|SR2|M20|RV[0-9]|AA5|AT3|BE3[0-9]|BE7[0-9]|BE33|BE36|G109|RF[0-9]|S22|TB[0-9]|ULAC|EFOX|FDCT|C42|SIRA|SKRA|KODI|HUSK|CH7|J3$|SAVG|VL3|WT9|AC11|BL8|CAP[0-9]|EV97|P2006|P210|S20[0-9]|YAK)/;
// Straaljagers en lesjagers.
const T_JAGER = /^(F1[4-8]|F2$|F35|F5$|F4$|EUFI|TOR|GR4|JAS3|MIG|SU2[2-7]|SU3[0-5]|A10|AV8B|HAWK|M346|L39|T38|RFAL|S3|T6|PC21|PC9)/;
// Zweeftoestellen.
const T_ZWEEF = /^(GLID|AS[0-9]{2}$|DG[0-9]|LS[0-9]|VENT|DUOD|ARCU|NIMB|JANU|K21$|K13$|SZD|DISC|STD[0-9])/;

export function vormVan(a, soort) {
  if (soort === 'grond') return 'grond';
  if (soort === 'heli') return 'heli';
  const type = (a.type || '').toUpperCase(), cat = a.cat || '';
  if (soort === 'sport') return T_PROP.test(type) ? 'prop' : T_KLEIN.test(type) ? 'prop_klein' : 'zweef';
  // De typecode eerst, want die is hard: B744 is viermotorig, punt.
  if (T_VIER.test(type)) return 'jet_vier';
  if (T_JAGER.test(type)) return 'jager';
  if (T_ZWEEF.test(type)) return 'zweef';
  if (T_PROP.test(type)) return 'prop';
  if (T_KLEIN.test(type)) return 'prop_klein';
  if (T_BREED.test(type)) return 'jet_breed';
  if (T_REGIO.test(type)) return 'regio';
  // Een type dat we niet kennen maar dat met een A of een B begint en op cijfers eindigt, is een
  // verkeersvliegtuig; de rest van de letters zegt niet genoeg om verder te raden.
  if (/^[AB][0-9]/.test(type)) return cat === 'A5' ? 'jet_breed' : 'jet';
  // Geen callsign en geen categorie: dan is het een stip zonder richting. Maar is de typecode er
  // wel, dan weegt die zwaarder dan het ontbreken van de rest -- een B738 is een B738.
  if (soort === 'onbekend') return 'onbekend';
  // Geen bekende typecode: dan maar afgaan op wat het toestel zelf uitzendt. A1 licht,
  // A2 klein, A3 groot, A4 zwaar zog (757), A5 zwaar, A6 hoge prestatie.
  if (soort === 'mil') return cat === 'A5' || cat === 'A4' ? 'jet_vier' : cat === 'A3' ? 'jet' : 'jager';
  if (soort === 'klein') return cat === 'A2' ? 'regio' : 'prop_klein';
  if (cat === 'A5') return 'jet_breed';
  if (cat === 'A4' || cat === 'A3') return 'jet';
  if (cat === 'A2') return 'regio';
  if (cat === 'A1') return 'prop_klein';
  if (cat === 'A6') return 'jager';
  return 'jet';
}
