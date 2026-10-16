import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { mainNav, adminNav } from "@/components/Sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Search } from "lucide-react";

/**
 * Workspace search.
 *
 * This replaced a bare `<input>` in the header that accepted typing and did
 * nothing with it. It now actually navigates: the palette is built from the same
 * two arrays the sidebar renders (`mainNav`, `adminNav`), so every destination
 * offered here is a route the router really serves, and a page added to the
 * sidebar becomes searchable for free.
 *
 * The admin group is only offered to administrators — the server re-checks
 * authorisation on every admin function, so this is a convenience filter rather
 * than an access control. Hiding routes is never the protection.
 */
export function AppSearch() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const destinations = useMemo(() => {
    const items = [...mainNav];
    if (user?.role === "admin") items.push(...adminNav);
    return items;
  }, [user?.role]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search pages and tools"
        aria-keyshortcuts="Control+K Meta+K"
        className="flex h-9 min-w-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:w-64 lg:w-80"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden truncate md:inline">Search pages and tools…</span>
        <kbd className="ml-auto hidden rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground lg:inline">
          ⌘K
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search Cloudie"
        description="Jump to a page or tool"
      >
        <CommandInput placeholder="Search pages, tools and settings…" />
        <CommandList>
          <CommandEmpty>No matching page.</CommandEmpty>
          <CommandGroup heading="Go to">
            {destinations.map((item) => (
              <CommandItem
                key={item.to}
                value={`${item.label} ${item.to}`}
                onSelect={() => go(item.to)}
              >
                <item.icon className="size-4" />
                <span>{item.label}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {item.to}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
