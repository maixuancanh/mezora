import { getPublicReceipt } from "@/server/receipt";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ chainId: string; txHash: string }> }) {
  const { chainId, txHash } = await params;
  const receipt = await getPublicReceipt(chainId, txHash);
  return Response.json(receipt, { status: receipt.state === "unavailable" ? 503 : receipt.state === "unsupported" ? 422 : 200, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
