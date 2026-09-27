import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Shared motion primitives.
 *
 * Every route animates through these so timing, easing, and distance stay
 * consistent across ~100 screens. All of them degrade to an instant,
 * non-animated render when the user prefers reduced motion, and every
 * transition animates only `transform`/`opacity` so nothing triggers layout.
 */

export const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;

/** Shared page-level motion: content rises and settles. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.34, ease: EASE_OUT_QUINT },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.16, ease: "easeIn" },
  },
};

/** Container that staggers its `Reveal` children. */
export const staggerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.055, delayChildren: 0.04 },
  },
};

export const revealVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.42, ease: EASE_OUT_QUINT },
  },
};

/**
 * Wrap a page's content so it fades up on mount and on route change.
 * Keyed by pathname in `main.tsx`, which is what replays the animation.
 */
export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {children}
    </motion.div>
  );
}

/**
 * A single block that rises into view. Use inside `StaggerGroup` for lists and
 * grids; standalone for single cards.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      variants={revealVariants}
      initial="hidden"
      animate="visible"
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Staggers its `Reveal`/`StaggerItem` children on mount.
 *
 * Only animates children already in view on mount, so it is safe for long
 * pages — nothing below the fold waits on an animation the user never sees.
 */
export function StaggerGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      variants={staggerVariants}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}

/** Child of `StaggerGroup`; inherits the parent's stagger timing. */
export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div className={className} variants={revealVariants}>
      {children}
    </motion.div>
  );
}

/** Gentle attention pulse for live/urgent rows. Decorative only. */
export function PulseBadge({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <span className={className}>{children}</span>;

  return (
    <motion.span
      className={className}
      animate={{ opacity: [1, 0.55, 1] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
    >
      {children}
    </motion.span>
  );
}
