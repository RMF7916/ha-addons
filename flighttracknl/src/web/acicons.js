// Toestelpictogrammen voor de RadarPlot: de set van ADS-B Radar, in onze kleuren.
//
// Dit zijn tweeënveertig losse SVG-tekeningen in web/icons/, allemaal 512 bij 512 met de neus
// omhoog. Ze worden niet opnieuw getekend maar gebruikt zoals ze zijn; alleen de kleur komt van
// ons: het pictogram wordt één keer per kleur op een eigen vlak gezet en daar vlak doorgekleurd,
// zodat het de kleur van de soort krijgt die wij al hadden (lijn, vracht, militair, hefschroef,
// klein, onbekend) in plaats van de kleur die de tekening zelf meebrengt.
//
// Herkomst en voorwaarde. De tekeningen zijn van ADS-B Radar for macOS en zijn vrij te gebruiken,
// ook commercieel, op één voorwaarde: een verwijzing terug naar hen, ergens in het project, op de
// site of in de documentatie. Die staat in LICENSES.md bij de add-on en in de bronnenlijst achter
// de "i" onder de kaart. Haal je deze tekeningen weg, haal dan ook die twee regels weg; laat je
// ze staan, laat dan ook de verwijzing staan.
//
//   Icons by ADS-B Radar for macOS - https://adsb-radar.com
//   https://apps.apple.com/app/id1538149835
//
// De vormen in acvorm.js blijven ernaast bestaan: die zijn van onszelf, zijn driedimensionaal en
// doen de 3D-weergave. Deze set is plat en doet de RadarPlot.

export const ICOON_NAMEN = [
  'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'b0', 'b1', 'b2', 'b3', 'b4', 'c0',
  'f5', 'f11', 'f15', 'a320', 'a330', 'a340', 'a380', 'b737', 'b747', 'b767', 'b777', 'b787',
  'c130', 'cessna', 'crjx', 'dh8a', 'e195', 'erj', 'f100', 'fa7x', 'glf5', 'learjet', 'md11',
  'beechcraft', 'tiltrotorcraft', 'heavyfreighter', 'amphibian', 'fighter',
];

// Hoe groot elk pictogram op het scherm staat ten opzichte van groot verkeer (1,00). De
// tekeningen vullen allemaal hun eigen vierkant -- gemeten op een vak van 200 bij 200 raken
// tweeëndertig van de tweeënveertig minstens één zijde volledig, en de Cessna is met 200 zelfs
// breder dan de 747 met 170 -- dus zonder deze tabel zou een lesvlieger even groot op de kaart
// staan als een A380 en zegt de vorm wel iets maar de omvang niets.
//
// Drie klassen, geen veertien losse waarden. Dat is een keuze over wat de maat moet zeggen.
// De maat draagt namelijk twee dingen tegelijk: het type en, sinds de hoogteschaal in radar.js,
// de vlieghoogte. Stonden alle rompen op hun eigen waarde, dan won het type van de hoogte en
// stond een 747 op het platform groter dan een E175 op FL350 -- dan is de maat geen antwoord meer
// op "wie zit er hoog". Met drie klassen is de typeverhouding 1,8 tegen 1,5 voor de hoogte, en
// binnen het grote verkeer, dat het grootste deel van het beeld is, varieert alleen de hoogte nog.
//
//   1,00  groot verkeer: alle lijn- en vrachtvluchten, van een E175 tot een A380, en het grote
//         militaire werk (transport, tanker, AWACS). Een verkeersvliegtuig is een
//         verkeersvliegtuig; de romplengte is op deze schaal niet wat je wilt aflezen.
//   0,68  licht motorverkeer, zakelijk straalverkeer en straaljagers. Klein genoeg om op te
//         vallen tussen het lijnverkeer, groot genoeg om op tien beeldpunten nog een vorm te zijn.
//   0,55  zweef, ballon, parachute, ultralicht, drone, hefschroef en grondverkeer.
const GROOT = 1, LICHT = 0.68, KLEIN = 0.55;
export const ICOON_MAAT = {
  // groot verkeer
  a320: GROOT, a330: GROOT, a340: GROOT, a380: GROOT, b737: GROOT, b747: GROOT, b767: GROOT,
  b777: GROOT, b787: GROOT, md11: GROOT, e195: GROOT, erj: GROOT, crjx: GROOT, f100: GROOT,
  dh8a: GROOT, c130: GROOT, heavyfreighter: GROOT, a3: GROOT, a4: GROOT, a5: GROOT,
  // licht motorverkeer, zakelijk straalverkeer, straaljagers
  cessna: LICHT, beechcraft: LICHT, learjet: LICHT, glf5: LICHT, fa7x: LICHT, fighter: LICHT,
  amphibian: LICHT, tiltrotorcraft: LICHT, a0: LICHT, a1: LICHT, a2: LICHT, a6: LICHT, f5: LICHT,
  // zweef, ballon, parachute, ultralicht, drone, hefschroef, grondverkeer
  b0: KLEIN, b1: KLEIN, b2: KLEIN, b3: KLEIN, b4: KLEIN, a7: KLEIN, c0: KLEIN,
  f11: KLEIN, f15: KLEIN,
};

// Typecode naar pictogram, in volgorde: wat hoger staat wint. De typecode is hard -- B744 is een
// 747 en niets anders -- dus die gaat vóór de categorie die het toestel over zichzelf uitzendt.
const TYPE_ICOON = [
  [/^(A124|IL76|IL86|AN12|AN22|AN24|AN26|C5M?$|C17$)/, 'heavyfreighter'],
  [/^(F1[4-8]|F2$|F22|F35|F5$|F4$|EUFI|TOR|GR4|JAS3|MIG|SU2[2-7]|SU3[0-5]|A10|AV8B|HAWK|M346|L39|T38|RFAL|T6$|PC21|PC9)/, 'fighter'],
  [/^(V22|AW60|BA60)/, 'tiltrotorcraft'],
  [/^(CL2T|CL41|PBY|DHC2|DHC3|BE18|C208AM|AT8T)/, 'amphibian'],
  [/^A38/, 'a380'],
  [/^A34/, 'a340'],
  [/^(A33|A35|A30|A310|A3ST)/, 'a330'],
  [/^(A31[89]|A32|A20N|A21N|A19N|A318|A319)/, 'a320'],
  [/^B74/, 'b747'],
  [/^B77/, 'b777'],
  [/^B78/, 'b787'],
  [/^(B76|B75)/, 'b767'],
  [/^(B73|B3[789]M|BCS|A220)/, 'b737'],
  [/^(MD1|DC10|L101|MD8|MD9|B71|B72)/, 'md11'],
  [/^(C130|A400|C27|C295|CN35|AN32)/, 'c130'],
  [/^CRJ/, 'crjx'],
  [/^(DH8|AT4|AT5|AT7|SF34|D228|D328|SW4|JS3|JS4|E110|E120|B190|L410|DHC6|DHC7|SB20)/, 'dh8a'],
  [/^(E19|E29|E17|E7[0-9]|E75|E190|E195)/, 'e195'],
  [/^(E1[0-4]|E13|E14|E45|E135|E145)/, 'erj'],
  [/^(F70$|F100$|RJ[0-9]{2}|BA11|SU95|YK4)/, 'f100'],
  [/^(FA[0-9]|F2TH|F900|F7X|FA7X|F2000)/, 'fa7x'],
  [/^(GLF[0-9]|GL[0-9]T|GLEX|G150$|G200$|G250$|G280$|GALX|CL3|CL6|C68|C75|ASTR|E35)/, 'glf5'],
  [/^(LJ[0-9]|C25|C51|C52|C55|C56|PC24|E55|E50|BE40|H25|C50)/, 'learjet'],
  [/^(BE[0-9]|B35[0-9]|B36|B58|B20|PA3|PA4|C4[0-9]{2}|MU2|P180|PC12|PC6|TBM|C208|KODI|P68|DA62|F406)/, 'beechcraft'],
  [/^(C1[0-9]{2}|C2[0-9]{2}|C3[0-9]{2}|C8[0-9]|P28|P32|PA1|PA2|DA[0-9]|DV[0-9]|DR[0-9]|SR2|M20|RV[0-9]|AA5|AT3|TB[0-9]|TOBA|C42|EFOX|FDCT|ULAC|SIRA|SKRA|RF[0-9]|G109|G115|S22|HUSK|CH7|J3$|SAVG|VL3|WT9|CAP[0-9]|YAK)/, 'cessna'],
  // De staart van de lichte luchtvaart. Deze types melden zich vaak als A3 (groot) terwijl het
  // clubtoestellen zijn; zonder deze regel kreeg een Robin of een Chipmunk het silhouet van een
  // verkeersvliegtuig. Gemeten in een momentopname van 1280 toestellen: zestig stuks.
  [/^(DHC1|GA7|HR[0-9]{2}|CRUZ|AC1[0-9]|D1[0-9]{2}|EUPA|TL[0-9]{2}|NNJA|S10S|DIMO|TFUN|SF2[0-9]|PIAT|SPIT|LGEZ|GLAS|FK[0-9]{1,2}|P200[0-9]|K100|TAMP|SUBA|BT36|PTS2)/, 'cessna'],
  [/^(GLID|AS[0-9]{2}$|DG[0-9]|LS[0-9]|VENT|DUOD|ARCU|NIMB|JANU|K21$|K13$|SZD|DISC|STD[0-9])/, 'b1'],
];

// De categorie die het toestel zelf uitzendt, als de typecode niets oplevert. A0 tot A7 is de
// gewichtsklasse en de hefschroef, B0 tot B4 is het lichte spul -- zweef, luchtballon, parachute,
// ultralicht -- en C0 is grondverkeer.
const CAT_ICOON = {
  A0: 'a0', A1: 'a1', A2: 'a2', A3: 'a3', A4: 'a4', A5: 'a5', A6: 'a6', A7: 'a7',
  B0: 'a0', B1: 'b1', B2: 'b2', B3: 'b3', B4: 'b4', B6: 'b0',
  C0: 'c0', C1: 'c0', C2: 'c0', C3: 'c0', C4: 'c0', C5: 'c0', C6: 'c0', C7: 'c0',
};

export function icoonVan(a, soort) {
  if (soort === 'grond') return 'c0';
  const type = (a.type || '').toUpperCase(), cat = a.cat || '';
  if (soort === 'heli' || cat === 'A7') return 'a7';
  for (const [re, naam] of TYPE_ICOON) if (re.test(type)) return naam;
  if (CAT_ICOON[cat]) return CAT_ICOON[cat];
  if (soort === 'sport') return 'b1';
  if (soort === 'klein') return 'cessna';
  if (soort === 'mil') return 'fighter';
  if (soort === 'onbekend') return 'a0';
  return 'a3';
}
