# Agent Identity & Permission Passports on Solana

AI agents carry a cryptographically verifiable identity plus an on-chain
**permission passport**. A user's **owner wallet** (e.g. Phantom) creates, edits,
and revokes the passport and pays for those writes. The **agent keypair is
identity-only**: it signs runtime action requests and nothing else. A
**verifier** confirms an action request and checks it against the on-chain
permissions before allowing it.

The agent's private key never leaves the device. The blockchain is the source of
truth for *what an agent may do* and for *revocation*.

> **There is no on-chain compute at verification time.** The program runs only
> when a passport is written. Verifying a request is: an **offline** Ed25519
> signature check (pure math, no network) → **one** account read
> (`getAccountInfo`) → a **local** comparison against the stored scopes. That
> read is the only network call in the verification path.

## Architecture

```
 agent device                         verifier (store/app/API)            Solana
 ────────────                         ────────────────────────            ──────
 agent key  ──signs ActionRequest──▶  1 freshness  (local)
 (64-byte                             2 replay      (local)
  Ed25519)                            3 signature   (OFFLINE, no network)
                                      4 record sig in replay cache
                                      5 read passport PDA ───getAccountInfo──▶ [Passport account]
                                      6 permits(scopes, action) (local)
 owner wallet ──initialize/update/close (signs + pays)──────────────────────▶ [program writes PDA]
```

| Package | Lang | Responsibility |
|---|---|---|
| [`programs/agent-passport`](programs/agent-passport) | Rust / Anchor | The on-chain program — the only thing that ever *writes* a passport. PDA account, `initialize`/`update`/`close`, authority enforcement, bounds, events. |
| [`packages/sdk`](packages/sdk) | TypeScript | Protocol single-source-of-truth: PDA derivation, canonical action-message encoder, Ed25519 sign/verify, Borsh passport decoder, permission evaluation, base58, cluster config. Runs in browser and Node. |
| [`verifier`](verifier) | TypeScript | Reference verification service: the 6-step fail-closed pipeline + a thin Fastify endpoint. |
| [`extension`](extension) | MV3 / TS | Agent key generation/storage, owner-wallet-signed passport management, runtime action signing. |

The SDK existing as its own package is what keeps the extension and verifier from
disagreeing about bytes.

## The primitives (correct by construction)

- Ed25519 signatures are a **fixed 64 bytes** — they do not grow with message
  length. Signing is an Ed25519 *signing* operation (`nacl.sign.detached`), not a
  hash.
- A Solana keypair's secret key is **64 bytes** (32-byte seed + 32-byte public
  key); the signer needs that 64-byte form. The SDK rejects a 32-byte seed.
- A timestamp alone is **not** replay protection. Replay defense = a freshness
  window **plus** a short-TTL seen-signature cache, fail-closed.
- The canonical action message is an explicit length-prefixed little-endian byte
  layout with a domain-separation tag — **not** `JSON.stringify`.

## Locked decisions

1. **Scopes: flat + reserved namespaces.** Scopes validate against a known
   namespace allowlist (off-chain SDK policy); the program enforces only the hard
   length/count bounds. Matcher = exact match + a single trailing `.*` wildcard.
2. **Skew window: ±60s** (configurable; the replay-cache TTL equals it).
3. **Verifier audience: internal / single trusted system.** In-memory replay
   cache behind a `ReplayCache` interface; Redis is a documented deferred step.
4. **Key storage: plaintext-behind-interface first.** `PlaintextKeyStore` ships
   first and is honestly *not* encrypted; `EncryptedKeyStore` (WebCrypto AES-GCM +
   PBKDF2 passphrase) is implemented behind the same interface.

## Prerequisites

- Node ≥ 18 and npm
- Rust + the Solana/Anchor toolchain. This repo is built and tested against:
  - `anchor-cli` **0.31.1** (via `avm`)
  - Solana/Agave CLI **2.1.0** (Anchor 0.31.1 pins this for `anchor build`)
  - `rustc` 1.79 (the platform-tools compiler that ships with Solana 2.1.0)

Install: `rustup`, then `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`,
then `cargo install --git https://github.com/coral-xyz/anchor avm --force && avm install 0.31.1 && avm use 0.31.1`.

> **Pinned `Cargo.lock` (important).** In 2026 the latest transitive crates
> require Rust editions / MSRVs newer than the platform-tools compiler (1.79).
> `Cargo.lock` pins the `solana-*` tree to 2.1.0 and a few build/proc-macro crates
> (`blake3`, `indexmap`, `hashbrown`, `proc-macro-crate`, `zeroize`, …) to their
> last 1.79-compatible releases. With those pins, plain `anchor build` / `anchor
> test` work on the stock 0.31.1 toolchain. Do **not** run `cargo update`
> unpinned, or the edition2024/MSRV errors return.

## Quickstart

```bash
npm install
npm run build -w @agent-passport/sdk     # build the SDK (others depend on it)
npm test --workspaces --if-present        # SDK + verifier unit tests
anchor test                               # program tests + SDK<->program cross-check (localnet)
```

## End-to-end demo

The full loop (owner writes passport → agent signs → verifier checks live
on-chain → revoke → deny) on a real validator:

```bash
anchor localnet          # terminal 1: validator + deployed program
npm run demo             # terminal 2
```

Prints `ok` (wildcard match) → `not_permitted` → `replay` → `no_passport` (after
revoke). See [demo/README.md](demo/README.md) (incl. devnet). The browser
extension demos the agent-identity half (create key + sign actions in the popup);
passport writes need Phantom in a page context — see
[extension/README.md](extension/README.md).

## Per-package

### Program — `programs/agent-passport`
```bash
anchor build                              # compile + generate IDL/types
anchor keys sync                          # write the real program id everywhere (already done: 43ML…)
anchor test                               # localnet: full validator, deploy, mocha suite
```
Program ID (localnet/devnet): `43MLqvfxob3RoxGGLMdqGUERCiGN5NKWJyuvvBSVjjgi`.
The mocha harness runs under `tsx` (see `Anchor.toml [scripts]`) because Node 21 +
ts-node/mocha mishandles `.ts` ESM resolution.

Account layout (declaration order = canonical Borsh layout the SDK mirrors):
`version:u8, bump:u8, authority:Pubkey, agent:Pubkey, label:String(≤64),
permissions:Vec<String>(≤32 × ≤64), created_at:i64, updated_at:i64` (seconds).
Bounds: `MAX_LABEL_LEN=64`, `MAX_SCOPE_LEN=64`, `MAX_PERMISSIONS=32`.

### SDK — `packages/sdk`
```bash
npm run build -w @agent-passport/sdk
npm test  -w @agent-passport/sdk          # 53 tests
```
Key exports: `encodeActionMessage`, `sign`/`verify`, `decodePassport`,
`derivePassportPda`, `permits`, `validateScope`/`validatePermissions`,
`getClusterConfig`, `encodeBase58`/`decodeBase58`, `AGENT_PASSPORT_PROGRAM_ID`.

### Verifier — `verifier`
```bash
npm test -w @agent-passport/verifier      # 17 tests (one per outcome)
CLUSTER=devnet RPC_URL=... PROGRAM_ID=... PORT=8787 npm start -w @agent-passport/verifier
```
`POST /verify { agentPublicKey, signature, request }` → 200 `ok`, 403 deny, or
503 `verifier_unavailable`. Result statuses: `ok | stale_or_future | replay |
bad_signature | no_passport | not_permitted | verifier_unavailable`. Any RPC error
fails closed. The `PassportReader` and `ReplayCache` interfaces are the seams for
read-through caching and a Redis-backed cache.

### Extension — `extension` (MV3)
```bash
npm run typecheck -w @agent-passport/extension
npm run build     -w @agent-passport/extension   # dist/ → load unpacked in Chrome
```
`PlaintextKeyStore` (explicitly not encrypted) and `EncryptedKeyStore` (AES-GCM +
PBKDF2) both implement `KeyStore`. The agent key lives only in the background
service worker and signs only action requests; passport writes are owner-wallet
(Phantom) signed in a page context. See the package's own notes for the MV3
wallet-connection caveat.

## Permission scopes

`<namespace><sep><rest>` — namespace from the allowlist (`calendar`, `mail`,
`files`, `contacts`, `tasks`, `api`, `mcp`, `system`), `sep` is `.` or `:`,
lowercase ASCII. A single trailing `.*` (e.g. `calendar.*`) is the only wildcard:
it grants any action with that `namespace.` prefix. Examples: `calendar.read`,
`calendar.*`, `api:example.com`, `mcp:my-server`.

## Clusters & mainnet

Cluster (RPC URL + program ID) is configuration on both client and verifier — a
mismatch is a silent `no_passport` deny. Develop/test on localnet + devnet (free,
resettable). Promote to **mainnet-beta** by flipping the cluster, funding an owner
wallet, and supplying a **dedicated** (non-public) RPC URL. Budget real SOL for
program deployment (`solana rent`) and per-passport rent.

## Non-goals

No spending/budget/payment-authority logic. No production payer-economics model.
No on-chain action verification.
