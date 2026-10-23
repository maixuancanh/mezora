# Mezo Trove read and owner repayment adapter

Inspected on 2026-10-23. Source repository: [mezo-org/musd](https://github.com/mezo-org/musd/tree/b51f6cb8e0f048770e32cb6ab5d704785e0b75b1), pinned commit `b51f6cb8e0f048770e32cb6ab5d704785e0b75b1`. Network: Mezo testnet / Matsnet, chain 31611, RPC `https://rpc.test.mezo.org`.

The adapter is independently written TypeScript. Contract ABI signatures and deployment metadata were inspected; Solidity implementation source was read to establish behavior. No Solidity source, private keys, signer, keeper or broadcast code is imported.

## Deployment and verification

Addresses come from the pinned repository's [`solidity/artifacts/deployments/matsnet`](https://github.com/mezo-org/musd/tree/b51f6cb8e0f048770e32cb6ab5d704785e0b75b1/solidity/artifacts/deployments/matsnet). The deployment `.chainId` is 31611.

| Contract | Testnet proxy or token address |
| --- | --- |
| BorrowerOperations | `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5` |
| TroveManager | `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0` |
| InterestRateManager | `0xD4D6c36A592A2c5e86035A6bca1d57747a567f37` |
| PriceFeed | `0x86bCF0841622a5dAC14A313a15f96A95421b9366` |
| SortedTroves | `0x722E4D24FD6Ff8b0AC679450F3D91294607268fA` |
| HintHelpers | `0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6` |
| MUSD | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |

`troveImplementations` pins each proxy's implementation address from those artifacts. Every snapshot checks chain ID, code presence, all six EIP-1967 implementation slots, implementation code presence, token decimals, and the relevant contract links. An implementation change rejects the snapshot until reviewed. Proxy and implementation code hashes are returned for evidence; this is not a compiler reproduction or a bytecode/source equivalence audit. Oracle administration and a malicious RPC remain trust boundaries.

All contract reads, storage reads, balances, hints and simulation use one explicit block number. The block hash is rechecked after the snapshot and preparation to detect a reorganization. The snapshot is JSON serializable: amounts and block numbers are decimal strings, rates are integer basis points and time is Unix seconds.

## Reads and repayment rules

[`TroveManager.getEntireDebtAndColl`](https://github.com/mezo-org/musd/blob/b51f6cb8e0f048770e32cb6ab5d704785e0b75b1/solidity/contracts/TroveManager.sol) returns `(collateral, principal, interest, pendingCollateral, pendingPrincipal, pendingInterest)`. Its first three values already include pending rewards; interest also includes accrued interest at the snapshot block timestamp. The adapter does not add the pending breakdown again. Total debt is principal plus interest. Stored principal includes gas compensation. Status 1 is active; status 0 means no Trove. A nonexistent Trove's protocol ICR is uint256 max, which is a sentinel, not a healthy position.

`readTroveSnapshot(client, borrower)` returns status, collateral, principal, accrued interest, total debt, reward breakdown, oracle price, protocol ICR, MCR, CCR, recovery mode, current minimum net debt, gas compensation, Trove rate, current global rate, borrower token/native balances and code hashes. Price and ICR use 18 decimal fixed point. It does not invent a liquidation price. The current global rate can differ from the rate locked to a Trove.

[`BorrowerOperations.repayMUSD(uint256,address,address)`](https://github.com/mezo-org/musd/blob/b51f6cb8e0f048770e32cb6ab5d704785e0b75b1/solidity/contracts/BorrowerOperations.sol) acts on `msg.sender`'s Trove and burns the repayment from `msg.sender`. It requires an active Trove and sufficient wallet MUSD. There is no ERC20 approve transaction for this path. `repayMUSDWithSignature` is a separate protocol capability and is outside this adapter.

For partial repayment, the remaining net debt must be at least the current `minNetDebt()`, and gas compensation remains outstanding. The maximum preview amount is `max(0, principal + accruedInterest - MUSD_GAS_COMPENSATION - minNetDebt)`. Payment first reduces interest; only the remainder reduces principal. Closing a Trove has separate rules and is not offered as a partial repayment. Runtime interest, redistribution and price can change after the snapshot.

SortedTroves re-insertion uses collateral divided by remaining **principal**, excluding interest. Preparation calls the deployed `HintHelpers.computeNominalCR`, then a bounded `getApproxHint` and `SortedTroves.findInsertPosition`. The exact `repayMUSD` call is simulated from the borrower at the pinned block; protocol checks, including normal/recovery mode constraints, remain authoritative. Hints may need refreshing as the sorted list changes. No calculation of annual savings or liquidation threshold is presented as an actual outcome.

## API contract

Exports in `packages/mezo/src/trove.ts`:

- `troveDeployment`, `troveImplementations`, `troveAbi`.
- `TroveSnapshot`, `RepaymentInput` types.
- `readTroveSnapshot(client, borrower)`.
- `repaymentEconomics(snapshot, amountBaseUnits)`.
- `prepareOwnerRepayment(client, { borrower, ownerAddress, amountBaseUnits, now?, maxSnapshotAgeSeconds? })`.

Preparation verifies the owner address equals the borrower, reads a fresh snapshot, checks partial repayment bounds and borrower balances, computes hints, simulates, then returns `{ chainId, from, to, data, value: "0", requiresOwnerSignature: true, approvalRequired: false, expiresAt, upperHint, lowerHint, snapshot, economics }`. `now` is an optional trusted server clock for deterministic integration; the default is current server time. The freshness window defaults to 30 seconds. The caller must check expiry and refresh before the wallet signs. Native balance greater than zero only establishes that some BTC is present; it does not establish enough gas for transaction inclusion.

The treasury cannot call this direct function on behalf of an owner's Trove: the caller becomes the borrower. A treasury withdrawal into the owner wallet and owner repayment are separate transactions, requiring independent approval and receipts. Preparation must be repeated after the wallet balance changes. API authorization and wallet/account/chain checks remain the integration's responsibility.

## Read-only evidence

Command:

```powershell
npx tsx scripts/verify-trove.ts 0x6A613e758D77c46B6E74971F7481dd66b59fE33a
```

The user supplied owner was read from the official testnet RPC at block **16304433**, hash `0x445e6441417e58aabf120cb10446c0862e6e002a57199f8880cef854a4f19cea`, block timestamp **1792699437**. Observed status: **nonexistent**. Collateral, principal, accrued interest and debt: **0**. Wallet MUSD and native BTC balances: **0**. The adapter therefore cannot prepare a valid repayment for this owner in that state.

At this block, minimum net debt was **1,800 MUSD**, gas compensation **200 MUSD**, global interest rate **100 bps**, MCR **1.1**, CCR **1.5**, recovery mode **false**, and oracle price **81,362.39884** in the protocol's quote units. These are a dated snapshot, not fixed promises. All six proxy implementation addresses matched the pinned artifacts. An earlier protocol-contract nonborrower probe also passed at block 16304431; neither probe establishes an active owner loan or a repayment receipt.

Without an address argument, the script deliberately probes BorrowerOperations itself as a nonborrower. An optional second argument supplies a base unit repayment amount for **simulation and unsigned preparation only**; it never signs or sends a transaction.

Validation: seven Vitest tests pass, covering pinned reads, exact accrued debt, interest-first repayment, minimum debt, pending reward accounting, owner identity, simulation, expiry, missing funds, inactive Troves, wrong chain/deployment, reorganization and proxy upgrades. Targeted strict TypeScript compilation also passes. Successful simulation has been demonstrated with a controlled test fixture; a live active-owner repayment simulation remains unverified because the supplied owner has no Trove or funds.
