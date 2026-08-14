import { jost } from "@/lib/fonts";

/**
 * The Elida wordmark: lowercase, light-weight geometric sans in the brand ink.
 *
 * Set as live text rather than an image so it stays sharp at any size and needs
 * no asset request before the shell can paint.
 *
 * The ink is the wordmark's navy on paper — in the app, which is dark, that
 * navy would disappear into the ground, so the mark is drawn in the page's
 * brightest ink instead. Same letterforms, legible where they actually sit.
 */
export function Logo({
  className = "",
  size = 26,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={`${jost.className} select-none leading-none ${className}`}
      style={{
        fontSize: size,
        fontWeight: 300,
        letterSpacing: "0.01em",
        color: "var(--foreground)",
      }}
    >
      elida
    </span>
  );
}

/**
 * The mark on its own, for the collapsed sidebar and the browser-sized places
 * the full wordmark will not fit.
 */
export function LogoMark({
  className = "",
  size = 26,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={`${jost.className} select-none leading-none ${className}`}
      style={{
        fontSize: size,
        fontWeight: 300,
        color: "var(--foreground)",
      }}
    >
      e
    </span>
  );
}
