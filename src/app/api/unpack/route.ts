import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';

// adm-zip is Node-only (next.config `serverExternalPackages`).
export const runtime = 'nodejs';

// Unpacks an uploaded .zip (POST body) and returns the `manifest.json` it
// contains as JSON. The client then runs the shared importer on the result.
export async function POST(req: NextRequest) {
  let body: Buffer;
  try {
    body = Buffer.from(await req.arrayBuffer());
  } catch {
    return NextResponse.json({ error: 'could not read request body' }, { status: 400 });
  }
  if (body.length === 0) {
    return NextResponse.json({ error: 'empty upload' }, { status: 400 });
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(body);
  } catch {
    return NextResponse.json({ error: 'invalid zip file' }, { status: 400 });
  }

  const entry =
    zip.getEntry('manifest.json') ||
    zip.getEntries().find((e) => !e.isDirectory && e.entryName.endsWith('.json'));
  if (!entry) {
    return NextResponse.json({ error: 'no manifest.json found in zip' }, { status: 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(zip.readAsText(entry));
  } catch {
    return NextResponse.json({ error: 'manifest is not valid JSON' }, { status: 400 });
  }

  return NextResponse.json(parsed);
}
