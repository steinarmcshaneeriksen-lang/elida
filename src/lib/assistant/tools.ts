/**
 * Assistant Tool Definitions
 *
 * Structured tool array in Anthropic tool-use format.
 * Each tool has a name, description, and input_schema (JSON Schema).
 * The handlers live in tool-handlers.ts.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
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

export const TOOLS: ToolDefinition[] = [
  // ── Financial overview ──────────────────────────────────────────────
  {
    name: "get_financial_summary",
    description:
      "Henter en helhetlig finansiell oppsummering for en gitt periode: omsetning, kostnader, resultat, kontantbeholdning, utestående fordringer og gjeld. Bruk denne for generelle spørsmål om hvordan det går.",
    input_schema: {
      type: "object",
      properties: {
        period: periodParam,
      },
      required: ["period"],
    },
  },
  {
    name: "get_revenue_analysis",
    description:
      "Detaljert inntektsanalyse: total omsetning, fordelt per konto/kategori, trend over tid, og sammenligning med en annen periode.",
    input_schema: {
      type: "object",
      properties: {
        period: periodParam,
        comparison: comparisonParam,
      },
      required: ["period"],
    },
  },
  {
    name: "get_profit_analysis",
    description:
      "Resultatanalyse: bruttofortjeneste, driftsresultat, nettoresultat, marginer, og sammenligning med en annen periode.",
    input_schema: {
      type: "object",
      properties: {
        period: periodParam,
        comparison: comparisonParam,
      },
      required: ["period"],
    },
  },
  {
    name: "get_cost_analysis",
    description:
      "Kostnadsanalyse: totale kostnader fordelt per kategori (varekost, lønn, husleie, etc.), største kostnadsposter, og sammenligning.",
    input_schema: {
      type: "object",
      properties: {
        period: periodParam,
        comparison: comparisonParam,
      },
      required: ["period"],
    },
  },
  {
    name: "get_account_breakdown",
    description:
      "Detaljert nedbrytning av en bestemt konto eller kontokategori: saldo, transaksjoner, og trend.",
    input_schema: {
      type: "object",
      properties: {
        account_or_category: {
          type: "string",
          description:
            "Kontonummer (f.eks. '3000') eller kategorinøkkel (f.eks. 'revenue', 'salary_costs').",
        },
        period: periodParam,
      },
      required: ["account_or_category", "period"],
    },
  },

  // ── Receivables & payables ──────────────────────────────────────────
  {
    name: "get_customer_receivables",
    description:
      "Oversikt over utestående kundefordringer: total, aldersfordelt (0-30, 31-60, 61-90, 90+ dager), største debitorer.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_customer_payment_profile",
    description:
      "Betalingsprofil for en bestemt kunde: gjennomsnittlig betalingstid, forfalte fakturaer, betalingshistorikk, risikoscore.",
    input_schema: {
      type: "object",
      properties: {
        customer_id: {
          type: "string",
          description: "Kunde-ID fra databasen.",
        },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "get_overdue_invoices",
    description:
      "Liste over alle forfalte fakturaer med detaljer: kunde, beløp, forfallsdato, dager over forfall.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_supplier_payables",
    description:
      "Oversikt over leverandørgjeld: total, aldersfordelt, kommende forfall, største kreditorer.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },

  // ── Cash & forecasting ──────────────────────────────────────────────
  {
    name: "get_upcoming_obligations",
    description:
      "Kommende betalingsforpliktelser innen angitt antall dager: leverandørfakturaer, lønn, MVA-termin, skatt, faste kostnader.",
    input_schema: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Antall dager fremover å se på (standard 30).",
        },
      },
    },
  },
  {
    name: "get_cash_forecast",
    description:
      "Kontantstrømprognose for de neste N dagene: forventet inn, forventet ut, estimert saldo per dag/uke.",
    input_schema: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Prognosehorisont i dager (standard 30, maks 90).",
        },
      },
    },
  },

  // ── Tax & VAT ───────────────────────────────────────────────────────
  {
    name: "get_vat_estimate",
    description:
      "Estimert MVA-oppgjør for inneværende termin: utgående MVA, inngående MVA, netto å betale/tilgode, frist.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_tax_estimate",
    description:
      "Estimert skatt for inneværende år basert på hittil bokført resultat.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },

  // ── Accounting advice tools ─────────────────────────────────────────
  {
    name: "get_chart_of_accounts",
    description:
      "Henter selskapets kontoplan fra regnskapssystemet. Brukes for å gi konkrete kontoanbefalinger.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "find_similar_vendor_transactions",
    description:
      "Finner tidligere transaksjoner for en leverandør for å se hvordan tilsvarende bilag har vært bokført.",
    input_schema: {
      type: "object",
      properties: {
        vendor_name: {
          type: "string",
          description: "Leverandørnavn (delvis treff støttes).",
        },
      },
      required: ["vendor_name"],
    },
  },
  {
    name: "find_similar_description_transactions",
    description:
      "Finner transaksjoner med lignende beskrivelse for å identifisere vanlig kontering.",
    input_schema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Søketekst fra bilagsbeskrivelse.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "get_vendor_posting_history",
    description:
      "Henter den vanligste posteringsmåten for en leverandør: typisk konto, MVA-kode, og kategori basert på historikk.",
    input_schema: {
      type: "object",
      properties: {
        vendor_name: {
          type: "string",
          description: "Leverandørnavn.",
        },
      },
      required: ["vendor_name"],
    },
  },
  {
    name: "search_accounting_rules",
    description:
      "Søker i regnskapsregler og norsk bokføringslov etter relevant veiledning for et emne (f.eks. MVA-fradrag, representasjon, firmabil).",
    input_schema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description:
            "Emne å søke etter (f.eks. 'representasjon', 'firmabil', 'mva fradrag').",
        },
      },
      required: ["topic"],
    },
  },

  // ── Scenario analysis ───────────────────────────────────────────────
  {
    name: "run_scenario",
    description:
      'Kjører en "hva om"-analyse: simulerer effekten av en endring (ny ansettelse, investering, prisendring) på økonomi og likviditet.',
    input_schema: {
      type: "object",
      properties: {
        parameters: {
          type: "object",
          description:
            "Scenarioparametre. Eksempler: { type: 'new_hire', monthly_salary: 50000, start_month: '2025-03' } eller { type: 'investment', amount: 200000, financing: 'loan', term_months: 36 }.",
          properties: {
            type: {
              type: "string",
              description:
                'Scenariotype: "new_hire", "investment", "price_change", "cost_reduction", "revenue_growth", "custom".',
            },
          },
        },
      },
      required: ["parameters"],
    },
  },
];
