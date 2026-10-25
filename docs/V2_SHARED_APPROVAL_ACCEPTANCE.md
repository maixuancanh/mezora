# V2 shared approval acceptance

Scope: test the deployed V2 owner/reviewer authorization using a pause and shared unpause. Zero MUSD is transferred. V1 stays the active treasury. This does not establish V2 funded payment acceptance or an audit.

- Page: https://mezora.vercel.app/setup/v2/verify
- Network: Mezo Testnet, 31611
- V2: `0x54bdde1c3be2e8fa178a55ae06700160846002ec`
- Owner: `0x2c7FFA7b22B5D75b390f7BCA5D75bE0475C85b31`
- Reviewer: `0x018afE2Be696274bCb3A33B2FB1487F96f649bd6`

## Wallet steps

1. Owner reviews V2 address and signs the zero-value pause transaction in OKX. Refresh after confirmation. Pausing increments the policy version and revokes older approvals.
2. Owner creates a fresh shared review. The server fixes action Unpause, zero recipient, zero amount, random nonce, current policy and a 30-minute deadline from chain time.
3. Owner signs EIP-712 review. Switch OKX to the configured reviewer and sign the exact same review link. No SIWE owner session is required for the reviewer; the server recovers and validates the cryptographic signer.
4. Switch back to owner. The server must demonstrate an owner-only simulation fails with InvalidQuorum, then simulate the fully signed request successfully. Owner reviews the zero-value execution transaction in OKX.
5. Verify the receipt after two confirmations. Require exact calldata, owner sender, V2 destination, canonical successful receipt, matching ActionExecuted Unpause event, consumed nonce and unpaused state at the receipt block.

## Evidence status

V2 deployment is confirmed in `testnet-v2-deployment-evidence-2026-10-25.json`. Shared approval acceptance remains pending actual wallet signatures and receipt verification. Preserve the pause hash, request ID, digest and unpause hash when completed.

Local validation: eight new helper/service tests cover fixed typed fields, digest sensitivity, numeric bounds, signature shape/canonicality, unauthorized signers, owner authentication, pinned chain/config and missing reviewer rejection. Full suite: 174 passed, 2 skipped. Production build and TypeScript passed before deployment.
