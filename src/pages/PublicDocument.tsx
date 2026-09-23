import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation } from "convex/react";
import { motion } from "framer-motion";
import {
  Clock,
  Download,
  Eye,
  FileWarning,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type PublicState =
  | "loading"
  | "active"
  | "expired"
  | "revoked"
  | "private"
  | "not_found"
  | "rate_limited";

interface PublicDoc {
  title: string;
  fileName: string;
  pageCount: number;
  category: string;
  sensitive: boolean;
  viewCount: number;
  createdAt: number;
  expiresAt: number | null;
  imageUrl: string | null;
  pdfUrl: string | null;
}

const STATE_COPY: Record<Exclude<PublicState, "loading" | "active">, { title: string; body: string }> = {
  expired: { title: "This link has expired", body: "The owner set an expiry date on this share. Ask them for a new link." },
  revoked: { title: "This link was revoked", body: "The owner is no longer sharing this document publicly." },
  private: { title: "This document is private", body: "Sharing was turned off for this document." },
  not_found: { title: "Link not found", body: "This share link is invalid or has never existed." },
  rate_limited: { title: "Too many requests", body: "This link is receiving a lot of traffic. Please try again shortly." },
};

async function download(url: string, fileName: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("failed");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** Public, unauthenticated view of a shared SoftBaker document. */
export default function PublicDocument() {
  const { slug } = useParams<{ slug: string }>();
  const view = useMutation(api.docTemplates.publicViewDocument);
  const [state, setState] = useState<PublicState>("loading");
  const [doc, setDoc] = useState<PublicDoc | null>(null);
  const requested = useRef(false);

  useEffect(() => {
    if (!slug || requested.current) return;
    requested.current = true;
    let cancelled = false;
    view({ slug })
      .then((result) => {
        if (cancelled) return;
        const resultState = result.state as PublicState;
        setState(resultState);
        if (resultState === "active") setDoc(result as unknown as PublicDoc);
      })
      .catch(() => {
        if (!cancelled) setState("not_found");
      });
    return () => {
      cancelled = true;
    };
  }, [slug, view]);

  const fallbackInfo =
    STATE_COPY[(state === "loading" || state === "active" ? "not_found" : state)];

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-bold tracking-tight text-foreground">Cloudie SoftBaker</span>
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">Create your own</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        {state === "loading" ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-[540px]" />
          </div>
        ) : state === "active" && doc ? (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Shared document
                </p>
                <h1 className="mt-1 truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  {doc.title}
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3" /> {doc.viewCount} view{doc.viewCount === 1 ? "" : "s"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> shared{" "}
                    {new Date(doc.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  {doc.expiresAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> expires{" "}
                      {new Date(doc.expiresAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {doc.imageUrl && (
                  <Button
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => download(doc.imageUrl as string, doc.fileName.replace(/\.pdf$/i, "") + ".png")}
                  >
                    <Download className="h-4 w-4" /> PNG
                  </Button>
                )}
                {doc.pdfUrl && (
                  <Button
                    className="gap-1.5"
                    onClick={() => download(doc.pdfUrl as string, doc.fileName)}
                  >
                    <Download className="h-4 w-4" /> Download PDF
                  </Button>
                )}
              </div>
            </div>

            {doc.sensitive && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-[11px] leading-relaxed text-destructive">
                  <span className="font-semibold">Simulation output.</span> This document is watermarked and shows
                  fictional data. It is not a real credential, receipt or financial record.
                </p>
              </div>
            )}

            <div className="overflow-hidden rounded-xl border border-border bg-background p-4 shadow-sm">
              {doc.imageUrl ? (
                <motion.img
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  src={doc.imageUrl}
                  alt={doc.title}
                  className="mx-auto block h-auto w-full max-w-full rounded-lg"
                />
              ) : (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  The preview image is unavailable — use the download button above.
                </p>
              )}
            </div>

            <p className="text-center text-[11px] text-muted-foreground">
              {doc.pageCount} page{doc.pageCount === 1 ? "" : "s"} ·{" "}
              {doc.pdfUrl ? "PDF export available" : `PNG only`} · generated with Cloudie SoftBaker
            </p>
          </motion.div>
        ) : (
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-background px-6 py-14 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <FileWarning className="h-5 w-5" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">{fallbackInfo.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{fallbackInfo.body}</p>
            </div>
            <Button asChild variant="outline">
              <Link to="/">Go to Cloudie</Link>
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
