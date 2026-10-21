// Manual verification against a live Convex deployment.
// Run: bun run verify:convex
// Requires CONVEX_URL, CONVEX_AUTH_TOKEN, and TEST_PACKAGE_ID.
// The authenticated test user must be an approved vendor and must be able to
// purchase the selected test package. Set the wallet below its price before
// the insufficient-funds check. This script is NOT run in CI.

import { ConvexHttpClient } from "convex/browser";
import { api } from "../src/convex/_generated/api";
import type { Id } from "../src/convex/_generated/dataModel";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const url = process.env.CONVEX_URL;
const token = process.env.CONVEX_AUTH_TOKEN;
const packageId = process.env.TEST_PACKAGE_ID;

if (!url || !token || !packageId) {
  console.error("CONVEX_URL, CONVEX_AUTH_TOKEN, and TEST_PACKAGE_ID are required.");
  process.exit(1);
}

const client = new ConvexHttpClient(url);
client.setAuth(token);
const typedPackageId = packageId as Id<"pointPackages">;

async function main() {
  console.log("1. Purchase → escrow");
  const order = await client.mutation(api.pointMarket.createOrder, {
    packageId: typedPackageId,
  });
  console.log("   orderId:", order.orderId);

  console.log("2. Confirm order is in escrow");
  const escrow = await client.query(api.pointMarket.getMyOrder, { orderId: order.orderId });
  if (!escrow || escrow.status !== "escrow") {
    throw new Error(`Expected escrow, got ${escrow?.status ?? "no order"}`);
  }
  console.log("   status:", escrow.status, "✓");

  console.log("3. Approved vendor fulfills → credited");
  await client.mutation(api.pointMarket.fulfillOrder, { orderId: order.orderId });
  const credited = await client.query(api.pointMarket.getMyOrder, { orderId: order.orderId });
  if (!credited || credited.status !== "credited") {
    throw new Error(`Expected credited, got ${credited?.status ?? "no order"}`);
  }
  console.log("   status:", credited.status, "✓");

  console.log("4. Insufficient-funds path");
  console.log("Pause here and reduce the test user's wallet below this package's price using your approved dev/admin workflow.");
  const prompt = createInterface({ input, output });
  await prompt.question("Press Enter when the test wallet is below the package price... ");
  prompt.close();
  try {
    await client.mutation(api.pointMarket.createOrder, { packageId: typedPackageId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes("insufficient ngn wallet balance")) {
      console.log("   rejected with insufficient wallet balance ✓");
      console.log("\nAll manual Convex checks passed.");
      return;
    }
    throw err;
  }
  throw new Error("Expected insufficient-funds rejection, but the order succeeded.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
