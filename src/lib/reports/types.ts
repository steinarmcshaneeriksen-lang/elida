/**
 * Report types and the sections each is made of.
 *
 * A ready-made report is nothing more than an ordered list of sections, which
 * means the custom builder and the fixed reports run through exactly the same
 * renderer — there is no second code path that can drift.
 */

export const SECTION_LABELS: Record<string, string> = {
  summary: "Sammendrag",
  result: "Økonomisk status",
  revenue: "Omsetning",
  costs: "Kostnader",
  bridge: "Hva endret resultatet",
  payroll: "Personalkostnader",
  cash: "Likviditet",
  working_capital: "Kundefordringer og leverandørgjeld",
  customers: "Kunder",
  suppliers: "Leverandører",
  recurring: "Gjentakende inntekter",
  budget: "Budsjett mot faktisk",
  forecast: "Prognose",
  kpis: "Nøkkeltall",
  observations: "Elidas observasjoner",
  risk: "Risiko",
  management_comment: "Ledelsens kommentar",
  data_quality: "Datagrunnlag",
};

export const ALL_SECTIONS = Object.keys(SECTION_LABELS);

export interface ReportTypeDefinition {
  key: string;
  title: string;
  description: string;
  /** What this report is for, in the words of the person asking for it. */
  useCase: string;
  sections: string[];
  defaultComparison: "previous_period" | "same_period_last_year" | "budget" | "none";
  /** A page break is forced before each of these sections. */
  pageBreakBefore: string[];
}

export const REPORT_TYPES: ReportTypeDefinition[] = [
  {
    key: "month",
    title: "Månedsrapport",
    description:
      "Et raskt bilde av hvordan måneden gikk: omsetning, resultat, de største kostnadsendringene og likviditeten.",
    useCase: "Til ledelsen eller til deg selv, hver måned.",
    sections: [
      "summary",
      "result",
      "revenue",
      "costs",
      "bridge",
      "payroll",
      "cash",
      "working_capital",
      "budget",
      "observations",
      "data_quality",
    ],
    defaultComparison: "previous_period",
    pageBreakBefore: ["costs", "cash", "observations"],
  },
  {
    key: "board",
    title: "Styrepakke",
    description:
      "Komplett økonomisk underlag til styremøtet, med resultat mot i fjor og mot budsjett, likviditet, prognose, kunderisiko og observasjoner.",
    useCase: "Til styremøtet. Kan sendes som den er.",
    sections: [
      "summary",
      "result",
      "revenue",
      "bridge",
      "costs",
      "payroll",
      "recurring",
      "cash",
      "working_capital",
      "customers",
      "budget",
      "forecast",
      "kpis",
      "risk",
      "observations",
      "management_comment",
      "data_quality",
    ],
    defaultComparison: "same_period_last_year",
    pageBreakBefore: [
      "revenue",
      "costs",
      "cash",
      "customers",
      "budget",
      "risk",
      "data_quality",
    ],
  },
  {
    key: "liquidity",
    title: "Likviditetsrapport",
    description:
      "Kontantbeholdning, hva kundene skylder, hva som skal betales ut og hvordan likviditeten har utviklet seg.",
    useCase: "Når du trenger å vite om pengene strekker til.",
    sections: [
      "summary",
      "cash",
      "working_capital",
      "customers",
      "suppliers",
      "observations",
      "data_quality",
    ],
    defaultComparison: "previous_period",
    pageBreakBefore: ["customers", "observations"],
  },
  {
    key: "growth",
    title: "Vekst og utvikling",
    description:
      "Om selskapet vokser, hvor veksten kommer fra, og om den er lønnsom.",
    useCase: "Til strategiarbeid og eierdiskusjoner.",
    sections: [
      "summary",
      "result",
      "revenue",
      "bridge",
      "recurring",
      "customers",
      "costs",
      "payroll",
      "kpis",
      "observations",
      "data_quality",
    ],
    defaultComparison: "same_period_last_year",
    pageBreakBefore: ["revenue", "customers", "kpis"],
  },
  {
    key: "budget",
    title: "Budsjett mot faktisk",
    description:
      "Hva som var budsjettert, hva som faktisk skjedde, avviket i kroner og prosent, og hva året ender på.",
    useCase: "Til månedlig oppfølging av budsjettet.",
    sections: [
      "summary",
      "budget",
      "forecast",
      "result",
      "costs",
      "observations",
      "data_quality",
    ],
    defaultComparison: "budget",
    pageBreakBefore: ["result", "observations"],
  },
  {
    key: "due_diligence",
    title: "Økonomisk oversikt (due diligence)",
    description:
      "Førsteunderlag ved salg, investering eller bankfinansiering: historikk, inntektsanalyse, kostnadsbase, arbeidskapital og risiko.",
    useCase:
      "Til bank, investor eller kjøper. Er en ledelsesoversikt, ikke en fullverdig finansiell due diligence.",
    sections: [
      "summary",
      "result",
      "revenue",
      "customers",
      "recurring",
      "costs",
      "payroll",
      "suppliers",
      "working_capital",
      "cash",
      "kpis",
      "risk",
      "data_quality",
    ],
    defaultComparison: "same_period_last_year",
    pageBreakBefore: [
      "revenue",
      "customers",
      "costs",
      "working_capital",
      "kpis",
      "risk",
    ],
  },
  {
    key: "custom",
    title: "Egendefinert rapport",
    description: "Velg selv hvilke deler rapporten skal inneholde.",
    useCase: "Når ingen av malene passer.",
    sections: ["summary", "result", "revenue", "costs", "cash", "data_quality"],
    defaultComparison: "same_period_last_year",
    pageBreakBefore: [],
  },
];

export function reportTypeByKey(key: string): ReportTypeDefinition {
  return REPORT_TYPES.find((r) => r.key === key) ?? REPORT_TYPES[0];
}

export interface ReportConfiguration {
  sections: string[];
  pageBreakBefore: string[];
  comparison: "previous_period" | "same_period_last_year" | "budget" | "none";
  budgetId: string | null;
  managementComment: string;
  branding: {
    useCompanyBranding: boolean;
    logoUrl: string | null;
    footerText: string | null;
    confidentiality: string | null;
    showElidaCredit: boolean;
  };
  subtitle: string | null;
}

export function defaultConfiguration(typeKey: string): ReportConfiguration {
  const type = reportTypeByKey(typeKey);

  return {
    sections: [...type.sections],
    pageBreakBefore: [...type.pageBreakBefore],
    comparison: type.defaultComparison,
    budgetId: null,
    managementComment: "",
    branding: {
      useCompanyBranding: true,
      logoUrl: null,
      footerText: null,
      confidentiality: "Konfidensielt",
      showElidaCredit: true,
    },
    subtitle: null,
  };
}
