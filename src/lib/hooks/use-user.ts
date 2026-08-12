"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { invalidate, load, peek, subscribe } from "@/lib/data-cache";
import type { User as AuthUser } from "@supabase/supabase-js";
import type {
  User,
  Company,
  AccountingKnowledgeLevel,
} from "@/lib/types/database";

interface Session {
  user: AuthUser | null;
  profile: User | null;
  company: Company | null;
  knowledgeLevel: AccountingKnowledgeLevel | null;
}

interface UseUserReturn extends Session {
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const KEY = "session";

const EMPTY: Session = {
  user: null,
  profile: null,
  company: null,
  knowledgeLevel: null,
};

/**
 * Resolves who is signed in and which company they belong to.
 *
 * This runs four round trips — auth, profile, access, company — so it must
 * happen once per tab, not once per page. The layout, the header and the page
 * body all call useUser(); they now share one result through the cache, and a
 * navigation reuses it instead of blocking the page on a fresh lookup.
 */
async function loadSession(): Promise<Session> {
  const supabase = createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return EMPTY;

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();

  if (!profile) return { ...EMPTY, user: authUser };

  const { data: access } = await supabase
    .from("user_company_access")
    .select("*")
    .eq("user_id", profile.id)
    .limit(1)
    .maybeSingle();

  if (!access) return { ...EMPTY, user: authUser, profile };

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", access.company_id)
    .single();

  return {
    user: authUser,
    profile,
    company,
    knowledgeLevel: access.accounting_knowledge_level,
  };
}

// Defined once at module scope so useSyncExternalStore is not handed a new
// function on every render.
const subscribeSession = (listener: () => void) => subscribe(KEY, listener);
const readSession = () => peek<Session>(KEY);

export function useUser(): UseUserReturn {
  const router = useRouter();

  const snapshot = useSyncExternalStore(subscribeSession, readSession, readSession);

  useEffect(() => {
    load(KEY, loadSession);

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) invalidate(KEY);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await createClient().auth.signOut();
    invalidate();
    router.push("/login");
  }, [router]);

  const session = snapshot.value ?? EMPTY;

  return {
    user: session.user,
    profile: session.profile,
    company: session.company,
    knowledgeLevel: session.knowledgeLevel,
    isLoading: !snapshot.hasValue,
    signOut,
  };
}

/**
 * Re-reads the signed-in user's company. Used after onboarding writes one, so
 * the shell picks up the new name without a full page reload.
 */
export function useRefreshSession() {
  const [, force] = useState(0);
  return useCallback(async () => {
    await load(KEY, loadSession, { force: true });
    force((n) => n + 1);
  }, []);
}
