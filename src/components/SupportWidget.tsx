import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { usePlatformConfig } from "@/hooks/use-platform-config";
import { Mail, MessageCircle, Phone, ExternalLink, LifeBuoy, X } from "lucide-react";

const HIDDEN_PREFIXES = ["/admin", "/banking", "/site/"];

/**
 * Admin-configurable customer support launcher.
 * Renders nothing when the widget is disabled or no support channel is set, and
 * stays out of the way on tenant banking portals and the admin console.
 */
export function SupportWidget() {
  const { brand, support } = usePlatformConfig();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const hidden = HIDDEN_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));
  const hasChannel = Boolean(support.email || support.phone || support.whatsapp || support.helpCenterUrl);
  if (hidden || !support.widgetEnabled || (!hasChannel && support.faqs.length === 0)) return null;

  const contacts = [
    support.email && {
      key: "email",
      icon: Mail,
      label: "Email support",
      value: support.email,
      href: `mailto:${support.email}`,
    },
    support.phone && {
      key: "phone",
      icon: Phone,
      label: "Call us",
      value: support.phone,
      href: `tel:${support.phone.replace(/[^0-9+]/g, "")}`,
    },
    support.whatsapp && {
      key: "whatsapp",
      icon: MessageCircle,
      label: "WhatsApp",
      value: support.whatsapp,
      href: `https://wa.me/${support.whatsapp}`,
    },
  ].filter(Boolean) as { key: string; icon: typeof Mail; label: string; value: string; href: string }[];

  return (
    <div className="pointer-events-none fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-3 z-30 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6 print:hidden">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="pointer-events-auto w-[min(22rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl"
            role="dialog"
            aria-label={`${brand.name} support`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">{support.widgetTitle}</p>
                {support.hours && <p className="text-[11px] text-muted-foreground">{support.hours}</p>}
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)} aria-label="Close support">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{support.widgetMessage}</p>

            {contacts.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {contacts.map((contact) => (
                  <a
                    key={contact.key}
                    href={contact.href}
                    target={contact.key === "whatsapp" ? "_blank" : undefined}
                    rel="noreferrer"
                    className="flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2 transition-colors hover:bg-muted"
                  >
                    <contact.icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] text-muted-foreground">{contact.label}</span>
                      <span className="block truncate text-xs font-medium text-foreground">{contact.value}</span>
                    </span>
                  </a>
                ))}
              </div>
            )}

            {support.faqs.length > 0 && (
              <Accordion type="single" collapsible className="mt-3">
                {support.faqs.map((faq, index) => (
                  <AccordionItem key={faq.question} value={`faq-${index}`} className="border-border">
                    <AccordionTrigger className="py-2 text-left text-xs font-medium text-foreground hover:no-underline">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="pb-2 text-[11px] leading-relaxed text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}

            <div className="mt-3 flex flex-col gap-2">
              {support.email && (
                <Button asChild size="sm" className="w-full gap-1.5">
                  <a href={`mailto:${support.email}?subject=${encodeURIComponent(`${brand.name} support request`)}`}>
                    <Mail className="h-3.5 w-3.5" /> Message support
                  </a>
                </Button>
              )}
              {support.helpCenterUrl && (
                <Button asChild size="sm" variant="outline" className="w-full gap-1.5">
                  <a href={support.helpCenterUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" /> Help centre
                  </a>
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setOpen((value) => !value)}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        aria-expanded={open}
        aria-label={open ? "Close support" : "Open support"}
        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90"
      >
        {open ? <X className="h-5 w-5" /> : <LifeBuoy className="h-5 w-5" />}
      </motion.button>
    </div>
  );
}
