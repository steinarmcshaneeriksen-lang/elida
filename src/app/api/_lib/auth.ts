/**
 * Shared authentication and authorization helpers for API routes.
 *
 * Every company-scoped route should call `verifyCompanyAccess` which
 * checks both the Supabase session and the user_company_access table.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface AuthResult {
  userId: string;
  companyId: string;
  role: string;
}

/**
 * Verify that the current user is authenticated via Supabase.
 * Returns the user ID or a 401 NextResponse.
 */
export async function verifyAuth(): Promise<
  { userId: string } | NextResponse
> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  return { userId: user.id };
}

/**
 * Verify that the current user is authenticated AND has access to
 * the given company. Returns user/company info or a NextResponse error.
 */
export async function verifyCompanyAccess(
  companyId: string
): Promise<AuthResult | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Look up the user in the internal users table (linked via auth_user_id)
  const { data: dbUser } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single() as { data: { id: string } | null };

  if (!dbUser) {
    return NextResponse.json(
      { error: "User profile not found" },
      { status: 403 }
    );
  }

  // Check company access
  const { data: access } = await supabase
    .from("user_company_access")
    .select("role")
    .eq("user_id", dbUser.id)
    .eq("company_id", companyId)
    .single() as { data: { role: string } | null };

  if (!access) {
    return NextResponse.json(
      { error: "Company not found or access denied" },
      { status: 403 }
    );
  }

  return {
    userId: dbUser.id,
    companyId,
    role: access.role,
  };
}

/**
 * Standard JSON error response.
 */
export function errorResponse(
  message: string,
  status: number = 500
): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
