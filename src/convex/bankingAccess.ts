/**
 * Tenant banking roles and permissions.
 *
 * This module is the single source of truth for "who may do what" inside a
 * banking tenant. It is deliberately plain TypeScript: the same matrix is used
 * by the Convex mutations (server-side enforcement) and by the tenant admin UI
 * (to hide actions the caller cannot perform). The UI check is a convenience —
 * every mutation re-checks here, because a hidden button is not a permission.
 *
 * Roles are per-tenant memberships (`tenantUsers.role`). A tenant owner is not
 * stored as a membership row: the owning user implicitly holds the `owner`
 * role. Cloudie super admins act as `owner` for every tenant.
 */

export const BANKING_ROLES = [
  "owner",
  "admin",
  "compliance",
  "finance",
  "support",
  "customer",
] as const;

export type BankingRole = (typeof BANKING_ROLES)[number];

export const BANKING_PERMISSIONS = [
  "customers.view",
  "kyc.review",
  "accounts.manage",
  "accounts.restrict",
  "transactions.view",
  "transactions.override",
  "ledger.view",
  "ledger.adjust.request",
  "ledger.adjust.approve",
  "fees.manage",
  "staff.manage",
  "branding.manage",
  "audit.view",
  "subscription.view",
] as const;

export type BankingPermission = (typeof BANKING_PERMISSIONS)[number];

export const BANKING_ROLE_LABELS: Record<BankingRole, string> = {
  owner: "Tenant owner",
  admin: "Tenant administrator",
  compliance: "Compliance officer",
  finance: "Finance officer",
  support: "Support agent",
  customer: "Customer",
};

/**
 * Least privilege. Each officer role gets only the surface it needs:
 * compliance reviews identity and watches the ledger, finance moves money
 * configuration and prepares ledger corrections, support answers customers.
 * Neither compliance nor support can approve a ledger correction.
 */
const MATRIX: Record<BankingRole, readonly BankingPermission[]> = {
  owner: BANKING_PERMISSIONS,
  admin: [
    "customers.view",
    "kyc.review",
    "accounts.manage",
    "accounts.restrict",
    "transactions.view",
    "transactions.override",
    "ledger.view",
    "ledger.adjust.request",
    "ledger.adjust.approve",
    "fees.manage",
    "staff.manage",
    "branding.manage",
    "audit.view",
    "subscription.view",
  ],
  compliance: [
    "customers.view",
    "kyc.review",
    "transactions.view",
    "accounts.restrict",
    "ledger.view",
    "ledger.adjust.request",
    "audit.view",
  ],
  finance: [
    "customers.view",
    "transactions.view",
    "accounts.manage",
    "ledger.view",
    "ledger.adjust.request",
    "ledger.adjust.approve",
    "fees.manage",
    "audit.view",
  ],
  support: ["customers.view", "transactions.view"],
  customer: [],
};

/** Roles a tenant administrator may hand out. `owner` is never assignable. */
export const ASSIGNABLE_STAFF_ROLES = ["admin", "compliance", "finance", "support", "customer"] as const;

export type AssignableStaffRole = (typeof ASSIGNABLE_STAFF_ROLES)[number];

/** Anything stored historically ("member", empty, unknown) maps to customer. */
export function normalizeBankingRole(raw: string | undefined | null): BankingRole {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "member" || value === "") return "customer";
  if ((BANKING_ROLES as readonly string[]).includes(value)) return value as BankingRole;
  return "customer";
}

export function isStaffRole(role: BankingRole): boolean {
  return role !== "customer";
}

export function permissionsFor(role: BankingRole): readonly BankingPermission[] {
  return MATRIX[normalizeBankingRole(role)];
}

export function can(role: BankingRole | string, permission: BankingPermission): boolean {
  return MATRIX[normalizeBankingRole(role)].includes(permission);
}

/** Throws `FORBIDDEN: ...` when the role lacks the permission. */
export function requirePermission(role: BankingRole | string, permission: BankingPermission): void {
  if (!can(role, permission)) {
    throw new Error(`FORBIDDEN: ${BANKING_ROLE_LABELS[normalizeBankingRole(role)]} cannot ${permission}`);
  }
}

/**
 * A role may only be granted by someone who already holds every permission it
 * carries. This stops a tenant administrator from creating an `owner`-equivalent
 * peer and keeps privilege escalation out of the staff screen.
 */
export function canGrantRole(actorRole: BankingRole | string, target: AssignableStaffRole): boolean {
  const actor = normalizeBankingRole(actorRole);
  if (actor === "owner") return true;
  const wanted = MATRIX[target];
  const held = MATRIX[actor];
  return wanted.every((p) => held.includes(p)) && actor === "admin";
}
