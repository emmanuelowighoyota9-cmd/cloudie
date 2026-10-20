import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  CircleAlert,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Send,
  UserRound,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { StatusBadge } from "@/components/admin/shared";
import { EASE_OUT_QUINT } from "@/components/motion";
import { PointsCost } from "@/components/tracking/PointsCost";
import { ShipmentEvent } from "@/components/tracking/ShipmentEvent";
import { TrackingLinkBox } from "@/components/tracking/TrackingLinkBox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { neonApi } from "@/lib/neonApi";
import { notifyNeonQueries } from "@/lib/neonClient";
import { usePricing } from "@/lib/pricing";
import { isClosedStatus, toViewEvents, toViewShipment } from "@/lib/shipmentView";
import { statusLabel } from "@/lib/trackingUi";
import { cn } from "@/lib/utils";

/**
 * The shipment API owns this status enum. Customers can move a parcel along the
 * journey but cannot mark it delivered, failed or cancelled by hand — those
 * transitions stay with the carrier.
 */
const NOTE_STATUSES = ["pending", "picked_up", "in_transit", "out_for_delivery"] as const;

function dateLabel(ts?: number | null) {
  if (!ts) return "Pending";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function ShipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const detail = useQuery(
    api.trackingUser.myShipmentDetail,
    id ? { id: id as Id<"trackingShipments"> } : "skip",
  );
  const balanceNgn = useQuery(api.wallet.getBalance);
  const { price, ngnPerPoint } = usePricing();
  // Admin-configured price wins; the design's baseline for a note is 1 point.
  const eventCost = Number(price("shipment_event_add", 1).points);

  const [status, setStatus] = useState<string>("");
  const [message, setMessage] = useState("");
  const [location, setLocation] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelledLocally, setCancelledLocally] = useState(false);

  const shipment = useMemo(() => (detail?.shipment ? toViewShipment(detail.shipment) : null), [detail]);
  const events = useMemo(() => toViewEvents(detail?.events), [detail]);

  const pointsBalance =
    typeof balanceNgn === "number" && ngnPerPoint > 0 ? Math.round(balanceNgn / ngnPerPoint) : undefined;

  if (detail === undefined) return <DetailSkeleton />;

  if (!detail || !shipment) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <Package className="mx-auto size-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-semibold text-foreground">Shipment not found</p>
        <p className="mt-1 text-xs text-muted-foreground">
          It may belong to another account, or the link is out of date.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-5 gap-1.5">
          <Link to="/shipments">
            <ArrowLeft className="size-4" /> Back to shipments
          </Link>
        </Button>
      </div>
    );
  }

  const s = shipment;
  const currentStatus = cancelledLocally ? "cancelled" : s.statusKey;
  const ownerId = String((detail.shipment as { userId?: string }).userId ?? "");
  const isSender = ownerId !== "" && Boolean(user?.id) && ownerId === String(user?.id);
  const closed = cancelledLocally || isClosedStatus(s.status);
  const canAfford = pointsBalance !== undefined && pointsBalance >= eventCost;
  const defaultStatus = NOTE_STATUSES.includes(currentStatus as (typeof NOTE_STATUSES)[number])
    ? currentStatus
    : "in_transit";
  const statusValue = status || defaultStatus;

  const post = async () => {
    const trimmed = message.trim();
    if (trimmed.length < 3) {
      setFieldError("Add a few words so the recipient knows what changed.");
      return;
    }
    setFieldError(null);
    setSubmitError(null);
    setPosting(true);
    try {
      await neonApi.updateShipment(s.id, {
        status: statusValue,
        ...(location.trim() ? { location: location.trim() } : {}),
        event_description: trimmed,
      });
      notifyNeonQueries();
      toast.success("Update posted to the timeline");
      setMessage("");
      setLocation("");
      setStatus("");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not post this update");
    } finally {
      setPosting(false);
    }
  };

  const cancelShipment = async () => {
    setCancelling(true);
    try {
      await neonApi.updateShipment(s.id, { status: "cancelled" });
      notifyNeonQueries();
      setCancelledLocally(true);
      setCancelOpen(false);
      toast.success(`${s.trackingNumber} cancelled`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel this shipment");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: EASE_OUT_QUINT }}
      className="mx-auto w-full max-w-6xl space-y-4"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          onClick={() => navigate("/shipments")}
          aria-label="Back to shipments"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-mono text-lg font-bold tracking-tight text-foreground sm:text-xl">
              {s.trackingNumber}
            </h1>
            <StatusBadge status={currentStatus} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isSender ? "You are the sender" : "Shared with you"} · {s.service}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="w-full gap-1.5 sm:w-auto">
          <Link to={`/shipments/${s.id}/edit`}>
            <Pencil className="size-3.5" /> Edit details
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        {/* ── Left: timeline + add update ───────────────────────────────── */}
        <div className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="section-label text-primary">Timeline</h2>
                <span className="rounded-full border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                  {events.length}
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
                </span>
                Live
              </span>
            </div>

            {events.length === 0 ? (
              <div className="py-10 text-center">
                <MapPin className="mx-auto size-8 text-muted-foreground/30" />
                <p className="mt-2 text-xs text-muted-foreground">
                  No scans yet. The first carrier event appears here automatically.
                </p>
              </div>
            ) : (
              <ol className="mt-4">
                {events.map((event, index) => (
                  <ShipmentEvent
                    key={event.id}
                    status={event.status}
                    title={event.title}
                    description={event.description}
                    locationLabel={event.location}
                    timestamp={event.timestamp}
                    latest={index === 0}
                    last={index === events.length - 1}
                  />
                ))}
              </ol>
            )}
          </section>

          {/* Post update — sticks to the bottom of the viewport while reading. */}
          <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_18px_40px_-32px_hsl(var(--shadow-color)/0.6)] sm:p-5 lg:sticky lg:bottom-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="section-label text-primary">Add update</h2>
              <PointsCost cost={eventCost} balance={pointsBalance} />
            </div>

            {closed ? (
              <p className="mt-3 rounded-xl border border-border bg-surface-2 px-3 py-2 text-[11px] text-muted-foreground">
                This shipment is {statusLabel(currentStatus).toLowerCase()} — new updates are closed.
              </p>
            ) : (
              <form
                className="mt-3 space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void post();
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="update-status" className="text-xs text-foreground">Status</Label>
                    <Select value={statusValue} onValueChange={setStatus}>
                      <SelectTrigger id="update-status" className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NOTE_STATUSES.map((choice) => (
                          <SelectItem key={choice} value={choice} className="text-xs">
                            {statusLabel(choice)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="update-location" className="text-xs text-foreground">
                      Location <span className="font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="update-location"
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                      placeholder="Lagos sorting hub"
                      maxLength={200}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="update-message" className="text-xs text-foreground">Message</Label>
                  <Textarea
                    id="update-message"
                    value={message}
                    onChange={(event) => {
                      setMessage(event.target.value);
                      if (fieldError) setFieldError(null);
                    }}
                    placeholder="Parcel handed to the courier at the Lekki pickup point."
                    rows={3}
                    maxLength={500}
                    aria-invalid={fieldError ? true : undefined}
                    aria-describedby={fieldError ? "update-message-error" : undefined}
                    className={cn("min-h-[76px] text-xs", fieldError && "border-destructive")}
                  />
                  <div className="flex items-center justify-between gap-2">
                    {fieldError ? (
                      <p id="update-message-error" role="alert" className="text-[11px] text-destructive">
                        {fieldError}
                      </p>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        Status changes appear on the recipient's tracking page.
                      </span>
                    )}
                    <span className="text-[10px] tabular-nums text-muted-foreground">{message.length}/500</span>
                  </div>
                </div>

                {submitError && (
                  <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>{submitError}</span>
                  </div>
                )}

                {pointsBalance !== undefined && !canAfford && (
                  <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <p>
                      You need {(eventCost - pointsBalance).toLocaleString()} more points.{" "}
                      <Link to="/buy-points" className="font-semibold underline underline-offset-2">Top up</Link>
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button type="submit" size="sm" className="gap-1.5" disabled={posting || !canAfford}>
                    {posting ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Posting…
                      </>
                    ) : (
                      <>
                        <Send className="size-3.5" /> Post update (−{eventCost} pt)
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </section>
        </div>

        {/* ── Right: parties, parcel, tracking link ─────────────────────── */}
        <div className="space-y-3">
          <PartyCard
            title="Sender"
            name={s.senderName}
            place={[s.senderCity, s.senderCountry].filter(Boolean).join(", ")}
            you={isSender}
          />
          <PartyCard
            title="Recipient"
            name={s.recipientName}
            place={[s.recipientCity, s.recipientCountry].filter(Boolean).join(", ")}
            you={false}
          />

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="section-label text-primary">Parcel</h2>
            <dl className="mt-3 space-y-2 text-xs">
              <Row label="Contents" value={s.packageDescription || "Not described"} />
              <Row label="Weight" value={s.weightLabel || "—"} />
              <Row label="Dimensions" value={s.dimensions || "—"} />
              <Row label="Service" value={s.service} />
              <Row
                label={s.deliveredAt ? "Delivered" : "Est. delivery"}
                value={dateLabel(s.deliveredAt ?? s.estimatedDelivery)}
              />
            </dl>
          </section>

          <TrackingLinkBox trackingNumber={s.trackingNumber} />

          {/* Action row */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              className="flex-1 gap-1.5"
              disabled={closed}
              onClick={() => setCancelOpen(true)}
            >
              <Ban className="size-3.5" /> Cancel shipment
            </Button>
            <Button asChild variant="outline" size="sm" className="flex-1 gap-1.5">
              <Link to={`/shipments/${s.id}/updates`}>All updates</Link>
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {s.trackingNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              The shipment stops moving and the recipient's tracking page shows it as cancelled. This cannot
              be undone — book a new shipment instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep shipment</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cancelling}
              onClick={(event) => {
                event.preventDefault();
                void cancelShipment();
              }}
            >
              {cancelling ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Cancel shipment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

function PartyCard({ title, name, place, you }: { title: string; name: string; place: string; you: boolean }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="section-label text-primary">{title}</h2>
        {you && (
          <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            You
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-muted-foreground" aria-hidden>
          <UserRound className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{name || "Not recorded"}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{place || "Not recorded"}</span>
          </p>
        </div>
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
        Full address and phone stay with the carrier — they never appear on the public tracker.
      </p>
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4" aria-busy="true" aria-label="Loading shipment">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
