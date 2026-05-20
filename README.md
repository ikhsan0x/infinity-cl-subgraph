# infinity-cl-subgraph

[![tests](https://github.com/ikhsan0x/infinity-cl-subgraph/actions/workflows/test.yml/badge.svg)](https://github.com/ikhsan0x/infinity-cl-subgraph/actions/workflows/test.yml)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)

Performance-tuned subgraph for PancakeSwap **Infinity CL** (concentrated
liquidity v4). Indexes pools, swaps, liquidity positions, ticks, and OHLC
aggregates from the `PoolManager` and `PositionManager` contracts across 16
EVM networks.

This is a behaviour-equivalent refactor of the upstream subgraph: the public
API surface (`handle*Helper`, `SubgraphConfig`, util exports) is preserved,
hot paths are de-allocated, and the test suite is expanded from happy-path-only
to **116 tests covering math, handlers, error paths, and cross-event
aggregation**.

## Features

- **6 event handlers** — `Initialize`, `ModifyLiquidity`, `Swap`, `Subscription`,
  `Unsubscription`, `Transfer`
- **Immutable event entities** — `Swap`, `ModifyLiquidity`, `Transaction`,
  `Subscribe`, `Unsubscribe`, `Transfer` are marked `@entity(immutable: true)`
  for ~10× faster indexing on write-heavy entities
- **OHLC aggregation** — daily and hourly snapshots for pools and tokens
- **USD pricing** — derived via stablecoin/native pool with whitelist-aware
  volume tracking
- **Multi-network** — single codebase, switch via `subgraph.yaml`

## Network support

`src/utils/chains.ts` ships config for: `mainnet`, `base`, `bsc`,
`arbitrum-one`, `optimism`, `matic`, `avalanche`, `blast-mainnet`,
`unichain-mainnet`, `zora-mainnet`, `worldchain-mainnet`, `soneium-mainnet`,
plus testnets (`sepolia`, `arbitrum-sepolia`, `base-sepolia`,
`unichain-sepolia`).

Adding a new network: append a branch to `getSubgraphConfig()` in
`chains.ts` and add `PoolManager` / `PositionManager` addresses to
`networks.json`.

## Requirements

- **Node.js** ≥ 20
- **npm** ≥ 10
- **Docker Desktop** (Windows/macOS local tests only — Linux/WSL runs the
  native matchstick binary)

## Installation

```bash
npm install
npm run codegen        # generates src/types/ from schema.graphql + ABIs
```

## Build

```bash
npm run build          # codegen + graph build
```

## Test

```bash
npm test               # graph test -d  (matchstick in Docker — Windows/macOS)
npm run test:ci        # graph test     (native binary — Linux/WSL, ~5× faster)
```

The CI workflow (`.github/workflows/test.yml`) runs `test:ci` on every push and
pull request against `main`.

### Coverage breakdown

| Layer | Coverage |
|---|---|
| Math utilities (`tickMath`, `sqrtPriceMath`, `liquidityAmounts`, `fullMath`) | full |
| Pricing (`sqrtPriceX96ToTokenPrices`, `findNativePerToken`, `getTrackedAmountUSD`, `calculateAmountUSD`) | full + branch coverage |
| Interval aggregation (Pool/Token Day & Hour data, Uniswap day data) | OHLC tracking + reuse semantics |
| Event handlers | happy path + multi-event accumulation + error paths |
| Transaction immutability | reuse-on-same-tx-hash verified |

## Deployment

### The Graph Studio

1. Create the subgraph in [The Graph Studio](https://thegraph.com/studio/).
   The slug must match `package.json` → `deploy:studio` (default
   `infinity-cl-subgraph`).
2. Authenticate and deploy:

```bash
npm run build
npm run auth:studio    # paste the Studio deploy key when prompted
npm run deploy:studio  # graph deploy --studio infinity-cl-subgraph
```

Studio prompts for a version label (e.g. `v1.0.0`) at deploy time.

#### Switching networks

`subgraph.yaml` targets `base` by default. To deploy to another chain, edit
the `network:` field on both dataSources and rebuild — the matching
`chains.ts` config branch is already wired:

```yaml
dataSources:
  - kind: ethereum/contract
    name: PoolManager
    network: bsc          # was: base
    source:
      address: "0x..."    # from networks.json
      startBlock: ...
```

#### Grafting

Grafting is **disabled** by default for clean first deploys. To graft from a
prior deployment, add to `subgraph.yaml`:

```yaml
features:
  - nonFatalErrors
  - grafting
graft:
  base: <Qm... deployment ID from Studio>
  block: <block to graft at>
```

### Goldsky

Goldsky replaces the deprecated Alchemy / Satsuma target. Install the CLI
once:

```bash
curl https://goldsky.com | sh
goldsky login          # paste an API key from app.goldsky.com
```

Then:

```bash
npm run build
npm run deploy:goldsky # goldsky subgraph deploy infinity-cl-subgraph/1.0.0 --path .
```

Bump the version tag in the `deploy:goldsky` script for each new version.

## Project structure

```
src/
├── mappings/              # event handlers, one file per event type
│   ├── poolManager.ts     # handleInitialize
│   ├── modifyLiquidity.ts # handleModifyLiquidity
│   ├── swap.ts            # handleSwap
│   ├── subscribe.ts       # handleSubscription
│   ├── unsubscribe.ts     # handleUnsubscription
│   └── transfer.ts        # handleTransfer
├── utils/
│   ├── chains.ts          # per-network SubgraphConfig (16 networks)
│   ├── pricing.ts         # USD/native price derivation
│   ├── intervalUpdates.ts # OHLC day/hour aggregates
│   ├── liquidityMath/     # CL math primitives (tickMath, sqrtPriceMath, ...)
│   ├── tick.ts            # Tick entity factory
│   ├── token.ts           # ERC20 metadata fetchers w/ fallbacks
│   ├── id.ts              # entity ID builders
│   ├── constants.ts       # hoisted BigInt/BigDecimal constants
│   └── index.ts           # safeDiv, convertTokenToDecimal, loadTransaction
└── types/                 # codegen output (gitignored, regenerated)

tests/
├── handlers/              # one file per handler + cross-event accumulation
└── utils/                 # math, pricing, intervalUpdates, id, tick, ...

abis/                      # ERC20 + PoolManager + PositionManager JSON
schema.graphql             # entity types
subgraph.yaml              # manifest (specVersion 1.0.0, apiVersion 0.0.9)
networks.json              # per-network deployment addresses
```

## Performance notes

Refactor highlights vs. the upstream subgraph:

- **`tickMath`** — 20 magic multipliers parsed once at module load instead of
  re-parsing 20 hex strings on every `getSqrtRatioAtTick` call. `Q32` / `Q128`
  hoisted to constants.
- **`liquidityAmounts`** — `getAmount0` / `getAmount1` skip one
  `getSqrtRatioAtTick` call in the common in-range case.
- **`exponentToBigDecimal`** — backed by a precomputed `10^n` table; pricing
  and `convertTokenToDecimal` (~4 calls/swap) reuse cached instances.
- **`constants.ts`** — `NEG_ONE_BD`, `TWO_BD`, `ONE_MILLION_BD`, `Q192_BD`
  reused instead of re-parsed every hot-path call.
- **Immutable schema entities** — single-write event entities skip the
  indexer's update path (~10× faster on those entities).
- **`loadTransaction`** — early-returns when Transaction already exists,
  avoiding a redundant write per event in a multi-event transaction.

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@graphprotocol/graph-cli` | `0.98.1` | codegen, build, deploy |
| `@graphprotocol/graph-ts` | `0.38.2` | AssemblyScript runtime bindings |
| `matchstick-as` | `0.6.0` | unit testing |

All three are pinned to their `latest` dist-tag.

## License

GPL-3.0-or-later — see [LICENSE](LICENSE).
