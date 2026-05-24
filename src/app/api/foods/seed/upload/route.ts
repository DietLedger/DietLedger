import { NextRequest, NextResponse } from 'next/server';
import { startUploadSeedJob } from '@/lib/usda-import';
import { ensureSchema } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    await ensureSchema();
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const dataType = (formData.get('dataType') as string) || 'unknown';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const jobId = await startUploadSeedJob(buffer, file.name, dataType);

    return NextResponse.json({ jobId, message: 'Upload seed job started' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
