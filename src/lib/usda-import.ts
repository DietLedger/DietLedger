import AdmZip from 'adm-zip';
import { db } from '@/lib/db';
import { USDA_DATASETS, type DatasetKey } from '@/lib/usda-datasets';
import { extractNutrients } from '@/lib/nutrient-map';

interface USDAFood {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner?: string;
  gtinUpc?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients?: Array<{
    nutrientId?: number;
    nutrientName?: string;
    value?: number;
    unitName?: string;
  }>;
}

interface ImportProgress {
  status: string;
  progress: number;
  recordCount: number;
  error?: string;
}

const activeJobs = new Map<number, AbortController>();

function normalizeFood(food: USDAFood) {
  const dataType = food.dataType || 'Unknown';
  const servingSize = food.servingSize || 100;
  const servingSizeUnit = food.servingSizeUnit || 'g';
  const nutrients = food.foodNutrients || [];

  const extracted = extractNutrients(nutrients, dataType, servingSize, servingSizeUnit);

  return {
    fdcId: food.fdcId,
    description: food.description,
    dataType,
    brandOwner: food.brandOwner || null,
    gtinUpc: food.gtinUpc || null,
    servingSize,
    servingSizeUnit,
    ...extracted,
    source: 'usda',
  };
}

async function updateJobProgress(jobId: number, update: Partial<ImportProgress>) {
  await db.seedJob.update({
    where: { id: jobId },
    data: {
      ...(update.status && { status: update.status }),
      ...(update.progress !== undefined && { progress: update.progress }),
      ...(update.recordCount !== undefined && { recordCount: update.recordCount }),
      ...(update.error && { error: update.error }),
      ...(update.status === 'downloading' && { startedAt: new Date() }),
      ...(update.status === 'completed' && { completedAt: new Date() }),
    },
  });
}

async function processJsonArray(
  jsonContent: string,
  jobId: number,
  signal: AbortSignal,
  onProgress?: (count: number) => void
): Promise<number> {
  const foods: USDAFood[] = JSON.parse(jsonContent);
  const total = foods.length;
  let imported = 0;
  const BATCH_SIZE = 500;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    if (signal.aborted) throw new Error('Job cancelled');

    const batch = foods.slice(i, i + BATCH_SIZE);
    const normalized = batch.map(normalizeFood);

    const operations = normalized.map((food) =>
      db.foodItem.upsert({
        where: { fdcId: food.fdcId },
        update: food,
        create: food,
      })
    );

    await db.$transaction(operations);
    imported += batch.length;

    const progress = Math.round((imported / total) * 100);
    await updateJobProgress(jobId, {
      status: 'importing',
      progress,
      recordCount: imported,
    });

    onProgress?.(imported);
  }

  return imported;
}

export async function startSeedJob(
  datasetKey: DatasetKey,
  onProgress?: (count: number) => void
): Promise<number> {
  const dataset = USDA_DATASETS[datasetKey];
  if (!dataset) throw new Error(`Unknown dataset: ${datasetKey}`);

  const job = await db.seedJob.create({
    data: {
      dataType: datasetKey,
      releaseDate: dataset.releaseDate,
      fileName: dataset.url.split('/').pop() || datasetKey,
      status: 'pending',
    },
  });

  const controller = new AbortController();
  activeJobs.set(job.id, controller);

  (async () => {
    try {
      await updateJobProgress(job.id, { status: 'downloading', progress: 0 });

      const response = await fetch(dataset.url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);

      const contentLength = parseInt(response.headers.get('content-length') || '0');
      let downloadedBytes = 0;

      const chunks: Uint8Array[] = [];
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        downloadedBytes += value.length;

        if (contentLength > 0) {
          const progress = Math.round((downloadedBytes / contentLength) * 50);
          await updateJobProgress(job.id, { status: 'downloading', progress });
        }
      }

      await updateJobProgress(job.id, { status: 'extracting', progress: 50 });

      const buffer = Buffer.concat(chunks);
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries();

      const jsonEntry = entries.find(
        (e) => !e.isDirectory && (e.entryName.endsWith('.json'))
      );
      if (!jsonEntry) throw new Error('No JSON file found in archive');

      const jsonContent = jsonEntry.getData().toString('utf-8');

      await updateJobProgress(job.id, { status: 'importing', progress: 55 });

      const count = await processJsonArray(jsonContent, job.id, controller.signal, onProgress);

      await updateJobProgress(job.id, {
        status: 'completed',
        progress: 100,
        recordCount: count,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        await updateJobProgress(job.id, {
          status: 'failed',
          error: 'Job cancelled by user',
          progress: 0,
        });
      } else {
        await updateJobProgress(job.id, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          progress: 0,
        });
      }
    } finally {
      activeJobs.delete(job.id);
    }
  })();

  return job.id;
}

export async function startUploadSeedJob(
  fileBuffer: Buffer,
  fileName: string,
  dataType: string,
  onProgress?: (count: number) => void
): Promise<number> {
  const job = await db.seedJob.create({
    data: {
      dataType,
      releaseDate: new Date().toISOString().split('T')[0],
      fileName,
      status: 'pending',
    },
  });

  const controller = new AbortController();
  activeJobs.set(job.id, controller);

  (async () => {
    try {
      await updateJobProgress(job.id, { status: 'extracting', progress: 10 });

      let jsonContent: string;

      if (fileName.endsWith('.zip')) {
        const zip = new AdmZip(fileBuffer);
        const entries = zip.getEntries();
        const jsonEntry = entries.find(
          (e) => !e.isDirectory && e.entryName.endsWith('.json')
        );
        if (!jsonEntry) throw new Error('No JSON file found in archive');
        jsonContent = jsonEntry.getData().toString('utf-8');
      } else if (fileName.endsWith('.json')) {
        jsonContent = fileBuffer.toString('utf-8');
      } else {
        throw new Error('Unsupported file format. Use .zip or .json');
      }

      await updateJobProgress(job.id, { status: 'importing', progress: 20 });

      const count = await processJsonArray(jsonContent, job.id, controller.signal, onProgress);

      await updateJobProgress(job.id, {
        status: 'completed',
        progress: 100,
        recordCount: count,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        await updateJobProgress(job.id, {
          status: 'failed',
          error: 'Job cancelled by user',
        });
      } else {
        await updateJobProgress(job.id, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      activeJobs.delete(job.id);
    }
  })();

  return job.id;
}

export function cancelSeedJob(jobId: number): boolean {
  const controller = activeJobs.get(jobId);
  if (controller) {
    controller.abort();
    activeJobs.delete(jobId);
    return true;
  }
  return false;
}

export async function getSeedJobStatus(jobId: number) {
  return db.seedJob.findUnique({ where: { id: jobId } });
}

export async function getAllSeedJobs() {
  return db.seedJob.findMany({ orderBy: { createdAt: 'desc' } });
}
