import { createContext, useContext, useEffect, useState } from "react";

/**
 * Cloudie is a dark-only product.
 *
 * The enterprise palette — pure black surfaces, white ink, one emerald accent —
 * is declared once in `index.css`, on `:root` **and** on `.dark`. This provider
 * exists only to guarantee the `dark` class is present on <html> from the first
 * paint of every route, so the `dark:` utilities written across the app resolve
 * to exactly the same token values as `:root` instead of quietly falling back
 * to light-mode colours that no longer exist.
 *
 * There is deliberately no `toggle`: a control that repaints nothing is worse
 * than no control, and offering a light variant would contradict the one design
 * system the whole platform is built on.
 */
type Theme = "dark";

const ThemeContext = createContext<{ theme: Theme }>({ theme: "dark" });

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme] = useState<Theme>("dark");

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light");
    root.classList.add("dark");
    root.style.colorScheme = "dark";
    // A preference stored before the product went dark-only would otherwise
    // keep other boot code guessing about the colour scheme.
    try {
      localStorage.removeItem("cloudie-theme");
    } catch {
      /* Storage unavailable (private browsing) — nothing to clean up. */
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme }}>{children}</ThemeContext.Provider>
  );
}
