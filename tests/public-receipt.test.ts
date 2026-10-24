import { describe, expect, test, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, erc20Abi, zeroAddress, type Address } from "viem";
import { resolvePublicReceipt, type ReceiptClient } from "../apps/web/src/server/receipt";
import { treasuryAbi } from "../packages/mezo/src/treasury-abi";
import { troveAbi, troveDeployment, troveImplementations } from "../packages/mezo/src/trove";
import build from "../packages/mezo/src/treasury-build.json";
const owner = "0x1111111111111111111111111111111111111111", treasury = "0x2222222222222222222222222222222222222222", recipient = "0x3333333333333333333333333333333333333333";
const hash = `0x${"a".repeat(64)}` as const, blockHash = `0x${"b".repeat(64)}` as const, id = `0x${"c".repeat(64)}` as const, terms = `0x${"d".repeat(64)}` as const;
const amount = 2500000000000000000n;
function transfer(from: Address = treasury, to: Address = recipient, value = amount, address: string = troveDeployment.musd) {
  return { address, topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from, to } }), data: encodeAbiParameters([{ type: "uint256" }], [value]) };
}
function fixture() {
  const tx = { from: owner, to: treasury, input: encodeFunctionData({ abi: treasuryAbi, functionName: "pay", args: [id] }), value: 0n, nonce: 7 };
  const paid = { address: treasury, topics: encodeEventTopics({ abi: treasuryAbi, eventName: "Paid", args: { id, termsHash: terms, recipient } }), data: encodeAbiParameters([{ type: "uint256" }], [amount]) };
  const receipt = { blockNumber: 100n, blockHash, status: "success", logs: [paid, transfer()] };
  const p = {
    getChainId: vi.fn(async () => 31611), getTransaction: vi.fn(async () => tx), getTransactionReceipt: vi.fn(async () => receipt), getBlockNumber: vi.fn(async () => 105n), getBlock: vi.fn(async () => ({ hash: blockHash })),
    getCode: vi.fn(async () => build.runtime), readContract: vi.fn(async (args: { functionName: string }) => args.functionName === "owner" ? owner : troveDeployment.musd),
    getStorageAt: vi.fn(async () => `0x${"0".repeat(24)}${troveImplementations.borrowerOperations.slice(2)}`),
  };
  return { tx, receipt, p, resolve: () => resolvePublicReceipt("31611", hash, p as unknown as ReceiptClient) };
}
describe("public wallet-free receipt verification", () => {
  test("strict hash and chain validation does not perform RPC calls", async () => {
    const f = fixture();
    expect((await resolvePublicReceipt("1", hash, f.p as unknown as ReceiptClient)).state).toBe("unsupported");
    expect((await resolvePublicReceipt("31611", "0x123", f.p as unknown as ReceiptClient)).state).toBe("unsupported");
    expect(f.p.getChainId).not.toHaveBeenCalled();
  });
  test("exposes exact chain payment amount, Transfer endpoints and genuine terms hash", async () => {
    const f = fixture(), r = await f.resolve();
    expect(r).toMatchObject({ state: "confirmed", kind: "payment", amount: "2.5", amountBaseUnits: amount.toString(), from: treasury, to: recipient, sender: owner, termsHash: terms, confirmations: "6", blockNumber: "100" });
    expect(Object.keys(r)).not.toContain("billId"); expect(Object.keys(r)).not.toContain("memo");
  });
  test.each(["wrong-amount", "wrong-token", "wrong-recipient", "missing-transfer", "duplicate-paid", "wrong-id"])("rejects misleading payment evidence: %s", async variant => {
    const f = fixture();
    if (variant === "wrong-amount") f.receipt.logs[1] = transfer(treasury, recipient, 1n);
    if (variant === "wrong-token") f.receipt.logs[1] = transfer(treasury, recipient, amount, owner);
    if (variant === "wrong-recipient") f.receipt.logs[1] = transfer(treasury, owner);
    if (variant === "missing-transfer") f.receipt.logs.pop();
    if (variant === "duplicate-paid") f.receipt.logs.push(f.receipt.logs[0]);
    if (variant === "wrong-id") f.tx.input = encodeFunctionData({ abi: treasuryAbi, functionName: "pay", args: [terms] });
    expect((await f.resolve()).state).toBe("unsupported");
  });
  test("rejects unrelated runtime and altered treasury owner", async () => {
    const f = fixture(); f.p.getCode.mockResolvedValue("0x1234"); expect((await f.resolve()).state).toBe("unsupported");
    const g = fixture(); g.p.readContract.mockImplementation(async () => troveDeployment.musd); expect((await g.resolve()).state).toBe("unsupported");
  });
  test("identifies revert without claiming any transferred amount", async () => {
    const f = fixture(); f.receipt.status = "reverted"; f.receipt.logs = [];
    const r = await f.resolve(); expect(r.state).toBe("reverted"); expect(r.amount).toBeUndefined();
  });
  test("does not call a shallow or noncanonical receipt confirmed", async () => {
    const f = fixture(); f.p.getBlockNumber.mockResolvedValue(100n); expect((await f.resolve()).state).toBe("pending");
    const g = fixture(); g.p.getBlock.mockResolvedValue({ hash }); expect((await g.resolve()).state).toBe("pending");
    const h = fixture(); h.p.getBlock.mockResolvedValueOnce({ hash: blockHash }).mockResolvedValueOnce({ hash }); expect((await h.resolve()).state).toBe("pending");
  });
  test("known unmined transaction is pending but RPC errors/unknown hashes are unavailable", async () => {
    const f = fixture(); f.p.getTransactionReceipt.mockRejectedValue({ name: "TransactionReceiptNotFoundError" }); expect((await f.resolve()).state).toBe("pending");
    const g = fixture(); g.p.getTransaction.mockRejectedValue(new Error("not found")); expect((await g.resolve()).state).toBe("unavailable");
    const h = fixture(); h.p.getChainId.mockResolvedValue(1); expect((await h.resolve()).state).toBe("unavailable");
  });
  test("repayment requires pinned implementation, exact call amount and owner MUSD burn", async () => {
    const f = fixture(); f.tx.to = troveDeployment.borrowerOperations;
    f.tx.input = encodeFunctionData({ abi: troveAbi, functionName: "repayMUSD", args: [amount, zeroAddress, zeroAddress] });
    f.receipt.logs = [transfer(owner, zeroAddress)];
    const r = await f.resolve(); expect(r).toMatchObject({ state: "confirmed", kind: "repayment", from: owner, to: zeroAddress, amount: "2.5" }); expect(r.termsHash).toBeUndefined();
    f.p.getStorageAt.mockResolvedValue(`0x${"0".repeat(64)}`); expect((await f.resolve()).state).toBe("unsupported");
  });
  test("repayment missing burn cannot become confirmed", async () => {
    const f = fixture(); f.tx.to = troveDeployment.borrowerOperations; f.tx.input = encodeFunctionData({ abi: troveAbi, functionName: "repayMUSD", args: [amount, zeroAddress, zeroAddress] }); f.receipt.logs = [];
    expect((await f.resolve()).state).toBe("unsupported");
  });
});
