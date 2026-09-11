import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    // Read the initial value outside the effect body via the same listener path:
    // matchMedia fires the change handler only on changes, so read once here
    // in a microtask to avoid a synchronous setState during the effect.
    const initial = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches
    const raf = requestAnimationFrame(() => setIsMobile(initial))
    return () => {
      mql.removeEventListener("change", onChange)
      cancelAnimationFrame(raf)
    }
  }, [])

  return !!isMobile
}
