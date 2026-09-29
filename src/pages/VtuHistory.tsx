import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, usePaginatedQuery } from "convex/react";
import { ArrowLeft, ChevronDown, Loader2, ReceiptText, Zap } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { VtuHistoryItem } from "@/convex/vtu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/motion";
import { VtuServiceIcon, VtuStatusPill } from "@/components/vtu/shared";
import {
  newAttemptId,
  renderDocumentArtifacts,
  uploadArtifact,
} from "@/lib/renderClient";
import { formatNgn } from "@/lib/pricing";
import {
  maskIdentifier,
  vtuStatusCopy,
  vtuStatusReasonCopy,
} from "@/lib/vtu";
import { cn } from "@/lib/utils";

/**
 * A customer's own VTU history.
 *
 * READ-ONLY, and derived entirely from the transaction rows: every figure here
 * is a value the backend SNAPSHOTTED when the money moved (`nairaPrice`,
 * `ngnPerPoint`, `pointsDebited`). Nothing is recomputed from today's rate,
 * because a receipt that changes when the platform's rate changes is not a
 * record of anything.
 *
 * The rows arrive paginated and newest-first, and the list only claims to be
 * complete when the cursor says so. There are deliberately NO FILTERS in this
 * version — a customer's VTU history is short enough to scroll, and a filter
 * bar over an empty list is a worse first impression than an honest empty
 * state. Filters are a later slice.
 */

const PAGE_SIZE = 15;

export default function VtuHistory() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.vtu.listMyHistory,
    {},
    { initialNumItems: PAGE_SIZE },
  );
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="page-gutter mx-auto w-full max-w-3xl space-y-8 py-10 sm:py-14">
      <Reveal>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              VTU history
            </h1>
            <Badge variant="secondary" className="gap-1.5">
              <Zap className="h-3 w-3" />
              Airtime &amp; bills
            </Badge>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Every top-up and bill you have paid for with points, newest first.
            A top-up that did not go through shows as refunded with your points
            already back.
          </p>
          <Link
            to="/vtu"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All services
          </Link>
        </div>
      </Reveal>

      {status === "LoadingFirstPage" ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : results.length === 0 ? (
        <Reveal>
          <Card>
            <CardContent className="space-y-3 p-8 text-center">
              <p className="text-sm font-medium">Nothing here yet</p>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                Once you buy airtime, data or anything else on the services
                page, it appears here — newest first, with the rate you were
                charged frozen at the moment you bought.
              </p>
              <Button asChild size="sm" className="mt-1 gap-1.5">
                <Link to="/vtu">Browse services</Link>
              </Button>
            </CardContent>
          </Card>
        </Reveal>
      ) : (
        <>
          <StaggerGroup className="space-y-3">
            {results.map((tx) => (
              <StaggerItem key={tx._id}>
                <HistoryRow
                  tx={tx}
                  open={openId === tx._id}
                  onToggle={() =>
                    setOpenId((current) => (current === tx._id ? null : tx._id))
                  }
                />
              </StaggerItem>
            ))}
          </StaggerGroup>

          <div className="flex flex-col items-center gap-2">
            {status === "CanLoadMore" && (
              <Button variant="outline" onClick={() => loadMore(PAGE_SIZE)}>
                Load older
              </Button>
            )}
            {status === "LoadingMore" && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {status === "Exhausted" && (
              <p className="text-xs text-muted-foreground">
                That is the whole history.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Opens a transaction's receipt, generating it on the first click.
 *
 * THE WORK IS SPLIT FOR A REASON. `prepareReceipt` runs on the server and owns
 * every fact that must not come from the browser: the money figures, read from
 * the transaction's own snapshot, and the receipt number, derived from the
 * transaction id. What comes back is a frozen schema, layout and value map, and
 * this function only turns that into bytes — through the same
 * SVG → canvas → PNG/PDF pipeline every other document in the product uses, so
 * there is one renderer and not two.
 *
 * A second click on an already-issued receipt renders nothing at all: the
 * server answers with the existing document and this navigates straight to it.
 * That is what makes a double-click, or a refresh mid-render, harmless.
 */
function useReceiptOpener() {
  const navigate = useNavigate();
  const prepareReceipt = useMutation(api.vtuReceipt.prepareReceipt);
  const finalizeDocument = useMutation(api.docTemplates.finalizeDocument);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  // One at a time, across the whole page: two concurrent renders would race for
  // the same upload slots and one of them would lose its artifacts.
  const [busyId, setBusyId] = useState<string | null>(null);

  const openReceipt = async (transactionId: Id<"vtuTransactions">) => {
    if (busyId !== null) return;
    setBusyId(transactionId);
    try {
      const prepared = await prepareReceipt({ transactionId });
      if (!prepared.needsRender) {
        navigate(`/documents/${prepared.documentId}`);
        return;
      }

      const artifacts = await renderDocumentArtifacts(
        prepared.configuration,
        prepared.schema,
        prepared.values,
        { title: prepared.title, creationDate: Date.now() },
      );

      const [imageUploadUrl, pdfUploadUrl] = await Promise.all([
        generateUploadUrl({}),
        generateUploadUrl({}),
      ]);
      const [imageStorageId, pdfStorageId] = await Promise.all([
        uploadArtifact(imageUploadUrl, artifacts.imagePng),
        uploadArtifact(
          pdfUploadUrl,
          new Blob([artifacts.pdfBytes.slice().buffer as ArrayBuffer], {
            type: "application/pdf",
          }),
        ),
      ]);

      await finalizeDocument({
        documentId: prepared.documentId,
        attemptId: newAttemptId(),
        imageStorageId: imageStorageId as Id<"_storage">,
        pdfStorageId: pdfStorageId as Id<"_storage">,
        pageCount: artifacts.pageCount,
        sizeBytes: artifacts.sizeBytes,
      });

      navigate(`/documents/${prepared.documentId}`);
    } catch (error) {
      // A partial attempt is not lost: the row keeps its pointer, so the next
      // click resumes the draft rather than starting a second receipt.
      toast.error(
        error instanceof Error ? error.message : "Could not prepare the receipt",
      );
    } finally {
      setBusyId(null);
    }
  };

  return { openReceipt, busyId };
}

/**
 * One row, collapsed to the facts a customer scans for and expanded to the
 * facts they only need when something is wrong.
 *
 * The whole header is the toggle: a chevron alone is a 16px touch target, and
 * on a phone that is a miss. `aria-expanded` carries the state for assistive
 * tech so the row does not depend on the rotation of an icon.
 */
function HistoryRow({
  tx,
  open,
  onToggle,
}: {
  tx: VtuHistoryItem;
  open: boolean;
  onToggle: () => void;
}) {
  const { openReceipt, busyId } = useReceiptOpener();
  // Null for a status we have no wording for. `failed` is the only one of
  // those, and it is not a resting state — nothing here substitutes another
  // status's words for it, and nothing here names it.
  const copy = vtuStatusCopy(tx.status);
  const reason = vtuStatusReasonCopy(tx);
  // The stored value is already masked; masking again is idempotent for
  // display and means a legacy row written before masking cannot leak here.
  const destination = maskIdentifier(tx.customerIdentifier);

  return (
    // `py-0 gap-0` cancels `Card`'s own padding and gap, which the row supplies
    // itself — otherwise the button's p-4 stacks on top of them and the row is
    // twice as tall as its content, on every breakpoint.
    <Card className="gap-0 overflow-hidden py-0 transition-colors hover:border-primary/30 sm:gap-0 sm:py-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <VtuServiceIcon serviceType={tx.serviceType} className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{tx.serviceLabel}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
            {destination} · {fmtWhen(tx.createdAt)}
          </p>
        </div>

        <div className="hidden shrink-0 text-right sm:block">
          <p className="text-sm font-medium tabular-nums">
            {formatNgn(tx.nairaPrice)}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {tx.pointsDebited.toLocaleString()} pts
          </p>
        </div>

        {copy ? <VtuStatusPill status={tx.status} /> : null}

        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border bg-muted/20 p-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <Detail label="Value delivered" value={formatNgn(tx.nairaPrice)} />
            <Detail
              label="Points debited"
              value={`${tx.pointsDebited.toLocaleString()} pts`}
            />
            <Detail label="Rate at purchase" value={`₦${tx.ngnPerPoint}/pt`} />
            <Detail label="Destination" value={destination} mono />
            <Detail label="Requested" value={fmtWhen(tx.createdAt)} />
            <Detail
              label={tx.resolvedAt ? "Settled" : "Last update"}
              value={fmtWhen(tx.resolvedAt ?? tx.updatedAt)}
            />
          </dl>

          {reason && (
            <p className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              {reason}
            </p>
          )}

          <div className="space-y-1.5 border-t border-border pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Provider record
            </p>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
              <Detail label="Service code" value={tx.serviceCode} mono compact />
              <Detail
                label="Reference"
                value={tx.providerReference ?? "not issued yet"}
                mono
                compact
              />
              <Detail
                label="Routed to"
                value={tx.routedProvider ?? "not routed"}
                mono
                compact
              />
              <Detail
                label="Provider product"
                value={tx.routedProviderProductCode ?? "—"}
                mono
                compact
              />
            </dl>
          </div>

          {copy && (
            <p className="text-[11px] text-muted-foreground">{copy.detail}</p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 gap-1.5"
              onClick={() => openReceipt(tx._id)}
              disabled={busyId !== null}
            >
              {busyId === tx._id ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Preparing receipt…
                </>
              ) : (
                <>
                  <ReceiptText className="h-3.5 w-3.5" />
                  View receipt
                </>
              )}
            </Button>
            <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
              The receipt is created the first time you open it and never
              changes after that.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function Detail({
  label,
  value,
  mono,
  compact,
}: {
  label: string;
  value: string;
  mono?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt
        className={cn(
          "text-muted-foreground",
          compact ? "text-[10px] uppercase tracking-wider" : "text-xs",
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "break-anywhere font-medium",
          mono && "font-mono",
          compact ? "text-[11px]" : "text-sm",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

/**
 * "12 Mar, 14:05" — with the year only once it stops being obvious.
 *
 * Written out rather than pulled from an admin helper so the two surfaces can
 * diverge: an operator scanning an audit log and a customer checking whether
 * their top-up landed do not need the same amount of detail.
 */
function fmtWhen(ts: number): string {
  const date = new Date(ts);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString(
    "en-NG",
    sameYear ? DATE_FORMAT : { ...DATE_FORMAT, year: "numeric" },
  );
}
