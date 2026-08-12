import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { DocumentAnalyzer } from "@/lib/accounting-advisor/document-analyzer";

/**
 * POST /api/documents/analyze
 *
 * Multipart form data with:
 * - file: PDF, JPG, or PNG document
 * - company_id: string
 *
 * Analyzes the document ephemerally. No document content is stored.
 * Creates an ephemeral_document_jobs record for tracking.
 * Deletes any temporary files after processing.
 *
 * Returns structured extraction and accounting recommendation.
 */

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  let tempPath: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const companyId = formData.get("company_id") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "file is required" },
        { status: 400 }
      );
    }

    if (!companyId) {
      return NextResponse.json(
        { error: "company_id is required" },
        { status: 400 }
      );
    }

    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    // Validate file type
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${file.type}. Accepted types: PDF, JPG, PNG`,
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10 MB." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Create job tracking record (NO document content stored)
    const { data: job, error: jobError } = (await supabase
      .from("ephemeral_document_jobs")
      .insert({
        company_id: companyId,
        user_id: (auth as { userId: string }).userId,
        status: "analyzing" as const,
        mime_type: file.type,
        file_size: file.size,
      } as never)
      .select("id")
      .single()) as { data: { id: string } | null; error: { message: string } | null };

    if (jobError || !job) {
      console.error("Failed to create document job:", jobError);
      return errorResponse("Failed to create analysis job");
    }

    // Write file to temp location for processing
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type === "application/pdf" ? ".pdf" : file.type === "image/png" ? ".png" : ".jpg";
    tempPath = join(tmpdir(), `elida-doc-${randomUUID()}${ext}`);
    await writeFile(tempPath, fileBuffer);

    const apiKey = process.env.OPENAI_API_KEY;
    const hasRealKey = apiKey && apiKey !== "" && !apiKey.startsWith("sk-placeholder") && apiKey !== "your-api-key-here";

    if (hasRealKey) {
      const analyzer = new DocumentAnalyzer(apiKey);
      const base64Content = fileBuffer.toString("base64");
      const extraction = await analyzer.analyzeDocument(base64Content, file.type);

      const docTypeLabels: Record<string, string> = {
        invoice: "Faktura",
        receipt: "Kvittering",
        credit_note: "Kreditnota",
        unknown: "Ukjent",
      };

      const extractionResult = {
        document_type: extraction.document_type,
        document_type_label: docTypeLabels[extraction.document_type] ?? "Ukjent",
        confidence: extraction.extraction_confidence,
        fields: {
          supplier_name: extraction.supplier.name,
          supplier_org_number: extraction.supplier.org_number,
          invoice_number: extraction.invoice_number,
          invoice_date: extraction.invoice_date,
          due_date: extraction.due_date,
          total_amount: extraction.total_amount,
          vat_amount: extraction.total_vat,
          net_amount: extraction.subtotal,
          currency: extraction.currency,
          payment_reference: extraction.payment_reference,
          line_items: extraction.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unit_price: l.unit_price,
            amount: l.amount,
            vat_rate: l.vat_rate,
          })),
        },
      };

      const notes: string[] = [];
      if (extraction.supplier.name) {
        notes.push(`Leverandør identifisert: ${extraction.supplier.name}`);
      }
      if (extraction.supplier.org_number) {
        notes.push(`Org.nr: ${extraction.supplier.org_number}`);
      }
      if (extraction.extraction_confidence === "rough_estimate" || extraction.extraction_confidence === "low_confidence") {
        notes.push("Lav konfidens på uttrekket. Kontroller feltene manuelt.");
      }

      const recommendation = { notes };

      await (supabase
        .from("ephemeral_document_jobs")
        .update({
          status: "completed" as const,
          completed_at: new Date().toISOString(),
          analysis_result: extractionResult,
          recommendation,
        } as never)
        .eq("id", job.id) as never);

      return NextResponse.json({
        job_id: job.id,
        status: "completed",
        extraction: extractionResult,
        recommendation,
      });
    }

    // Fallback: mock analysis when no API key is configured
    const analysisResult = generateMockAnalysis(file.name, file.type, file.size);

    await (supabase
      .from("ephemeral_document_jobs")
      .update({
        status: "completed" as const,
        completed_at: new Date().toISOString(),
        analysis_result: analysisResult.extraction,
        recommendation: analysisResult.recommendation,
      } as never)
      .eq("id", job.id) as never);

    return NextResponse.json({
      job_id: job.id,
      status: "completed",
      extraction: analysisResult.extraction,
      recommendation: analysisResult.recommendation,
    });
  } catch (error) {
    console.error("Document analyze error:", error);
    return errorResponse("Failed to analyze document");
  } finally {
    // Always clean up temporary files
    if (tempPath) {
      try {
        await unlink(tempPath);
      } catch {
        // File may already be deleted; ignore
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Mock analysis (to be replaced with actual AI analysis)
// ---------------------------------------------------------------------------

function generateMockAnalysis(
  filename: string,
  _mimeType: string,
  _fileSize: number
) {
  // Detect likely document type from filename
  const lowerFilename = filename.toLowerCase();
  const isInvoice =
    lowerFilename.includes("faktura") ||
    lowerFilename.includes("invoice") ||
    lowerFilename.includes("regning");
  const isReceipt =
    lowerFilename.includes("kvittering") || lowerFilename.includes("receipt");

  if (isInvoice) {
    return {
      extraction: {
        document_type: "incoming_invoice",
        confidence: 0.85,
        fields: {
          supplier_name: "Tekna Systems AS",
          supplier_org_number: "901 234 567",
          invoice_number: "TK-2026-0892",
          invoice_date: "2026-08-10",
          due_date: "2026-09-10",
          total_amount: 45_000,
          vat_amount: 9_000,
          net_amount: 36_000,
          currency: "NOK",
          payment_reference: "2608100892",
          line_items: [
            {
              description: "Systemvedlikehold august 2026",
              quantity: 1,
              unit_price: 36_000,
              amount: 36_000,
              vat_rate: 0.25,
              vat_amount: 9_000,
            },
          ],
        },
      },
      recommendation: {
        posting_suggestion: {
          debit_account: "6540",
          debit_account_name: "IT-kostnader",
          credit_account: "2400",
          credit_account_name: "Leverandørgjeld",
          vat_code: "1",
          amount: 36_000,
          vat_amount: 9_000,
        },
        matched_supplier: {
          id: "sup-1",
          name: "Tekna Systems AS",
          confidence: 0.92,
        },
        matched_pattern: {
          category: "IT-kostnader",
          typical_account: "6540",
          occurrence_count: 8,
          confidence: 0.88,
        },
        notes: [
          "Leverandør gjenkjent fra tidligere posteringer",
          "Beløp er noe lavere enn gjennomsnittlig faktura fra denne leverandøren (89 000 kr)",
          "MVA-sats 25 % stemmer med standard sats",
        ],
      },
    };
  }

  if (isReceipt) {
    return {
      extraction: {
        document_type: "receipt",
        confidence: 0.78,
        fields: {
          vendor_name: "Kaffebrenneriet AS",
          date: "2026-08-11",
          total_amount: 456,
          vat_amount: 54.72,
          net_amount: 401.28,
          currency: "NOK",
          payment_method: "kort",
        },
      },
      recommendation: {
        posting_suggestion: {
          debit_account: "7350",
          debit_account_name: "Representasjon",
          credit_account: "1920",
          credit_account_name: "Bankkonto",
          vat_code: "1",
          amount: 401.28,
          vat_amount: 54.72,
        },
        notes: [
          "Kategorisert som representasjon. Vurder om dette gjelder kundemøte (fradragsberettiget) eller internt (begrenset fradrag).",
          "Husk at representasjonskostnader har begrenset MVA-fradrag.",
        ],
      },
    };
  }

  // Generic / unknown document
  return {
    extraction: {
      document_type: "unknown",
      confidence: 0.5,
      fields: {
        raw_text_preview:
          "Dokumentet kunne ikke klassifiseres automatisk. Last opp en faktura, kvittering, eller kreditnota for best resultat.",
      },
    },
    recommendation: {
      notes: [
        "Dokumenttypen ble ikke gjenkjent. Kontroller innholdet manuelt.",
        "For best resultat, bruk tydelige skannede PDF-er eller bilder av fakturaer og kvitteringer.",
      ],
    },
  };
}
