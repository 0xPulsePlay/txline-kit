# Release operations

## Preflight

1. Start from a clean `main` checkout with all required CI checks green.
2. Confirm the npm and Cargo versions match and neither registry already contains that version.
3. Run `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm build`, `pnpm release:smoke`, and the full browser matrix.
4. Review `npm pack --json` and `cargo package --list`; reject credentials, signer material, restricted recordings, host paths, or unplanned files.
5. Confirm the dual-license files and safety disclaimer are present in both archives.

## Publication

- Publish npm from `packages/txline-kit` with public access and provenance enabled.
- Publish `txline-kit-cpi` from the workspace root with the lockfile.
- Create signed or annotated Git tag `v0.1.0` only after both registries accept the artifacts.
- Create a GitHub release from that tag using the matching changelog section.

Registry credentials must come from the operator's authenticated client or a short-lived trusted-publisher workflow. Never write tokens into the repository, proof report, command history, or release artifact.

## Post-publish proof

Install the registry versions—not local paths—into empty npm and Cargo consumers. Exercise ESM, CommonJS, subpath exports, `txline-replay`, both Rust network feature selections, and the linked consumer surface. Verify the two GitHub repositories are public only after their tracked-file audits pass.

Published versions are immutable. If either artifact is wrong, deprecate or yank it with an explanation, fix forward under a new patch version, and preserve the audit trail.
