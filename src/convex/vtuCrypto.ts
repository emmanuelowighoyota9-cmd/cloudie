"use node";

/**
 * Credential encryption for VTU aggregator secrets.
 *
 * A Pairgate API key is a high-sensitivity credential — it authorises spending
 * real money — so it is never stored as plaintext. It is sealed with
 * AES-256-GCM under a 32-byte key derived from a server-side encryption
 * secret, mirroring `emailCrypto.ts`.
 *
 * This is a "use node" module: only actions may import it, which is precisely
 * the property we want. A mutation can never receive a decrypted key.
 *
 * The encryption secret is supplied per call rather than read from the
 * environment here, so the resolution order (deployment env first, then the
 * `systemSecrets` fallback used by the email engine) stays in the caller's
 * hands. Never log the value that comes back out of here.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const HKDF_SALT = "crestline.vtu.credentials.v1";
const HKDF_INFO = "vtu-aggregator-secret";
const PAYLOAD_PREFIX = "v1:";

/** Derive the fixed-length AES key from an arbitrary-length secret. */
function deriveKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, HKDF_SALT, HKDF_INFO, 32));
}

/** Seal a plaintext secret. Returns an opaque, versioned payload. */
export function encryptVtuSecret(plaintext: string, secret: string): string {
  if (!secret) throw new Error("VTU_ENCRYPTION_SECRET is not configured");
  if (!plaintext) throw new Error("Refusing to seal an empty credential");

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  // The prefix is concatenated, not joined: `join(".")` would emit a leading
  // empty segment (`v1:.iv.tag.ct`) that `decryptVtuSecret` — which slices the
  // prefix off and splits — would read back as a missing part.
  return (
    PAYLOAD_PREFIX +
    [
      iv.toString("base64"),
      tag.toString("base64"),
      ciphertext.toString("base64"),
    ].join(".")
  );
}

/**
 * Open a payload produced by {@link encryptVtuSecret}.
 *
 * Throws on tamper or key mismatch — AES-GCM authenticates, so a modified
 * ciphertext fails the tag check rather than decrypting to garbage.
 */
export function decryptVtuSecret(payload: string, secret: string): string {
  if (!secret) throw new Error("VTU_ENCRYPTION_SECRET is not configured");
  if (!payload.startsWith(PAYLOAD_PREFIX)) {
    throw new Error("UNSUPPORTED_CREDENTIAL_FORMAT");
  }

  const [ivPart, tagPart, dataPart] = payload.slice(PAYLOAD_PREFIX.length).split(".");
  if (!ivPart || !tagPart || !dataPart) throw new Error("MALFORMED_CREDENTIAL");

  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(secret),
    Buffer.from(ivPart, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
