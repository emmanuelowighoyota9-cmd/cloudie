import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Ledger audit every 30 minutes — bounded read, read-only drift detection
crons.interval("banking ledger audit", { minutes: 30 }, internal.bankingCron.ledgerAudit, {});

// Tenant status check hourly — enforces renewalDate → suspended with grace period, preserves history
crons.interval("banking tenant status check", { hours: 1 }, internal.bankingCron.tenantStatusCheck, {});

// Fee reconciliation flag every 6 hours — marks stale pending deposits for operator review (no auto-credit)
crons.interval("banking fee reconciliation check", { hours: 6 }, internal.bankingCron.feeReconciliationCheck, {});

export default crons;
