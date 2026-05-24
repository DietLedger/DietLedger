import { NextRequest, NextResponse } from 'next/server';
import { startSeedJob, getAllSeedJobs } from '@/lib/usda-import';
import { USDA_DATASETS, type DatasetKey } from '@/lib/usda-datasets';

export async function GET() {
  try {
    let jobs: Awaited<ReturnType<typeof getAllSeedJobs>> = [];
    try {
      jobs = await getAllSeedJobs();
    } catch {
      jobs = [];
    }
    const datasetStatus = Object.entries(USDA_DATASETS).map(([key, ds]) => {
      const latestJob = jobs.find((j) => j.dataType === key && j.status === 'completed');
      return {
        key,
        name: ds.name,
        releaseDate: ds.releaseDate,
        lastImported: latestJob?.completedAt?.toISOString() || null,
        recordCount: latestJob?.recordCount || 0,
        status: latestJob ? 'imported' : 'not_imported',
        format: ds.format,
      };
    });
    return NextResponse.json({ datasets: datasetStatus, recentJobs: jobs.slice(0, 10) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const datasetKey = body.dataset as DatasetKey;

    if (!datasetKey || !(datasetKey in USDA_DATASETS)) {
      return NextResponse.json(
        { error: 'Invalid dataset. Use: foundation, srLegacy, fndds, branded, or full' },
        { status: 400 }
      );
    }

    const jobId = await startSeedJob(datasetKey);
    return NextResponse.json({ jobId, message: `Seed job started for ${datasetKey}` });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
