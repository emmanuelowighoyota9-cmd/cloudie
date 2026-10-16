import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlatformConfig } from "@/hooks/use-platform-config";
import { toast } from "sonner";

/** Minimal typing for the non-standard `beforeinstallprompt` event. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * Tracks PWA installability. Returns whether the native install prompt is
 * available and a function that triggers it.
 */
export function usePwaInstall() {
  const [deferredEvent, setDeferredEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferredEvent(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredEvent) return false;
    await deferredEvent.prompt();
    const choice = await deferredEvent.userChoice;
    setDeferredEvent(null);
    return choice.outcome === "accepted";
  }, [deferredEvent]);

  return {
    canInstall: Boolean(deferredEvent) && !installed,
    installed,
    promptInstall,
  };
}

/** Small nav-pill install button. Renders nothing when install isn't available. */
export function PwaInstallButton({ className }: { className?: string }) {
  const { canInstall, promptInstall } = usePwaInstall();
  const { brand } = usePlatformConfig();
  if (!canInstall) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={async () => {
        const accepted = await promptInstall();
        if (accepted) toast.success(`${brand.name} installed. Launch it from your home screen.`);
      }}
    >
      <Download className="h-3.5 w-3.5" />
      Install app
    </Button>
  );
}

/**
 * Dismissible install banner for the landing page. Uses the real browser
 * install flow when available, and explains the manual flow otherwise.
 */
export function PwaInstallBanner() {
  const { canInstall, installed, promptInstall } = usePwaInstall();
  const { brand } = usePlatformConfig();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("cloudie.install.dismissed") === "1";
  });

  if (installed || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-xl items-center gap-3 rounded-xl border border-border bg-card p-3 sm:inset-x-auto sm:right-4 sm:left-auto"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Download className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-tight text-foreground">
            Install {brand.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {canInstall
              ? "Add the operations console to your device for instant access."
              : `Use your browser menu → “Install app” to add ${brand.name} to your home screen.`}
          </p>
        </div>
        {canInstall && (
          <Button
            size="sm"
            onClick={async () => {
              const accepted = await promptInstall();
              if (accepted) toast.success(`${brand.name} installed.`);
            }}
          >
            Install
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Dismiss install prompt"
          className="h-8 w-8 shrink-0"
          onClick={() => {
            setDismissed(true);
            window.localStorage.setItem("cloudie.install.dismissed", "1");
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </motion.div>
    </AnimatePresence>
  );
}
