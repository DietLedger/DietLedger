import { NextRequest, NextResponse } from 'next/server';

function getSyncServerUrl() {
  return process.env.SYNC_SERVER_URL || 'http://localhost:8080';
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await params;

  const res = await fetch(`${getSyncServerUrl()}/api/share/${shareId}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await params;
  const authHeader = request.headers.get('Authorization');
  const body = await request.json();

  const res = await fetch(`${getSyncServerUrl()}/api/share/${shareId}/rate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { 'Authorization': authHeader } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
