/**
 * Accounting Advisor (Regnskapsassistent)
 *
 * AI-based advisory module that helps users with Norwegian accounting
 * questions: which account to use, VAT treatment, expense vs capitalize,
 * periodization, and more.
 *
 * Key principle: the advisor combines general Norwegian accounting knowledge
 * (rules, VAT rates, standard chart of accounts) with the specific company's
 * chart of accounts and historical posting patterns.
 *
 * Flow (spec section 38):
 * 1. Understand the transaction (what, who, supplier, country, amount)
 * 2. Check company context (VAT status, industry, chart of accounts, history)
 * 3. Classify: cost type, balance vs income statement, VAT, periodization
 * 4. Find matching account in the company's actual chart of accounts
 * 5. Assess confidence (HIGH/MEDIUM/LOW)
 * 6. Determine risk level (low/medium/high)
 * 7. Return structured recommendation
 */

import { createClient } from "@/lib/supabase/server";
import type {
  VendorPostingPattern,
  GLAccount,
  AccountTransaction,
  Company,
  VatSettings,
  VatCode,
} from "@/lib/types/database";
import type {
  AccountingQuery,
  AccountingRecommendation,
  AccountRef,
  AlternativeAccount,
  CompanyContext,
  CompanyAccount,
  CompanyVatCode,
  SimilarTransaction,
  VendorHistory,
  VatRecommendation,
} from "./types";
import {
  findMatchingScenarios,
  COMMON_SCENARIOS,
} from "./rules/common-scenarios";
import {
  shouldCapitalize,
  shouldPeriodize,
  CAPITALIZATION_THRESHOLD_NOK,
  findDepreciationGroup,
} from "./rules/accounting-principles";
import {
  requiresReverseCharge,
  VAT_RATE_STANDARD,
  REPRESENTATION_LIMIT_PER_PERSON_NOK,
} from "./rules/vat-rules";
import {
  searchStandardAccounts,
  findStandardAccount,
  STANDARD_ACCOUNTS,
} from "./rules/chart-of-accounts-standard";
import {
  getEscalationNote,
  adjustRiskForEscalation,
  checkEscalation,
} from "./rules/escalation-rules";

// Re-export types and submodules for convenient access
export type {
  AccountingQuery,
  AccountingRecommendation,
  SimilarTransaction,
  VendorHistory,
  AdvisorDocumentExtraction,
  CompanyContext,
} from "./types";
export { DocumentAnalyzer, DocumentAnalysisError } from "./document-analyzer";
export { toConfidenceLevel } from "./types";

// ---------------------------------------------------------------------------
// AccountingAdvisor
// ---------------------------------------------------------------------------

export class AccountingAdvisor {
  /**
   * Get a structured accounting recommendation for a transaction.
   *
   * This is the main entry point. It follows the seven-step flow:
   * 1. Understand the transaction
   * 2. Check company context
   * 3. Classify the transaction
   * 4. Find matching account
   * 5. Assess confidence
   * 6. Determine risk
   * 7. Return structured recommendation
   *
   * @param input Query describing the transaction
   * @returns Structured recommendation with account, VAT, treatment, etc.
   */
  async getRecommendation(
    input: AccountingQuery
  ): Promise<AccountingRecommendation> {
    // ── Step 1: Understand the transaction ──────────────────────────────
    const description = this.buildSearchText(input);
    const amount = this.resolveAmount(input);
    const currency = input.currency ?? input.documentExtraction?.currency ?? "NOK";
    const country = input.country ?? input.documentExtraction?.country ?? null;
    const vendorName =
      input.vendorName ??
      input.documentExtraction?.supplier?.name ??
      undefined;

    // ── Step 2: Check company context ──────────────────────────────────
    const [context, vendorHistory, similarTx] = await Promise.all([
      this.getCompanyContext(input.companyId),
      vendorName
        ? this.getVendorHistory(input.companyId, vendorName)
        : Promise.resolve(null),
      this.findSimilarTransactions(input.companyId, vendorName, description),
    ]);

    // ── Step 3: Classify the transaction ───────────────────────────────
    const matchedScenarios = findMatchingScenarios(description, vendorName);
    const primaryScenario = matchedScenarios[0] ?? null;

    const classification = this.classifyTransaction(
      description,
      primaryScenario?.name_nb ?? null,
      vendorName
    );

    // Determine treatment: expense, capitalize, or review_needed
    const treatment = this.determineTreatment(
      amount,
      primaryScenario?.treatment ?? null,
      description
    );

    // Determine periodization
    const { periodization, periodization_note } =
      this.assessPeriodization(amount, description, primaryScenario);

    // ── Step 4: Find matching account ──────────────────────────────────
    const { recommended_account, alternative_accounts } =
      this.findBestAccount(
        context,
        vendorHistory,
        primaryScenario,
        description,
        treatment
      );

    // ── Step 5: Determine VAT treatment ────────────────────────────────
    const vat = this.determineVat(
      context,
      primaryScenario,
      country,
      description,
      vendorHistory
    );

    // ── Step 6: Assess confidence ──────────────────────────────────────
    const confidence = this.assessConfidence(
      primaryScenario !== null,
      vendorHistory,
      recommended_account !== null,
      similarTx.length,
      context.vat_registered
    );

    // ── Step 7: Determine risk and build recommendation ────────────────
    const escalationNote = getEscalationNote(
      description,
      vendorName,
      amount,
      confidence
    );

    let risk_level: AccountingRecommendation["risk_level"] =
      primaryScenario?.risk_level ?? "low";
    risk_level = adjustRiskForEscalation(risk_level, escalationNote);

    const reasoning_summary = this.buildReasoningSummary(
      classification,
      recommended_account,
      vat,
      treatment,
      periodization,
      vendorHistory,
      primaryScenario?.name_nb ?? null,
      country,
      currency
    );

    const { needs_user_input, questions } = this.determineQuestions(
      input,
      recommended_account,
      confidence,
      primaryScenario
    );

    const poweroffice_instructions = this.buildPowerOfficeInstructions(
      recommended_account,
      vat,
      treatment
    );

    return {
      classification,
      recommended_account,
      alternative_accounts,
      vat,
      treatment,
      periodization,
      periodization_note,
      confidence,
      risk_level,
      reasoning_summary,
      needs_user_input,
      questions,
      poweroffice_instructions,
      escalation_note: escalationNote,
    };
  }

  /**
   * Search historical transactions for similar vendor or description.
   *
   * @param companyId Company ID
   * @param vendorName Vendor name (partial match)
   * @param description Transaction description (partial match)
   * @returns List of similar transactions, most recent first
   */
  async findSimilarTransactions(
    companyId: string,
    vendorName?: string,
    description?: string
  ): Promise<SimilarTransaction[]> {
    const supabase = await createClient();

    const results: SimilarTransaction[] = [];

    // Search by vendor via vendor_posting_patterns + account_transactions
    if (vendorName) {
      const { data: patterns } = await supabase
        .from("vendor_posting_patterns")
        .select()
        .eq("company_id", companyId)
        .ilike("vendor_name", `%${vendorName}%`)
        .order("occurrence_count", { ascending: false })
        .limit(5)
        .returns<VendorPostingPattern[]>();

      if (patterns && patterns.length > 0) {
        // Get account names for the typical accounts
        const accountNumbers = patterns
          .map((p) => p.typical_account_number)
          .filter(Boolean) as string[];

        const { data: accounts } = await supabase
          .from("gl_accounts")
          .select()
          .eq("company_id", companyId)
      .limit(2000)
          .in("account_number", accountNumbers)
          .returns<GLAccount[]>();

        const accountMap = new Map(
          (accounts ?? []).map((a) => [a.account_number, a.name])
        );

        // Get recent transactions for these accounts
        for (const pattern of patterns) {
          if (!pattern.typical_account_number) continue;

          const { data: transactions } = await supabase
            .from("account_transactions")
            .select()
            .eq("company_id", companyId)
            .eq("account_number", pattern.typical_account_number)
            .ilike("description", `%${vendorName}%`)
            .order("transaction_date", { ascending: false })
            .limit(5)
            .returns<AccountTransaction[]>();

          for (const tx of transactions ?? []) {
            results.push({
              account_number: tx.account_number,
              account_name:
                accountMap.get(tx.account_number) ?? tx.account_number,
              description: tx.description ?? "",
              date: tx.transaction_date,
              amount: tx.amount,
              currency: tx.currency,
              vat_code: tx.vat_code,
              vendor_name: pattern.vendor_name,
            });
          }
        }
      }
    }

    // Search by description text if we don't have enough results
    if (description && results.length < 5) {
      const searchTerms = description
        .split(/\s+/)
        .filter((t) => t.length > 3)
        .slice(0, 3);

      for (const term of searchTerms) {
        const { data: transactions } = await supabase
          .from("account_transactions")
          .select()
          .eq("company_id", companyId)
          .ilike("description", `%${term}%`)
          .order("transaction_date", { ascending: false })
          .limit(3)
          .returns<AccountTransaction[]>();

        if (!transactions) continue;

        // Get account names
        const txAccountNumbers = [
          ...new Set(transactions.map((t) => t.account_number)),
        ];
        const { data: accounts } = await supabase
          .from("gl_accounts")
          .select()
          .eq("company_id", companyId)
      .limit(2000)
          .in("account_number", txAccountNumbers)
          .returns<GLAccount[]>();

        const accountMap = new Map(
          (accounts ?? []).map((a) => [a.account_number, a.name])
        );

        for (const tx of transactions) {
          // Deduplicate
          if (
            results.some(
              (r) =>
                r.account_number === tx.account_number &&
                r.date === tx.transaction_date &&
                r.amount === tx.amount
            )
          ) {
            continue;
          }

          results.push({
            account_number: tx.account_number,
            account_name:
              accountMap.get(tx.account_number) ?? tx.account_number,
            description: tx.description ?? "",
            date: tx.transaction_date,
            amount: tx.amount,
            currency: tx.currency,
            vat_code: tx.vat_code,
            vendor_name: null,
          });
        }
      }
    }

    return results.slice(0, 10);
  }

  /**
   * Get posting history for a specific vendor.
   *
   * @param companyId Company ID
   * @param vendorName Vendor name
   * @returns Aggregated vendor posting history
   */
  async getVendorHistory(
    companyId: string,
    vendorName: string
  ): Promise<VendorHistory> {
    const supabase = await createClient();

    // Get vendor posting patterns
    const { data: patterns } = await supabase
      .from("vendor_posting_patterns")
      .select()
      .eq("company_id", companyId)
      .ilike("vendor_name", `%${vendorName}%`)
      .order("occurrence_count", { ascending: false })
      .returns<VendorPostingPattern[]>();

    if (!patterns || patterns.length === 0) {
      return {
        vendor_name: vendorName,
        typical_account: null,
        typical_vat_code: null,
        transaction_count: 0,
        accounts_used: [],
        first_transaction_date: null,
        last_transaction_date: null,
      };
    }

    // The first pattern has the highest occurrence count
    const primary = patterns[0];

    // Resolve account name for the typical account
    let typicalAccount: AccountRef | null = null;
    if (primary.typical_account_number) {
      const { data: account } = await supabase
        .from("gl_accounts")
        .select()
        .eq("company_id", companyId)
      .limit(2000)
        .eq("account_number", primary.typical_account_number)
        .returns<GLAccount[]>()
        .single();

      if (account) {
        typicalAccount = {
          number: account.account_number,
          name: account.name,
        };
      }
    }

    // Resolve all account names
    const allAccountNumbers = patterns
      .map((p) => p.typical_account_number)
      .filter(Boolean) as string[];

    const { data: allAccounts } = await supabase
      .from("gl_accounts")
      .select()
      .eq("company_id", companyId)
      .limit(2000)
      .in("account_number", allAccountNumbers)
      .returns<GLAccount[]>();

    const accountNameMap = new Map(
      (allAccounts ?? []).map((a) => [a.account_number, a.name])
    );

    // Get transaction date range
    const { data: dateRange } = await supabase
      .from("account_transactions")
      .select()
      .eq("company_id", companyId)
      .ilike("description", `%${vendorName}%`)
      .order("transaction_date", { ascending: true })
      .limit(1)
      .returns<AccountTransaction[]>();

    const { data: lastDate } = await supabase
      .from("account_transactions")
      .select()
      .eq("company_id", companyId)
      .ilike("description", `%${vendorName}%`)
      .order("transaction_date", { ascending: false })
      .limit(1)
      .returns<AccountTransaction[]>();

    const totalCount = patterns.reduce(
      (sum, p) => sum + p.occurrence_count,
      0
    );

    return {
      vendor_name: primary.vendor_name,
      typical_account: typicalAccount,
      typical_vat_code: primary.typical_vat_code,
      transaction_count: totalCount,
      accounts_used: patterns.map((p) => ({
        account_number: p.typical_account_number ?? "",
        account_name:
          accountNameMap.get(p.typical_account_number ?? "") ??
          p.typical_account_number ??
          "",
        count: p.occurrence_count,
        total_amount: 0, // Would need aggregation query to fill
      })),
      first_transaction_date: dateRange?.[0]?.transaction_date ?? null,
      last_transaction_date: lastDate?.[0]?.transaction_date ?? null,
    };
  }

  // =========================================================================
  // Private helper methods
  // =========================================================================

  /**
   * Fetch company-specific context: chart of accounts, VAT settings, etc.
   */
  private async getCompanyContext(
    companyId: string
  ): Promise<CompanyContext> {
    const supabase = await createClient();

    const [companyResult, vatResult, accountsResult, vatCodesResult] =
      await Promise.all([
        supabase
          .from("companies")
          .select()
          .eq("id", companyId)
          .returns<Company[]>()
          .single(),
        supabase
          .from("vat_settings")
          .select()
          .eq("company_id", companyId)
          .returns<VatSettings[]>()
          .single(),
        supabase
          .from("gl_accounts")
          .select()
          .eq("company_id", companyId)
      .limit(2000)
          .eq("is_active", true)
          .order("account_number")
          .returns<GLAccount[]>(),
        supabase
          .from("vat_codes")
          .select()
          .eq("company_id", companyId)
          .eq("is_active", true)
          .returns<VatCode[]>(),
      ]);

    const company = companyResult.data;
    if (!company) {
      throw new AccountingAdvisorError(
        `Selskap med ID ${companyId} ble ikke funnet.`
      );
    }

    const accounts: CompanyAccount[] = (accountsResult.data ?? []).map(
      (a) => ({
        account_number: a.account_number,
        name: a.name,
        is_active: a.is_active,
        account_type: a.account_type,
      })
    );

    const vatCodes: CompanyVatCode[] = (vatCodesResult.data ?? []).map(
      (v) => ({
        code: v.code,
        name: v.name,
        rate: v.rate,
        is_active: v.is_active,
      })
    );

    return {
      company_id: companyId,
      company_name: company.name,
      org_number: company.org_number,
      industry: company.industry,
      vat_registered: vatResult.data?.vat_registered ?? false,
      vat_period: vatResult.data?.vat_period as CompanyContext["vat_period"],
      chart_of_accounts: accounts,
      vat_codes: vatCodes,
    };
  }

  /**
   * Build a combined search text from all available inputs.
   */
  private buildSearchText(input: AccountingQuery): string {
    const parts = [input.description];
    if (input.vendorName) parts.push(input.vendorName);
    if (input.userQuestion) parts.push(input.userQuestion);
    if (input.documentExtraction?.supplier?.name) {
      parts.push(input.documentExtraction.supplier.name);
    }
    if (input.documentExtraction?.lines) {
      for (const line of input.documentExtraction.lines) {
        if (line.description) parts.push(line.description);
      }
    }
    return parts.join(" ");
  }

  /**
   * Resolve the transaction amount from the query or document extraction.
   */
  private resolveAmount(input: AccountingQuery): number | undefined {
    if (input.amount !== undefined) return input.amount;
    if (input.documentExtraction?.total_amount !== null) {
      return input.documentExtraction?.total_amount ?? undefined;
    }
    return undefined;
  }

  /**
   * Classify the transaction into a category.
   */
  private classifyTransaction(
    description: string,
    scenarioName: string | null,
    vendorName: string | undefined
  ): string {
    if (scenarioName) return scenarioName;

    // Fallback: use vendor name or description
    if (vendorName) return `Transaksjon fra ${vendorName}`;
    if (description.length > 60) return description.slice(0, 57) + "...";
    return description;
  }

  /**
   * Determine whether the transaction should be expensed, capitalized,
   * or flagged for review.
   */
  private determineTreatment(
    amount: number | undefined,
    scenarioTreatment: "expense" | "capitalize" | "depends" | "review_needed" | null,
    description: string
  ): AccountingRecommendation["treatment"] {
    // If the scenario says capitalize, use it
    if (scenarioTreatment === "capitalize") return "capitalize";
    if (scenarioTreatment === "expense") return "expense";

    // Check escalation keywords that require review
    const escalations = checkEscalation(description);
    if (escalations.some((e) => e.severity === "block")) return "review_needed";

    // Check capitalization threshold
    if (amount !== undefined) {
      // If the amount is clearly above the threshold and the description
      // suggests a durable asset, recommend capitalization
      if (amount >= CAPITALIZATION_THRESHOLD_NOK) {
        const assetKeywords = [
          "maskin",
          "utstyr",
          "inventar",
          "server",
          "bil",
          "kjøretøy",
          "bygning",
          "anlegg",
          "møbel",
          "pc",
          "laptop",
          "mac",
          "workstation",
        ];
        const lower = description.toLowerCase();
        if (assetKeywords.some((kw) => lower.includes(kw))) {
          return "capitalize";
        }
      }
    }

    if (scenarioTreatment === "depends") return "review_needed";

    return "expense";
  }

  /**
   * Assess whether the cost should be periodized.
   */
  private assessPeriodization(
    amount: number | undefined,
    description: string,
    scenario: ReturnType<typeof findMatchingScenarios>[number] | null
  ): { periodization: boolean; periodization_note?: string } {
    const lower = description.toLowerCase();

    // Check for subscription/annual period indicators
    const annualKeywords = [
      "årsabonnement",
      "årlig",
      "12 mnd",
      "12 måneder",
      "annual",
      "yearly",
      "per år",
      "pr. år",
    ];
    const isAnnual = annualKeywords.some((kw) => lower.includes(kw));

    if (isAnnual && shouldPeriodize(amount ?? 0, 12)) {
      return {
        periodization: true,
        periodization_note:
          "Årlig kostnad over vesentlighetsgrensen bør periodiseres " +
          "over 12 måneder. Før forholdsmessig del som månedskostnad, " +
          "resten som forskuddsbetalt kostnad (konto 1700).",
      };
    }

    // Insurance, rent, and other multi-period costs
    const periodizedCategories = [
      "forsikring",
      "husleie",
      "leie",
      "lisens",
      "garanti",
      "support",
      "vedlikeholdsavtale",
      "serviceavtale",
    ];

    const hasPeriodIndicator = periodizedCategories.some((cat) =>
      lower.includes(cat)
    );

    if (hasPeriodIndicator && amount !== undefined && amount >= 50_000) {
      return {
        periodization: true,
        periodization_note:
          "Kostnaden dekker mer enn en periode og beløp er vesentlig. " +
          "Bør periodiseres over avtaleperioden.",
      };
    }

    return { periodization: false };
  }

  /**
   * Find the best matching account in the company's chart of accounts.
   * Falls back to standard NS 4102 accounts if the company's chart
   * doesn't have a clear match.
   */
  private findBestAccount(
    context: CompanyContext,
    vendorHistory: VendorHistory | null,
    scenario: ReturnType<typeof findMatchingScenarios>[number] | null,
    description: string,
    treatment: AccountingRecommendation["treatment"]
  ): {
    recommended_account: AccountRef | null;
    alternative_accounts: AlternativeAccount[];
  } {
    const alternatives: AlternativeAccount[] = [];

    // Priority 1: Vendor history — the company has booked this vendor before
    if (vendorHistory?.typical_account) {
      const companyMatch = context.chart_of_accounts.find(
        (a) => a.account_number === vendorHistory.typical_account!.number
      );
      if (companyMatch) {
        // Add other accounts the vendor has been booked to as alternatives
        for (const used of vendorHistory.accounts_used.slice(1, 4)) {
          const alt = context.chart_of_accounts.find(
            (a) => a.account_number === used.account_number
          );
          if (alt) {
            alternatives.push({
              number: alt.account_number,
              name: alt.name,
              reason: `Brukt ${used.count} ganger tidligere for denne leverandøren.`,
            });
          }
        }

        return {
          recommended_account: {
            number: companyMatch.account_number,
            name: companyMatch.name,
          },
          alternative_accounts: alternatives,
        };
      }
    }

    // Priority 2: Scenario match — we know the typical account numbers
    if (scenario) {
      for (const typicalAccount of scenario.typical_accounts) {
        // Try to find this account in the company's chart
        const companyMatch = context.chart_of_accounts.find(
          (a) => a.account_number === typicalAccount.number
        );

        if (companyMatch) {
          // First match is the recommendation
          if (alternatives.length === 0 && !alternatives.length) {
            // Add remaining typical accounts as alternatives
            const remaining = scenario.typical_accounts.filter(
              (ta) => ta.number !== typicalAccount.number
            );
            for (const rem of remaining) {
              const altMatch = context.chart_of_accounts.find(
                (a) => a.account_number === rem.number
              );
              if (altMatch) {
                alternatives.push({
                  number: altMatch.account_number,
                  name: altMatch.name,
                  reason: `Alternativ konto for ${scenario.name_nb}.`,
                });
              }
            }

            return {
              recommended_account: {
                number: companyMatch.account_number,
                name: companyMatch.name,
              },
              alternative_accounts: alternatives,
            };
          }
        }
      }

      // Company doesn't have the exact standard account — find closest
      for (const typicalAccount of scenario.typical_accounts) {
        const num = parseInt(typicalAccount.number, 10);
        const range = this.findAccountInRange(
          context.chart_of_accounts,
          num,
          50
        );
        if (range) {
          alternatives.push({
            number: range.account_number,
            name: range.name,
            reason: `Nærmeste konto i kontoplanen for ${typicalAccount.name}.`,
          });
        }
      }
    }

    // Priority 3: Standard account search by description keywords
    const standardMatches = searchStandardAccounts(description);
    for (const stdAccount of standardMatches.slice(0, 3)) {
      const companyMatch = context.chart_of_accounts.find(
        (a) => a.account_number === stdAccount.number
      );
      if (companyMatch) {
        if (alternatives.length === 0) {
          return {
            recommended_account: {
              number: companyMatch.account_number,
              name: companyMatch.name,
            },
            alternative_accounts: [],
          };
        }
        alternatives.push({
          number: companyMatch.account_number,
          name: companyMatch.name,
          reason: `Standard konto for: ${stdAccount.typical_use_nb}`,
        });
      }
    }

    // If we have alternatives but no primary recommendation, promote the first
    if (alternatives.length > 0) {
      const primary = alternatives.shift()!;
      return {
        recommended_account: {
          number: primary.number,
          name: primary.name,
        },
        alternative_accounts: alternatives,
      };
    }

    // Last resort: return null (we couldn't find a matching account)
    return {
      recommended_account: null,
      alternative_accounts: [],
    };
  }

  /**
   * Find a company account within a range of the target account number.
   */
  private findAccountInRange(
    accounts: CompanyAccount[],
    targetNumber: number,
    range: number
  ): CompanyAccount | null {
    let best: CompanyAccount | null = null;
    let bestDistance = Infinity;

    for (const account of accounts) {
      const num = parseInt(account.account_number, 10);
      if (isNaN(num)) continue;

      const distance = Math.abs(num - targetNumber);
      if (distance <= range && distance < bestDistance) {
        best = account;
        bestDistance = distance;
      }
    }

    return best;
  }

  /**
   * Determine the VAT treatment for the transaction.
   */
  private determineVat(
    context: CompanyContext,
    scenario: ReturnType<typeof findMatchingScenarios>[number] | null,
    country: string | null,
    description: string,
    vendorHistory: VendorHistory | null
  ): VatRecommendation {
    // Not VAT registered — no VAT to deduct
    if (!context.vat_registered) {
      return {
        recommendation:
          "Selskapet er ikke MVA-registrert. Ingen inngående MVA å trekke fra.",
        vat_code: null,
        rate: null,
        notes: "Kostnaden bokføres inkl. MVA.",
      };
    }

    // Foreign service — reverse charge
    const isService = this.looksLikeService(description);
    if (requiresReverseCharge(country, isService)) {
      return {
        recommendation:
          "Snudd avregning (reverse charge). Beregn 25 % utgående MVA " +
          "og trekk fra tilsvarende inngående MVA.",
        vat_code: null,
        rate: VAT_RATE_STANDARD,
        notes:
          "Utenlandsk leverandør fakturerer uten norsk MVA. " +
          "Kjøper beregner og rapporterer MVA i MVA-meldingen. " +
          "Netto MVA-effekt er normalt null for fullt fradragsberettigede.",
      };
    }

    // Vendor history — use the same VAT code as before
    if (vendorHistory?.typical_vat_code) {
      const vatCode = context.vat_codes.find(
        (v) => v.code === vendorHistory.typical_vat_code
      );
      if (vatCode) {
        return {
          recommendation: `Basert på historikk: MVA-kode ${vatCode.code} (${vatCode.rate ?? "?"}%).`,
          vat_code: vatCode.code,
          rate: vatCode.rate,
          notes: `Denne leverandøren har tidligere vært bokført med MVA-kode ${vatCode.code}.`,
        };
      }
    }

    // Scenario match
    if (scenario) {
      const vatTreatment = scenario.vat_treatment;
      return {
        recommendation: vatTreatment.notes_nb,
        vat_code: vatTreatment.code,
        rate: vatTreatment.rate,
        notes: vatTreatment.deductible
          ? "Full fradragsrett."
          : "Ingen MVA-fradrag for denne typen kostnad.",
      };
    }

    // Default: standard 25% with deduction
    return {
      recommendation: "Standard MVA-sats 25 % med full fradragsrett.",
      vat_code: "1",
      rate: VAT_RATE_STANDARD,
      notes: "",
    };
  }

  /**
   * Heuristic: does the description look like a service (vs. a physical good)?
   */
  private looksLikeService(description: string): boolean {
    const lower = description.toLowerCase();
    const serviceKeywords = [
      "abonnement",
      "subscription",
      "saas",
      "cloud",
      "hosting",
      "konsulent",
      "rådgivning",
      "tjeneste",
      "service",
      "lisens",
      "license",
      "support",
      "vedlikehold",
      "ads",
      "reklame",
      "annonsering",
    ];
    return serviceKeywords.some((kw) => lower.includes(kw));
  }

  /**
   * Assess overall confidence in the recommendation.
   */
  private assessConfidence(
    hasScenarioMatch: boolean,
    vendorHistory: VendorHistory | null,
    hasAccountMatch: boolean,
    similarTransactionCount: number,
    isVatRegistered: boolean
  ): number {
    let confidence = 0.3; // Base confidence

    // Scenario match adds significant confidence
    if (hasScenarioMatch) confidence += 0.25;

    // Vendor history with many occurrences
    if (vendorHistory && vendorHistory.transaction_count > 0) {
      if (vendorHistory.transaction_count >= 5) confidence += 0.25;
      else if (vendorHistory.transaction_count >= 2) confidence += 0.15;
      else confidence += 0.05;
    }

    // Found a matching account in the company's chart
    if (hasAccountMatch) confidence += 0.1;

    // Similar transactions found
    if (similarTransactionCount >= 3) confidence += 0.1;
    else if (similarTransactionCount >= 1) confidence += 0.05;

    return Math.min(confidence, 1.0);
  }

  /**
   * Build a human-readable reasoning summary in Norwegian.
   */
  private buildReasoningSummary(
    classification: string,
    account: AccountRef | null,
    vat: VatRecommendation,
    treatment: AccountingRecommendation["treatment"],
    periodization: boolean,
    vendorHistory: VendorHistory | null,
    scenarioName: string | null,
    country: string | null,
    currency: string
  ): string[] {
    const steps: string[] = [];

    steps.push(`Transaksjon klassifisert som: ${classification}.`);

    if (scenarioName) {
      steps.push(`Matchet kjent scenario: ${scenarioName}.`);
    }

    if (vendorHistory && vendorHistory.transaction_count > 0) {
      steps.push(
        `Leverandøren er bokført ${vendorHistory.transaction_count} gang(er) tidligere` +
          (vendorHistory.typical_account
            ? `, typisk på konto ${vendorHistory.typical_account.number} ${vendorHistory.typical_account.name}.`
            : ".")
      );
    }

    if (account) {
      steps.push(
        `Anbefalt konto: ${account.number} ${account.name}.`
      );
    } else {
      steps.push(
        "Kunne ikke finne en passende konto i kontoplanen. " +
          "Sjekk kontoplanen manuelt."
      );
    }

    if (treatment === "capitalize") {
      steps.push(
        "Beløp over aktiveringsgrensen (kr 15 000). " +
          "Anbefaler aktivering og avskrivning."
      );
    } else if (treatment === "expense") {
      steps.push("Kostnadsføres direkte.");
    } else {
      steps.push("Krever manuell vurdering av regnskapsfører.");
    }

    steps.push(`MVA: ${vat.recommendation}`);

    if (periodization) {
      steps.push("Periodisering anbefalt.");
    }

    if (country && country.toUpperCase() !== "NO") {
      steps.push(
        `Utenlandsk leverandør (${country}). Sjekk regler for snudd avregning.`
      );
    }

    if (currency !== "NOK") {
      steps.push(
        `Valuta: ${currency}. Bokføres i NOK til dagskurs på transaksjonstidspunktet.`
      );
    }

    return steps;
  }

  /**
   * Determine if follow-up questions are needed and what to ask.
   */
  private determineQuestions(
    input: AccountingQuery,
    account: AccountRef | null,
    confidence: number,
    scenario: ReturnType<typeof findMatchingScenarios>[number] | null
  ): { needs_user_input: boolean; questions: string[] } {
    const questions: string[] = [];

    // No account found
    if (!account) {
      questions.push(
        "Hvilken konto ønsker du å bokføre dette på? " +
          "Vi fant ikke en eksakt match i kontoplanen."
      );
    }

    // Low confidence
    if (confidence < 0.5) {
      if (!input.vendorName && !input.documentExtraction?.supplier?.name) {
        questions.push("Hvem er leverandøren?");
      }
      if (!input.amount && !input.documentExtraction?.total_amount) {
        questions.push("Hva er beløp inkl. MVA?");
      }
    }

    // Missing country for potentially foreign transactions
    if (
      !input.country &&
      !input.documentExtraction?.country &&
      this.looksLikeService(input.description)
    ) {
      questions.push(
        "Er leverandøren norsk eller utenlandsk? " +
          "Dette påvirker MVA-behandlingen."
      );
    }

    // Scenario-specific follow-ups
    if (scenario?.conditions_nb) {
      questions.push(scenario.conditions_nb);
    }

    return {
      needs_user_input: questions.length > 0,
      questions,
    };
  }

  /**
   * Build PowerOffice Go-specific booking instructions.
   */
  private buildPowerOfficeInstructions(
    account: AccountRef | null,
    vat: VatRecommendation,
    treatment: AccountingRecommendation["treatment"]
  ): string[] | undefined {
    if (!account) return undefined;

    const instructions: string[] = [];

    instructions.push(
      `Velg konto ${account.number} (${account.name}) i kontoplanen.`
    );

    if (vat.vat_code) {
      instructions.push(`Sett MVA-kode til ${vat.vat_code}.`);
    } else if (vat.rate === 0) {
      instructions.push("Ingen MVA — velg MVA-kode for avgiftsfritt/unntatt.");
    }

    if (treatment === "capitalize") {
      instructions.push(
        "Opprett eiendelen som driftsmiddel i anleggsregisteret. " +
          "Sett opp avskrivningsplan."
      );
    }

    return instructions.length > 0 ? instructions : undefined;
  }
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class AccountingAdvisorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountingAdvisorError";
  }
}
