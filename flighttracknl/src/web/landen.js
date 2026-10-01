// Land van registratie uit het ICAO-adres, met een vlaggetje erbij.
//
// Elk toestel draagt een vast 24-bits adres, en de blokken daarvan zijn per land toegewezen in
// ICAO Annex 10, deel III, hoofdstuk 9. Daar is de tabel hieronder van afgeleid; hij is
// gecontroleerd tegen de openbare tabel van tar1090, die uit diezelfde annex komt. Dit is
// feitelijke toewijzing, geen gok uit de registratie: PH- hoort bij 484000-487FFF en dat verandert
// niet met de verf op de romp.
//
// De vlaggen zijn eenvoudige tekeningen op 9 bij 6, groot genoeg voor een vlaggetje van achttien
// bij twaalf beeldpunten. Wapens en opschriften zitten er niet in -- op die maat zijn ze toch
// onzichtbaar en ze zouden alleen vuil maken. Staat een land er niet bij, dan komt de landcode
// in een vakje; dat zegt evenveel en liegt niet.

const BEREIKEN = [
  [0x004000, 0x0047FF, 'ZW'],   // Zimbabwe
  [0x006000, 0x006FFF, 'MZ'],   // Mozambique
  [0x008000, 0x00FFFF, 'ZA'],   // South Africa
  [0x010000, 0x017FFF, 'EG'],   // Egypt
  [0x018000, 0x01FFFF, 'LY'],   // Libya
  [0x020000, 0x027FFF, 'MA'],   // Morocco
  [0x028000, 0x02FFFF, 'TN'],   // Tunisia
  [0x030000, 0x0307FF, 'BW'],   // Botswana
  [0x032000, 0x032FFF, 'BI'],   // Burundi
  [0x034000, 0x034FFF, 'CM'],   // Cameroon
  [0x035000, 0x0357FF, 'KM'],   // Comoros
  [0x036000, 0x036FFF, 'CG'],   // Republic of the Congo
  [0x038000, 0x038FFF, 'CI'],   // Côte d’Ivoire
  [0x03E000, 0x03EFFF, 'GA'],   // Gabon
  [0x040000, 0x040FFF, 'ET'],   // Ethiopia
  [0x042000, 0x042FFF, 'GQ'],   // Equatorial Guinea
  [0x044000, 0x044FFF, 'GH'],   // Ghana
  [0x046000, 0x046FFF, 'GN'],   // Guinea
  [0x048000, 0x0487FF, 'GW'],   // Guinea-Bissau
  [0x04A000, 0x04A7FF, 'LS'],   // Lesotho
  [0x04C000, 0x04CFFF, 'KE'],   // Kenya
  [0x050000, 0x050FFF, 'LR'],   // Liberia
  [0x054000, 0x054FFF, 'MG'],   // Madagascar
  [0x058000, 0x058FFF, 'MW'],   // Malawi
  [0x05A000, 0x05A7FF, 'MV'],   // Maldives
  [0x05C000, 0x05CFFF, 'ML'],   // Mali
  [0x05E000, 0x05E7FF, 'MR'],   // Mauritania
  [0x060000, 0x0607FF, 'MU'],   // Mauritius
  [0x062000, 0x062FFF, 'NE'],   // Niger
  [0x064000, 0x064FFF, 'NG'],   // Nigeria
  [0x068000, 0x068FFF, 'UG'],   // Uganda
  [0x06A000, 0x06AFFF, 'QA'],   // Qatar
  [0x06C000, 0x06CFFF, 'CF'],   // Central African Republic
  [0x06E000, 0x06EFFF, 'RW'],   // Rwanda
  [0x070000, 0x070FFF, 'SN'],   // Senegal
  [0x074000, 0x0747FF, 'SC'],   // Seychelles
  [0x076000, 0x0767FF, 'SL'],   // Sierra Leone
  [0x078000, 0x078FFF, 'SO'],   // Somalia
  [0x07A000, 0x07A7FF, 'SZ'],   // Eswatini
  [0x07C000, 0x07CFFF, 'SD'],   // Sudan
  [0x080000, 0x080FFF, 'TZ'],   // Tanzania
  [0x084000, 0x084FFF, 'TD'],   // Chad
  [0x088000, 0x088FFF, 'TG'],   // Togo
  [0x08A000, 0x08AFFF, 'ZM'],   // Zambia
  [0x08C000, 0x08CFFF, 'CD'],   // DR Congo
  [0x090000, 0x090FFF, 'AO'],   // Angola
  [0x094000, 0x0947FF, 'BJ'],   // Benin
  [0x096000, 0x0967FF, 'CV'],   // Cabo Verde
  [0x098000, 0x0987FF, 'DJ'],   // Djibouti
  [0x09A000, 0x09AFFF, 'GM'],   // Gambia
  [0x09C000, 0x09CFFF, 'BF'],   // Burkina Faso
  [0x09E000, 0x09E7FF, 'ST'],   // São Tomé and Príncipe
  [0x0A0000, 0x0A7FFF, 'DZ'],   // Algeria
  [0x0A8000, 0x0A8FFF, 'BS'],   // Bahamas
  [0x0AA000, 0x0AA7FF, 'BB'],   // Barbados
  [0x0AB000, 0x0AB7FF, 'BZ'],   // Belize
  [0x0AC000, 0x0ADFFF, 'CO'],   // Colombia
  [0x0AE000, 0x0AEFFF, 'CR'],   // Costa Rica
  [0x0B0000, 0x0B0FFF, 'CU'],   // Cuba
  [0x0B2000, 0x0B2FFF, 'SV'],   // El Salvador
  [0x0B4000, 0x0B4FFF, 'GT'],   // Guatemala
  [0x0B6000, 0x0B6FFF, 'GY'],   // Guyana
  [0x0B8000, 0x0B8FFF, 'HT'],   // Haiti
  [0x0BA000, 0x0BAFFF, 'HN'],   // Honduras
  [0x0BC000, 0x0BC7FF, 'VC'],   // Saint Vincent and the Grenadines
  [0x0BE000, 0x0BEFFF, 'JM'],   // Jamaica
  [0x0C0000, 0x0C0FFF, 'NI'],   // Nicaragua
  [0x0C2000, 0x0C2FFF, 'PA'],   // Panama
  [0x0C4000, 0x0C4FFF, 'DO'],   // Dominican Republic
  [0x0C6000, 0x0C6FFF, 'TT'],   // Trinidad and Tobago
  [0x0C8000, 0x0C8FFF, 'SR'],   // Suriname
  [0x0CA000, 0x0CA7FF, 'AG'],   // Antigua and Barbuda
  [0x0CC000, 0x0CC7FF, 'GD'],   // Grenada
  [0x0D0000, 0x0D7FFF, 'MX'],   // Mexico
  [0x0D8000, 0x0DFFFF, 'VE'],   // Venezuela
  [0x100000, 0x1FFFFF, 'RU'],   // Russia
  [0x201000, 0x2017FF, 'NA'],   // Namibia
  [0x202000, 0x2027FF, 'ER'],   // Eritrea
  [0x300000, 0x33FFFF, 'IT'],   // Italy
  [0x340000, 0x37FFFF, 'ES'],   // Spain
  [0x380000, 0x3BFFFF, 'FR'],   // France
  [0x3C0000, 0x3FFFFF, 'DE'],   // Germany
  [0x400000, 0x4001BF, 'BM'],   // Bermuda
  [0x400000, 0x43FFFF, 'GB'],   // United Kingdom
  [0x4001C0, 0x4001FF, 'KY'],   // Cayman Islands
  [0x400300, 0x4003FF, 'TC'],   // Turks and Caicos Islands
  [0x424135, 0x4241F2, 'KY'],   // Cayman Islands
  [0x424200, 0x4246FF, 'BM'],   // Bermuda
  [0x424700, 0x424899, 'KY'],   // Cayman Islands
  [0x424B00, 0x424BFF, 'IM'],   // Isle of Man
  [0x43BE00, 0x43BEFF, 'BM'],   // Bermuda
  [0x43E700, 0x43EAFD, 'IM'],   // Isle of Man
  [0x43EAFE, 0x43EEFF, 'GG'],   // Guernsey
  [0x440000, 0x447FFF, 'AT'],   // Austria
  [0x448000, 0x44FFFF, 'BE'],   // Belgium
  [0x450000, 0x457FFF, 'BG'],   // Bulgaria
  [0x458000, 0x45FFFF, 'DK'],   // Denmark
  [0x460000, 0x467FFF, 'FI'],   // Finland
  [0x468000, 0x46FFFF, 'GR'],   // Greece
  [0x470000, 0x477FFF, 'HU'],   // Hungary
  [0x478000, 0x47FFFF, 'NO'],   // Norway
  [0x480000, 0x487FFF, 'NL'],   // Netherlands
  [0x488000, 0x48FFFF, 'PL'],   // Poland
  [0x490000, 0x497FFF, 'PT'],   // Portugal
  [0x498000, 0x49FFFF, 'CZ'],   // Czechia
  [0x4A0000, 0x4A7FFF, 'RO'],   // Romania
  [0x4A8000, 0x4AFFFF, 'SE'],   // Sweden
  [0x4B0000, 0x4B7FFF, 'CH'],   // Switzerland
  [0x4B8000, 0x4BFFFF, 'TR'],   // Turkey
  [0x4C0000, 0x4C7FFF, 'RS'],   // Serbia
  [0x4C8000, 0x4C87FF, 'CY'],   // Cyprus
  [0x4CA000, 0x4CAFFF, 'IE'],   // Ireland
  [0x4CC000, 0x4CCFFF, 'IS'],   // Iceland
  [0x4D0000, 0x4D07FF, 'LU'],   // Luxembourg
  [0x4D2000, 0x4D27FF, 'MT'],   // Malta
  [0x4D4000, 0x4D47FF, 'MC'],   // Monaco
  [0x500000, 0x5007FF, 'SM'],   // San Marino
  [0x501000, 0x5017FF, 'AL'],   // Albania
  [0x501800, 0x501FFF, 'HR'],   // Croatia
  [0x502800, 0x502FFF, 'LV'],   // Latvia
  [0x503800, 0x503FFF, 'LT'],   // Lithuania
  [0x504800, 0x504FFF, 'MD'],   // Moldova
  [0x505800, 0x505FFF, 'SK'],   // Slovakia
  [0x506800, 0x506FFF, 'SI'],   // Slovenia
  [0x507800, 0x507FFF, 'UZ'],   // Uzbekistan
  [0x508000, 0x50FFFF, 'UA'],   // Ukraine
  [0x510000, 0x5107FF, 'BY'],   // Belarus
  [0x511000, 0x5117FF, 'EE'],   // Estonia
  [0x512000, 0x5127FF, 'MK'],   // North Macedonia
  [0x513000, 0x5137FF, 'BA'],   // Bosnia and Herzegovina
  [0x514000, 0x5147FF, 'GE'],   // Georgia
  [0x515000, 0x5157FF, 'TJ'],   // Tajikistan
  [0x516000, 0x5167FF, 'ME'],   // Montenegro
  [0x600000, 0x6007FF, 'AM'],   // Armenia
  [0x600800, 0x600FFF, 'AZ'],   // Azerbaijan
  [0x601000, 0x6017FF, 'KG'],   // Kyrgyzstan
  [0x601800, 0x601FFF, 'TM'],   // Turkmenistan
  [0x680000, 0x6807FF, 'BT'],   // Bhutan
  [0x681000, 0x6817FF, 'FM'],   // Micronesia, Federated States of
  [0x682000, 0x6827FF, 'MN'],   // Mongolia
  [0x683000, 0x6837FF, 'KZ'],   // Kazakhstan
  [0x684000, 0x6847FF, 'PW'],   // Palau
  [0x700000, 0x700FFF, 'AF'],   // Afghanistan
  [0x702000, 0x702FFF, 'BD'],   // Bangladesh
  [0x704000, 0x704FFF, 'MM'],   // Myanmar
  [0x706000, 0x706FFF, 'KW'],   // Kuwait
  [0x708000, 0x708FFF, 'LA'],   // Laos
  [0x70A000, 0x70AFFF, 'NP'],   // Nepal
  [0x70C000, 0x70C7FF, 'OM'],   // Oman
  [0x70E000, 0x70EFFF, 'KH'],   // Cambodia
  [0x710000, 0x717FFF, 'SA'],   // Saudi Arabia
  [0x718000, 0x71FFFF, 'KR'],   // South Korea
  [0x720000, 0x727FFF, 'KP'],   // North Korea
  [0x728000, 0x72FFFF, 'IQ'],   // Iraq
  [0x730000, 0x737FFF, 'IR'],   // Iran
  [0x738000, 0x73FFFF, 'IL'],   // Israel
  [0x740000, 0x747FFF, 'JO'],   // Jordan
  [0x748000, 0x74FFFF, 'LB'],   // Lebanon
  [0x750000, 0x757FFF, 'MY'],   // Malaysia
  [0x758000, 0x75FFFF, 'PH'],   // Philippines
  [0x760000, 0x767FFF, 'PK'],   // Pakistan
  [0x768000, 0x76FFFF, 'SG'],   // Singapore
  [0x770000, 0x777FFF, 'LK'],   // Sri Lanka
  [0x778000, 0x77FFFF, 'SY'],   // Syria
  [0x780000, 0x7BFFFF, 'CN'],   // China
  [0x789000, 0x789FFF, 'HK'],   // Hong Kong
  [0x7C0000, 0x7FFFFF, 'AU'],   // Australia
  [0x800000, 0x83FFFF, 'IN'],   // India
  [0x840000, 0x87FFFF, 'JP'],   // Japan
  [0x880000, 0x887FFF, 'TH'],   // Thailand
  [0x888000, 0x88FFFF, 'VN'],   // Viet Nam
  [0x890000, 0x890FFF, 'YE'],   // Yemen
  [0x894000, 0x894FFF, 'BH'],   // Bahrain
  [0x895000, 0x8957FF, 'BN'],   // Brunei
  [0x896000, 0x896FFF, 'AE'],   // United Arab Emirates
  [0x897000, 0x8977FF, 'SB'],   // Solomon Islands
  [0x898000, 0x898FFF, 'PG'],   // Papua New Guinea
  [0x899000, 0x8997FF, 'TW'],   // Taiwan
  [0x8A0000, 0x8A7FFF, 'ID'],   // Indonesia
  [0x900000, 0x9007FF, 'MH'],   // Marshall Islands
  [0x901000, 0x9017FF, 'SK'],   // Cook Islands
  [0x902000, 0x9027FF, 'WS'],   // Samoa
  [0xA00000, 0xAFFFFF, 'US'],   // United States
  [0xC00000, 0xC3FFFF, 'CA'],   // Canada
  [0xC80000, 0xC87FFF, 'NZ'],   // New Zealand
  [0xC88000, 0xC88FFF, 'FJ'],   // Fiji
  [0xC8A000, 0xC8A7FF, 'NR'],   // Nauru
  [0xC8C000, 0xC8C7FF, 'LC'],   // Saint Lucia
  [0xC8D000, 0xC8D7FF, 'TO'],   // Tonga
  [0xC8E000, 0xC8E7FF, 'KI'],   // Kiribati
  [0xC90000, 0xC907FF, 'VU'],   // Vanuatu
  [0xC91000, 0xC917FF, 'AD'],   // Andorra
  [0xC92000, 0xC927FF, 'DM'],   // Dominica
  [0xC93000, 0xC937FF, 'KN'],   // Saint Kitts and Nevis
  [0xC94000, 0xC947FF, 'SS'],   // South Sudan
  [0xC95000, 0xC957FF, 'TL'],   // Timor-Leste
  [0xC97000, 0xC977FF, 'TV'],   // Tuvalu
  [0xE00000, 0xE3FFFF, 'AR'],   // Argentina
  [0xE40000, 0xE7FFFF, 'BR'],   // Brazil
  [0xE80000, 0xE80FFF, 'CL'],   // Chile
  [0xE84000, 0xE84FFF, 'EC'],   // Ecuador
  [0xE88000, 0xE88FFF, 'PY'],   // Paraguay
  [0xE8C000, 0xE8CFFF, 'PE'],   // Peru
  [0xE90000, 0xE90FFF, 'UY'],   // Uruguay
  [0xE94000, 0xE94FFF, 'BO'],   // Bolivia
];

const VLAGGEN = {
  AE: "<rect width='9' height='2' fill='#00732F'/><rect y='2' width='9' height='2' fill='#fff'/><rect y='4' width='9' height='2' fill='#000'/><rect width='2.25' height='6' fill='#FF0000'/>",
  AM: "<rect width='9' height='2' fill='#D90012'/><rect y='2' width='9' height='2' fill='#0033A0'/><rect y='4' width='9' height='2' fill='#F2A800'/>",
  AR: "<rect width='9' height='6' fill='#75AADB'/><rect y='2' width='9' height='2' fill='#fff'/>",
  AT: "<rect width='9' height='6' fill='#ED2939'/><rect y='2' width='9' height='2' fill='#fff'/>",
  AU: "<rect width='9' height='6' fill='#00008B'/><g transform='scale(.5)'><rect width='9' height='6' fill='#00008B'/><path d='M0 0 L9 6 M9 0 L0 6' stroke='#fff' stroke-width='1.2'/><path d='M4.5 0 v6 M0 3 h9' stroke='#fff' stroke-width='2'/><path d='M4.5 0 v6 M0 3 h9' stroke='#C8102E' stroke-width='1.2'/></g><circle cx='2.2' cy='4.6' r='.35' fill='#fff'/><circle cx='6' cy='1.4' r='.3' fill='#fff'/><circle cx='6.8' cy='3' r='.3' fill='#fff'/><circle cx='6' cy='4.6' r='.3' fill='#fff'/><circle cx='7.6' cy='4.2' r='.25' fill='#fff'/>",
  AZ: "<rect width='9' height='2' fill='#00B9E4'/><rect y='2' width='9' height='2' fill='#ED2939'/><rect y='4' width='9' height='2' fill='#509E2F'/><circle cx='4.3' cy='3' r='.85' fill='#fff'/><circle cx='4.6' cy='3' r='.7' fill='#ED2939'/>",
  BD: "<rect width='9' height='6' fill='#006A4E'/><circle cx='4.05' cy='3' r='1.8' fill='#F42A41'/>",
  BE: "<rect width='3' height='6' fill='#000'/><rect x='3' width='3' height='6' fill='#FDDA24'/><rect x='6' width='3' height='6' fill='#EF3340'/>",
  BG: "<rect width='9' height='2' fill='#fff'/><rect y='2' width='9' height='2' fill='#00966E'/><rect y='4' width='9' height='2' fill='#D62612'/>",
  BH: "<rect width='9' height='6' fill='#CE1126'/><rect width='2.6' height='6' fill='#fff'/>",
  BM: "<rect width='9' height='6' fill='#CF142B'/><g transform='scale(.5)'><rect width='9' height='6' fill='#00247D'/><path d='M0 0 L9 6 M9 0 L0 6' stroke='#fff' stroke-width='1.2'/><path d='M4.5 0 v6 M0 3 h9' stroke='#fff' stroke-width='2'/><path d='M4.5 0 v6 M0 3 h9' stroke='#C8102E' stroke-width='1.2'/></g><circle cx='6.5' cy='3' r='1.3' fill='#fff'/>",
  BR: "<rect width='9' height='6' fill='#009B3A'/><path d='M4.5 .8 L8.2 3 L4.5 5.2 L.8 3 Z' fill='#FEDF00'/><circle cx='4.5' cy='3' r='1.35' fill='#002776'/>",
  BY: "<rect width='9' height='4' fill='#C8313E'/><rect y='4' width='9' height='2' fill='#4AA657'/><rect width='1.6' height='6' fill='#fff'/>",
  CA: "<rect width='9' height='6' fill='#fff'/><rect width='2.25' height='6' fill='#D80621'/><rect x='6.75' width='2.25' height='6' fill='#D80621'/><path d='M4.5 1.2 L4.9 2.4 L5.9 1.9 L5.5 3.1 L6.4 3 L5.6 3.7 L6 4 L4.8 4.2 L4.9 5 L4.5 4.6 L4.1 5 L4.2 4.2 L3 4 L3.4 3.7 L2.6 3 L3.5 3.1 L3.1 1.9 L4.1 2.4 Z' fill='#D80621'/>",
  CH: "<rect width='9' height='6' fill='#D52B1E'/><rect x='4.05' y='1.3' width='.9' height='3.4' fill='#fff'/><rect x='2.8' y='2.55' width='3.4' height='.9' fill='#fff'/>",
  CL: "<rect width='9' height='3' fill='#fff'/><rect y='3' width='9' height='3' fill='#D52B1E'/><rect width='3' height='3' fill='#0039A6'/><path d='M1.5 .7 L1.85 1.75 L.95 1.1 L2.05 1.1 L1.15 1.75 Z' fill='#fff'/>",
  CN: "<rect width='9' height='6' fill='#EE1C25'/><path d='M1.8 1 L2.3 2.5 L1 1.6 L2.6 1.6 L1.3 2.5 Z' fill='#FFFF00'/><circle cx='3.5' cy='.8' r='.3' fill='#FFFF00'/><circle cx='4.2' cy='1.5' r='.3' fill='#FFFF00'/><circle cx='4.2' cy='2.5' r='.3' fill='#FFFF00'/><circle cx='3.5' cy='3.2' r='.3' fill='#FFFF00'/>",
  CO: "<rect width='9' height='3' fill='#FCD116'/><rect y='3' width='9' height='1.5' fill='#003893'/><rect y='4.5' width='9' height='1.5' fill='#CE1126'/>",
  CU: "<rect width='9' height='6' fill='#fff'/><rect width='9' height='1.2' fill='#002A8F'/><rect y='2.4' width='9' height='1.2' fill='#002A8F'/><rect y='4.8' width='9' height='1.2' fill='#002A8F'/><path d='M0 0 L3.6 3 L0 6 Z' fill='#CF142B'/>",
  CZ: "<rect width='9' height='3' fill='#fff'/><rect y='3' width='9' height='3' fill='#D7141A'/><path d='M0 0 L4 3 L0 6 Z' fill='#11457E'/>",
  DE: "<rect width='9' height='2' fill='#000'/><rect y='2' width='9' height='2' fill='#DD0000'/><rect y='4' width='9' height='2' fill='#FFCE00'/>",
  DK: "<rect width='9' height='6' fill='#C8102E'/><rect x='2.6' width='1.2' height='6' fill='#fff'/><rect y='2.4' width='9' height='1.2' fill='#fff'/>",
  EE: "<rect width='9' height='2' fill='#0072CE'/><rect y='2' width='9' height='2' fill='#000'/><rect y='4' width='9' height='2' fill='#fff'/>",
  EG: "<rect width='9' height='2' fill='#CE1126'/><rect y='2' width='9' height='2' fill='#fff'/><rect y='4' width='9' height='2' fill='#000'/>",
  ES: "<rect width='9' height='6' fill='#AA151B'/><rect y='1.5' width='9' height='3' fill='#F1BF00'/>",
  ET: "<rect width='9' height='2' fill='#078930'/><rect y='2' width='9' height='2' fill='#FCDD09'/><rect y='4' width='9' height='2' fill='#DA121A'/><circle cx='4.5' cy='3' r='1.3' fill='#0F47AF'/>",
  FI: "<rect width='9' height='6' fill='#fff'/><rect x='2.6' width='1.4' height='6' fill='#003580'/><rect y='2.3' width='9' height='1.4' fill='#003580'/>",
  FR: "<rect width='3' height='6' fill='#002395'/><rect x='3' width='3' height='6' fill='#fff'/><rect x='6' width='3' height='6' fill='#ED2939'/>",
  GB: "<rect width='9' height='6' fill='#012169'/><path d='M0 0 L9 6 M9 0 L0 6' stroke='#fff' stroke-width='1.2'/><path d='M0 0 L9 6 M9 0 L0 6' stroke='#C8102E' stroke-width='.7'/><path d='M4.5 0 v6 M0 3 h9' stroke='#fff' stroke-width='2'/><path d='M4.5 0 v6 M0 3 h9' stroke='#C8102E' stroke-width='1.2'/>",
  GE: "<rect width='9' height='6' fill='#fff'/><rect x='3.6' width='1.8' height='6' fill='#FF0000'/><rect y='2.1' width='9' height='1.8' fill='#FF0000'/>",
  GG: "<rect width='9' height='6' fill='#fff'/><rect x='3.6' width='1.8' height='6' fill='#E8112D'/><rect y='2.1' width='9' height='1.8' fill='#E8112D'/>",
  GR: "<rect width='9' height='6' fill='#fff'/><rect y='0' width='9' height='.67' fill='#0D5EAF'/><rect y='1.33' width='9' height='.67' fill='#0D5EAF'/><rect y='2.67' width='9' height='.67' fill='#0D5EAF'/><rect y='4' width='9' height='.67' fill='#0D5EAF'/><rect y='5.33' width='9' height='.67' fill='#0D5EAF'/><rect width='3.33' height='3.33' fill='#0D5EAF'/><rect x='1.33' width='.67' height='3.33' fill='#fff'/><rect y='1.33' width='3.33' height='.67' fill='#fff'/>",
  HR: "<rect width='9' height='2' fill='#FF0000'/><rect y='2' width='9' height='2' fill='#fff'/><rect y='4' width='9' height='2' fill='#171796'/>",
  HU: "<rect width='9' height='2' fill='#CE2939'/><rect y='2' width='9' height='2' fill='#fff'/><rect y='4' width='9' height='2' fill='#477050'/>",
  ID: "<rect width='9' height='3' fill='#CE1126'/><rect y='3' width='9' height='3' fill='#fff'/>",
  IE: "<rect width='3' height='6' fill='#169B62'/><rect x='3' width='3' height='6' fill='#fff'/><rect x='6' width='3' height='6' fill='#FF883E'/>",
  IL: "<rect width='9' height='6' fill='#fff'/><rect y='.8' width='9' height='.7' fill='#0038B8'/><rect y='4.5' width='9' height='.7' fill='#0038B8'/><path d='M4.5 1.9 L5.5 3.6 L3.5 3.6 Z M4.5 4.1 L3.5 2.4 L5.5 2.4 Z' fill='none' stroke='#0038B8' stroke-width='.22'/>",
  IM: "<rect width='9' height='6' fill='#CF142B'/><circle cx='4.5' cy='3' r='1.6' fill='#fff' opacity='.35'/>",
  IN: "<rect width='9' height='2' fill='#FF9933'/><rect y='2' width='9' height='2' fill='#fff'/><rect y='4' width='9' height='2' fill='#138808'/><circle cx='4.5' cy='3' r='.85' fill='none' stroke='#000080' stroke-width='.18'/>",
  IQ: "<rect width='9' height='2' fill='#CE1126'/><rect y='2' width='9' height='2' fill='#fff'/><rect y='4' width='9' height='2' fill='#000'/>",
  IR: "<rect width='9' height='2' fill='#239F40'/><rect y='2' width='9' height='2' fill='#fff'/><rect y='4' width='9' height='2' fill='#DA0000'/>",
  IS: "<rect width='9' height='6' fill='#02529C'/><rect x='2.3' width='1.8' height='6' fill='#fff'/><rect y='2.1' width='9' height='1.8' fill='#fff'/><rect x='2.75' width='.9' height='6' fill='#DC1E35'/><rect y='2.55' width='9' height='.9' fill='#DC1E35'/>",
  IT: "<rect width='3' height='6' fill='#008C45'/><rect x='3' width='3' height='6' fill='#F4F5F0'/><rect x='6' width='3' height='6' fill='#CD212A'/>",
  JO: "<rect width='9' height='2' fill='#000'/><rect y='2' width='9' height='2' fill='#fff'/><rect y='4' width='9' height='2' fill='#007A3D'/><path d='M0 0 L3 3 L0 6 Z' fill='#CE1126'/>",
  JP: "<rect width='9' height='6' fill='#fff'/><circle cx='4.5' cy='3' r='1.8' fill='#BC002D'/>",
  KE: "<rect width='9' height='2' fill='#000'/><rect y='2' width='9' height='2' fill='#BB0000'/><rect y='4' width='9' height='2' fill='#006600'/><rect y='1.8' width='9' height='.4' fill='#fff'/><rect y='3.8' width='9' height='.4' fill='#fff'/>",
  KR: "<rect width='9' height='6' fill='#fff'/><path d='M4.5 1.5 A1.5 1.5 0 0 1 4.5 4.5 Z' fill='#CD2E3A' transform='rotate(-33 4.5 3)'/><path d='M4.5 1.5 A1.5 1.5 0 0 0 4.5 4.5 Z' fill='#0047A0' transform='rotate(-33 4.5 3)'/><g fill='#000'><rect x='.8' y='.9' width='1.5' height='.2' transform='rotate(-56 1.55 1)'/><rect x='.8' y='1.45' width='1.5' height='.2' transform='rotate(-56 1.55 1.55)'/><rect x='6.7' y='4.35' width='1.5' height='.2' transform='rotate(-56 7.45 4.45)'/><rect x='6.7' y='4.9' width='1.5' height='.2' transform='rotate(-56 7.45 5)'/></g>",
  KW: "<rect width='9' height='2' fill='#007A3D'/><rect y='2' width='9' height='2' fill='#fff'/><rect y='4' width='9' height='2' fill='#CE1126'/><path d='M0 0 L2.25 1.5 v3 L0 6 Z' fill='#000'/>",
  KY: "<rect width='9' height='6' fill='#00247D'/><g transform='scale(.5)'><rect width='9' height='6' fill='#00247D'/><path d='M0 0 L9 6 M9 0 L0 6' stroke='#fff' stroke-width='1.2'/><path d='M4.5 0 v6 M0 3 h9' stroke='#fff' stroke-width='2'/><path d='M4.5 0 v6 M0 3 h9' stroke='#C8102E' stroke-width='1.2'/></g><circle cx='6.5' cy='3' r='1.3' fill='#fff'/>",
  KZ: "<rect width='9' height='6' fill='#00AFCA'/><circle cx='4.6' cy='2.9' r='1.1' fill='#FEC50C'/><rect width='.7' height='6' fill='#FEC50C'/>",
  LK: "<rect width='9' height='6' fill='#FFBE29'/><rect x='.6' y='.6' width='2.4' height='4.8' fill='#00534E'/><rect x='.6' y='.6' width='1.2' height='4.8' fill='#EB7400'/><rect x='3.3' y='.6' width='5.1' height='4.8' fill='#8D153A'/>",
  LT: "<rect width='9' height='2' fill='#FDB913'/><rect y='2' width='9' height='2' fill='#006A44'/><rect y='4' width='9' height='2' fill='#C1272D'/>",
  LU: "<rect width='9' height='2' fill='#ED2939'/><rect y='2' width='9' height='2' fill='#fff'/><rect y='4' width='9' height='2' fill='#00A1DE'/>",
  LV: "<rect width='9' height='6' fill='#9E3039'/><rect y='2.4' width='9' height='1.2' fill='#fff'/>",
  MA: "<rect width='9' height='6' fill='#C1272D'/><path d='M4.5 1.6 L5.2 3.8 L3.3 2.4 L5.7 2.4 L3.8 3.8 Z' fill='none' stroke='#006233' stroke-width='.32'/>",
  MC: "<rect width='9' height='3' fill='#CE1126'/><rect y='3' width='9' height='3' fill='#fff'/>",
  MT: "<rect width='4.5' height='6' fill='#fff'/><rect x='4.5' width='4.5' height='6' fill='#CF142B'/>",
  MX: "<rect width='3' height='6' fill='#006847'/><rect x='3' width='3' height='6' fill='#fff'/><rect x='6' width='3' height='6' fill='#CE1126'/>",
  MY: "<rect width='9' height='6' fill='#fff'/><g fill='#CC0001'><rect width='9' height='.43'/><rect y='.86' width='9' height='.43'/><rect y='1.71' width='9' height='.43'/><rect y='2.57' width='9' height='.43'/><rect y='3.43' width='9' height='.43'/><rect y='4.29' width='9' height='.43'/><rect y='5.14' width='9' height='.43'/></g><rect width='4.5' height='3.43' fill='#010066'/><circle cx='1.9' cy='1.7' r='.95' fill='#FFCC00'/><circle cx='2.3' cy='1.7' r='.8' fill='#010066'/>",
  NG: "<rect width='3' height='6' fill='#008751'/><rect x='3' width='3' height='6' fill='#fff'/><rect x='6' width='3' height='6' fill='#008751'/>",
  NL: "<rect width='9' height='2' fill='#AE1C28'/><rect y='2' width='9' height='2' fill='#fff'/><rect y='4' width='9' height='2' fill='#21468B'/>",
  NO: "<rect width='9' height='6' fill='#BA0C2F'/><rect x='2.3' width='1.8' height='6' fill='#fff'/><rect y='2.1' width='9' height='1.8' fill='#fff'/><rect x='2.75' width='.9' height='6' fill='#00205B'/><rect y='2.55' width='9' height='.9' fill='#00205B'/>",
  NZ: "<rect width='9' height='6' fill='#00247D'/><g transform='scale(.5)'><rect width='9' height='6' fill='#00247D'/><path d='M0 0 L9 6 M9 0 L0 6' stroke='#fff' stroke-width='1.2'/><path d='M4.5 0 v6 M0 3 h9' stroke='#fff' stroke-width='2'/><path d='M4.5 0 v6 M0 3 h9' stroke='#CC142B' stroke-width='1.2'/></g><circle cx='6.6' cy='1.5' r='.3' fill='#CC142B'/><circle cx='7.4' cy='3' r='.3' fill='#CC142B'/><circle cx='6.2' cy='4.2' r='.3' fill='#CC142B'/><circle cx='7' cy='4.8' r='.25' fill='#CC142B'/>",
  OM: "<rect width='9' height='2' fill='#fff'/><rect y='2' width='9' height='2' fill='#DB161B'/><rect y='4' width='9' height='2' fill='#008000'/><rect width='2.4' height='6' fill='#DB161B'/>",
  PE: "<rect width='3' height='6' fill='#D91023'/><rect x='3' width='3' height='6' fill='#fff'/><rect x='6' width='3' height='6' fill='#D91023'/>",
  PH: "<rect width='9' height='3' fill='#0038A8'/><rect y='3' width='9' height='3' fill='#CE1126'/><path d='M0 0 L3.6 3 L0 6 Z' fill='#fff'/>",
  PK: "<rect width='9' height='6' fill='#01411C'/><rect width='2.25' height='6' fill='#fff'/><circle cx='5.4' cy='3' r='1.3' fill='#fff'/><circle cx='5.85' cy='2.8' r='1.1' fill='#01411C'/>",
  PL: "<rect width='9' height='3' fill='#fff'/><rect y='3' width='9' height='3' fill='#DC143C'/>",
  PT: "<rect width='9' height='6' fill='#DA291C'/><rect width='3.6' height='6' fill='#046A38'/><circle cx='3.6' cy='3' r='1.25' fill='#FFE900' stroke='#fff' stroke-width='.25'/>",
  QA: "<rect width='9' height='6' fill='#8A1538'/><rect width='2.6' height='6' fill='#fff'/>",
  RO: "<rect width='3' height='6' fill='#002B7F'/><rect x='3' width='3' height='6' fill='#FCD116'/><rect x='6' width='3' height='6' fill='#CE1126'/>",
  RS: "<rect width='9' height='2' fill='#C6363C'/><rect y='2' width='9' height='2' fill='#0C4076'/><rect y='4' width='9' height='2' fill='#fff'/>",
  RU: "<rect width='9' height='2' fill='#fff'/><rect y='2' width='9' height='2' fill='#0039A6'/><rect y='4' width='9' height='2' fill='#D52B1E'/>",
  SA: "<rect width='9' height='6' fill='#006C35'/><rect x='1.2' y='2.1' width='6.6' height='.5' fill='#fff'/><rect x='1.2' y='3.6' width='6.6' height='.35' fill='#fff'/><path d='M1.2 3.95 l.5 .5 h5.6 l.5 -.5' fill='none' stroke='#fff' stroke-width='.3'/>",
  SD: "<rect width='9' height='2' fill='#D21034'/><rect y='2' width='9' height='2' fill='#fff'/><rect y='4' width='9' height='2' fill='#000'/><path d='M0 0 L3 3 L0 6 Z' fill='#007A3D'/>",
  SE: "<rect width='9' height='6' fill='#006AA7'/><rect x='2.6' width='1.2' height='6' fill='#FECC00'/><rect y='2.4' width='9' height='1.2' fill='#FECC00'/>",
  SG: "<rect width='9' height='6' fill='#fff'/><rect width='9' height='3' fill='#ED2939'/><circle cx='2' cy='1.5' r='1' fill='#fff'/><circle cx='2.5' cy='1.5' r='.85' fill='#ED2939'/><circle cx='3.5' cy='1.1' r='.2' fill='#fff'/><circle cx='3.5' cy='1.9' r='.2' fill='#fff'/>",
  SI: "<rect width='9' height='2' fill='#fff'/><rect y='2' width='9' height='2' fill='#0000A0'/><rect y='4' width='9' height='2' fill='#D50000'/>",
  SK: "<rect width='9' height='2' fill='#fff'/><rect y='2' width='9' height='2' fill='#0B4EA2'/><rect y='4' width='9' height='2' fill='#EE1C25'/>",
  SY: "<rect width='9' height='2' fill='#CE1126'/><rect y='2' width='9' height='2' fill='#fff'/><rect y='4' width='9' height='2' fill='#000'/>",
  TD: "<rect width='3' height='6' fill='#002664'/><rect x='3' width='3' height='6' fill='#FECB00'/><rect x='6' width='3' height='6' fill='#C60C30'/>",
  TH: "<rect width='9' height='6' fill='#A51931'/><rect y='1' width='9' height='4' fill='#fff'/><rect y='2' width='9' height='2' fill='#2D2A4A'/>",
  TM: "<rect width='9' height='6' fill='#28AE66'/><rect x='1.4' width='1.5' height='6' fill='#D22630'/><circle cx='5.6' cy='2' r='.9' fill='#fff'/><circle cx='5.95' cy='2' r='.75' fill='#28AE66'/>",
  TN: "<rect width='9' height='6' fill='#E70013'/><circle cx='4.5' cy='3' r='1.7' fill='#fff'/><circle cx='4.2' cy='3' r='1.3' fill='#E70013'/><circle cx='4.9' cy='3' r='1.1' fill='#fff'/>",
  TR: "<rect width='9' height='6' fill='#E30A17'/><circle cx='3.6' cy='3' r='1.5' fill='#fff'/><circle cx='4.1' cy='3' r='1.2' fill='#E30A17'/><path d='M5.3 3 L6.5 2.6 L5.75 3 L6.5 3.4 Z' fill='#fff'/>",
  TW: "<rect width='9' height='6' fill='#FE0000'/><rect width='4.5' height='3' fill='#000095'/><circle cx='2.25' cy='1.5' r='.85' fill='#fff'/>",
  UA: "<rect width='9' height='3' fill='#0057B7'/><rect y='3' width='9' height='3' fill='#FFDD00'/>",
  US: "<rect width='9' height='6' fill='#fff'/><g fill='#B22234'><rect width='9' height='.46'/><rect y='.92' width='9' height='.46'/><rect y='1.85' width='9' height='.46'/><rect y='2.77' width='9' height='.46'/><rect y='3.69' width='9' height='.46'/><rect y='4.62' width='9' height='.46'/><rect y='5.54' width='9' height='.46'/></g><rect width='3.6' height='3.23' fill='#3C3B6E'/>",
  VN: "<rect width='9' height='6' fill='#DA251D'/><path d='M4.5 1.4 L5.3 3.9 L3.2 2.35 L5.8 2.35 L3.7 3.9 Z' fill='#FFFF00'/>",
  YE: "<rect width='9' height='2' fill='#CE1126'/><rect y='2' width='9' height='2' fill='#fff'/><rect y='4' width='9' height='2' fill='#000'/>",
  ZA: "<rect width='9' height='3' fill='#E03C31'/><rect y='3' width='9' height='3' fill='#001489'/><path d='M0 0 L3.6 3 L0 6 Z' fill='#007749'/><path d='M0 .9 L2.5 3 L0 5.1 Z' fill='#FFB81C'/><path d='M0 1.6 L1.8 3 L0 4.4 Z' fill='#000'/>",
};

export function landVanHex(hex) {
  const n = parseInt(String(hex || '').trim(), 16);
  if (!Number.isFinite(n)) return '';
  let lo = 0, hi = BEREIKEN.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1, b = BEREIKEN[m];
    if (n < b[0]) hi = m - 1;
    else if (n > b[1]) lo = m + 1;
    else return b[2];
  }
  return '';
}

// Het vlaggetje als element, of een vakje met de landcode als we die vlag niet tekenen.
export function vlagElement(iso) {
  const code = String(iso || '').toUpperCase();
  if (!code) return null;
  const el = document.createElement('span');
  el.className = 'vlag';
  el.title = code;
  if (VLAGGEN[code]) {
    el.innerHTML = `<svg viewBox="0 0 9 6" aria-hidden="true">${VLAGGEN[code]}</svg>`;
  } else {
    el.classList.add('vlag-code');
    el.textContent = code;
  }
  return el;
}
