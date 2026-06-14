# Jamazon — Mock Amazon Storefront with Nomad-Style Passport Checkout (POC)

A deployed-ready **Next.js (App Router, TypeScript)** mock Amazon storefront that an
AI agent (e.g. a ChatGPT browsing/operator agent) can navigate to add an item to
cart, go to checkout, and attempt to purchase. At checkout the site simulates
**Nomad's agent-passport verification** and shows **Approved** or **Fraudulent
transaction detected**.

> **Everything is hardcoded and client-side. There are NO backend/API calls, no
> real Solana, no Ed25519, and no SDK imports.** The checkout decision is a
> synchronous lookup in a static array (`lib/verifyAgent.ts`). This is a
> proof-of-concept, **not** the real verifier.

Not affiliated with, endorsed by, or connected to Amazon. "Jamazon" is a fictional
brand and all product art is placeholder (emoji tiles).

---

## Known-good Agent ID (happy path)

Paste this into the **Agent ID** field at checkout to get an **Approved** order:

```
Ag3ntPa55port1111111111111111111111111111111
```

Other demo IDs (all defined in [`lib/verifyAgent.ts`](lib/verifyAgent.ts)):

| Agent ID                                       | Outcome       | Why                                                                   |
| ---------------------------------------------- | ------------- | --------------------------------------------------------------------- |
| `Ag3ntPa55port1111111111111111111111111111111` | ✅ Approved   | authorized passport, `payments.charge` granted                        |
| `Buyer4gentWi1dcardPay9999999999999999999999`  | ✅ Approved   | authorized via `payments.*` wildcard scope                            |
| `Read0n1yAgentNoPayScope88888888888888888888`  | ⛔ Fraudulent | passport exists but lacks the purchase scope (`action_not_permitted`) |
| anything else                                  | ⛔ Fraudulent | no matching passport (`agent_not_authorized`)                         |

---

## How the mock maps to real Nomad (faithful, but mocked)

In the real system (`verifier/src/verify.ts` in the parent repo) an agent signs an
action with its Ed25519 **agent key**, and the verifier reads the on-chain
**passport PDA** derived from `["passport", agentPubkey]`, then checks
`permits(passport.permissions, action)`.

This mock preserves the protocol's meaning without any of the cryptography:

- The **owner wallet** (`authority`) and the **agent key** are two _distinct_ keys —
  never `agentKey == wallet`. Authorization here = the Agent ID is found in a
  registry of passports issued by a trusted owner wallet **and** its scopes grant
  the purchase action.
- The purchase action is `payments.charge` (`PURCHASE_ACTION`).
- `permits()` is copied verbatim from `packages/sdk/src/permissions.ts`: exact match
  **or** a trailing `ns.*` wildcard prefix match.

The user-visible surface is just **Approved** vs **Fraudulent transaction
detected**; the internal decision stays faithful to the protocol.

---

## Run locally

Requires Node ≥ 18. **Zero environment variables** — a fresh clone runs as-is.

```bash
npm install
npm run dev          # http://localhost:3000
```

Production build:

```bash
npm run build
npm run start
```

---

## Deploy to Vercel

1. Push this `mock-amazon/` directory to a Git repo (or set it as the project root
   in Vercel — **Root Directory = `mock-amazon`** if deploying from the monorepo).
2. Import the project in Vercel. Framework preset: **Next.js** (auto-detected).
3. No environment variables are required. Click **Deploy**.
4. Open the generated URL and verify the acceptance scenarios below.

---

## Agent-operability

Every interactive control has a stable `data-testid` **and** an accessible name, so
a DOM-driven agent can complete the flow without hover menus, drag-drop, or
captchas. Key selectors:

| Action              | `data-testid`                                             |
| ------------------- | --------------------------------------------------------- |
| Add to cart         | `add-to-cart`                                             |
| Open cart           | `cart-link` (badge: `cart-count`)                         |
| Proceed to checkout | `proceed-to-checkout`                                     |
| Agent ID field      | `agent-id-input` (also `id="agent-id"`, `name="agentId"`) |
| Place order         | `place-order`                                             |
| Result region       | `verify-result` (`aria-live="polite"`)                    |
| Approved block      | `order-approved` (`order-number`, `verified-agent-label`) |
| Fraud block         | `order-fraudulent` (`fraud-reason`)                       |

---

## Tests (acceptance §11)

End-to-end tests drive the full happy path, fraud path, empty-field, empty-cart,
reset-and-retry, and a no-`/api/`-calls assertion — all via `data-testid` /
accessible-name selectors.

```bash
npx playwright install chromium   # first time only (downloads the browser)
npm run test:e2e
```

---

## Project structure

```
app/
  layout.tsx                 header, footer, cart provider, mock disclaimer
  page.tsx                   landing / product grid
  product/[id]/page.tsx      product detail (Add to Cart / Buy Now)
  cart/page.tsx              cart + qty steppers + subtotal
  checkout/page.tsx          order summary + Agent ID field + submit logic
  order/result/page.tsx      shareable confirmation (reads query params)
components/                  Header, Footer, ProductCard, CartItemRow,
                             QuantityStepper, AgentVerifyPanel, OrderResult, …
context/CartContext.tsx      cart state in React Context + localStorage
lib/
  products.ts                hardcoded catalog (no backend)
  verifyAgent.ts             MOCK client-side decision + authorized registry
  money.ts                   integer-cents → display helpers
tests/checkout.spec.ts       Playwright acceptance tests
```

---

## What this mock deliberately does **not** do

- No backend, no API route, no `fetch`, no real Solana / Ed25519 / SDK import.
- No literal "agent key == wallet key" equality (the keys are distinct by design).
- No real payments, PCI fields, or addresses (shipping/payment blocks are decorative).
- No Amazon logo, smile mark, or scraped assets; no search backend, auth, or DB.
