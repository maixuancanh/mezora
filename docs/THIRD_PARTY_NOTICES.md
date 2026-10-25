# Third-party notices

Imported/adapted code is tracked below; dependencies retain their own licenses in distribution.

| Source | Pinned commit/release | Use |
|---|---|---|
| DreamDEX dreamdex-bot-kit |25798660bbe4674a6f83a960b202852896e2fed4, MIT|Pure snapshot/config→decision boundary adapted in packages/automation; full license packages/automation/LICENSE-DREAMBOT|
| OmniAgentPay |8af4b414a4b50e591c25274ec5a34f21fedc81f8, MIT|Intent/approval model adapted in packages/domain/src/payment-intent.ts, full license packages/domain/LICENSE-OMNIAGENTPAY|
| AgentFabric |cedbe0e2510de0015a1d272dcb618f369334ea27, MIT|Scope presentation adapted in apps/web/src/features/approvals/scope-card.tsx; full license docs/UI_REUSE.md|
| OpenZeppelin Contracts |v5.4.0 c64a1edb67b6e3f4a15cca8909c9482ad33a02b0, MIT|Selected untouched primitives under contracts/lib/openzeppelin-selected; LICENSE and UPSTREAM.md included|
| Radix UI Dialog / lucide-react / Next.js / React / viem / PGlite / pg|Exact installed versions in package-lock.json|Package dependencies; see respective package license files|

Immutable treasury ownership logic is original Mezora implementation, not copied OZ Ownable.
Midday AGPL code is not included; Mercury/Midday public workflow references are design inspiration. shadcn/ui was evaluated but no code imported; current primitives use Radix directly.

New contribution: MUSD treasury/commitments, replay-safe API deposit/withdraw, workspace accounting/indexing, exact payload binding, recovery/reorg reconciliation, integer money and Mezo integration, cohesive UI and tests. Awards of upstream projects do not certify Mezora security.

## Submission media

The narrated pitch uses synthetic speech generated with k2-fsa/OmniVoice in its official Google Colab notebook. No reference voice or voice cloning was used. The product icon was generated using OpenAI image generation. These media assets are not evidence of customer adoption or a live product recording.
