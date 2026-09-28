"use node";

/**
 * Signature helpers shared by adapters.
 *
 * Extracted rather than copied into each adapter for the same reason
 * `vtuProviderStatus.ts` exists: a second hand-rolled copy of a
 * constant-time comparison is a second place to get the length check wrong,
 * and the length check is the part that is easy to omit.
 *
 * `"use node"` because `node:crypto`'s `timingSafeEqual` has no WebCrypto
 * equivalent, and Convex will not bundle a Node builtin through a V8 module.
 */

import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison.
 *
 * `timingSafeEqual` THROWS on a length mismatch, so the length check runs
 * first and returns false rather than throwing — an early return on length
 * leaks only the digest length, which is not a secret.
 *
 * Hex and base64 are both accepted by the callers, because vendors disagree
 * on the encoding of the same algorithm.
 */
export function safeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}
