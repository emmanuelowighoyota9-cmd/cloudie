// Manual verification against a live Convex deployment.
// Run: bun run verify:convex
// Requires CONVEX_URL, BUYER_AUTH_TOKEN, VENDOR_AUTH_TOKEN, TEST_PACKAGE_ID.
// The buyer needs sufficient NGN wallet balance to create the order. The vendor
// token must belong to the approved owner of the package. This script is NOT run in CI.

import { ConvexHttpClient } from "convex/browser";
import { api } from "../src/convex/_generated/api";
import type { Id } from "../src/convex/_generated/dataModel";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const url = process.env.CONVEX_URL;
const buyerToken = process.env.BUYER_AUTH_TOKEN;
const vendorToken = process.env.VENDOR_AUTH_TOKEN;
const packageId = process.env.TEST_PACKAGE_ID;

if (!url || !buyerToken || !vendorToken || !packageId) {
  console.error("CONVEX_URL, BUYER_AUTH_TOKEN, VENDOR_AUTH_TOKEN, and TEST_PACKAGE_ID are required.");
  process.exit(1);
}

const buyer = new ConvexHttpClient(url);
buyer.setAuth(buyerToken);
const vendor = new ConvexHttpClient(url);
vendor.setAuth(vendorToken);
const typedPackageId = packageId as Id<"pointPackages">;

async function main() {
  console.log("1. Buyer purchases → escrow");
  const order = await buyer.mutation(api.pointMarket.createOrder, {
    packageId: typedPackageId,
  });
  console.log("   orderId:", order.orderId);

  console.log("2. Buyer confirms order is in escrow");
  const escrow = await buyer.query(api.pointMarket.getMyOrder, { orderId: order.orderId });
  if (!escrow || escrow.status !== "escrow") {
    throw new Error(`Expected escrow, got ${escrow?.status ?? "no order"}`);
  }
  console.log("   status:", escrow.status, "✓");

  console.log("3. Approved vendor fulfills → credited");
  await vendor.mutation(api.pointMarket.fulfillOrder, { orderId: order.orderId });
  const credited = await buyer.query(api.pointMarket.getMyOrder, { orderId: order.orderId });
  if (!credited || credited.status !== "credited") {
    throw new Error(`Expected credited, got ${credited?.status ?? "no order"}`);
  }
  console.log("   status:", credited.status, "✓");

  console.log("4. Insufficient-funds path");
  console.log("Reduce the buyer test account's wallet below this package's price using your approved dev/admin workflow.");
  const prompt = createInterface({ input, output });
  await prompt.question("Press Enter when the buyer wallet is below the package price... ");
  prompt.close();

  try {
    await buyer.mutation(api.pointMarket.createOrder, { packageId: typedPackageId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Insufficient NGN wallet balance")) {
      console.log("   rejected with Insufficient NGN wallet balance ✓");
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
