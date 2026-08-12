/**
 * Norwegian Accounting Principles Reference
 *
 * Structured data covering key Norwegian accounting principles relevant to
 * the advisor: capitalization thresholds, depreciation rules, periodization,
 * and revenue recognition.
 *
 * Based on:
 * - Regnskapsloven (rskl.) of 17 July 1998 no. 56
 * - Norsk RegnskapsStandard (NRS)
 * - Skatteloven (sktl.)
 * - Skattedirektoratets retningslinjer
 *
 * All monetary thresholds are in NOK.
 */

import type { AccountingRuleDefinition } from "../types";

// ---------------------------------------------------------------------------
// Capitalization vs. expense
// ---------------------------------------------------------------------------

export const CAPITALIZATION_THRESHOLD_NOK = 15_000;
export const CAPITALIZATION_USEFUL_LIFE_YEARS = 3;

export const capitalizationRules: AccountingRuleDefinition[] = [
  {
    id: "cap-001",
    category: "capitalization",
    title_nb: "Aktiveringsgrense for driftsmidler",
    description_nb:
      "Driftsmidler med kostpris under kr 15 000 (ekskl. MVA) kan kostnadsfoeres " +
      "direkte. Driftsmidler med kostpris lik eller over kr 15 000 og forventet " +
      "levetid over 3 aar skal normalt aktiveres og avskrives. " +
      "Ref. sktl. § 14-40 (1) bokstav a.",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "Skatteloven § 14-40 (1) bokstav a",
    thresholds: {
      min_amount_nok: CAPITALIZATION_THRESHOLD_NOK,
      min_useful_life_years: CAPITALIZATION_USEFUL_LIFE_YEARS,
    },
  },
  {
    id: "cap-002",
    category: "capitalization",
    title_nb: "Samlet anskaffelse",
    description_nb:
      "Dersom det kjoepes flere like eiendeler samtidig (f.eks. 10 stoler " +
      "à kr 5 000), vurderes det om samlet kostpris overstiger " +
      "aktiveringsgrensen. Hvert enkelt driftsmiddel maa vurderes, men " +
      "funksjonelt sammensatte enheter sees under ett.",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "Skattedirektoratets uttalelser",
  },
  {
    id: "cap-003",
    category: "capitalization",
    title_nb: "Paakosting vs. vedlikehold",
    description_nb:
      "Kostnader som oeker eiendelens kapasitet, levetid eller standard " +
      "utover opprinnelig stand er paakosting og skal aktiveres. " +
      "Kostnader som opprettholder opprinnelig stand er vedlikehold " +
      "og kostnadsfoeres loepende.",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "NRS 8 / Skatteloven § 6-11",
  },
];

// ---------------------------------------------------------------------------
// Depreciation (skattemessig saldoavskrivning)
// ---------------------------------------------------------------------------

export interface DepreciationGroup {
  /** Saldogruppe-bokstav. */
  group: string;
  name_nb: string;
  max_rate_percent: number;
  examples_nb: string[];
}

/**
 * Saldogrupper for skattemessige avskrivninger (sktl. § 14-43).
 * Satsene er maksimalsatser.
 */
export const DEPRECIATION_GROUPS: DepreciationGroup[] = [
  {
    group: "a",
    name_nb: "Kontormaskiner og lignende",
    max_rate_percent: 30,
    examples_nb: [
      "PC-er og nettbrett",
      "Skrivere og kopimaskiner",
      "Servere",
      "Mobiltelefoner",
      "Programvare (aktivert)",
    ],
  },
  {
    group: "b",
    name_nb: "Ervervet forretningsverdi (goodwill)",
    max_rate_percent: 20,
    examples_nb: ["Goodwill ved virksomhetsovertagelse"],
  },
  {
    group: "c",
    name_nb: "Vogntog, lastebiler, busser, varebiler",
    max_rate_percent: 24,
    examples_nb: [
      "Lastebiler",
      "Varebiler",
      "Busser",
      "Tilhengere og semitrailere",
    ],
  },
  {
    group: "d",
    name_nb: "Personbiler, maskiner, inventar mv.",
    max_rate_percent: 20,
    examples_nb: [
      "Personbiler",
      "Kontormoebler",
      "Produksjonsmaskiner",
      "Verktoy over aktiveringsgrensen",
      "Inventar",
    ],
  },
  {
    group: "e",
    name_nb: "Skip, fartoy, rigger mv.",
    max_rate_percent: 14,
    examples_nb: ["Skip", "Rigger", "Floetere"],
  },
  {
    group: "f",
    name_nb: "Fly, helikopter",
    max_rate_percent: 12,
    examples_nb: ["Fly", "Helikoptre"],
  },
  {
    group: "h",
    name_nb: "Bygg og anlegg, hotell, losjihus, bevertningssted mv.",
    max_rate_percent: 4,
    examples_nb: [
      "Forretningsbygg",
      "Lagerbygg",
      "Hotell",
      "Restaurantlokaler",
    ],
  },
  {
    group: "i",
    name_nb: "Forretningsbygg (inkl. elektrisitet, vann, gass)",
    max_rate_percent: 2,
    examples_nb: ["Kontorbygg", "Butikklokaler"],
  },
  {
    group: "j",
    name_nb: "Tekniske installasjoner i bygg",
    max_rate_percent: 10,
    examples_nb: [
      "Ventilasjonsanlegg",
      "Heiser",
      "Elektriske anlegg i bygg",
      "Varmeanlegg",
    ],
  },
];

/**
 * Find the most likely depreciation group for a given asset type keyword.
 */
export function findDepreciationGroup(
  assetKeywords: string[]
): DepreciationGroup | null {
  const lower = assetKeywords.map((k) => k.toLowerCase());

  for (const group of DEPRECIATION_GROUPS) {
    for (const example of group.examples_nb) {
      const exLower = example.toLowerCase();
      if (lower.some((kw) => exLower.includes(kw) || kw.includes(exLower))) {
        return group;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Periodization rules
// ---------------------------------------------------------------------------

export const periodizationRules: AccountingRuleDefinition[] = [
  {
    id: "per-001",
    category: "periodization",
    title_nb: "Periodisering av forskuddsbetalte kostnader",
    description_nb:
      "Kostnader som dekker mer enn en regnskapsperiode (typisk 1 mnd) " +
      "skal periodiseres. Eksempler: forsikring betalt aarlig, " +
      "leie betalt forskudd, aarsabonnementer. " +
      "Forholdsmessig del foeres som kostnad per maned, " +
      "resten som forskuddsbetalt kostnad (balansekonto 17xx).",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "Regnskapsloven § 4-1, NRS 2",
  },
  {
    id: "per-002",
    category: "periodization",
    title_nb: "Vesentlighetsgrense for periodisering",
    description_nb:
      "Poster under et vesentlighetsbeloep (typisk kr 50 000 for smaa " +
      "selskaper) kan vurderes kostnadsfoert direkte uten periodisering, " +
      "forutsatt at det er konsistent praksis og ikke vesentlig " +
      "paavirker regnskapet.",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "NRS 8 God regnskapsskikk for smaa foretak",
    thresholds: {
      materiality_small_company_nok: 50_000,
    },
  },
  {
    id: "per-003",
    category: "periodization",
    title_nb: "Paaloepte, ikke-fakturerte kostnader",
    description_nb:
      "Kostnader som er paaloept i perioden men ennaa ikke fakturert " +
      "skal avsettes som gjeld (konto 29xx). Eksempler: revisjonshonorar, " +
      "stroemforbruk, telefonkostnader.",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "Regnskapsloven § 4-1",
  },
];

// ---------------------------------------------------------------------------
// Revenue recognition
// ---------------------------------------------------------------------------

export const revenueRecognitionRules: AccountingRuleDefinition[] = [
  {
    id: "rev-001",
    category: "revenue_recognition",
    title_nb: "Opptjeningsprinsippet",
    description_nb:
      "Inntekt skal resultatfoeres naar den er opptjent, uavhengig av " +
      "betalingstidspunkt. For salg av varer: ved levering. " +
      "For tjenester: etter hvert som tjenesten utfoeres.",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "Regnskapsloven § 4-1 (1) nr. 2",
  },
  {
    id: "rev-002",
    category: "revenue_recognition",
    title_nb: "Loepende tjenesteyting",
    description_nb:
      "Inntekter fra loepende tjenester (abonnementer, support-avtaler, " +
      "vedlikeholdskontrakter) periodiseres over avtaleperioden. " +
      "Forskuddsbetaling foeres som uopptjent inntekt (konto 29xx).",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "NRS 2 Anleggskontrakter / NRS(V) Inntekt",
  },
  {
    id: "rev-003",
    category: "revenue_recognition",
    title_nb: "Anleggskontrakter",
    description_nb:
      "Langsiktige tilvirkningskontrakter kan inntektsfoeres etter " +
      "loepende avregnings metode (forekommen) eller fullfoert " +
      "kontrakts metode. Smaa foretak kan velge fritt.",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "NRS 2 Anleggskontrakter",
  },
];

// ---------------------------------------------------------------------------
// All rules combined
// ---------------------------------------------------------------------------

export const ALL_ACCOUNTING_PRINCIPLES: AccountingRuleDefinition[] = [
  ...capitalizationRules,
  ...periodizationRules,
  ...revenueRecognitionRules,
];

/**
 * Check if an amount should be capitalized based on the Norwegian threshold.
 *
 * @param amountExVat Amount excluding MVA, in NOK
 * @param usefulLifeYears Expected useful life in years
 * @returns true if the asset should be capitalized
 */
export function shouldCapitalize(
  amountExVat: number,
  usefulLifeYears: number
): boolean {
  return (
    amountExVat >= CAPITALIZATION_THRESHOLD_NOK &&
    usefulLifeYears >= CAPITALIZATION_USEFUL_LIFE_YEARS
  );
}

/**
 * Check if a cost should be periodized.
 *
 * @param amount Total amount in NOK
 * @param coverageMonths Number of months the cost covers
 * @param materialityThreshold Company-specific materiality threshold
 * @returns true if the cost should be periodized across months
 */
export function shouldPeriodize(
  amount: number,
  coverageMonths: number,
  materialityThreshold: number = 50_000
): boolean {
  if (coverageMonths <= 1) return false;
  if (amount < materialityThreshold) return false;
  return true;
}
