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
  /**
   * What the chat shows while this runs, in Norwegian and in the present
   * tense: "Estimerer MVA", not "get_vat_estimate".
   *
   * It lives beside the definition rather than in a lookup inside the chat
   * component, because a separate list drifts. Nine of the tools were missing
   * from that list and fell back to printing their own function name at the
   * reader, who saw "get_data_coverage" sitting between two Norwegian
   * phrases. Here, adding a tool means writing its label, and verify.ts fails
   * if one is missing.
   */
  label: string;
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

function tool(
  name: string,
  description: string,
  parameters: { properties: Record<string, unknown>; required?: string[] },
  label: string
): ToolDefinition {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: { type: "object", ...parameters },
    },
    label,
  };
}

export const TOOLS: ToolDefinition[] = [
  tool("get_data_coverage",
    "Hvilke regnskapsdata selskapet faktisk har: hvilken periode bokføringen dekker, hvilke regnskapsår som er importert, antall posteringer, kontoer, kunder og leverandører. Bruk denne FØRST hvis du er usikker på om en periode finnes, eller hvis et annet verktøy melder at det mangler data.",
    { properties: {} },
    "Sjekker hvilke data som finnes"),

  tool("get_financial_summary",
    "Henter en helhetlig finansiell oppsummering for en gitt periode: omsetning, kostnader, resultat, kontantbeholdning, utestående fordringer og gjeld. Bruk denne for generelle spørsmål om hvordan det går.",
    { properties: { period: periodParam }, required: ["period"] },
    "Henter økonomisammendrag"),

  tool("get_revenue_analysis",
    "Detaljert inntektsanalyse: total omsetning, fordelt per konto/kategori, trend over tid, og sammenligning med en annen periode.",
    { properties: { period: periodParam, comparison: comparisonParam }, required: ["period"] },
    "Analyserer inntekter"),

  tool("get_profit_analysis",
    "Resultatanalyse: bruttofortjeneste, driftsresultat, nettoresultat, marginer, og sammenligning med en annen periode.",
    { properties: { period: periodParam, comparison: comparisonParam }, required: ["period"] },
    "Analyserer resultat"),

  tool("get_cost_analysis",
    "Kostnadsanalyse: totale kostnader fordelt per kategori (varekost, lønn, husleie, etc.), største kostnadsposter, og sammenligning.",
    { properties: { period: periodParam, comparison: comparisonParam }, required: ["period"] },
    "Analyserer kostnader"),

  tool("get_account_breakdown",
    "Detaljert nedbrytning av en bestemt konto eller kontokategori: saldo, transaksjoner, og trend.",
    { properties: { account_or_category: { type: "string", description: "Kontonummer (f.eks. '3000') eller kategorinøkkel (f.eks. 'revenue', 'salary_costs')." }, period: periodParam }, required: ["account_or_category", "period"] },
    "Henter kontodetaljer"),

  tool("get_customer_receivables",
    "Oversikt over utestående kundefordringer: total, aldersfordelt (0-30, 31-60, 61-90, 90+ dager), største debitorer.",
    { properties: {} },
    "Henter kundefordringer"),

  tool("get_customer_detail",
    "Alt om én kunde, slått opp på navn: utestående saldo, omsetning i perioden, omsetning per måned, hva kunden kjøper og siste aktivitet.",
    { properties: { name: { type: "string", description: "Kundens navn slik brukeren skriver det. Delvis treff støttes." } }, required: ["name"] },
    "Henter kundedetaljer"),

  tool("list_customers",
    "Selskapets kunder med omsetning og utestående saldo. Bruk denne for spørsmål som «hvem er våre største kunder» eller «hvem skylder oss mest».",
    { properties: { sort_by: { type: "string", description: '"revenue" (standard) eller "outstanding".' }, limit: { type: "number", description: "Antall kunder å returnere (standard 20, maks 100)." } } },
    "Henter kundelisten"),

  tool("get_recurring_revenue",
    "Gjentakende inntekter: MRR per måned, ARR, endring fra forrige måned, og hvor stor andel av omsetningen som er gjentakende. Kvartals-, halvårs- og årskontrakter er normalisert ned til månedsbeløp.",
    { properties: {} },
    "Henter gjentakende inntekter"),

  tool("get_cash_position",
    "Bokført bankbeholdning: saldo per bankkonto ved periodens slutt og utviklingen måned for måned.",
    { properties: {} },
    "Henter likviditet"),

  tool("get_account_balances",
    "Inngående og utgående saldo per konto — balansen slik regnskapet oppgir den. Kan avgrenses til en kontoklasse.",
    { properties: { account_prefix: { type: "string", description: "Valgfritt kontoprefiks, f.eks. \"15\" for kundefordringer eller \"19\" for bank." } } },
    "Henter kontosaldoer"),

  tool("search_transactions",
    "Fritekstsøk i posteringene. Bruk denne for spørsmål som «hva har vi betalt til X» eller «finn alle posteringer med Y i teksten».",
    { properties: { text: { type: "string", description: "Søketekst mot posteringsbeskrivelse." }, period: periodParam, limit: { type: "number", description: "Antall treff (standard 50, maks 200)." } } },
    "Søker i posteringer"),

  tool("get_overdue_invoices",
    "Sjekker om forfalte fakturaer kan beregnes. Merk: en SAF-T-import inneholder ikke forfallsdato per faktura, så dette verktøyet vil normalt svare at forfallsinformasjon ikke finnes. Bruk get_customer_receivables for utestående saldo.",
    { properties: {} },
    "Henter forfalte fakturaer"),

  tool("get_supplier_payables",
    "Oversikt over leverandørgjeld: total, aldersfordelt, kommende forfall, største kreditorer.",
    { properties: {} },
    "Henter leverandørgjeld"),

  tool("create_budget",
    "Oppretter et nytt budsjett for et år, fylt med tallene fra de siste tolv månedene med reell drift. Krever bekreftelse: kall først uten confirmed for å vise hva som blir laget, så med confirmed: true når brukeren har sagt ja.",
    { properties: {
        year: { type: "number", description: "Året budsjettet gjelder." },
        name: { type: "string", description: "Navn på budsjettet. Standard «Budsjett <år>»." },
        based_on: { type: "string", description: "last_12_months (standard), previous_year eller empty." },
        scenario: { type: "string", description: "base, optimistic eller cautious." },
        confirmed: { type: "boolean", description: "Sett true KUN etter at brukeren har bekreftet." },
      },
      required: ["year"] },
    "Oppretter budsjett"),

  tool("create_report",
    "Lager og lagrer en rapport for en periode — månedsrapport, styrerapport, likviditetsrapport, vekstanalyse, budsjettoppfølging eller due diligence. Krever bekreftelse: kall først uten confirmed for å vise type og periode, så med confirmed: true når brukeren har sagt ja. Bruk denne til «lag en styrerapport på fjoråret».",
    { properties: {
        report_type: { type: "string", description: "month, board, liquidity, growth, budget, due_diligence eller custom. Standard month." },
        year: { type: "number", description: "Året rapporten skal dekke." },
        period_start: { type: "string", description: "ÅÅÅÅ-MM-DD. Brukes i stedet for year når perioden ikke er et helt år." },
        period_end: { type: "string", description: "ÅÅÅÅ-MM-DD." },
        title: { type: "string", description: "Valgfri tittel." },
        confirmed: { type: "boolean", description: "Sett true KUN etter at brukeren har bekreftet." },
      } },
    "Lager rapport"),

  tool("find_savings",
    "Går gjennom kostnadene i regnskapet og finner hvor det er mest å spare: kategorier som har vokst, største leverandører, og faste kostnader som gjentar seg hver måned. Bruk denne når brukeren spør hvor de kan kutte eller hvordan bunnlinja kan bedres.",
    { properties: { year: { type: "number", description: "Året som skal gjennomgås. Standard siste regnskapsår." } } },
    "Leter etter besparelser"),

  tool("get_vat_deadline",
    "Neste frist for mva-melding, og de påfølgende terminene. Svaret er lovbestemt og hentes fra en kalender, ikke fra regnskapet — bruk dette framfor get_upcoming_obligations når spørsmålet gjelder når mva skal leveres eller betales.",
    { properties: { count: { type: "number", description: "Antall kommende terminer å liste (standard 3)." } } },
    "Slår opp mva-frist"),

  tool("get_upcoming_obligations",
    "Kommende betalingsforpliktelser innen angitt antall dager: leverandørfakturaer, lønn, MVA-termin, skatt, faste kostnader.",
    { properties: { days: { type: "number", description: "Antall dager fremover å se på (standard 30)." } } },
    "Henter kommende forpliktelser"),

  tool("get_cash_forecast",
    "Kontantstrømprognose for de neste N dagene: forventet inn, forventet ut, estimert saldo per dag/uke.",
    { properties: { days: { type: "number", description: "Prognosehorisont i dager (standard 30, maks 90)." } } },
    "Beregner kontantstrømprognose"),

  tool("get_vat_estimate",
    "Estimert MVA-oppgjør for inneværende termin: utgående MVA, inngående MVA, netto å betale/tilgode, frist.",
    { properties: {} },
    "Estimerer MVA"),

  tool("get_tax_estimate",
    "Estimert skatt for inneværende år basert på hittil bokført resultat.",
    { properties: {} },
    "Estimerer skatt"),

  tool("get_chart_of_accounts",
    "Henter selskapets kontoplan fra regnskapssystemet. Brukes for å gi konkrete kontoanbefalinger.",
    { properties: {} },
    "Henter kontoplan"),

  tool("find_similar_vendor_transactions",
    "Finner tidligere transaksjoner for en leverandør for å se hvordan tilsvarende bilag har vært bokført.",
    { properties: { vendor_name: { type: "string", description: "Leverandørnavn (delvis treff støttes)." } }, required: ["vendor_name"] },
    "Søker etter lignende transaksjoner"),

  tool("find_similar_description_transactions",
    "Finner transaksjoner med lignende beskrivelse for å identifisere vanlig kontering.",
    { properties: { text: { type: "string", description: "Søketekst fra bilagsbeskrivelse." } }, required: ["text"] },
    "Søker i beskrivelser"),

  tool("get_vendor_posting_history",
    "Henter den vanligste posteringsmåten for en leverandør: typisk konto, MVA-kode, og kategori basert på historikk.",
    { properties: { vendor_name: { type: "string", description: "Leverandørnavn." } }, required: ["vendor_name"] },
    "Henter posteringshistorikk"),

  tool("search_accounting_rules",
    "Søker i regnskapsregler og norsk bokføringslov etter relevant veiledning for et emne (f.eks. MVA-fradrag, representasjon, firmabil).",
    { properties: { topic: { type: "string", description: "Emne å søke etter (f.eks. 'representasjon', 'firmabil', 'mva fradrag')." } }, required: ["topic"] },
    "Søker i regnskapsregler"),

  tool("get_budget",
    "Henter selskapets budsjett: budsjettert beløp per kategori per måned, faktiske tall så langt, avvik, budsjettert resultat og estimert likviditet. Bruk denne for alle spørsmål om budsjett.",
    { properties: { budget_id: { type: "string", description: "Valgfri budsjett-ID. Uten denne brukes det nyeste budsjettet." } } },
    "Henter budsjett"),

  tool("propose_budget_change",
    "Regner ut hva en budsjettendring vil bety, og gjennomfører den når brukeren har bekreftet. Kall FØRST uten confirmed for å vise effekten, så med confirmed: true når brukeren har sagt ja. Godkjente budsjetter kan ikke endres. Bruk denne til «øk salgsbudsjettet med 10 %», «legg inn en ny ansatt fra mars med 700 000 i lønn», «få omsetningen opp til 400 000 i måneden innen desember», eller «hva skjer hvis salget blir 20 % lavere».",
    {
      properties: {
        budget_id: { type: "string", description: "Valgfri budsjett-ID. Uten denne brukes det nyeste budsjettet." },
        change_type: {
          type: "string",
          description:
            'Type endring: "adjust_percent" (juster en kategori med prosent), "set_annual" (sett årsbeløp for en kategori), "reach_target" (trapp opp jevnt til et månedlig målbeløp innen en gitt måned), "add_cost" (ny fast månedlig kostnad), "add_employee" (ny ansatt).',
        },
        category_key: {
          type: "string",
          description:
            'Kategori: revenue, other_revenue, cogs, payroll, employer_costs, premises, it_software, consultants, sales_marketing, travel, vehicles, office, equipment, depreciation, other_costs.',
        },
        percent: { type: "number", description: "Prosentendring for adjust_percent." },
        amount: { type: "number", description: "Årsbeløp for set_annual, månedlig målbeløp for reach_target, månedsbeløp for add_cost, årslønn for add_employee." },
        from_month: { type: "number", description: "Måned 1–12 endringen gjelder fra." },
        target_month: { type: "number", description: "Måned 1–12 målet skal være nådd innen. Kun for reach_target." },
        name: { type: "string", description: "Navn på kostnaden eller stillingen." },
        confirmed: { type: "boolean", description: "Sett true KUN etter at brukeren har bekreftet forslaget." },
      },
      required: ["change_type"],
    },
    "Regner ut budsjettendring"),

  tool("run_scenario",
    'Kjører en "hva om"-analyse: simulerer effekten av en endring (ny ansettelse, investering, prisendring) på økonomi og likviditet.',
    { properties: { parameters: { type: "object", description: "Scenarioparametre. Eksempler: { type: 'new_hire', monthly_salary: 50000 } eller { type: 'investment', amount: 200000 }.", properties: { type: { type: "string", description: 'Scenariotype: "new_hire", "investment", "price_change", "cost_reduction", "revenue_growth", "custom".' } } } }, required: ["parameters"] },
    "Kjører scenarioanalyse"),
];

/** name → what the chat shows while it runs. Derived, so it cannot drift. */
export const TOOL_LABELS: Record<string, string> = Object.fromEntries(
  TOOLS.map((t) => [t.function.name, t.label])
);
