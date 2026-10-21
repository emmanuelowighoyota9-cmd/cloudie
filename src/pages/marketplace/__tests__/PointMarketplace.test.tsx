// Bun's built-in test runner; Convex hooks are replaced with an in-memory fake.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import type { ReactNode } from "react";
import { fmtNaira, fmtPoints, naira, points } from "@/components/money/FundsGate";

const packageRow = {
  _id: "pkg_test",
  name: "Starter points bundle",
  points: 5000,
  priceMinor: 450000,
  currency: "NGN",
  unitPriceMinor: 90000,
  totalSold: 12,
  vendorId: "vendor_test",
  vendorName: "Verified Vendor",
  vendorVerified: true,
};

const queryState: {
  packages: typeof packageRow[];
  wallet: number;
  liveOrder: { status: string; orderId: string; points?: number } | null;
} = {
  packages: [packageRow],
  wallet: 10000,
  liveOrder: null,
};
const createOrder = mock(async (_args: { packageId: string }) => ({ orderId: "order_test" }));
const navigate = mock((_path: string) => {});

mock.module("convex/react", () => ({
  useQuery: (query: unknown): unknown => {
    if (query === api.pointMarket.listPackages) return queryState.packages;
    if (query === api.wallet.getBalance) return queryState.wallet;
    if (query === api.pointMarket.getMyOrder) return queryState.liveOrder;
    return undefined;
  },
  useMutation: () => createOrder,
}));

mock.module("react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
  useNavigate: () => navigate,
}));

const { default: PointMarketplace } = await import("../PointMarketplace");

function noMixedCurrencyAndPoints(container: HTMLElement) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const violations: string[] = [];
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent ?? "";
    if (text.includes("₦") && /point/i.test(text)) violations.push(text);
  }
  expect(violations).toEqual([]);
}

describe("PointMarketplace checkout integration", () => {
  beforeEach(() => {
    queryState.packages = [packageRow];
    queryState.wallet = 10000;
    queryState.liveOrder = null;
    createOrder.mockReset();
    createOrder.mockImplementation(async () => ({ orderId: "order_test" }));
    navigate.mockReset();
  });

  afterEach(() => cleanup());

  test("Buy opens review with formatted package price and signed points", async () => {
    const user = userEvent.setup();
    render(<PointMarketplace />);
    await user.click(screen.getByRole("button", { name: /Buy/i }));
    expect(screen.getByText(fmtNaira(naira(packageRow.priceMinor)))).toBeTruthy();
    expect(screen.getByText(fmtPoints(points(packageRow.points), { sign: true })).classList.contains("text-success")).toBe(true);
  });

  test("confirm calls createOrder with the selected package id", async () => {
    const user = userEvent.setup();
    render(<PointMarketplace />);
    await user.click(screen.getByRole("button", { name: /Buy/i }));
    await user.click(screen.getByRole("button", { name: "Confirm purchase" }));
    await waitFor(() => expect(createOrder).toHaveBeenCalledWith({ packageId: packageRow._id }));
  });

  test("escrow order remains pending and shows its reference", async () => {
    const user = userEvent.setup();
    queryState.liveOrder = { status: "escrow", orderId: "order_test" };
    render(<PointMarketplace />);
    await user.click(screen.getByRole("button", { name: /Buy/i }));
    await user.click(screen.getByRole("button", { name: "Confirm purchase" }));
    expect(await screen.findByText("order_test")).toBeTruthy();
    expect(screen.getByText("Funds in escrow")).toBeTruthy();
  });

  test("reactive credited order transitions to a receipt with signed points", async () => {
    const user = userEvent.setup();
    const view = render(<PointMarketplace />);
    await user.click(screen.getByRole("button", { name: /Buy/i }));
    await user.click(screen.getByRole("button", { name: "Confirm purchase" }));
    await waitFor(() => expect(createOrder).toHaveBeenCalled());
    queryState.liveOrder = { status: "credited", orderId: "order_test", points: 5000 };
    view.rerender(<PointMarketplace />);
    expect(await screen.findByText(/Points credited:/)).toBeTruthy();
    expect(screen.getByText(fmtPoints(points(5000), { sign: true })).classList.contains("text-success")).toBe(true);
  });

  test("insufficient wallet rejection enters failed state with no-charge copy", async () => {
    const user = userEvent.setup();
    createOrder.mockImplementation(async () => {
      throw new ConvexError({ message: "Insufficient wallet balance" });
    });
    render(<PointMarketplace />);
    await user.click(screen.getByRole("button", { name: /Buy/i }));
    await user.click(screen.getByRole("button", { name: "Confirm purchase" }));
    expect(await screen.findByText("You were not charged.")).toBeTruthy();
  });

  test("rendered text never mixes NGN and points", async () => {
    const user = userEvent.setup();
    const view = render(<PointMarketplace />);
    await user.click(screen.getByRole("button", { name: /Buy/i }));
    noMixedCurrencyAndPoints(document.body);
  });
});
