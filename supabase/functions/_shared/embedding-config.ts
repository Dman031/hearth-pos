// embedding-config — the PINNED embedding contract (WRITE side).
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ CONTRACT — must byte-match hearth-network/src/utils/embedding-config.ts.  │
// │ The write side (this repo, via Cloudflare REST) and the read side (the    │
// │ network Worker, via the native AI binding) MUST embed with the SAME       │
// │ model, dimensions, and pooling, or the vectors are not comparable and     │
// │ similarity is garbage.                                                    │
// │                                                                           │
// │ Cloudflare Workers AI exposes no sub-slug version pin, so the pin is a     │
// │ 3-part discipline: (1) this shared contract in both repos, (2) the        │
// │ per-card `embedding_model` stamp (= EMBED_STAMP) written on every vector  │
// │ so a CF model bump is detectable + healable via the backfill, (3) any     │
// │ change here is a migration + full re-embed. mean vs cls pooling produce   │
// │ INCOMPATIBLE embeddings — pooling is part of the pin.                     │
// └──────────────────────────────────────────────────────────────────────────┘

// bge-base-en-v1.5: 768-dim output, 512-token max input.
export const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';
export const EMBED_DIMS = 768;
export const EMBED_POOLING = 'mean' as const;

// Stamped onto cards.embedding_model so drift is queryable and the backfill can
// re-embed only stale rows.
export const EMBED_STAMP = `${EMBED_MODEL}|${EMBED_POOLING}|${EMBED_DIMS}`;
