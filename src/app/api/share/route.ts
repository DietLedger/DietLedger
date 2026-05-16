import { NextRequest, NextResponse } from 'next/server';

function getSyncServerUrl() {
  return process.env.SYNC_SERVER_URL || 'http://localhost:8080';
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const authHeader = request.headers.get('Authorization');

  const res = await fetch(`${getSyncServerUrl()}/api/share`, {
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

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');

  const res = await fetch(`${getSyncServerUrl()}/api/share`, {
    headers: {
      ...(authHeader ? { 'Authorization': authHeader } : {}),
    },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
