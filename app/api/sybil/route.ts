import { NextResponse } from 'next/server';

const ALCHEMY_KEY = "pyNIqQckWHnP9Um5lTRIH";
const ALCHEMY_URL = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');

  if (!wallet) {
    return NextResponse.json({ error: 'Wallet is required' }, { status: 400 });
  }

  try {
    // We use raw fetch instead of the SDK to avoid Next.js 14 native fetch bug (ERR_INVALID_URL)
    const incomingReq = fetch(ALCHEMY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 1, jsonrpc: "2.0", method: "alchemy_getAssetTransfers",
        params: [{
          fromBlock: "0x0", toBlock: "latest",
          toAddress: wallet, category: ["external"], maxCount: "0x5", order: "asc" // Oldest first
        }]
      })
    });

    const outgoingReq = fetch(ALCHEMY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 2, jsonrpc: "2.0", method: "alchemy_getAssetTransfers",
        params: [{
          fromBlock: "0x0", toBlock: "latest",
          fromAddress: wallet, category: ["external"], maxCount: "0x5", order: "desc" // Newest first
        }]
      })
    });

    const balanceReq = fetch(ALCHEMY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 3, jsonrpc: "2.0", method: "eth_getBalance",
        params: [wallet, "latest"]
      })
    });

    const [inRes, outRes, balRes] = await Promise.all([incomingReq, outgoingReq, balanceReq]);
    
    const inData = await inRes.json();
    const outData = await outRes.json();
    const balData = await balRes.json();

    const incomingTransfers = inData.result?.transfers || [];
    const outgoingTransfers = outData.result?.transfers || [];
    const balanceWei = balData.result || "0x0";
    
    // Convert hex Wei to ETH (approximate for display)
    const balanceEth = parseInt(balanceWei, 16) / 1e18;

    // Extract unique addresses and their oldest/newest interaction block
    const fundersMap = new Map<string, any>();
    incomingTransfers.forEach((tx: any) => {
      const from = tx.from?.toLowerCase();
      if (from && from !== wallet.toLowerCase() && !fundersMap.has(from)) {
        fundersMap.set(from, {
          address: from,
          blockNum: parseInt(tx.blockNum, 16),
          hash: tx.hash
        });
      }
    });

    const targetsMap = new Map<string, any>();
    outgoingTransfers.forEach((tx: any) => {
      const to = tx.to?.toLowerCase();
      if (to && to !== wallet.toLowerCase() && !targetsMap.has(to)) {
        targetsMap.set(to, {
          address: to,
          blockNum: parseInt(tx.blockNum, 16),
          hash: tx.hash
        });
      }
    });

    return NextResponse.json({
      wallet: wallet.toLowerCase(),
      funders: Array.from(fundersMap.values()),
      targets: Array.from(targetsMap.values()),
      balanceEth: Number(balanceEth.toFixed(4))
    });
  } catch (error: any) {
    console.error(`Sybil check failed for ${wallet}:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
