# Mezora Business Workbench — 25/10/2026

Open <https://mezora.vercel.app/workbench>. The original treasury remains at <https://mezora.vercel.app>. Connect and authenticate the treasury owner's OKX wallet there, then choose **Mezo Testnet** in Workbench to use the private workspace. **Local scenario** uses simulated balances and cannot move chain funds. Hosted source-file uploads require a live authenticated workspace.

Deployment: `dpl_CZtG3hLzDm6u4Qs2QA9jqddwiirB`, READY and aliased to `mezora.vercel.app`. No new fund movement or wallet signature was made during this implementation.

| Area | Available behavior | Evidence / remaining acceptance |
|---|---|---|
| Public receipt | Wallet-free proof of payment or repayment; exact event/transfer, amount, terms hash for bill payment, canonical block, confirmations | Local payment and hosted repayment page observed confirmed. RPC can return unavailable; refresh is offered. Private bill metadata is excluded. |
| Cash impact / repayment UX | Bills → reserved commitments → buffer → surplus; clear preview/preparation/wallet/network stages; compact values | Existing payment/repayment evidence retained. New handoff links confirmed owner withdrawal to a separately signed repayment; mock-chain tests pass, a new real handoff remains. |
| Cash plan | 30 UTC dates, draft/recurring assumptions, late customer receipts, extra expenses, repayment scenario, immutable saved snapshots | Browser: deficit detection and save/reload passed. Forecast is a planning aid; expected income never increases signing capacity. |
| Invoice controls | Reference/source duplication, paid bill, chain/token, available funds, vendor address changes, category budget | Changed-payee warning observed in browser. Warnings require reasons bound to exact terms/policy snapshot; hard blocks cannot be acknowledged away. Budget period follows bill due month. |
| CSV import | Preview each row, select valid rows, create drafts, replay protection | Local preview/commit and hosted preview passed. 200 rows / 2MB. |
| Statements | Historical MUSD balance + Transfer logs, coverage gaps, CSV/JSON, canonical rechecks, close/reopen trail | Real testnet block 16344420 reconciled 100 → 99 MUSD. Its one transfer remained **unclassified**, so no exact bill-match claim. Original snapshot retained through reorg/unavailability. |
| Recurring | Weekly/monthly drafts, month-end rules, pause/resume, edit future terms, deduplicate each period | Domain/service tests pass. Generation is on demand; no unattended cron or automatic payment. Existing bills retain their terms. |
| Documents | Private PDF/image source, cited page/quote, explicit MUSD/recipient review, one draft per source | Real text-PDF and local PNG/scanned-PDF OCR tests pass; browser PNG → review → draft passed. Hosted authenticated PNG upload → CPU OCR → cited review → draft passed using a disposable test EOA. Hosted scanned PDF remains unverified. |
| Team | Requester/reviewer/viewer/owner, one-use invitations, settings/version-bound approvals, revocation invalidation | Database/service tests pass. Hosted invitation/request/reviewer vote passed with two independent disposable EOA SIWE browser-context sessions via API. User OKX extension role acceptance remains. V1 approvals are application policy; they do not prevent owner calls outside the application. |
| Receivables | Opt-in public pay request, expected receipts in scenario, manual exact Transfer-log allocation, partial/excess handling | Service tests cover confirmations, duplicate allocation and reorgs. A real incoming receipt allocation remains. Expected receipts are separate from real token balance. |
| Optional V2 | EIP-712 reviewer quorum, nonce/deadline/policy version, cap/buffer, pause | 17 V2 tests pass inside the 35-test contract suite, including independent viem digest vector and fuzzing. Local only; no deployment, wallet acceptance, security audit or migration. |

## Verification

- `npm test` with `MEZORA_TEST_LOCAL_OCR=true`: **30 files, 157 tests passed**, including actual OCR of synthetic invoice PNG and scanned PDF.
- `npm run typecheck` and optimized Next build passed.
- `npm run test:contracts`: **35 passed**, including 256-run fuzz tests and an invariant with 8,192 calls.
- Local browser: CSV import, changed-payee policy warning, forecast shortfall, document review/draft, saved scenario reload and public payment receipt; no browser exceptions. Mobile had no page-level horizontal overflow.
- Hosted browser: CSV preview, forecast shortfall and confirmed public repayment receipt; no browser exceptions. Also authenticated image upload → CPU OCR → reviewed draft passed. Two disposable EOA sessions exercised hosted invitation, acceptance, request and reviewer vote; their private keys were never saved, and no chain transaction was sent.
- PostgreSQL migrations 0–6 applied. Eight original tables had identical row contents immediately after migration. Private logical snapshot restored successfully to an isolated in-memory database; production was not overwritten. Backup contents remain ignored under `.data/backups/`.
- Live statement was generated through the server service against production PostgreSQL and Mezo RPC. This is distinct from an authenticated browser export/close acceptance.

Evidence: [migration](workbench-migration-evidence.json), [backup restore](workbench-backup-restore-evidence.json), [live statement](workbench-live-statement-evidence.json), [repayment](testnet-repayment-evidence-2026-10-25.json). Browser captures are retained locally in the operator's temporary directory, not published with private source documents.

## Operational boundaries

Hosted files: **4MiB**, text PDF at most 10 pages; built-in English OCR at most 3 scanned pages / 4MP per image and a 25-second child-process deadline. A trusted external OCR adapter remains optional; the built-in path sends document bytes only to a local process and downloads a static English language model. Hosted PNG OCR runtime passed; hosted scanned-PDF processing has not been acceptance-tested. Sources use bounded private PostgreSQL storage (25 active files / 50MiB per workspace), seven-day expiry, deletion on workspace access/upload; this is not a scheduled erasure service or an object-storage archive.

App policy cannot make V1 a multisig or enforce its planning buffer outside Mezora. Withdraw and repay remain two transactions: failed repayment leaves withdrawn funds in the wallet. No automatic recovery signature, debt close, swap or conversion is implied.

Next acceptance: hosted scanned PDF; user OKX role-wallet acceptance; one real receivable allocation; a small separately signed withdrawal/repayment handoff; authenticated statement export/close. Deck/video and final AKINDO submission remain separate work. No submission was made.
