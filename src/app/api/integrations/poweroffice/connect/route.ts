import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import { PowerOfficeAdapter } from "@/lib/integrations/poweroffice/adapter";

/**
 * POST /api/integrations/poweroffice/connect
 *
 * Body: { company_id, client_key, application_key?, subscription_key? }
 *
 * Creates an integration record, tests the connection, and starts
 * the initial sync. Returns connection status.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { company_id, client_key, application_key, subscription_key } = body;

    if (!company_id || !client_key) {
      return NextResponse.json(
        { error: "company_id and client_key are required" },
        { status: 400 }
      );
    }

    const auth = await verifyCompanyAccess(company_id);
    if (auth instanceof NextResponse) return auth;

    // Use environment variables for application_key and subscription_key
    // if not provided in the request body
    const effectiveAppKey =
      application_key ?? process.env.POWEROFFICE_APPLICATION_KEY;
    const effectiveSubKey =
      subscription_key ?? process.env.POWEROFFICE_SUBSCRIPTION_KEY;

    if (!effectiveAppKey || !effectiveSubKey) {
      return NextResponse.json(
        {
          error:
            "application_key and subscription_key are required (provide in body or set POWEROFFICE_APPLICATION_KEY and POWEROFFICE_SUBSCRIPTION_KEY environment variables)",
        },
        { status: 400 }
      );
    }

    // Test the connection
    const adapter = new PowerOfficeAdapter();
    const connectionResult = await adapter.connect({
      applicationKey: effectiveAppKey,
      clientKey: client_key,
      subscriptionKey: effectiveSubKey,
    });

    if (!connectionResult.success) {
      return NextResponse.json(
        {
          connected: false,
          error: connectionResult.error,
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check if integration already exists
    const { data: existing } = await supabase
      .from("integrations")
      .select("id")
      .eq("company_id", company_id)
      .eq("provider", "poweroffice")
      .single() as { data: { id: string } | null };

    let integrationId: string;

    if (existing) {
      // Update existing integration
      const { error: updateError } = (await supabase
        .from("integrations")
        .update({
          is_active: true,
          connected_at: new Date().toISOString(),
          settings: {
            company_name: connectionResult.companyName,
            organization_number: connectionResult.organizationNumber,
          },
        } as never)
        .eq("id", existing.id)) as { error: { message: string } | null };

      if (updateError) {
        console.error("Failed to update integration:", updateError);
        return errorResponse("Failed to update integration record");
      }

      integrationId = existing.id;

      // Update credentials
      await (supabase
        .from("integration_credentials")
        .update({
          encrypted_client_key: client_key, // In production, encrypt this
          application_key: effectiveAppKey,
          subscription_key: effectiveSubKey,
        } as never)
        .eq("integration_id", existing.id) as never);
    } else {
      // Create new integration record
      const { data: integration, error: insertError } = (await supabase
        .from("integrations")
        .insert({
          company_id,
          provider: "poweroffice" as const,
          is_active: true,
          connected_at: new Date().toISOString(),
          settings: {
            company_name: connectionResult.companyName,
            organization_number: connectionResult.organizationNumber,
          },
        } as never)
        .select("id")
        .single()) as { data: { id: string } | null; error: { message: string } | null };

      if (insertError || !integration) {
        console.error("Failed to create integration:", insertError);
        return errorResponse("Failed to create integration record");
      }

      integrationId = integration.id;

      // Store credentials (in production, the client_key should be encrypted)
      const { error: credError } = (await supabase
        .from("integration_credentials")
        .insert({
          integration_id: integrationId,
          encrypted_client_key: client_key,
          application_key: effectiveAppKey,
          subscription_key: effectiveSubKey,
        } as never)) as { error: { message: string } | null };

      if (credError) {
        console.error("Failed to store credentials:", credError);
        // Rollback integration
        await supabase.from("integrations").delete().eq("id", integrationId);
        return errorResponse("Failed to store credentials");
      }
    }

    // Initialize sync state for each resource type
    const resourceTypes = [
      "chart_of_accounts",
      "vat_codes",
      "customers",
      "suppliers",
      "account_transactions",
      "customer_ledger",
      "supplier_ledger",
      "outgoing_invoices",
      "incoming_invoices",
      "projects",
      "departments",
    ];

    for (const resourceType of resourceTypes) {
      const { data: existingState } = await supabase
        .from("integration_sync_state")
        .select("id")
        .eq("company_id", company_id)
        .eq("resource_type", resourceType)
        .single() as { data: { id: string } | null };

      if (!existingState) {
        await (supabase.from("integration_sync_state").insert({
          company_id,
          resource_type: resourceType,
          sync_status: "pending" as const,
        } as never) as never);
      } else {
        await (supabase
          .from("integration_sync_state")
          .update({ sync_status: "pending" as const } as never)
          .eq("id", existingState.id) as never);
      }
    }

    return NextResponse.json({
      connected: true,
      integration_id: integrationId,
      company_name: connectionResult.companyName,
      organization_number: connectionResult.organizationNumber,
      sync_status: "pending",
      message: "Connection established. Initial sync has been queued.",
    });
  } catch (error) {
    console.error("PowerOffice connect error:", error);
    return errorResponse("Failed to connect to PowerOffice");
  }
}
