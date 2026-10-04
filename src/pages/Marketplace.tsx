import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { usePricing } from "@/lib/pricing";
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
  ImageOff,
} from "lucide-react";
import { useMemo, useState } from "react";
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

type CatalogOrderPageProps = {
  mode: "numbers" | "boost";
  products: Array<{
    _id: Id<"marketplaceProducts">;
    name: string;
    description: string;
    category: string;
    pointsPrice: number;
    imageUrl?: string;
    provider?: string;
    providerAvailableQuantity?: number;
  }>;
  balance: number | null | undefined;
  pointsWithNgn: (points: number) => string;
  onBuy: (product: CatalogOrderPageProps["products"][number], quantity: number) => Promise<void>;
};

function CatalogOrderPage({ mode, products, balance, pointsWithNgn, onBuy }: CatalogOrderPageProps) {
  const [selectedId, setSelectedId] = useState<Id<"marketplaceProducts"> | "">("");
  const [quantity, setQuantity] = useState(1);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("All");
  const selected = products.find((product) => product._id === selectedId) ?? null;

  const countries = useMemo(() => {
    const values = new Set<string>();
    products.forEach((product) => {
      const text = `${product.name} ${product.category}`;
      const match = text.match(/\b(US|USA|UK|United Kingdom|Canada|Germany|France|Australia|Nigeria|Vietnam|India|Spain|Italy|Netherlands|Brazil|Mexico|Turkey|Indonesia|Philippines)\b/i);
      if (match) values.add(match[1]);
    });
    return ["All", ...Array.from(values).sort()];
  }, [products]);

  const boostCategories = useMemo(() => ["All", ...Array.from(new Set(products.map((product) => product.category).filter(Boolean))).sort()], [products]);

  const filtered = useMemo(() => {
    const needle = normalize(query);
    return products.filter((product) => {
      const haystack = normalize(`${product.name} ${product.category} ${product.description}`);
      const matchesCountry = country === "All" || haystack.includes(normalize(country));
      return matchesCountry && (!needle || haystack.includes(needle));
    });
  }, [products, query, country]);

  const charge = selected ? selected.pointsPrice * Math.max(1, quantity) : 0;
  const canBuy = Boolean(selected) && (balance ?? 0) >= charge &&
    quantity >= 1 && quantity <= Math.min(100, selected?.providerAvailableQuantity ?? 100);

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden pb-24">
      <div className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          {mode === "numbers" ? "Numbers" : "Social boost"}
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          {mode === "numbers" ? "Buy Number" : "Boost Socials"}
        </h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          {mode === "numbers"
            ? "Choose a real number product, review availability and purchase securely with your points."
            : "Choose a real growth service, select quantity and place the order from your points balance."}
        </p>
      </div>

      <Card className="overflow-hidden rounded-2xl border-primary/15 shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3">
            <div>
              <p className="text-xs text-muted-foreground">Available balance</p>
              <p className="text-lg font-bold">{(balance ?? 0).toLocaleString()} pts</p>
            </div>
            <Badge variant="outline">{filtered.length} available products</Badge>
          </div>

          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold">
                {mode === "numbers" ? "Select Country" : "Category"}
              </label>
              <select
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className="h-12 w-full rounded-xl border bg-background px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {(mode === "numbers" ? countries : boostCategories).map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">
                {mode === "numbers" ? "Select Service" : "Service"}
              </label>
              <select
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value as Id<"marketplaceProducts">)}
                className="h-12 w-full rounded-xl border bg-background px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <option value="">Choose a {mode === "numbers" ? "number service" : "boost service"}</option>
                {filtered.map((product) => (
                  <option key={product._id} value={product._id}>
                    {product.name} — {product.pointsPrice.toLocaleString()} pts
                  </option>
                ))}
              </select>
            </div>

            {mode === "numbers" && (
              <div>
                <label className="mb-2 block text-sm font-semibold">Select Pool</label>
                <div className="flex min-h-12 items-center rounded-xl border bg-muted/40 px-4 text-sm text-muted-foreground">
                  {selected ? "Provider pool selected from the product catalog" : "Choose a service first"}
                </div>
              </div>
            )}

            {mode === "boost" && (
              <div>
                <label className="mb-2 block text-sm font-semibold">Product search</label>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search followers, likes, views, comments..."
                  className="h-12 w-full rounded-xl border bg-background px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Target links are not collected here because the connected provider purchase API currently does not accept a target URL.
                </p>
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-semibold">Quantity</label>
              <input
                type="number"
                min={1}
                max={Math.min(100, selected?.providerAvailableQuantity ?? 100)}
                value={quantity}
                onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                className="h-12 w-full rounded-xl border bg-background px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Min: 1 · Max: {Math.min(100, selected?.providerAvailableQuantity ?? 100)}
              </p>
            </div>

            {selected && (
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="flex gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {selected.imageUrl ? (
                      <img src={selected.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center"><Package className="h-5 w-5 text-muted-foreground" /></div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold">{selected.name}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{selected.description}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t pt-3">
                  <span className="text-sm font-medium">Charge</span>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary">{charge.toLocaleString()} pts</p>
                    <p className="text-xs text-muted-foreground">{pointsWithNgn(charge)}</p>
                  </div>
                </div>
              </div>
            )}

            <Button
              className="h-12 w-full rounded-xl text-base font-semibold"
              disabled={!canBuy}
              onClick={() => selected && onBuy(selected, quantity)}
            >
              {selected ? `Place ${mode === "numbers" ? "number order" : "boost order"}` : "Choose a service first"}
            </Button>

            {selected && (balance ?? 0) < charge && (
              <p className="text-center text-xs font-medium text-destructive">
                Insufficient points for this order.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Marketplace() {
  const { pointsWithNgn } = usePricing();
  const location = useLocation();
  const products = useQuery(api.marketplace.listProducts, {});
  const orders = useQuery(api.marketplace.getMyOrders);
  const balance = useQuery(api.points.getBalance);
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
    price: number,
    provider?: string,
    quantity = 1,
  ) => {
    const totalPrice = price * quantity;
    if ((balance ?? 0) < totalPrice) {
      toast.error("Insufficient points. Add funds before purchasing.");
      return;
    }

    if (!confirm(`Purchase "${name}" for ${totalPrice} points?`)) return;

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
        products={catalogProducts}
        balance={balance}
        pointsWithNgn={pointsWithNgn}
        onBuy={async (product, quantity) => {
          await handleBuy(
            product._id,
            product.name,
            product.pointsPrice,
            product.provider,
            quantity,
          );
        }}
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
          pointsWithNgn={pointsWithNgn}
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
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          loading="lazy"
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white/80">
                            <ImageOff className="h-5 w-5" />
                          </div>
                        </div>
                      )}
                      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
                        <Badge variant="secondary" className="max-w-[70%] truncate border-white/20 bg-black/45 text-white backdrop-blur-sm">
                          {product.category}
                        </Badge>

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
                            {product.pointsPrice.toLocaleString()} pts
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                            {pointsWithNgn(product.pointsPrice)}
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
                          disabled={outOfStock || buying === product._id || (balance ?? 0) < product.pointsPrice}
                          onClick={() => handleBuy(product._id, product.name, product.pointsPrice, product.provider)}
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
              onBuy={() => handleBuy(selected._id, selected.name, selected.pointsPrice, selected.provider)}
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
              <p className="mt-1 font-semibold">{product.pointsPrice} points</p>
            </div>
            <div className="rounded-lg border p-3">
              <span className="text-xs text-muted-foreground">Stock</span>
              <p className="mt-1 font-semibold">{stock === undefined ? "Available" : stock.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border p-3">
              <span className="text-xs text-muted-foreground">Your balance</span>
              <p className="mt-1 font-semibold">{balance.toLocaleString()} points</p>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            Product details are provider-supplied. Sensitive fulfillment data is not displayed in the public catalog and is only handled by the authorized order flow.
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={outOfStock || balance < product.pointsPrice || buying} onClick={onBuy}>
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
  pointsWithNgn,
  refreshLogspanelOrder,
}: {
  orders: any[] | undefined;
  pointsWithNgn: (points: number) => string;
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
                {pointsWithNgn(order.totalPoints)} • {new Date(order.createdAt).toLocaleString()}
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
