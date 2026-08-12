"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { createClient } from "@/lib/supabase/client";
import { LogIn, Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const supabase = createClient();

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        if (authError.message === "Invalid login credentials") {
          setError("Feil e-post eller passord. Prøv igjen.");
        } else if (authError.message === "Email not confirmed") {
          setError("E-posten din er ikke bekreftet ennå. Sjekk innboksen din.");
        } else {
          setError(authError.message);
        }
        setIsLoading(false);
        return;
      }

      if (!data.user) {
        setError("Noe gikk galt. Prøv igjen.");
        setIsLoading(false);
        return;
      }

      // Check if user has completed onboarding by looking for a company
      const { data: access } = await supabase
        .from("user_company_access")
        .select("company_id")
        .eq("user_id", data.user.id)
        .limit(1)
        .maybeSingle();

      if (access?.company_id) {
        router.push("/");
      } else {
        router.push("/onboarding");
      }
    } catch {
      setError("En uventet feil oppstod. Prøv igjen.");
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12"
         style={{ background: "var(--background)" }}>
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <Logo size={40} className="mb-5 inline-block" />
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--foreground)" }}>
            Logg inn på Elida
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--foreground-secondary)" }}>
            Din regnskapsassistent for norske bedrifter
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl p-8"
             style={{
               background: "var(--surface)",
               border: "1px solid var(--border)",
               boxShadow: "var(--shadow-lg)",
             }}>

          {/* Error */}
          {error && (
            <div className="mb-6 rounded-lg px-4 py-3 text-sm"
                 style={{
                   background: "var(--danger-light)",
                   color: "var(--danger)",
                   border: "1px solid var(--danger)",
                   borderColor: "rgba(220, 38, 38, 0.2)",
                 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1.5"
                     style={{ color: "var(--foreground)" }}>
                E-post
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="deg@bedrift.no"
                className="w-full rounded-lg px-4 py-2.5 text-sm placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2"
                style={{
                  background: "var(--background)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                  "--tw-ring-color": "var(--accent)",
                } as React.CSSProperties}
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1.5"
                     style={{ color: "var(--foreground)" }}>
                Passord
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Skriv inn passordet ditt"
                  className="w-full rounded-lg px-4 py-2.5 pr-11 text-sm placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2"
                  style={{
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                    "--tw-ring-color": "var(--accent)",
                  } as React.CSSProperties}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5"
                  style={{ color: "var(--foreground-muted)" }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 hover:opacity-90"
              style={{ background: "var(--primary)" }}
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <LogIn size={18} />
              )}
              {isLoading ? "Logger inn..." : "Logg inn"}
            </button>
          </form>
        </div>

        {/* Sign up link */}
        <p className="mt-6 text-center text-sm" style={{ color: "var(--foreground-secondary)" }}>
          Har du ikke konto?{" "}
          <Link href="/signup" className="font-semibold hover:underline"
                style={{ color: "var(--accent)" }}>
            Opprett konto
          </Link>
        </p>
      </div>
    </div>
  );
}
