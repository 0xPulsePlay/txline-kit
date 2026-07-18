# `.trec` version 1

`.trec` is TxLINE Kit's canonical inspectable recording format. It is UTF-8 newline-delimited JSON. Distributed recordings may use zstd as `.trec.zst`, but decompression must yield this exact source format.

## Header

The first line has `kind: "txline.recording"` and `version: 1`. It records a UUID, creation timestamp, network, sorted fixture IDs, requested stat keys, and the source-format version. It contains no machine path, API host secret, token, wallet, or signature.

## Records

Each following line has `kind: "txline.record"`, a contiguous one-based `recordId`, original millisecond timestamp, fixture ID, channel, request description, raw response body, and SHA-256 of that body.

Supported channels are `sse`, `snapshot`, `updates`, `historical`, `odds`, `proof`, and `root`. Records are globally ordered by original capture timestamp. Equal timestamps preserve deterministic source-file order.

## Integrity and privacy

The sidecar manifest records the SHA-256 of the complete recording, record count, time bounds, and per-channel counts. Validation rejects blank lines, non-contiguous IDs, backwards timestamps, body tampering, and secret-shaped text.

Recording bodies deliberately remain raw so a replay server can preserve provider wire behavior and normalization can evolve independently. Full real recordings are private release assets until redistribution permission is recorded. Small public fixtures must be synthetic or specifically cleared.
