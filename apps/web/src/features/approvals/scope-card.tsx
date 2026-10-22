'use client';
// Adapted from AgentFabric ScopeApprovalCard, cedbe0e2510de0015a1d272dcb618f369334ea27.
// Copyright (c) 2026 Nathan Schwermann. MIT; complete notice in docs/UI_REUSE.md.
import { useState } from 'react';
import { Shield, ChevronDown, ChevronUp } from 'lucide-react';
export function ScopeApprovalCard({ target, method, chain, token }: { target: string; method: string; chain: string; token: string }) {
  const [expanded, setExpanded] = useState(false);
  return <section className="scope-card"><div className="scope-heading"><Shield size={18} aria-hidden="true" /><div><strong>One action. Your signature.</strong><p>Review this exact request before it reaches your wallet.</p></div></div><button className="text-button" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>} {expanded ? 'Hide' : 'Show'} contract details</button>{expanded && <dl className="details"><div><dt>Network</dt><dd>{chain}</dd></div><div><dt>Method</dt><dd>{method}</dd></div><div><dt>Treasury</dt><dd className="address">{target || 'Not configured'}</dd></div><div><dt>MUSD token</dt><dd className="address">{token || 'Not configured'}</dd></div></dl>}</section>;
}
