/**
 * The profit-and-loss categories reports and budgets are both built on.
 *
 * An owner budgets in these terms — salary, premises, software — not account by
 * account, and a report reads the same way. One list keeps the two consistent:
 * a budget line for "Lønn" and the actual figure it is compared against cover
 * exactly the same accounts.
 *
 * The ranges follow NS 4102.
 */

export interface Category {
  key: string;
  label: string;
  /** Inclusive account ranges belonging to this category. */
  ranges: Array<[number, number]>;
  kind: "revenue" | "cost";
  /** Shown in the simple budget grid; the rest sit behind "Vis alle". */
  isPrimary: boolean;
  /**
   * Categories that belong to the same subtotal. "payroll" gathers everything
   * an employee costs, including the refunds that reduce it — a report that
   * quotes personnel cost has to net those off or it overstates the figure.
   */
  group?: "payroll";
}

export const CATEGORIES: Category[] = [
  {
    key: "revenue",
    label: "Salgsinntekt",
    ranges: [[3000, 3899]],
    kind: "revenue",
    isPrimary: true,
  },
  {
    key: "other_revenue",
    label: "Annen driftsinntekt",
    ranges: [[3900, 3999]],
    kind: "revenue",
    isPrimary: false,
  },
  {
    key: "cogs",
    label: "Varekostnad",
    ranges: [[4000, 4999]],
    kind: "cost",
    isPrimary: true,
  },
  // The 5000-series split follows NS 4102: pay in 50–53, employer's
  // contribution and pension in 54, public refunds in 58 (which are negative
  // and reduce the cost), other personnel cost in 55–57 and 59. Lumping 53–59
  // together made the refunds cancel out the employer's contribution, so
  // "Arbeidsgiverkostnader" read as 47 000 against 1,4 million in pay.
  {
    key: "payroll",
    label: "Lønn og feriepenger",
    ranges: [[5000, 5399]],
    kind: "cost",
    isPrimary: true,
    group: "payroll",
  },
  {
    key: "employer_costs",
    label: "Arbeidsgiveravgift og pensjon",
    ranges: [[5400, 5499]],
    kind: "cost",
    isPrimary: true,
    group: "payroll",
  },
  {
    key: "payroll_refunds",
    label: "Refusjoner og tilskudd",
    ranges: [[5800, 5899]],
    kind: "cost",
    isPrimary: false,
    group: "payroll",
  },
  {
    key: "other_personnel",
    label: "Andre personalkostnader",
    ranges: [
      [5500, 5799],
      [5900, 5999],
    ],
    kind: "cost",
    isPrimary: false,
    group: "payroll",
  },
  {
    key: "depreciation",
    label: "Avskrivninger",
    ranges: [[6000, 6099]],
    kind: "cost",
    isPrimary: false,
  },
  {
    key: "premises",
    label: "Lokaler",
    ranges: [[6100, 6299]],
    kind: "cost",
    isPrimary: true,
  },
  {
    key: "equipment",
    label: "Utstyr og inventar",
    ranges: [
      [6300, 6399],
      [6500, 6599],
    ],
    kind: "cost",
    isPrimary: false,
  },
  {
    key: "it_software",
    label: "IT og programvare",
    ranges: [[6400, 6499]],
    kind: "cost",
    isPrimary: true,
  },
  {
    key: "consultants",
    label: "Konsulenter og eksterne tjenester",
    ranges: [[6700, 6799]],
    kind: "cost",
    isPrimary: true,
  },
  {
    key: "office",
    label: "Kontor, telefon og porto",
    ranges: [
      [6600, 6699],
      [6800, 6999],
    ],
    kind: "cost",
    isPrimary: false,
  },
  {
    key: "vehicles",
    label: "Kjøretøy og transport",
    ranges: [[7000, 7099]],
    kind: "cost",
    isPrimary: false,
  },
  {
    key: "travel",
    label: "Reise og representasjon",
    ranges: [[7100, 7299]],
    kind: "cost",
    isPrimary: false,
  },
  {
    key: "sales_marketing",
    label: "Salg og markedsføring",
    ranges: [[7300, 7399]],
    kind: "cost",
    isPrimary: true,
  },
  {
    key: "other_costs",
    label: "Andre driftskostnader",
    ranges: [[7400, 7999]],
    kind: "cost",
    isPrimary: false,
  },
];

const BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

export function categoryByKey(key: string): Category | undefined {
  return BY_KEY.get(key);
}

/** Which category an account number falls into, or null for balance accounts. */
export function categoryForAccount(accountNumber: string): Category | null {
  const account = parseInt(accountNumber, 10);
  if (!Number.isFinite(account)) return null;

  for (const category of CATEGORIES) {
    for (const [from, to] of category.ranges) {
      if (account >= from && account <= to) return category;
    }
  }

  return null;
}

/**
 * Revenue is credit-normal and so is stored negative; costs are debit-normal.
 * Both are returned as the positive figures a reader expects, which means a
 * category total can be added up without minding its sign.
 */
export function signedAmount(category: Category, amount: number): number {
  return category.kind === "revenue" ? -amount : amount;
}

export const PRIMARY_CATEGORIES = CATEGORIES.filter((c) => c.isPrimary);

/** Every category making up total personnel cost, refunds included. */
export const PAYROLL_CATEGORY_KEYS = CATEGORIES.filter(
  (c) => c.group === "payroll"
).map((c) => c.key);
