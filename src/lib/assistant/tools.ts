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
  tool("get_data_coverage",
    "Hvilke regnskapsdata selskapet faktisk har: hvilken periode bokføringen dekker, hvilke regnskapsår som er importert, antall posteringer, kontoer, kunder og leverandører. Bruk denne FØRST hvis du er usikker på om en periode finnes, eller hvis et annet verktøy melder at det mangler data.",
    { properties: {} }),

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

  tool("get_customer_detail",
    "Alt om én kunde, slått opp på navn: utestående saldo, omsetning i perioden, omsetning per måned, hva kunden kjøper og siste aktivitet.",
    { properties: { name: { type: "string", description: "Kundens navn slik brukeren skriver det. Delvis treff støttes." } }, required: ["name"] }),

  tool("list_customers",
    "Selskapets kunder med omsetning og utestående saldo. Bruk denne for spørsmål som «hvem er våre største kunder» eller «hvem skylder oss mest».",
    { properties: { sort_by: { type: "string", description: '"revenue" (standard) eller "outstanding".' }, limit: { type: "number", description: "Antall kunder å returnere (standard 20, maks 100)." } } }),

  tool("get_recurring_revenue",
    "Gjentakende inntekter: MRR per måned, ARR, endring fra forrige måned, og hvor stor andel av omsetningen som er gjentakende. Kvartals-, halvårs- og årskontrakter er normalisert ned til månedsbeløp.",
    { properties: {} }),

  tool("get_cash_position",
    "Bokført bankbeholdning: saldo per bankkonto ved periodens slutt og utviklingen måned for måned.",
    { properties: {} }),

  tool("get_account_balances",
    "Inngående og utgående saldo per konto — balansen slik regnskapet oppgir den. Kan avgrenses til en kontoklasse.",
    { properties: { account_prefix: { type: "string", description: "Valgfritt kontoprefiks, f.eks. \"15\" for kundefordringer eller \"19\" for bank." } } }),

  tool("search_transactions",
    "Fritekstsøk i posteringene. Bruk denne for spørsmål som «hva har vi betalt til X» eller «finn alle posteringer med Y i teksten».",
    { properties: { text: { type: "string", description: "Søketekst mot posteringsbeskrivelse." }, period: periodParam, limit: { type: "number", description: "Antall treff (standard 50, maks 200)." } } }),

  tool("get_overdue_invoices",
    "Sjekker om forfalte fakturaer kan beregnes. Merk: en SAF-T-import inneholder ikke forfallsdato per faktura, så dette verktøyet vil normalt svare at forfallsinformasjon ikke finnes. Bruk get_customer_receivables for utestående saldo.",
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

  tool("get_budget",
    "Henter selskapets budsjett: budsjettert beløp per kategori per måned, faktiske tall så langt, avvik, budsjettert resultat og estimert likviditet. Bruk denne for alle spørsmål om budsjett.",
    { properties: { budget_id: { type: "string", description: "Valgfri budsjett-ID. Uten denne brukes det nyeste budsjettet." } } }),

  tool("propose_budget_change",
    "Regner ut hva en foreslått budsjettendring vil bety, og returnerer et forslag brukeren må bekrefte. Endrer ALDRI budsjettet direkte. Bruk denne når brukeren ber om endringer som «øk salgsbudsjettet med 10 %», «legg inn en ny ansatt fra mars med 700 000 i lønn», eller «hva skjer hvis salget blir 20 % lavere».",
    {
      properties: {
        budget_id: { type: "string", description: "Valgfri budsjett-ID. Uten denne brukes det nyeste budsjettet." },
        change_type: {
          type: "string",
          description:
            'Type endring: "adjust_percent" (juster en kategori med prosent), "set_annual" (sett årsbeløp for en kategori), "add_cost" (ny fast månedlig kostnad), "add_employee" (ny ansatt).',
        },
        category_key: {
          type: "string",
          description:
            'Kategori: revenue, other_revenue, cogs, payroll, employer_costs, premises, it_software, consultants, sales_marketing, travel, vehicles, office, equipment, depreciation, other_costs.',
        },
        percent: { type: "number", description: "Prosentendring for adjust_percent." },
        amount: { type: "number", description: "Årsbeløp for set_annual, månedsbeløp for add_cost, årslønn for add_employee." },
        from_month: { type: "number", description: "Måned 1–12 endringen gjelder fra." },
        name: { type: "string", description: "Navn på kostnaden eller stillingen." },
      },
      required: ["change_type"],
    }),

  tool("run_scenario",
    'Kjører en "hva om"-analyse: simulerer effekten av en endring (ny ansettelse, investering, prisendring) på økonomi og likviditet.',
    { properties: { parameters: { type: "object", description: "Scenarioparametre. Eksempler: { type: 'new_hire', monthly_salary: 50000 } eller { type: 'investment', amount: 200000 }.", properties: { type: { type: "string", description: 'Scenariotype: "new_hire", "investment", "price_change", "cost_reduction", "revenue_growth", "custom".' } } } }, required: ["parameters"] }),
];
