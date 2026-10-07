import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { motion } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";

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
    <div className="flex h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--primary)_5%,transparent),transparent_30%),var(--background)]">
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
          ref={scrollRef}
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
