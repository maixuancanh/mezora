# Mezora — submission working kit

Prepared 25 October 2026. Track positioning is based on the saved contest research and must be rechecked against the live submission form before submission. This file is prepared material, not a submitted entry.

## Public links

- App: https://mezora.vercel.app
- Treasury setup: https://mezora.vercel.app/setup
- Borrower repayment: https://mezora.vercel.app/repay
- Source: https://github.com/maixuancanh/mezora/tree/build/mezora-mvp

## Short description

Mezora is a business treasury workspace for MUSD on Mezo. Owners turn bills into cash commitments, reserve funds, review payments and reconcile confirmed receipts. A separate repayment workspace reads a borrower's Mezo Trove and prepares an owner-approved partial debt repayment.

## Primary track

Track 2 — Access and Distribution: a usable interface that connects MUSD business payments, budget commitments and receipt tracking. Track 1 should only be claimed with the exact demonstrated borrowing/debt integration scope, and should disclose whether repayment execution has been proven.

## What the working prototype includes

- Browser scenario mode with clearly simulated funds and persistent records.
- Owner-created Mezo testnet treasury with immutable owner/token and exact deployment validation.
- Bill terms bound to a recipient, amount, version hash and unique on-chain commitment id.
- Reserve/pay/cancel workflow and withdrawals limited to unreserved funds.
- Exact MUSD approvals, owner signatures and request ids/deadlines for protected deposits/withdrawals.
- Receipt reconciliation and missing-hash recovery; a broadcast is not shown as a confirmed payment.
- Operating buffer and surplus proposals. These are deterministic recommendations, not an autonomous executor or a connected language model.
- Mezo Trove lookup and partial repayment preparation with minimum-debt constraints and simulation.
- Explicit OKX Wallet selection, SIWE login and client-side calldata validation.

## Two-minute demo narration and screen sequence

1. **0:00–0:15 — Problem:** “A business cash balance does not tell you how much is already committed. Mezora puts bills, reserved funds and payment evidence in one workspace.” Show overview.
2. **0:15–0:40 — Bill:** Create a bill, review recipient/amount/due date and verify its terms. State the chosen environment. If using scenario mode, say explicitly: “This segment uses simulated funds.”
3. **0:40–1:05 — Reserve:** Reserve the bill and show that available cash decreases while the treasury balance is unchanged. Explain that reservations are owner-cancelable budget allocations, not vendor escrow.
4. **1:05–1:30 — Payment:** Review the request and show owner approval plus a confirmed receipt if available. If no real receipt exists, demonstrate the labelled scenario and disclose that the live signature step remains pending. Never present a local receipt as Mezo testnet proof.
5. **1:30–1:45 — Runway:** Show reserved funds, operating buffer and the surplus proposal. Explain that the owner decides; nothing executes automatically.
6. **1:45–2:00 — Mezo integration:** Show the borrower page. If the borrower has no Trove, show that honest state. Only show repayment savings or execution when backed by the actual transaction receipt.

## Pitch/deck outline

1. Business cash has commitments: target user and concrete bill example.
2. Workflow: bill → reserve → review → owner approval → receipt.
3. Why MUSD/Mezo: stable-denominated bills and a separate borrower debt-repayment path.
4. Security model: owner-controlled treasury, exact requests, no arbitrary execution, persistent reconciliation.
5. Working demo and evidence: show live links and clearly separate scenario, local EVM and actual testnet receipts.
6. Next scope: inbound invoices, recurring proposals and batch review; these are future features, not shipped capabilities.

## Attribution

UI/workflow research includes Midday and Mercury Bill Pay as product references, not verified hackathon winners. Automation was informed by Dreambot Builder research; the actual implementation is a deterministic proposal engine. Refer to THIRD_PARTY_NOTICES.md, UI_INSPIRATION.md, DOMAIN_AND_AUTOMATION.md and the implementation plan for exact source reuse and licenses. Do not imply commercial affiliation or endorsement.

## Remaining evidence gates

- Connect the intended owner account in OKX. If it differs from the previously supplied account, inspect gas/token balances for the new account; treasury ownership follows the connected account.
- Sign one treasury deployment on Mezo testnet; record confirmed creation receipt, contract address and verified runtime/owner/token.
- Obtain testnet MUSD, approve only the reviewed amount, deposit and confirm.
- Complete a bill reserve/payment and save the explorer receipt plus reconciled state.
- Actual repayment requires an active borrower Trove, enough wallet MUSD and BTC gas. Existing adapter/lookup alone is not proof of repayment execution.
- Record and export the final demo video/deck after choosing the demonstrated evidence scope.
- Verify the contest cutoff and required fields in AKINDO; submit with human authorization. No submission has occurred.

## Claim boundaries

No claim of users, revenue, partnerships, autonomous agents, production audit, guaranteed savings, mainnet deployment or completed contest submission. Hosted receipt reconciliation is on demand; no continuously running production worker has been established.
