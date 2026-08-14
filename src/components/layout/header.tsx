"use client";

interface HeaderProps {
  title: string;
  /** The overview leads with a greeting, so it carries no separate title. */
  showTitle?: boolean;
}

/**
 * What you are looking at, and nothing else.
 *
 * This was a sticky bar with its own background and a rule beneath it,
 * carrying the page title, the age of the data, a refresh button and the
 * account menu. Only one of those was worth the top of every screen. The
 * import time is a statement about the data, not a task to do before reading
 * the figures, and the account is context the sidebar foot already had room
 * for — both moved there, beside the company they belong with.
 *
 * A page that leads with its own heading renders nothing here at all rather
 * than an empty bar holding the space.
 */
export function Header({ title, showTitle = true }: HeaderProps) {
  if (!showTitle) return null;

  return (
    <header className="mx-auto w-full max-w-7xl px-6 pt-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        {title}
      </h1>
    </header>
  );
}
