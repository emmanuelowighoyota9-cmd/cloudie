/**
 * Bank Mailer — provider dispatch.
 *
 * Both notices go out through the platform's single transport
 * (`mailTransport.ts`), in parallel. When that transport is not configured, both
 * attempts fail fast with the same reason so the workflow refunds and tells the
 * user why instead of half-sending.
 */
import { sendTransactionalEmail } from "./mailTransport.js";
import type { Attempt, DispatchReport, NoticePair } from "./bankMailerSend.js";

export async function dispatchNoticePair(
  pair: NoticePair,
  platformName: string,
): Promise<DispatchReport> {
  const [debit, credit]: [Attempt, Attempt] = await Promise.all([
    sendTransactionalEmail(pair.debit, platformName),
    sendTransactionalEmail(pair.credit, platformName),
  ]);
  return { debit, credit };
}
