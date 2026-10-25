# V2 funded test payment

Page: https://mezora.vercel.app/setup/v2/payment

This continues the verified zero-value V2 shared-approval flow. Test scope is one fixed 1-MUSD bill, not migration or general V2 production support. V1 remains the active workspace treasury.

## Design and implementation

1. Pin the already deployed V2, official testnet MUSD, owner, reviewer, amount and bill reference in shared client/server helpers. The reviewer address is also the explicitly displayed test recipient. Terms commit the amount, reference and recipient. A fixed bill ID prevents creating the same onchain bill twice.
2. Owner funds V2 with a direct ERC20 transfer of exactly 1 MUSD. No allowance or approval is requested. Funding uses the token Transfer receipt, not the V2 Deposited event. Refuse a fresh funding payload when this test is already funded or its commitment exists. Keep pending hashes across reloads and do not silently retry.
3. Owner creates a Reserve review based on fresh chain time and policy. Both accounts separately sign the exact EIP-712 request. Owner submits only after a missing-reviewer simulation fails and the fully approved action simulates successfully.
4. After reservation, create a separate Pay review with a new nonce and two new signatures. Reserve approvals cannot authorize Pay. The fixed commitment must match amount, payee and terms.
5. Require canonical successful receipts with at least two confirmations, exact sender/destination/calldata, matching ActionExecuted fields, consumed nonce and expected commitment status. Pay additionally requires the exact MUSD Transfer log from V2 to the intended recipient. Persist verified evidence to the workspace audit.

The UI displays amount and recipient before each signature, separates funding/reservation/payment, and gives explicit wallet-switch instructions. Only the owner session creates or prepares spending transactions. Reviewer authorization is its recovered EIP-712 signature. No server key or automatic wallet confirmation is involved.

## Acceptance status

Funded test payment accepted on Mezo Testnet. Funding, Reserve and Pay receipts independently verified with exact token transfers, matching bill terms and recipient, both cryptographic signer roles and consumed nonces. Final payment: `0xa31e7a7f0064f90e628e416c3b2d609c9a004ad642939413cd7fd697d8c49d57`, block 16355664. Evidence: `testnet-v2-funded-payment-evidence-2026-10-25.json`. V2 test balance and reserved funds are zero; bill is Paid. This proves this fixed test case, not general production readiness or an audit. Shared unpause acceptance is separately confirmed in `testnet-v2-shared-approval-evidence-2026-10-25.json`.

## Wallet sequence

- Owner `0x2c7FFA7b22B5D75b390f7BCA5D75bE0475C85b31`: fund 1 test MUSD, verify receipt, create reservation review.
- Owner signs reservation; switch OKX to reviewer `0x018afE2Be696274bCb3A33B2FB1487F96f649bd6`, sign same review; switch back to owner and submit reservation.
- Verify reservation. Create payment review and repeat both signatures, then owner submits Pay and verifies receipt.

BTC pays testnet gas separately. The 1-MUSD transfer to reviewer is a self-funded acceptance test, not customer revenue or adoption. Deployed signers are immutable and V2 remains unaudited.

## Deployment validation

Production deployment `dpl_GvaMx4f8wgYThbcDx5hRpVxRJ2xa` is READY and aliased to mezora.vercel.app. Live API returned active V2, policy 2, zero balance, zero reserved, cap 100 MUSD and no commitment. TypeScript and production build passed. Full suite: 189 passed, 2 skipped. Fifteen new tests cover pinned payloads, authentication, funding guards, missing approvals, receipt canonicality and exact transfer/commitment matching. Browser interaction remains unavailable while local browser use is disabled in Work settings.

After the funded flow is complete, run `npx tsx scripts/verify-v2-funded-payment.ts` to recover both signed requests, verify signer roles and receipts, and save the acceptance evidence. The script refuses to write completed evidence while the bill is unpaid.
