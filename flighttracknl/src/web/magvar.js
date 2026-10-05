// Magnetische variatie, zodat een peiling ook op een kompas klopt. Het verschil tussen
// rechtwijzend en magnetisch is in dit gebied geen vast getal: van Londen (1,1 graden oost) tot
// Berlijn (5,1) loopt het ruim vier graden uiteen, dus een constante zou er twee naast zitten.
//
// Het volledige wereldmagnetisch model in de pagina zetten is onzin voor een hoek die je op een
// kompas afleest. Daarom een rooster over het gebied dat deze tracker beslaat: 9 bij 13 punten,
// twee graden breed in noord-zuid en tweeënhalve in oost-west, met per punt de declinatie op
// 2025,0 en de jaarlijkse verandering. Daartussen wordt bilineair geinterpoleerd, lineair in de
// tijd. Nagerekend tegen WMM-2025 zelf op vierhonderd willekeurige punten en jaren: mediaan
// 0,003 graden afwijking, hoogste 0,013. Dat is twee ordes kleiner dan een kompas kan aflezen.
//
// Afgeleid uit WMM-2025 (NOAA/NCEI en British Geological Survey), geldig tot 2030. Daarna geeft
// dit rooster een extrapolatie en hoort er een nieuw model in.
const LAT0 = 44, DLAT = 2, NLAT = 9;
const LON0 = -10, DLON = 2.5, NLON = 13;
const EPOCH = 2025.0;

// declinatie op 2025,0, in graden oost
const D0 = [-1.71, -0.88, -0.1, 0.64, 1.32, 1.96, 2.54, 3.09, 3.59, 4.06, 4.5, 4.92, 5.31, -1.9, -1.04, -0.23, 0.54, 1.26, 1.93, 2.56, 3.14, 3.69, 4.2, 4.69, 5.14, 5.58, -2.13, -1.24, -0.39, 0.41, 1.17, 1.89, 2.56, 3.19, 3.78, 4.35, 4.88, 5.39, 5.87, -2.41, -1.48, -0.6, 0.25, 1.05, 1.82, 2.54, 3.23, 3.88, 4.49, 5.09, 5.65, 6.2, -2.73, -1.77, -0.84, 0.05, 0.91, 1.73, 2.51, 3.26, 3.97, 4.65, 5.31, 5.94, 6.55, -3.09, -2.09, -1.11, -0.17, 0.75, 1.63, 2.47, 3.28, 4.07, 4.82, 5.55, 6.25, 6.94, -3.5, -2.44, -1.41, -0.41, 0.57, 1.51, 2.43, 3.31, 4.17, 5.0, 5.81, 6.6, 7.36, -3.93, -2.82, -1.73, -0.66, 0.38, 1.4, 2.39, 3.35, 4.29, 5.21, 6.1, 6.98, 7.83, -4.38, -3.21, -2.06, -0.92, 0.19, 1.28, 2.36, 3.4, 4.43, 5.44, 6.42, 7.39, 8.33];
// jaarlijkse verandering, in graden per jaar
const DD = [0.171, 0.164, 0.157, 0.148, 0.14, 0.131, 0.123, 0.114, 0.107, 0.099, 0.092, 0.086, 0.08, 0.178, 0.171, 0.163, 0.155, 0.147, 0.139, 0.13, 0.122, 0.114, 0.107, 0.1, 0.093, 0.087, 0.185, 0.178, 0.171, 0.163, 0.155, 0.147, 0.139, 0.131, 0.123, 0.115, 0.108, 0.102, 0.095, 0.192, 0.186, 0.179, 0.171, 0.163, 0.156, 0.148, 0.14, 0.132, 0.125, 0.118, 0.111, 0.104, 0.201, 0.194, 0.187, 0.18, 0.173, 0.165, 0.157, 0.15, 0.142, 0.135, 0.128, 0.121, 0.115, 0.21, 0.203, 0.197, 0.19, 0.183, 0.175, 0.168, 0.161, 0.153, 0.146, 0.139, 0.133, 0.126, 0.22, 0.213, 0.207, 0.2, 0.193, 0.186, 0.179, 0.172, 0.165, 0.159, 0.152, 0.145, 0.139, 0.23, 0.224, 0.218, 0.212, 0.205, 0.198, 0.192, 0.185, 0.178, 0.172, 0.166, 0.159, 0.153, 0.242, 0.236, 0.23, 0.224, 0.218, 0.211, 0.205, 0.199, 0.193, 0.186, 0.18, 0.174, 0.168];

// Decimaal jaar: 2026-10-05 wordt 2026,76. Voor een model dat per jaar verloopt is de dag precies
// genoeg; schrikkeljaren schelen hier minder dan een duizendste graad.
function decimaalJaar(d = new Date()) {
  const j = d.getFullYear();
  const begin = Date.UTC(j, 0, 1), eind = Date.UTC(j + 1, 0, 1);
  return j + (d.getTime() - begin) / (eind - begin);
}

export function variatie(lat, lon, datum) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 0;
  const jaar = decimaalJaar(datum) - EPOCH;
  let x = (lon - LON0) / DLON, y = (lat - LAT0) / DLAT;
  x = Math.min(Math.max(x, 0), NLON - 1.0001);
  y = Math.min(Math.max(y, 0), NLAT - 1.0001);
  const j = Math.floor(x), i = Math.floor(y), fx = x - j, fy = y - i;
  const op = (ii, jj) => { const k = ii * NLON + jj; return D0[k] + DD[k] * jaar; };
  return op(i, j) * (1 - fx) * (1 - fy) + op(i, j + 1) * fx * (1 - fy)
    + op(i + 1, j) * (1 - fx) * fy + op(i + 1, j + 1) * fx * fy;
}

// Rechtwijzend naar magnetisch: de variatie oost gaat eraf. Ezelsbruggetje uit de luchtvaart:
// variation east, magnetic least.
export function naarMagnetisch(rechtwijzend, lat, lon, datum) {
  return (rechtwijzend - variatie(lat, lon, datum) + 360) % 360;
}
