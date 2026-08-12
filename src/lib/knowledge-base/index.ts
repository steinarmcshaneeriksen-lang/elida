/**
 * Knowledge Base Service
 *
 * Provides search and retrieval of accounting knowledge articles.
 * Articles are matched by keyword, category, or semantic search phrase,
 * and returned with appropriate detail level based on the user's
 * accounting knowledge level.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeArrayToken } from "@/lib/supabase/filter";
import type {
  KnowledgeArticle,
  ArticleCategory,
  RiskLevel,
  EvaluationQuestion,
} from "./types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function searchArticles(
  query: string,
  options?: {
    category?: ArticleCategory;
    limit?: number;
  }
): Promise<KnowledgeArticle[]> {
  const supabase = await createClient();
  const limit = options?.limit ?? 5;
  // Terms are interpolated into an array-contains filter, so strip anything
  // that could alter the array literal or append conditions.
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map(sanitizeArrayToken)
    .filter((t) => t.length > 2);

  let q = supabase
    .from("knowledge_articles")
    .select("*")
    .eq("review_status", "PUBLISHED")
    .or(
      `effective_to.is.null,effective_to.gte.${new Date().toISOString().slice(0, 10)}`
    )
    .limit(limit);

  if (options?.category) {
    q = q.eq("category", options.category);
  }

  if (terms.length > 0) {
    q = q.or(
      terms.map((t) => `keywords.cs.{${t}}`).join(",")
    );
  }

  const { data, error } = await q;
  if (error) {
    console.error("Knowledge base search error:", error);
    return [];
  }

  return (data ?? []) as unknown as KnowledgeArticle[];
}

export async function getArticleBySlug(
  slug: string
): Promise<KnowledgeArticle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_articles")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) return null;
  return data as unknown as KnowledgeArticle;
}

export async function getArticleEvaluations(
  articleId: string
): Promise<EvaluationQuestion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_evaluations")
    .select("*")
    .eq("article_id", articleId);

  if (error) return [];
  return (data ?? []) as unknown as EvaluationQuestion[];
}

export function shouldEscalate(article: KnowledgeArticle): boolean {
  return (
    article.requires_professional_review ||
    article.risk_level === "VERY_HIGH" ||
    article.confidence === "LOW"
  );
}

export function getRiskLabel(level: RiskLevel): string {
  switch (level) {
    case "LOW":
      return "Lav risiko";
    case "MEDIUM":
      return "Middels risiko";
    case "HIGH":
      return "Høy risiko";
    case "VERY_HIGH":
      return "Meget høy risiko — bør kontrolleres av fagperson";
  }
}
