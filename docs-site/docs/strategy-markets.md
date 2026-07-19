# Strategy & markets

On-chain validation is positional: strategy indexes refer to positions in the
requested stat-key list, not to the stat keys themselves. An index mistake is
silent and fatal — so the SDK owns the indexes.

```ts
import { markets } from "@0xpulseplay/txline-kit/strategy";

const market = markets.finalResult(18_241_006).awayWin();
// market.statKeys  → ordered keys to request the proof with
// market.strategy  → compiled validate_stat_v2 strategy
```

- The low-level `strategy()` builder refuses to compile unless every
  requested stat is covered exactly once (`CoverageError`).
- `markets.overUnder(fixtureId, "totalGoals", 2.5)` converts half-lines into
  correct integer predicates.
- Same-call parlays must use one fixture and disjoint stat keys; unsupported
  atomic claims fail before any proof is fetched.
- The confirmed 64-key soccer stat registry marks confidence explicitly —
  unconfirmed keys stay usable numerically without invented names.

Never hand-build positional indexes. If `markets.*` doesn't express your
claim, use the builder with named stats; if the builder refuses, your claim
was not safely expressible.
