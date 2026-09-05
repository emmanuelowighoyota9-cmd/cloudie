import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Empty, EmptyMedia, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Receipt, Search, Package, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
  paid: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  escrow: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  refunded: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  disputed: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  cancelled: "bg-gray-100 text-gray-700 dark:bg-gray-900/50 dark:text-gray-300",
};

export default function Orders() {
  const orders = useQuery(api.marketplace.getMyOrders);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = (orders ?? []).filter((o) => {
    if (filter !== "all" && o.status !== filter) return false;
    if (search && !o._id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">My Orders</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">View and manage your marketplace orders.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search orders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
            <SelectItem value="disputed">Disputed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders */}
      {orders === undefined ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="p-4 animate-pulse"><div className="flex items-center gap-4"><div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-700" /><div className="flex-1 space-y-2"><div className="h-3 w-32 bg-slate-100 dark:bg-slate-700 rounded" /><div className="h-2 w-48 bg-slate-100 dark:bg-slate-700 rounded" /></div></div></CardContent></Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Empty>
          <EmptyMedia variant="icon"><Receipt /></EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No orders found</EmptyTitle>
            <EmptyDescription>
              {search || filter !== "all" ? "Try adjusting your filters." : "Your marketplace orders will appear here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Card>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Order</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Points</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {filtered.map((o) => (
                      <tr key={o._id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">
                          #{o._id.slice(-8)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={`${statusColors[o.status] ?? ""} border-0 text-xs capitalize`}>{o.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-slate-900 dark:text-white">{o.totalPoints.toLocaleString()} pts</td>
                        <td className="px-4 py-3 text-sm text-right text-slate-500">{new Date(o.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((o) => (
              <Card key={o._id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">Order #{o._id.slice(-8)}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{new Date(o.createdAt).toLocaleDateString()}</p>
                    </div>
                    <Badge className={`${statusColors[o.status] ?? ""} border-0 text-xs capitalize`}>{o.status}</Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-blue-600">{o.totalPoints.toLocaleString()} pts</span>
                    <span className="text-xs text-slate-400">{o.quantity}× item</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
