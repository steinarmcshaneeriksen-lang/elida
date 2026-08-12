/**
 * Realistic Norwegian business mock data for Elida dashboard.
 * Simulates a small-to-medium consulting/services company.
 */

// --- Dashboard overview cards ---

export interface DashboardMetric {
  question: string;
  label: string;
  value: number;
  formattedValue: string;
  comparison: {
    value: number;
    percent: number;
    direction: "up" | "down" | "flat";
    label: string;
  };
  confidence: "high" | "medium" | "low";
  detail?: string;
}

export const dashboardMetrics: DashboardMetric[] = [
  {
    question: "Går bedriften med overskudd?",
    label: "Driftsresultat hittil i år",
    value: 1_284_000,
    formattedValue: "1 284 000 kr",
    comparison: {
      value: 210_000,
      percent: 19.6,
      direction: "up",
      label: "vs. samme periode i fjor",
    },
    confidence: "high",
    detail: "Driftsmargin: 14,2 %. Opp fra 12,8 % i fjor.",
  },
  {
    question: "Vokser bedriften?",
    label: "Omsetning hittil i år",
    value: 9_050_000,
    formattedValue: "9 050 000 kr",
    comparison: {
      value: 820_000,
      percent: 10.0,
      direction: "up",
      label: "vs. samme periode i fjor",
    },
    confidence: "high",
    detail: "Jevn vekst. Mai var beste måned med 1,6 mill.",
  },
  {
    question: "Har bedriften nok penger?",
    label: "Banksaldo nå / Laveste punkt neste 60 dager",
    value: 2_340_000,
    formattedValue: "2 340 000 kr",
    comparison: {
      value: 1_650_000,
      percent: 0,
      direction: "down",
      label: "Estimert lavpunkt: 1 650 000 kr (15. sep.)",
    },
    confidence: "medium",
    detail: "MVA-termin 10. sep. trekker saldoen ned. Likevel over bufferkrav.",
  },
  {
    question: "Hvor mye skylder kundene?",
    label: "Utestående kundefordringer",
    value: 1_870_000,
    formattedValue: "1 870 000 kr",
    comparison: {
      value: 420_000,
      percent: 22.5,
      direction: "up",
      label: "Forfalt: 420 000 kr",
    },
    confidence: "high",
    detail: "3 fakturaer er mer enn 30 dager forbi forfall.",
  },
  {
    question: "Hva må betales snart?",
    label: "Forpliktelser neste 30 dager",
    value: 1_920_000,
    formattedValue: "1 920 000 kr",
    comparison: {
      value: 0,
      percent: 0,
      direction: "flat",
      label: "Inkl. lønn, MVA og leverandørfakturaer",
    },
    confidence: "medium",
    detail: "Lønn 25. aug: 680 000 kr. MVA 10. sep: 310 000 kr.",
  },
  {
    question: "Hva bør jeg være oppmerksom på?",
    label: "Viktige varsler",
    value: 3,
    formattedValue: "3 varsler",
    comparison: {
      value: 0,
      percent: 0,
      direction: "flat",
      label: "1 høy prioritet, 2 medium",
    },
    confidence: "high",
    detail: "Se detaljer under.",
  },
];

// --- Insights ---

export type InsightSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  description: string;
  evidence?: string;
  category: string;
  createdAt: string;
}

export const insights: Insight[] = [
  {
    id: "ins-1",
    severity: "high",
    title: "Stor kundefordring 45 dager forbi forfall",
    description:
      "Nordfjord Consulting AS har en faktura på 185 000 kr (faktura #2024-0087) som er 45 dager forbi forfall. Historisk sett betaler de i snitt 12 dager etter forfall. Vurder purring.",
    evidence: "Faktura #2024-0087, forfalt 28. juni 2026",
    category: "Kundefordringer",
    createdAt: "2026-08-12T08:00:00Z",
  },
  {
    id: "ins-2",
    severity: "medium",
    title: "Kontorkostnader har økt 23 % siste kvartal",
    description:
      "Kontorkostnader (konto 6300-6399) var 148 000 kr i Q2 mot 120 000 kr i Q1. Største bidragsyter er økt bruk av programvarelisenser.",
    evidence: "Regnskap Q1 vs Q2 2026",
    category: "Kostnader",
    createdAt: "2026-08-11T14:30:00Z",
  },
  {
    id: "ins-3",
    severity: "medium",
    title: "MVA-termin 10. september nærmer seg",
    description:
      "Estimert MVA-betaling for 4. termin (jul-aug) er ca. 310 000 kr. Sørg for at det er nok likviditet. Forrige termin var betalingen 285 000 kr.",
    evidence: "Beregnet fra bokførte transaksjoner",
    category: "Skatt og avgift",
    createdAt: "2026-08-12T06:00:00Z",
  },
  {
    id: "ins-4",
    severity: "info",
    title: "Beste måned hittil: Mai 2026",
    description:
      "Mai hadde den høyeste omsetningen hittil i år med 1 620 000 kr, 18 % over gjennomsnittet. To store prosjektleveranser bidro til resultatet.",
    category: "Omsetning",
    createdAt: "2026-08-10T10:00:00Z",
  },
];

// --- Obligations ---

export type ObligationStatus = "Estimert" | "Bokført";

export interface Obligation {
  id: string;
  event: string;
  amount: number;
  expectedDate: string;
  status: ObligationStatus;
  category: string;
}

export const obligations: Obligation[] = [
  {
    id: "obl-1",
    event: "Lønnskjøring august",
    amount: 680_000,
    expectedDate: "2026-08-25",
    status: "Estimert",
    category: "Lønn",
  },
  {
    id: "obl-2",
    event: "Arbeidsgiveravgift august",
    amount: 96_000,
    expectedDate: "2026-09-15",
    status: "Estimert",
    category: "Skatt",
  },
  {
    id: "obl-3",
    event: "Skattetrekk august",
    amount: 245_000,
    expectedDate: "2026-09-15",
    status: "Estimert",
    category: "Skatt",
  },
  {
    id: "obl-4",
    event: "MVA 4. termin (jul-aug)",
    amount: 310_000,
    expectedDate: "2026-09-10",
    status: "Estimert",
    category: "MVA",
  },
  {
    id: "obl-5",
    event: "Leverandør: Tekna Systems AS",
    amount: 89_000,
    expectedDate: "2026-08-18",
    status: "Bokført",
    category: "Leverandør",
  },
  {
    id: "obl-6",
    event: "Leverandør: CloudHost Norge",
    amount: 42_000,
    expectedDate: "2026-08-20",
    status: "Bokført",
    category: "Leverandør",
  },
  {
    id: "obl-7",
    event: "Kontorleie september",
    amount: 65_000,
    expectedDate: "2026-09-01",
    status: "Estimert",
    category: "Fast kostnad",
  },
  {
    id: "obl-8",
    event: "Forsikring kvartal",
    amount: 28_000,
    expectedDate: "2026-09-01",
    status: "Bokført",
    category: "Fast kostnad",
  },
];

// --- Customers ---

export interface Customer {
  id: string;
  name: string;
  outstanding: number;
  overdue: number;
  oldestOverdueDays: number | null;
  avgDelayDays: number;
  riskScore: "low" | "medium" | "high";
  revenueYTD: number;
}

export const customers: Customer[] = [
  {
    id: "cust-1",
    name: "Nordfjord Consulting AS",
    outstanding: 285_000,
    overdue: 185_000,
    oldestOverdueDays: 45,
    avgDelayDays: 12,
    riskScore: "high",
    revenueYTD: 1_420_000,
  },
  {
    id: "cust-2",
    name: "Bergen Energi AS",
    outstanding: 520_000,
    overdue: 120_000,
    oldestOverdueDays: 18,
    avgDelayDays: 5,
    riskScore: "medium",
    revenueYTD: 2_180_000,
  },
  {
    id: "cust-3",
    name: "Stavanger Tech Solutions",
    outstanding: 340_000,
    overdue: 0,
    oldestOverdueDays: null,
    avgDelayDays: 2,
    riskScore: "low",
    revenueYTD: 1_650_000,
  },
  {
    id: "cust-4",
    name: "Tromsø Digital AS",
    outstanding: 180_000,
    overdue: 65_000,
    oldestOverdueDays: 22,
    avgDelayDays: 8,
    riskScore: "medium",
    revenueYTD: 890_000,
  },
  {
    id: "cust-5",
    name: "Oslo Innovations AS",
    outstanding: 410_000,
    overdue: 50_000,
    oldestOverdueDays: 8,
    avgDelayDays: 3,
    riskScore: "low",
    revenueYTD: 1_920_000,
  },
  {
    id: "cust-6",
    name: "Kristiansand Maritime",
    outstanding: 135_000,
    overdue: 0,
    oldestOverdueDays: null,
    avgDelayDays: 1,
    riskScore: "low",
    revenueYTD: 990_000,
  },
];

// --- Suppliers ---

export interface Supplier {
  id: string;
  name: string;
  costYTD: number;
  changeYoY: number;
  outstanding: number;
  nextDueDate: string | null;
  nextDueAmount: number | null;
  category: string;
}

export const suppliers: Supplier[] = [
  {
    id: "sup-1",
    name: "Tekna Systems AS",
    costYTD: 620_000,
    changeYoY: 8.5,
    outstanding: 89_000,
    nextDueDate: "2026-08-18",
    nextDueAmount: 89_000,
    category: "IT-tjenester",
  },
  {
    id: "sup-2",
    name: "CloudHost Norge",
    costYTD: 285_000,
    changeYoY: 15.2,
    outstanding: 42_000,
    nextDueDate: "2026-08-20",
    nextDueAmount: 42_000,
    category: "Hosting",
  },
  {
    id: "sup-3",
    name: "Kontorpartner AS",
    costYTD: 390_000,
    changeYoY: -2.1,
    outstanding: 65_000,
    nextDueDate: "2026-09-01",
    nextDueAmount: 65_000,
    category: "Kontorlokaler",
  },
  {
    id: "sup-4",
    name: "Regnskap & Revisjon AS",
    costYTD: 180_000,
    changeYoY: 5.0,
    outstanding: 0,
    nextDueDate: null,
    nextDueAmount: null,
    category: "Regnskap",
  },
  {
    id: "sup-5",
    name: "Trygg Forsikring",
    costYTD: 112_000,
    changeYoY: 3.2,
    outstanding: 28_000,
    nextDueDate: "2026-09-01",
    nextDueAmount: 28_000,
    category: "Forsikring",
  },
  {
    id: "sup-6",
    name: "Strøm & Kraft AS",
    costYTD: 94_000,
    changeYoY: -8.4,
    outstanding: 0,
    nextDueDate: null,
    nextDueAmount: null,
    category: "Strøm",
  },
  {
    id: "sup-7",
    name: "Digital Marketing Oslo",
    costYTD: 210_000,
    changeYoY: 42.0,
    outstanding: 35_000,
    nextDueDate: "2026-08-28",
    nextDueAmount: 35_000,
    category: "Markedsføring",
  },
];

// --- Transactions ---

export interface Transaction {
  id: string;
  date: string;
  description: string;
  account: string;
  accountNumber: string;
  amount: number;
  supplier?: string;
  customer?: string;
  project?: string;
  department?: string;
}

export const transactions: Transaction[] = [
  {
    id: "txn-1",
    date: "2026-08-11",
    description: "Innbetaling faktura #2026-0142",
    account: "Kundefordringer",
    accountNumber: "1500",
    amount: 245_000,
    customer: "Oslo Innovations AS",
  },
  {
    id: "txn-2",
    date: "2026-08-10",
    description: "CloudHost - Augustfaktura",
    account: "IT-kostnader",
    accountNumber: "6540",
    amount: -42_000,
    supplier: "CloudHost Norge",
    department: "IT",
  },
  {
    id: "txn-3",
    date: "2026-08-09",
    description: "Kontorrekvisita",
    account: "Kontorkostnader",
    accountNumber: "6560",
    amount: -3_200,
    supplier: "Kontorpartner AS",
    department: "Admin",
  },
  {
    id: "txn-4",
    date: "2026-08-08",
    description: "Prosjektfaktura - Bergen Energi",
    account: "Salgsinntekt",
    accountNumber: "3000",
    amount: 380_000,
    customer: "Bergen Energi AS",
    project: "BE-2026-Q3",
    department: "Konsulent",
  },
  {
    id: "txn-5",
    date: "2026-08-07",
    description: "Digital Marketing - Kampanjekostnad",
    account: "Markedsføring",
    accountNumber: "7300",
    amount: -35_000,
    supplier: "Digital Marketing Oslo",
    department: "Salg",
  },
  {
    id: "txn-6",
    date: "2026-08-06",
    description: "Innbetaling faktura #2026-0138",
    account: "Kundefordringer",
    accountNumber: "1500",
    amount: 180_000,
    customer: "Stavanger Tech Solutions",
  },
  {
    id: "txn-7",
    date: "2026-08-05",
    description: "Forsikringspremie Q3",
    account: "Forsikring",
    accountNumber: "7500",
    amount: -28_000,
    supplier: "Trygg Forsikring",
    department: "Admin",
  },
  {
    id: "txn-8",
    date: "2026-08-04",
    description: "Reisekostnader - kundemøte Bergen",
    account: "Reisekostnader",
    accountNumber: "7140",
    amount: -4_850,
    department: "Konsulent",
    project: "BE-2026-Q3",
  },
  {
    id: "txn-9",
    date: "2026-08-03",
    description: "Lønnskjøring juli",
    account: "Lønnskostnad",
    accountNumber: "5000",
    amount: -680_000,
    department: "Alle",
  },
  {
    id: "txn-10",
    date: "2026-08-02",
    description: "Prosjektfaktura - Nordfjord",
    account: "Salgsinntekt",
    accountNumber: "3000",
    amount: 285_000,
    customer: "Nordfjord Consulting AS",
    project: "NC-2026-02",
    department: "Konsulent",
  },
  {
    id: "txn-11",
    date: "2026-08-01",
    description: "Kontorleie august",
    account: "Husleie",
    accountNumber: "6300",
    amount: -65_000,
    supplier: "Kontorpartner AS",
    department: "Admin",
  },
  {
    id: "txn-12",
    date: "2026-07-31",
    description: "Tekna Systems - Systemvedlikehold",
    account: "IT-kostnader",
    accountNumber: "6540",
    amount: -89_000,
    supplier: "Tekna Systems AS",
    department: "IT",
  },
];

// --- Financial overview data ---

export interface MonthlyFinancial {
  month: string;
  revenue: number;
  costs: number;
  profit: number;
}

export const monthlyFinancials: MonthlyFinancial[] = [
  { month: "Jan", revenue: 1_120_000, costs: 920_000, profit: 200_000 },
  { month: "Feb", revenue: 1_080_000, costs: 880_000, profit: 200_000 },
  { month: "Mar", revenue: 1_250_000, costs: 960_000, profit: 290_000 },
  { month: "Apr", revenue: 1_180_000, costs: 950_000, profit: 230_000 },
  { month: "Mai", revenue: 1_620_000, costs: 1_050_000, profit: 570_000 },
  { month: "Jun", revenue: 1_380_000, costs: 1_020_000, profit: 360_000 },
  { month: "Jul", revenue: 1_420_000, costs: 1_080_000, profit: 340_000 },
];

export interface CostCategory {
  category: string;
  amount: number;
  percent: number;
  changeYoY: number;
}

export const costCategories: CostCategory[] = [
  { category: "Lønnskostnader", amount: 4_760_000, percent: 62.1, changeYoY: 6.2 },
  { category: "Kontorleie", amount: 455_000, percent: 5.9, changeYoY: 3.0 },
  { category: "IT og programvare", amount: 905_000, percent: 11.8, changeYoY: 18.5 },
  { category: "Markedsføring", amount: 210_000, percent: 2.7, changeYoY: 42.0 },
  { category: "Reise og transport", amount: 185_000, percent: 2.4, changeYoY: -5.2 },
  { category: "Forsikring", amount: 112_000, percent: 1.5, changeYoY: 3.2 },
  { category: "Regnskap og revisjon", amount: 180_000, percent: 2.3, changeYoY: 5.0 },
  { category: "Andre driftskostnader", amount: 853_000, percent: 11.1, changeYoY: 1.8 },
];

// --- Liquidity data ---

export interface CashFlowItem {
  label: string;
  amount: number;
  date?: string;
  confidence: "high" | "medium" | "low";
}

export const cashPosition = {
  currentBalance: 2_340_000,
  forecastMin: 1_650_000,
  forecastMinDate: "2026-09-15",
  bufferRequirement: 1_000_000,
};

export const expectedInflows: CashFlowItem[] = [
  { label: "Stavanger Tech - Faktura #2026-0148", amount: 340_000, date: "2026-08-20", confidence: "high" },
  { label: "Bergen Energi - Prosjektfaktura", amount: 520_000, date: "2026-08-28", confidence: "high" },
  { label: "Tromsø Digital - Forfalt", amount: 180_000, date: "2026-08-22", confidence: "medium" },
  { label: "Oslo Innovations - Delleveranse", amount: 250_000, date: "2026-09-05", confidence: "medium" },
  { label: "Nordfjord Consulting - Forfalt", amount: 185_000, date: "2026-08-30", confidence: "low" },
];

export const expectedOutflows: CashFlowItem[] = [
  { label: "Tekna Systems AS", amount: -89_000, date: "2026-08-18", confidence: "high" },
  { label: "CloudHost Norge", amount: -42_000, date: "2026-08-20", confidence: "high" },
  { label: "Digital Marketing Oslo", amount: -35_000, date: "2026-08-28", confidence: "high" },
  { label: "Lønnskjøring august", amount: -680_000, date: "2026-08-25", confidence: "high" },
  { label: "Kontorleie september", amount: -65_000, date: "2026-09-01", confidence: "high" },
  { label: "MVA 4. termin", amount: -310_000, date: "2026-09-10", confidence: "medium" },
  { label: "Arbeidsgiveravgift + skattetrekk", amount: -341_000, date: "2026-09-15", confidence: "medium" },
];

export const taxEstimates = {
  vatNextTerm: 310_000,
  vatTermPeriod: "4. termin (jul-aug)",
  vatDueDate: "2026-09-10",
  employerTax: 96_000,
  taxWithholding: 245_000,
  taxDueDate: "2026-09-15",
};

// --- Company settings ---

export const companySettings = {
  name: "Fjordtech AS",
  orgNumber: "923 456 789",
  payrollDate: 25,
  employerTaxZone: "Sone 1 (14,1 %)",
  minLiquidityBuffer: 1_000_000,
  knowledgeLevel: "intermediate" as "beginner" | "intermediate" | "expert",
  powerOfficeConnected: true,
  lastSync: "2026-08-12T09:47:00Z",
};
