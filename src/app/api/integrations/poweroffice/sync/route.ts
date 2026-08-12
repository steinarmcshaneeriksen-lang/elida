import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";

/**
 * POST /api/integrations/poweroffice/sync
 *
 * Body: { company_id }
 *
 * Triggers an incremental sync for the given company.
 * Returns the current sync status for all resource types.
 *
 * NOTE: For MVP, this marks sync states as "pending" and returns.
 * A background job (or edge function) would pick up pending syncs
 * and perform the actual data transfer. In a full implementation,
 * this would queue a sync job to a task queue.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { company_id } = body;

    if (!company_id) {
      return NextResponse.json(
        { error: "company_id is required" },
        { status: 400 }
      );
    }

    const auth = await verifyCompanyAccess(company_id);
    if (auth instanceof NextResponse) return auth;

    const supabase = await createClient();

    // Check that an active integration exists
    const { data: integration } = await supabase
      .from("integrations")
      .select("id, is_active")
      .eq("company_id", company_id)
      .eq("provider", "poweroffice")
      .single() as { data: { id: string; is_active: boolean } | null };

    if (!integration) {
      return NextResponse.json(
        { error: "No PowerOffice integration found for this company" },
        { status: 404 }
      );
    }

    if (!integration.is_active) {
      return NextResponse.json(
        { error: "PowerOffice integration is inactive. Reconnect first." },
        { status: 400 }
      );
    }

    // Check if a sync is already running
    const { data: runningSyncs } = await supabase
      .from("integration_sync_state")
      .select("id, resource_type")
      .eq("company_id", company_id)
      .eq("sync_status", "running") as {
      data: Array<{ id: string; resource_type: string }> | null;
    };

    if (runningSyncs && runningSyncs.length > 0) {
      return NextResponse.json(
        {
          error: "A sync is already in progress",
          running_resources: runningSyncs.map((s) => s.resource_type),
        },
        { status: 409 }
      );
    }

    // Mark all sync states as pending (the sync worker will pick them up)
    const { error: updateError } = (await supabase
      .from("integration_sync_state")
      .update({
        sync_status: "pending" as const,
        last_sync_started_at: new Date().toISOString(),
        error_message: null,
      } as never)
      .eq("company_id", company_id)) as { error: { message: string } | null };

    if (updateError) {
      console.error("Failed to update sync states:", updateError);
      return errorResponse("Failed to trigger sync");
    }

    // Load updated sync states
    const { data: syncStates } = await supabase
      .from("integration_sync_state")
      .select("*")
      .eq("company_id", company_id)
      .order("resource_type", { ascending: true }) as {
      data: Array<{
        resource_type: string;
        sync_status: string;
        last_sync_completed_at: string | null;
        error_message: string | null;
      }> | null;
    };

    return NextResponse.json({
      status: "sync_queued",
      company_id,
      message:
        "Incremental sync has been queued. Resource data will update as each sync completes.",
      resources: (syncStates ?? []).map((s) => ({
        resource_type: s.resource_type,
        sync_status: s.sync_status,
        last_sync_completed_at: s.last_sync_completed_at,
        error_message: s.error_message,
      })),
    });
  } catch (error) {
    console.error("PowerOffice sync error:", error);
    return errorResponse("Failed to trigger sync");
  }
}
