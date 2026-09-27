/**
 * DEPRECATED — superseded by `vtuInternal.refundAndRelease`.
 *
 * Kept only as a re-export so nothing resolves a stale reversal path. The new
 * mutation is the single exit from `failed`: it credits the FROZEN
 * `pointsDebited` snapshot (re-reading the live rate would refund a different
 * number of points than were taken) and releases the `vtuIdempotency` claim so
 * the customer can retry the same request id.
 *
 * Slice 1 no longer has a separate reversal module on purpose: a Convex module
 * that calls its own exports through the generated `internal` API forms a
 * self-referential type-inference cycle that collapses it — and every importer
 * — to `any`. Keeping reversal reachable without a self-call is what avoided
 * that.
 */

export { refundAndRelease as reverse } from "./vtuInternal";
