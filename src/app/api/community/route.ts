import { NextRequest, NextResponse } from 'next/server';

function getSyncServerUrl() {
  return process.env.SYNC_SERVER_URL || 'http://localhost:8080';
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const category = searchParams.get('category') || '';
  const sort = searchParams.get('sort') || '';
  const page = searchParams.get('page') || '1';

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  if (sort) params.set('sort', sort);
  if (page) params.set('page', page);

  const res = await fetch(`${getSyncServerUrl()}/api/community?${params.toString()}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
