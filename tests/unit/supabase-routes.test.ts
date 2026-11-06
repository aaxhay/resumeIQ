import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseConfiguration } from "@/lib/config/supabase";
import { reviewSummary, saveReviewRequestSchema, savedAnalysisSchema } from "@/lib/saved-reviews/contracts";
import { validAiReview } from "../fixtures/ai-review";

vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => {
  const auth = { getUser: vi.fn(), signInWithPassword: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), exchangeCodeForSession: vi.fn() };
  const query = { select: vi.fn(), delete: vi.fn(), eq: vi.fn(), gt: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn() };
  const client = { auth, from: vi.fn(), rpc: vi.fn() };
  const set = vi.fn();
  const create = vi.fn<(url: string, key: string, options: { cookies: { getAll: () => unknown; setAll: (values: { name: string; value: string; options: Record<string, unknown> }[]) => void }; global: { fetch: typeof fetch } }) => typeof client>();
  return { auth, query, client, create, set };
});
vi.mock("@supabase/ssr", () => ({ createServerClient: mock.create }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [{ name: "session", value: "test-cookie" }], set: mock.set }) }));
const id = "11111111-1111-4111-8111-111111111111";
const user = { id: "22222222-2222-4222-8222-222222222222", email: "fictional@example.test", email_confirmed_at: "2026-11-06T00:00:00Z", is_anonymous: false };
const publicKey = "sb_publishable_syntheticOnly123456789";
const config = { NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey };
const payload = () => ({ id, consent: true, review_mode: "general", resume_filename: null, ...reviewSummary(validAiReview()) });
const record = () => ({ id, review_mode: "general", resume_filename: null, analysis_result: payload().analysis_result, created_at: new Date().toISOString(), resume_suggestions: [] });
const request = (path: string, body: unknown, method = "POST", origin = "http://localhost:3100") => new Request(`http://localhost:3100${path}`, { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
let account: typeof import("@/app/api/account/route");
let history: typeof import("@/app/api/review-history/route");
let deletion: typeof import("@/app/api/review-history/[id]/route");
let callback: typeof import("@/app/auth/callback/route");

beforeEach(async () => {
  vi.resetModules(); vi.resetAllMocks();
  for (const [key, value] of Object.entries(config)) vi.stubEnv(key, value);
  vi.stubEnv("SUPABASE_HISTORY_ENABLED", "true");
  mock.create.mockReturnValue(mock.client);
  mock.auth.getUser.mockResolvedValue({ data: { user }, error: null });
  mock.auth.signInWithPassword.mockResolvedValue({ data: { user, session: { access_token: "synthetic" } }, error: null });
  mock.auth.signUp.mockResolvedValue({ data: { user, session: null }, error: null });
  mock.auth.signOut.mockResolvedValue({ error: null });
  mock.auth.exchangeCodeForSession.mockResolvedValue({ error: null });
  mock.client.from.mockReturnValue(mock.query);
  for (const method of ["select", "delete", "eq", "gt", "order"] as const) mock.query[method].mockReturnValue(mock.query);
  mock.query.limit.mockResolvedValue({ data: [record()], error: null });
  mock.query.maybeSingle.mockResolvedValue({ data: { id }, error: null });
  mock.client.rpc.mockResolvedValue({ data: id, error: null });
  account = await import("@/app/api/account/route");
  history = await import("@/app/api/review-history/route");
  deletion = await import("@/app/api/review-history/[id]/route");
  callback = await import("@/app/auth/callback/route");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function failure(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
  const body: unknown = await response.json();
  expect(body).toMatchObject({ ok: false, error: { code } });
  expect(JSON.stringify(body)).not.toContain("PRIVATE_DETAIL");
}

describe("optional Supabase configuration and projection", () => {
  it("defaults persistence off and requires only a valid publishable key", () => {
    expect(supabaseConfiguration(config)).toEqual({ url: config.NEXT_PUBLIC_SUPABASE_URL, publishableKey: publicKey, historyEnabled: false });
    expect(supabaseConfiguration({})).toBeNull();
  });
  it.each(["sb_secret_PRIVATE_DETAIL", "eyJserviceRole", "", "AIzaPRIVATE_DETAIL"])("rejects non-publishable key %s", key => {
    expect(supabaseConfiguration({ ...config, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key })).toBeNull();
  });
  it.each(["http://remote.invalid", "https://user:password@synthetic.supabase.co", "https://synthetic.supabase.co/path", "https://synthetic.supabase.co?secret=x", "file:///tmp/data"])("rejects unsafe URL %s", url => {
    expect(supabaseConfiguration({ ...config, NEXT_PUBLIC_SUPABASE_URL: url })).toBeNull();
  });
  it("omits full evidence, job matches and unsafe rewrites", () => {
    const review = validAiReview(true);
    review.findings[0]!.suggestedRewrite = { original: "Built tools.", revised: "Invented revenue of 100%." };
    const summary = reviewSummary(review);
    expect(Object.keys(summary.analysis_result).sort()).toEqual(["assessment", "limitations", "priorities", "strengths", "version"]);
    expect(summary.suggestions).toEqual([]);
    expect(summary.analysis_result.priorities[0]).not.toHaveProperty("resumeEvidence");
    expect(JSON.stringify(summary)).not.toContain("Kubernetes");
  });
  it("preserves only conservative supplied rewrite excerpts", () => {
    const review = validAiReview();
    review.findings[0]!.suggestedRewrite = { original: "Successfully built tools.", revised: "built tools." };
    expect(reviewSummary(review).suggestions).toEqual([{ finding_id: "context", original_text: "Successfully built tools.", suggested_text: "built tools.", status: "pending" }]);
  });
  it.each([{ user_id: user.id }, { resumeText: "PRIVATE_DETAIL" }, { apiKey: "PRIVATE_DETAIL" }, { consent: false }, { suggestions: Array(13).fill({}) }])("rejects extra or invalid persistence fields %#", patch => {
    expect(saveReviewRequestSchema.safeParse({ ...payload(), ...patch }).success).toBe(false);
  });
  it("rejects multibyte summaries exceeding the SQL byte limit", () => {
    const text = "語";
    expect(savedAnalysisSchema.safeParse({ version: 1, assessment: text.repeat(1200), priorities: Array(3).fill({ title: text.repeat(500), recommendation: text.repeat(1200) }), strengths: Array(5).fill({ title: text.repeat(500), explanation: text.repeat(1200) }), limitations: Array(5).fill(text.repeat(500)) }).success).toBe(false);
  });
});

describe("server-only optional authentication", () => {
  it("works without configuration without calling Auth", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(await (await account.GET()).json()).toEqual({ ok: true, configured: false, historyEnabled: false, user: null });
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("returns only freshly verified email and never user/token metadata", async () => {
    expect(await (await account.GET()).json()).toEqual({ ok: true, configured: true, historyEnabled: true, user: { email: user.email } });
    expect(mock.auth.getUser).toHaveBeenCalledOnce();
    expect(mock.create.mock.calls[0]?.slice(0, 2)).toEqual([config.NEXT_PUBLIC_SUPABASE_URL, publicKey]);
  });
  it.each([null, { ...user, is_anonymous: true }, { ...user, email_confirmed_at: null }])("rejects absent, anonymous or unconfirmed identities %#", async identity => {
    mock.auth.getUser.mockResolvedValue({ data: { user: identity }, error: null });
    expect(await (await account.GET()).json()).toMatchObject({ user: null });
    await failure(await history.GET(), 401, "UNAUTHORIZED");
    expect(mock.client.from).not.toHaveBeenCalled();
  });
  it("signs in and signs out through the server SDK", async () => {
    expect((await account.POST(request("/api/account", { action: "sign-in", email: user.email, password: "test-password" }))).status).toBe(200);
    expect(mock.auth.signInWithPassword).toHaveBeenCalledExactlyOnceWith({ email: user.email, password: "test-password" });
    expect((await account.POST(request("/api/account", { action: "sign-out" }))).status).toBe(200);
    expect(mock.auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });
  it("reports signup email confirmation without claiming a signed-in session", async () => {
    const result = await account.POST(request("/api/account", { action: "sign-up", email: user.email, password: "synthetic-password" }));
    expect(await result.json()).toEqual({ ok: true, confirmationRequired: true });
    expect(mock.auth.signUp).toHaveBeenCalledWith({ email: user.email, password: "synthetic-password", options: { emailRedirectTo: "http://localhost:3100/auth/callback" } });
  });
  it.each([{ action: "sign-up", email: user.email, password: "short" }, { action: "sign-in", email: "invalid", password: "x" }, { action: "sign-out", user_id: user.id }])("validates auth inputs %#", async body => {
    await failure(await account.POST(request("/api/account", body)), 400, "INVALID_REQUEST"); expect(mock.create).not.toHaveBeenCalled();
  });
  it("rejects cross-origin auth changes", async () => {
    await failure(await account.POST(request("/api/account", { action: "sign-out" }, "POST", "https://foreign.invalid")), 403, "INVALID_REQUEST");
    expect(mock.auth.signOut).not.toHaveBeenCalled();
  });
  it("does not expose provider auth errors", async () => {
    mock.auth.signInWithPassword.mockResolvedValue({ data: {}, error: new Error("PRIVATE_DETAIL") });
    await failure(await account.POST(request("/api/account", { action: "sign-in", email: user.email, password: "test" })), 400, "AUTH_FAILED");
  });
  it("refreshes HTTP-only same-site cookies and bounds uncached network calls", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await account.GET();
    const options = mock.create.mock.calls[0]![2];
    expect(options.cookies.getAll()).toEqual([{ name: "session", value: "test-cookie" }]);
    options.cookies.setAll([{ name: "auth", value: "synthetic-token", options: { httpOnly: false, secure: false } }]);
    expect(mock.set).toHaveBeenCalledWith("auth", "synthetic-token", expect.objectContaining({ httpOnly: true, secure: true, sameSite: "lax" }));
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response()); vi.stubGlobal("fetch", fetchMock);
    await options.global.fetch("https://synthetic.supabase.co/auth/v1/user");
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
  });
  it("uses only a fixed relative callback destination", async () => {
    const response = await callback.GET(new Request("http://localhost:3100/auth/callback?code=synthetic&next=https://foreign.invalid", { headers: { host: "foreign.invalid" } }));
    expect(response.status).toBe(303); expect(response.headers.get("location")).toBe("/account");
    expect(mock.auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith("synthetic");
  });
  it("handles missing or failed callbacks without echoing secrets", async () => {
    expect((await callback.GET(new Request("http://localhost:3100/auth/callback"))).headers.get("location")).toBe("/account?auth=failed");
    mock.auth.exchangeCodeForSession.mockRejectedValue(new Error("PRIVATE_DETAIL"));
    expect((await callback.GET(new Request("http://localhost:3100/auth/callback?code=PRIVATE_DETAIL"))).headers.get("location")).toBe("/account?auth=failed");
  });
});

describe("saved summary server routes", () => {
  it("keeps history disabled until explicitly configured", async () => {
    vi.stubEnv("SUPABASE_HISTORY_ENABLED", "false");
    await failure(await history.GET(), 503, "HISTORY_DISABLED");
    await failure(await history.POST(request("/api/review-history", payload())), 503, "HISTORY_DISABLED");
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("lists only verified owner's unexpired bounded records", async () => {
    const response = await history.GET(); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, reviews: [{ id }] });
    expect(mock.query.eq).toHaveBeenCalledWith("user_id", user.id);
    expect(mock.query.gt).toHaveBeenCalledWith("created_at", expect.any(String));
    expect(mock.query.limit).toHaveBeenCalledWith(20);
    expect(mock.query.select.mock.calls[0]?.[0]).not.toContain("*");
  });
  it("saves a validated atomic snapshot without client ownership", async () => {
    expect(await (await history.POST(request("/api/review-history", payload()))).json()).toEqual({ ok: true, id });
    expect(mock.auth.getUser).toHaveBeenCalledOnce();
    expect(mock.client.rpc).toHaveBeenCalledExactlyOnceWith("save_resume_review", { p_id: id, p_review_mode: "general", p_resume_filename: null, p_analysis_result: payload().analysis_result, p_suggestions: [] });
  });
  it("rejects forged ownership before database access", async () => {
    await failure(await history.POST(request("/api/review-history", { ...payload(), user_id: user.id })), 400, "INVALID_REQUEST");
    expect(mock.client.rpc).not.toHaveBeenCalled();
  });
  it.each(["sb_secret_syntheticPRIVATE_DETAIL", "-----BEGIN PRIVATE KEY-----", "configured-secret-PRIVATE_DETAIL"])("rejects recognizable or configured credentials in prose %#", async secret => {
    vi.stubEnv("GEMINI_API_KEY", "configured-secret-PRIVATE_DETAIL");
    const body = payload(); body.analysis_result.assessment = secret;
    await failure(await history.POST(request("/api/review-history", body)), 400, "INVALID_REQUEST");
    expect(mock.client.rpc).not.toHaveBeenCalled();
  });
  it("rejects cross-origin save and delete", async () => {
    await failure(await history.POST(request("/api/review-history", payload(), "POST", "https://foreign.invalid")), 403, "INVALID_REQUEST");
    await failure(await deletion.DELETE(request(`/api/review-history/${id}`, {}, "DELETE", "https://foreign.invalid"), { params: Promise.resolve({ id }) }), 403, "INVALID_REQUEST");
    expect(mock.client.from).not.toHaveBeenCalled(); expect(mock.client.rpc).not.toHaveBeenCalled();
  });
  it("deletes only the verified owner's row with returning confirmation", async () => {
    expect(await (await deletion.DELETE(request(`/api/review-history/${id}`, {}, "DELETE"), { params: Promise.resolve({ id }) })).json()).toEqual({ ok: true });
    expect(mock.query.eq).toHaveBeenCalledWith("user_id", user.id); expect(mock.query.eq).toHaveBeenCalledWith("id", id);
    expect(mock.query.maybeSingle).toHaveBeenCalledOnce();
  });
  it("does not claim deletion of absent or foreign records", async () => {
    mock.query.maybeSingle.mockResolvedValue({ data: null, error: null });
    await failure(await deletion.DELETE(request(`/api/review-history/${id}`, {}, "DELETE"), { params: Promise.resolve({ id }) }), 404, "NOT_FOUND");
  });
  it("rejects invalid deletion IDs before the database", async () => {
    await failure(await deletion.DELETE(request("/api/review-history/bad", {}, "DELETE"), { params: Promise.resolve({ id: "bad" }) }), 400, "INVALID_REQUEST");
    expect(mock.client.from).not.toHaveBeenCalled();
  });
  it("rejects malformed returned records and hides database diagnostics", async () => {
    mock.query.limit.mockResolvedValue({ data: [{ ...record(), apiKey: "PRIVATE_DETAIL" }], error: null });
    await failure(await history.GET(), 503, "STORAGE_ERROR");
    mock.query.limit.mockResolvedValue({ data: null, error: new Error("PRIVATE_DETAIL") });
    await failure(await history.GET(), 503, "STORAGE_ERROR");
    mock.client.rpc.mockResolvedValue({ data: user.id, error: null });
    await failure(await history.POST(request("/api/review-history", payload())), 503, "STORAGE_ERROR");
  });
  it("bounds JSON body size", async () => {
    await failure(await history.POST(request("/api/review-history", { resume: "a".repeat(400_001) })), 413, "INVALID_REQUEST");
    expect(mock.client.rpc).not.toHaveBeenCalled();
  });
  it("releases failed operations and bounds authentication attempts", async () => {
    mock.auth.signInWithPassword.mockRejectedValue(new Error("PRIVATE_DETAIL"));
    for (let i = 0; i < 10; i++) await failure(await account.POST(request("/api/account", { action: "sign-in", email: user.email, password: "test" })), 503, "STORAGE_ERROR");
    await failure(await account.POST(request("/api/account", { action: "sign-in", email: user.email, password: "test" })), 429, "BUSY");
  });
});
