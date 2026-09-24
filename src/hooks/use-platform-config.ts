import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import {
  DEFAULT_BRAND,
  DEFAULT_SUPPORT,
  type BrandConfig,
  type SupportConfig,
} from "@/lib/platformConfig";

/**
 * Live platform configuration (admin-editable appearance + support details).
 * Falls back to platform defaults until the subscription resolves so public
 * pages never render empty brand text.
 */
export function usePlatformConfig(): {
  brand: BrandConfig;
  support: SupportConfig;
  hasCustomBrand: boolean;
  loaded: boolean;
} {
  const config = useQuery(api.platform.getPublicConfig);
  const brand = useMemo<BrandConfig>(() => config?.brand ?? DEFAULT_BRAND, [config]);
  const support = useMemo<SupportConfig>(() => config?.support ?? DEFAULT_SUPPORT, [config]);
  return {
    brand,
    support,
    hasCustomBrand: config?.hasCustomBrand ?? false,
    loaded: config !== undefined,
  };
}
