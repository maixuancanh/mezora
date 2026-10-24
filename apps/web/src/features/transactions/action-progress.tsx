'use client';

export type ActionPhase = 'idle' | 'previewing' | 'review' | 'preparing' | 'awaiting_wallet' | 'submitted' | 'confirming' | 'confirmed' | 'rejected' | 'reverted' | 'unavailable';
const labels: Record<ActionPhase, string> = {
  idle: 'Start with an amount', previewing: 'Calculating your preview', review: 'Review the amount and wallet',
  preparing: 'Checking fresh chain state and simulating', awaiting_wallet: 'Open OKX to approve this request',
  submitted: 'Transaction submitted', confirming: 'Waiting for network confirmations', confirmed: 'Confirmed on Mezo Testnet',
  rejected: 'Wallet request declined', reverted: 'Transaction reverted — no payment completed', unavailable: 'Check wallet activity before retrying',
};
export function ActionProgress({ phase, hash, proofSupported=false }: { phase: ActionPhase; hash?: string; proofSupported?:boolean }) {
  if (phase === 'idle') return null;
  return <section className="action-progress" aria-label="Transaction progress" role="status" aria-live="polite">
    <strong>{labels[phase]}</strong>
    <span>Preview → Review → Open OKX → Wait for network → Confirmed</span>
    {hash && <a href={proofSupported?`/receipt/31611/${hash}`:`https://explorer.test.mezo.org/tx/${hash}`} target="_blank" rel="noreferrer">{proofSupported?'Open public receipt ↗':'View transaction in explorer ↗'}</a>}
  </section>;
}
