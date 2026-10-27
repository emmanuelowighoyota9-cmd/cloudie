import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Cloudie's mascot — the 3D character at the centre of the hero.
 *
 * Drawn as inline SVG rather than shipped as a raster asset, for three reasons:
 * it stays crisp at every size, it repaints when the palette tokens change, and
 * it cannot 404. The "3D" read comes from a single light source: one warm-white
 * sheen at the top left, a deep emerald occlusion shadow at the bottom right,
 * and a soft contact shadow underneath so the character is planted, not pasted.
 *
 * Decorative, so it is `aria-hidden`: the headline next to it carries the words.
 */
export function CloudieMascot({ className }: { className?: string }) {
  const reduced = useReducedMotion();

  const float = reduced
    ? {}
    : { animate: { y: [0, -14, 0] }, transition: { duration: 7, repeat: Infinity, ease: "easeInOut" as const } };

  return (
    <div className={cn("relative isolate", className)} aria-hidden>
      {/* The bloom the character sits in. Slow, low-opacity, never enough to
          lift the page off true black. */}
      <motion.div
        className="pointer-events-none absolute inset-[8%] -z-10 rounded-full bg-primary/25 blur-3xl"
        animate={reduced ? undefined : { opacity: [0.45, 0.8, 0.45], scale: [0.94, 1.04, 0.94] }}
        transition={reduced ? undefined : { duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
      />

      <svg viewBox="0 0 360 320" className="h-auto w-full" role="presentation">
        <defs>
          <linearGradient id="cloudie-body" gradientUnits="userSpaceOnUse" x1="70" y1="40" x2="300" y2="270">
            <stop offset="0%" stopColor="#a7f3d0" />
            <stop offset="34%" stopColor="#34d399" />
            <stop offset="76%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>
          <linearGradient id="cloudie-visor" gradientUnits="userSpaceOnUse" x1="140" y1="150" x2="240" y2="230">
            <stop offset="0%" stopColor="#03130d" />
            <stop offset="100%" stopColor="#000000" />
          </linearGradient>
          <linearGradient id="cloudie-accent" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6ee7b7" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <radialGradient id="cloudie-sheen" cx="32%" cy="24%" r="62%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cloudie-bloom" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </radialGradient>
          <clipPath id="cloudie-clip">
            <circle cx="116" cy="152" r="64" />
            <circle cx="244" cy="146" r="52" />
            <circle cx="180" cy="104" r="60" />
            <rect x="72" y="148" width="216" height="104" rx="52" />
          </clipPath>
        </defs>

        {/* Stage: contact shadow, then the ambient bloom. */}
        <ellipse cx="180" cy="298" rx="120" ry="28" fill="url(#cloudie-bloom)" />
        <ellipse cx="180" cy="292" rx="84" ry="13" fill="#000000" opacity="0.75" />

        <motion.g {...float}>
          {/* Body volume */}
          <g fill="url(#cloudie-body)" clipPath="url(#cloudie-clip)">
            <circle cx="116" cy="152" r="64" />
            <circle cx="244" cy="146" r="52" />
            <circle cx="180" cy="104" r="60" />
            <rect x="72" y="148" width="216" height="104" rx="52" />
            {/* Occlusion on the unlit side, sheen on the lit side — both clipped
                to the silhouette, which is what makes the shape read as round. */}
            <ellipse cx="262" cy="238" rx="150" ry="120" fill="#04231a" opacity="0.55" />
            <ellipse cx="112" cy="96" rx="130" ry="96" fill="url(#cloudie-sheen)" />
          </g>

          {/* Antenna */}
          <line x1="180" y1="52" x2="180" y2="28" stroke="#34d399" strokeWidth="6" strokeLinecap="round" opacity="0.7" />
          <motion.circle
            cx="180"
            cy="20"
            r="9"
            fill="url(#cloudie-accent)"
            animate={reduced ? undefined : { opacity: [1, 0.55, 1], scale: [1, 1.18, 1] }}
            transition={reduced ? undefined : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformOrigin: "180px 20px" }}
          />

          {/* Face plate */}
          <rect x="116" y="152" width="128" height="80" rx="40" fill="url(#cloudie-visor)" stroke="#10b981" strokeOpacity="0.42" strokeWidth="2" />
          <circle cx="132" cy="212" r="11" fill="#6ee7b7" opacity="0.18" />
          <circle cx="228" cy="212" r="11" fill="#6ee7b7" opacity="0.18" />

          {/* Eyes and mouth */}
          <g fill="#34d399">
            <circle cx="156" cy="186" r="12" />
            <circle cx="204" cy="186" r="12" />
          </g>
          <g fill="#ffffff" opacity="0.85">
            <circle cx="152" cy="182" r="4" />
            <circle cx="200" cy="182" r="4" />
          </g>
          <path d="M168 204 q12 11 24 0" fill="none" stroke="#5eead4" strokeWidth="4.5" strokeLinecap="round" opacity="0.9" />
        </motion.g>

        {/* Props, counter-drifting so the composition has depth. */}
        <motion.g
          animate={reduced ? undefined : { y: [0, 12, 0] }}
          transition={reduced ? undefined : { duration: 8, repeat: Infinity, ease: "easeInOut" }}
        >
          <rect x="296" y="92" width="40" height="40" rx="13" fill="url(#cloudie-accent)" transform="rotate(14 316 112)" />
          <circle cx="42" cy="120" r="18" fill="url(#cloudie-accent)" opacity="0.9" />
          <circle cx="332" cy="212" r="12" fill="none" stroke="#34d399" strokeWidth="5" opacity="0.5" />
        </motion.g>
      </svg>
    </div>
  );
}
