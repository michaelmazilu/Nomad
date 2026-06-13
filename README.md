# Agent Identity & Permission Passports on Solana

AI agents get a cryptographic identity plus an on-chain **permission passport**.

- A user's **owner wallet** (Phantom or a local keypair) creates, updates, and
  revokes the passport and pays for those writes.
- The **agent keypair is identity-only**: it signs runtime action requests and
  nothing else. Its private key never leaves the device.
- A **verifier** checks each signed action request against the on-chain
  permissions before allowing it.

The blockchain is the source of truth for _what an agent may do_ and for
_revocation_. There is no on-chain compute at verification time — the program
runs only when a passport is written.

## Repository layout

| Package                                              | Lang          | What it is                                                                                                              |
| ---------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [`programs/agent-passport`](programs/agent-passport) | Rust / Anchor | On-chain program — the only thing that _writes_ a passport.                                                             |
| [`packages/sdk`](packages/sdk)                       | TypeScript    | Source of truth: message encoding, sign/verify, PDA derivation, passport decoding, permission matching. Browser + Node. |
| [`verifier`](verifier)                               | TypeScript    | Reference verification service (pipeline + Fastify endpoint).                                                           |
| [`extension`](extension)                             | MV3 / TS      | Browser extension — the interactive way to try it.                                                                      |
| [`connector`](connector)                             | Web / TS      | Tiny web page that connects to Phantom and signs passport writes (Phantom can't inject into an extension popup).        |

## The pipelines

Three, deliberately separate. **Only the first writes to the chain; the third
reads it exactly once.**

### 1. Write a passport — owner wallet → program (on-chain)

Owner wallet signs and pays; the agent key is not involved. The owner is
**Phantom** (recommended) or, for local development, an in-extension keypair.

- `initialize_passport(agent, label, permissions)` — creates the passport PDA.
- `update_permissions(label?, permissions)` — replaces the full scope set (idempotent).
- `close_passport()` — deletes the account and refunds rent. **This is revocation.**

Only the stored `authority` may update or close. The PDA is derived from the
agent public key, so each agent has exactly one passport address.

With Phantom, the extension **builds** the unsigned transaction (validating
permissions first), the connector page asks Phantom to **sign** it, and the
extension **submits** it. Phantom signs, never sends — so its key never enters the
extension and localnet still works even though Phantom can't reach a local RPC.

### 2. Sign an action — agent key → request (offline)

The agent signs the **canonical bytes** of the request via `encodeActionMessage()`
— an explicit length-prefixed layout with a domain-separation tag, not
`JSON.stringify`. Signer and verifier use the same SDK encoder, so they can never
disagree on bytes. An Ed25519 signature is a fixed 64 bytes.

### 3. Verify an action — verifier (fail-closed, one network read)

Cheap offline checks first; exactly **one** network call. **Any error fails closed.**

```
1  freshness     local    |now − request.timestamp| ≤ ±60s
2  replay        local    signature not in the seen-signature cache
3  signature     offline  re-encode the request, Ed25519 verify
4  record sig    local    add signature to replay cache (TTL = skew window)
5  read passport network  getAccountInfo on the PDA   ← the ONLY network call
6  permission    local    permits(passport.scopes, request.action)
```

| Status                 | HTTP | Meaning                                          |
| ---------------------- | ---- | ------------------------------------------------ |
| `ok`                   | 200  | allowed                                          |
| `stale_or_future`      | 403  | timestamp outside the skew window                |
| `replay`               | 403  | signature already seen                           |
| `bad_signature`        | 403  | malformed input or signature fails to verify     |
| `no_passport`          | 403  | no passport at the PDA (unregistered or revoked) |
| `not_permitted`        | 403  | passport exists but does not grant the action    |
| `verifier_unavailable` | 503  | RPC / cache error — fails closed                 |

---

# Setup

You need two toolchains: **Node** (SDK / verifier / extension) and **Solana +
Anchor** (on-chain program). Run these in order from the repo root.

```bash
# 1. Node deps (requires Node ≥ 18) — installs all workspaces
npm install

# 2. Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 3. Solana / Agave CLI 2.1.0
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# 4. Anchor 0.31.1 (via avm)
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.31.1 && avm use 0.31.1
```

Exact versions the repo is tested against: `anchor-cli` 0.31.1, Solana/Agave CLI
2.1.0, `rustc` 1.79 (the platform-tools compiler).

> **Do not run `cargo update`.** `Cargo.lock` pins the crate tree to
> Rust-1.79-compatible releases; an unpinned update reintroduces edition2024 /
> MSRV build errors.

Then build:

```bash
solana-keygen new                              # owner wallet at ~/.config/solana/id.json (if you lack one)
anchor build                                   # compiles the program + generates IDL/TS types
npm run build -w @agent-passport/sdk           # build the SDK first — everything depends on it
npm run build -w @agent-passport/verifier
npm run build -w @agent-passport/extension
```

Verify (optional): `npm test --workspaces --if-present` and `anchor test`.

---

# Try it — the browser extension + Phantom

1. **Build & load the extension.** After the build above, in Chrome:
   `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select
   `extension/dist`.
2. **Start the Phantom connector** (a normal web page — Phantom won't inject into
   the extension popup). It must run on `http://localhost:5173` (the origin pinned
   in the manifest's `externally_connectable`):

   ```bash
   npm run dev -w @agent-passport/connector   # serves the connector on :5173
   ```

3. **Use the popup.** Pick a cluster, then:
   - **Create / load agent key** — the identity that signs action requests.
   - **Owner = Phantom** → **Connect Phantom**: a connector tab opens; approve the
     connection. The popup shows the connected **address, balance, and cluster**.
   - **Create / Update / Revoke** the passport: permissions are validated, then a
     connector tab opens for you to **approve & sign** in Phantom. The popup shows
     the **transaction status and signature** (or a useful error).
   - **Attempt an action** to see the live allow/deny verdict from the verifier.

   For local-only work, switch **Owner** to **Local keypair (dev only)** — an
   in-extension key, no Phantom or connector needed.

Clusters: Phantom supports **devnet** & **mainnet**; for **localnet**, run
`anchor localnet` first (Phantom signs, the extension submits to the local
validator). Full walkthrough and the permission-matching table are in
[extension/README.md](extension/README.md).

## Run the verifier as a standalone service

```bash
CLUSTER=devnet RPC_URL=... PROGRAM_ID=... PORT=8787 npm start -w @agent-passport/verifier
# POST /verify { agentPublicKey, signature, request }  ->  200 ok | 403 deny | 503 unavailable
```

---

## Permission scopes

`<namespace><sep><rest>` — `namespace` from the allowlist (`calendar`, `mail`,
`files`, `contacts`, `tasks`, `api`, `mcp`, `system`), `sep` is `.` or `:`,
lowercase ASCII. The only wildcard is a single trailing `.*` (e.g. `calendar.*`),
which grants any action with that `namespace.` prefix.

Examples: `calendar.read`, `calendar.*`, `mail.send`, `api:example.com`,
`mcp:my-server`. A bare namespace matches nothing.

On-chain bounds: label ≤ 64 bytes, ≤ 32 scopes, each ≤ 64 bytes. Program ID
(localnet/devnet): `43MLqvfxob3RoxGGLMdqGUERCiGN5NKWJyuvvBSVjjgi`.

## Clusters & mainnet

The cluster (RPC URL + program ID) is configuration on both the client and the
verifier — a mismatch silently reads an empty PDA and denies as `no_passport`.
Develop on localnet + devnet (free, resettable). For mainnet-beta: flip the
cluster, fund an owner wallet, use a dedicated RPC URL, and budget real SOL for
deployment and per-passport rent.

## Security assumptions

- **Two keys, never mixed.** The **agent key** signs action requests only; the
  **owner wallet** signs passport writes only. The program enforces this with
  `has_one = authority`, so a leaked agent key cannot rewrite its own passport.
- **Phantom keys never leave Phantom.** The extension/connector only ever request
  a _connect_ (public key) or a _signature_ on a transaction the extension built.
  Private keys are never requested, exposed, logged, or stored. Phantom **signs,
  never sends** — submission is done by the extension.
- **The local keypair is development-only.** It is generated in and stored by the
  extension (`chrome.storage.local`, plaintext) and is offered as an explicitly
  labelled dev option. Do not fund it with real value.
- **Connector channel is origin-scoped.** The connector talks to the extension
  only via `externally_connectable`, restricted to `http://localhost:5173`. It
  relays a connect result or a signed transaction keyed to a one-time request id;
  it cannot trigger writes or read keys. Host it over HTTPS for non-local use and
  update the manifest origin accordingly.
- **Validate before signing.** Permissions are validated in the popup and again in
  the background _before_ a transaction is built or a signature is requested.
- **Network safety.** A transaction built for one cluster is never signed against a
  wallet reporting a different cluster (network-mismatch check), and all writes
  fail closed on RPC errors.

## Non-goals

No spending/budget/payment-authority logic. No production payer-economics model.
No on-chain action verification.
