import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');

  if (!address) {
    return NextResponse.json({ error: 'Address is required' }, { status: 400 });
  }

  try {
    const res = await fetch(`https://etherscan.io/address/${address}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    if (!res.ok) {
      return NextResponse.json({ name: address }); // Fallback
    }

    const html = await res.text();
    
    // Extract title: <title>Binance 14 | Address: 0x...</title>
    const titleMatch = html.match(/<title>([^|]+)/i);
    
    if (titleMatch && titleMatch[1]) {
      const title = titleMatch[1].trim();
      // If it doesn't say "Address", it's a named tag!
      if (!title.toLowerCase().includes('address') && !title.toLowerCase().startsWith('0x')) {
        return NextResponse.json({ name: title });
      }
    }

    return NextResponse.json({ name: address });
  } catch (error) {
    console.error("Failed to fetch Etherscan tag:", error);
    return NextResponse.json({ name: address });
  }
}
