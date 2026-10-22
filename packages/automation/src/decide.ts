/**
 * Pure strategy boundary adapted from Dreambot Kit strategies/starter/src/strategy.ts
 * commit 25798660bbe4674a6f83a960b202852896e2fed4.
 * Copyright (c) 2026 DreamDEX S.A.
 * MIT; full permission and warranty notice in ../LICENSE-DREAMBOT.
 * CLOB orders and floating point amounts replaced by owner review proposals.
 */
import { encodeAbiParameters, keccak256 } from 'viem';
import { address, available, baseUnits, hash32, safeInteger } from '../../domain/src/index';
export interface Snapshot { workspaceId:string; chainId:number; treasuryAddress:string; blockNumber:string; blockHash:string; observedAt:number; balanceBaseUnits:string; reservedBaseUnits:string }
export interface Config { version:number; now:number; maxSnapshotAgeSeconds:number; proposalTtlSeconds:number; operatingBufferBaseUnits:string; minimumSurplusBaseUnits:string }
export interface Proposal { id:string; workspaceId:string; chainId:number; treasuryAddress:string; configVersion:number; snapshotBlock:string; snapshotHash:string; configHash:string; expiresAt:number; action:'review_surplus'|'restore_buffer'; amountBaseUnits:string; reason:string; requiresOwnerSignature:true }
export function snapshotHash(snapshot:Snapshot):`0x${string}` {
  if (!snapshot.workspaceId) throw new Error('Workspace required'); safeInteger(snapshot.chainId,'chain',1); safeInteger(snapshot.observedAt,'observation time');
  return keccak256(encodeAbiParameters([{type:'string'},{type:'string'},{type:'uint256'},{type:'address'},{type:'uint256'},{type:'bytes32'},{type:'uint256'},{type:'uint256'},{type:'uint256'}],['Mezora.Snapshot.v1',snapshot.workspaceId,BigInt(snapshot.chainId),address(snapshot.treasuryAddress),baseUnits(snapshot.blockNumber),hash32(snapshot.blockHash),BigInt(snapshot.observedAt),baseUnits(snapshot.balanceBaseUnits),baseUnits(snapshot.reservedBaseUnits)]));
}
export function configHash(config:Config):`0x${string}` {
  safeInteger(config.version,'config version',1); safeInteger(config.now,'current time'); safeInteger(config.maxSnapshotAgeSeconds,'max snapshot age',1); safeInteger(config.proposalTtlSeconds,'proposal TTL',1);
  return keccak256(encodeAbiParameters([{type:'string'},{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'uint256'}],['Mezora.Policy.v1',BigInt(config.version),BigInt(config.maxSnapshotAgeSeconds),BigInt(config.proposalTtlSeconds),baseUnits(config.operatingBufferBaseUnits),baseUnits(config.minimumSurplusBaseUnits)]));
}
export function decide(snapshot:Snapshot,config:Config):Proposal|null {
  const sh = snapshotHash(snapshot), ch = configHash(config);
  if (config.now < snapshot.observedAt || config.now >= snapshot.observedAt + config.maxSnapshotAgeSeconds) throw new Error('Snapshot stale or from the future');
  const free = available(baseUnits(snapshot.balanceBaseUnits),baseUnits(snapshot.reservedBaseUnits)), buffer = baseUnits(config.operatingBufferBaseUnits);
  const deficit = free < buffer, amount = deficit ? buffer - free : free - buffer;
  if (amount === 0n || (!deficit && amount < baseUnits(config.minimumSurplusBaseUnits))) return null;
  const expiresAt = Math.min(config.now + config.proposalTtlSeconds,snapshot.observedAt + config.maxSnapshotAgeSeconds); safeInteger(expiresAt,'proposal expiry');
  const action = deficit ? 'restore_buffer' : 'review_surplus';
  const id = keccak256(encodeAbiParameters([{type:'bytes32'},{type:'bytes32'},{type:'uint256'},{type:'string'},{type:'uint256'}],[sh,ch,BigInt(expiresAt),action,amount]));
  return {id,workspaceId:snapshot.workspaceId,chainId:snapshot.chainId,treasuryAddress:address(snapshot.treasuryAddress),configVersion:config.version,snapshotBlock:snapshot.blockNumber,snapshotHash:sh,configHash:ch,expiresAt,action,amountBaseUnits:amount.toString(),reason:deficit ? 'Deposit MUSD to restore the operating buffer.':'Review available MUSD above the reserved bills and operating buffer.',requiresOwnerSignature:true};
}
export function assertProposalFresh(proposal:Proposal,snapshot:Snapshot,config:Config):void {
  if (config.now >= proposal.expiresAt) throw new Error('Proposal expired');
  const current = decide(snapshot,config);
  if (!current || proposal.snapshotHash !== current.snapshotHash || proposal.configHash !== current.configHash || proposal.action !== current.action || proposal.amountBaseUnits !== current.amountBaseUnits || proposal.requiresOwnerSignature !== true || proposal.workspaceId !== current.workspaceId || proposal.chainId !== current.chainId || proposal.treasuryAddress !== current.treasuryAddress || proposal.configVersion !== current.configVersion || proposal.snapshotBlock !== current.snapshotBlock || proposal.expiresAt > current.expiresAt) throw new Error('Proposal changed; review a fresh proposal');
  const boundId = keccak256(encodeAbiParameters([{type:'bytes32'},{type:'bytes32'},{type:'uint256'},{type:'string'},{type:'uint256'}],[hash32(proposal.snapshotHash),hash32(proposal.configHash),BigInt(proposal.expiresAt),proposal.action,baseUnits(proposal.amountBaseUnits)]));
  if (boundId !== proposal.id) throw new Error('Proposal binding changed');
}
