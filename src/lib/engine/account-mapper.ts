import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// ─── Norwegian Standard Chart of Accounts (NS 4102) ranges ────────────────

interface AccountRangeMapping {
  min: number;
  max: number;
  categoryKey: string;
  confidence: number;
}

/**
 * Norwegian standard account ranges mapped to our account_categories keys.
 * Based on NS 4102 / Norsk Standard Kontoplan.
 */
const ACCOUNT_RANGES: AccountRangeMapping[] = [
  // 1xxx - Assets
  { min: 1000, max: 1299, categoryKey: "OTHER_ASSET", confidence: 0.8 },
  { min: 1300, max: 1399, categoryKey: "OTHER_ASSET", confidence: 0.8 },
  { min: 1400, max: 1499, categoryKey: "OTHER_ASSET", confidence: 0.8 },
  { min: 1500, max: 1599, categoryKey: "ACCOUNTS_RECEIVABLE", confidence: 0.9 },
  { min: 1600, max: 1799, categoryKey: "OTHER_ASSET", confidence: 0.7 },
  { min: 1800, max: 1899, categoryKey: "OTHER_ASSET", confidence: 0.7 },
  { min: 1900, max: 1999, categoryKey: "CASH", confidence: 0.95 },

  // 2xxx - Liabilities and equity
  { min: 2000, max: 2099, categoryKey: "EQUITY", confidence: 0.9 },
  { min: 2100, max: 2199, categoryKey: "OTHER_LIABILITY", confidence: 0.7 },
  { min: 2200, max: 2299, categoryKey: "OTHER_LIABILITY", confidence: 0.7 },
  { min: 2300, max: 2399, categoryKey: "OTHER_LIABILITY", confidence: 0.7 },
  { min: 2400, max: 2499, categoryKey: "ACCOUNTS_PAYABLE", confidence: 0.9 },
  { min: 2500, max: 2599, categoryKey: "OTHER_LIABILITY", confidence: 0.7 },
  { min: 2600, max: 2699, categoryKey: "OTHER_LIABILITY", confidence: 0.8 },
  { min: 2700, max: 2799, categoryKey: "OTHER_LIABILITY", confidence: 0.8 },
  { min: 2800, max: 2899, categoryKey: "OTHER_LIABILITY", confidence: 0.7 },
  { min: 2900, max: 2999, categoryKey: "OTHER_LIABILITY", confidence: 0.7 },

  // 3xxx - Revenue
  { min: 3000, max: 3899, categoryKey: "REVENUE", confidence: 0.9 },
  { min: 3900, max: 3999, categoryKey: "OTHER_REVENUE", confidence: 0.85 },

  // 4xxx - Cost of goods sold
  { min: 4000, max: 4999, categoryKey: "COGS", confidence: 0.9 },

  // 5xxx - Payroll / personnel
  { min: 5000, max: 5099, categoryKey: "PAYROLL", confidence: 0.95 },
  { min: 5100, max: 5199, categoryKey: "PAYROLL", confidence: 0.9 },
  { min: 5200, max: 5299, categoryKey: "PAYROLL", confidence: 0.85 },
  { min: 5300, max: 5399, categoryKey: "PENSION", confidence: 0.9 },
  { min: 5400, max: 5499, categoryKey: "EMPLOYER_TAX", confidence: 0.95 },
  { min: 5500, max: 5599, categoryKey: "OTHER_PERSONNEL", confidence: 0.8 },
  { min: 5600, max: 5699, categoryKey: "OTHER_PERSONNEL", confidence: 0.8 },
  { min: 5700, max: 5799, categoryKey: "OTHER_PERSONNEL", confidence: 0.75 },
  { min: 5800, max: 5899, categoryKey: "OTHER_PERSONNEL", confidence: 0.75 },
  { min: 5900, max: 5999, categoryKey: "OTHER_PERSONNEL", confidence: 0.7 },

  // 6xxx - Other operating expenses
  { min: 6000, max: 6099, categoryKey: "DEPRECIATION", confidence: 0.9 },
  { min: 6100, max: 6199, categoryKey: "OTHER_EXPENSE", confidence: 0.7 },
  { min: 6200, max: 6299, categoryKey: "RENT", confidence: 0.85 },
  { min: 6300, max: 6399, categoryKey: "RENT", confidence: 0.8 },
  { min: 6400, max: 6499, categoryKey: "OFFICE", confidence: 0.8 },
  { min: 6500, max: 6599, categoryKey: "OFFICE", confidence: 0.75 },
  { min: 6600, max: 6699, categoryKey: "OFFICE", confidence: 0.7 },
  { min: 6700, max: 6799, categoryKey: "CONSULTANTS", confidence: 0.75 },
  { min: 6800, max: 6899, categoryKey: "TELECOM", confidence: 0.8 },
  { min: 6900, max: 6999, categoryKey: "OTHER_EXPENSE", confidence: 0.6 },

  // 7xxx - Other operating expenses continued
  { min: 7000, max: 7099, categoryKey: "VEHICLE", confidence: 0.85 },
  { min: 7100, max: 7199, categoryKey: "TRAVEL", confidence: 0.85 },
  { min: 7200, max: 7299, categoryKey: "TRAVEL", confidence: 0.8 },
  { min: 7300, max: 7399, categoryKey: "MARKETING", confidence: 0.85 },
  { min: 7400, max: 7499, categoryKey: "SOFTWARE_IT", confidence: 0.8 },
  { min: 7500, max: 7599, categoryKey: "INSURANCE", confidence: 0.85 },
  { min: 7600, max: 7699, categoryKey: "OTHER_EXPENSE", confidence: 0.6 },
  { min: 7700, max: 7799, categoryKey: "OTHER_EXPENSE", confidence: 0.6 },
  { min: 7800, max: 7899, categoryKey: "OTHER_EXPENSE", confidence: 0.6 },
  { min: 7900, max: 7999, categoryKey: "OTHER_EXPENSE", confidence: 0.6 },

  // 8xxx - Financial items
  { min: 8000, max: 8049, categoryKey: "INTEREST_INCOME", confidence: 0.85 },
  { min: 8050, max: 8099, categoryKey: "INTEREST", confidence: 0.85 },
  { min: 8100, max: 8199, categoryKey: "INTEREST", confidence: 0.8 },
  { min: 8200, max: 8299, categoryKey: "OTHER_EXPENSE", confidence: 0.6 },
  { min: 8300, max: 8399, categoryKey: "OTHER_EXPENSE", confidence: 0.6 },
  { min: 8400, max: 8499, categoryKey: "OTHER_EXPENSE", confidence: 0.6 },
  { min: 8500, max: 8599, categoryKey: "OTHER_EXPENSE", confidence: 0.6 },
  { min: 8600, max: 8699, categoryKey: "OTHER_EXPENSE", confidence: 0.6 },
  { min: 8700, max: 8799, categoryKey: "OTHER_EXPENSE", confidence: 0.5 },
  { min: 8800, max: 8899, categoryKey: "TAX", confidence: 0.9 },
  { min: 8900, max: 8999, categoryKey: "OTHER_EXPENSE", confidence: 0.5 },
];

// ─── Keyword-based matching ───────────────────────────────────────────────

interface KeywordMapping {
  keywords: string[];
  categoryKey: string;
  confidence: number;
}

/**
 * Norwegian (bokmål) and English keywords for account name matching.
 */
const KEYWORD_MAPPINGS: KeywordMapping[] = [
  { keywords: ["salgsinntekt", "salg", "omsetning", "revenue", "sales"], categoryKey: "REVENUE", confidence: 0.8 },
  { keywords: ["varekostnad", "varekjøp", "innkjøp", "cogs", "cost of goods"], categoryKey: "COGS", confidence: 0.8 },
  { keywords: ["lønn", "lønnskostnad", "salary", "payroll", "wage"], categoryKey: "PAYROLL", confidence: 0.85 },
  { keywords: ["feriepenger", "holiday pay"], categoryKey: "PAYROLL", confidence: 0.85 },
  { keywords: ["arbeidsgiveravgift", "aga", "employer tax", "employer contribution"], categoryKey: "EMPLOYER_TAX", confidence: 0.9 },
  { keywords: ["pensjon", "pension", "otp"], categoryKey: "PENSION", confidence: 0.9 },
  { keywords: ["husleie", "leie av lokaler", "rent"], categoryKey: "RENT", confidence: 0.85 },
  { keywords: ["programvare", "software", "it-kostnad", "lisens"], categoryKey: "SOFTWARE_IT", confidence: 0.8 },
  { keywords: ["markedsføring", "reklame", "annonse", "marketing", "advertising"], categoryKey: "MARKETING", confidence: 0.8 },
  { keywords: ["reise", "diett", "travel"], categoryKey: "TRAVEL", confidence: 0.8 },
  { keywords: ["bil", "kjøretøy", "drivstoff", "vehicle", "fuel"], categoryKey: "VEHICLE", confidence: 0.8 },
  { keywords: ["forsikring", "insurance"], categoryKey: "INSURANCE", confidence: 0.85 },
  { keywords: ["konsulent", "rådgivning", "consultant"], categoryKey: "CONSULTANTS", confidence: 0.75 },
  { keywords: ["kontor", "rekvisita", "office"], categoryKey: "OFFICE", confidence: 0.75 },
  { keywords: ["telefon", "mobil", "data", "bredbånd", "telecom"], categoryKey: "TELECOM", confidence: 0.8 },
  { keywords: ["avskrivning", "depreciation", "nedskrivning"], categoryKey: "DEPRECIATION", confidence: 0.9 },
  { keywords: ["rente", "interest"], categoryKey: "INTEREST", confidence: 0.75 },
  { keywords: ["renteinntekt", "interest income"], categoryKey: "INTEREST_INCOME", confidence: 0.8 },
  { keywords: ["skatt", "tax"], categoryKey: "TAX", confidence: 0.7 },
  { keywords: ["bank", "kasse", "kontant", "cash"], categoryKey: "CASH", confidence: 0.7 },
  { keywords: ["kundefordring", "accounts receivable"], categoryKey: "ACCOUNTS_RECEIVABLE", confidence: 0.8 },
  { keywords: ["leverandørgjeld", "accounts payable"], categoryKey: "ACCOUNTS_PAYABLE", confidence: 0.8 },
  { keywords: ["egenkapital", "equity"], categoryKey: "EQUITY", confidence: 0.8 },
];

// ─── VAT code hints ───────────────────────────────────────────────────────

const VAT_CATEGORY_HINTS: Record<string, string> = {
  // Output VAT codes typically map to revenue accounts
  "3": "REVENUE",   // Standard rate output VAT
  "31": "REVENUE",
  "32": "REVENUE",
  "33": "REVENUE",
  // Input VAT codes typically map to cost accounts
  "1": "OTHER_EXPENSE",  // Standard rate input VAT
};

// ─── Result types ─────────────────────────────────────────────────────────

export interface AccountMappingResult {
  categoryKey: string;
  confidence: number;
  source: "account_range" | "keyword" | "vat_hint" | "combined";
}

export interface BulkMappingResult {
  mapped: number;
  skipped: number;
  errors: Array<{ accountNumber: string; error: string }>;
}

// ─── AccountMapper class ──────────────────────────────────────────────────

export class AccountMapper {
  private supabase: SupabaseClient<Database>;
  private companyId: string;

  constructor(supabase: SupabaseClient<Database>, companyId: string) {
    this.supabase = supabase;
    this.companyId = companyId;
  }

  /**
   * Map a GL account number to an AccountCategory using deterministic rules:
   *   1. Account number ranges (Norwegian standard NS 4102)
   *   2. Account name keywords (Norwegian and English)
   *   3. VAT code hints
   *
   * When multiple sources agree, confidence increases. When they disagree,
   * the highest-confidence single source wins.
   */
  mapAccount(
    accountNumber: string,
    accountName: string,
    vatCode?: string
  ): AccountMappingResult {
    const num = parseInt(accountNumber, 10);
    if (isNaN(num)) {
      return { categoryKey: "OTHER_EXPENSE", confidence: 0.1, source: "account_range" };
    }

    // 1. Account number range lookup
    const rangeResult = this.mapByRange(num);

    // 2. Keyword matching against account name
    const keywordResult = this.mapByKeyword(accountName);

    // 3. VAT code hint
    const vatResult = vatCode ? this.mapByVatCode(vatCode) : null;

    // Combine results: if range and keyword agree, boost confidence
    if (rangeResult && keywordResult) {
      if (rangeResult.categoryKey === keywordResult.categoryKey) {
        return {
          categoryKey: rangeResult.categoryKey,
          confidence: Math.min(1.0, Math.max(rangeResult.confidence, keywordResult.confidence) + 0.1),
          source: "combined",
        };
      }
      // They disagree: pick the higher confidence one
      if (rangeResult.confidence >= keywordResult.confidence) {
        return { ...rangeResult, source: "account_range" };
      }
      return { ...keywordResult, source: "keyword" };
    }

    if (rangeResult) {
      // Check if VAT hint agrees
      if (vatResult && vatResult.categoryKey === rangeResult.categoryKey) {
        return {
          categoryKey: rangeResult.categoryKey,
          confidence: Math.min(1.0, rangeResult.confidence + 0.05),
          source: "combined",
        };
      }
      return { ...rangeResult, source: "account_range" };
    }

    if (keywordResult) {
      return { ...keywordResult, source: "keyword" };
    }

    if (vatResult) {
      return { ...vatResult, source: "vat_hint" };
    }

    // Fallback: guess based on leading digit
    return this.fallbackByLeadingDigit(num);
  }

  /**
   * Map all unmapped GL accounts for this company. Inserts account_mappings
   * rows for any gl_account that does not already have a mapping.
   */
  async mapAllAccounts(): Promise<BulkMappingResult> {
    // Fetch all GL accounts for this company
    const { data: accounts, error: accountsError } = await this.supabase
      .from("gl_accounts")
      .select("id, account_number, name")
      .eq("company_id", this.companyId)
      .eq("is_active", true);

    if (accountsError) {
      throw new Error(`Failed to fetch GL accounts: ${accountsError.message}`);
    }

    if (!accounts || accounts.length === 0) {
      return { mapped: 0, skipped: 0, errors: [] };
    }

    // Fetch existing mappings for this company
    const { data: existingMappings, error: mappingsError } = await this.supabase
      .from("account_mappings")
      .select("gl_account_id")
      .eq("company_id", this.companyId);

    if (mappingsError) {
      throw new Error(`Failed to fetch existing mappings: ${mappingsError.message}`);
    }

    const mappedAccountIds = new Set(
      (existingMappings || []).map((m) => m.gl_account_id)
    );

    let mapped = 0;
    let skipped = 0;
    const errors: Array<{ accountNumber: string; error: string }> = [];

    // Process unmapped accounts
    const toInsert: Array<{
      company_id: string;
      gl_account_id: string;
      category_key: string;
      confidence: number;
      source: string;
    }> = [];

    for (const account of accounts) {
      if (mappedAccountIds.has(account.id)) {
        skipped++;
        continue;
      }

      try {
        const result = this.mapAccount(account.account_number, account.name);
        toInsert.push({
          company_id: this.companyId,
          gl_account_id: account.id,
          category_key: result.categoryKey,
          confidence: result.confidence,
          source: result.source,
        });
        mapped++;
      } catch (err) {
        errors.push({
          accountNumber: account.account_number,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Batch insert
    if (toInsert.length > 0) {
      const { error: insertError } = await this.supabase
        .from("account_mappings")
        .insert(toInsert);

      if (insertError) {
        throw new Error(`Failed to insert account mappings: ${insertError.message}`);
      }
    }

    return { mapped, skipped, errors };
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private mapByRange(num: number): AccountMappingResult | null {
    for (const range of ACCOUNT_RANGES) {
      if (num >= range.min && num <= range.max) {
        return {
          categoryKey: range.categoryKey,
          confidence: range.confidence,
          source: "account_range",
        };
      }
    }
    return null;
  }

  private mapByKeyword(accountName: string): AccountMappingResult | null {
    const normalized = accountName.toLowerCase().replace(/[^a-z0-9æøå]/g, " ");

    let bestMatch: AccountMappingResult | null = null;

    for (const mapping of KEYWORD_MAPPINGS) {
      for (const keyword of mapping.keywords) {
        if (normalized.includes(keyword.toLowerCase())) {
          if (!bestMatch || mapping.confidence > bestMatch.confidence) {
            bestMatch = {
              categoryKey: mapping.categoryKey,
              confidence: mapping.confidence,
              source: "keyword",
            };
          }
        }
      }
    }

    return bestMatch;
  }

  private mapByVatCode(vatCode: string): AccountMappingResult | null {
    const hint = VAT_CATEGORY_HINTS[vatCode];
    if (hint) {
      return {
        categoryKey: hint,
        confidence: 0.4,
        source: "vat_hint",
      };
    }
    return null;
  }

  private fallbackByLeadingDigit(num: number): AccountMappingResult {
    const leading = Math.floor(num / 1000);
    const fallbackMap: Record<number, string> = {
      1: "OTHER_ASSET",
      2: "OTHER_LIABILITY",
      3: "REVENUE",
      4: "COGS",
      5: "PAYROLL",
      6: "OTHER_EXPENSE",
      7: "OTHER_EXPENSE",
      8: "OTHER_EXPENSE",
      9: "OTHER_EXPENSE",
    };

    return {
      categoryKey: fallbackMap[leading] || "OTHER_EXPENSE",
      confidence: 0.3,
      source: "account_range",
    };
  }
}
