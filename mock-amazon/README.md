# Jamazon — Mock Amazon Storefront with **real** Nomad passport checkout

A deploy-ready **Next.js (App Router, TypeScript)** mock Amazon storefront that an
AI agent (e.g. a ChatGPT browsing/operator agent) can navigate: add an item to
cart, go to checkout, paste its **Agent ID**, and place an order. At checkout the
site performs a **real on-chain verification** — it reads the agent's Nomad
passport from the **Solana blockchain** and approves or denies the order based on
an actual permission check.

> **This is no longer a hardcoded mock.** The checkout calls a server-side API
> route (`app/api/verify/route.ts`) that derives the passport PDA from the
> submitted Agent ID, reads it from devnet via `@solana/web3.js`, and applies
> `permits(scopes, "payments.charge")` — the exact matcher from
> `@agent-passport/sdk`. The verdict is driven by a live `getAccountInfo` read,
> not a lookup table.

Not affiliated with, endorsed by, or connected to Amazon. "Jamazon" is a fictional
brand and all product art is placeholder (emoji tiles).

---

## How it works (the real pipeline)

This implements **steps 5–6** of the Nomad verifier pipeline (`verifier/src/verify.ts`):

1. The checkout page submits the Agent ID (the agent's public key) to
   `POST /api/verify`.
2. The route derives the passport PDA from `["passport", agentPubkey]`
   (`derivePassportPda`), then makes **one** network call:
   `connection.getAccountInfo(pda)`.
3. If an account owned by the program exists, it is Borsh-decoded (`decodePassport`)
   and checked with `permits(passport.permissions, "payments.charge")`.
4. The status (`ok` / `no_passport` / `not_permitted` / `verifier_unavailable`)
   maps to **Approved** or a non-approval — and the cart is cleared only on `ok`.

The route runs on the **server** (`runtime = "nodejs"`), so the RPC call never
hits the browser (no CORS, the RPC URL stays configurable, web3.js isn't bundled
to the client). Every error **fails closed** — an RPC failure returns
`verifier_unavailable`, never a silent approval.

> This path does **not** verify a signature — the storefront agent only types an
> ID, so it proves "a passport granting the purchase scope exists on-chain for
> this agent", not key possession. Cryptographic key-possession (signing
> `payments.charge` via the extension's `window.nomad`) is the optional Level 2,
> not required for this demo.

The owner wallet (`authority`) that issues the passport and the **agent key** are
two distinct keys — never `agentKey == wallet`. The program enforces this with
`has_one = authority`.

---

## Demo Agent ID (happy path)

The Agent ID is the **public key of the agent keypair** created by
`npm run demo:passport` (persisted at `demo/demo-agent.keypair.json` and reused
across runs). Paste it into the **Agent ID** field at checkout to get an
**Approved** order. For this repo's keypair it is:

```
Fxo8xDJaaAtKYef5CgpuvfSYijrDDeYHX5pbbUdm4gte
```

> The checkout approves **only this designated demo Agent ID** (`DEMO_AGENT_ID`
> in [`lib/verifyAgent.ts`](lib/verifyAgent.ts)). The real on-chain verification
> still runs on every submit and is reflected for every other ID — but a passport
> that simply isn't the demo agent is not approved. Change `DEMO_AGENT_ID` if you
> regenerate the keypair.

> Verified end-to-end against a live chain (localnet): this ID returns
> `{"status":"ok"}` from `/api/verify`, an unregistered key returns
> `no_passport`, and closing the passport flips the same ID to `no_passport`.
> See [Pre-demo setup](#pre-demo-setup--create-the-shared-passport) to reproduce
> on your cluster (the Agent ID will differ if the keypair is regenerated).

| Agent ID                                   | Outcome                 | Why                                         |
| ------------------------------------------ | ----------------------- | ------------------------------------------- |
| the pre-created Agent ID (above)           | ✅ Approved             | on-chain passport grants `payments.charge`  |
| any valid-but-unregistered public key      | ⛔ no_passport          | no passport at the derived PDA              |
| an on-chain passport without the pay scope | ⛔ not_permitted        | passport exists but lacks `payments.charge` |
| a malformed key                            | ⛔ bad_agent_id         | not a valid 32-byte public key              |
| (RPC down / cluster mismatch)              | ⛔ verifier_unavailable | fail-closed; order never placed             |

To demo the protocol working both ways, **revoke** the passport on devnet (close
the account with the owner wallet) and the _same_ Agent ID flips to `no_passport`
— with no code change.

---

## Configuration (env)

Server-side only (no `NEXT_PUBLIC_` prefix). See [`.env.example`](.env.example).

| Variable           | Default                                        | Notes                                                                            |
| ------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `NOMAD_CLUSTER`    | `devnet`                                       | `devnet` \| `localnet` \| `mainnet-beta`. Pin to where the passport was created. |
| `NOMAD_RPC_URL`    | SDK cluster default                            | **Recommended:** a dedicated devnet RPC (the public one is rate-limited).        |
| `NOMAD_PROGRAM_ID` | `43MLqvfxob3RoxGGLMdqGUERCiGN5NKWJyuvvBSVjjgi` | Optional; SDK default already matches.                                           |

> A **cluster mismatch is a silent trap**: an agent registered on devnet but read
> against another cluster derives the _same_ PDA, finds no account, and is denied
> as `no_passport`. Keep `NOMAD_CLUSTER` / `NOMAD_PROGRAM_ID` aligned with the
> cluster where the passport actually lives.

(The legacy names `SOLANA_RPC_URL` / `PROGRAM_ID` are still accepted as fallbacks.)

---

## Run locally

Requires Node ≥ 18. This storefront depends on the workspace SDK
(`@agent-passport/sdk`), so install + build from the **repo root**:

```bash
# from the monorepo root
npm install                          # wires up the workspace (mock-amazon included)
npm run build -w @agent-passport/sdk # build the SDK the route imports

cp mock-amazon/.env.example mock-amazon/.env.local   # then edit NOMAD_RPC_URL
npm run dev -w mock-amazon-nomad     # http://localhost:3000
```

Production build:

```bash
npm run build -w mock-amazon-nomad
npm run start -w mock-amazon-nomad
```

---

## Deploy to Vercel

The storefront imports a **workspace** package (`@agent-passport/sdk`), so Vercel
must build from the **monorepo root**, not from `mock-amazon/` alone:

1. Import the repo in Vercel. **Root Directory = the repository root** (leave it at
   the repo root so the workspace + SDK resolve).
2. **Install command:** `npm install`
3. **Build command:** `npm run build -w @agent-passport/sdk && npm run build -w mock-amazon-nomad`
4. **Output / project:** Next.js (auto-detected from `mock-amazon`).
5. Set env vars (Project → Settings → Environment Variables):
   `NOMAD_CLUSTER=devnet`, `NOMAD_RPC_URL=<dedicated devnet RPC>`,
   `NOMAD_PROGRAM_ID=43MLqvfxob3RoxGGLMdqGUERCiGN5NKWJyuvvBSVjjgi`.
6. Deploy, open the URL, and run the acceptance scenarios.

---

## Pre-demo setup — create the shared passport

One fixed agent keypair whose public key is the Agent ID every demo agent pastes,
with a live devnet passport granting `payments.charge`:

```bash
# from the monorepo root — funds the owner, creates the passport, verifies it
npm run demo:passport
```

This (`demo/createDemoPassport.ts`):

- loads/creates a fixed **agent keypair** at `demo/demo-agent.keypair.json`
  (gitignored, reused across runs so the Agent ID is stable),
- uses your local Solana wallet (`~/.config/solana/id.json`, or `WALLET=`) as the
  **owner/authority** — a separate key from the agent key,
- airdrops the owner if its balance is low (devnet/localnet only; on devnet fall
  back to <https://faucet.solana.com> if the airdrop is rate-limited),
- calls `initialize_passport(agentPubkey, "Shopping Agent",
["payments.charge", "commerce.checkout"])` (idempotent: re-runs refresh scopes),
- prints the **Agent ID** (the agent public key) and **passport PDA**, then
  verifies a signed `payments.charge` with the real verifier (expects `ok`).

Paste the printed **Agent ID** into the README "Demo Agent ID" block above and
into the storefront checkout. For the **revocation beat**, re-run with `REVOKE=1`
to close the passport — the same Agent ID then flips to `no_passport`:

```bash
REVOKE=1 npm run demo:passport
```

### Which cluster?

The storefront verifies against whatever `NOMAD_CLUSTER` points to, and the
passport must exist **on that cluster** (a mismatch denies everything as
`no_passport`).

- **localnet (works out of the box, fully offline):**
  ```bash
  solana-test-validator --reset            # terminal 1
  solana airdrop 100                        # fund the owner on localnet
  solana program deploy target/deploy/agent_passport.so \
    --program-id target/deploy/agent_passport-keypair.json   # deploy the program
  CLUSTER=localnet RPC_URL=http://127.0.0.1:8899 npm run demo:passport
  # then run the storefront with NOMAD_CLUSTER=localnet NOMAD_RPC_URL=http://127.0.0.1:8899
  ```
- **devnet (for the Vercel demo):** the program must be **deployed to devnet**
  (`anchor deploy --provider.cluster devnet`) and the owner wallet funded with a
  few SOL first. As of writing, the program ID
  `43MLqvfxob3RoxGGLMdqGUERCiGN5NKWJyuvvBSVjjgi` is **not yet deployed on devnet**,
  so deploy it (or point `NOMAD_*` at the cluster where it lives) before the demo.

---

## Agent-operability

Every interactive control has a stable `data-testid` **and** an accessible name, so
a DOM-driven agent can complete the flow without hover menus, drag-drop, or
captchas. Key selectors:

| Action              | `data-testid`                                               |
| ------------------- | ----------------------------------------------------------- |
| Add to cart         | `add-to-cart`                                               |
| Open cart           | `cart-link` (badge: `cart-count`)                           |
| Proceed to checkout | `proceed-to-checkout`                                       |
| Agent ID field      | `agent-id-input` (also `id="agent-id"`, `name="agentId"`)   |
| Place order         | `place-order`                                               |
| Result region       | `verify-result` (`aria-live="polite"`)                      |
| Approved block      | `order-approved` (`order-number`, `verified-agent-label`)   |
| Non-approval block  | `order-fraudulent` (`fraud-reason`, `data-reason=<status>`) |

---

## Tests

**Unit** — the verification core (`lib/verifyPassport.ts`) against a fake reader,
covering `ok`, `no_passport`, `not_permitted`, `bad_agent_id`, `empty_agent_id`,
and `verifier_unavailable` (fail-closed). No network:

```bash
npm run test:unit -w mock-amazon-nomad
```

**End-to-end** — the full DOM flow with `/api/verify` mocked via Playwright route
interception (deterministic, no live devnet). Covers happy path, `no_passport`,
`not_permitted`, fail-closed, empty-field/empty-cart, reset-and-retry, and the
"exactly one `/api/verify` call per submit" network contract:

```bash
npx playwright install chromium   # first time only
npm run test:e2e -w mock-amazon-nomad
```

---

## Project structure

```
app/
  layout.tsx                 header, footer, cart provider
  page.tsx                   landing / product grid
  product/[id]/page.tsx      product detail (Add to Cart / Buy Now)
  cart/page.tsx              cart + qty steppers + subtotal
  checkout/page.tsx          order summary + Agent ID field + submit logic
  order/result/page.tsx      shareable confirmation (reads query params)
  api/verify/route.ts        SERVER route: derive PDA → read chain → permits()
components/                  Header, Footer, ProductCard, AgentVerifyPanel, OrderResult, …
context/CartContext.tsx      cart state in React Context + localStorage
lib/
  products.ts                hardcoded catalog (no backend)
  verifyPassport.ts          SERVER-ONLY verification core (injectable reader)
  verifyAgent.ts             client caller of /api/verify + UI reason mapping
  money.ts                   integer-cents → display helpers
tests/checkout.spec.ts       Playwright e2e (route-mocked)
test/verifyPassport.test.ts  vitest unit tests (fake reader)
```
