import { NextRequest, NextResponse } from 'next/server';
import { getSeedJobStatus, cancelSeedJob } from '@/lib/usda-import';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const id = parseInt(jobId);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 });
    }

    const job = await getSeedJobStatus(id);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: job.id,
      dataType: job.dataType,
      releaseDate: job.releaseDate,
      status: job.status,
      progress: job.progress,
      recordCount: job.recordCount,
      error: job.error,
      startedAt: job.startedAt?.toISOString(),
      completedAt: job.completedAt?.toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const id = parseInt(jobId);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 });
    }

    const cancelled = cancelSeedJob(id);
    if (!cancelled) {
      return NextResponse.json({ error: 'Job not found or not active' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Job cancelled' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
