# Treasury V2 migration design — local/test only

Status: source and local Foundry verification only. **Not externally audited, not deployed, not enabled in the UI.** The existing application and V1 adapter remain on V1. This document is a design and review checklist, not authorization to move funds.

## What V2 enforces

- Immutable MUSD token, immutable EOA owner, immutable EOA reviewers and immutable reviewer quorum. The owner cannot lower the quorum, replace a reviewer, or escape approval through withdrawal. Every reserve, pay, cancel, withdrawal, policy change and unpause requires the owner signature **in addition to** the reviewer quorum. Any account can relay fully approved requests; relaying does not confer authority.
- A single EIP-712 `Request` includes `uint8 action`, `bytes32 id`, `bytes32 termsHash`, `address payee`, `uint256 amount`, `uint256 nonce`, `uint256 deadline`, and `uint256 policyVersion`. Domain: name `MezoraTreasuryV2`, version `2`, live `chainId`, and treasury `verifyingContract`. An approval is specific to its action, bill terms, recipient and amount. Dynamic chain ID prevents reuse after a chain ID change. Independent same-chain-ID forks remain a standard EIP-712 limitation.
- Owner signature is supplied separately. Reviewer signatures must recover to configured reviewers in strictly increasing numeric address order. Duplicate, unordered, unconfigured, zero-recovery, malformed, noncanonical `v`, and high-`s` signatures fail. Only 65-byte `r || s || v`, `v` 27/28, and nonzero low `s` are accepted. The selected OpenZeppelin subset has no cryptography module, so recovery checks are self-contained. **ERC-1271 smart-contract wallets, EIP-2098 compact signatures, personal-sign and signer rotation are unsupported.** Constructor code-length checks reject deployed contract signers; only EOA key signatures are validated thereafter.
- Nonces are arbitrary treasury-global unsigned integers, consumed once across every signed action and policy version; failed transactions roll back nonce consumption. Signing tools must allocate unique nonces. Deadlines are inclusive (`block.timestamp <= deadline`). Do not reuse a nonce, even with a fresh policy version.
- `maxSpend` is a **per-action** maximum in MUSD base units for reserve, payment and withdrawal. It is not a cumulative, daily or rolling budget: separate fully approved transactions can each use the maximum. `minimumBuffer` is a fixed number of token base units held outside `totalReserved`. No token-decimal assumption is embedded in the contract.
- Reserve and withdrawal require `balance - totalReserved - newAmount >= minimumBuffer`. Payment must match an existing reservation's full ID, hash, payee and amount. Payment releases that exact reserve and transfers exactly that amount; free balance stays unchanged. IDs remain terminal after payment or cancellation and cannot be reused. Cancellation requires approvals and frees reserved funds without paying anybody. No partial payments, arbitrary calls, arbitrary-token rescue or owner-only outflow exists.
- `updatePolicy(newMaxSpend,newMinimumBuffer,request,ownerSignature,reviewerSignatures)` requires action `Policy` and `termsHash = keccak256(abi.encode(uint256 newMaxSpend,uint256 newMinimumBuffer))`. The current immutable quorum signs under the current policy version. Successful updates increment `policyVersion`, invalidating all pending older-version approvals, including pay/cancel approvals. Increasing the buffer above current free balance fails. Lowering maxSpend below an existing bill blocks its payment until a later quorum-approved policy permits it; cancellation remains available. Reviewer/quorum rotation requires a separate future design and migration.
- Owner can immediately pause. Reserve, pay, withdrawal and deposit fail while paused. Cancel and policy changes still require quorum while paused. Unpause requires the owner and reviewer quorum. There is no owner-only recovery withdrawal. An unavailable reviewer quorum or lost owner key can permanently lock funds; immutable configuration intentionally provides no bypass.
- Token transfers use SafeERC20 and reentrancy protection. Deposits and payouts verify exact balance deltas; false returns, fees and unexpected balance effects revert atomically. Use only a verified non-rebasing, non-fee MUSD deployment. Direct token donations are included in available balance. Unexpected losses fail closed on reserve/pay/withdraw; signed cancellation can release accounting without moving assets.

## Signing and relay integration gates

The separate `packages/mezo/src/treasury-v2-abi.ts` is generated from the local V2 artifact and is intentionally not re-exported or selected by current UI adapters. A future integration must construct the exact typed data, sort approvals by recovered reviewer address, display every signed field and policy value, verify chain/token/owner/reviewer/quorum/code independently, handle stale policy versions and consumed nonces, and prove the receipt's treasury/action/nonce/bill terms. Never represent an off-chain approval as a successful on-chain action. None of these UI or deployment gates is completed by adding this source.

`execute` handles Reserve, Pay, Cancel, Withdraw and Unpause. Policy requests must use `updatePolicy`; they cannot run through `execute`. Unpause/withdraw may carry otherwise unused bill fields; those fields are still signed exactly, and the action discriminant prevents their approvals being used for another action. For future signing tools, prefer zero bill fields for withdrawals/unpause and zero unused ID/payee/amount for policy updates.

## V1 is immutable: migration requires separate transactions

V1 has an immutable owner and token and has no upgrade function or delegate-call proxy. It cannot be upgraded in place or converted into a V2-controlled vault. The old address and history must remain visible as V1.

Any future funded migration must first receive explicit authorization and verify the actual chain, token, V1 bytecode, V1 owner and all reserved commitments from on-chain evidence. Then:

1. Stop new V1 commitments in the application and inventory balances, pending bills and already signed requests. Pause V1 if the owner authorizes it; V1 payment requires unpaused state, so any intended settlement must account for that.
2. Settle each old reservation to its original payee **or** cancel it with the V1 owner transaction, documenting the business choice. V1 cannot transfer an active reservation's accounting or history to V2. Cancellation is not payment.
3. Independently deploy and verify V2 only after review, initial signer configuration and operational acceptance. New immutable owner/reviewers/quorum and policy must be checked before funding; signatures must be available and tested.
4. With the V1 owner's authorization, withdraw only V1 free funds using V1's existing withdrawal mechanism. This is a V1 owner action, **not** a new V2 quorum guarantee and not one atomic migration. Do not imply V2 can enforce old funds while they remain in V1.
5. Separately approve the fixed MUSD token and deposit from the V2 owner into V2. Confirm both receipts and exact balance deltas. Sending V1 funds directly to V2 is only a token donation, not a deposit event or commitment migration; prefer explicit separately verified withdrawal/deposit accounting.
6. Recreate only explicitly approved outstanding bills as new V2 reservations with fresh IDs/nonces, terms and V2-domain signatures. Prevent double payment against V1 history. Retain V1 address, chain, receipts, IDs, statuses and policy provenance in a read-only history view.
7. Enable an independently reviewed V2 adapter only after all local, browser, testnet, signer and migration reconciliation gates pass. Preserve V1 history alongside the new address; do not overwrite it.

No deployment, token approval, signature solicitation, fund movement or migration has been performed as part of this change.

## Local verification

From `D:\bitgethackathon\products\mezora`, run:

```powershell
& "$env:USERPROFILE/.foundry/bin/forge.exe" test --root contracts -vv
```

The V2 tests cover owner-plus-quorum, duplicate and unsorted reviewer rejection, canonical signatures, cross-action nonce replay, cross-treasury and cross-chain replay, bill amount/payee/terms tampering, commitment lifecycle, cap/buffer/reserve accounting, old-version policy approval invalidation, emergency pause and signed unpause, expired requests, token failure rollback, and fuzzed reserve/withdraw/pay accounting. The existing V1 tests and invariant suite remain applicable to V1 only. Local tests do not constitute an external audit or a deployed-chain security guarantee.

Emergency pause increments policyVersion and revokes all previously collected approvals, including unpause. A fresh owner+quorum unpause approval must use the new version. Independent viem EIP-712 digest vector and pre-execution cross-action mutation are checked in the local suite.
