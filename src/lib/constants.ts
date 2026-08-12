// ─── Norwegian standard chart of accounts (Norsk Standard Kontoplan) ────────

export interface AccountRange {
  from: number;
  to: number;
  category: string;
  description_nb: string;
  description_en: string;
}

export const ACCOUNT_NUMBER_RANGES: readonly AccountRange[] = [
  { from: 1000, to: 1099, category: "intangible_assets", description_nb: "Immaterielle eiendeler", description_en: "Intangible assets" },
  { from: 1100, to: 1299, category: "fixed_assets", description_nb: "Tomter, bygninger og annen fast eiendom", description_en: "Land, buildings and other real estate" },
  { from: 1300, to: 1399, category: "machinery_equipment", description_nb: "Maskiner og anlegg", description_en: "Machinery and plant" },
  { from: 1400, to: 1499, category: "fixtures_vehicles", description_nb: "Inventar, verktøy, kontormaskiner mv.", description_en: "Fixtures, tools, office machines etc." },
  { from: 1500, to: 1599, category: "financial_fixed_assets", description_nb: "Finansielle anleggsmidler", description_en: "Financial fixed assets" },
  { from: 1600, to: 1799, category: "receivables", description_nb: "Fordringer", description_en: "Receivables" },
  { from: 1800, to: 1899, category: "investments", description_nb: "Investeringer", description_en: "Short-term investments" },
  { from: 1900, to: 1999, category: "cash_bank", description_nb: "Bankinnskudd, kontanter og lignende", description_en: "Cash and bank deposits" },
  { from: 2000, to: 2099, category: "equity", description_nb: "Egenkapital", description_en: "Equity" },
  { from: 2100, to: 2199, category: "retained_earnings", description_nb: "Opptjent egenkapital", description_en: "Retained earnings" },
  { from: 2200, to: 2299, category: "long_term_debt", description_nb: "Langsiktig gjeld", description_en: "Long-term debt" },
  { from: 2300, to: 2399, category: "other_long_term_debt", description_nb: "Annen langsiktig gjeld", description_en: "Other long-term debt" },
  { from: 2400, to: 2499, category: "tax_liabilities", description_nb: "Skattegjeld", description_en: "Tax liabilities" },
  { from: 2500, to: 2599, category: "public_duties_payable", description_nb: "Offentlige avgifter", description_en: "Public duties payable" },
  { from: 2600, to: 2699, category: "vat_payable", description_nb: "Merverdiavgift", description_en: "VAT payable" },
  { from: 2700, to: 2799, category: "short_term_debt", description_nb: "Annen kortsiktig gjeld", description_en: "Other short-term debt" },
  { from: 2800, to: 2999, category: "accruals_provisions", description_nb: "Avsetninger og periodiseringer", description_en: "Accruals and provisions" },
  { from: 3000, to: 3099, category: "sales_revenue", description_nb: "Salgsinntekt, avgiftspliktig", description_en: "Sales revenue, subject to VAT" },
  { from: 3100, to: 3199, category: "sales_revenue_exempt", description_nb: "Salgsinntekt, avgiftsfri", description_en: "Sales revenue, VAT exempt" },
  { from: 3200, to: 3499, category: "other_sales_revenue", description_nb: "Annen salgsinntekt", description_en: "Other sales revenue" },
  { from: 3500, to: 3599, category: "grants_subsidies", description_nb: "Offentlige tilskudd/refusjoner", description_en: "Grants and subsidies" },
  { from: 3600, to: 3699, category: "rental_income", description_nb: "Leieinntekt", description_en: "Rental income" },
  { from: 3700, to: 3899, category: "other_operating_income", description_nb: "Annen driftsrelatert inntekt", description_en: "Other operating income" },
  { from: 3900, to: 3999, category: "gain_loss_assets", description_nb: "Gevinst/tap ved avgang anleggsmidler", description_en: "Gain/loss on disposal of assets" },
  { from: 4000, to: 4499, category: "cost_of_goods", description_nb: "Varekostnad", description_en: "Cost of goods sold" },
  { from: 4500, to: 4999, category: "inventory_adjustment", description_nb: "Beholdningsendring og ukurans", description_en: "Inventory adjustment and obsolescence" },
  { from: 5000, to: 5099, category: "salaries", description_nb: "Lønnskostnad", description_en: "Salaries" },
  { from: 5100, to: 5199, category: "employer_tax", description_nb: "Arbeidsgiveravgift", description_en: "Employer tax" },
  { from: 5200, to: 5299, category: "pension_costs", description_nb: "Pensjonskostnad", description_en: "Pension costs" },
  { from: 5300, to: 5399, category: "other_benefits", description_nb: "Andre ytelser", description_en: "Other employee benefits" },
  { from: 5400, to: 5999, category: "other_payroll", description_nb: "Andre personalkostnader", description_en: "Other payroll costs" },
  { from: 6000, to: 6099, category: "depreciation", description_nb: "Avskrivning", description_en: "Depreciation" },
  { from: 6100, to: 6199, category: "rent_lease", description_nb: "Leiekostnad", description_en: "Rent and lease costs" },
  { from: 6200, to: 6299, category: "electricity_heating", description_nb: "Elektrisitet og oppvarming", description_en: "Electricity and heating" },
  { from: 6300, to: 6399, category: "maintenance_repairs", description_nb: "Vedlikehold og reparasjon", description_en: "Maintenance and repairs" },
  { from: 6400, to: 6499, category: "office_supplies", description_nb: "Kontorkostnad", description_en: "Office supplies" },
  { from: 6500, to: 6599, category: "equipment_tools", description_nb: "Verktøy, inventar mv.", description_en: "Equipment and tools" },
  { from: 6600, to: 6699, category: "external_services", description_nb: "Eksterne tjenester", description_en: "External services" },
  { from: 6700, to: 6799, category: "accounting_consulting", description_nb: "Regnskap, revisjon, rådgivning", description_en: "Accounting, audit, consulting" },
  { from: 6800, to: 6899, category: "it_costs", description_nb: "IT-kostnader", description_en: "IT costs" },
  { from: 6900, to: 6999, category: "telephone_postage", description_nb: "Telefon, porto mv.", description_en: "Telephone, postage etc." },
  { from: 7000, to: 7099, category: "transport_vehicle", description_nb: "Transportkostnad", description_en: "Transport and vehicle costs" },
  { from: 7100, to: 7199, category: "travel_subsistence", description_nb: "Reisekostnad", description_en: "Travel and subsistence" },
  { from: 7200, to: 7299, category: "advertising_marketing", description_nb: "Salgs- og reklamekostnad", description_en: "Advertising and marketing" },
  { from: 7300, to: 7399, category: "entertainment", description_nb: "Representasjon", description_en: "Entertainment" },
  { from: 7400, to: 7499, category: "insurance", description_nb: "Forsikring", description_en: "Insurance" },
  { from: 7500, to: 7599, category: "license_fees", description_nb: "Lisenser og avgifter", description_en: "License fees and duties" },
  { from: 7600, to: 7799, category: "other_operating_costs", description_nb: "Andre driftskostnader", description_en: "Other operating costs" },
  { from: 7800, to: 7899, category: "losses_provisions", description_nb: "Tap, avsetninger mv.", description_en: "Losses and provisions" },
  { from: 7900, to: 7999, category: "intercompany_costs", description_nb: "Internkostnader", description_en: "Intercompany costs" },
  { from: 8000, to: 8099, category: "financial_income", description_nb: "Finansinntekt", description_en: "Financial income" },
  { from: 8100, to: 8199, category: "financial_expenses", description_nb: "Finanskostnad", description_en: "Financial expenses" },
  { from: 8200, to: 8599, category: "other_financial", description_nb: "Andre finansposter", description_en: "Other financial items" },
  { from: 8600, to: 8799, category: "extraordinary_items", description_nb: "Ekstraordinære poster", description_en: "Extraordinary items" },
  { from: 8800, to: 8899, category: "tax_expense", description_nb: "Skattekostnad", description_en: "Tax expense" },
  { from: 8900, to: 8999, category: "annual_result", description_nb: "Årsresultat", description_en: "Annual result" },
] as const;

// ─── High-level account class ranges ────────────────────────────────────────

export const ACCOUNT_CLASSES = {
  ASSETS: { from: 1000, to: 1999, label: "Eiendeler" },
  EQUITY_LIABILITIES: { from: 2000, to: 2999, label: "Egenkapital og gjeld" },
  REVENUE: { from: 3000, to: 3999, label: "Inntekter" },
  COST_OF_GOODS: { from: 4000, to: 4999, label: "Varekostnad" },
  PAYROLL: { from: 5000, to: 5999, label: "Lønnskostnad" },
  OTHER_OPERATING: { from: 6000, to: 7999, label: "Andre driftskostnader" },
  FINANCIAL: { from: 8000, to: 8999, label: "Finansposter og skatt" },
} as const;

// ─── Employer tax rates by zone (arbeidsgiveravgift) ────────────────────────

export const EMPLOYER_TAX_RATES: Record<string, { zone: string; rate: number; description: string }> = {
  "1": { zone: "1", rate: 0.141, description: "Sone 1 - Generell sats" },
  "1a": { zone: "1a", rate: 0.106, description: "Sone 1a - Redusert sats" },
  "2": { zone: "2", rate: 0.106, description: "Sone 2" },
  "3": { zone: "3", rate: 0.064, description: "Sone 3" },
  "4": { zone: "4", rate: 0.054, description: "Sone 4" },
  "4a": { zone: "4a", rate: 0.079, description: "Sone 4a" },
  "5": { zone: "5", rate: 0.0, description: "Sone 5 - Tiltakssonen (Troms og Finnmark)" },
} as const;

// ─── VAT rates (merverdiavgift) ─────────────────────────────────────────────

export const VAT_RATES = {
  STANDARD: { rate: 0.25, label: "Standard sats", description: "Alminnelig sats" },
  FOOD: { rate: 0.15, label: "Matvaresats", description: "Næringsmidler" },
  LOW: { rate: 0.12, label: "Lav sats", description: "Persontransport, overnatting, kino, kultur, idrett mv." },
  EXEMPT: { rate: 0.0, label: "Fritatt", description: "Avgiftsfri omsetning" },
} as const;

export const VAT_RATE_VALUES = [0.25, 0.15, 0.12, 0.0] as const;

// ─── Corporate tax ──────────────────────────────────────────────────────────

export const CORPORATE_TAX_RATE = 0.22;

// ─── Payment terms ──────────────────────────────────────────────────────────

export const DEFAULT_PAYMENT_TERMS = 30;

// ─── Aging buckets for receivables/payables analysis ────────────────────────

export interface AgingBucketDefinition {
  label: string;
  min_days: number;
  max_days: number | null;
}

export const AGING_BUCKETS: readonly AgingBucketDefinition[] = [
  { label: "Current", min_days: 0, max_days: 0 },
  { label: "1-30 days", min_days: 1, max_days: 30 },
  { label: "31-60 days", min_days: 31, max_days: 60 },
  { label: "61-90 days", min_days: 61, max_days: 90 },
  { label: "90+ days", min_days: 91, max_days: null },
] as const;

// ─── Forecast horizons (days) ───────────────────────────────────────────────

export const FORECAST_HORIZONS = [7, 30, 60, 90] as const;

export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number];

// ─── Currency ───────────────────────────────────────────────────────────────

export const DEFAULT_CURRENCY = "NOK" as const;

// ─── Supported locales ──────────────────────────────────────────────────────

export const SUPPORTED_LOCALES = ["nb", "en"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
