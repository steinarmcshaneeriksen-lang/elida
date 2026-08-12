/**
 * Norwegian Standard Chart of Accounts (NS 4102)
 *
 * Reference mapping of the Norsk Standard Kontoplan used by most
 * Norwegian businesses. The advisor uses this to suggest accounts
 * when the company's own chart of accounts doesn't provide a clear match.
 *
 * This is a curated subset covering the most commonly used accounts.
 * The full NS 4102 has hundreds of accounts; we include the ones that
 * appear in 90%+ of small/medium Norwegian businesses.
 */

import type { StandardAccountDefinition } from "../types";

// ---------------------------------------------------------------------------
// Account class ranges
// ---------------------------------------------------------------------------

export interface AccountClass {
  class_number: number;
  range_start: number;
  range_end: number;
  name_nb: string;
  description_nb: string;
  is_balance_sheet: boolean;
}

export const ACCOUNT_CLASSES: AccountClass[] = [
  {
    class_number: 1,
    range_start: 1000,
    range_end: 1999,
    name_nb: "Eiendeler",
    description_nb: "Anleggsmidler og omloepsmidler",
    is_balance_sheet: true,
  },
  {
    class_number: 2,
    range_start: 2000,
    range_end: 2999,
    name_nb: "Egenkapital og gjeld",
    description_nb: "Egenkapital, langsiktig og kortsiktig gjeld",
    is_balance_sheet: true,
  },
  {
    class_number: 3,
    range_start: 3000,
    range_end: 3999,
    name_nb: "Salgsinntekter",
    description_nb: "Driftsinntekter og andre salgsinntekter",
    is_balance_sheet: false,
  },
  {
    class_number: 4,
    range_start: 4000,
    range_end: 4999,
    name_nb: "Varekostnad",
    description_nb: "Innkjoepskost for varer og materialer",
    is_balance_sheet: false,
  },
  {
    class_number: 5,
    range_start: 5000,
    range_end: 5999,
    name_nb: "Loennskostnader",
    description_nb: "Loenn, feriepenger, arbeidsgiveravgift, pensjon, personalforsikring",
    is_balance_sheet: false,
  },
  {
    class_number: 6,
    range_start: 6000,
    range_end: 6999,
    name_nb: "Andre driftskostnader (avskr., husleie, utstyr)",
    description_nb: "Avskrivninger, husleie, leasing, verktoy, IT, reparasjoner",
    is_balance_sheet: false,
  },
  {
    class_number: 7,
    range_start: 7000,
    range_end: 7999,
    name_nb: "Andre driftskostnader (kontor, reise, markedsfoering)",
    description_nb: "Kontorkostnader, telefon, reise, representasjon, markedsfoering, forsikring",
    is_balance_sheet: false,
  },
  {
    class_number: 8,
    range_start: 8000,
    range_end: 8999,
    name_nb: "Finansposter, skatt, ekstraordinaert",
    description_nb: "Renteinntekter/-kostnader, valutagevinst/-tap, skattekostnad",
    is_balance_sheet: false,
  },
];

// ---------------------------------------------------------------------------
// Common accounts
// ---------------------------------------------------------------------------

export const STANDARD_ACCOUNTS: StandardAccountDefinition[] = [
  // ── 1000-series: Eiendeler ─────────────────────────────────────────
  // Anleggsmidler
  {
    number: "1000",
    name_nb: "Forskning og utvikling",
    range_start: 1000,
    range_end: 1099,
    class_nb: "Immaterielle eiendeler",
    typical_use_nb: "Aktiverte utviklingskostnader",
  },
  {
    number: "1020",
    name_nb: "Konsesjoner",
    range_start: 1000,
    range_end: 1099,
    class_nb: "Immaterielle eiendeler",
    typical_use_nb: "Ervervet konsesjon, lisens, patent",
  },
  {
    number: "1080",
    name_nb: "Goodwill",
    range_start: 1080,
    range_end: 1089,
    class_nb: "Immaterielle eiendeler",
    typical_use_nb: "Ervervet goodwill ved virksomhetsovertagelse",
  },
  {
    number: "1100",
    name_nb: "Bygninger",
    range_start: 1100,
    range_end: 1199,
    class_nb: "Varige driftsmidler",
    typical_use_nb: "Forretningsbygg, lagerbygg eid av selskapet",
  },
  {
    number: "1200",
    name_nb: "Maskiner og anlegg",
    range_start: 1200,
    range_end: 1249,
    class_nb: "Varige driftsmidler",
    typical_use_nb: "Produksjonsmaskiner, teknisk utstyr",
  },
  {
    number: "1250",
    name_nb: "Inventar",
    range_start: 1250,
    range_end: 1279,
    class_nb: "Varige driftsmidler",
    typical_use_nb: "Kontormoebler, inventar i butikk/kontor",
  },
  {
    number: "1280",
    name_nb: "Kontormaskiner",
    range_start: 1280,
    range_end: 1299,
    class_nb: "Varige driftsmidler",
    typical_use_nb: "PC-er, servere, skrivere over aktiveringsgrensen (kr 15 000)",
  },
  {
    number: "1300",
    name_nb: "Investeringer i datterselskap",
    range_start: 1300,
    range_end: 1349,
    class_nb: "Finansielle anleggsmidler",
    typical_use_nb: "Aksjer i datterselskaper",
  },
  {
    number: "1350",
    name_nb: "Investeringer i tilknyttet selskap",
    range_start: 1350,
    range_end: 1399,
    class_nb: "Finansielle anleggsmidler",
    typical_use_nb: "Aksjer i tilknyttede selskaper",
  },
  {
    number: "1400",
    name_nb: "Varelager",
    range_start: 1400,
    range_end: 1499,
    class_nb: "Varelager",
    typical_use_nb: "Raavarer, varer under tilvirkning, ferdigvarer",
  },
  {
    number: "1500",
    name_nb: "Kundefordringer",
    range_start: 1500,
    range_end: 1599,
    class_nb: "Kortsiktige fordringer",
    typical_use_nb: "Utestaaende kundefordringer",
  },
  {
    number: "1570",
    name_nb: "Andre kortsiktige fordringer",
    range_start: 1570,
    range_end: 1599,
    class_nb: "Kortsiktige fordringer",
    typical_use_nb: "Forskuddsbetalte kostnader, tilgode MVA",
  },
  {
    number: "1700",
    name_nb: "Forskuddsbetalte kostnader",
    range_start: 1700,
    range_end: 1799,
    class_nb: "Forskuddsbetalinger",
    typical_use_nb: "Forsikring, husleie, abonnementer betalt forskudd",
  },
  {
    number: "1900",
    name_nb: "Kontanter og bankinnskudd",
    range_start: 1900,
    range_end: 1999,
    class_nb: "Bankinnskudd og kontanter",
    typical_use_nb: "Driftskonto, sparekonto, skattetrekkskonto, kontantkasse",
  },
  {
    number: "1920",
    name_nb: "Bankinnskudd",
    range_start: 1920,
    range_end: 1929,
    class_nb: "Bankinnskudd og kontanter",
    typical_use_nb: "Bankkonti for daglig drift",
  },
  {
    number: "1950",
    name_nb: "Skattetrekkskonto",
    range_start: 1950,
    range_end: 1959,
    class_nb: "Bankinnskudd og kontanter",
    typical_use_nb: "Bundne midler for skattetrekk av ansatte",
  },

  // ── 2000-series: Egenkapital og gjeld ──────────────────────────────
  {
    number: "2000",
    name_nb: "Aksjekapital",
    range_start: 2000,
    range_end: 2049,
    class_nb: "Innskutt egenkapital",
    typical_use_nb: "Innbetalt aksjekapital",
  },
  {
    number: "2050",
    name_nb: "Overkursfond",
    range_start: 2050,
    range_end: 2099,
    class_nb: "Innskutt egenkapital",
    typical_use_nb: "Overkurs ved emisjon",
  },
  {
    number: "2080",
    name_nb: "Udekket tap",
    range_start: 2080,
    range_end: 2089,
    class_nb: "Opptjent egenkapital",
    typical_use_nb: "Akkumulert underskudd",
  },
  {
    number: "2100",
    name_nb: "Fri egenkapital / annen egenkapital",
    range_start: 2100,
    range_end: 2199,
    class_nb: "Opptjent egenkapital",
    typical_use_nb: "Opptjent egenkapital, overfoert resultat",
  },
  {
    number: "2200",
    name_nb: "Pensjonsforpliktelser",
    range_start: 2200,
    range_end: 2299,
    class_nb: "Langsiktig gjeld",
    typical_use_nb: "Pensjonsforpliktelser, avsetning for pensjoner",
  },
  {
    number: "2300",
    name_nb: "Pantelaan",
    range_start: 2300,
    range_end: 2399,
    class_nb: "Langsiktig gjeld",
    typical_use_nb: "Langsiktige laan i bank, pantelaan",
  },
  {
    number: "2400",
    name_nb: "Leverandoergjeld",
    range_start: 2400,
    range_end: 2499,
    class_nb: "Kortsiktig gjeld",
    typical_use_nb: "Leverandoergjeld, uppdragsgivergjeld",
  },
  {
    number: "2500",
    name_nb: "Skattetrekk og offentlige avgifter",
    range_start: 2500,
    range_end: 2599,
    class_nb: "Kortsiktig gjeld",
    typical_use_nb: "Skyldig skattetrekk, arbeidsgiveravgift, MVA",
  },
  {
    number: "2600",
    name_nb: "Skyldig MVA",
    range_start: 2600,
    range_end: 2699,
    class_nb: "Kortsiktig gjeld",
    typical_use_nb: "Utgaaende MVA, inngaaende MVA, MVA-oppgjoer",
  },
  {
    number: "2700",
    name_nb: "Skyldig loenn og feriepenger",
    range_start: 2700,
    range_end: 2799,
    class_nb: "Kortsiktig gjeld",
    typical_use_nb: "Paaloepte, ikke utbetalte loennskostnader, skyldig feriepenger",
  },
  {
    number: "2800",
    name_nb: "Avsatt utbytte",
    range_start: 2800,
    range_end: 2899,
    class_nb: "Kortsiktig gjeld",
    typical_use_nb: "Vedtatt, men ikke utbetalt utbytte",
  },
  {
    number: "2900",
    name_nb: "Annen kortsiktig gjeld",
    range_start: 2900,
    range_end: 2999,
    class_nb: "Kortsiktig gjeld",
    typical_use_nb: "Paaloepte kostnader, uopptjent inntekt, diverse kortsiktig gjeld",
  },

  // ── 3000-series: Salgsinntekter ────────────────────────────────────
  {
    number: "3000",
    name_nb: "Salgsinntekt, avgiftspliktig",
    range_start: 3000,
    range_end: 3099,
    class_nb: "Salgsinntekter",
    typical_vat_code: "3",
    typical_use_nb: "Hoveddriftsinntekter med 25 % MVA",
  },
  {
    number: "3100",
    name_nb: "Salgsinntekt, avgiftsfri",
    range_start: 3100,
    range_end: 3199,
    class_nb: "Salgsinntekter",
    typical_use_nb: "Inntekter unntatt MVA",
  },
  {
    number: "3400",
    name_nb: "Offentlige tilskudd/refusjoner",
    range_start: 3400,
    range_end: 3499,
    class_nb: "Salgsinntekter",
    typical_use_nb: "Tilskudd, subsidier, offentlige refusjoner",
  },
  {
    number: "3600",
    name_nb: "Leieinntekt",
    range_start: 3600,
    range_end: 3699,
    class_nb: "Salgsinntekter",
    typical_use_nb: "Utleie av lokaler, utstyr",
  },
  {
    number: "3900",
    name_nb: "Annen driftsinntekt",
    range_start: 3900,
    range_end: 3999,
    class_nb: "Salgsinntekter",
    typical_use_nb: "Gevinst ved salg av driftsmidler, andre driftsinntekter",
  },

  // ── 4000-series: Varekostnad ───────────────────────────────────────
  {
    number: "4000",
    name_nb: "Innkjoep av varer for videresalg",
    range_start: 4000,
    range_end: 4099,
    class_nb: "Varekostnad",
    typical_vat_code: "1",
    typical_use_nb: "Varekjoep for videresalg",
  },
  {
    number: "4200",
    name_nb: "Innkjoep av raavarer og halvfabrikata",
    range_start: 4200,
    range_end: 4299,
    class_nb: "Varekostnad",
    typical_use_nb: "Raavarer til produksjon",
  },
  {
    number: "4300",
    name_nb: "Innkjoep av varer for videresalg, utland",
    range_start: 4300,
    range_end: 4399,
    class_nb: "Varekostnad",
    typical_use_nb: "Varekjoep fra utenlandske leverandoerer",
  },
  {
    number: "4500",
    name_nb: "Fremmedtjenester og underentreprise",
    range_start: 4500,
    range_end: 4599,
    class_nb: "Varekostnad",
    typical_use_nb: "Innkjoepe tjenester direkte knyttet til varesalg/produksjon",
  },

  // ── 5000-series: Loennskostnader ───────────────────────────────────
  {
    number: "5000",
    name_nb: "Loenn til ansatte",
    range_start: 5000,
    range_end: 5099,
    class_nb: "Loenn",
    typical_use_nb: "Fast og variabel loenn, bonus, overtidsbetaling",
  },
  {
    number: "5200",
    name_nb: "Feriepenger",
    range_start: 5200,
    range_end: 5299,
    class_nb: "Loenn",
    typical_use_nb: "Avsatte og utbetalte feriepenger",
  },
  {
    number: "5400",
    name_nb: "Arbeidsgiveravgift",
    range_start: 5400,
    range_end: 5499,
    class_nb: "Loenn",
    typical_use_nb: "Arbeidsgiveravgift paa loenn og feriepenger",
  },
  {
    number: "5600",
    name_nb: "Pensjonskostnader",
    range_start: 5600,
    range_end: 5699,
    class_nb: "Loenn",
    typical_use_nb: "Obligatorisk tjenestepensjon (OTP), innskuddspensjon",
  },
  {
    number: "5800",
    name_nb: "Personalforsikring",
    range_start: 5800,
    range_end: 5899,
    class_nb: "Loenn",
    typical_use_nb: "Yrkesskadeforsikring, gruppelivsforsikring, helseforsikring",
  },
  {
    number: "5900",
    name_nb: "Andre personalkostnader",
    range_start: 5900,
    range_end: 5999,
    class_nb: "Loenn",
    typical_use_nb: "Velferdsarrangementer, arbeidsklaer, kurs for ansatte, kantinekostnader",
  },

  // ── 6000-series: Driftskostnader I ─────────────────────────────────
  {
    number: "6000",
    name_nb: "Avskrivning paa varige driftsmidler",
    range_start: 6000,
    range_end: 6099,
    class_nb: "Avskrivninger",
    typical_use_nb: "Planmessige avskrivninger paa maskiner, inventar, IT-utstyr",
  },
  {
    number: "6100",
    name_nb: "Frakt og transport",
    range_start: 6100,
    range_end: 6199,
    class_nb: "Andre driftskostnader",
    typical_use_nb: "Frakt paa varekjoep, transportkostnader",
  },
  {
    number: "6300",
    name_nb: "Leie lokaler",
    range_start: 6300,
    range_end: 6399,
    class_nb: "Andre driftskostnader",
    typical_use_nb: "Husleie for kontor, lager, butikk",
  },
  {
    number: "6340",
    name_nb: "Lys og varme",
    range_start: 6340,
    range_end: 6359,
    class_nb: "Andre driftskostnader",
    typical_use_nb: "Stroem, fjernvarme, gass",
  },
  {
    number: "6360",
    name_nb: "Renhold",
    range_start: 6360,
    range_end: 6399,
    class_nb: "Andre driftskostnader",
    typical_use_nb: "Rengjoeringskostnader, renovasjon",
  },
  {
    number: "6400",
    name_nb: "Leie maskiner, inventar og transportmidler",
    range_start: 6400,
    range_end: 6499,
    class_nb: "Andre driftskostnader",
    typical_use_nb: "Operasjonell leasing, korttidsleie av utstyr",
  },
  {
    number: "6500",
    name_nb: "Verktoy, inventar og driftsmaterialer",
    range_start: 6500,
    range_end: 6599,
    class_nb: "Andre driftskostnader",
    typical_use_nb: "Smaautstyr under aktiveringsgrensen, forbruksvarer",
  },
  {
    number: "6540",
    name_nb: "Inventar",
    range_start: 6540,
    range_end: 6549,
    class_nb: "Andre driftskostnader",
    typical_use_nb: "Kontormoebler under aktiveringsgrensen",
  },
  {
    number: "6550",
    name_nb: "Datautstyr (under aktiveringsgrensen)",
    range_start: 6550,
    range_end: 6559,
    class_nb: "Andre driftskostnader",
    typical_use_nb: "PC, nettbrett, periferiutstyr under kr 15 000",
  },
  {
    number: "6560",
    name_nb: "Programvare (under aktiveringsgrensen)",
    range_start: 6560,
    range_end: 6569,
    class_nb: "Andre driftskostnader",
    typical_use_nb: "Programvarelisenser, SaaS-abonnementer, skytjenester",
  },
  {
    number: "6600",
    name_nb: "Reparasjon og vedlikehold",
    range_start: 6600,
    range_end: 6699,
    class_nb: "Andre driftskostnader",
    typical_use_nb: "Vedlikehold av bygninger, maskiner, utstyr",
  },
  {
    number: "6700",
    name_nb: "Fremmedtjenester (honorar, konsulent)",
    range_start: 6700,
    range_end: 6799,
    class_nb: "Andre driftskostnader",
    typical_use_nb: "Revisjon, regnskapshonorar, juridisk bistand, konsulenthonorar",
  },
  {
    number: "6800",
    name_nb: "Kontorrekvisita",
    range_start: 6800,
    range_end: 6899,
    class_nb: "Andre driftskostnader",
    typical_use_nb: "Kontorutstyr, papir, tonere, penner, postforsendelser",
  },
  {
    number: "6900",
    name_nb: "Telefon, porto og samband",
    range_start: 6900,
    range_end: 6999,
    class_nb: "Andre driftskostnader",
    typical_use_nb: "Telefonabonnement, mobilabonnement, internett, bredbaand",
  },

  // ── 7000-series: Driftskostnader II ────────────────────────────────
  {
    number: "7000",
    name_nb: "Drivstoff, bil",
    range_start: 7000,
    range_end: 7049,
    class_nb: "Transportkostnader",
    typical_use_nb: "Drivstoff for firmabil, bomavgifter, parkering",
  },
  {
    number: "7020",
    name_nb: "Vedlikehold bil",
    range_start: 7020,
    range_end: 7039,
    class_nb: "Transportkostnader",
    typical_use_nb: "Service, reparasjoner, dekk for firmakjoeretoey",
  },
  {
    number: "7040",
    name_nb: "Forsikring bil",
    range_start: 7040,
    range_end: 7059,
    class_nb: "Transportkostnader",
    typical_use_nb: "Ansvarsforsikring, kaskoforsikring for firmabil",
  },
  {
    number: "7080",
    name_nb: "Bilgodtgjoerelse, kjoeregodtgjoerelse",
    range_start: 7080,
    range_end: 7099,
    class_nb: "Transportkostnader",
    typical_use_nb: "Kilometergodtgjoerelse for ansattes bruk av egen bil",
  },
  {
    number: "7100",
    name_nb: "Reisekostnad, ikke oppgavepliktig",
    range_start: 7100,
    range_end: 7149,
    class_nb: "Reisekostnader",
    typical_use_nb: "Flybilletter, togbilletter, hotell, transport paa tjenestereise",
  },
  {
    number: "7150",
    name_nb: "Diettkostnad, reisekostnad oppgavepliktig",
    range_start: 7150,
    range_end: 7199,
    class_nb: "Reisekostnader",
    typical_use_nb: "Diettgodtgjoerelse, nattillegg ved tjenestereise",
  },
  {
    number: "7300",
    name_nb: "Markedsfoering og reklame",
    range_start: 7300,
    range_end: 7349,
    class_nb: "Salgs- og reklamekostnader",
    typical_vat_code: "1",
    typical_use_nb: "Annonsering, digital markedsfoering, trykksaker, messer",
  },
  {
    number: "7320",
    name_nb: "Aviser, tidsskrifter, boeker",
    range_start: 7320,
    range_end: 7329,
    class_nb: "Salgs- og reklamekostnader",
    typical_use_nb: "Fagblaer, abonnementer, faglitteratur",
  },
  {
    number: "7350",
    name_nb: "Representasjon",
    range_start: 7350,
    range_end: 7399,
    class_nb: "Salgs- og reklamekostnader",
    typical_use_nb:
      "Kundemiddager, gaver til forretningsforbindelser. " +
      "NB: Ingen MVA-fradrag. Skattemessig fradrag maks kr 551 per person.",
  },
  {
    number: "7400",
    name_nb: "Kontingenter og gaver",
    range_start: 7400,
    range_end: 7499,
    class_nb: "Andre driftskostnader",
    typical_use_nb: "Medlemskontingenter, foreningsavgifter, gaaver",
  },
  {
    number: "7500",
    name_nb: "Forsikring",
    range_start: 7500,
    range_end: 7599,
    class_nb: "Andre driftskostnader",
    typical_use_nb: "Bedriftsforsikring, ansvarsforsikring, innboforsikring",
  },
  {
    number: "7600",
    name_nb: "Lisenser, patentkostnader",
    range_start: 7600,
    range_end: 7699,
    class_nb: "Andre driftskostnader",
    typical_use_nb: "Lisensavgifter, patentavgifter (drift, ikke aktiverte)",
  },
  {
    number: "7700",
    name_nb: "Annen kostnad",
    range_start: 7700,
    range_end: 7799,
    class_nb: "Andre driftskostnader",
    typical_use_nb: "Diverse driftskostnader som ikke passer andre konti",
  },
  {
    number: "7770",
    name_nb: "Bank- og kortgebyrer",
    range_start: 7770,
    range_end: 7779,
    class_nb: "Andre driftskostnader",
    typical_use_nb: "Bankgebyr, kortavgifter, betalingsformidlingsgebyr",
  },
  {
    number: "7800",
    name_nb: "Tap paa fordringer",
    range_start: 7800,
    range_end: 7899,
    class_nb: "Andre driftskostnader",
    typical_use_nb: "Konstaterte tap paa kundefordringer, avsetning for tap",
  },
  {
    number: "7830",
    name_nb: "Innkommet paa tidligere avskrevne fordringer",
    range_start: 7830,
    range_end: 7839,
    class_nb: "Andre driftskostnader",
    typical_use_nb: "Innbetaling paa fordringer som tidligere er avskrevet",
  },

  // ── 8000-series: Finans, skatt ─────────────────────────────────────
  {
    number: "8000",
    name_nb: "Finansinntekter",
    range_start: 8000,
    range_end: 8099,
    class_nb: "Finansposter",
    typical_use_nb: "Renteinntekter, bankrente, utbytte fra aksjer",
  },
  {
    number: "8050",
    name_nb: "Annen finansinntekt",
    range_start: 8050,
    range_end: 8099,
    class_nb: "Finansposter",
    typical_use_nb: "Valutagevinst, gevinst ved salg av aksjer/andeler",
  },
  {
    number: "8100",
    name_nb: "Rentekostnad",
    range_start: 8100,
    range_end: 8199,
    class_nb: "Finansposter",
    typical_use_nb: "Rentekostnader paa laan, kassekreditt, leverandoergjeld",
  },
  {
    number: "8150",
    name_nb: "Annen finanskostnad",
    range_start: 8150,
    range_end: 8199,
    class_nb: "Finansposter",
    typical_use_nb: "Valutatap, tap paa aksjer/andeler, nedskrivning av finansielle eiendeler",
  },
  {
    number: "8300",
    name_nb: "Betalbar skatt",
    range_start: 8300,
    range_end: 8399,
    class_nb: "Skattekostnad",
    typical_use_nb: "Betalbar inntektsskatt (selskapsskatt 22 %)",
  },
  {
    number: "8320",
    name_nb: "Endring utsatt skatt",
    range_start: 8320,
    range_end: 8339,
    class_nb: "Skattekostnad",
    typical_use_nb: "Endring i utsatt skattefordel / utsatt skatt",
  },
  {
    number: "8800",
    name_nb: "Aarsoverkudd/-underskudd",
    range_start: 8800,
    range_end: 8899,
    class_nb: "Resultatdisponering",
    typical_use_nb: "Aarsresultat, overfoering til/fra egenkapital",
  },
  {
    number: "8960",
    name_nb: "Overforinger, annen egenkapital",
    range_start: 8960,
    range_end: 8999,
    class_nb: "Resultatdisponering",
    typical_use_nb: "Overfoering til/fra fri egenkapital, fond",
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Find the account class for a given account number.
 */
export function getAccountClass(accountNumber: number): AccountClass | null {
  return (
    ACCOUNT_CLASSES.find(
      (c) => accountNumber >= c.range_start && accountNumber <= c.range_end
    ) ?? null
  );
}

/**
 * Find the closest standard account for a given account number.
 * Returns the standard account whose range contains the number,
 * preferring an exact match.
 */
export function findStandardAccount(
  accountNumber: number
): StandardAccountDefinition | null {
  // Exact match first
  const exact = STANDARD_ACCOUNTS.find(
    (a) => a.number === String(accountNumber)
  );
  if (exact) return exact;

  // Range match — return the most specific (smallest range)
  const matches = STANDARD_ACCOUNTS.filter(
    (a) => accountNumber >= a.range_start && accountNumber <= a.range_end
  );
  if (matches.length === 0) return null;

  return matches.reduce((best, cur) => {
    const bestRange = best.range_end - best.range_start;
    const curRange = cur.range_end - cur.range_start;
    return curRange < bestRange ? cur : best;
  });
}

/**
 * Search standard accounts by keyword in name or typical use.
 */
export function searchStandardAccounts(
  keyword: string
): StandardAccountDefinition[] {
  const lower = keyword.toLowerCase();
  return STANDARD_ACCOUNTS.filter(
    (a) =>
      a.name_nb.toLowerCase().includes(lower) ||
      a.typical_use_nb.toLowerCase().includes(lower) ||
      a.class_nb.toLowerCase().includes(lower)
  );
}
