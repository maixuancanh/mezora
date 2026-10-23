# Security hardening — 23/10/2026

Production: https://mezora.vercel.app

Deployment: `dpl_3oxpveXXAe7jvfTCZ8C4TuH8oDDq`, Vercel Ready.

## Implemented

- Independent browser validation of exact ERC20 approve spender/amount and treasury reserve/pay/cancel/once calldata; canonical encoding rejects extra trailing bytes. Bill id and terms hash are bound to the reviewed bill. Protected withdrawal targets the owner and preserves the intended amount.
- Browser independently computes deployment bytecode plus constructor token/owner; server payload must match exactly.
- Wallet transaction fields are explicitly allowlisted, rather than spreading arbitrary API fields. All sends explicitly pin `chainId: 0x7b7b` as well as checking account/chain immediately beforehand.
- Mezo network add/switch logic shared across setup, workspace, repayment. Expiry rechecked after wallet network operations. Repayment requires a valid safe integer expiry within its short review window and a Mezo snapshot.
- Uncertain workspace broadcast failures preserve prepared recovery state. Only definite wallet refusal or a failure before requesting send can reject the request.
- SIWE standard login, browser and server validate canonical message, deployment domain/URI, wallet, chain, statement, nonce and five-minute expiry. Exact stored challenge, signature and atomic nonce consumption remain required. Old custom outstanding challenges require reconnecting for a fresh challenge; existing valid sessions retain their configured lifetime.
- Fresh CSP nonce per request, dynamic Next rendering, production nonce/strict-dynamic scripts without unsafe-inline/eval, frame/object restrictions, explicit Google Fonts. Inline CSS remains permitted for existing UI/Radix styles.

## Evidence

- TypeScript passes.
- 58 tests / 11 files pass, including payload tampering, SIWE nonce replay/concurrency, domain/chain/expiry mismatch and nonce CSP checks.
- Production build succeeds on Vercel.
- Production browser mock-wallet check passes: all HTML scripts carry matching nonce, nonce changes, no CSP violations or page errors, missing network added/switched, tampered deployment rejected before send, valid deployment reaches mock wallet, wallet error 4001 preserved. The mock validates the fixed transaction chain ID. No real wallet signature or chain transaction in this check. See `security-hardening-browser-evidence.json`.
- Hosted demo bill creation/verify/reserve/pay plus isolation/replay/origin/persistence/mobile checks pass (`browser-evidence.json`); this is simulated demo accounting, not real MUSD settlement.
- Hosted SIWE login using an ephemeral unfunded EOA passes; nonce replay denied, session retained and zero-fund deployment gate enforced (`hosted-auth-evidence.json`). Only an off-chain login message was signed.
- The preexisting treasury contract remains unchanged; 18 Forge tests passed during the preceding review.

## MetaMask status

After deployment, URL scan still returned HTTP 200 with `{"hostname":"mezora.vercel.app","recommendedAction":"BLOCK"}`. Classification reason remains unavailable. These changes do not establish a false positive or a guarantee of security. No request for review has been submitted externally on the user's behalf.

Diagnostic alternative aliases remain attached to their earlier deployment, not promoted for signing. Use the canonical production domain for source/evidence review; do not infer that an alternate name removes the warning.
