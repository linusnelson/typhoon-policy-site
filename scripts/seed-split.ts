/**
 * Seeds the signable policy documents from the curated, self-contained markdown
 * files in ./policies/ — one file per document — into the shared ClockBays DB.
 * Each file already includes its own header, Preamble, Scope, Definitions,
 * clauses, and Document Control, so it is stored verbatim.
 *
 * Removes obsolete documents from earlier seeding approaches. Uses the
 * SERVICE-ROLE key (bypasses RLS) — run locally only.
 *
 *   Env (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   Usage: npm run seed   (alias of seed:split)  [-- --org <uuid>]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const POLICIES_DIR = "./policies";
const VERSION = "1.0";
// All six documents take effect from the start of FY 2026-27 (1 Apr 2026 –
// 31 Mar 2027), the period they govern. Keep in step with the "Effective Date"
// row in each markdown file's document control table.
const EFFECTIVE = "2026-04-01";
const OBSOLETE_SLUGS = ["hr-policy-manual", "preamble-scope-definitions"];

// One document per file. Slugs are stable so re-seeding updates in place
// (and keeps existing signatures/version rows attached to the same document).
// `effective` overrides the default EFFECTIVE date for later-issued policies.
const DOCS: { file: string; title: string; slug: string; effective?: string }[] = [
  {
    file: "Typhoon_Electronics_Attendance_and_Leave_Policy.md",
    title: "Attendance & Leave Policy",
    slug: "attendance-leave",
  },
  {
    file: "Typhoon_Electronics_Travel_Policy.md",
    title: "Travel Policy",
    slug: "travel",
  },
  {
    file: "Typhoon_Electronics_Dress_Code_Policy.md",
    title: "Dress Code Policy",
    slug: "dress-code",
  },
  {
    file: "Typhoon_Electronics_Code_of_Conduct.md",
    title: "Code of Conduct",
    slug: "code-of-conduct",
  },
  {
    file: "Typhoon_Electronics_Equal_Opportunity_Policy.md",
    title: "Equal Opportunity & Anti-Discrimination Policy",
    slug: "equal-opportunity",
  },
  {
    // Renamed from "Employee Advance Policy" — the slug stays stable so the
    // existing draft version updates in place.
    file: "Typhoon_Electronics_Employee_Loans_and_Advances_Policy.md",
    title: "Employee Loans & Advances Policy",
    slug: "employee-advance",
  },
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function contentHash(md: string): string {
  return createHash("sha256")
    .update(md.replace(/\r\n/g, "\n"), "utf8")
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

  // Remove obsolete documents from prior seeding approaches.
  for (const slug of OBSOLETE_SLUGS) {
    const { data } = await db
      .from("policy_documents")
      .select("id")
      .eq("org_id", orgId)
      .eq("slug", slug)
      .maybeSingle();
    if (data) {
      await db.from("policy_documents").delete().eq("id", data.id);
      console.log(`Removed obsolete document "${slug}"`);
    }
  }

  for (const def of DOCS) {
    const content = readFileSync(
      resolve(POLICIES_DIR, def.file),
      "utf8"
    ).trim();
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
      // Keep the stored title in sync.
      await db
        .from("policy_documents")
        .update({ title: def.title })
        .eq("id", documentId);
    } else {
      const { data, error } = await db
        .from("policy_documents")
        .insert({ org_id: orgId, title: def.title, slug: def.slug })
        .select("id")
        .single();
      if (error) throw error;
      documentId = data.id;
    }

    // Upsert version 1.0 as a DRAFT — publication is an explicit admin action
    // in the portal (Admin → Policies → document → Publish). The seed never
    // publishes and never touches current_version_id.
    //
    // If the version was already published by an admin, its content is left
    // untouched: updating a published version would change its content_hash
    // and orphan every signature bound to it.
    const versionFields = {
      content_md: content,
      content_hash: hash,
      change_summary: "Initial draft (seeded)",
      effective_date: def.effective ?? EFFECTIVE,
      status: "draft" as const,
      published_at: null,
    };
    const { data: existingVersion } = await db
      .from("policy_versions")
      .select("id, status, content_hash")
      .eq("document_id", documentId)
      .eq("version_label", VERSION)
      .maybeSingle();
    if (existingVersion) {
      if (existingVersion.status !== "draft") {
        const changed = existingVersion.content_hash !== hash;
        console.log(
          `↷ ${def.title.padEnd(48)} (${def.slug})  v${VERSION} is ${existingVersion.status} — left untouched` +
            (changed ? " ⚠ local file differs; publish a new version instead" : "")
        );
        continue;
      }
      const { error } = await db
        .from("policy_versions")
        .update(versionFields)
        .eq("id", existingVersion.id);
      if (error) throw error;
    } else {
      const { error } = await db.from("policy_versions").insert({
        document_id: documentId,
        org_id: orgId,
        version_label: VERSION,
        requires_resign: true,
        ...versionFields,
      });
      if (error) throw error;
    }

    console.log(`✓ ${def.title.padEnd(48)} (${def.slug})  ${content.length} chars (draft)`);
  }

  console.log(`\n✅ Seeded ${DOCS.length} policy documents from ${POLICIES_DIR}/`);
}

main().catch((err) => {
  console.error("Seed failed:", err.message ?? err);
  process.exit(1);
});
