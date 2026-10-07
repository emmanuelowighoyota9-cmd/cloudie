/**
 * The complete Cloudie platform template set.
 *
 * `starterTemplates.ts` holds the base set, `commercialTemplates.ts` the second
 * batch of commercial paperwork. The Convex seeder installs both, so this module
 * is the single source of truth for "what ships with Cloudie" and for the
 * version marker that triggers a republish.
 */

import { STARTER_SET_VERSION, STARTER_TEMPLATES, type StarterTemplate } from "./starterTemplates";
import { COMMERCIAL_TEMPLATES } from "./commercialTemplates";
import { TICKETING_TEMPLATES } from "./ticketingTemplates";

/** Every template the seeder installs, base set first. */
export const PLATFORM_TEMPLATES: StarterTemplate[] = [...STARTER_TEMPLATES, ...COMMERCIAL_TEMPLATES, ...TICKETING_TEMPLATES];

/**
 * Bumped whenever a new platform template batch is added. Keep it in step
 * with that array so installations holding an older marker republish once.
 */
const COMMERCIAL_SET_VERSION = 7;

/**
 * Seed marker. Adding a batch of templates bumps one of the versions above, and
 * the sum keeps the platform marker ahead of both so existing installs republish
 * once while already-generated documents keep their frozen snapshots.
 */
export const PLATFORM_SEED_VERSION = STARTER_SET_VERSION + COMMERCIAL_SET_VERSION;
