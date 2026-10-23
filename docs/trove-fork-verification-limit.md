# Trove fork verification boundary

23 October 2026. The unsigned owner repayment adapter was checked with unit tests, official deployed ABI/source, live read-only snapshots, deployment links and pinned proxy implementation addresses. The supplied owner currently has no active Trove.

A further Anvil fork experiment was attempted using the public testnet and an existing borrower in isolated local state. The attempt stopped before a repayment transaction: deployed PriceFeed.fetchPrice() reverted under the fork, although read-only calls succeeded on the public RPC. A missing Mezo oracle/precompile dependency is a hypothesis, not a confirmed diagnosis. No protocol source or oracle behavior was patched to manufacture success.

The script scripts/test-trove-fork.ts is an optional experimental verification harness, not a passing evidence artifact. It requires a separately started loopback-only Anvil fork on8549. It must not be pointed at any public RPC for writes.

No successful fork repayment, user-authorized repayment or live Mezo repayment is claimed. A funded active borrower and an exact successful receipt remain required for full repay execution evidence.
