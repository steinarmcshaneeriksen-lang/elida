"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User as AuthUser } from "@supabase/supabase-js";
import type {
  User,
  Company,
  AccountingKnowledgeLevel,
} from "@/lib/types/database";

interface UseUserReturn {
  user: AuthUser | null;
  profile: User | null;
  company: Company | null;
  knowledgeLevel: AccountingKnowledgeLevel | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

export function useUser(): UseUserReturn {
  const router = useRouter();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  function getSupabase() {
    if (!supabaseRef.current) {
      supabaseRef.current = createClient();
    }
    return supabaseRef.current;
  }

  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [knowledgeLevel, setKnowledgeLevel] = useState<AccountingKnowledgeLevel | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabase();

    async function loadUser() {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();

        if (!authUser || cancelled) {
          setIsLoading(false);
          return;
        }

        setUser(authUser);

        const { data: userProfile } = await supabase
          .from("users")
          .select("*")
          .eq("auth_user_id", authUser.id)
          .maybeSingle();

        if (cancelled) return;
        setProfile(userProfile);

        if (!userProfile) {
          setIsLoading(false);
          return;
        }

        const { data: access } = await supabase
          .from("user_company_access")
          .select("*")
          .eq("user_id", userProfile.id)
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (access) {
          setKnowledgeLevel(access.accounting_knowledge_level);

          const { data: companyData } = await supabase
            .from("companies")
            .select("*")
            .eq("id", access.company_id)
            .single();

          if (!cancelled) {
            setCompany(companyData);
          }
        }
      } catch (err) {
        console.error("Error loading user data:", err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) {
          setUser(null);
          setProfile(null);
          setCompany(null);
          setKnowledgeLevel(null);
        }
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
    setUser(null);
    setProfile(null);
    setCompany(null);
    setKnowledgeLevel(null);
    router.push("/login");
  }, [router]);

  return {
    user,
    profile,
    company,
    knowledgeLevel,
    isLoading,
    signOut,
  };
}
