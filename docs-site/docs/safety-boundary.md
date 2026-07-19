# Safety boundary

Stated plainly, from the project's own acceptance contract:

- This is **hackathon integration software, not an audit** — of TxLINE, of
  the demo escrow program, or of anything else.
- **No real-money wagering, no USDC custody, no production betting
  functionality.** The mainnet escrow demo is intentionally zero-value; the
  demo program is unaudited and must not custody valuable assets.
- **No credentials, wallet keys, authorization headers, host paths, or
  restricted raw data** belong in Git, recordings, or reports. `.trec`
  headers are specified to exclude them; keep it that way.
- **Full real-match recordings stay private** unless written redistribution
  permission exists. Only the synthetic recordings are public.
- **No guessed protocol facts.** Merkle hash functions, stat keys, odds
  shapes, finalisation semantics — each is either empirically confirmed or
  explicitly marked experimental/unconfirmed (the odds proof surface, the
  full local `verifyLocal`). The SDK would rather refuse than guess: that is
  what the typed error taxonomy is for.

If an integration needs to cross one of these lines, that is a product and
legal decision — not a code change to make quietly.
