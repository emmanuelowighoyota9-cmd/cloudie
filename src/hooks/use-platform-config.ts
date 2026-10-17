import { useEffect, useState } from "react";
import {
  DEFAULT_BRAND,
  DEFAULT_QUICK_ACTIONS,
  DEFAULT_SUPPORT,
  sanitizeBrand,
  sanitizeQuickActions,
  sanitizeSupport,
  type BrandConfig,
  type QuickActionConfig,
  type SupportConfig,
} from "@/lib/platformConfig";
import { neonApi } from "@/lib/neonApi";

/**
 * Live platform configuration (appearance + support details) backed by Neon API.
 * Falls back safely to platform defaults if the network is unavailable so
 * public pages never fail to render.
 */
export function usePlatformConfig(): {
  brand: BrandConfig;
  support: SupportConfig;
  quickActions: QuickActionConfig[];
  hasCustomBrand: boolean;
  loaded: boolean;
} {
  const [config, setConfig] = useState<{
    brand: BrandConfig;
    support: SupportConfig;
    quickActions: QuickActionConfig[];
    hasCustomBrand: boolean;
  }>({
    brand: DEFAULT_BRAND,
    support: DEFAULT_SUPPORT,
    quickActions: DEFAULT_QUICK_ACTIONS,
    hasCustomBrand: false,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    neonApi
      .publicConfig()
      .then((data) => {
        if (!active || !data) return;
        setConfig({
          brand: sanitizeBrand(data.brand),
          support: sanitizeSupport(data.support),
          quickActions: sanitizeQuickActions(data.quickActions),
          hasCustomBrand: Boolean(data.hasCustomBrand),
        });
        setLoaded(true);
      })
      .catch(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return {
    brand: config.brand,
    support: config.support,
    quickActions: config.quickActions,
    hasCustomBrand: config.hasCustomBrand,
    loaded,
  };
}
