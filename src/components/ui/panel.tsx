"use client";

import type { LucideIcon } from "lucide-react";
import type { Tone } from "@/components/dashboard/metric-card";

/*
 * The order hues are handed out to a list of series. Validated as a set:
 * adjacent pairs keep enough separation for deuteranopia and tritanopia,
 * which is why copper sits between ocean and teal rather than next to rose.
 */
export const SERIES_TONES: Tone[] = [
  "ocean",
  "copper",
  "teal",
  "violet",
  "rose",
  "slate",
];

/**
 * A titled block of content.
 *
 * The pages were stacks of white rectangles with identical hairline borders;
 * a panel carries its section's hue in the heading strip and the icon, so the
 * eye can tell one block from the next while scrolling. Shared between pages
 * so every section heading in the product is the same object.
 */
export function Panel({
  tone,
  icon: Icon,
  title,
  description,
  children,
}: {
  tone: Tone;
  icon: LucideIcon;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-tone={tone}
      className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]"
    >
      <div className="flex items-start gap-3 border-b border-border px-6 py-4">
        <span className="tone-badge shrink-0">
          <Icon size={16} strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs text-foreground-secondary">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}
