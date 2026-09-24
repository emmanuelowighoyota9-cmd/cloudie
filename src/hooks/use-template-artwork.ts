import { useEffect, useMemo, useState } from "react";
import { artworkDataUrl } from "@/lib/templateArtwork";
import type { TemplatePage } from "@/lib/docTemplateEngine";

/**
 * Inject a template's artwork file into its pages as the page underlay.
 *
 * The artwork is stored as a file reference, not in the layout, so both the
 * live preview and the export resolve it once here. `ready` is false while the
 * file is still being fetched, which lets render surfaces hold off exporting a
 * page that would otherwise lose its scanned background.
 */
export function useTemplateArtwork(
  pages: TemplatePage[],
  artworkUrl: string | null | undefined,
): { pages: TemplatePage[]; ready: boolean; failed: boolean } {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setFailed(false);
    if (!artworkUrl) return;
    artworkDataUrl(artworkUrl)
      .then((result) => {
        if (!cancelled) setDataUrl(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [artworkUrl]);

  const resolved = useMemo(() => {
    if (!artworkUrl || !dataUrl) return pages;
    return pages.map((page, index) => (index === 0 ? { ...page, backgroundImage: dataUrl } : page));
  }, [pages, dataUrl, artworkUrl]);

  if (!artworkUrl) return { pages, ready: true, failed: false };
  return { pages: resolved, ready: Boolean(dataUrl) || failed, failed };
}
