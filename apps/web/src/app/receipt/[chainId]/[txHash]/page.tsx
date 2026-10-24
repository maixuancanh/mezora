import Link from "next/link";
import { getPublicReceipt } from "@/server/receipt";
import styles from "./receipt.module.css";

export const metadata = { title: "Public receipt — Mezora", robots: { index: false, follow: false } };
export default async function ReceiptPage({ params }: { params: Promise<{ chainId: string; txHash: string }> }) {
  const { chainId, txHash } = await params;
  const receipt = await getPublicReceipt(chainId, txHash);
  const fields = [
    ["Network", "Mezo Testnet · 31611"], ["Transaction hash", receipt.txHash],
    ["Token", receipt.token], ["From", receipt.from],
    [receipt.kind === "repayment" ? "Burn address" : "To", receipt.to],
    ["Transaction sender", receipt.sender], ["Contract", receipt.contract],
    ["Block", receipt.blockNumber], ["Block hash", receipt.blockHash],
    ["Confirmations", receipt.confirmations === undefined ? undefined : `${receipt.confirmations} · ${receipt.requiredConfirmations} required`],
    ["Terms hash", receipt.termsHash],
  ];
  return <main className={styles.page}>
    <Link href="/" className={styles.brand}>mezora<span>↗</span></Link>
    <section className={styles.card} aria-labelledby="receipt-title">
      <div className={styles.header}><p className={styles.eyebrow}>PUBLIC ONCHAIN RECEIPT</p><span className={styles.state} data-state={receipt.state}>{receipt.state}</span></div>
      <h1 id="receipt-title">{receipt.kind === "repayment" ? "MUSD repayment" : receipt.kind === "payment" ? "Treasury payment" : "Transaction receipt"}</h1>
      <p className={styles.message}>{receipt.message}</p>
      {receipt.amount && <p className={styles.amount}>{receipt.amount} <span>MUSD</span></p>}
      {receipt.kind === "repayment" && receipt.amount && <p className={styles.note}>Repayment burns MUSD. The burn address is not a recipient wallet.</p>}
      <dl className={styles.fields}>{fields.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <div className={styles.actions}>{receipt.explorerUrl && <a className={styles.button} href={receipt.explorerUrl} target="_blank" rel="noreferrer">View in explorer ↗</a>}{receipt.txHash && <a className={styles.refresh} href={`/receipt/${chainId}/${receipt.txHash}`}>Refresh receipt</a>}</div>
      <p className={styles.note}>Public chain data only. No wallet connection is required. Bill names, memos and other workspace details are private. Testnet MUSD has no real monetary value.</p>
    </section>
    <p className={styles.footer}>Mezora · A clear record of money moved.</p>
  </main>;
}
