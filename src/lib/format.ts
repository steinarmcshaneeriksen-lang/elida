/**
 * Norwegian number, currency, and date formatting utilities.
 */

const nbFormatter = new Intl.NumberFormat("nb-NO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const nbDecimalFormatter = (decimals: number) =>
  new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

/**
 * Format a number as Norwegian currency: "1 234 567 kr"
 */
export function formatCurrency(amount: number, currency: string = "kr"): string {
  const formatted = nbFormatter.format(Math.round(amount));
  return `${formatted} ${currency}`;
}

/**
 * Format a number with Norwegian formatting (spaces as thousand separator, comma for decimals).
 */
export function formatNumber(n: number, decimals: number = 0): string {
  return nbDecimalFormatter(decimals).format(n);
}

/**
 * Format a percentage: "14,2 %"
 */
export function formatPercent(n: number): string {
  const formatted = nbDecimalFormatter(1).format(n);
  return `${formatted} %`;
}

/**
 * Format a date in Norwegian long format: "12. august 2026"
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Format a date in short Norwegian format: "12. aug. 2026"
 */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format relative time: "for 8 minutter siden"
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "akkurat nå";
  if (diffMinutes === 1) return "for 1 minutt siden";
  if (diffMinutes < 60) return `for ${diffMinutes} minutter siden`;
  if (diffHours === 1) return "for 1 time siden";
  if (diffHours < 24) return `for ${diffHours} timer siden`;
  if (diffDays === 1) return "i går";
  if (diffDays < 7) return `for ${diffDays} dager siden`;
  return formatDateShort(d);
}

/**
 * Format compact currency: "4,8 mill." or "820 000 kr"
 */
export function formatCompactCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";

  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000;
    const formatted = nbDecimalFormatter(1).format(millions);
    return `${sign}${formatted} mill.`;
  }

  if (abs >= 10_000) {
    return `${sign}${nbFormatter.format(Math.round(abs))} kr`;
  }

  return `${sign}${nbFormatter.format(Math.round(abs))} kr`;
}

/**
 * Format a number as a signed change string: "+14,2 %" or "-3,1 %"
 */
export function formatChange(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${nbDecimalFormatter(1).format(n)} %`;
}

/**
 * Format a date as "dd.MM.yyyy"
 */
export function formatDateNumeric(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}
