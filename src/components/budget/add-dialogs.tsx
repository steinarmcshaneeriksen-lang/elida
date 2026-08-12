"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { MONTH_LONG, type BudgetCategory } from "./types";
import { EMPLOYER_TAX_RATES } from "@/lib/constants";

const nokFormat = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });

function Shell({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-foreground-muted hover:bg-surface-hover hover:text-foreground"
            aria-label="Lukk"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 space-y-4">{children}</div>
        <div className="mt-6 flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-foreground-secondary">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground";

export function AddCostDialog({
  categories,
  onClose,
  onSubmit,
}: {
  categories: BudgetCategory[];
  onClose: () => void;
  onSubmit: (input: {
    category_key: string;
    monthly_amount: number;
    from_month: number;
    name: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [categoryKey, setCategoryKey] = useState(
    categories.find((c) => c.key === "it_software")?.key ?? categories[0]?.key ?? ""
  );
  const [amount, setAmount] = useState("8000");
  const [fromMonth, setFromMonth] = useState(1);

  const monthly = Number(amount.replace(/\s/g, "").replace(",", ".")) || 0;
  const yearEffect = monthly * (12 - fromMonth + 1);

  return (
    <Shell
      title="Legg til kostnad"
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground-secondary hover:bg-surface-hover"
          >
            Avbryt
          </button>
          <button
            onClick={() =>
              onSubmit({
                category_key: categoryKey,
                monthly_amount: monthly,
                from_month: fromMonth,
                name: name.trim() || "Ny kostnad",
              })
            }
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light"
          >
            Legg til
          </button>
        </>
      }
    >
      <Field label="Hva gjelder det">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="F.eks. nytt CRM-system"
          className={inputClass}
        />
      </Field>

      <Field label="Kategori">
        <select
          value={categoryKey}
          onChange={(e) => setCategoryKey(e.target.value)}
          className={inputClass}
        >
          {categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Beløp per måned">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
        </Field>

        <Field label="Fra og med">
          <select
            value={fromMonth}
            onChange={(e) => setFromMonth(Number(e.target.value))}
            className={inputClass}
          >
            {MONTH_LONG.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <p className="text-xs text-foreground-muted">
        Legger {nokFormat.format(monthly)} kr i måneden fra {MONTH_LONG[fromMonth - 1]},
        totalt {nokFormat.format(yearEffect)} kr i budsjettåret.
      </p>
    </Shell>
  );
}

/**
 * A hire costs considerably more than the salary. The figure shown here is
 * computed by the same engine that writes it into the budget, broken down so
 * the number is checkable rather than merely asserted.
 */
export function AddEmployeeDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: {
    annual_salary: number;
    start_month: number;
    employer_tax_zone: string;
    holiday_pay_rate: number;
    pension_rate: number;
    other_monthly_cost: number;
    name: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [salary, setSalary] = useState("700000");
  const [startMonth, setStartMonth] = useState(1);
  const [zone, setZone] = useState("1");
  const [holidayRate, setHolidayRate] = useState("12");
  const [pensionRate, setPensionRate] = useState("2");
  const [other, setOther] = useState("0");

  const preview = useMemo(() => {
    const annual = Number(salary.replace(/\s/g, "").replace(",", ".")) || 0;
    const holiday = annual * ((Number(holidayRate) || 0) / 100);
    const pension = annual * ((Number(pensionRate) || 0) / 100);
    const rate = EMPLOYER_TAX_RATES[zone]?.rate ?? EMPLOYER_TAX_RATES["1"].rate;
    const employerTax = (annual + holiday + pension) * rate;
    const otherAnnual = (Number(other) || 0) * 12;
    const total = annual + holiday + pension + employerTax + otherAnnual;

    return {
      annual,
      holiday,
      pension,
      employerTax,
      otherAnnual,
      total,
      thisYear: (total / 12) * (12 - startMonth + 1),
      rate,
    };
  }, [salary, holidayRate, pensionRate, zone, other, startMonth]);

  return (
    <Shell
      title="Legg til ansatt"
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground-secondary hover:bg-surface-hover"
          >
            Avbryt
          </button>
          <button
            onClick={() =>
              onSubmit({
                annual_salary: preview.annual,
                start_month: startMonth,
                employer_tax_zone: zone,
                holiday_pay_rate: (Number(holidayRate) || 0) / 100,
                pension_rate: (Number(pensionRate) || 0) / 100,
                other_monthly_cost: Number(other) || 0,
                name: name.trim() || "Ny ansatt",
              })
            }
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light"
          >
            Legg til
          </button>
        </>
      }
    >
      <Field label="Stilling eller navn">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="F.eks. selger"
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Årslønn">
          <input value={salary} onChange={(e) => setSalary(e.target.value)} className={inputClass} />
        </Field>

        <Field label="Startmåned">
          <select
            value={startMonth}
            onChange={(e) => setStartMonth(Number(e.target.value))}
            className={inputClass}
          >
            {MONTH_LONG.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Feriepenger %">
          <input
            value={holidayRate}
            onChange={(e) => setHolidayRate(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Pensjon %">
          <input
            value={pensionRate}
            onChange={(e) => setPensionRate(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Annet /mnd">
          <input value={other} onChange={(e) => setOther(e.target.value)} className={inputClass} />
        </Field>
      </div>

      <Field label="Sone for arbeidsgiveravgift">
        <select value={zone} onChange={(e) => setZone(e.target.value)} className={inputClass}>
          {Object.entries(EMPLOYER_TAX_RATES).map(([key, v]) => (
            <option key={key} value={key}>
              {v.description} — {(v.rate * 100).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %
            </option>
          ))}
        </select>
      </Field>

      <div className="rounded-lg border border-border bg-surface-hover/50 p-3 text-sm">
        <div className="flex justify-between text-foreground-secondary">
          <span>Årslønn</span>
          <span className="tabular-nums">{nokFormat.format(preview.annual)}</span>
        </div>
        <div className="flex justify-between text-foreground-secondary">
          <span>Feriepenger</span>
          <span className="tabular-nums">{nokFormat.format(preview.holiday)}</span>
        </div>
        <div className="flex justify-between text-foreground-secondary">
          <span>Pensjon</span>
          <span className="tabular-nums">{nokFormat.format(preview.pension)}</span>
        </div>
        <div className="flex justify-between text-foreground-secondary">
          <span>Arbeidsgiveravgift</span>
          <span className="tabular-nums">{nokFormat.format(preview.employerTax)}</span>
        </div>
        {preview.otherAnnual > 0 && (
          <div className="flex justify-between text-foreground-secondary">
            <span>Annet</span>
            <span className="tabular-nums">{nokFormat.format(preview.otherAnnual)}</span>
          </div>
        )}
        <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold text-foreground">
          <span>Full årskostnad</span>
          <span className="tabular-nums">{nokFormat.format(preview.total)} kr</span>
        </div>
        <p className="mt-2 text-xs text-foreground-muted">
          I budsjettåret fra {MONTH_LONG[startMonth - 1]}:{" "}
          {nokFormat.format(preview.thisYear)} kr. Arbeidsgiveravgift beregnes av
          lønn, feriepenger og pensjon.
        </p>
      </div>
    </Shell>
  );
}
