import { VerificationError } from "./errors.js";
import type { CanonicalJournal, JournalConflict } from "./journal.js";
import { hashCanonical } from "./journal.js";

/** The four trust levels a proof-backed claim can honestly be at:
 * observed (live, one client's view), canonical (agreed content, proofs
 * pending), verified (proof-sealed), quarantined (conflicted — refuse to
 * seal). Documented material aliases: liquid, amber, crystal, quarantined. */
export type ProofLifecycleState = "observed" | "canonical" | "verified" | "quarantined";

export type ProofCoverage = "none" | "partial" | "complete";

export interface ProofAnchor {
  /** What anchored this content, e.g. a root account address or proof id. */
  sourceId: string;
  sourceTimestamp: number;
  /** The anchored root this content verified against. */
  rootHash: string;
}

export interface ProofAttestation<T = unknown> {
  state: ProofLifecycleState;
  subject: T;
  /** Hash of the content, computed before any proof exists. Sealing never
   * recomputes it — late proofs cannot mutate content. */
  contentHash: string;
  coverage: ProofCoverage;
  anchors: readonly ProofAnchor[];
  /** Hash over the sorted anchor roots; present once verified. */
  proofFingerprint?: string;
  /** Hash over (contentHash, proofFingerprint, anchors); present once verified. */
  sealedHash?: string;
  quarantineReason?: string;
}

const MATERIALS: Record<ProofLifecycleState, string> = {
  observed: "liquid",
  canonical: "amber",
  verified: "crystal",
  quarantined: "quarantined",
};

/** The doctrine's material name for a lifecycle state. */
export function materialFor(state: ProofLifecycleState): string {
  const material = MATERIALS[state];
  if (!material) lifecycleFailure(`Unknown lifecycle state ${String(state)}`, "LIFECYCLE_STATE_INVALID", "Use observed, canonical, verified, or quarantined.");
  return material;
}

function lifecycleFailure(message: string, code: string, fix: string): never {
  throw new VerificationError(message, { code, fix });
}

function freeze<T>(attestation: ProofAttestation<T>): ProofAttestation<T> {
  return Object.freeze({ ...attestation, anchors: Object.freeze(attestation.anchors.map((anchor) => Object.freeze({ ...anchor }))) });
}

/** A live, single-client view: expressive, possibly incomplete or reordered. */
export async function observeAttestation<T>(subject: T): Promise<ProofAttestation<T>> {
  return freeze({ state: "observed", subject, contentHash: await hashCanonical(subject), coverage: "none", anchors: [] });
}

/** Content everyone agrees on, proofs still pending. Conflicts quarantine
 * immediately — one source identity with diverging payloads must never seal. */
export async function canonicalAttestation<T>(subject: T, conflicts: readonly JournalConflict[] = []): Promise<ProofAttestation<T>> {
  const contentHash = await hashCanonical(subject);
  if (conflicts.length > 0) {
    return freeze({
      state: "quarantined",
      subject,
      contentHash,
      coverage: "none",
      anchors: [],
      quarantineReason: `Conflicting source records: ${conflicts.map((conflict) => conflict.sourceId).join(", ")}`,
    });
  }
  return freeze({ state: "canonical", subject, contentHash, coverage: "none", anchors: [] });
}

/** Canonicalize a journal into an attestation over its records, inheriting
 * quarantine from the journal's conflict list. */
export async function attestJournal<T extends CanonicalJournal>(journal: T): Promise<ProofAttestation<T>> {
  return canonicalAttestation(journal, journal.conflicts);
}

/** Record proof anchors that arrived without claiming completeness. Content
 * and state are untouched; only coverage and the anchor list change. */
export function applyPartialProofs<T>(attestation: ProofAttestation<T>, anchors: readonly ProofAnchor[]): ProofAttestation<T> {
  if (attestation.state === "quarantined") return attestation;
  if (attestation.state !== "canonical") lifecycleFailure(`Cannot apply proofs to ${attestation.state} content`, "LIFECYCLE_TRANSITION_INVALID", "Canonicalize the content first; observed views cannot carry proof coverage.");
  return freeze({ ...attestation, coverage: anchors.length > 0 ? "partial" : attestation.coverage, anchors: [...attestation.anchors, ...anchors] });
}

/** Seal canonical content with its complete anchor set. The sealed hash
 * covers (contentHash, proofFingerprint, anchors) — a separate commitment,
 * so sealing cannot mutate content and partial coverage stays representable. */
export async function sealAttestation<T>(attestation: ProofAttestation<T>, anchors: readonly ProofAnchor[]): Promise<ProofAttestation<T>> {
  if (attestation.state === "quarantined") lifecycleFailure(`Quarantined content must not seal (${attestation.quarantineReason ?? "unresolved conflict"})`, "LIFECYCLE_QUARANTINED", "Resolve the conflicting source records and re-canonicalize before sealing.");
  if (attestation.state !== "canonical") lifecycleFailure(`Cannot seal ${attestation.state} content`, "LIFECYCLE_TRANSITION_INVALID", "Seal only canonical content; observed views must be canonicalized first.");
  if (anchors.length === 0) lifecycleFailure("Sealing requires at least one proof anchor", "LIFECYCLE_ANCHORS_MISSING", "Pass the anchors whose roots this content verified against.");
  const sorted = [...anchors].sort((a, b) => a.sourceTimestamp - b.sourceTimestamp || (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0));
  const proofFingerprint = await hashCanonical(sorted.map((anchor) => anchor.rootHash));
  const sealedHash = await hashCanonical(["TXLINE_KIT_SEALED_V1", attestation.contentHash, proofFingerprint, sorted]);
  return freeze({ ...attestation, state: "verified", coverage: "complete", anchors: sorted, proofFingerprint, sealedHash });
}

/** Quarantine from any state: malformed anchors, failed Merkle checks, or a
 * rejecting on-chain predicate all land here. */
export function quarantineAttestation<T>(attestation: ProofAttestation<T>, reason: string): ProofAttestation<T> {
  const { proofFingerprint: _fingerprint, sealedHash: _sealed, ...rest } = attestation;
  return freeze({ ...rest, state: "quarantined", quarantineReason: reason });
}
