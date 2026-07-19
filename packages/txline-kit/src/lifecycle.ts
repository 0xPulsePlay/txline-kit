import { VerificationError } from "./errors.js";
import type { CanonicalJournal, JournalConflict } from "./journal.js";
import { canonicalStringify, hashCanonical } from "./journal.js";

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

/** Deep-clone a subject via a canonical-JSON round-trip before it's stored
 * on a frozen attestation. Object.freeze on the attestation container is
 * shallow -- the referenced subject object itself is never cloned or
 * deep-frozen by `freeze()` alone. Without this, a caller mutating the same
 * object it passed in would make the "frozen" record's exposed `.subject`
 * reflect the mutation while `.contentHash` still attested to the
 * pre-mutation bytes. hashCanonical already requires the subject to be
 * canonical-JSON-safe, so this round-trip is a safe, faithful clone. */
function cloneSubject<T>(subject: T): T {
  return JSON.parse(canonicalStringify(subject)) as T;
}

/** A live, single-client view: expressive, possibly incomplete or reordered. */
export async function observeAttestation<T>(subject: T): Promise<ProofAttestation<T>> {
  const contentHash = await hashCanonical(subject);
  return freeze({ state: "observed", subject: cloneSubject(subject), contentHash, coverage: "none", anchors: [] });
}

/** Content everyone agrees on, proofs still pending. Conflicts quarantine
 * immediately — one source identity with diverging payloads must never seal. */
export async function canonicalAttestation<T>(subject: T, conflicts: readonly JournalConflict[] = []): Promise<ProofAttestation<T>> {
  const contentHash = await hashCanonical(subject);
  const clonedSubject = cloneSubject(subject);
  if (conflicts.length > 0) {
    return freeze({
      state: "quarantined",
      subject: clonedSubject,
      contentHash,
      coverage: "none",
      anchors: [],
      quarantineReason: `Conflicting source records: ${conflicts.map((conflict) => conflict.sourceId).join(", ")}`,
    });
  }
  return freeze({ state: "canonical", subject: clonedSubject, contentHash, coverage: "none", anchors: [] });
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

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Seal canonical content with its complete anchor set. The sealed hash
 * covers (contentHash, proofFingerprint, anchors) — a separate commitment,
 * so sealing cannot mutate content and partial coverage stays representable.
 *
 * Three things are checked/protected against at seal time:
 *  - The subject's content is rehashed and compared to the contentHash
 *    recorded at canonicalization time. Content is a mutable object owned
 *    by the caller; if it changed between canonicalizeAttestation and
 *    sealAttestation, sealing must refuse rather than commit to whichever
 *    content happened to be there when this function ran.
 *  - `anchors` is cloned and frozen immediately, before any sorting or
 *    hashing, so every computation below (the sort, proofFingerprint,
 *    sealedHash, and the anchors stored on the returned attestation) reads
 *    the same immutable snapshot. Without this, a caller mutating one of
 *    its own anchor objects while sealAttestation is awaiting a hash could
 *    make the stored anchors and the sealedHash they're supposed to
 *    attest to disagree.
 *  - The sort has an explicit, fully deterministic tie-break chain
 *    (sourceTimestamp, then sourceId, then rootHash) so two anchors tying
 *    on the first key(s) still sort the same way regardless of the
 *    caller's input order — Array#sort is stable, so an incomplete
 *    comparator would otherwise let arrival order leak into sealedHash. */
export async function sealAttestation<T>(attestation: ProofAttestation<T>, anchors: readonly ProofAnchor[]): Promise<ProofAttestation<T>> {
  if (attestation.state === "quarantined") lifecycleFailure(`Quarantined content must not seal (${attestation.quarantineReason ?? "unresolved conflict"})`, "LIFECYCLE_QUARANTINED", "Resolve the conflicting source records and re-canonicalize before sealing.");
  if (attestation.state !== "canonical") lifecycleFailure(`Cannot seal ${attestation.state} content`, "LIFECYCLE_TRANSITION_INVALID", "Seal only canonical content; observed views must be canonicalized first.");
  if (anchors.length === 0) lifecycleFailure("Sealing requires at least one proof anchor", "LIFECYCLE_ANCHORS_MISSING", "Pass the anchors whose roots this content verified against.");
  const currentContentHash = await hashCanonical(attestation.subject);
  if (currentContentHash !== attestation.contentHash) {
    lifecycleFailure(
      `Attestation content changed since canonicalization (expected ${attestation.contentHash}, subject now hashes to ${currentContentHash})`,
      "LIFECYCLE_CONTENT_MUTATED",
      "Re-canonicalize the current content and seal the resulting attestation; sealing must never commit to content that changed after it was canonicalized.",
    );
  }
  const snapshot: readonly ProofAnchor[] = Object.freeze(anchors.map((anchor) => Object.freeze({ ...anchor })));
  const sorted = [...snapshot].sort((a, b) => a.sourceTimestamp - b.sourceTimestamp || compareStrings(a.sourceId, b.sourceId) || compareStrings(a.rootHash, b.rootHash));
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
