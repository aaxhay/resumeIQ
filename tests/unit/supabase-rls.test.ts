import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Real embedded PostgreSQL executes the production migration and RLS. Only auth's
// users/claims functions and API roles are stand-ins: NOT a live Supabase Auth test.
// No network, database URL, hosted credentials, Docker, CLI, or pg_cron required.
const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
const analysis = {
  version: 1,
  assessment: "Synthetic summary.",
  priorities: Array.from({ length: 3 }, (_, index) => ({ title: `Priority ${index}`, recommendation: "Review this synthetic item." })),
  strengths: [{ title: "Clarity", explanation: "Synthetic explanation." }],
  limitations: ["Synthetic test, not hiring advice."],
};
const suggestion = {
  finding_id: "finding-1",
  original_text: "Synthetic original bullet.",
  suggested_text: "Synthetic revised bullet.",
  status: "pending",
};
let db: PGlite;

async function role(name: "anon" | "authenticated" | "service_role", user: string | null = alice, anonymous = false) {
  await db.exec(`reset role; set role ${name};`);
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: user, role: name, is_anonymous: anonymous })]);
}
async function save(id = randomUUID(), result: unknown = analysis, suggestions: unknown = [suggestion], mode = "general", filename: string | null = "synthetic.txt") {
  return db.query<{ id: string }>("select public.save_resume_review($1::uuid,$2,$3,$4::jsonb,$5::jsonb) as id", [id, mode, filename, JSON.stringify(result), JSON.stringify(suggestions)]);
}
async function count(table: "profiles" | "resume_reviews" | "resume_suggestions") {
  const result = await db.query<{ count: number }>(`select count(*)::integer as count from public.${table}`);
  return result.rows[0]?.count;
}
async function directReview(id = randomUUID(), owner = alice) {
  return db.query("insert into public.resume_reviews(id,user_id,review_mode,analysis_result) values ($1,$2,'general',$3::jsonb)", [id, owner, JSON.stringify(analysis)]);
}
async function directSuggestion(review: string, finding = "finding-direct") {
  return db.query("insert into public.resume_suggestions(review_id,finding_id,original_text,suggested_text,status) values ($1,$2,'original','suggested','accepted')", [review, finding]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
    create role authenticated nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
    create role service_role nologin nosuperuser nocreatedb nocreaterole noinherit bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
    $$;
    create function auth.uid() returns uuid language sql stable as $$
      select (auth.jwt() ->> 'sub')::uuid;
    $$;
    revoke all on auth.users from public, anon, authenticated, service_role;
    grant usage on schema auth, public to anon, authenticated, service_role;
    revoke create on schema public from public;
    grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
    -- Model Supabase's broad default object privileges; migration must override them.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  await db.exec(await readFile(new URL("../../supabase/migrations/202611060001_saved_review_snapshots.sql", import.meta.url), "utf8"));
}, 30_000);

beforeEach(async () => {
  await db.exec("reset role; truncate auth.users cascade;");
  await db.query("insert into auth.users(id) values ($1),($2)", [alice, bob]);
  await role("authenticated");
});
afterAll(async () => { await db?.close(); });

describe("saved summaries: real embedded PostgreSQL RLS", () => {
  it("runs with non-superuser API roles, forced RLS, invoker save and definer cleanup", async () => {
    const current = await db.query<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>("select current_user, rolsuper, rolbypassrls from pg_roles where rolname = current_user");
    expect(current.rows).toEqual([{ current_user: "authenticated", rolsuper: false, rolbypassrls: false }]);
    const tables = await db.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>("select relrowsecurity, relforcerowsecurity from pg_class where oid in ('public.profiles'::regclass,'public.resume_reviews'::regclass,'public.resume_suggestions'::regclass)");
    expect(tables.rows).toHaveLength(3);
    expect(tables.rows.every((table) => table.relrowsecurity && table.relforcerowsecurity)).toBe(true);
    const funcs = await db.query<{ proname: string; prosecdef: boolean; proconfig: string[] }>("select proname,prosecdef,proconfig from pg_proc where proname in ('save_resume_review','delete_expired_resume_reviews') order by proname");
    expect(funcs.rows.map(({ proname, prosecdef }) => ({ proname, prosecdef }))).toEqual([
      { proname: "delete_expired_resume_reviews", prosecdef: true }, { proname: "save_resume_review", prosecdef: false },
    ]);
    expect(funcs.rows.every((fn) => fn.proconfig.some((entry) => entry.startsWith("search_path=")))).toBe(true);
  });

  it("saves own profile, projected review and all snapshot statuses; allows own deletion", async () => {
    const id = randomUUID();
    const suggestions = ["pending", "accepted", "rejected", "manually_edited"].map((status, index) => ({ ...suggestion, finding_id: `finding-${index}`, status }));
    expect((await save(id, analysis, suggestions, "job-specific", null)).rows).toEqual([{ id }]);
    expect(await count("profiles")).toBe(1);
    expect(await count("resume_reviews")).toBe(1);
    expect(await count("resume_suggestions")).toBe(4);
    const reviews = await db.query<{ user_id: string; created_at: Date }>("select user_id,created_at from public.resume_reviews");
    expect(reviews.rows[0]?.user_id).toBe(alice);
    expect(reviews.rows[0]?.created_at).toBeTruthy();
    await db.query("delete from public.resume_suggestions where finding_id = 'finding-0'");
    expect(await count("resume_suggestions")).toBe(3);
    await db.query("delete from public.resume_reviews where id = $1", [id]);
    expect(await count("resume_reviews")).toBe(0);
    expect(await count("resume_suggestions")).toBe(0);
  });

  it("hides cross-user parents/children and prevents forged owners and child inserts", async () => {
    const id = randomUUID();
    await save(id);
    await role("authenticated", bob);
    expect(await count("profiles")).toBe(0);
    expect(await count("resume_reviews")).toBe(0);
    expect(await count("resume_suggestions")).toBe(0);
    await expect(db.query("insert into public.profiles(id) values ($1)", [alice])).rejects.toMatchObject({ code: "42501" });
    await expect(directReview(randomUUID(), alice)).rejects.toMatchObject({ code: "42501" });
    await expect(directSuggestion(id)).rejects.toMatchObject({ code: "42501" });
    await db.query("delete from public.resume_suggestions where review_id = $1", [id]);
    await db.query("delete from public.resume_reviews where id = $1", [id]);
    await db.query("delete from public.profiles where id = $1", [alice]);
    await role("authenticated", alice);
    expect(await count("resume_reviews")).toBe(1);
    expect(await count("resume_suggestions")).toBe(1);
  });

  it("rejects anon table reads/writes/deletes and the save RPC even with a forged subject", async () => {
    await save();
    await role("anon", alice);
    for (const table of ["profiles", "resume_reviews", "resume_suggestions"] as const) {
      await expect(count(table)).rejects.toMatchObject({ code: "42501" });
      await expect(db.exec(`delete from public.${table}`)).rejects.toMatchObject({ code: "42501" });
    }
    await expect(db.query("insert into public.profiles(id) values ($1)", [alice])).rejects.toMatchObject({ code: "42501" });
    await expect(directReview()).rejects.toMatchObject({ code: "42501" });
    await expect(directSuggestion(randomUUID())).rejects.toMatchObject({ code: "42501" });
    await expect(save()).rejects.toMatchObject({ code: "42501" });
  });

  it.each([{ user: null, anonymous: false }, { user: alice, anonymous: true }])("denies unauthenticated/anonymous identities: %j", async ({ user, anonymous }) => {
    const id = randomUUID();
    await save(id);
    await role("authenticated", user, anonymous);
    for (const table of ["profiles", "resume_reviews", "resume_suggestions"] as const) {
      expect(await count(table)).toBe(0);
      await db.exec(`delete from public.${table}`);
    }
    await expect(save()).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("insert into public.profiles(id) values ($1)", [bob])).rejects.toMatchObject({ code: "42501" });
    await expect(directReview()).rejects.toMatchObject({ code: "42501" });
    await expect(directSuggestion(id)).rejects.toMatchObject({ code: "42501" });
    await role("authenticated");
    expect(await count("resume_reviews")).toBe(1);
    expect(await count("resume_suggestions")).toBe(1);
  });

  it("denies every snapshot UPDATE and timestamp forgery on every table", async () => {
    const id = randomUUID();
    await save(id);
    for (const statement of [
      "update public.profiles set created_at = now()",
      `update public.profiles set id = '${bob}'`,
      "update public.resume_reviews set created_at = now()",
      `update public.resume_reviews set user_id = '${bob}'`,
      "update public.resume_reviews set review_mode = 'job-specific'",
      "update public.resume_reviews set analysis_result = '{}'::jsonb",
      "update public.resume_suggestions set status = 'accepted'",
      "update public.resume_suggestions set suggested_text = 'changed'",
      "update public.resume_suggestions set created_at = now()",
      `update public.resume_suggestions set review_id = '${randomUUID()}'`,
    ]) await expect(db.exec(statement)).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("insert into public.profiles(id,created_at) values ($1,now())", [bob])).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("insert into public.resume_reviews(user_id,review_mode,analysis_result,created_at) values ($1,'general',$2::jsonb,now() + interval '1 year')", [alice, JSON.stringify(analysis)])).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("insert into public.resume_suggestions(review_id,finding_id,original_text,suggested_text,status,created_at) values ($1,'new','old','new','pending',now())", [id])).rejects.toMatchObject({ code: "42501" });
  });

  it("idempotently returns an owned id without mutating its snapshot; foreign ids fail", async () => {
    const id = randomUUID();
    await save(id);
    expect((await save(id, { ...analysis, assessment: "Changed" }, [])).rows).toEqual([{ id }]);
    const persisted = await db.query<{ analysis_result: unknown }>("select analysis_result from public.resume_reviews where id = $1", [id]);
    expect(persisted.rows[0]?.analysis_result).toEqual(analysis);
    expect(await count("resume_suggestions")).toBe(1);
    await role("authenticated", bob);
    await expect(save(id)).rejects.toMatchObject({ code: "23505" });
    expect(await count("profiles")).toBe(0); // failed RPC rolls back newly created profile too
  });

  const invalidAnalyses: [string, unknown][] = [
    ["null", null], ["scalar", "summary"], ["empty", {}],
    ["extra root key", { ...analysis, raw_resume: "not allowed" }],
    ["wrong version", { ...analysis, version: 2 }],
    ["string version", { ...analysis, version: "1" }],
    ["null assessment", { ...analysis, assessment: null }],
    ["empty assessment", { ...analysis, assessment: "" }],
    ["long assessment", { ...analysis, assessment: "a".repeat(1201) }],
    ["missing assessment", { version: 1, priorities: analysis.priorities, strengths: analysis.strengths, limitations: analysis.limitations }],
    ["wrong priorities shape", { ...analysis, priorities: {} }],
    ["two priorities", { ...analysis, priorities: analysis.priorities.slice(0, 2) }],
    ["extra priority key", { ...analysis, priorities: analysis.priorities.map((item) => ({ ...item, api_key: "forbidden" })) }],
    ["scalar priority", { ...analysis, priorities: ["bad", ...analysis.priorities.slice(1)] }],
    ["long priority title", { ...analysis, priorities: analysis.priorities.map((item) => ({ ...item, title: "a".repeat(501) })) }],
    ["long recommendation", { ...analysis, priorities: analysis.priorities.map((item) => ({ ...item, recommendation: "a".repeat(1201) })) }],
    ["zero strengths", { ...analysis, strengths: [] }],
    ["six strengths", { ...analysis, strengths: Array(6).fill(analysis.strengths[0]) }],
    ["extra strength key", { ...analysis, strengths: [{ ...analysis.strengths[0], job_description: "forbidden" }] }],
    ["missing strength explanation", { ...analysis, strengths: [{ title: "Title" }] }],
    ["long explanation", { ...analysis, strengths: [{ title: "Title", explanation: "a".repeat(1201) }] }],
    ["zero limitations", { ...analysis, limitations: [] }],
    ["six limitations", { ...analysis, limitations: Array(6).fill("limitation") }],
    ["nonstrings in limitations", { ...analysis, limitations: [1] }],
    ["long limitation", { ...analysis, limitations: ["a".repeat(501)] }],
    ["whitespace text", { ...analysis, limitations: ["   "] }],
    ["bounded characters but oversized UTF-8 JSON", {
      version: 1, assessment: "界".repeat(1200),
      priorities: Array.from({ length: 3 }, () => ({ title: "界".repeat(500), recommendation: "界".repeat(1200) })),
      strengths: Array.from({ length: 5 }, () => ({ title: "界".repeat(500), explanation: "界".repeat(1200) })),
      limitations: Array(5).fill("界".repeat(500)),
    }],
  ];
  it.each(invalidAnalyses)("rejects malformed analysis: %s", async (_label, value) => {
    await expect(save(randomUUID(), value)).rejects.toMatchObject({ code: "23514" });
    expect(await count("profiles")).toBe(0);
    expect(await count("resume_reviews")).toBe(0);
    expect(await count("resume_suggestions")).toBe(0);
  });

  it.each([
    ["nonarray", {}], ["null", null], ["scalar item", ["bad"]],
    ["extra key", [{ ...suggestion, raw_resume: "forbidden" }]],
    ["missing key", [{ finding_id: "finding-1", original_text: "original", status: "pending" }]],
    ["number text", [{ ...suggestion, original_text: 123 }]],
    ["empty text", [{ ...suggestion, suggested_text: "" }]],
    ["long text", [{ ...suggestion, suggested_text: "a".repeat(2501) }]],
    ["bad finding id", [{ ...suggestion, finding_id: "NOT VALID" }]],
    ["long finding id", [{ ...suggestion, finding_id: "a".repeat(61) }]],
    ["bad status", [{ ...suggestion, status: "edited" }]],
    ["duplicate findings", [suggestion, suggestion]],
    ["thirteen suggestions", Array.from({ length: 13 }, (_, index) => ({ ...suggestion, finding_id: `finding-${index}` }))],
  ])("rejects malformed suggestion input and atomically rolls back: %s", async (_label, value) => {
    await expect(save(randomUUID(), analysis, value)).rejects.toBeDefined();
    expect(await count("profiles")).toBe(0);
    expect(await count("resume_reviews")).toBe(0);
    expect(await count("resume_suggestions")).toBe(0);
  });

  it("rolls back review and earlier children when a later child fails", async () => {
    await expect(save(randomUUID(), analysis, [suggestion, { ...suggestion, finding_id: "bad id" }])).rejects.toMatchObject({ code: "23514" });
    expect(await count("profiles")).toBe(0);
    expect(await count("resume_reviews")).toBe(0);
    expect(await count("resume_suggestions")).toBe(0);
  });

  it("validates direct inserts, modes, filenames, and database limits outside the RPC", async () => {
    await db.query("insert into public.profiles(id) values ($1)", [alice]);
    await expect(db.query("insert into public.resume_reviews(user_id,review_mode,analysis_result) values ($1,'general','{}'::jsonb)", [alice])).rejects.toMatchObject({ code: "23514" });
    await expect(save(randomUUID(), analysis, [], "other")).rejects.toMatchObject({ code: "23514" });
    for (const filename of ["x".repeat(161), "bad\nname", "bad\tname", ""]) {
      await expect(save(randomUUID(), analysis, [], "general", filename)).rejects.toMatchObject({ code: "23514" });
    }
    const id = randomUUID();
    await directReview(id);
    for (let index = 0; index < 12; index++) await directSuggestion(id, `finding-${index}`);
    await expect(directSuggestion(id, "overflow")).rejects.toMatchObject({ code: "23514" });
    for (let index = 1; index < 20; index++) await directReview();
    await expect(directReview()).rejects.toMatchObject({ code: "23514" });
    await expect(save()).rejects.toMatchObject({ code: "23514" });
    expect((await save(id)).rows).toEqual([{ id }]); // retries still work at the cap
    expect(await count("resume_reviews")).toBe(20);
    await role("authenticated", bob);
    await save(); // cap is per owner, not global
    expect(await count("resume_reviews")).toBe(1);
  });

  it("hides expired reviews/children and prevents child inserts or expired id reuse", async () => {
    const expired = randomUUID();
    const fresh = randomUUID();
    await save(expired);
    await save(fresh);
    await db.exec("reset role");
    await db.query("update public.resume_reviews set created_at = now() - interval '31 days' where id = $1", [expired]);
    await role("authenticated");
    expect(await count("resume_reviews")).toBe(1);
    expect(await count("resume_suggestions")).toBe(1);
    await expect(directSuggestion(expired)).rejects.toMatchObject({ code: "42501" });
    await expect(save(expired)).rejects.toMatchObject({ code: "23505" });
    await db.query("delete from public.resume_reviews where id = $1", [expired]);
    await db.exec("reset role");
    expect(await count("resume_reviews")).toBe(2);
    await role("service_role", null);
    const cleanup = await db.query<{ deleted: number }>("select public.delete_expired_resume_reviews()::integer as deleted");
    expect(cleanup.rows).toEqual([{ deleted: 1 }]);
    await db.exec("reset role");
    expect(await count("resume_reviews")).toBe(1);
    expect(await count("resume_suggestions")).toBe(1);
  });

  it("uses an inclusive 30-day cleanup boundary and expired reviews do not consume capacity", async () => {
    await save();
    await db.exec("reset role; begin; update public.resume_reviews set created_at = now() - interval '30 days'; set role authenticated;");
    try {
      expect(await count("resume_reviews")).toBe(0);
      expect(await count("resume_suggestions")).toBe(0);
      for (let index = 0; index < 20; index++) await directReview();
      await db.exec("reset role; set role service_role;");
      const cleanup = await db.query<{ deleted: number }>("select public.delete_expired_resume_reviews()::integer as deleted");
      expect(cleanup.rows).toEqual([{ deleted: 1 }]);
      await db.exec("commit;");
    } catch (error) {
      await db.exec("rollback;");
      throw error;
    }
    await db.exec("reset role");
    expect(await count("resume_reviews")).toBe(20);
    expect(await count("resume_suggestions")).toBe(0);
  });

  it.each(["profile", "auth user"])("cascades both fresh and expired data on %s deletion", async (target) => {
    await save();
    const expired = randomUUID();
    await save(expired);
    await db.exec("reset role");
    await db.query("update public.resume_reviews set created_at = now() - interval '31 days' where id = $1", [expired]);
    await role("authenticated", bob);
    await save();
    if (target === "profile") {
      await role("authenticated", alice);
      await db.query("delete from public.profiles where id = $1", [alice]);
    } else {
      await db.exec("reset role");
      await db.query("delete from auth.users where id = $1", [alice]);
    }
    await db.exec("reset role");
    expect(await count("profiles")).toBe(1);
    expect(await count("resume_reviews")).toBe(1);
    expect(await count("resume_suggestions")).toBe(1);
    const survivors = await db.query<{ user_id: string }>("select user_id from public.resume_reviews");
    expect(survivors.rows).toEqual([{ user_id: bob }]);
  });

  it("restricts cleanup execution to postgres/service_role, not API clients or PUBLIC", async () => {
    await expect(db.query("select public.delete_expired_resume_reviews()")).rejects.toMatchObject({ code: "42501" });
    await role("anon", null);
    await expect(db.query("select public.delete_expired_resume_reviews()")).rejects.toMatchObject({ code: "42501" });
    await db.exec("reset role");
    const permissions = await db.query<{ role: string; save: boolean; cleanup: boolean }>(`
      select r as role,
        has_function_privilege(r,'public.save_resume_review(uuid,text,text,jsonb,jsonb)','execute') as save,
        has_function_privilege(r,'public.delete_expired_resume_reviews()','execute') as cleanup
      from unnest(array['anon','authenticated','service_role','postgres']) r
    `);
    expect(permissions.rows).toEqual([
      { role: "anon", save: false, cleanup: false },
      { role: "authenticated", save: true, cleanup: false },
      { role: "service_role", save: false, cleanup: true },
      { role: "postgres", save: true, cleanup: true },
    ]);
    const publicExecute = await db.query<{ count: number }>(`
      select count(*)::integer as count from pg_proc p,
        lateral aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) acl
      where p.pronamespace = 'public'::regnamespace
        and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
        and p.proname in ('save_resume_review','delete_expired_resume_reviews')
    `);
    expect(publicExecute.rows).toEqual([{ count: 0 }]);
    await db.query("select public.delete_expired_resume_reviews()");
  });
});
