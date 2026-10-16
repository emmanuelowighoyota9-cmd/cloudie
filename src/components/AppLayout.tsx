import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { motion } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";

/**
 * The authenticated application shell.
 *
 * Layout contract:
 *  - The page is the only scroll container that moves (`main` below), so the
 *    sidebar and top bar stay put on every route.
 *  - The content gutter is `page-gutter` plus `py-4 sm:py-7 lg:py-9`. Those
 *    exact values are what `VtuShell` cancels to go full-bleed, so they are
 *    load-bearing rather than decorative.
 *  - On phones the extra bottom padding clears the fixed thumb bar and the
 *    iOS home indicator.
 */
export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { pathname } = useLocation();
  const scrollRef = useRef<HTMLElement | null>(null);

  // The scroll container lives inside the layout, not the window, so the
  // browser's own restoration never fires. Without this, opening a new page
  // lands you halfway down the previous one.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <a
        href="#app-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-xl focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <motion.div
        initial={{ x: -12, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="hidden lg:block"
      >
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
        />
      </motion.div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        {/*
          `overscroll-contain` stops iOS rubber-banding the whole document when
          a list inside the page hits its end — a common source of "the page
          feels broken" on mobile.
        */}
        <main
          id="app-content"
          ref={scrollRef}
          tabIndex={-1}
          className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div
            key={pathname}
            className="cloudie-page mx-auto w-full max-w-[1440px] page-gutter py-4 sm:py-7 lg:py-9"
          >
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav />
    </div>
  );
}
