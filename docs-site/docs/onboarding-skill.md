# Onboarding skill

The repository ships an agent skill —
[`skills/txline-kit-onboarding/SKILL.md`](https://github.com/0xPulsePlay/txline-kit/blob/main/skills/txline-kit-onboarding/SKILL.md)
— that encodes the complete onboarding procedure for AI agents (and works
just as well as a human checklist). Load it directly, or follow the same
eight steps:

1. **Detect** the project shape (fresh / existing Solana app / existing data
   consumer) and install from source — npm publication is deferred.
2. **Pin the network** and create the client; never mix hosts, IDL, or
   program IDs across networks.
3. **Replay-first**: serve a committed synthetic `.trec`, point the unchanged
   client at it, and prove the integration loop with zero credentials.
4. **Map the domain** onto the kit's subpath exports — data-only, proofs,
   settlement — importing only what the project needs.
5. **Auth for live** (wallet subscription flow, credential-store choice).
6. **Proof + verification path**: fetch → availability retry → `verifyView`;
   use lifecycle states as the vocabulary for what the app may claim.
7. **Settlement (optional)**: keeper wiring, dry-run first, idempotent
   submit.
8. **Verification checklist** before declaring onboarding done: replay smoke
   in CI, one proof round-trip, typed error handling surfaced, no secrets in
   the repo, dry-run reviewed.

The skill is self-contained and repo-shipped so it can be packaged into any
agent marketplace or loaded straight from a checkout.
