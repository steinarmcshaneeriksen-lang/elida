"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Lightbulb,
  BarChart3,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Link as LinkIcon,
  Sparkles,
  Building2,
  ChevronDown,
} from "lucide-react";
import type { AccountingKnowledgeLevel } from "@/lib/types/database";

// ─── Constants ──────────────────────────────────────────────────────────────

const TOTAL_STEPS = 7;

const INDUSTRIES = [
  "Bygg og anlegg",
  "Butikk og detaljhandel",
  "Eiendom og utleie",
  "Helse og omsorg",
  "IT og teknologi",
  "Konsulentvirksomhet",
  "Kultur og underholdning",
  "Mat og servering",
  "Produksjon og industri",
  "Reiseliv og turisme",
  "Transport og logistikk",
  "Utdanning og opplaering",
  "Annet",
];

const EMPLOYER_TAX_ZONES = [
  { value: "sone_1", label: "Sone I", rate: "14,1 %" },
  { value: "sone_2", label: "Sone II", rate: "10,6 %" },
  { value: "sone_3", label: "Sone III", rate: "6,4 %" },
  { value: "sone_4", label: "Sone IV", rate: "5,1 %" },
  { value: "sone_4a", label: "Sone IVa", rate: "7,9 %" },
  { value: "sone_5", label: "Sone V", rate: "0 %" },
];

const SYNC_STEPS = [
  { key: "chart", label: "Henter kontoplan" },
  { key: "accounting", label: "Henter regnskap" },
  { key: "invoices", label: "Henter fakturaer" },
  { key: "customers", label: "Analyserer kunder" },
  { key: "suppliers", label: "Analyserer leverandorer" },
  { key: "history", label: "Bygger okonomisk historikk" },
];

const KNOWLEDGE_LEVELS: {
  value: AccountingKnowledgeLevel;
  title: string;
  description: string;
  detail: string;
  icon: typeof Lightbulb;
}[] = [
  {
    value: "beginner",
    title: "Jeg vil bare forsta hvordan bedriften gar",
    description: "Nybegynner",
    detail:
      "Jeg har liten eller ingen regnskapskunnskap. Forklar okonomien min med vanlig sprak.",
    icon: Lightbulb,
  },
  {
    value: "intermediate",
    title: "Jeg kjenner de viktigste begrepene",
    description: "Middels",
    detail:
      "Jeg forstar resultat, balanse, MVA og likviditet, men onsker hjelp med analyse.",
    icon: BarChart3,
  },
  {
    value: "advanced",
    title: "Vis meg detaljene",
    description: "Avansert",
    detail:
      "Jeg er komfortabel med resultat, balanse, hovedbok, kontoplan og nokkeltall.",
    icon: FileSpreadsheet,
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  function getSupabase() {
    if (!supabaseRef.current) {
      supabaseRef.current = createClient();
    }
    return supabaseRef.current;
  }

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [isAnimating, setIsAnimating] = useState(false);

  // Step 2 — Knowledge level
  const [knowledgeLevel, setKnowledgeLevel] =
    useState<AccountingKnowledgeLevel | null>(null);

  // Step 3 — Company
  const [companyName, setCompanyName] = useState("");
  const [orgNumber, setOrgNumber] = useState("");
  const [industry, setIndustry] = useState("");

  // Step 4 — PowerOffice
  const [clientKey, setClientKey] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "connecting" | "connected" | "error"
  >("idle");
  const [skippedConnection, setSkippedConnection] = useState(false);

  // Step 5 — Sync progress
  const [syncProgress, setSyncProgress] = useState(0);

  // Step 6 — Preferences
  const [payrollDate, setPayrollDate] = useState("25");
  const [taxZone, setTaxZone] = useState("sone_1");
  const [liquidityBuffer, setLiquidityBuffer] = useState("100000");

  // General
  const [userId, setUserId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load auth user on mount
  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await getSupabase().auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    }
    loadUser();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Step transition helper
  const goToStep = useCallback(
    (nextStep: number) => {
      if (isAnimating) return;
      setDirection(nextStep > step ? "forward" : "back");
      setIsAnimating(true);
      setTimeout(() => {
        setStep(nextStep);
        setIsAnimating(false);
      }, 200);
    },
    [step, isAnimating]
  );

  // ─── Step handlers ──────────────────────────────────────────────────────

  async function handleCompanyCreate() {
    if (!userId || !companyName.trim()) return;

    setIsSaving(true);
    try {
      // Create company
      const { data: newCompany, error: companyError } = await getSupabase()
        .from("companies")
        .insert({
          name: companyName.trim(),
          org_number: orgNumber.trim() || null,
          industry: industry || null,
        })
        .select()
        .single();

      if (companyError) {
        console.error("Error creating company:", companyError);
        setIsSaving(false);
        return;
      }

      setCompanyId(newCompany.id);

      // Create user_company_access
      await getSupabase().from("user_company_access").insert({
        user_id: userId,
        company_id: newCompany.id,
        role: "owner",
        accounting_knowledge_level: knowledgeLevel ?? "beginner",
      });

      goToStep(4);
    } catch (err) {
      console.error("Error in company creation:", err);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConnect() {
    if (!clientKey.trim() || !companyId) return;

    setConnectionStatus("connecting");

    try {
      // Create integration record
      const { data: integration, error: intError } = await getSupabase()
        .from("integrations")
        .insert({
          company_id: companyId,
          provider: "poweroffice" as const,
          is_active: true,
          settings: {},
        })
        .select()
        .single();

      if (intError) {
        setConnectionStatus("error");
        return;
      }

      // Store credential
      await getSupabase().from("integration_credentials").insert({
        integration_id: integration.id,
        encrypted_client_key: clientKey.trim(),
      });

      // Simulate connection test delay
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setConnectionStatus("connected");

      // Move to sync step after brief pause
      setTimeout(() => goToStep(5), 800);
    } catch {
      setConnectionStatus("error");
    }
  }

  function handleSkipConnection() {
    setSkippedConnection(true);
    goToStep(5);
  }

  // Simulate sync progress
  useEffect(() => {
    if (step !== 5) return;

    let progress = 0;
    const interval = setInterval(() => {
      progress += 1;
      setSyncProgress(progress);

      if (progress >= SYNC_STEPS.length) {
        clearInterval(interval);
        setTimeout(() => goToStep(6), 600);
      }
    }, 900);

    return () => clearInterval(interval);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePreferencesSave() {
    if (!companyId) return;

    setIsSaving(true);
    try {
      // Update company with preferences
      await getSupabase()
        .from("companies")
        .update({
          normal_payroll_date: parseInt(payrollDate, 10),
          employer_tax_zone: taxZone,
          min_liquidity_buffer: parseInt(liquidityBuffer, 10) || 100000,
        })
        .eq("id", companyId);

      goToStep(7);
    } catch (err) {
      console.error("Error saving preferences:", err);
    } finally {
      setIsSaving(false);
    }
  }

  function handleFinish() {
    router.push("/");
  }

  // ─── Render helpers ───────────────────────────────────────────────────

  const canProceed = (): boolean => {
    switch (step) {
      case 1:
        return true;
      case 2:
        return knowledgeLevel !== null;
      case 3:
        return companyName.trim().length > 0;
      case 4:
        return connectionStatus === "connected" || skippedConnection;
      case 5:
        return syncProgress >= SYNC_STEPS.length;
      case 6:
        return true;
      case 7:
        return true;
      default:
        return false;
    }
  };

  // ─── Step content ─────────────────────────────────────────────────────

  function renderStep() {
    switch (step) {
      // ── Step 1: Welcome ─────────────────────────────────
      case 1:
        return (
          <div className="text-center max-w-lg mx-auto">
            <div
              className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6"
              style={{ background: "var(--accent-50)" }}
            >
              <Sparkles size={36} style={{ color: "var(--accent)" }} />
            </div>

            <h2
              className="text-2xl font-bold mb-3"
              style={{ color: "var(--foreground)" }}
            >
              Forsta bedriften din
            </h2>

            <p
              className="text-base leading-relaxed mb-6"
              style={{ color: "var(--foreground-secondary)" }}
            >
              Elida er din AI-drevne regnskapsassistent. Vi hjelper deg a forsta
              okonomien i bedriften din, med tydelige forklaringer og
              handlingsrettede innsikter.
            </p>

            <div
              className="rounded-xl p-5 text-sm leading-relaxed text-left"
              style={{
                background: "var(--primary-50)",
                border: "1px solid var(--primary-100)",
                color: "var(--primary-700)",
              }}
            >
              Elida leser okonomidataene dine for a analysere bedriften. Vi
              bokforer eller endrer ingenting.
            </div>

            <button
              onClick={() => goToStep(2)}
              className="mt-8 inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
              style={{ background: "var(--primary)" }}
            >
              Kom i gang
              <ArrowRight size={18} />
            </button>
          </div>
        );

      // ── Step 2: Knowledge level ─────────────────────────
      case 2:
        return (
          <div className="max-w-xl mx-auto">
            <h2
              className="text-2xl font-bold mb-2 text-center"
              style={{ color: "var(--foreground)" }}
            >
              Hvor godt kjenner du bedriftsregnskap?
            </h2>
            <p
              className="text-sm mb-8 text-center"
              style={{ color: "var(--foreground-secondary)" }}
            >
              Dette hjelper oss a tilpasse sprak og detaljer til deg.
            </p>

            <div className="space-y-3">
              {KNOWLEDGE_LEVELS.map((level) => {
                const isSelected = knowledgeLevel === level.value;
                const Icon = level.icon;
                return (
                  <button
                    key={level.value}
                    onClick={() => setKnowledgeLevel(level.value)}
                    className="w-full text-left rounded-xl p-5 flex items-start gap-4"
                    style={{
                      background: isSelected
                        ? "var(--accent-50)"
                        : "var(--surface)",
                      border: isSelected
                        ? "2px solid var(--accent)"
                        : "1px solid var(--border)",
                      boxShadow: isSelected ? "var(--shadow-md)" : "var(--shadow-sm)",
                    }}
                  >
                    <div
                      className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center mt-0.5"
                      style={{
                        background: isSelected
                          ? "var(--accent)"
                          : "var(--surface-hover)",
                        color: isSelected ? "#fff" : "var(--foreground-secondary)",
                      }}
                    >
                      <Icon size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-semibold text-sm"
                          style={{ color: "var(--foreground)" }}
                        >
                          {level.title}
                        </span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            background: isSelected
                              ? "var(--accent-100)"
                              : "var(--surface-hover)",
                            color: isSelected
                              ? "var(--accent-dark)"
                              : "var(--foreground-muted)",
                          }}
                        >
                          {level.description}
                        </span>
                      </div>
                      <p
                        className="mt-1.5 text-sm leading-relaxed"
                        style={{ color: "var(--foreground-secondary)" }}
                      >
                        {level.detail}
                      </p>
                    </div>
                    {isSelected && (
                      <div
                        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-1"
                        style={{ background: "var(--accent)", color: "#fff" }}
                      >
                        <Check size={14} strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );

      // ── Step 3: Company ─────────────────────────────────
      case 3:
        return (
          <div className="max-w-md mx-auto">
            <div className="text-center mb-8">
              <div
                className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
                style={{ background: "var(--primary-50)" }}
              >
                <Building2
                  size={28}
                  style={{ color: "var(--primary)" }}
                />
              </div>
              <h2
                className="text-2xl font-bold mb-2"
                style={{ color: "var(--foreground)" }}
              >
                Om bedriften din
              </h2>
              <p
                className="text-sm"
                style={{ color: "var(--foreground-secondary)" }}
              >
                Fortell oss litt om bedriften slik at vi kan tilpasse analysen.
              </p>
            </div>

            <div className="space-y-5">
              {/* Company name */}
              <div>
                <label
                  htmlFor="companyName"
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "var(--foreground)" }}
                >
                  Bedriftsnavn <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  id="companyName"
                  type="text"
                  required
                  autoFocus
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="F.eks. Nordvik Konsult AS"
                  className="w-full rounded-lg px-4 py-2.5 text-sm placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2"
                  style={{
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                    "--tw-ring-color": "var(--accent)",
                  } as React.CSSProperties}
                />
              </div>

              {/* Org number */}
              <div>
                <label
                  htmlFor="orgNumber"
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "var(--foreground)" }}
                >
                  Organisasjonsnummer{" "}
                  <span
                    className="font-normal"
                    style={{ color: "var(--foreground-muted)" }}
                  >
                    (valgfritt)
                  </span>
                </label>
                <input
                  id="orgNumber"
                  type="text"
                  value={orgNumber}
                  onChange={(e) => setOrgNumber(e.target.value)}
                  placeholder="123 456 789"
                  maxLength={11}
                  className="w-full rounded-lg px-4 py-2.5 text-sm placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2"
                  style={{
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                    "--tw-ring-color": "var(--accent)",
                  } as React.CSSProperties}
                />
              </div>

              {/* Industry */}
              <div>
                <label
                  htmlFor="industry"
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "var(--foreground)" }}
                >
                  Bransje
                </label>
                <div className="relative">
                  <select
                    id="industry"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full rounded-lg px-4 py-2.5 text-sm appearance-none focus:outline-none focus:ring-2 pr-10"
                    style={{
                      background: "var(--background)",
                      border: "1px solid var(--border)",
                      color: industry
                        ? "var(--foreground)"
                        : "var(--foreground-muted)",
                      "--tw-ring-color": "var(--accent)",
                    } as React.CSSProperties}
                  >
                    <option value="">Velg bransje</option>
                    {INDUSTRIES.map((ind) => (
                      <option key={ind} value={ind}>
                        {ind}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: "var(--foreground-muted)" }}
                  />
                </div>
              </div>
            </div>
          </div>
        );

      // ── Step 4: PowerOffice ─────────────────────────────
      case 4:
        return (
          <div className="max-w-md mx-auto">
            <div className="text-center mb-8">
              <div
                className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
                style={{ background: "var(--accent-50)" }}
              >
                <LinkIcon size={28} style={{ color: "var(--accent)" }} />
              </div>
              <h2
                className="text-2xl font-bold mb-2"
                style={{ color: "var(--foreground)" }}
              >
                Koble til PowerOffice
              </h2>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--foreground-secondary)" }}
              >
                Vi leser okonomidataene dine for a analysere bedriften. Vi
                bokforer eller endrer ingenting i PowerOffice.
              </p>
            </div>

            <div className="space-y-5">
              <div>
                <label
                  htmlFor="clientKey"
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "var(--foreground)" }}
                >
                  Client Key
                </label>
                <input
                  id="clientKey"
                  type="password"
                  value={clientKey}
                  onChange={(e) => {
                    setClientKey(e.target.value);
                    if (connectionStatus === "error")
                      setConnectionStatus("idle");
                  }}
                  placeholder="Lim inn din Client Key"
                  className="w-full rounded-lg px-4 py-2.5 text-sm placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2"
                  style={{
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                    "--tw-ring-color": "var(--accent)",
                  } as React.CSSProperties}
                  disabled={
                    connectionStatus === "connecting" ||
                    connectionStatus === "connected"
                  }
                />
              </div>

              {/* Status indicator */}
              {connectionStatus === "connecting" && (
                <div
                  className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
                  style={{
                    background: "var(--info-light)",
                    color: "var(--info)",
                  }}
                >
                  <Loader2 size={16} className="animate-spin" />
                  Tester tilkobling...
                </div>
              )}
              {connectionStatus === "connected" && (
                <div
                  className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
                  style={{
                    background: "var(--success-light)",
                    color: "var(--success)",
                  }}
                >
                  <Check size={16} />
                  Tilkoblet! Starter synkronisering...
                </div>
              )}
              {connectionStatus === "error" && (
                <div
                  className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
                  style={{
                    background: "var(--danger-light)",
                    color: "var(--danger)",
                  }}
                >
                  Tilkoblingen feilet. Sjekk Client Key og prov igjen.
                </div>
              )}

              {/* Buttons */}
              <div className="space-y-3">
                <button
                  onClick={handleConnect}
                  disabled={
                    !clientKey.trim() ||
                    connectionStatus === "connecting" ||
                    connectionStatus === "connected"
                  }
                  className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 hover:opacity-90"
                  style={{ background: "var(--primary)" }}
                >
                  {connectionStatus === "connecting" ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : connectionStatus === "connected" ? (
                    <Check size={18} />
                  ) : (
                    <LinkIcon size={18} />
                  )}
                  {connectionStatus === "connecting"
                    ? "Kobler til..."
                    : connectionStatus === "connected"
                    ? "Tilkoblet"
                    : "Koble til"}
                </button>

                <button
                  onClick={handleSkipConnection}
                  className="w-full text-center text-sm font-medium py-2"
                  style={{ color: "var(--foreground-muted)" }}
                  disabled={connectionStatus === "connecting"}
                >
                  Hopp over for na
                </button>
              </div>
            </div>
          </div>
        );

      // ── Step 5: Sync progress ───────────────────────────
      case 5:
        return (
          <div className="max-w-md mx-auto text-center">
            <div
              className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-6"
              style={{ background: "var(--accent-50)" }}
            >
              {syncProgress >= SYNC_STEPS.length ? (
                <Check size={28} style={{ color: "var(--success)" }} />
              ) : (
                <Loader2
                  size={28}
                  className="animate-spin"
                  style={{ color: "var(--accent)" }}
                />
              )}
            </div>

            <h2
              className="text-2xl font-bold mb-2"
              style={{ color: "var(--foreground)" }}
            >
              {skippedConnection
                ? "Setter opp demomiljø"
                : "Vi analyserer regnskapet ditt"}
            </h2>
            <p
              className="text-sm mb-8"
              style={{ color: "var(--foreground-secondary)" }}
            >
              {skippedConnection
                ? "Vi forbereder et demomiljo slik at du kan utforske Elida."
                : "Dette tar vanligvis et par minutter."}
            </p>

            <div className="space-y-1">
              {SYNC_STEPS.map((syncStep, index) => {
                const isDone = syncProgress > index;
                const isActive = syncProgress === index;
                return (
                  <div
                    key={syncStep.key}
                    className="flex items-center gap-3 rounded-lg px-4 py-3"
                    style={{
                      background: isDone
                        ? "var(--success-light)"
                        : isActive
                        ? "var(--surface)"
                        : "transparent",
                      opacity: !isDone && !isActive ? 0.5 : 1,
                    }}
                  >
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                      {isDone ? (
                        <Check
                          size={16}
                          style={{ color: "var(--success)" }}
                          strokeWidth={3}
                        />
                      ) : isActive ? (
                        <Loader2
                          size={16}
                          className="animate-spin"
                          style={{ color: "var(--accent)" }}
                        />
                      ) : (
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ background: "var(--foreground-muted)" }}
                        />
                      )}
                    </div>
                    <span
                      className="text-sm"
                      style={{
                        color: isDone
                          ? "var(--success)"
                          : isActive
                          ? "var(--foreground)"
                          : "var(--foreground-muted)",
                        fontWeight: isActive ? 500 : 400,
                      }}
                    >
                      {syncStep.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Progress bar */}
            <div className="mt-6">
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: "var(--border)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    background: "var(--accent)",
                    width: `${(syncProgress / SYNC_STEPS.length) * 100}%`,
                    transition: "width 0.5s ease-out",
                  }}
                />
              </div>
            </div>
          </div>
        );

      // ── Step 6: Preferences ─────────────────────────────
      case 6:
        return (
          <div className="max-w-md mx-auto">
            <div className="text-center mb-8">
              <h2
                className="text-2xl font-bold mb-2"
                style={{ color: "var(--foreground)" }}
              >
                Noen fa sporsmal
              </h2>
              <p
                className="text-sm"
                style={{ color: "var(--foreground-secondary)" }}
              >
                Dette hjelper oss a gi bedre analyser. Disse kan endres senere
                under innstillinger.
              </p>
            </div>

            <div className="space-y-5">
              {/* Payroll date */}
              <div>
                <label
                  htmlFor="payrollDate"
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "var(--foreground)" }}
                >
                  Normal lonnsdag
                </label>
                <div className="relative">
                  <select
                    id="payrollDate"
                    value={payrollDate}
                    onChange={(e) => setPayrollDate(e.target.value)}
                    className="w-full rounded-lg px-4 py-2.5 text-sm appearance-none focus:outline-none focus:ring-2 pr-10"
                    style={{
                      background: "var(--background)",
                      border: "1px solid var(--border)",
                      color: "var(--foreground)",
                      "--tw-ring-color": "var(--accent)",
                    } as React.CSSProperties}
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day.toString()}>
                        {day}. i maneden
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: "var(--foreground-muted)" }}
                  />
                </div>
              </div>

              {/* Employer tax zone */}
              <div>
                <label
                  htmlFor="taxZone"
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "var(--foreground)" }}
                >
                  Arbeidsgiveravgift-sone
                </label>
                <div className="relative">
                  <select
                    id="taxZone"
                    value={taxZone}
                    onChange={(e) => setTaxZone(e.target.value)}
                    className="w-full rounded-lg px-4 py-2.5 text-sm appearance-none focus:outline-none focus:ring-2 pr-10"
                    style={{
                      background: "var(--background)",
                      border: "1px solid var(--border)",
                      color: "var(--foreground)",
                      "--tw-ring-color": "var(--accent)",
                    } as React.CSSProperties}
                  >
                    {EMPLOYER_TAX_ZONES.map((zone) => (
                      <option key={zone.value} value={zone.value}>
                        {zone.label} ({zone.rate})
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: "var(--foreground-muted)" }}
                  />
                </div>
              </div>

              {/* Liquidity buffer */}
              <div>
                <label
                  htmlFor="liquidityBuffer"
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "var(--foreground)" }}
                >
                  Minimum likviditetsbuffer
                </label>
                <div className="relative">
                  <input
                    id="liquidityBuffer"
                    type="text"
                    inputMode="numeric"
                    value={liquidityBuffer}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      setLiquidityBuffer(val);
                    }}
                    placeholder="100000"
                    className="w-full rounded-lg px-4 py-2.5 pr-10 text-sm placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2"
                    style={{
                      background: "var(--background)",
                      border: "1px solid var(--border)",
                      color: "var(--foreground)",
                      "--tw-ring-color": "var(--accent)",
                    } as React.CSSProperties}
                  />
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm"
                    style={{ color: "var(--foreground-muted)" }}
                  >
                    kr
                  </span>
                </div>
                <p
                  className="mt-1.5 text-xs"
                  style={{ color: "var(--foreground-muted)" }}
                >
                  Elida varsler deg nar kontoen narmer seg dette belopet.
                </p>
              </div>
            </div>

            <p
              className="mt-6 text-center text-xs"
              style={{ color: "var(--foreground-muted)" }}
            >
              Disse kan endres senere under innstillinger.
            </p>
          </div>
        );

      // ── Step 7: Complete ────────────────────────────────
      case 7:
        return (
          <div className="text-center max-w-md mx-auto">
            {/* Animated checkmark */}
            <div
              className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6"
              style={{
                background: "var(--success-light)",
                animation: "scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
            >
              <Check
                size={40}
                strokeWidth={3}
                style={{ color: "var(--success)" }}
              />
            </div>

            <h2
              className="text-2xl font-bold mb-3"
              style={{ color: "var(--foreground)" }}
            >
              Analysen er klar!
            </h2>

            <p
              className="text-sm leading-relaxed mb-8"
              style={{ color: "var(--foreground-secondary)" }}
            >
              {companyName && (
                <>
                  <strong style={{ color: "var(--foreground)" }}>
                    {companyName}
                  </strong>{" "}
                  er satt opp og klar.{" "}
                </>
              )}
              Vi har analysert okonomien din og bygget en oversikt tilpasset
              ditt niva.
            </p>

            {/* Summary cards */}
            <div
              className="rounded-xl p-5 mb-8 text-left space-y-3"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              {companyName && (
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: "var(--foreground-secondary)" }}>
                    Bedrift
                  </span>
                  <span
                    className="font-medium"
                    style={{ color: "var(--foreground)" }}
                  >
                    {companyName}
                  </span>
                </div>
              )}
              {knowledgeLevel && (
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: "var(--foreground-secondary)" }}>
                    Spraknivia
                  </span>
                  <span
                    className="font-medium"
                    style={{ color: "var(--foreground)" }}
                  >
                    {knowledgeLevel === "beginner"
                      ? "Nybegynner"
                      : knowledgeLevel === "intermediate"
                      ? "Middels"
                      : "Avansert"}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: "var(--foreground-secondary)" }}>
                  Integrasjon
                </span>
                <span
                  className="font-medium"
                  style={{
                    color: skippedConnection
                      ? "var(--foreground-muted)"
                      : "var(--success)",
                  }}
                >
                  {skippedConnection
                    ? "Ikke tilkoblet"
                    : "PowerOffice tilkoblet"}
                </span>
              </div>
            </div>

            <button
              onClick={handleFinish}
              className="inline-flex items-center gap-2 rounded-lg px-8 py-3 text-sm font-semibold text-white hover:opacity-90"
              style={{ background: "var(--primary)" }}
            >
              Ga til oversikten
              <ArrowRight size={18} />
            </button>
          </div>
        );

      default:
        return null;
    }
  }

  // ─── Main render ──────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--background)" }}
    >
      {/* Header with progress */}
      <header
        className="sticky top-0 z-10 px-6 py-4 flex items-center justify-between"
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
            style={{ background: "var(--primary)" }}
          >
            E
          </div>
          <span
            className="text-sm font-medium"
            style={{ color: "var(--foreground)" }}
          >
            Elida
          </span>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
            <div
              key={s}
              className="rounded-full"
              style={{
                width: s === step ? 24 : 8,
                height: 8,
                background:
                  s < step
                    ? "var(--accent)"
                    : s === step
                    ? "var(--primary)"
                    : "var(--border)",
                transition: "all 0.3s ease",
              }}
            />
          ))}
        </div>

        {/* Step counter */}
        <span
          className="text-xs font-medium tabular-nums"
          style={{ color: "var(--foreground-muted)" }}
        >
          {step} / {TOTAL_STEPS}
        </span>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div
          className="w-full max-w-2xl"
          style={{
            opacity: isAnimating ? 0 : 1,
            transform: isAnimating
              ? direction === "forward"
                ? "translateX(20px)"
                : "translateX(-20px)"
              : "translateX(0)",
            transition: "opacity 0.2s ease, transform 0.2s ease",
          }}
        >
          {renderStep()}
        </div>
      </main>

      {/* Footer navigation */}
      {step !== 1 && step !== 5 && step !== 7 && (
        <footer
          className="sticky bottom-0 px-6 py-4 flex items-center justify-between"
          style={{
            background: "var(--surface)",
            borderTop: "1px solid var(--border)",
          }}
        >
          <button
            onClick={() => goToStep(step - 1)}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium hover:opacity-80"
            style={{
              color: "var(--foreground-secondary)",
              background: "var(--surface-hover)",
            }}
          >
            <ArrowLeft size={16} />
            Tilbake
          </button>

          {step === 3 ? (
            <button
              onClick={handleCompanyCreate}
              disabled={!canProceed() || isSaving}
              className="flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60 hover:opacity-90"
              style={{ background: "var(--primary)" }}
            >
              {isSaving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : null}
              {isSaving ? "Lagrer..." : "Neste"}
              {!isSaving && <ArrowRight size={16} />}
            </button>
          ) : step === 6 ? (
            <button
              onClick={handlePreferencesSave}
              disabled={isSaving}
              className="flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60 hover:opacity-90"
              style={{ background: "var(--primary)" }}
            >
              {isSaving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : null}
              {isSaving ? "Lagrer..." : "Fullfar"}
              {!isSaving && <ArrowRight size={16} />}
            </button>
          ) : (
            <button
              onClick={() => goToStep(step + 1)}
              disabled={!canProceed()}
              className="flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60 hover:opacity-90"
              style={{ background: "var(--primary)" }}
            >
              Neste
              <ArrowRight size={16} />
            </button>
          )}
        </footer>
      )}

      {/* Animation keyframes */}
      <style>{`
        @keyframes scaleIn {
          0% { transform: scale(0); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
