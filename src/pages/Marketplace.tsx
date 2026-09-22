import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { usePricing } from "@/lib/pricing";
import type { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyMedia, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { ShoppingBag, Coins, Package } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Marketplace() {
  const { pointsWithNgn } = usePricing();
  const products = useQuery(api.marketplace.listProducts, {});
  const orders = useQuery(api.marketplace.getMyOrders);
  const balance = useQuery(api.points.getBalance);
  const createOrder = useMutation(api.marketplace.createOrder);
  const [view, setView] = useState<"products" | "orders">("products");

  const handleBuy = async (productId: Id<"marketplaceProducts">, name: string, price: number) => {
    if (!confirm(`Purchase "${name}" for ${price} points?`)) return;
    try {
      await createOrder({ productId, quantity: 1 });
      toast.success("Order placed!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to order");
    }
  };

  return (      <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Marketplace</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Browse point packages from vendors.</p>
        </div>
        <div className="flex gap-2">
          <Button variant={view === "products" ? "default" : "outline"} size="sm" onClick={() => setView("products")}>Products</Button>
          <Button variant={view === "orders" ? "default" : "outline"} size="sm" onClick={() => setView("orders")}>My Orders</Button>
        </div>
      </div>

      {view === "products" ? (
        products === undefined ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <Card key={i} className="notebook-card"><CardContent className="p-4 animate-pulse"><div className="h-32 bg-muted rounded" /></CardContent></Card>)}
          </div>
        ) : products.length === 0 ? (
          <Empty>
            <EmptyMedia variant="icon"><ShoppingBag /></EmptyMedia>
            <EmptyHeader><EmptyTitle>No products available</EmptyTitle><EmptyDescription>Check back later for vendor products.</EmptyDescription></EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <Card key={p._id} className="notebook-card">
                <CardContent className="p-5">
                  {p.imageUrl && <div className="mb-3 h-32 rounded-lg bg-muted overflow-hidden"><img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" /></div>}
                  <Badge variant="outline" className="text-[10px] mb-2">{p.category}</Badge>
                  <h3 className="font-semibold text-slate-900 dark:text-white">{p.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{p.description}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-lg font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1"><Coins className="h-4 w-4" />{p.pointsPrice}</span>
                    <Button size="sm" onClick={() => handleBuy(p._id, p.name, p.pointsPrice)} disabled={(balance ?? 0) < p.pointsPrice} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">Buy</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
        orders === undefined ? (
          <p className="text-sm text-muted-foreground animate-pulse text-center py-12">Loading orders...</p>
        ) : orders.length === 0 ? (
          <Empty>
            <EmptyMedia variant="icon"><Package /></EmptyMedia>
            <EmptyHeader><EmptyTitle>No orders yet</EmptyTitle><EmptyDescription>Your marketplace orders will appear here.</EmptyDescription></EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => (
              <Card key={o._id} className="notebook-card">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>              <p className="text-sm font-medium text-slate-900 dark:text-white">Order {o._id.slice(-8)}</p><p className="text-xs text-muted-foreground">{pointsWithNgn(o.totalPoints)} • {new Date(o.createdAt).toLocaleDateString()}</p></div>
                  <Badge variant={o.status === "completed" ? "default" : "secondary"}>{o.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}
