import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { SignJWT } from "jose";

// Node's scrypt takes a callback; the promise form is what the server uses.
const scryptAsync = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

// Configure before importing server.ts: this keeps the app unbound to a port and
// prevents these middleware tests from requiring a reachable PostgreSQL instance.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://cloudie_test:cloudie_test@127.0.0.1:5432/cloudie_test";
process.env.JWT_SECRET = "test-only-secret-that-is-longer-than-thirty-two-bytes";
process.env.CORS_ORIGINS = "http://localhost:5173";

const { app, pool } = await import("./server.js");

test("rejects unsafe requests from an untrusted browser origin", async () => {
  const response = await app.request("/api/auth/logout", {
    method: "POST",
    headers: {
      Origin: "https://untrusted.example",
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Cross-origin request rejected" });
});

test("rejects cookie-authenticated unsafe requests without an Origin header", async () => {
  const response = await app.request("/api/auth/logout", {
    method: "POST",
    headers: {
      Cookie: "cloudie_session=present",
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  assert.equal(response.status, 403);
});

test("does not reflect an untrusted origin in CORS response headers", async () => {
  const response = await app.request("/api/health", {
    headers: { Origin: "https://untrusted.example" },
  });

  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("adds baseline security headers to ordinary API responses", async () => {
  const response = await app.request("/does-not-exist");

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("allows a trusted origin for a non-cookie logout request", async () => {
  const response = await app.request("/api/auth/logout", {
    method: "POST",
    headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
    body: "{}",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test("requires a CSRF token for cookie-authenticated unsafe requests", async () => {
  const response = await app.request("/api/auth/logout", {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      Cookie: "cloudie_session=present",
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "CSRF validation failed" });
});

test("rejects a mismatched CSRF cookie and header", async () => {
  const response = await app.request("/api/auth/logout", {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      Cookie: "cloudie_session=present; cloudie_csrf=expected-token",
      "X-CSRF-Token": "different-token",
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  assert.equal(response.status, 403);
});

test("rejects malformed non-ASCII CSRF tokens without throwing", async () => {
  const response = await app.request("/api/auth/logout", {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      Cookie: "cloudie_session=present; cloudie_csrf=é",
      "X-CSRF-Token": "é",
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "CSRF validation failed" });
});

test("accepts a matching CSRF cookie and header and clears both cookies on logout", async () => {
  const response = await app.request("/api/auth/logout", {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      Cookie: "cloudie_session=present; cloudie_csrf=matching-token",
      "X-CSRF-Token": "matching-token",
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  assert.equal(response.status, 200);
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /cloudie_session/);
  assert.match(setCookie, /cloudie_csrf/);
});

test("issues a random CSRF cookie without exposing the token in JSON", async () => {
  const response = await app.request("/api/auth/csrf", {
    headers: { Origin: "http://localhost:5173" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /cloudie_csrf=/);
  assert.doesNotMatch(setCookie, /HttpOnly/i);
});

test("rejects unauthenticated access to protected and administrator routes", async () => {
  const protectedResponse = await app.request("/api/me");
  const adminResponse = await app.request("/api/admin/users");

  assert.equal(protectedResponse.status, 401);
  assert.equal(adminResponse.status, 401);
});

test("rejects malformed registration and login payloads before database access", async () => {
  const registration = await app.request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "", email: "not-an-email", password: "short" }),
  });
  const login = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "not-an-email", password: "" }),
  });

  assert.equal(registration.status, 400);
  assert.equal(login.status, 400);
});

test("returns 503 on readiness, but stays live, when the configured PostgreSQL database is unavailable", async () => {
  const mutablePool = pool as unknown as { query: (...args: unknown[]) => Promise<unknown> };
  const originalQuery = mutablePool.query;
  mutablePool.query = async () => { throw new Error("simulated database outage"); };
  try {
    const liveness = await app.request("/health");
    assert.equal(liveness.status, 200);
    const liveBody = await liveness.json() as { ok?: boolean };
    assert.equal(liveBody.ok, true);

    const response = await app.request("/ready");
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      ok: false,
      service: "cloudie-neon-api",
      database: "unavailable",
    });
  } finally {
    mutablePool.query = originalQuery;
  }
});

test("denies a non-admin session from administrator-only user management", async () => {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ email: "user@example.com", role: "user" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("test-user")
    .setJti("test-session")
    .setIssuedAt()
    .setIssuer("cloudie-neon-api")
    .setAudience("cloudie-web")
    .setExpirationTime("5m")
    .sign(secret);
  const mutablePool = pool as unknown as { query: (...args: unknown[]) => Promise<unknown> };
  const originalQuery = mutablePool.query;
  mutablePool.query = async (...args: unknown[]) => {
    const sql = String(args[0] ?? "");
    if (sql.includes("FROM api_sessions")) return { rows: [{ id: "test-session" }], rowCount: 1 };
    if (sql.includes("FROM app_users")) return {
      rows: [{
        id: "test-user",
        email: "user@example.com",
        name: "Test User",
        role: "user",
        is_suspended: false,
        is_terminated: false,
      }],
      rowCount: 1,
    };
    throw new Error("Unexpected database query in authorization test");
  };

  try {
    const response = await app.request("/api/admin/users", {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "Administrator access required" });
  } finally {
    mutablePool.query = originalQuery;
  }
});

test("rejects revoked or expired server-side sessions", async () => {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ email: "user@example.com", role: "user" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("test-user")
    .setJti("revoked-session")
    .setIssuedAt()
    .setIssuer("cloudie-neon-api")
    .setAudience("cloudie-web")
    .setExpirationTime("5m")
    .sign(secret);
  const mutablePool = pool as unknown as { query: (...args: unknown[]) => Promise<unknown> };
  const originalQuery = mutablePool.query;
  mutablePool.query = async () => ({ rows: [], rowCount: 0 });
  try {
    const response = await app.request("/api/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Session expired or revoked" });
  } finally {
    mutablePool.query = originalQuery;
  }
});

test("returns public platform configuration without authentication", async () => {
  const response = await app.request("/api/public-config");
  assert.equal(response.status, 200);
  const data = await response.json() as { brand?: { name?: string }, support?: { widgetEnabled?: boolean } };
  assert.ok(data.brand);
  assert.equal(typeof data.brand?.name, "string");
  assert.ok(data.support);
});

test("returns 404 for nonexistent tracking number", async () => {
  const mutablePool = pool as unknown as { query: (...args: unknown[]) => Promise<unknown> };
  const originalQuery = mutablePool.query;
  mutablePool.query = async () => ({ rows: [], rowCount: 0 });
  try {
    const response = await app.request("/api/tracking/TRK-NONEXISTENT");
    assert.equal(response.status, 404);
    const data = await response.json() as { error?: string };
    assert.equal(data.error, "Tracking number not found");
  } finally {
    mutablePool.query = originalQuery;
  }
});

test("responds on /ready when database is reachable", async () => {
  const mutablePool = pool as unknown as { query: (...args: unknown[]) => Promise<unknown> };
  const originalQuery = mutablePool.query;
  mutablePool.query = async () => ({ rows: [{ ok: 1 }], rowCount: 1 });
  try {
    const response = await app.request("/ready");
    assert.equal(response.status, 200);
    const data = await response.json() as { ok?: boolean; database?: string };
    assert.equal(data.ok, true);
    assert.equal(data.database, "connected");
  } finally {
    mutablePool.query = originalQuery;
  }
});

test("enforces rate limiting on repeated login attempts from the same IP", async () => {
  let lastStatus = 200;
  for (let i = 0; i < 21; i += 1) {
    const response = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "203.0.113.99",
        "X-Test-Rate-Limit": "1",
      },
      body: JSON.stringify({ email: "invalid", password: "" }),
    });
    lastStatus = response.status;
  }
  assert.equal(lastStatus, 429);
});

/**
 * Session-cookie profile. The cutover gates require proof that the browser
 * session is HttpOnly + SameSite with a bounded lifetime before any cookie-only
 * cutover, and that production additionally marks it Secure. Both are asserted
 * here against the real login handler rather than assumed from source.
 */
test("login issues an HttpOnly, SameSite=Lax session cookie with a bounded lifetime", async () => {
  const password = "correct horse battery staple";
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, 64);
  const passwordHash = `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
  const mutablePool = pool as unknown as { query: (...args: unknown[]) => Promise<unknown> };
  const originalQuery = mutablePool.query;
  mutablePool.query = async (sql: unknown) => {
    if (String(sql).includes("FROM app_users")) {
      return {
        rows: [
          {
            id: "cookie-test-user",
            email: "cookie@example.com",
            name: "Cookie Test",
            role: "user",
            is_suspended: false,
            is_terminated: false,
            password_hash: passwordHash,
          },
        ],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  };
  try {
    const response = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
        "X-Forwarded-For": "203.0.113.101",
      },
      body: JSON.stringify({ email: "cookie@example.com", password }),
    });
    assert.equal(response.status, 200);
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    const cookies = headers.getSetCookie?.() ?? [headers.get("set-cookie") ?? ""];
    const sessionCookie = cookies.find((cookie) => cookie.startsWith("cloudie_session=")) ?? "";
    assert.notEqual(sessionCookie, "", `expected a cloudie_session cookie, got: ${cookies.join(" | ")}`);
    assert.match(sessionCookie, /HttpOnly/i);
    assert.match(sessionCookie, /SameSite=Lax/i);
    assert.match(sessionCookie, /Path=\//i);
    assert.match(sessionCookie, /Max-Age=28800/i);
    // NODE_ENV is "test" here; production is asserted separately below.
    assert.doesNotMatch(sessionCookie, /Secure/i);

    process.env.NODE_ENV = "production";
    const productionResponse = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
        "X-Forwarded-For": "203.0.113.102",
      },
      body: JSON.stringify({ email: "cookie@example.com", password }),
    });
    assert.equal(productionResponse.status, 200);
    const productionCookies =
      (productionResponse.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    const productionSession = productionCookies.find((cookie) => cookie.startsWith("cloudie_session=")) ?? "";
    assert.match(productionSession, /Secure/i);
  } finally {
    process.env.NODE_ENV = "test";
    mutablePool.query = originalQuery;
  }
});

/**
 * Disabled accounts. Login must refuse suspended and terminated users with the
 * same response as a bad password (no account-state oracle) and must not mint a
 * session cookie when it does.
 */
test("refuses login for suspended and terminated accounts without issuing a session", async () => {
  const password = "correct horse battery staple";
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, 64);
  const passwordHash = `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
  const mutablePool = pool as unknown as { query: (...args: unknown[]) => Promise<unknown> };
  const originalQuery = mutablePool.query;
  const account = (flags: { is_suspended: boolean; is_terminated: boolean }) => ({
    rows: [
      {
        id: "disabled-test-user",
        email: "disabled@example.com",
        name: "Disabled Test",
        role: "user",
        ...flags,
        password_hash: passwordHash,
      },
    ],
    rowCount: 1,
  });
  try {
    for (const [index, flags] of [
      { is_suspended: true, is_terminated: false },
      { is_suspended: false, is_terminated: true },
    ].entries()) {
      mutablePool.query = async (sql: unknown) =>
        String(sql).includes("FROM app_users") ? account(flags) : { rows: [], rowCount: 0 };
      const response = await app.request("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:5173",
          "X-Forwarded-For": `203.0.113.${110 + index}`,
        },
        body: JSON.stringify({ email: "disabled@example.com", password }),
      });
      assert.equal(response.status, 401, `expected 401 for ${JSON.stringify(flags)}`);
      assert.deepEqual(await response.json(), { error: "Invalid email or password" });
      const headers = response.headers as Headers & { getSetCookie?: () => string[] };
      const cookies = headers.getSetCookie?.() ?? [];
      assert.equal(
        cookies.some((cookie) => cookie.startsWith("cloudie_session=")),
        false,
        "a refused login must not set a session cookie",
      );
    }
  } finally {
    mutablePool.query = originalQuery;
  }
});

/**
 * First-administrator bootstrap. The endpoint must be inert without an
 * operator-supplied token, must never trust a client-supplied role, must close
 * after one success, and must audit the promotion in the same transaction.
 */
test("administrator bootstrap is inert when no bootstrap token is configured", async () => {
  delete process.env.ADMIN_BOOTSTRAP_TOKEN;
  const response = await app.request("/api/admin/bootstrap", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
      "X-Forwarded-For": "203.0.113.201",
    },
    body: JSON.stringify({ email: "owner@example.com", token: "anything" }),
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Administrator bootstrap is not configured" });
});

test("administrator bootstrap rejects a wrong token without touching the database", async () => {
  process.env.ADMIN_BOOTSTRAP_TOKEN = "bootstrap-token-for-tests-0123456789";
  const mutablePool = pool as unknown as { connect: () => Promise<unknown> };
  const originalConnect = mutablePool.connect;
  let connectCalls = 0;
  mutablePool.connect = async () => {
    connectCalls += 1;
    throw new Error("database must not be reached for a wrong token");
  };
  try {
    const response = await app.request("/api/admin/bootstrap", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
        "X-Forwarded-For": "203.0.113.202",
      },
      body: JSON.stringify({ email: "owner@example.com", token: "wrong-token" }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "Invalid bootstrap token" });
    assert.equal(connectCalls, 0);
  } finally {
    mutablePool.connect = originalConnect;
    delete process.env.ADMIN_BOOTSTRAP_TOKEN;
  }
});

test("administrator bootstrap promotes one existing account and audits it atomically", async () => {
  process.env.ADMIN_BOOTSTRAP_TOKEN = "bootstrap-token-for-tests-0123456789";
  const calls: { sql: string; params?: unknown[] }[] = [];
  const txClient = {
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params });
      if (sql.startsWith("SELECT id FROM app_users WHERE role='admin'")) return { rows: [] };
      if (sql.startsWith("UPDATE app_users SET role='admin'")) {
        return { rows: [{ id: "owner-1", email: "owner@example.com", name: "Owner", role: "admin" }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const mutablePool = pool as unknown as { connect: () => Promise<unknown> };
  const originalConnect = mutablePool.connect;
  mutablePool.connect = async () => txClient;
  try {
    const response = await app.request("/api/admin/bootstrap", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
        "X-Forwarded-For": "203.0.113.203",
      },
      // A client-supplied role must be ignored; the server decides.
      body: JSON.stringify({ email: "owner@example.com", token: process.env.ADMIN_BOOTSTRAP_TOKEN, role: "user" }),
    });
    assert.equal(response.status, 201);
    const body = await response.json() as { ok?: boolean; user?: { role?: string } };
    assert.equal(body.ok, true);
    assert.equal(body.user?.role, "admin");

    const sqls = calls.map((call) => call.sql);
    assert.equal(sqls[0], "BEGIN");
    assert.ok(sqls[1].includes("pg_advisory_xact_lock"));
    assert.ok(sqls.some((sql) => sql.includes("INSERT INTO admin_audit_logs") && sql.includes("'admin.bootstrap'")));
    assert.equal(sqls[sqls.length - 1], "COMMIT");
    assert.equal(sqls.includes("ROLLBACK"), false);
    // The audit row is written before COMMIT, i.e. in the same transaction.
    const auditIndex = sqls.findIndex((sql) => sql.includes("INSERT INTO admin_audit_logs"));
    assert.ok(auditIndex > 0 && auditIndex < sqls.indexOf("COMMIT"));
    // No response ever echoes the bootstrap token.
    assert.equal(JSON.stringify(body).includes("bootstrap-token"), false);
  } finally {
    mutablePool.connect = originalConnect;
    delete process.env.ADMIN_BOOTSTRAP_TOKEN;
  }
});

test("administrator bootstrap closes permanently once an administrator exists", async () => {
  process.env.ADMIN_BOOTSTRAP_TOKEN = "bootstrap-token-for-tests-0123456789";
  const calls: string[] = [];
  const txClient = {
    async query(sql: string) {
      calls.push(sql);
      if (sql.startsWith("SELECT id FROM app_users WHERE role='admin'")) {
        return { rows: [{ id: "existing-admin" }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const mutablePool = pool as unknown as { connect: () => Promise<unknown> };
  const originalConnect = mutablePool.connect;
  mutablePool.connect = async () => txClient;
  try {
    const response = await app.request("/api/admin/bootstrap", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
        "X-Forwarded-For": "203.0.113.204",
      },
      body: JSON.stringify({ email: "attacker@example.com", token: process.env.ADMIN_BOOTSTRAP_TOKEN }),
    });
    assert.equal(response.status, 409);
    assert.ok(calls.includes("ROLLBACK"));
    assert.equal(calls.includes("COMMIT"), false);
    assert.equal(calls.some((sql) => sql.startsWith("UPDATE app_users")), false);
  } finally {
    mutablePool.connect = originalConnect;
    delete process.env.ADMIN_BOOTSTRAP_TOKEN;
  }
});

