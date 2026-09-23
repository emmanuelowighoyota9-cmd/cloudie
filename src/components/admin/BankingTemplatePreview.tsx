import { LayoutDashboard, MonitorSmartphone } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Miniature previews of a banking design kit.
 *
 * A tenant kit themes two surfaces — the customer banking app and the tenant
 * admin console. These previews paint both from the same palette/theme/radius
 * values the tenant actually renders with, so the super-admin console and the
 * tenant settings page can show a kit (or a draft of one) before it is saved.
 */

export type BankingKit = {
  primaryColor?: string;
  accentColor?: string;
  surfaceColor?: string;
  themeMode?: string;
  radius?: string;
};

const DEFAULT_PRIMARY = "#0F172A";
const DEFAULT_ACCENT = "#0EA5E9";
const DEFAULT_RADIUS = "0.75rem";

function kitColors(kit: BankingKit) {
  const isDark = kit.themeMode === "dark";
  const primary = kit.primaryColor || DEFAULT_PRIMARY;
  const accent = kit.accentColor || DEFAULT_ACCENT;
  return {
    isDark,
    primary,
    accent,
    surface: kit.surfaceColor || (isDark ? "#0B1220" : "#F8FAFC"),
    radius: kit.radius || DEFAULT_RADIUS,
  };
}

/** Miniature customer banking app: header bar, balance hero, two account cards. */
export function AppPreview({ kit, className }: { kit: BankingKit; className?: string }) {
  const { isDark, primary, accent, surface, radius } = kitColors(kit);
  const panel = isDark ? "#16233A" : "#FFFFFF";
  const hairline = isDark ? "rgba(255,255,255,0.10)" : "rgba(15,23,42,0.08)";
  const faint = isDark ? "rgba(255,255,255,0.30)" : "rgba(15,23,42,0.20)";
  return (
    <div className={cn("overflow-hidden", className)} style={{ backgroundColor: surface, borderRadius: radius }} aria-hidden>
      <div className="flex items-center justify-between px-2.5 py-1.5" style={{ backgroundColor: primary }}>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded" style={{ backgroundColor: accent }} />
          <span className="h-1.5 w-10 rounded-full bg-white/70" />
        </div>
        <span className="h-1.5 w-5 rounded-full bg-white/35" />
      </div>
      <div className="px-2.5 py-2.5 space-y-1.5">
        <span className="block h-1.5 w-3/5 rounded-full" style={{ backgroundColor: accent }} />
        <span className="block h-1 w-4/5 rounded-full" style={{ backgroundColor: faint }} />
        <div className="flex gap-1.5 pt-1">
          {[0, 1].map((i) => (
            <div key={i} className="flex-1 p-1.5" style={{ backgroundColor: panel, borderRadius: radius, border: `1px solid ${hairline}` }}>
              <span className="block h-1 w-8 rounded-full" style={{ backgroundColor: faint }} />
              <span className="mt-1 block h-2 w-11 rounded-full" style={{ backgroundColor: accent }} />
            </div>
          ))}
        </div>
        <span className="mt-1 block h-3.5 w-14 rounded-full" style={{ backgroundColor: accent }} />
      </div>
    </div>
  );
}

/** Miniature tenant admin console: sidebar rail, stat cards, activity bars. */
export function ConsolePreview({ kit, className }: { kit: BankingKit; className?: string }) {
  const { isDark, primary, accent, surface, radius } = kitColors(kit);
  const shell = isDark ? "#EEF2F7" : surface;
  const panel = "#FFFFFF";
  const hairline = "1px solid rgba(15,23,42,0.08)";
  return (
    <div className={cn("flex overflow-hidden", className)} style={{ backgroundColor: shell, borderRadius: radius }} aria-hidden>
      <div className="w-7 shrink-0 space-y-1.5 p-1.5" style={{ backgroundColor: primary }}>
        <span className="block h-1.5 w-4 rounded-full bg-white/70" />
        {[0, 1, 2].map((i) => (
          <span key={i} className="block h-1 w-4 rounded-full" style={{ backgroundColor: i === 0 ? accent : "rgba(255,255,255,0.35)" }} />
        ))}
      </div>
      <div className="flex-1 space-y-1.5 p-1.5">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex-1 p-1" style={{ backgroundColor: panel, borderRadius: radius, border: hairline }}>
              <span className="block h-1 w-5 rounded-full" style={{ backgroundColor: "rgba(15,23,42,0.18)" }} />
              <span className="mt-1 block h-1.5 w-7 rounded-full" style={{ backgroundColor: i === 1 ? accent : primary }} />
            </div>
          ))}
        </div>
        <div className="flex items-end gap-1 p-1.5" style={{ backgroundColor: panel, borderRadius: radius, border: hairline }}>
          {[7, 11, 6, 13, 9, 15].map((h, i) => (
            <span key={i} className="w-1.5 rounded-sm" style={{ height: `${h}px`, backgroundColor: i % 2 === 0 ? accent : `${accent}77` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Both surfaces side by side, labelled — the unit a design kit is chosen for. */
export function TemplateSurfaces({ kit, className }: { kit: BankingKit; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <div className="space-y-1">
        <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <MonitorSmartphone className="h-3 w-3" /> Customer app
        </p>
        <AppPreview kit={kit} />
      </div>
      <div className="space-y-1">
        <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <LayoutDashboard className="h-3 w-3" /> Admin console
        </p>
        <ConsolePreview kit={kit} />
      </div>
    </div>
  );
}
