import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';

// Packs a JSON manifest (POST body) into a .zip containing `manifest.json`
// and streams it back. adm-zip is server-only (next.config serverExternalPackages),
// so the zip step runs here rather than in the browser.
export async function POST(req: NextRequest) {
  const text = await req.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'invalid JSON manifest' }, { status: 400 });
  }

  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(parsed, null, 2), 'utf8'));
  const buffer = zip.toBuffer();

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'content-type': 'application/zip',
      'cache-control': 'no-store',
    },
  });
}
