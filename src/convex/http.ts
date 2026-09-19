import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

/**
 * Health endpoint (spec: GET /api/health).
 *
 * Reports whether Cloudie's own infrastructure is reachable. Intentionally
 * shallow: no credentials, no internal URLs, no stack traces. Always returns
 * 200 with a status field so uptime monitors can parse it.
 */
const healthHandler = httpAction(async (ctx) => {
  try {
    const db = await ctx.runQuery(internal.health.ping, {});
    return new Response(
      JSON.stringify({
        status: "ok",
        service: "cloudie",
        database: db.database,
        queue: {
          queued: db.queuedJobs,
          failed: db.failedJobs,
        },
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      },
    );
  } catch {
    return new Response(
      JSON.stringify({
        status: "degraded",
        service: "cloudie",
        database: "unreachable",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 503,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      },
    );
  }
});

http.route({ path: "/health", method: "GET", handler: healthHandler });
http.route({ path: "/api/health", method: "GET", handler: healthHandler });

export default http;
