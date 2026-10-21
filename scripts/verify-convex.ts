// Manual verification against a live Convex deployment.
// Run: bun run verify:convex
// Requires CONVEX_URL, BUYER_AUTH_TOKEN, VENDOR_AUTH_TOKEN, TEST_PACKAGE_ID.
// The buyer needs sufficient NGN wallet balance to create the order. The vendor
// token must belong to the approved owner of the package. Separate clients are
// required because only the approved vendor can fulfill an order. This script
// is NOT run in CI.

import { ConvexHttpClient } from "convex/browser";
import { api } from "../src/convex/_generated/api";
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

const buyerClient = new ConvexHttpClient(url);
buyerClient.setAuth(buyerToken);

const vendorClient = new ConvexHttpClient(url);
vendorClient.setAuth(vendorToken);

async function main() {
  // Resolve the environment string to a generated Convex Id from a typed query,
  // avoiding a cast from an arbitrary string to Id<"pointPackages">.
  const packages = await buyerClient.query(api.pointMarket.listPackages, {});
  const selectedPackage = packages.find((item) => item._id === packageId);
  if (!selectedPackage) {
    throw new Error("TEST_PACKAGE_ID must identify an active package visible to the buyer.");
  }
  const typedPackageId = selectedPackage._id;

  console.log("1. Buyer purchases → escrow");
  const order = await buyerClient.mutation(api.pointMarket.createOrder, {
    packageId: typedPackageId,
  });
  console.log("   orderId:", order.orderId);

  console.log("2. Buyer confirms order is in escrow");
  const escrow = await buyerClient.query(api.pointMarket.getMyOrder, { orderId: order.orderId });
  if (!escrow || escrow.status !== "escrow") {
    throw new Error(`Expected escrow, got ${escrow?.status ?? "no order"}`);
  }
  console.log("   buyer status:", escrow.status, "✓");

  const vendorEscrow = await vendorClient.query(api.pointMarket.getMyOrder, { orderId: order.orderId });
  if (!vendorEscrow || vendorEscrow.status !== "escrow") {
    throw new Error(`Expected vendor to see escrow, got ${vendorEscrow?.status ?? "no order"}`);
  }
  console.log("   vendor status:", vendorEscrow.status, "✓");

  console.log("3. Approved vendor fulfills → credited");
  await vendorClient.mutation(api.pointMarket.fulfillOrder, { orderId: order.orderId });

  const buyerCredited = await buyerClient.query(api.pointMarket.getMyOrder, { orderId: order.orderId });
  if (!buyerCredited || buyerCredited.status !== "credited") {
    throw new Error(`Expected buyer to see credited, got ${buyerCredited?.status ?? "no order"}`);
  }
  const vendorCredited = await vendorClient.query(api.pointMarket.getMyOrder, { orderId: order.orderId });
  if (!vendorCredited || vendorCredited.status !== "credited") {
    throw new Error(`Expected vendor to see credited, got ${vendorCredited?.status ?? "no order"}`);
  }
  console.log("   buyer status:", buyerCredited.status, "✓");
  console.log("   vendor status:", vendorCredited.status, "✓");

  console.log("4. Insufficient-funds path");
  console.log("Reduce the buyer test account's wallet below this package's price using your approved dev/admin workflow.");
  const prompt = createInterface({ input, output });
  await prompt.question("Press Enter when the buyer wallet is below the package price... ");
  prompt.close();

  try {
    await buyerClient.mutation(api.pointMarket.createOrder, { packageId: typedPackageId });
  } catch (err: unknown) {
    const message =
      (err as { data?: string })?.data ??
      (err as Error)?.message ??
      String(err);
    if (message.includes("Insufficient NGN wallet balance")) {
      console.log("   rejected with Insufficient NGN wallet balance ✓");
      console.log("\nAll manual Convex checks passed.");
      return;
    }
    throw new Error(`Expected insufficient-funds error, got: ${message}`);
  }
  throw new Error("Expected insufficient-funds rejection, but the order succeeded.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
