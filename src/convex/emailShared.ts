/**
 * Shared, runtime-neutral constants for the transactional email provider.
 *
 * Nothing here imports Node built-ins, so it can be used from both the default
 * (V8) runtime — queries/mutations — and the Node action runtime. Node-only
 * crypto lives in `emailCrypto.ts` and must never be imported from a V8 file.
 */

export const PROVIDER = "elastic_email";
export const PROVIDER_LABEL = "Elastic Email";

/** Masked placeholder shown in the admin UI in place of the stored secret. */
export const MASKED_SECRET = "••••••••••••••••••••";

/** Name of the auto-generated fallback key in `systemSecrets`. */
export const AUTO_KEY_NAME = "email_credential_encryption_key";

/** Deployment-level encryption secret vars (first match wins). */
export const ENCRYPTION_KEY_ENV_VARS = [
  "EMAIL_CREDENTIAL_ENCRYPTION_KEY",
  "EMAIL_SETTINGS_ENCRYPTION_KEY",
] as const;

export function envEncryptionKey(): string | null {
  for (const name of ENCRYPTION_KEY_ENV_VARS) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim().length >= 16) return value.trim();
  }
  return null;
}

/** Active delivery transport for the platform. */
export type TransportKind = "api" | "smtp";

/** Elastic Email SMTP relay defaults (prefilled in the admin form). */
export const SMTP_DEFAULT_HOST = "smtp.elasticemail.com";
export const SMTP_DEFAULT_PORT = 2525;

/** Deployment-level SMTP password vars (optional escape hatch; first match wins). */
export const ENV_SMTP_PASSWORD_VARS = ["ELASTIC_EMAIL_SMTP_PASSWORD", "ELASTICEMAIL_SMTP_PASSWORD"] as const;

export function envSmtpPassword(): { value: string; name: string } | null {
  for (const name of ENV_SMTP_PASSWORD_VARS) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) return { value: value.trim(), name };
  }
  return null;
}

/** Deployment-level API key vars (optional escape hatch; first match wins). */
export const ENV_API_KEY_VARS = ["ELASTIC_EMAIL_API_KEY", "ELASTICEMAIL_API_KEY"] as const;

export function envApiKey(): { value: string; name: string } | null {
  for (const name of ENV_API_KEY_VARS) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) return { value: value.trim(), name };
  }
  return null;
}

export function envApiKeyName(): string | null {
  return envApiKey()?.name ?? null;
}

/** Mask an address for display: keep the domain, hide the local part. */
export function maskEmail(email: string): string {
  const trimmed = String(email ?? "").trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return trimmed.length > 4 ? `${trimmed.slice(0, 2)}•••` : "•••";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${"•".repeat(Math.max(3, Math.min(6, local.length - head.length)))}@${domain}`;
}
