import { useState } from "react";
import { Check, Copy, ExternalLink, QrCode } from "lucide-react";
import { toast } from "sonner";

import { QrCodeSvg } from "@/components/tracking/Codes";
import { Button } from "@/components/ui/button";
import { trackingUrl } from "@/lib/trackingUi";

/**
 * Hands the sender two ways to reach the public tracker: a QR for the parcel
 * label and a copyable /track link for messages. Both point at the same
 * privacy-safe page, so nothing extra is exposed.
 */
export function TrackingLinkBox({ trackingNumber }: { trackingNumber: string }) {
  const [copied, setCopied] = useState(false);
  const publicPath = `/track/${encodeURIComponent(trackingNumber)}`;
  const absolute = trackingUrl(trackingNumber);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      toast.success("Tracking link copied");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy the link — select it manually");
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="section-label text-primary">Public tracking</h2>
        <QrCode className="size-3.5 text-muted-foreground" aria-hidden />
      </div>

      <div className="mt-3 flex items-start gap-3">
        <div className="shrink-0 rounded-xl border border-border bg-background p-1.5">
          <QrCodeSvg value={absolute} size={76} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[11px] text-foreground">/track/{trackingNumber}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Share this with the recipient. It shows status and route only — never phone, email or address.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 px-2 text-[11px]" onClick={() => void copy()}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-[11px]">
              <a href={publicPath} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" /> Open
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
