# Mezora treasury

Owner-controlled MUSD treasury with immutable owner and token. Reserve stores a
fixed recipient, amount and terms hash; IDs cannot be reused after pay or cancel.
Reservations are cancelable accounting commitments, not vendor escrow.

The token must be the verified standard MUSD deployment. Deposits require exact
balance growth; rebasing and fee tokens are unsupported. Direct MUSD transfers
increase available funds but have no bill binding or `Deposited` event. The owner
must approve the treasury on the token contract before calling `deposit`.

Application funding and withdrawal transactions use `depositOnce(requestId, amount,
deadline)` and `withdrawOnce(requestId, to, amount, deadline)`. Request IDs must be
nonzero and can succeed only once across both actions. A successful transaction
permanently consumes its ID and emits `RequestConsumed`; reverted transfers or
validation failures roll back the marker. Deadlines are inclusive Unix timestamps
checked on chain. Prepare an appropriate short expiry in the application. Existing
`deposit` and `withdraw` remain explicit manual operations without request replay
protection; repeated manual calls are independent transfers. Keep the original
request ID and exact calldata when recovering an unknown transaction outcome.

`pause` blocks deposit, reserve and pay. Cancel and withdrawal of free funds remain
available to the owner. Unknown, canceled and paid IDs cannot be paid. Every
financial action uses OpenZeppelin ReentrancyGuard and token transfers use
SafeERC20. No upgrade, ownership transfer, arbitrary execution or keeper authority
is exposed. Due dates are application data bound by termsHash; no scheduled payout
is promised.

## Local verification

Foundry with Solidity 0.8.28; EVM target London for Mezo compatibility:

```powershell
Set-Location contracts
& C:/Users/XuanCanh/.foundry/bin/forge.exe test
& C:/Users/XuanCanh/.foundry/bin/forge.exe build
```

Tests cover owner authorization, immutable commitment fields, replay, cancellation,
insufficient free balance, pause recovery, invalid inputs, failed token transfer
rollback, adversarial owner-token reentry, unexpected loss of token balance,
random sequences and a stateful conservation invariant. MockToken exists only in
the test file. No network fork, chain deployment, signature or live MUSD is used.

Selected OpenZeppelin v5.4.0 sources and their MIT license are vendored under
`lib/openzeppelin-selected`; see its UPSTREAM.md for the exact commit. Build
artifacts are ignored. The typed application ABI is generated from the compiler
artifact at `../packages/mezo/src/treasury-abi.ts` and must be regenerated after
changing the contract interface. Local tests do not establish an external audit
or live Mezo compatibility.
