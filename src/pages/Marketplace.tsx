import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatNgn, usePricing } from "@/lib/pricing";
import type { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyMedia, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import {
  Search,
  ShoppingBag,
  Coins,
  Package,
  SlidersHorizontal,
  RefreshCw,
  Boxes,
  Store,
  ChevronRight,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
import { toast } from "sonner";

type Catalog = "marketplace-i" | "marketplace-ii" | "numbers" | "boost";
type View = "products" | "orders";

const MARKETPLACE_I = [
  "Discord",
  "Texting Numbers",
  "Outlook",
  "Apple",
  "Emails",
  "VPN",
  "Snapchat",
  "Reddit",
  "Twitter",
  "Instagram",
  "TikTok",
  "Facebook",
  "Gomeo Edu",
  "Netflix Premium",
  "Clone Tiik.T0k",
  "Aged Farming Clones",
];

const MARKETPLACE_II = [
  "Facebook",
  "Instagram",
  "New FB Accounts",
  "Pinterest",
  "Random Countries FB",
  "Self-created and Nurtured Accounts",
  "TikTok Account",
];

const NUMBER_TERMS = [
  "number", "numbers", "virtual number", "texting number", "phone number",
  "sms", "otp", "voip", "whatsapp number", "telegram number",
];

const BOOST_TERMS = [
  "boost", "boosting", "social boost", "social boosting", "followers",
  "likes", "views", "comments", "subscribers", "engagement", "members",
  "impressions", "watch time", "retweets", "shares", "reactions",
];

const normalize = (value: string) => value.trim().toLowerCase();

function belongsToCatalog(product: { category: string; name: string }, catalog: Catalog) {
  const haystack = normalize(`${product.category} ${product.name}`);
  const terms =
    catalog === "marketplace-i"
      ? MARKETPLACE_I
      : catalog === "marketplace-ii"
        ? MARKETPLACE_II
        : catalog === "numbers"
          ? NUMBER_TERMS
          : BOOST_TERMS;
  return terms.some((term) => haystack.includes(normalize(term)));
}

function stockFor(product: { provider?: string; providerAvailableQuantity?: number }) {
  if (product.providerAvailableQuantity !== undefined) return product.providerAvailableQuantity;
  return undefined;
}

type MarketplaceImageProduct = {
  name: string;
  category: string;
  imageUrl?: string;
};

const PRODUCT_IMAGE_FALLBACKS = [
  {
    terms: ["instagram", "ig"],
    platform: "Instagram",
    icon: "◎",
    className: "from-fuchsia-500 via-rose-500 to-orange-400",
  },
  {
    terms: ["tiktok", "tik tok"],
    platform: "TikTok",
    icon: "♪",
    className: "from-slate-950 via-slate-900 to-cyan-500",
  },
  {
    terms: ["facebook", "fb"],
    platform: "Facebook",
    icon: "f",
    className: "from-blue-700 to-blue-500",
  },
  {
    terms: ["twitter", "x account", "twitter account"],
    platform: "X",
    icon: "𝕏",
    className: "from-black to-slate-700",
  },
  {
    terms: ["snapchat"],
    platform: "Snapchat",
    icon: "👻",
    className: "from-yellow-400 to-yellow-300",
  },
  {
    terms: ["reddit"],
    platform: "Reddit",
    icon: "●",
    className: "from-orange-600 to-orange-400",
  },
  {
    terms: ["discord"],
    platform: "Discord",
    icon: "◉",
    className: "from-indigo-700 to-indigo-500",
  },
  {
    terms: ["pinterest"],
    platform: "Pinterest",
    icon: "P",
    className: "from-red-700 to-red-500",
  },
  {
    terms: ["telegram"],
    platform: "Telegram",
    icon: "➤",
    className: "from-sky-600 to-sky-400",
  },
  {
    terms: ["youtube"],
    platform: "YouTube",
    icon: "▶",
    className: "from-red-700 to-red-500",
  },
] as const;

const DEFAULT_PRODUCT_IMAGE = "";

function getProductPlatform(product: MarketplaceImageProduct) {
  const haystack = normalize(`${product.category} ${product.name}`);
  return PRODUCT_IMAGE_FALLBACKS.find(({ terms }) =>
    terms.some((term) => haystack.includes(term)),
  );
}

function getProductImage(product: MarketplaceImageProduct) {
  return product.imageUrl?.trim() || "";
}

type CatalogOrderPageProps = {
  mode: "numbers" | "boost";
  balance: number | null | undefined;
};

function CatalogOrderPage({ mode, balance }: CatalogOrderPageProps) {
  const listNumberProducts = useAction(api.jejelaye.listNumberProducts);
  const purchaseNumber = useAction(api.jejelaye.purchaseNumber);
  const listBoostCategories = useAction(api.logspanel.listBoostCategories);
  const listBoostServices = useAction(api.logspanel.listBoostServices);

  const [numberProducts, setNumberProducts] = useState<Array<{
    productKey: string; serviceName: string; countryCode: string; countryName: string;
    serverKey: string; publicServiceKey: string; numberType: string; price: number;
    currency: string; available: number | null; variationId?: string; areaCodes: string[];
  }>>([]);
  const [boostCategories, setBoostCategories] = useState<string[]>([]);
  const [boostServices, setBoostServices] = useState<Array<{
    service_id: string; service_name: string; category: string; type: string;
    rate_per_1000?: string; price?: string; currency: string; min?: number; max?: number;
    refill?: boolean; cancel?: boolean;
  }>>([]);

  const [serviceId, setServiceId] = useState("");
  const [category, setCategory] = useState("");
  const [areaCode, setAreaCode] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [buyingNumber, setBuyingNumber] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedNumber = numberProducts.find((item) => item.productKey === serviceId) ?? null;
  const selectedBoost = boostServices.find((item) => item.service_id === serviceId) ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const load = async () => {
      try {
        if (mode === "numbers") {
          const rows = await listNumberProducts({ category: "usa" });
          if (!cancelled) setNumberProducts(rows);
        } else {
          const rows = await listBoostCategories({});
          if (!cancelled) setBoostCategories(rows.map((row) => row.name));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load catalog");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [mode, listNumberProducts, listBoostCategories]);

  useEffect(() => {
    if (mode !== "numbers" || !selectedNumber) {
      setAreaCode("");
      return;
    }
    setAreaCode(selectedNumber.areaCodes[0] ?? "");
  }, [mode, selectedNumber?.productKey]);
  useEffect(() => {
    if (mode !== "boost") return;
    let cancelled = false;
    setLoading(true);
    void listBoostServices({ category: category || undefined })
      .then((rows) => {
        if (!cancelled) {
          setBoostServices(rows as typeof boostServices);
          setServiceId("");
        }
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Unable to load boost services"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [mode, category, listBoostServices]);

  const visibleBoostServices = useMemo(() => {
    const needle = normalize(query);
    return boostServices.filter((service) =>
      !needle ||
      normalize(service.service_name).includes(needle) ||
      normalize(service.category).includes(needle) ||
      normalize(service.type).includes(needle),
    );
  }, [boostServices, query]);

  const providerPriceNgn = mode === "numbers"
    ? Number(selectedNumber?.price ?? 0)
    : Number(selectedBoost?.rate_per_1000 ?? selectedBoost?.price ?? 0);

  const maxQuantity = mode === "numbers"
    ? Math.max(1, selectedNumber?.available ?? 1)
    : Math.max(1, selectedBoost?.max ?? 1);

  const minQuantity = mode === "boost"
    ? Math.max(1, selectedBoost?.min ?? 1)
    : 1;

  const totalNgn = mode === "boost"
    ? providerPriceNgn * (quantity / 1000)
    : providerPriceNgn;

  const canAfford = (balance ?? 0) >= totalNgn;

  return (
    <div className="cloudie-marketplace min-w-0 max-w-full overflow-x-hidden pb-24">
      <div className="mb-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          {mode === "numbers" ? "Live numbers catalog" : "Live social boost catalog"}
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          {mode === "numbers" ? "Buy Number" : "Boost Socials"}
        </h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Live catalog data from the provider. Prices and availability are refreshed when you open or change a selection.
        </p>
      </div>

      {error && (
        <Card className="mb-4 border-destructive/30">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <Card className="overflow-hidden rounded-2xl border-primary/15 shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3">
            <div>
              <p className="text-xs text-muted-foreground">Cloudie wallet</p>
              <p className="text-lg font-bold">{formatNgn(balance ?? 0)}</p>
            </div>
            <Badge variant="outline">{loading ? "Refreshing…" : "Live"}</Badge>
          </div>

          <div className="space-y-5">
            {mode === "numbers" ? (
              <>
                <div>
                  <label className="mb-2 block text-sm font-semibold">Select product</label>
                  <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}
                    className="h-12 w-full rounded-xl border bg-background px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <option value="">Choose a number product</option>
                    {numberProducts.map((product) => (
                      <option key={product.productKey} value={product.productKey}>
                        {product.serviceName} - {product.countryCode}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedNumber?.areaCodes.length ? (
                  <div>
                    <label className="mb-2 block text-sm font-semibold">Area Code</label>
                    <select value={areaCode} onChange={(e) => setAreaCode(e.target.value)}
                      className="h-12 w-full rounded-xl border bg-background px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      <option value="">Random</option>
                      {selectedNumber.areaCodes.map((code) => <option key={code}>{code}</option>)}
                    </select>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div>
                  <label className="mb-2 block text-sm font-semibold">Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)}
                    className="h-12 w-full rounded-xl border bg-background px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <option value="">All categories</option>
                    {boostCategories.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold">Service</label>
                  <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}
                    className="h-12 w-full rounded-xl border bg-background px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <option value="">Choose a boost service</option>
                    {visibleBoostServices.map((service) => (
                      <option key={service.service_id} value={service.service_id}>
                        {service.service_name} — ₦{Number(service.rate_per_1000 ?? service.price ?? 0).toLocaleString("en-NG")}/1,000
                      </option>
                    ))}
                  </select>
                </div>
                <input value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search followers, likes, views, comments…"
                  className="h-12 w-full rounded-xl border bg-background px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" />
                <div>
                  <label className="mb-2 block text-sm font-semibold">Target link</label>
                  <input type="url" placeholder="https://instagram.com/…"
                    className="h-12 w-full rounded-xl border bg-background px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" />
                </div>
              </>
            )}

            {selectedNumber && (
              <div className="rounded-2xl border border-primary/10 bg-primary/[0.035] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {selectedNumber.serviceName} - {selectedNumber.countryCode}
                    </p>
                    <p className="text-xs text-muted-foreground">{selectedNumber.numberType} · {selectedNumber.serverKey || "Live catalog"}</p>
                  </div>
                  <Badge variant={selectedNumber.available_quantity > 0 ? "outline" : "destructive"}>
                    {selectedNumber.available === null ? "Available" : `${selectedNumber.available} available`}
                  </Badge>
                </div>
                <div className="mt-4 flex items-center justify-between border-t pt-3">
                  <span className="text-sm font-medium">Current price</span>
                  <span className="text-lg font-bold text-primary">₦{selectedNumber.price.toLocaleString("en-NG")}</span>
                </div>
              </div>
            )}

            {selectedBoost && (
              <div className="rounded-2xl border border-primary/10 bg-primary/[0.035] p-4">
                <p className="font-semibold">{selectedBoost.service_name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{selectedBoost.type} · {selectedBoost.category}</p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-background p-3"><span className="text-muted-foreground">Rate</span><p className="font-semibold">₦{providerPriceNgn.toLocaleString("en-NG")} / 1,000</p></div>
                  <div className="rounded-lg bg-background p-3"><span className="text-muted-foreground">Range</span><p className="font-semibold">{minQuantity.toLocaleString()}–{maxQuantity.toLocaleString()}</p></div>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">Refill: {selectedBoost.refill ? "Yes" : "No"} · Cancel: {selectedBoost.cancel ? "Yes" : "No"}</div>
              </div>
            )}

            {selectedBoost && (
              <div>
                <label className="mb-2 block text-sm font-semibold">Quantity</label>
                <input type="number" min={minQuantity} max={maxQuantity} value={quantity}
                  onChange={(e) => setQuantity(Math.min(maxQuantity, Math.max(minQuantity, Number(e.target.value) || minQuantity)))}
                  className="h-12 w-full rounded-xl border bg-background px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" />
              </div>
            )}

            {(selectedNumber || selectedBoost) && (
              <div className="rounded-2xl border border-primary/10 bg-primary/[0.035] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Estimated charge</span>
                  <span className="text-lg font-bold text-primary">₦{Math.ceil(totalNgn).toLocaleString("en-NG")}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Provider price · NGN wallet
                </p>
                {!canAfford && <p className="mt-2 text-xs font-medium text-destructive">Insufficient wallet balance.</p>}
              </div>
            )}

            <Button
              className="h-12 w-full rounded-xl text-base font-semibold"
              disabled={!selectedNumber || !canAfford || buyingNumber}
              onClick={async () => {
                if (!selectedNumber || !canAfford || buyingNumber) return;
                setBuyingNumber(true);
                try {
                  const idempotencyKey = `jejelaye-number-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
                  const result = await purchaseNumber({
                    productKey: selectedNumber.productKey,
                    category: "usa",
                    serverKey: selectedNumber.serverKey,
                    publicServiceKey: selectedNumber.publicServiceKey,
                    numberType: selectedNumber.numberType,
                    variationId: selectedNumber.variationId,
                    areaCodes: areaCode || undefined,
                    idempotencyKey,
                  });
                  toast.success(result.status === "waiting_for_otp" ? "Number reserved. Waiting for OTP." : "Number order submitted.");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Unable to purchase number");
                } finally {
                  setBuyingNumber(false);
                }
              }}
            >
              {buyingNumber ? "Processing…" : selectedNumber ? `Buy ${selectedNumber.serviceName}` : "Choose a product first"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Marketplace() {

  const location = useLocation();
  const products = useQuery(api.marketplace.listProducts, {});
  const orders = useQuery(api.marketplace.getMyOrders);
  const balance = useQuery(api.wallet.getBalance);
  const createOrder = useMutation(api.marketplace.createOrder);
  const purchaseLogspanel = useAction(api.logspanel.purchase);
  const refreshLogspanelOrder = useAction(api.logspanel.refreshOrder);

  const routeCatalog: Catalog = location.pathname === "/marketplace/numbers" ? "numbers" : location.pathname === "/marketplace/boost" ? "boost" : "marketplace-i";
  const [catalog, setCatalog] = useState<Catalog>(routeCatalog);
  const [view, setView] = useState<View>("products");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedProduct, setSelectedProduct] = useState<Id<"marketplaceProducts"> | null>(null);
  const [buying, setBuying] = useState<string | null>(null);

  const effectiveCatalog = location.pathname === "/marketplace/numbers" || location.pathname === "/marketplace/boost" ? routeCatalog : catalog;

  const catalogProducts = useMemo(() => {
    if (!products) return [];
    return products.filter((product) => belongsToCatalog(product, effectiveCatalog));
  }, [products, effectiveCatalog]);

  const categories = useMemo(() => {
    const values = new Set(catalogProducts.map((product) => product.category).filter(Boolean));
    return ["All", ...Array.from(values).sort()];
  }, [catalogProducts]);

  const filteredProducts = useMemo(() => {
    const needle = normalize(query);
    return catalogProducts.filter((product) => {
      const matchesCategory = category === "All" || product.category === category;
      const matchesSearch =
        !needle ||
        normalize(product.name).includes(needle) ||
        normalize(product.category).includes(needle) ||
        normalize(product.description).includes(needle);
      return matchesCategory && matchesSearch;
    });
  }, [catalogProducts, category, query]);

  const selected = selectedProduct
    ? catalogProducts.find((product) => product._id === selectedProduct) ?? null
    : null;

  const handleCatalogChange = (next: Catalog) => {
    setCatalog(next);
    setCategory("All");
    setQuery("");
    setSelectedProduct(null);
  };

  const handleBuy = async (
    productId: Id<"marketplaceProducts">,
    name: string,
    priceNgn: number,
    provider?: string,
    quantity = 1,
  ) => {
    const totalPrice = priceNgn * quantity;
    if ((balance ?? 0) < totalPrice) {
      toast.error("Insufficient NGN wallet balance. Fund your wallet before purchasing.");
      return;
    }

    if (!confirm(`Purchase "${name}" for ${formatNgn(totalPrice)}?`)) return;

    setBuying(productId);
    try {
      if (provider === "logspanel") {
        const idempotencyKey = `cloudie-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const result = await purchaseLogspanel({
          productId,
          quantity,
          idempotencyKey,
        });
        toast.success(
          result.status === "pending"
            ? "Order submitted and awaiting provider confirmation."
            : "Order placed and fulfilled.",
        );
      } else {
        await createOrder({ productId, quantity });
        toast.success("Order placed successfully.");
      }
      setView("orders");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to place order");
    } finally {
      setBuying(null);
    }
  };

  if (location.pathname === "/marketplace/numbers" || location.pathname === "/marketplace/boost") {
    const orderMode: "numbers" | "boost" =
      location.pathname === "/marketplace/numbers" ? "numbers" : "boost";
    return (
      <CatalogOrderPage
        mode={orderMode}
        balance={balance}
      />
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-4 overflow-x-hidden pb-24 sm:space-y-6 sm:pb-8">
      <div className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            <Store className="h-3.5 w-3.5" />
            Cloudie Marketplace
          </div>
          <h1 className="break-words text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
            Digital marketplace
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Browse real digital products by category, price and live stock.
          </p>
        </div>
        <div className="grid w-full grid-cols-2 rounded-lg border bg-background p-1 shadow-sm sm:flex sm:w-auto">
          <Button
            size="sm"
            variant={view === "products" ? "default" : "ghost"}
            onClick={() => setView("products")}
          >
            <ShoppingBag className="mr-2 h-4 w-4" />
            Browse
          </Button>
          <Button
            size="sm"
            variant={view === "orders" ? "default" : "ghost"}
            onClick={() => setView("orders")}
          >
            <Package className="mr-2 h-4 w-4" />
            My orders
          </Button>
        </div>
      </div>

      {view === "orders" ? (
        <OrdersView
          orders={orders}
          refreshLogspanelOrder={refreshLogspanelOrder}
        />
      ) : (
        <>
          {location.pathname === "/marketplace" ? (
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              {([
                ["marketplace-i", "Marketplace I", "Core digital inventory catalog"],
                ["marketplace-ii", "Marketplace II", "Extended country and account catalog"],
              ] as const).map(([id, label, description]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleCatalogChange(id)}
                  className={`min-w-0 overflow-hidden rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm sm:p-4 ${
                    catalog === id ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-card"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="break-words font-semibold">{label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
              <CardContent className="flex items-center justify-between gap-3 p-3 sm:p-4">
                <div>
                  <p className="text-sm font-semibold">{effectiveCatalog === "numbers" ? "Numbers" : "Social Boost"}</p>
                  <p className="text-xs text-muted-foreground">
                    {effectiveCatalog === "numbers"
                      ? "Browse available virtual, texting and verification numbers."
                      : "Browse social growth products such as followers, likes, views and engagement."}
                  </p>
                </div>
                <Badge variant="outline">{catalogProducts.length} products</Badge>
              </CardContent>
            </Card>
          )}

          <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex min-w-0 flex-col gap-3 lg:flex-row">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    aria-label="Search marketplace"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search products, categories, price or stock..."
                    className="h-11 w-full min-w-0 rounded-lg border bg-background pl-9 pr-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                  <select
                    aria-label="Filter by category"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm sm:min-w-44 sm:flex-none"
                  >
                    {categories.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  <Boxes className="mr-1 h-3 w-3" />
                  {filteredProducts.length} products
                </Badge>
                {category !== "All" && <Badge variant="secondary">{category}</Badge>}
                <span className="text-xs text-muted-foreground">
                  {effectiveCatalog === "marketplace-i" ? "Marketplace I" : effectiveCatalog === "marketplace-ii" ? "Marketplace II" : effectiveCatalog === "numbers" ? "Numbers" : "Social Boost"}
                </span>
              </div>
            </CardContent>
          </Card>

          {products === undefined ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((item) => (
                <Card key={item} className="rounded-xl">
                  <CardContent className="space-y-4 p-5">
                    <div className="h-5 w-24 animate-pulse rounded bg-muted" />
                    <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
                    <div className="h-12 animate-pulse rounded bg-muted" />
                    <div className="h-10 animate-pulse rounded bg-muted" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <Empty>
              <EmptyMedia variant="icon"><ShoppingBag /></EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No products found</EmptyTitle>
                <EmptyDescription>
                  Try another category or search term, or sync the provider catalog from the admin marketplace.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid min-w-0 gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => {
                const stock = stockFor(product);
                const outOfStock = stock !== undefined && stock <= 0;
                return (
                  <Card key={product._id} className="group min-w-0 max-w-full overflow-hidden rounded-xl border-slate-200 bg-card shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setSelectedProduct(product._id)}
                      className="relative block aspect-[5/2] w-full overflow-hidden bg-muted text-left"
                      aria-label={`View ${product.name}`}
                    >
                      {(() => {
                        const image = getProductImage(product);
                        const platform = getProductPlatform(product);
                        if (image) {
                          return (
                            <img
                              src={image}
                              alt={product.name}
                              loading="lazy"
                              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                            />
                          );
                        }
                        return (
                          <div className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br ${platform?.className ?? "from-slate-700 to-slate-500"} text-white transition duration-300 group-hover:scale-[1.03]`}>
                            <div className="absolute inset-0 bg-black/10" />
                            <div className="relative flex flex-col items-center gap-2 text-center">
                              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-4xl font-black shadow-lg ring-1 ring-white/25 backdrop-blur-sm">
                                {platform?.icon ?? "🛍️"}
                              </span>
                              <span className="text-sm font-bold tracking-wide drop-shadow-sm">
                                {platform?.platform ?? product.category}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
                        <Badge variant="secondary" className="max-w-[70%] truncate border-white/20 bg-black/45 text-white backdrop-blur-sm">
                          {product.category}
                        </Badge>

                        <span
                          aria-hidden="true"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-black/45 text-white shadow-sm backdrop-blur-sm"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M6 8h12l1 12H5L6 8Z" />
                            <path d="M9 8V6a3 3 0 0 1 6 0v2" />
                            <path d="M9 12h6" />
                          </svg>
                        </span>
                      </div>
                      {outOfStock && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                          <Badge variant="destructive">Out of stock</Badge>
                        </div>
                      )}
                    </button>

                    <CardContent className="min-w-0 p-3 sm:p-4">
                      <button
                        type="button"
                        onClick={() => setSelectedProduct(product._id)}
                        className="block w-full min-w-0 text-left"
                      >
                        <h3 className="line-clamp-2 break-words text-sm font-semibold leading-5 text-slate-900 dark:text-white">
                          {product.name}
                        </h3>
                        <p className="mt-1 line-clamp-2 break-words text-xs leading-4 text-muted-foreground">
                          {product.description}
                        </p>
                      </button>

                      <div className="mt-3 flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Price</span>
                          <span className="mt-0.5 flex items-center gap-1 text-base font-bold text-primary">
                            <Coins className="h-4 w-4 shrink-0" />
                            {formatNgn(product.priceNgn ?? product.pointsPrice * 15)}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                            NGN wallet price
                          </span>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Stock</span>
                          <span className={`mt-0.5 block text-sm font-semibold ${outOfStock ? "text-destructive" : "text-foreground"}`}>
                            {stock === undefined ? "Available" : stock.toLocaleString()}
                          </span>
                          {product.totalSold > 0 && (
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                              {product.totalSold.toLocaleString()} sold
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button variant="outline" className="min-w-0" onClick={() => setSelectedProduct(product._id)}>
                          Details
                        </Button>
                        <Button
                          className="min-w-0"
                          disabled={outOfStock || buying === product._id || (balance ?? 0) < (product.priceNgn ?? product.pointsPrice * 15)}
                          onClick={() => handleBuy(product._id, product.name, product.priceNgn ?? product.pointsPrice * 15, product.provider)}
                        >
                          {buying === product._id ? "Processing..." : outOfStock ? "Unavailable" : "Buy now"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {selected && (
            <ProductDetails
              product={selected}
              balance={balance ?? 0}
              onClose={() => setSelectedProduct(null)}
              onBuy={() => handleBuy(selected._id, selected.name, selected.priceNgn ?? selected.pointsPrice * 15, selected.provider)}
              buying={buying === selected._id}
            />
          )}
        </>
      )}
    </div>
  );
}

function ProductDetails({
  product,
  balance,
  onClose,
  onBuy,
  buying,
}: {
  product: any;
  balance: number;
  onClose: () => void;
  onBuy: () => void;
  buying: boolean;
}) {
  const stock = stockFor(product);
  const outOfStock = stock !== undefined && stock <= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <Card className="max-h-[92vh] w-full max-w-2xl min-w-0 overflow-auto rounded-t-2xl sm:rounded-2xl">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Badge variant="outline">{product.category}</Badge>
              <h2 className="mt-3 break-words text-xl font-bold">{product.name}</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>

          <p className="mt-4 break-words whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{product.description}</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <span className="text-xs text-muted-foreground">Price</span>
              <p className="mt-1 font-semibold">{formatNgn(product.priceNgn ?? product.pointsPrice * 15)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <span className="text-xs text-muted-foreground">Stock</span>
              <p className="mt-1 font-semibold">{stock === undefined ? "Available" : stock.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border p-3">
              <span className="text-xs text-muted-foreground">Your balance</span>
              <p className="mt-1 font-semibold">{formatNgn(balance)}</p>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            Product details are provider-supplied. Sensitive fulfillment data is not displayed in the public catalog and is only handled by the authorized order flow.
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={outOfStock || balance < (product.priceNgn ?? product.pointsPrice * 15) || buying} onClick={onBuy}>
              {buying ? "Processing..." : "Buy now"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function OrdersView({
  orders,
  refreshLogspanelOrder,
}: {
  orders: any[] | undefined;
  refreshLogspanelOrder: (args: { orderId: Id<"marketplaceOrders"> }) => Promise<{ status: string }>;
}) {
  if (orders === undefined) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Loading orders...</div>;
  }

  if (orders.length === 0) {
    return (
      <Empty>
        <EmptyMedia variant="icon"><Package /></EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>No orders yet</EmptyTitle>
          <EmptyDescription>Your marketplace purchases will appear here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <Card key={order._id} className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">Order {order._id.slice(-8)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatNgn(order.totalNgn ?? order.totalPoints * 15)} • {new Date(order.createdAt).toLocaleString()}
              </p>
              {order.providerStatus && (
                <p className="mt-1 text-xs text-muted-foreground">Provider status: {order.providerStatus}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={order.status === "completed" ? "default" : "secondary"}>{order.status}</Badge>
              {order.provider === "logspanel" && order.status === "pending" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const result = await refreshLogspanelOrder({ orderId: order._id });
                      toast.success(`Provider status: ${result.status}`);
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Unable to refresh order");
                    }
                  }}
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Refresh
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
