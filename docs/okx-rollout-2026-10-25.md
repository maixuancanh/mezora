# OKX wallet rollout and next gate

Production: https://mezora.vercel.app

Deployment: `dpl_HGrRU3R7K7WBBCC8RJKZK1KPxL2M` (Ready).

All three application pages now explicitly select OKX Wallet using its namespace, a labelled injected provider, or an OKX EIP-6963 announcement. The selected provider is pinned for the page lifetime. An unrelated generic Ethereum provider is not used. Account/network listeners clear affected wallet review state. SIWE, chain 31611, exact calldata, fixed send chain ID and receipt recovery protections remain.

Production build and its TypeScript stage completed successfully. HTTP reads of /, /setup and /repay return 200 with CSP. No additional automated tests were run for this change. Real extension connect/sign/deploy acceptance is pending the human wallet holder; the build does not establish that boundary.

Prepared submission description, claim boundaries, demo narration and deck outline are in SUBMISSION_KIT.md. No exported pitch video or final slide deck is claimed.

## Next user step

Open /setup in the browser where OKX Wallet is enabled. Click Connect OKX Wallet & sign in, inspect the selected account, approve the Mezo Testnet add/switch request if shown, and sign the domain-bound login. Review treasury owner, token and deployment request before signing creation.

The previous owner address was `0x6A613e758D77c46B6E74971F7481dd66b59fE33a`; its presence in OKX has not been established. If OKX uses another address, owner funding and ownership must be assessed for that account, without transferring/exporting private keys through the app or chat.

When creation is broadcast, the UI stores its hash and registers only after exact receipt/bytecode/owner/token checks. Actual Mezo treasury/payment and repayment outcomes remain unverified until the confirmed evidence exists. The app does not hold an owner key and cannot sign those actions autonomously.
