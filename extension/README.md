# Nomad — Browser Extension (MV3)

Self-contained control surface: create an agent identity, manage its on-chain
permission passport, and test whether the agent is allowed to take an action —
**all inside the extension, no external wallet required.**

## Build & load

```bash
npm install
npm run build -w @agent-passport/sdk        # SDK + verifier are bundled in
npm run build -w @agent-passport/verifier
npm run build -w @agent-passport/extension   # → extension/dist
```

Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → select
`extension/dist`. `npm run dev` runs the CRXJS dev server with HMR.

`Infer from ChatGPT` posts extracted, truncated tab context to
`VITE_NOMAD_INFERENCE_PROXY_URL` (default `http://localhost:8788/infer`). Run a
backend proxy there; do not bundle LLM API keys into the extension.

## Two keys, both local, both in the service worker

| Key           | Role      | Signs                                             |
| ------------- | --------- | ------------------------------------------------- |
| **Agent key** | identity  | action requests only                              |
| **Owner key** | authority | passport writes (create/update/revoke), pays fees |

Both are generated with `Keypair.generate()` and stored as 64-byte secret keys
behind the `KeyStore` interface, **only in the background service worker** — the
popup is a thin UI that messages the worker, so raw keys never enter the popup
DOM. `PlaintextKeyStore` (default) is honestly _not_ encrypted; swap in
`EncryptedKeyStore` (AES-GCM + PBKDF2) for encryption at rest.

The owner key replaces Phantom: it's the "dev owner wallet" model the brief
allows. Authority stays strictly separate from identity — the agent key can never
sign a write.

## New-user flow (everything works in the popup)

1. **Cluster** — pick `localnet` (after `anchor localnet`) or `devnet`.
2. **Create / load agent key** → shows the agent public key.
3. **Create / load owner key** → shows the owner public key + balance.
4. **Airdrop** → funds the owner (localnet/devnet) so it can pay for writes.
5. **Passport** — type a Label + scopes (one per line), or infer them from the
   active ChatGPT tab, then click **Create**
   (owner-signed, on-chain). **Update** replaces the full scope set; **Revoke**
   closes the account. **Load from chain** pulls the current scopes back.
6. **Attempt an action** — type an action, click **Attempt**. The agent signs it,
   the verifier checks it against the live on-chain passport, and the verdict box
   shows the real decision:
   - `OK` (green) — permitted
   - `NOT_PERMITTED` / `NO_PASSPORT` (red) — denied
   - `STALE_OR_FUTURE` / `BAD_SIGNATURE` / `REPLAY` / `VERIFIER_UNAVAILABLE`
     (amber) — other pipeline outcomes

## Demo the basic permissions

With scopes `["calendar.*", "mail.send"]` created on the passport, **Attempt**:

| Action                 | Verdict                             |
| ---------------------- | ----------------------------------- |
| `calendar.read`        | OK (wildcard)                       |
| `calendar.events.list` | OK (wildcard spans sub-segments)    |
| `mail.send`            | OK (exact)                          |
| `mail.read`            | NOT_PERMITTED                       |
| `files.read`           | NOT_PERMITTED (different namespace) |
| `calendar`             | NOT_PERMITTED (bare namespace)      |

Before any passport exists, Attempt returns `NO_PASSPORT`. After Revoke, it
returns `NO_PASSPORT` again — revocation is real.

> The same verifier logic runs as a standalone service (`verifier/`). The
> extension just runs it client-side against the selected cluster.

## Regenerating the vendored IDL

`src/idl/agent_passport.{json,ts}` are copied from `target/idl` and
`target/types`. After a program layout change: `anchor build`, then re-copy both.
