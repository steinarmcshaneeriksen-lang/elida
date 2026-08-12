"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { UserPlus, Eye, EyeOff, Loader2 } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Passordet må være minst 8 tegn.");
      return;
    }

    setIsLoading(true);

    const supabase = createClient();

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) {
        if (authError.message.includes("already registered")) {
          setError("Denne e-postadressen er allerede registrert. Prøv å logge inn.");
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

      router.push("/onboarding");
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
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
               style={{ background: "var(--primary)", color: "#fff" }}>
            <span className="text-2xl font-bold tracking-tight">E</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--foreground)" }}>
            Opprett konto
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--foreground-secondary)" }}>
            Kom i gang med Elida på noen få minutter
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
                   border: "1px solid rgba(220, 38, 38, 0.2)",
                 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Full name */}
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium mb-1.5"
                     style={{ color: "var(--foreground)" }}>
                Fullt navn
              </label>
              <input
                id="fullName"
                type="text"
                required
                autoComplete="name"
                autoFocus
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ola Nordmann"
                className="w-full rounded-lg px-4 py-2.5 text-sm placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2"
                style={{
                  background: "var(--background)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                  "--tw-ring-color": "var(--accent)",
                } as React.CSSProperties}
              />
            </div>

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
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minst 8 tegn"
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
              <p className="mt-1.5 text-xs" style={{ color: "var(--foreground-muted)" }}>
                Minst 8 tegn
              </p>
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
                <UserPlus size={18} />
              )}
              {isLoading ? "Oppretter konto..." : "Opprett konto"}
            </button>
          </form>
        </div>

        {/* Login link */}
        <p className="mt-6 text-center text-sm" style={{ color: "var(--foreground-secondary)" }}>
          Har du allerede konto?{" "}
          <Link href="/login" className="font-semibold hover:underline"
                style={{ color: "var(--accent)" }}>
            Logg inn
          </Link>
        </p>
      </div>
    </div>
  );
}
