# Mezora UI source reuse

The workspace layout, styling, navigation, tables, forms, wallet flow, scenario labels and contextual explanation panel were written for Mezora. Midday, Mercury and Mate informed workflow organization only. No source, assets or branding from those products was copied.

## AgentFabric scope presentation

`apps/web/src/features/approvals/scope-card.tsx` adapts the header with shield and explanation, expandable details button, and contract/method detail presentation from [ScopeApprovalCard.tsx](https://github.com/nschwermann/agent_fabric/blob/cedbe0e2510de0015a1d272dcb618f369334ea27/apps/web/features/sessionKeys/view/ScopeApprovalCard.tsx), commit `cedbe0e2510de0015a1d272dcb618f369334ea27`. The exact raw source and root license were retrieved and read on 2026-10-23 before adaptation.

The adaptation replaces upstream Card/Badge components and session-key types with semantic HTML and Mezora props. It removes account/metadata hooks, enforceability and verification badges, selection behavior and delegated-session assumptions. The UI does not claim a known contract label proves verification.

## Dependencies and primitives

Dialogs use `@radix-ui/react-dialog` directly for accessible modal behavior. Icons use `lucide-react`. No shadcn component source was imported; shadcn reuse remains unimplemented, and there is no claim of a shadcn code contribution. React and Next.js are framework dependencies. Google Fonts supplies DM Sans and Manrope through CSS, with system fallbacks if unavailable.

## AgentFabric MIT notice

MIT License

Copyright (c) 2026 Nathan Schwermann

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
