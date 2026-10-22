# Domain and automation reuse

`packages/automation/src/decide.ts` adapts the pure `decide(snapshot, config)` strategy boundary from Dreambot Kit, `strategies/starter/src/strategy.ts`, commit `25798660bbe4674a6f83a960b202852896e2fed4`. The original CLOB quotes and floating point position sizes are replaced with exact MUSD accounting and owner review proposals. The runtime remains responsible for reading snapshots; this package cannot sign or broadcast. Copyright 2026 DreamDEX S.A.; the full MIT notice is in `packages/automation/LICENSE-DREAMBOT`.

`packages/domain/src/payment-intent.ts` ports the intent and confirmation lifecycle idea from OmniAgentPay, `src/omniagentpay/intents/service.py`, commit `8af4b414a4b50e591c25274ec5a34f21fedc81f8`. The TypeScript model, strict transitions, expiry and immutable approval binding are Mezora implementations. Redis, float accounting, storage code and payment execution are excluded. Copyright 2026 Abiola Adeshina and OmniArc Team; the full MIT notice is in `packages/domain/LICENSE-OMNIAGENTPAY`.

Both pinned source files and licenses were read before adapting them. Domain code uses `viem` for ABI encoding and Keccak hashes; tests use Vitest. Money is `bigint` inside calculations and canonical decimal strings at JSON boundaries. Times are Unix seconds and chain/version fields are safe integers. Display precision truncates explicitly and never changes a payment amount.

Terms hashes bind owner, chain, workspace, bill, version, recipient, amount, due time and caller supplied 32 byte random salt, with an ABI domain marker. Store that salt privately alongside the invoice; the pure package cannot establish its randomness. Payment settlement events must come from an adapter that has already checked chain, token, target, canonical receipt and required confirmations. A boolean canonical flag is an internal trust boundary, not independent chain verification.

Proposals bind the block, balances, workspace, treasury and policy. Freshness checks compare the current snapshot and config; config `now` is supplied by the caller and excluded from the policy hash. Proposals expire at the earlier of their TTL and the snapshot freshness boundary. A buffer shortfall suggests a deposit amount, and a surplus suggests an owner review amount. Neither executes a transfer or claims a completed repayment.

The domain package provides pure validation and state transitions. Transactional uniqueness, row locks, canonical chain checks and signer authorization must be enforced by the API, database and chain adapters.
