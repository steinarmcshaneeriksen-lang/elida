/**
 * Contrast, measured rather than judged.
 *
 * The muted text token shipped at #94a3b8 — 2.6:1 on white, 2.3:1 on the grey
 * surfaces it kept landing on. It carried nearly every detail line, table
 * heading, unit and hint in the product, so most of the small text was grey on
 * grey, well under the 4.5:1 minimum. Nobody noticed because nobody measured;
 * a colour can look fine to the person choosing it and be unreadable to the
 * person using it.
 *
 * So the palette is checked, not reviewed. `scripts/verify.ts` reads the real
 * tokens out of globals.css and asserts every pairing through these functions,
 * which means a token cannot be darkened or lightened past the threshold
 * without a check going red.
 */

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const h = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    throw new Error(`Ikke en 6-sifret hex-farge: ${hex}`);
  }

  const channels = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG contrast ratio, 1:1 to 21:1. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Thresholds.
 *
 * GRAPHIC is the AA minimum for a meaningful non-text mark — an icon on its
 * badge, a bar against its track — which is where several of the hues sit:
 * teal is legible as a bar at 3.3:1 and would not be legible as a number,
 * which is why fills and inks are separate tokens.
 */
export const CONTRAST = {
  /**
   * Every ink the product draws text with. AAA rather than the AA floor,
   * because the three inks deliberately sit close together — hierarchy comes
   * from size and weight — and because the smallest text in the product is
   * 11px, where the AA minimum is not enough.
   */
  TEXT: 7,
  /** A hue carrying a figure or a label. AA for text. */
  TONE_TEXT: 4.5,
  /** A meaningful non-text mark: an icon on its badge, a bar on its track. */
  GRAPHIC: 3,
} as const;

/** Rounded to two decimals, so a check failure prints the number it saw. */
export function ratio(a: string, b: string): number {
  return Math.round(contrastRatio(a, b) * 100) / 100;
}

/**
 * The custom properties declared on `:root`.
 *
 * Parsed from the stylesheet itself rather than duplicated in the test, so the
 * checks cannot pass against a stale copy of the palette.
 */
export function parseRootTokens(css: string): Map<string, string> {
  const root = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  if (!root) throw new Error("Fant ingen :root-blokk i stilarket");

  const tokens = new Map<string, string>();
  const declaration = /--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g;

  let match: RegExpExecArray | null;
  while ((match = declaration.exec(root[1])) !== null) {
    tokens.set(match[1], match[2]);
  }

  return tokens;
}
