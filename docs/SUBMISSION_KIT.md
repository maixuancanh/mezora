# Mezora submission kit

Updated 25 October 2026. Prepared copy, not a submitted entry. Saved contest requirements were checked on 23 October. A fresh web request to AKINDO on 25 October could not retrieve the page. Current form, cutoff and timezone still need a browser check.

## Public links

- App: https://mezora.vercel.app
- Workbench: https://mezora.vercel.app/workbench
- Repayment: https://mezora.vercel.app/repay
- Completed V2 payment and receipts: https://mezora.vercel.app/setup/v2/payment
- Source: https://github.com/maixuancanh/mezora/tree/build/mezora-mvp
- Contest: https://app.akindo.io/wave-hacks/OVOO0gdrVU8379D10?tab=overview

## Copy-ready form content

**Name:** Mezora

**Category:** MUSD Business Treasury Workspace

**TL;DR:** Mezora helps small teams turn MUSD bills into cash commitments, approve payments and reconcile confirmed receipts on Mezo.

**Problem and solution:** A wallet balance does not show how much cash a business has already promised to spend. Mezora connects bills, reserved MUSD, an operating buffer and a 30-day cash plan. Owners review payments before signing, inspect receipts and track incoming customer payments. Invoice checks flag duplicates, changed recipients and budget issues. Documents become reviewed drafts, while CSV imports, recurring drafts and statement exports reduce repetitive work.

**Mezo integration:** MUSD is the payment and accounting unit. The active V1 treasury binds each commitment to a bill ID, terms hash, amount and recipient. A borrower workspace reads a Mezo Trove and prepares partial MUSD repayment while preserving protocol debt constraints. Withdrawal-to-repayment records link two separately signed transactions. A separately deployed V2 enforces owner and reviewer signatures in its contract. Shared unpause and one complete 1-MUSD reserve/payment flow are verified on Mezo Testnet.

**Target users:** Small teams and independent businesses that hold MUSD and pay contractors or suppliers. The prototype targets desktop browsers with OKX Wallet. No geographic adoption or customer base is claimed.

**Track:** Track 2 — Access and Distribution is the primary positioning from saved research. Demonstrated borrower repayment can support a Track 1 explanation if the live form permits multiple tracks. Do not claim borrowing origination or atomic treasury repayment.

**Stack:** TypeScript, Next.js, React, PostgreSQL, viem, Solidity, Foundry and selected OpenZeppelin primitives. OKX injected/EIP-6963 selection, SIWE authentication, PDF parsing and bounded English OCR. Recommendations are deterministic rules, not an LLM or unattended fund executor.

**Readiness:** Working hosted prototype on Mezo Testnet, chain 31611. BTC pays gas. Official testnet MUSD: `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`.

**Hackathon work:** Treasury commitments, receipt reconciliation, business cash planning, receivable allocation, statement/document workflows, borrower repayment handoff and separate V2 approval acceptance. Source attribution is in THIRD_PARTY_NOTICES.md and related reuse documents.

**Proposed milestones:** Weeks 1–2: observed user tests and approval UX. Weeks 3–4: general V2 bill integration and recovery/rotation design. After independent security review: limited pilot and mainnet readiness assessment. No mainnet release date is promised.

**Team fields:** Enter the user's chosen public name, role and X/LinkedIn in the form. Do not infer identity or contacts from wallet addresses or repository handles.

## Confirmed evidence

| Workflow | Transaction |
| --- | --- |
| V1 bill payment, 1 MUSD | https://explorer.test.mezo.org/tx/0x2926b0c09b1599c1ed5f5717abfde19054aff3a877a3ea058e598323dca48ba9 |
| Borrower repayment, 1 MUSD | https://explorer.test.mezo.org/tx/0x525ecdb461231c0e6cb355a1525c2adc966156179c671b1c993a479ed7759164 |
| Receivable transfer, 1 MUSD, owner-reviewed allocation | https://explorer.test.mezo.org/tx/0xb42f2f246d6149f3bcb315f255b24efe2d9df200f9facaa2ab26bf3f83eabee1 |
| Withdrawal, 1 MUSD | https://explorer.test.mezo.org/tx/0x1c2044fd314e3355d946fe281de24e3fc24865a76a1338fc4e5eb1526c6e9038 |
| Separate repayment, 0.5 MUSD | https://explorer.test.mezo.org/tx/0x0fef1f0fd2b4121e31318a170ccf4024d0f4586dda243813d4fbd47c601e1f03 |
| V2 shared unpause | https://explorer.test.mezo.org/tx/0xb2a92d3e60b9be19051eed2ddf5d603b85ccb8d9d79198bcc5e5de7a3cca3930 |
| V2 shared reserve | https://explorer.test.mezo.org/tx/0x74ca831f19151a25dc32e354fc07b692b624e9ac10b8e5382c227bc4baad8db5 |
| V2 shared payment, 1 MUSD | https://explorer.test.mezo.org/tx/0xa31e7a7f0064f90e628e416c3b2d609c9a004ad642939413cd7fd697d8c49d57 |

Structured proofs: `testnet-*-evidence-2026-10-25.json`. All are self-funded acceptance tests, not customer revenue or adoption.

## Claim boundaries

- Main workspace uses V1. Its team approvals are application policy; owner can call V1 directly.
- V2 enforces owner plus immutable reviewer quorum in a separate acceptance flow. No V1 migration or general V2 workspace integration is claimed.
- Withdrawal and repayment are separate. Failed repayment leaves withdrawn funds in the wallet. The test withdrew 1 MUSD and repaid 0.5 MUSD.
- Receivable allocation is reviewed, not automatic matching. Recurring bills generate drafts, not automatic transfers.
- Contracts are unaudited. No mainnet readiness, autonomous fund management, users, revenue or guaranteed savings claimed. Hosted reconciliation is on demand.

## Remaining submission gates

Saved requirements list four mandatory items: working deployment, public source, project/product deck and a two-minute pitch video. App and source are available. Deck narrative is in PITCH_DECK_CONTENT.md; exported deck remains pending. Recording script is in DEMO_RECORDING_SCRIPT.md; finished video remains pending. Check live form and cutoff before uploading. No submission has occurred.
