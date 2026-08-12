/**
 * SAF-T Regnskap XML parser
 *
 * Parses SAF-T Regnskap v1.x into the structures defined in ./types.
 *
 * The format varies slightly between vendors — element casing is stable, but
 * optional blocks come and go, single-element lists are not wrapped in arrays,
 * and some systems emit the namespace prefix while others do not. The helpers
 * below normalize those differences rather than assuming one vendor's shape.
 */

import { XMLParser } from "fast-xml-parser";
import type {
  SaftFile,
  SaftHeader,
  SaftAccount,
  SaftParty,
  SaftTaxCode,
  SaftAnalysisEntry,
  SaftJournal,
  SaftTransaction,
  SaftLine,
} from "./types";
import { SaftParseError } from "./types";

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

type Node = Record<string, unknown>;

/** SAF-T omits the array wrapper when a list has exactly one entry. */
function asArray(value: unknown): Node[] {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value]) as Node[];
}

function str(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "object") return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function num(value: unknown): number | null {
  const s = str(value);
  if (s === null) return null;
  // SAF-T uses '.' as the decimal separator, but some exporters emit ','.
  const parsed = Number(s.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Reads `<X><Amount>123</Amount></X>`, tolerating a bare `<X>123</X>`. */
function amount(node: unknown): number | null {
  if (node == null) return null;
  if (typeof node === "object") {
    return num((node as Node).Amount);
  }
  return num(node);
}

/** SAF-T dates are ISO (YYYY-MM-DD); trim any time component. */
function date(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  const iso = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function firstKey(node: Node | undefined, ...names: string[]): unknown {
  if (!node) return undefined;
  for (const name of names) {
    if (node[name] != null) return node[name];
  }
  return undefined;
}

/** Flattens a SAF-T <Address> block into a single line. */
function addressLine(node: unknown): string | null {
  const a = asArray(node)[0];
  if (!a) return null;
  const parts = [
    str(firstKey(a, "StreetName", "AddressDetail")),
    str(a.Number),
    str(a.PostalCode),
    str(a.City),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

// ---------------------------------------------------------------------------
// Analysis-type classification
// ---------------------------------------------------------------------------

const DEPARTMENT_TYPES = ["avdeling", "department", "avd", "dept"];
const PROJECT_TYPES = ["prosjekt", "project", "pros"];

export function isDepartmentType(analysisType: string): boolean {
  const t = analysisType.toLowerCase();
  return DEPARTMENT_TYPES.some((d) => t.includes(d));
}

export function isProjectType(analysisType: string): boolean {
  const t = analysisType.toLowerCase();
  return PROJECT_TYPES.some((p) => t.includes(p));
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseSaft(xml: string): SaftFile {
  const parser = new XMLParser({
    ignoreAttributes: true,
    // Vendors differ on whether they emit the namespace prefix.
    removeNSPrefix: true,
    // Keep values as strings so we control number/date coercion ourselves;
    // this avoids account numbers like "0470" losing their leading zero.
    parseTagValue: false,
    trimValues: true,
  });

  let doc: Node;
  try {
    doc = parser.parse(xml) as Node;
  } catch (err) {
    throw new SaftParseError(
      `Kunne ikke lese XML-filen: ${err instanceof Error ? err.message : "ukjent feil"}`
    );
  }

  const audit = doc.AuditFile as Node | undefined;
  if (!audit) {
    throw new SaftParseError(
      "Filen ser ikke ut til å være en SAF-T-fil. Fant ikke <AuditFile>. " +
        "Eksporter «SAF-T Regnskap» fra regnskapssystemet ditt og prøv igjen."
    );
  }

  const header = parseHeader(audit.Header as Node | undefined);
  const masterFiles = (audit.MasterFiles ?? {}) as Node;

  return {
    header,
    accounts: parseAccounts(masterFiles),
    customers: parseParties(masterFiles.Customers, "CustomerID"),
    suppliers: parseParties(masterFiles.Suppliers, "SupplierID"),
    taxCodes: parseTaxCodes(masterFiles.TaxTable),
    analysisEntries: parseAnalysisTypes(masterFiles.AnalysisTypeTable),
    journals: parseJournals(audit.GeneralLedgerEntries as Node | undefined),
  };
}

function parseHeader(node: Node | undefined): SaftHeader {
  const company = asArray(node?.Company)[0];
  const selection = asArray(node?.SelectionCriteria)[0];

  return {
    auditFileVersion: str(node?.AuditFileVersion),
    companyName: str(company?.Name),
    registrationNumber: str(company?.RegistrationNumber),
    defaultCurrency: str(node?.DefaultCurrencyCode) ?? "NOK",
    periodStart: date(
      firstKey(selection, "SelectionStartDate", "PeriodStart")
    ),
    periodEnd: date(firstKey(selection, "SelectionEndDate", "PeriodEnd")),
    softwareName: str(
      firstKey(node, "SoftwareCompanyName", "ProductID", "SoftwareID")
    ),
  };
}

function parseAccounts(masterFiles: Node): SaftAccount[] {
  const container = asArray(masterFiles.GeneralLedgerAccounts)[0];
  const accounts = asArray(container?.Account);

  const result: SaftAccount[] = [];
  for (const a of accounts) {
    const accountId = str(a.AccountID);
    if (!accountId) continue;

    // Stated as separate debit and credit figures; net them so the sign
    // matches the postings, which are stored debit-positive.
    const net = (debit: unknown, credit: unknown) => {
      const d = num(debit);
      const c = num(credit);
      return d == null && c == null ? null : (d ?? 0) - (c ?? 0);
    };

    result.push({
      accountId,
      description: str(a.AccountDescription),
      standardAccountId: str(a.StandardAccountID),
      accountType: str(a.AccountType),
      openingBalance: net(a.OpeningDebitBalance, a.OpeningCreditBalance),
      closingBalance: net(a.ClosingDebitBalance, a.ClosingCreditBalance),
    });
  }
  return result;
}

function parseParties(container: unknown, idField: string): SaftParty[] {
  // <Customers><Customer>… — the inner element name is the singular form.
  const wrapper = asArray(container)[0];
  if (!wrapper) return [];
  const singular = idField.replace("ID", ""); // CustomerID -> Customer
  const entries = asArray(wrapper[singular]);

  const result: SaftParty[] = [];
  for (const p of entries) {
    const partyId = str(p[idField]);
    const name = str(p.Name);
    if (!partyId || !name) continue;

    const contact = asArray(p.Contact)[0];
    const address = asArray(p.Address)[0];

    // SAF-T states each party's balance as separate debit and credit figures.
    // Netting them gives a single signed balance; which side is "owed to us"
    // differs between customers and suppliers and is settled at import.
    const openingDebit = num(p.OpeningDebitBalance);
    const openingCredit = num(p.OpeningCreditBalance);
    const closingDebit = num(p.ClosingDebitBalance);
    const closingCredit = num(p.ClosingCreditBalance);

    const net = (debit: number | null, credit: number | null) =>
      debit == null && credit == null ? null : (debit ?? 0) - (credit ?? 0);

    result.push({
      partyId,
      name,
      registrationNumber: str(p.RegistrationNumber),
      email: str(firstKey(contact, "Email", "EmailAddress")),
      phone: str(firstKey(contact, "Telephone", "Phone", "MobilePhone")),
      address: addressLine(p.Address),
      country: str(address?.Country),
      openingBalance: net(openingDebit, openingCredit),
      closingBalance: net(closingDebit, closingCredit),
    });
  }
  return result;
}

function parseTaxCodes(container: unknown): SaftTaxCode[] {
  const wrapper = asArray(container)[0];
  if (!wrapper) return [];

  const result: SaftTaxCode[] = [];
  for (const entry of asArray(wrapper.TaxTableEntry)) {
    for (const detail of asArray(entry.TaxCodeDetails)) {
      const code = str(detail.TaxCode);
      if (!code) continue;
      result.push({
        code,
        description: str(detail.Description),
        percentage: num(detail.TaxPercentage),
        standardCode: str(detail.StandardTaxCode),
      });
    }
  }
  return result;
}

function parseAnalysisTypes(container: unknown): SaftAnalysisEntry[] {
  const wrapper = asArray(container)[0];
  if (!wrapper) return [];

  const result: SaftAnalysisEntry[] = [];
  for (const e of asArray(wrapper.AnalysisTypeTableEntry)) {
    const analysisType = str(e.AnalysisType);
    const analysisId = str(e.AnalysisID);
    if (!analysisType || !analysisId) continue;
    result.push({
      analysisType,
      analysisId,
      description: str(
        firstKey(e, "AnalysisTypeDescription", "AnalysisDescription")
      ),
    });
  }
  return result;
}

function parseJournals(node: Node | undefined): SaftJournal[] {
  if (!node) return [];

  const result: SaftJournal[] = [];
  for (const j of asArray(node.Journal)) {
    const transactions: SaftTransaction[] = [];

    for (const t of asArray(j.Transaction)) {
      const lines: SaftLine[] = [];

      for (const l of asArray(t.Line)) {
        const accountId = str(l.AccountID);
        if (!accountId) continue;

        // SAF-T splits debit and credit into separate elements; the ledger
        // stores one signed amount (debit positive, credit negative).
        const debit = amount(l.DebitAmount);
        const credit = amount(l.CreditAmount);
        if (debit == null && credit == null) continue;
        const signed = (debit ?? 0) - (credit ?? 0);

        const tax = asArray(l.TaxInformation)[0];
        const { departmentCode, projectCode } = readAnalysis(l.Analysis);

        const currencyNode = (debit != null ? l.DebitAmount : l.CreditAmount) as
          | Node
          | undefined;

        lines.push({
          recordId: str(l.RecordID),
          accountId,
          description: str(l.Description),
          amount: signed,
          currency: str(currencyNode?.CurrencyCode),
          currencyAmount: num(currencyNode?.CurrencyAmount),
          vatCode: str(tax?.TaxCode),
          vatAmount: amount(tax?.TaxAmount),
          customerId: str(l.CustomerID),
          supplierId: str(l.SupplierID),
          departmentCode,
          projectCode,
          valueDate: date(l.ValueDate),
        });
      }

      if (lines.length === 0) continue;

      transactions.push({
        transactionId: str(t.TransactionID),
        transactionDate: date(t.TransactionDate),
        description: str(t.Description),
        voucherNumber: parseVoucherNumber(t.TransactionID),
        lines,
      });
    }

    result.push({
      journalId: str(j.JournalID),
      description: str(j.Description),
      transactions,
    });
  }
  return result;
}

function readAnalysis(node: unknown): {
  departmentCode: string | null;
  projectCode: string | null;
} {
  let departmentCode: string | null = null;
  let projectCode: string | null = null;

  for (const a of asArray(node)) {
    const type = str(a.AnalysisType);
    const id = str(a.AnalysisID);
    if (!type || !id) continue;
    if (!departmentCode && isDepartmentType(type)) departmentCode = id;
    else if (!projectCode && isProjectType(type)) projectCode = id;
  }

  return { departmentCode, projectCode };
}

/**
 * Voucher numbers are numeric in our schema, but SAF-T TransactionIDs are free
 * text. Use the ID when it is purely numeric, otherwise leave it unset and let
 * the source_id carry the original value.
 */
function parseVoucherNumber(transactionId: unknown): number | null {
  const s = str(transactionId);
  if (!s) return null;
  const digits = s.match(/\d+/g);
  if (!digits) return null;
  const candidate = Number(digits[digits.length - 1]);
  return Number.isSafeInteger(candidate) ? candidate : null;
}
