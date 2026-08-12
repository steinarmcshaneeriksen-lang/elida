"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User as AuthUser } from "@supabase/supabase-js";
import type {
  User,
  Company,
  UserCompanyAccess,
  AccountingKnowledgeLevel,
} from "@/lib/types/database";

interface UseUserReturn {
  /** Supabase auth user */
  user: AuthUser | null;
  /** Profile from the users table */
  profile: User | null;
  /** Current company from user_company_access */
  company: Company | null;
  /** User's accounting knowledge level */
  knowledgeLevel: AccountingKnowledgeLevel | null;
  /** Whether data is still loading */
  isLoading: boolean;
  /** Sign out and redirect to login */
  signOut: () => Promise<void>;
}

export function useUser(): UseUserReturn {
  const router = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [knowledgeLevel, setKnowledgeLevel] = useState<AccountingKnowledgeLevel | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      try {
        // Get auth user
        const { data: { user: authUser } } = await supabase.auth.getUser();

        if (!authUser || cancelled) {
          setIsLoading(false);
          return;
        }

        setUser(authUser);

        // Load profile from users table
        const { data: userProfile } = await supabase
          .from("users")
          .select("*")
          .eq("auth_user_id", authUser.id)
          .maybeSingle();

        if (cancelled) return;
        setProfile(userProfile);

        // Load company access (get the first/primary company)
        const { data: access } = await supabase
          .from("user_company_access")
          .select("*")
          .eq("user_id", authUser.id)
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (access) {
          setKnowledgeLevel(access.accounting_knowledge_level);

          // Load company details
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

    // Listen for auth state changes
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
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setCompany(null);
    setKnowledgeLevel(null);
    router.push("/login");
  }, [supabase, router]);

  return {
    user,
    profile,
    company,
    knowledgeLevel,
    isLoading,
    signOut,
  };
}
