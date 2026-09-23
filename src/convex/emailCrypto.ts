"use node";

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Credential encryption for the admin-managed email provider key.
 *
 * The Elastic Email API key is a high-sensitivity credential, so it is never
 * stored as plaintext. It is sealed with AES-256-GCM under a 32-byte key derived
 * from a server-side encryption secret, and this module is the ONLY place that
 * knows how to open it. It runs in the Node action runtime and must never be
 * imported by a V8 function (constants live in `emailShared.ts`).
 *
 * Encryption secret resolution order:
 *   1. `EMAIL_CREDENTIAL_ENCRYPTION_KEY` (deployment env, recommended)
 *   2. an auto-generated key held in the `systemSecrets` table — a separate
 *      record from the credential itself, so the ciphertext and its key never
 *      live in the same document.
 */

const HKDF_SALT = "cloudie.email.credentials.v1";
const HKDF_INFO = "elastic-email-api-key";
const PAYLOAD_PREFIX = "v1:";

/** Derive the fixed-length AES key from an arbitrary-length secret. */
function deriveKey(secret: string): Buffer {
  const derived = hkdfSync("sha256", secret, HKDF_SALT, HKDF_INFO, 32);
  return Buffer.from(derived);
}

/** Seal a plaintext secret. Returns an opaque, versioned payload. */
export function encryptSecret(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PAYLOAD_PREFIX}${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

/** Open a payload produced by {@link encryptSecret}. Throws on tamper/mismatch. */
export function decryptSecret(payload: string, secret: string): string {
  if (!payload.startsWith(PAYLOAD_PREFIX)) throw new Error("UNSUPPORTED_CREDENTIAL_FORMAT");
  const [ivPart, tagPart, dataPart] = payload.slice(PAYLOAD_PREFIX.length).split(".");
  if (!ivPart || !tagPart || !dataPart) throw new Error("MALFORMED_CREDENTIAL");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** Generate a new random encryption secret (base64, 32 bytes of entropy). */
export function generateEncryptionSecret(): string {
  return randomBytes(32).toString("base64");
}
