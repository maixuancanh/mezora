'use client';

export function CashImpactCard({ summary,mode='demo' }: {mode?:'demo'|'live';summary: { balance: string; reserved: string; buffer: string; surplus: string } }) {
  return <section className="recommendation" aria-label="Cash impact">
    <h3>Your cash, before another commitment</h3>
    <p>Balance {summary.balance} − committed bills {summary.reserved} − operating buffer {summary.buffer} = surplus {summary.surplus} MUSD.</p>
    <p>Reserving a bill earmarks funds. Paying it moves MUSD out of the treasury.</p>
    <a className="text-button" href={`/workbench?mode=${mode}`}>Check the next 30 days →</a>
    <a className="text-button" href="/repay">Review debt repayment →</a>
    <small>To use treasury surplus: 1. Review and sign a withdrawal. 2. Wait for confirmation. 3. Review and sign repayment from your borrower wallet. Each transaction has its own receipt.</small>
  </section>;
}
