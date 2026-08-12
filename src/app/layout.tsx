import type { Metadata } from "next";
import { inter, jost } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Elida — Din økonomiassistent",
  description:
    "Elida er en AI-drevet økonomiassistent som gir norske bedrifter klare svar på de viktigste økonomiske spørsmålene, basert på data fra regnskapet.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="nb"
      className={`${inter.variable} ${jost.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
