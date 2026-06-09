/**
 * One-time seed: imports a markdown file as a policy document + its first
 * published version into the shared ClockBays Supabase DB.
 *
 * Uses the SERVICE-ROLE key (bypasses RLS) — run locally, never in the browser.
 * Idempotent: re-running updates the v1.0 content in place rather than duplicating.
 *
 *   Env (from .env.local):
 *     NEXT_PUBLIC_SUPABASE_URL
 *     SUPABASE_SERVICE_ROLE_KEY
 *
 *   Usage:
 *     npm run seed
 *     npm run seed -- --file ./Some_Doc.md --title "Travel Policy" --slug travel --version 1.0
 *     npm run seed -- --org <org_uuid>     # if the DB has more than one org
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function contentHash(markdown: string): string {
  return createHash("sha256")
    .update(markdown.replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }

  const filePath = arg("file", "./Typhoon_Electronics_HR_Policy_Manual_v1.md")!;
  const title = arg("title", "HR Policy Manual")!;
  const slug = arg("slug", "hr-policy-manual")!;
  const versionLabel = arg("version", "1.0")!;
  const effectiveDate = arg("effective", "2026-06-01")!;
  let orgId = arg("org");

  const contentMd = readFileSync(resolve(filePath), "utf8");
  const hash = contentHash(contentMd);

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  // Resolve the org.
  if (!orgId) {
    const { data: orgs, error } = await db
      .from("organizations")
      .select("id, name");
    if (error) throw error;
    if (!orgs || orgs.length === 0) {
      throw new Error("No organizations found in the DB.");
    }
    if (orgs.length > 1) {
      throw new Error(
        `Multiple orgs found — pass --org <uuid>:\n` +
          orgs.map((o) => `  ${o.id}  ${o.name}`).join("\n")
      );
    }
    orgId = orgs[0].id;
    console.log(`Using org ${orgId} (${orgs[0].name})`);
  }

  // Upsert document by (org_id, slug).
  const { data: existingDoc } = await db
    .from("policy_documents")
    .select("id, current_version_id")
    .eq("org_id", orgId)
    .eq("slug", slug)
    .maybeSingle();

  let documentId: string;
  if (existingDoc) {
    documentId = existingDoc.id;
    console.log(`Document exists: ${documentId}`);
  } else {
    const { data, error } = await db
      .from("policy_documents")
      .insert({ org_id: orgId, title, slug })
      .select("id")
      .single();
    if (error) throw error;
    documentId = data.id;
    console.log(`Created document: ${documentId}`);
  }

  // Upsert the version by (document_id, version_label).
  const { data: existingVersion } = await db
    .from("policy_versions")
    .select("id")
    .eq("document_id", documentId)
    .eq("version_label", versionLabel)
    .maybeSingle();

  let versionId: string;
  if (existingVersion) {
    versionId = existingVersion.id;
    const { error } = await db
      .from("policy_versions")
      .update({
        content_md: contentMd,
        content_hash: hash,
        change_summary: "Initial publication",
        effective_date: effectiveDate,
        status: "published",
        published_at: new Date().toISOString(),
      })
      .eq("id", versionId);
    if (error) throw error;
    console.log(`Updated version ${versionLabel}: ${versionId}`);
  } else {
    const { data, error } = await db
      .from("policy_versions")
      .insert({
        document_id: documentId,
        org_id: orgId,
        version_label: versionLabel,
        change_summary: "Initial publication",
        content_md: contentMd,
        content_hash: hash,
        effective_date: effectiveDate,
        requires_resign: true,
        status: "published",
        published_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    versionId = data.id;
    console.log(`Created version ${versionLabel}: ${versionId}`);
  }

  // Point the document at this version.
  const { error: updErr } = await db
    .from("policy_documents")
    .update({ current_version_id: versionId })
    .eq("id", documentId);
  if (updErr) throw updErr;

  console.log(`\n✅ Seeded "${title}" v${versionLabel}`);
  console.log(`   document_id = ${documentId}`);
  console.log(`   hash        = ${hash}`);
}

main().catch((err) => {
  console.error("Seed failed:", err.message ?? err);
  process.exit(1);
});
