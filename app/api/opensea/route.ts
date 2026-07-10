import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');

  if (!slug) {
    return NextResponse.json({ error: 'Slug is required' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://api.opensea.io/api/v2/collections/${slug}`, {
      headers: {
        'Accept': 'application/json',
        // 'X-API-KEY': process.env.OPENSEA_API_KEY // If you add an API key later
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json({ 
          error: 'OpenSea blocked this request. Please paste the actual contract address (0x...) instead of the OpenSea link.' 
        }, { status: response.status });
      }
      
      const text = await response.text();
      console.error("OpenSea API Error:", response.status, text);
      return NextResponse.json({ error: 'Failed to fetch from OpenSea' }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Internal Server Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
