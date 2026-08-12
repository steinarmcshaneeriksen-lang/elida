import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";

/**
 * GET /api/integrations/poweroffice/status?company_id=...
 *
 * Returns the sync state for all resource types for the given company.
 */
export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get("company_id");

    if (!companyId) {
      return NextResponse.json(
        { error: "company_id query parameter is required" },
        { status: 400 }
      );
    }

    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    const supabase = await createClient();

    // Load integration record
    const { data: integration } = await supabase
      .from("integrations")
      .select("id, is_active, connected_at, settings")
      .eq("company_id", companyId)
      .eq("provider", "poweroffice")
      .single() as {
      data: {
        id: string;
        is_active: boolean;
        connected_at: string | null;
        settings: Record<string, unknown>;
      } | null;
    };

    if (!integration) {
      return NextResponse.json({
        connected: false,
        message: "No PowerOffice integration found for this company",
        resources: [],
      });
    }

    // Load sync states
    const { data: syncStates } = await supabase
      .from("integration_sync_state")
      .select("*")
      .eq("company_id", companyId)
      .order("resource_type", { ascending: true }) as {
      data: Array<{
        resource_type: string;
        sync_status: string;
        last_sync_started_at: string | null;
        last_sync_completed_at: string | null;
        error_message: string | null;
        metadata: Record<string, unknown>;
      }> | null;
    };

    const resources = (syncStates ?? []).map((s) => ({
      resource_type: s.resource_type,
      sync_status: s.sync_status,
      last_sync_started_at: s.last_sync_started_at,
      last_sync_completed_at: s.last_sync_completed_at,
      error_message: s.error_message,
      metadata: s.metadata,
    }));

    // Overall status
    const statuses = resources.map((r) => r.sync_status);
    const hasRunning = statuses.includes("running");
    const hasPending = statuses.includes("pending");
    const hasFailed = statuses.includes("failed");
    const allCompleted = statuses.every((s) => s === "completed");

    let overallStatus = "unknown";
    if (hasRunning) overallStatus = "syncing";
    else if (hasPending) overallStatus = "pending";
    else if (allCompleted) overallStatus = "up_to_date";
    else if (hasFailed) overallStatus = "partial_failure";
    else overallStatus = "idle";

    // Find last sync time across all resources
    const completedTimes = resources
      .map((r) => r.last_sync_completed_at)
      .filter(Boolean) as string[];
    const lastSync =
      completedTimes.length > 0
        ? completedTimes.sort().reverse()[0]
        : null;

    const settings = integration.settings as Record<string, unknown>;

    return NextResponse.json({
      connected: integration.is_active,
      integration_id: integration.id,
      connected_at: integration.connected_at,
      company_name: settings?.company_name ?? null,
      organization_number: settings?.organization_number ?? null,
      overall_status: overallStatus,
      last_sync: lastSync,
      resources,
    });
  } catch (error) {
    console.error("PowerOffice status error:", error);
    return errorResponse("Failed to load integration status");
  }
}
