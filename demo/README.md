# End-to-end demo

Exercises the whole protocol on a **real on-chain account**: owner wallet writes
a passport, the agent key signs action requests, the verifier checks them against
the live passport (offline signature + one RPC read), then the owner revokes and
the verifier denies.

## Run on localnet (two terminals)

```bash
# terminal 1 — validator + program deployed, stays running
anchor localnet

# terminal 2 — run the demo against it
npm run demo
```

`npm run demo` uses `~/.config/solana/id.json` as the owner wallet and airdrops
to it on localnet automatically.

## Run on devnet

Deploy the program to devnet first (`anchor deploy --provider.cluster devnet`
with a funded wallet), then:

```bash
CLUSTER=devnet RPC_URL=https://api.devnet.solana.com WALLET=~/.config/solana/id.json npm run demo
```

## Expected output

```
[write] owner creates passport: scopes [calendar.read, calendar.*]

[verify] against the live passport:
  calendar.events.list (via calendar.*)          -> ok
  mail.send (not granted)                        -> not_permitted
  replay the first request                       -> replay

[write] owner revokes (closes the account)

[verify] after revocation:
  calendar.read (revoked)                        -> no_passport
```

Env overrides: `RPC_URL`, `CLUSTER` (`localnet|devnet|mainnet-beta`), `WALLET`.
