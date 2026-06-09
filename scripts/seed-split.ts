/**
 * Splits the HR Policy Manual into one signable document per policy and seeds
 * them into the shared ClockBays Supabase DB. Replaces the single combined
 * "hr-policy-manual" document (removed if present — cascades versions/signatures).
 *
 * Uses the SERVICE-ROLE key (bypasses RLS) — run locally only.
 *
 *   Env (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   Usage:
 *     npm run seed:split
 *     npm run seed:split -- --org <org_uuid>     # if the DB has >1 org
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const FILE = "./Typhoon_Electronics_HR_Policy_Manual_v1.md";
const VERSION = "1.0";
const EFFECTIVE = "2026-06-01";
const OLD_COMBINED_SLUG = "hr-policy-manual";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function contentHash(md: string): string {
  return createHash("sha256")
    .update(md.replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");
}

// Split on level-1 ATX headings ("# ", not "## "). Returns sections in order.
function splitLevel1(md: string): { heading: string; content: string }[] {
  const parts = md.replace(/\r\n/g, "\n").split(/\n(?=# )/);
  return parts.map((content) => {
    const firstLine = content.split("\n", 1)[0] ?? "";
    return { heading: firstLine, content: content.trim() };
  });
}

// Ordered document definitions. `match` predicates select level-1 sections
// (by heading text) and concatenate them in listed order.
const DOCUMENTS: {
  title: string;
  slug: string;
  match: ((h: string) => boolean)[];
}[] = [
  {
    title: "Preamble, Scope & Definitions",
    slug: "preamble-scope-definitions",
    match: [
      (h) => h.includes("TYPHOON ELECTRONICS"),
      (h) => h.includes("DOCUMENT CONTROL"),
      (h) => h.includes("ITEMS PENDING FINALISATION"),
    ],
  },
  {
    title: "Attendance & Leave Policy",
    slug: "attendance-leave",
    match: [(h) => h.includes("POLICY 1"), (h) => h.includes("ANNEXURE A")],
  },
  { title: "Travel Policy", slug: "travel", match: [(h) => h.includes("POLICY 2")] },
  {
    title: "Dress Code Policy",
    slug: "dress-code",
    match: [(h) => h.includes("POLICY 3")],
  },
  {
    title: "Code of Conduct",
    slug: "code-of-conduct",
    match: [(h) => h.includes("POLICY 4")],
  },
  {
    title: "Equal Opportunity & Anti-Discrimination Policy",
    slug: "equal-opportunity",
    match: [(h) => h.includes("POLICY 5")],
  },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }

  const md = readFileSync(resolve(FILE), "utf8");
  const sections = splitLevel1(md);

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Resolve org.
  let orgId = arg("org");
  if (!orgId) {
    const { data: orgs, error } = await db
      .from("organizations")
      .select("id, name");
    if (error) throw error;
    if (!orgs?.length) throw new Error("No organizations found.");
    if (orgs.length > 1) {
      throw new Error(
        "Multiple orgs — pass --org <uuid>:\n" +
          orgs.map((o) => `  ${o.id}  ${o.name}`).join("\n")
      );
    }
    orgId = orgs[0].id;
    console.log(`Using org ${orgId} (${orgs[0].name})`);
  }

  // Remove the old combined document (cascades versions + signatures).
  const { data: oldDoc } = await db
    .from("policy_documents")
    .select("id")
    .eq("org_id", orgId)
    .eq("slug", OLD_COMBINED_SLUG)
    .maybeSingle();
  if (oldDoc) {
    await db.from("policy_documents").delete().eq("id", oldDoc.id);
    console.log(`Removed combined document "${OLD_COMBINED_SLUG}"`);
  }

  for (const def of DOCUMENTS) {
    const content = def.match
      .map((pred) => sections.find((s) => pred(s.heading))?.content ?? "")
      .filter(Boolean)
      .join("\n\n");

    if (!content) {
      console.warn(`!! No content matched for "${def.title}" — skipping`);
      continue;
    }
    const hash = contentHash(content);

    // Upsert document by (org_id, slug).
    let documentId: string;
    const { data: existingDoc } = await db
      .from("policy_documents")
      .select("id")
      .eq("org_id", orgId)
      .eq("slug", def.slug)
      .maybeSingle();
    if (existingDoc) {
      documentId = existingDoc.id;
    } else {
      const { data, error } = await db
        .from("policy_documents")
        .insert({ org_id: orgId, title: def.title, slug: def.slug })
        .select("id")
        .single();
      if (error) throw error;
      documentId = data.id;
    }

    // Upsert version 1.0.
    let versionId: string;
    const { data: existingVersion } = await db
      .from("policy_versions")
      .select("id")
      .eq("document_id", documentId)
      .eq("version_label", VERSION)
      .maybeSingle();
    const versionFields = {
      content_md: content,
      content_hash: hash,
      change_summary: "Initial publication",
      effective_date: EFFECTIVE,
      status: "published" as const,
      published_at: new Date().toISOString(),
    };
    if (existingVersion) {
      versionId = existingVersion.id;
      const { error } = await db
        .from("policy_versions")
        .update(versionFields)
        .eq("id", versionId);
      if (error) throw error;
    } else {
      const { data, error } = await db
        .from("policy_versions")
        .insert({
          document_id: documentId,
          org_id: orgId,
          version_label: VERSION,
          requires_resign: true,
          ...versionFields,
        })
        .select("id")
        .single();
      if (error) throw error;
      versionId = data.id;
    }

    await db
      .from("policy_documents")
      .update({ current_version_id: versionId })
      .eq("id", documentId);

    console.log(`✓ ${def.title}  (${def.slug})  ${content.length} chars`);
  }

  console.log(`\n✅ Seeded ${DOCUMENTS.length} policy documents`);
}

main().catch((err) => {
  console.error("Split seed failed:", err.message ?? err);
  process.exit(1);
});
