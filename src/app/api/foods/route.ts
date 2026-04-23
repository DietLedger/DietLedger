import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    endpoints: {
      search: '/api/foods/search?query=...&limit=25',
      upc: '/api/foods/upc?code=...',
      stats: '/api/foods/stats',
      seed: '/api/foods/seed',
      seedJob: '/api/foods/seed/[jobId]',
      upload: '/api/foods/seed/upload',
      cache: '/api/foods/cache',
    },
  });
}
