/**
 * Norwegian VAT (MVA) Rules
 *
 * Comprehensive reference for Norwegian merverdiavgift rules, covering
 * standard rates, reduced rates, zero-rated supplies, exempt services,
 * reverse charge, representation limits, and private use restrictions.
 *
 * Based on:
 * - Merverdiavgiftsloven (mval.) of 19 June 2009 no. 58
 * - Merverdiavgiftsforskriften
 * - Skattedirektoratets MVA-håndbok
 *
 * All rates and thresholds are current as of 2026.
 */

import type { VatRuleDefinition } from "../types";

// ---------------------------------------------------------------------------
// Rate constants
// ---------------------------------------------------------------------------

/** Standard MVA rate. */
export const VAT_RATE_STANDARD = 25;

/** Reduced rate for food and non-alcoholic beverages. */
export const VAT_RATE_FOOD = 15;

/** Reduced rate for passenger transport, cinema, accommodation. */
export const VAT_RATE_LOW = 12;

/** Zero-rated (0 %) — the supplier is VAT-registered but rate is 0. */
export const VAT_RATE_ZERO = 0;

/** Representation deduction limit per event. */
export const REPRESENTATION_LIMIT_PER_PERSON_NOK = 551;

/**
 * Annual registration threshold for VAT in Norway.
 * Businesses with taxable turnover exceeding this within 12 months
 * must register for MVA.
 */
export const VAT_REGISTRATION_THRESHOLD_NOK = 50_000;

// ---------------------------------------------------------------------------
// VAT rules
// ---------------------------------------------------------------------------

export const vatRules: VatRuleDefinition[] = [
  // ── Standard rate ────────────────────────────────────────────────────
  {
    id: "vat-001",
    rate: 25,
    category: "standard",
    title_nb: "Alminnelig sats",
    description_nb:
      "Standardsats på 25 % gjelder for de fleste varer og tjenester " +
      "som omsettes i Norge, med mindre det finnes en særskilt fritatt " +
      "eller redusert sats.",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "Merverdiavgiftsloven § 5-1",
    deductible: true,
  },

  // ── Reduced rate: food ───────────────────────────────────────────────
  {
    id: "vat-002",
    rate: 15,
    category: "food",
    title_nb: "Redusert sats for næringsmidler",
    description_nb:
      "15 % MVA gjelder for næringsmidler (mat og alkoholfrie drikkevarer). " +
      "Unntatt er serveringstjenester (servering på restaurant/kafé) " +
      "som har 25 %. Tobakk har 25 %.",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "Merverdiavgiftsloven § 5-2",
    deductible: true,
  },

  // ── Reduced rate: transport/accommodation/cinema ─────────────────────
  {
    id: "vat-003",
    rate: 12,
    category: "transport_accommodation",
    title_nb: "Lav sats for persontransport, overnatting og kino",
    description_nb:
      "12 % MVA gjelder for persontransport (buss, tog, ferge, fly innenlands), " +
      "utleie av rom i hotell/camping, formidling av overnatting, " +
      "og adgang til kino. NRK-lisens er også 12 %.",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "Merverdiavgiftsloven § 5-3, § 5-4, § 5-5",
    deductible: true,
  },

  // ── Zero-rated exports ───────────────────────────────────────────────
  {
    id: "vat-004",
    rate: 0,
    category: "export",
    title_nb: "Nullsats ved eksport",
    description_nb:
      "Eksport av varer og visse tjenester er fritatt med nullsats (0 %). " +
      "Selger fakturerer uten MVA, men har full fradragsrett for " +
      "inngående MVA på anskaffelser knyttet til eksporten.",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "Merverdiavgiftsloven § 6-21, § 6-22",
    deductible: true,
  },

  // ── Exempt: financial services ───────────────────────────────────────
  {
    id: "vat-005",
    rate: 0,
    category: "exempt_financial",
    title_nb: "Unntatt: finansielle tjenester",
    description_nb:
      "Finansielle tjenester (bank, forsikring, verdipapirhandel) " +
      "er unntatt fra MVA. Det beregnes ikke utgående MVA, og " +
      "kjøper har ikke fradragsrett. Merk: dette er ulikt fra nullsats.",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "Merverdiavgiftsloven § 3-6",
    deductible: false,
    special_conditions:
      "Unntatt omsetning gir ikke rett til MVA-fradrag på inngående MVA.",
  },

  // ── Exempt: health services ──────────────────────────────────────────
  {
    id: "vat-006",
    rate: 0,
    category: "exempt_health",
    title_nb: "Unntatt: helse- og sosialtjenester",
    description_nb:
      "Helsetjenester, sosiale tjenester, og tannlegetjenester er " +
      "unntatt MVA. Gjelder også alternativ behandling dersom " +
      "utøvet av autorisert personell.",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "Merverdiavgiftsloven § 3-2, § 3-4",
    deductible: false,
  },

  // ── Exempt: education ────────────────────────────────────────────────
  {
    id: "vat-007",
    rate: 0,
    category: "exempt_education",
    title_nb: "Unntatt: undervisning",
    description_nb:
      "Undervisningstjenester er unntatt MVA. Gjelder formell " +
      "undervisning (skole, universitet) og kompetansehevende kurs " +
      "som følger en plan og har en viss varighet. " +
      "Konsulentbistand og enkeltforedrag er normalt avgiftspliktige.",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "Merverdiavgiftsloven § 3-5",
    deductible: false,
  },

  // ── Exempt: real estate ──────────────────────────────────────────────
  {
    id: "vat-008",
    rate: 0,
    category: "exempt_real_estate",
    title_nb: "Unntatt: fast eiendom",
    description_nb:
      "Utleie av fast eiendom er som hovedregel unntatt MVA. " +
      "Frivillig registrering er mulig for utleie til " +
      "MVA-registrerte leietakere (mval. § 2-3).",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "Merverdiavgiftsloven § 3-11, § 2-3",
    deductible: false,
    special_conditions:
      "Frivillig registrert utleier kan kreve fradrag for inngående MVA " +
      "på kostnader knyttet til den avgiftspliktige utleievirksomheten.",
  },

  // ── Reverse charge: services from abroad ─────────────────────────────
  {
    id: "vat-009",
    rate: 25,
    category: "reverse_charge_services",
    title_nb: "Snudd avregning: tjenester kjøpt fra utlandet",
    description_nb:
      "Når en norsk næringsdrivende kjøper fjernleverbare tjenester " +
      "fra utlandet (f.eks. SaaS, konsulentbistand, reklametjenester), " +
      "skal kjøperen selv beregne og rapportere MVA " +
      "(snudd avregning / reverse charge). Faktura fra leverandør " +
      "er uten MVA. Kjøper beregner 25 % utgående MVA og har " +
      "normalt tilsvarende fradrag for inngående MVA (netto null).",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "Merverdiavgiftsloven § 3-30, § 11-3",
    deductible: true,
    special_conditions:
      "Gjelder fjernleverbare tjenester. For import av varer, " +
      "se egne regler for innførsels-MVA.",
  },

  // ── Import VAT on goods ──────────────────────────────────────────────
  {
    id: "vat-010",
    rate: 25,
    category: "import_goods",
    title_nb: "Innførsels-MVA på varer",
    description_nb:
      "Ved import av varer til Norge beregnes innførsels-MVA. " +
      "For MVA-registrerte virksomheter rapporteres dette via " +
      "MVA-meldingen (ikke betales ved grensen). " +
      "Satsen er 25 % (eller redusert sats for næringsmidler).",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "Merverdiavgiftsloven § 3-29, skatteforvaltningsloven",
    deductible: true,
    special_conditions:
      "MVA-registrerte foretak rapporterer innførsels-MVA i MVA-meldingen " +
      "og har normalt full fradragsrett.",
  },

  // ── Representation limits ────────────────────────────────────────────
  {
    id: "vat-011",
    rate: 25,
    category: "representation",
    title_nb: "Representasjon: begrenset MVA-fradrag",
    description_nb:
      "Kostnader til representasjon (kundemiddager, gaver til " +
      "forretningsforbindelser) gir IKKE rett til MVA-fradrag, " +
      "uavhengig av beløp. Kostnadsfradrag i skatteregnskapet " +
      "er begrenset til kr 551 per person per tilstelning (2026). " +
      "Enkel servering (kaffe, kaker) ved forretningsmøter " +
      "er fradragsberettiget og regnes ikke som representasjon.",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "Skatteloven § 6-21, FSFIN § 6-21, mval. § 8-3 (1) bokstav d",
    deductible: false,
    special_conditions:
      "Grensen på kr 551 per person gjelder skattemessig fradrag. " +
      "MVA-fradrag er fullstendig avskåret for representasjon.",
  },

  // ── Private use ──────────────────────────────────────────────────────
  {
    id: "vat-012",
    rate: 25,
    category: "private_use",
    title_nb: "Privat bruk: ingen MVA-fradrag",
    description_nb:
      "Anskaffelser til privat bruk gir ikke rett til MVA-fradrag. " +
      "Ved blandet bruk (næring og privat) må det foretas en " +
      "forholdsmessig fordeling. Uttak til privat bruk er avgiftspliktig.",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "Merverdiavgiftsloven § 8-1, § 3-21, § 3-22",
    deductible: false,
  },

  // ── Vehicle restrictions ─────────────────────────────────────────────
  {
    id: "vat-013",
    rate: 25,
    category: "vehicle",
    title_nb: "Personbil: avskåret MVA-fradrag",
    description_nb:
      "Det er ikke fradragsrett for inngående MVA på anskaffelse " +
      "og drift av personkjøretøy. Unntak gjelder for " +
      "yrkeskjøretøy (drosje, varebil klasse 2, lastebil). " +
      "Drivstoff, bompenger og parkering følger kjøretøyets status.",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "Merverdiavgiftsloven § 8-4",
    deductible: false,
    special_conditions:
      "Varebil klasse 2 og lastebil har full fradragsrett. " +
      "Personbil inkl. varebil klasse 1 har ikke fradragsrett.",
  },

  // ── Welfare/social costs for employees ───────────────────────────────
  {
    id: "vat-014",
    rate: 25,
    category: "employee_welfare",
    title_nb: "Velferdstiltak for ansatte",
    description_nb:
      "Rimelige velferdstiltak for alle ansatte (sommerfest, julebord, " +
      "firmatur) gir rett til MVA-fradrag. Bevertning av ansatte " +
      "i forbindelse med overtid gir også fradrag. " +
      "Private arrangementer for enkeltansatte gir ikke fradrag.",
    effective_from: "2024-01-01",
    jurisdiction: "NO",
    source: "Merverdiavgiftsloven § 8-3 (1) bokstav e, Skattedirektoratets uttalelser",
    deductible: true,
    special_conditions:
      "Må være rimelig velferdstiltak for alle eller en gruppe ansatte. " +
      "Personlige gaver og tilstelninger faller utenfor.",
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Find the most applicable VAT rule for a given category.
 */
export function findVatRule(category: string): VatRuleDefinition | null {
  return vatRules.find((r) => r.category === category) ?? null;
}

/**
 * Determine if a purchase from a foreign supplier requires reverse charge.
 *
 * @param supplierCountry ISO 3166-1 alpha-2 country of the supplier
 * @param isService True if the purchase is a service (not a physical good)
 */
export function requiresReverseCharge(
  supplierCountry: string | undefined | null,
  isService: boolean
): boolean {
  if (!supplierCountry) return false;
  const isNorwegian = supplierCountry.toUpperCase() === "NO";
  if (isNorwegian) return false;

  // Foreign services require reverse charge
  if (isService) return true;

  // Foreign goods use import VAT, not reverse charge per se,
  // but for practical purposes the advisor treats both as "buyer calculates MVA"
  return false;
}

/**
 * Determine the standard VAT rate for a given good/service category.
 * Returns the rate as a percentage (e.g. 25, 15, 12, 0).
 */
export function getStandardVatRate(
  category:
    | "standard"
    | "food"
    | "transport_accommodation"
    | "export"
    | "exempt"
): number {
  switch (category) {
    case "standard":
      return VAT_RATE_STANDARD;
    case "food":
      return VAT_RATE_FOOD;
    case "transport_accommodation":
      return VAT_RATE_LOW;
    case "export":
      return VAT_RATE_ZERO;
    case "exempt":
      return VAT_RATE_ZERO;
  }
}

/**
 * Check if VAT deduction is allowed for a given category.
 */
export function isVatDeductible(category: string): boolean {
  const rule = findVatRule(category);
  return rule?.deductible ?? true;
}
