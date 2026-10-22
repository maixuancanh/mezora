# Mezora

Business cash flow on Mezo: bills, reserved MUSD budgets, owner-approved payments and receipt reconciliation.

## Run locally

Requires Node24 (tested24.14.1), npm and optionally Foundry.

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:3210. Local scenario mode starts each browser session with1,000 simulated MUSD and300 operating buffer. It persists to PGlite PostgreSQL storage under apps/web/.data/mezora. No wallet needed for scenario mode; scenario actions send no chain transactions. Different browser sessions have separate scenario workspaces.

Core path: Create bill → Verify terms → Reserve funds → Review payment → Confirm. Bills/Treasury/Activity and CSV export are functional. The assistant gives deterministic explanations, and the rule engine produces read-only buffer/surplus proposals. No LLM or automatic executor is connected.

## Mezo Testnet mode

Official chain31611, BTC gas. MUSD address independently checked read-only:
`0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`.
See deployments/testnet-token-verification.json for block/source/code evidence. This is token verification, not a Mezora deployment.

1. Build contracts with Foundry: `forge build --root contracts`.
2. Deploy MezoraTreasury(token, owner) using the owner wallet on Mezo Testnet.
3. Set apps/web/.env.local from root .env.example, including MEZORA_TREASURY_ADDRESS, MEZORA_ORIGIN and optional DATABASE_URL. Use full absolute MEZORA_DATA_DIR if running services from different directories.
4. Restart web. Select Mezo Testnet, connect injected EOA wallet and sign nonce-bound login.
5. Deposit first prompts exact MUSD allowance if needed; after confirmation, submit deposit again. Owner signs each action; application stores no owner private key.

Treasury deployed code, owner, token and18 decimals are checked before transaction preparation. All cash reads pin one block and recheck its hash. UI validates reviewed action/amount/recipient/chain/target before wallet send. Metadata contains no arbitrary calldata editor.

PGlite supports one web process; it reconciles during workspace refresh. For separate worker/server instances use external PostgreSQL:

```powershell
$env:DATABASE_URL='postgresql://...'
$env:MEZO_RPC_URL='https://rpc.test.mezo.org'
$env:MEZORA_TREASURY_ADDRESS='0x...'
npm run worker
```

The worker scans persisted authored intents, including prepared transactions with missing hashes, matches exact calldata via contract logs, validates receipts and rechecks confirmed block hashes. No owner signer is held by the worker. External transactions made outside Mezora are not imported into bill records; cash balance/reserved come from chain. Replacement/unknown attempts remain pending until exact intent evidence is found or a matching hash is registered. No blind payment retry.

## Contract

- Immutable token and owner; owner can reserve, pay, cancel and withdraw free funds.
- Fixed recipient/amount/terms hash per commitment; paid/canceled IDs permanently unusable.
- Owner-cancelable reservations are budget allocations, not vendor escrow.
- API uses depositOnce/withdrawOnce with a shared permanent request-ID namespace and onchain deadline.
- Manual deposit/withdraw remain owner tools without per-request replay protection.
- Pause blocks deposit/reserve/pay and permits cancellation/free withdrawal recovery.
- Standard nonrebasing, nonfee MUSD assumption; no arbitrary target calls, upgrade proxy or agent custody.

## Verification

```powershell
npm run typecheck
npm test
npm run build
& "$env:USERPROFILE/.foundry/bin/forge.exe" test --root contracts
npx tsx scripts/verify-testnet.ts
```

Evidence:
- docs/browser-evidence.json: browser flow, reload/session isolation, origin/replay rejection, mobile layout.
- docs/local-evm-evidence.json: EOA login and API→local EVM→receipt path.
- docs/recovery-evidence.json: missing-hash recovery and reorg.
- docs/mezora-desktop.png / mezora-mobile.png.

Local EVM reproduction requires Anvil on127.0.0.1:8547 with chain31611 and default public test mnemonic:
```powershell
& "$env:USERPROFILE/.foundry/bin/anvil.exe" --port 8547 --chain-id 31611
npx tsx scripts/setup-local-evm.ts
```
Then run a separate Next instance on3211 with MEZORA_BUILD_DIR=.next-live, isolated MEZORA_DATA_DIR, MEZO_RPC_URL from .data/local-evm.json and its local token/treasury. Set MEZORA_ORIGIN=http://127.0.0.1:3211 and MEZORA_CONFIRMATIONS=1. Execute scripts/test-local-evm.ts then scripts/test-recovery.ts. These scripts use only local public test accounts; never fund those keys externally.

## Reuse

See docs/THIRD_PARTY_NOTICES.md, docs/UI_REUSE.md and docs/DOMAIN_REUSE.md. Dreambot pure rule boundary, OmniAgentPay intent/approval model, AgentFabric scope presentation are adapted with MIT notices; OpenZeppelin selected source primitives and Radix/lucide dependencies are used. Midday/Mercury/Mate/PayBox inform workflow; no Midday AGPL source or proprietary product assets copied.

## Current delivery boundary

Implemented: local working workspace, persistent scenario, treasury contract, tests, EOA live transaction preparation/reconciliation, read-only proposals, local EVM evidence and official MUSD read verification.

Pending: funded Mezo treasury deployment, hosted durable app/PostgreSQL, public GitHub, testnet user receipt, customer invoice checkout, batch/recurring execution, Trove repay adapter, deck/pitch video and submission. Local tests and local EVM evidence do not establish those outcomes.
