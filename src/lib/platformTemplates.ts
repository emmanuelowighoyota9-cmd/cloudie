/**
 * The complete platform template set.
 *
 * `starterTemplates.ts` holds the base set, `commercialTemplates.ts` the second
 * batch of commercial paperwork. The Convex seeder installs both, so this module
 * is the single source of truth for "what ships with Crestline" and for the
 * version marker that triggers a republish.
 */

import { STARTER_SET_VERSION, STARTER_TEMPLATES, type StarterTemplate } from "./starterTemplates";
import { COMMERCIAL_TEMPLATES } from "./commercialTemplates";

/** Every template the seeder installs, base set first. */
export const PLATFORM_TEMPLATES: StarterTemplate[] = [...STARTER_TEMPLATES, ...COMMERCIAL_TEMPLATES];

/**
 * Seed marker. Adding a batch of templates bumps the base version, and this
 * offset keeps the platform marker ahead of it so existing installs republish
 * once and already-generated documents keep their frozen snapshots.
 */
export const PLATFORM_SEED_VERSION = STARTER_SET_VERSION + 1;
