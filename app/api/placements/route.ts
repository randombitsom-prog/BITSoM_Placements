import { NextResponse } from 'next/server';
import { fetchPlacementListings } from '@/lib/pinecone';

export const maxDuration = 60;

export async function GET() {
  try {
    const listings = await fetchPlacementListings(120);
    return NextResponse.json({ data: listings });
  } catch (error) {
    console.error('Failed to fetch placement listings', error);
    return NextResponse.json({ error: 'Failed to fetch placements' }, { status: 500 });
  }
}

