import{NextRequest,NextResponse}from"next/server";
import{sessionAddress}from"@/server/auth";import{readBody,errorResponse}from"@/server/http";
import{database}from"../../../../../../packages/db/src/database";
import{saveTreasuryBinding}from"../../../../../../packages/db/src/treasury-bindings";
import{chainConfig,publicClient}from"../../../../../../packages/mezo/src/network";
import{deploymentData,verifyTreasury}from"../../../../../../packages/mezo/src/deployment";
import{effectiveConfig}from"@/server/treasury-config";
import{erc20Abi,isHash,isAddress,formatEther,type Address}from"viem";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(){try{
 const db=await database(),owner=await sessionAddress(),c=await effectiveConfig(db,owner),p=publicClient(),b=await p.getBlock();
 const [chain,code,decimals,balance]=await Promise.all([p.getChainId(),p.getCode({address:c.token,blockNumber:b.number}),p.readContract({address:c.token,abi:erc20Abi,functionName:"decimals",blockNumber:b.number}),owner?p.getBalance({address:owner as Address,blockNumber:b.number}):Promise.resolve(0n)]);
 const verified=chain===31611&&Boolean(code&&code!=="0x")&&decimals===18;
 return NextResponse.json({network:{chainId:31611,name:"Mezo Testnet",tokenAddress:c.token,explorerUrl:c.explorerUrl},ownerAddress:owner,treasuryAddress:c.treasury,tokenVerified:verified,deploymentReady:verified&&Boolean(owner)&&balance>0n,walletBtcBalance:formatEther(balance),reason:!verified?"Official MUSD could not be verified.":!owner?"Connect and sign in to set up your treasury.":balance===0n?"Get testnet BTC from the faucet to pay deployment gas.":null},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return errorResponse(e);}}
export async function POST(req:NextRequest){try{
 const body=await readBody(req),owner=await sessionAddress();if(!owner)throw new Error("Connect and sign in with the treasury owner wallet.");
 const db=await database(),c=await effectiveConfig(db,owner),p=publicClient();
 if(body.action==="prepare"){
  if(c.treasury)throw new Error("A treasury is already connected to this wallet.");
  const balance=await p.getBalance({address:owner as Address});if(balance===0n)throw new Error("Get Mezo testnet BTC before deploying.");
  if(await p.getChainId()!==31611)throw new Error("RPC chain mismatch.");
  const decimals=await p.readContract({address:c.token,abi:erc20Abi,functionName:"decimals"});if(decimals!==18)throw new Error("MUSD token decimals mismatch.");
  const data=deploymentData(owner as Address,c.token),gas=await p.estimateGas({account:owner as Address,data,value:0n});
  return NextResponse.json({transaction:{data,value:"0x0",chainId:31611},ownerAddress:owner,tokenAddress:c.token,estimatedGas:gas.toString()});
 }
 if(body.action==="connect"){
  if(!isAddress(body.treasuryAddress))throw new Error("Enter a valid treasury address.");
  const verified=await verifyTreasury(body.treasuryAddress,owner);
  await saveTreasuryBinding(db,owner,verified.address);
  return NextResponse.json({treasuryAddress:verified.address,status:"confirmed",verification:verified});
 }
 if(body.action==="register"){
  if(!isHash(body.txHash))throw new Error("Invalid deployment transaction hash.");
  let receipt;try{receipt=await p.getTransactionReceipt({hash:body.txHash});}catch{return NextResponse.json({status:"pending",txHash:body.txHash});}
  if(receipt.status!=="success"||!receipt.contractAddress)throw new Error("Deployment reverted or did not create a contract.");
  const [tx,block,head]=await Promise.all([p.getTransaction({hash:body.txHash}),p.getBlock({blockNumber:receipt.blockNumber}),p.getBlockNumber()]);
  if(tx.from.toLowerCase()!==owner.toLowerCase()||tx.to!==null||tx.value!==0n||tx.input.toLowerCase()!==deploymentData(owner as Address,c.token).toLowerCase())throw new Error("Deployment transaction does not match your owner wallet and Mezora build.");
  if(block.hash!==receipt.blockHash||head-receipt.blockNumber+1n<BigInt(Math.max(1,Number(process.env.MEZORA_CONFIRMATIONS)||2)))return NextResponse.json({status:"pending",txHash:body.txHash});
  const verified=await verifyTreasury(receipt.contractAddress,owner);
  await saveTreasuryBinding(db,owner,verified.address,body.txHash);
  return NextResponse.json({treasuryAddress:verified.address,txHash:body.txHash,status:"confirmed",verification:verified});
 }
 throw new Error("Unknown setup action.");
 }catch(e){return errorResponse(e);}}
