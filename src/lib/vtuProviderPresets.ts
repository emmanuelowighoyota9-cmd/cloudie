/**
 * Known-good provider presets.
 *
 * A provider row has eight configuration fields, and for a given aggregator
 * all but one of them are constants: the origin, the health probe, the auth
 * header name, the auth scheme and the webhook signature header are properties
 * of the PROVIDER, not of this deployment. Only the API key, the account PIN
 * and the routing priority are the operator's.
 *
 * Making the operator type the constants is how `baseUrl` came to be set to
 * `https://aidapay.ng/api/v1` — which is a well-formed URL and produces
 * `.../api/v1/api/v1/buy` on every purchase. The value looked right; it was
 * wrong in the one place that mattered, and the failure surfaced only as a
 * 404 on a live purchase.
 *
 * So the constants live here, once, and are imported by BOTH the admin UI (to
 * show what will be saved) and the backend mutation that saves it. A preset
 * can therefore never drift between what the operator is told and what is
 * written to the row.
 *
 * The advanced form still exists for anything not covered by a preset. A
 * preset is a shortcut to a correct row, not a replacement for one.
 */

export type ProviderPreset = {
  /** Must match the adapter's `name` in the provider registry. */
  name: string;
  displayName: string;
  /**
   * The BARE ORIGIN, never a version-prefixed base.
   *
   * Adapters compose their own paths, which already carry `/api/v1`. This is
   * the single most misconfigured field in the whole system and the reason
   * every value here is an origin.
   */
  baseUrl: string;
  /** Read-only probe the "Test" button GETs. Never a purchase endpoint. */
  healthPath: string;
  authHeader: string;
  authScheme: "" | "bearer" | "basic";
  /** Inbound header AidaPay signs the callback body under. */
  callbackSignatureHeader: string;
  /** Path on OUR site that this provider's webhook posts to. */
  webhookPath: string;
  timeoutMs: number;
  /**
   * Lower runs first. AidaPay sits below the Pairgate default so it wins for
   * every product that has an AidaPay route, while Pairgate keeps serving the
   * products that have no AidaPay route — which is what "fallback" means here.
   */
  priority: number;
  /**
   * Whether the provider requires a 4-digit account PIN on every purchase.
   * AidaPay does; the adapter refuses to dispatch without one.
   */
  requiresAccountPin: boolean;
};

export const AIDAPAY_PRESET: ProviderPreset = {
  name: "aidapay",
  displayName: "AidaPay",
  baseUrl: "https://aidapay.ng",
  healthPath: "/api/v1/my_account",
  authHeader: "Authorization",
  authScheme: "bearer",
  callbackSignatureHeader: "Signature",
  webhookPath: "/api/webhooks/vtu/aidapay",
  timeoutMs: 20_000,
  priority: 50,
  requiresAccountPin: true,
};

/** Every preset, keyed by provider name. */
export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  [AIDAPAY_PRESET.name]: AIDAPAY_PRESET,
};

export const PROVIDER_PRESET_LIST: ProviderPreset[] = [AIDAPAY_PRESET];