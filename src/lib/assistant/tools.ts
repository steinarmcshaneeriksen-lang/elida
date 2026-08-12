/**
 * Assistant Tool Definitions
 *
 * Structured tool array in OpenAI function-calling format.
 * Each tool has a type, function name, description, and parameters (JSON Schema).
 * The handlers live in tool-handlers.ts.
 */

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

// ---------------------------------------------------------------------------
// Period parameter schema reused across financial tools
// ---------------------------------------------------------------------------

const periodParam = {
  type: "string" as const,
  description:
    'Tidsperiode. Gyldige verdier: "this_month", "last_month", "this_quarter", "last_quarter", "this_year", "last_year", "ytd", eller "YYYY-MM" for spesifikk måned, "YYYY-QN" for kvartal.',
};

const comparisonParam = {
  type: "string" as const,
  description:
    'Sammenligningsperiode. "previous_period", "same_period_last_year", eller spesifikk periode som for period-parameteret.',
};

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

function tool(name: string, description: string, parameters: { properties: Record<string, unknown>; required?: string[] }): ToolDefinition {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: { type: "object", ...parameters },
    },
  };
}

export const TOOLS: ToolDefinition[] = [
  tool("get_financial_summary",
    "Henter en helhetlig finansiell oppsummering for en gitt periode: omsetning, kostnader, resultat, kontantbeholdning, utestående fordringer og gjeld. Bruk denne for generelle spørsmål om hvordan det går.",
    { properties: { period: periodParam }, required: ["period"] }),

  tool("get_revenue_analysis",
    "Detaljert inntektsanalyse: total omsetning, fordelt per konto/kategori, trend over tid, og sammenligning med en annen periode.",
    { properties: { period: periodParam, comparison: comparisonParam }, required: ["period"] }),

  tool("get_profit_analysis",
    "Resultatanalyse: bruttofortjeneste, driftsresultat, nettoresultat, marginer, og sammenligning med en annen periode.",
    { properties: { period: periodParam, comparison: comparisonParam }, required: ["period"] }),

  tool("get_cost_analysis",
    "Kostnadsanalyse: totale kostnader fordelt per kategori (varekost, lønn, husleie, etc.), største kostnadsposter, og sammenligning.",
    { properties: { period: periodParam, comparison: comparisonParam }, required: ["period"] }),

  tool("get_account_breakdown",
    "Detaljert nedbrytning av en bestemt konto eller kontokategori: saldo, transaksjoner, og trend.",
    { properties: { account_or_category: { type: "string", description: "Kontonummer (f.eks. '3000') eller kategorinøkkel (f.eks. 'revenue', 'salary_costs')." }, period: periodParam }, required: ["account_or_category", "period"] }),

  tool("get_customer_receivables",
    "Oversikt over utestående kundefordringer: total, aldersfordelt (0-30, 31-60, 61-90, 90+ dager), største debitorer.",
    { properties: {} }),

  tool("get_customer_payment_profile",
    "Betalingsprofil for en bestemt kunde: gjennomsnittlig betalingstid, forfalte fakturaer, betalingshistorikk, risikoscore.",
    { properties: { customer_id: { type: "string", description: "Kunde-ID fra databasen." } }, required: ["customer_id"] }),

  tool("get_overdue_invoices",
    "Liste over alle forfalte fakturaer med detaljer: kunde, beløp, forfallsdato, dager over forfall.",
    { properties: {} }),

  tool("get_supplier_payables",
    "Oversikt over leverandørgjeld: total, aldersfordelt, kommende forfall, største kreditorer.",
    { properties: {} }),

  tool("get_upcoming_obligations",
    "Kommende betalingsforpliktelser innen angitt antall dager: leverandørfakturaer, lønn, MVA-termin, skatt, faste kostnader.",
    { properties: { days: { type: "number", description: "Antall dager fremover å se på (standard 30)." } } }),

  tool("get_cash_forecast",
    "Kontantstrømprognose for de neste N dagene: forventet inn, forventet ut, estimert saldo per dag/uke.",
    { properties: { days: { type: "number", description: "Prognosehorisont i dager (standard 30, maks 90)." } } }),

  tool("get_vat_estimate",
    "Estimert MVA-oppgjør for inneværende termin: utgående MVA, inngående MVA, netto å betale/tilgode, frist.",
    { properties: {} }),

  tool("get_tax_estimate",
    "Estimert skatt for inneværende år basert på hittil bokført resultat.",
    { properties: {} }),

  tool("get_chart_of_accounts",
    "Henter selskapets kontoplan fra regnskapssystemet. Brukes for å gi konkrete kontoanbefalinger.",
    { properties: {} }),

  tool("find_similar_vendor_transactions",
    "Finner tidligere transaksjoner for en leverandør for å se hvordan tilsvarende bilag har vært bokført.",
    { properties: { vendor_name: { type: "string", description: "Leverandørnavn (delvis treff støttes)." } }, required: ["vendor_name"] }),

  tool("find_similar_description_transactions",
    "Finner transaksjoner med lignende beskrivelse for å identifisere vanlig kontering.",
    { properties: { text: { type: "string", description: "Søketekst fra bilagsbeskrivelse." } }, required: ["text"] }),

  tool("get_vendor_posting_history",
    "Henter den vanligste posteringsmåten for en leverandør: typisk konto, MVA-kode, og kategori basert på historikk.",
    { properties: { vendor_name: { type: "string", description: "Leverandørnavn." } }, required: ["vendor_name"] }),

  tool("search_accounting_rules",
    "Søker i regnskapsregler og norsk bokføringslov etter relevant veiledning for et emne (f.eks. MVA-fradrag, representasjon, firmabil).",
    { properties: { topic: { type: "string", description: "Emne å søke etter (f.eks. 'representasjon', 'firmabil', 'mva fradrag')." } }, required: ["topic"] }),

  tool("run_scenario",
    'Kjører en "hva om"-analyse: simulerer effekten av en endring (ny ansettelse, investering, prisendring) på økonomi og likviditet.',
    { properties: { parameters: { type: "object", description: "Scenarioparametre. Eksempler: { type: 'new_hire', monthly_salary: 50000 } eller { type: 'investment', amount: 200000 }.", properties: { type: { type: "string", description: 'Scenariotype: "new_hire", "investment", "price_change", "cost_reduction", "revenue_growth", "custom".' } } } }, required: ["parameters"] }),
];
