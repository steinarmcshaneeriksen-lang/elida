import { Inter, Jost } from "next/font/google";

/** Interface type — neutral, dense, good at figures. */
export const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/**
 * The wordmark type. Geometric, single-storey `a`, round dot on the `i` —
 * the shapes of the Elida logo.
 */
export const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: ["300", "400"],
  display: "swap",
});
