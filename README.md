# Mezora

Business cash flow on Mezo: bills, reserved MUSD budgets, owner-approved payments and receipt reconciliation.

Live app: https://mezora.vercel.app · Treasury setup: https://mezora.vercel.app/setup · Trove repayment: https://mezora.vercel.app/repay

The hosted app uses dedicated Neon PostgreSQL. Owner deployment and repayment require signatures in the connected wallet; current evidence is recorded in docs/hosted-deployment-evidence.json.

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
2. Open /setup, connect OKX Wallet and sign in with the owner account, review deployment and approve it in the wallet; registration verifies exact creation calldata and runtime. Existing treasury connection is also supported.
3. Local: set apps/web/.env.local from root .env.example as needed. Treasury bindings persist per owner; MEZORA_TREASURY_ADDRESS remains an optional operator fallback. Hosted: dedicated PostgreSQL DATABASE_URL is required. Use full absolute MEZORA_DATA_DIR if running services from different directories.
4. Restart web. Select Mezo Testnet, connect OKX Wallet (extension or its in-app browser) and sign nonce-bound login.
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

The business workspace includes bills, cash commitments, a 30-day cash plan, saved scenarios, invoice checks, CSV import, document-to-draft extraction, recurring drafts, customer receivables, statements and application team approvals. Proposals and explanations are deterministic. Recurring bills create drafts, not unattended payments.

V1 remains the active owner-controlled workspace treasury. Application reviewer approval does not prevent its owner from calling V1 directly. The separately deployed V2 enforces owner plus immutable reviewer quorum in the contract. V2 test acceptance has proven shared unpause and one complete 1-MUSD funding/reserve/payment flow. This is a separate acceptance page, not a migration of the main workspace or general V2 bill support.

### Verified Mezo Testnet evidence

| Workflow | Evidence |
| --- | --- |
| Owner bill payment, 1 MUSD | [Payment](https://explorer.test.mezo.org/tx/0x2926b0c09b1599c1ed5f5717abfde19054aff3a877a3ea058e598323dca48ba9) |
| Borrower repayment, 1 MUSD | [Repayment](https://explorer.test.mezo.org/tx/0x525ecdb461231c0e6cb355a1525c2adc966156179c671b1c993a479ed7759164) |
| Receivable, 1 MUSD, reviewed allocation | [Incoming transfer](https://explorer.test.mezo.org/tx/0xb42f2f246d6149f3bcb315f255b24efe2d9df200f9facaa2ab26bf3f83eabee1) |
| Withdraw 1 MUSD, then repay 0.5 MUSD | [Withdrawal](https://explorer.test.mezo.org/tx/0x1c2044fd314e3355d946fe281de24e3fc24865a76a1338fc4e5eb1526c6e9038), [repayment](https://explorer.test.mezo.org/tx/0x0fef1f0fd2b4121e31318a170ccf4024d0f4586dda243813d4fbd47c601e1f03) |
| V2 owner + reviewer unpause | [Shared execution](https://explorer.test.mezo.org/tx/0xb2a92d3e60b9be19051eed2ddf5d603b85ccb8d9d79198bcc5e5de7a3cca3930) |
| V2 owner + reviewer bill payment, 1 MUSD | [Payment](https://explorer.test.mezo.org/tx/0xa31e7a7f0064f90e628e416c3b2d609c9a004ad642939413cd7fd697d8c49d57) |

These are self-funded testnet acceptance transactions, not customer revenue. The withdrawal/repayment path uses two separately signed transactions and retains the unused 0.5 MUSD in the owner wallet. Token fungibility does not prove which withdrawn units funded a later payment.

- V2: `0x54bdde1c3be2e8fa178a55ae06700160846002ec`
- V1 acceptance treasury: `0xb06cFA71F295922B96501c34744ACf87Afa00351`
- [Completed V2 test and receipts](https://mezora.vercel.app/setup/v2/payment)
- Structured proofs: `docs/testnet-*-evidence-2026-10-25.json`.

Contracts are unaudited and signers on V2 cannot rotate. Current deployment is testnet. No claim of mainnet readiness, adoption, autonomous execution or completed contest submission. A final video, exported project deck and live AKINDO form check remain release tasks.

## Wallet integration (25 October 2026)

The three app pages now select OKX Wallet explicitly, using its dedicated injected namespace, labelled provider fallback, or EIP-6963 announcement. An unrelated window.ethereum provider is not selected. SIWE, exact calldata review, account/network checks and owner signatures remain required. Switching wallets may change the owner address: a treasury is bound to the account that actually deploys it. No assumption is made that the previously supplied address is present in OKX.

See docs/SUBMISSION_KIT.md for submission copy and docs/DEMO_RECORDING_SCRIPT.md for the two-minute recording sequence. Testnet treasury, payment and repayment receipts are confirmed; final video and exported deck remain pending.
