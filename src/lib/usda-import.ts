import { db } from '@/lib/db';
import { USDA_DATASETS, type DatasetKey } from '@/lib/usda-datasets';
import { extractNutrients, NUTRIENT_MAP } from '@/lib/nutrient-map';
import { createReadStream, createWriteStream, writeFileSync, unlinkSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { createInterface } from 'readline';
import { execSync } from 'child_process';
import streamJson from 'stream-json';
import pick from 'stream-json/filters/pick.js';
import streamArray from 'stream-json/streamers/stream-array.js';
import chain from 'stream-chain';

const { parser } = streamJson;

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
    nutrient?: { id?: number; number?: string; name?: string };
    amount?: number;
  }>;
}

interface ImportProgress {
  status: string;
  progress: number;
  recordCount: number;
  error?: string;
}

interface ImportCheckpoint {
  phase: 'food' | 'nutrient' | 'json';
  offset: number;
  imported: number;
}

const activeJobs = new Map<number, AbortController>();

const DATA_TYPE_MAP: Record<string, string> = {
  foundation: 'Foundation',
  srLegacy: 'SR Legacy',
  fndds: 'Survey (FNDDS)',
  branded: 'Branded',
  full: 'Full',
};

const RELEVANT_NUTRIENT_IDS = new Set(Object.keys(NUTRIENT_MAP).map(Number));

const NUTRIENT_FIELD_MAP: Record<number, string> = {
  1008: 'calories',
  1004: 'totalFat',
  1258: 'saturatedFat',
  1257: 'transFat',
  1253: 'cholesterol',
  1093: 'sodium',
  1005: 'totalCarbs',
  1079: 'dietaryFiber',
  2000: 'totalSugars',
  1235: 'addedSugars',
  1003: 'protein',
  1114: 'vitaminD',
  1087: 'calcium',
  1089: 'iron',
  1092: 'potassium',
};

function normalizeFood(food: USDAFood, fallbackDataType?: string) {
  const dataType = food.dataType || fallbackDataType || 'Unknown';
  const servingSize = food.servingSize || 100;
  const servingSizeUnit = food.servingSizeUnit || 'g';
  const rawNutrients = food.foodNutrients || [];

  const normalizedNutrients = rawNutrients.map((n) => ({
    nutrientId: n.nutrientId ?? n.nutrient?.id ?? 0,
    value: n.value ?? n.amount ?? 0,
  }));

  const extracted = extractNutrients(normalizedNutrients, dataType, servingSize, servingSizeUnit);

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

async function updateJobProgress(jobId: number, update: Partial<ImportProgress> & { checkpoint?: string }) {
  await db.seedJob.update({
    where: { id: jobId },
    data: {
      ...(update.status && { status: update.status }),
      ...(update.progress !== undefined && { progress: update.progress }),
      ...(update.recordCount !== undefined && { recordCount: update.recordCount }),
      ...(update.error && { error: update.error }),
      ...(update.checkpoint !== undefined && { checkpoint: update.checkpoint }),
      ...(update.status === 'downloading' && { startedAt: new Date() }),
      ...(update.status === 'completed' && { completedAt: new Date() }),
    },
  });
}

async function saveCheckpoint(jobId: number, cp: ImportCheckpoint) {
  await db.seedJob.update({
    where: { id: jobId },
    data: { checkpoint: JSON.stringify(cp) },
  });
}

async function loadCheckpoint(jobId: number): Promise<ImportCheckpoint | null> {
  const job = await db.seedJob.findUnique({ where: { id: jobId }, select: { checkpoint: true } });
  if (!job?.checkpoint) return null;
  try {
    return JSON.parse(job.checkpoint);
  } catch {
    return null;
  }
}

async function findResumableCheckpoint(dataType: string): Promise<ImportCheckpoint | null> {
  try {
    const failed = await db.seedJob.findFirst({
      where: { dataType, status: 'failed', checkpoint: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { checkpoint: true },
    });
    if (!failed?.checkpoint) return null;
    try {
      return JSON.parse(failed.checkpoint);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

function jobTmpDir(jobId: number) {
  const dir = join(tmpdir(), `recipetool-${jobId}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupDir(dir: string) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = join(dir, e.name);
      try { if (e.isDirectory()) cleanupDir(p); else unlinkSync(p); } catch {}
    }
    try { unlinkSync(dir); } catch {}
  } catch {}
}

async function streamToFile(body: ReadableStream<Uint8Array>, filePath: string): Promise<number> {
  const writer = createWriteStream(filePath);
  let totalBytes = 0;
  const reader = body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.length;
    if (!writer.write(Buffer.from(value))) {
      await new Promise<void>((r) => writer.once('drain', r));
    }
  }

  await new Promise<void>((resolve, reject) => {
    writer.end(() => resolve());
    writer.on('error', reject);
  });

  return totalBytes;
}

function extractZip(zipPath: string, destDir: string) {
  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force"`,
      { stdio: 'pipe', timeout: 600000 }
    );
  } else {
    execSync(`unzip -o -q "${zipPath}" -d "${destDir}"`, { stdio: 'pipe', timeout: 600000 });
  }
}

function findFileRecursive(dir: string, predicate: (name: string) => boolean): string | null {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const found = findFileRecursive(p, predicate);
      if (found) return found;
    } else if (predicate(e.name)) {
      return p;
    }
  }
  return null;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

function columnIndices(header: string): Record<string, number> {
  const cols = parseCsvLine(header);
  const map: Record<string, number> = {};
  for (let i = 0; i < cols.length; i++) {
    map[cols[i].trim().toLowerCase()] = i;
  }
  return map;
}

function findArrayKey(filePath: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const pipeline = chain([
      createReadStream(filePath, { encoding: 'utf8' }),
      parser(),
    ]);
    let foundKey: string | null = null;
    let depth = 0;
    pipeline.on('data', (chunk: { name: string; value?: unknown }) => {
      if (chunk.name === 'startObject') depth++;
      if (chunk.name === 'endObject') depth--;
      if (chunk.name === 'keyValue' && depth === 1 && !foundKey) {
        foundKey = String(chunk.value);
      }
      if (chunk.name === 'startArray' && foundKey) {
        pipeline.destroy();
        resolve(foundKey);
      }
    });
    pipeline.on('end', () => resolve(foundKey));
    pipeline.on('error', reject);
  });
}

function streamCsvLines(
  filePath: string,
  onLine: (cols: string[], headers: Record<string, number>, lineNum: number) => Promise<boolean>,
  startOffset: number = 0,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    let headers: Record<string, number> | null = null;
    let lineNum = 0;
    let processing = false;
    let ended = false;
    let done = false;
    const buffer: Array<{ cols: string[]; num: number }> = [];

    async function processBuffer() {
      while (buffer.length > 0) {
        if (done) return;
        const item = buffer.shift()!;
        try {
          const shouldStop = await onLine(item.cols, headers!, item.num);
          if (shouldStop) {
            done = true;
            rl.close();
            return;
          }
        } catch (err) {
          done = true;
          rl.close();
          reject(err);
          return;
        }
      }
      processing = false;
      if (ended) {
        resolve(lineNum);
      } else {
        rl.resume();
      }
    }

    rl.on('line', (line: string) => {
      if (done) return;
      lineNum++;

      if (lineNum <= startOffset) return;
      if (!line.trim()) return;

      if (!headers) {
        headers = columnIndices(line);
        return;
      }

      const cols = parseCsvLine(line);
      buffer.push({ cols, num: lineNum });

      if (!processing) {
        processing = true;
        rl.pause();
        processBuffer();
      }
    });

    rl.on('close', () => {
      ended = true;
      if (!processing) resolve(lineNum);
    });
    rl.on('error', (err) => {
      done = true;
      reject(err);
    });
  });
}

async function processJsonFileStream(
  filePath: string,
  arrayKey: string,
  jobId: number,
  signal: AbortSignal,
  fallbackDataType?: string,
  checkpoint?: ImportCheckpoint | null,
): Promise<number> {
  let imported = checkpoint?.phase === 'json' ? checkpoint.imported : 0;
  let skipCount = checkpoint?.phase === 'json' ? checkpoint.offset : 0;
  let lastReportedProgress = 0;
  let lastDbWriteCount = 0;
  const BATCH_SIZE = 200;
  const DB_WRITE_INTERVAL = 1000;
  const CHECKPOINT_INTERVAL = 5000;
  let batch: USDAFood[] = [];

  await new Promise<void>((resolve, reject) => {
    const pipeline = chain([
      createReadStream(filePath, { encoding: 'utf8' }),
      parser(),
      pick({ filter: arrayKey }),
      streamArray(),
    ]);

    pipeline.on('data', (data: { value: USDAFood }) => {
      if (signal.aborted) {
        pipeline.destroy(new Error('Job cancelled'));
        return;
      }

      if (skipCount > 0) {
        skipCount--;
        return;
      }

      batch.push(data.value);

      if (batch.length >= BATCH_SIZE) {
        const currentBatch = batch;
        batch = [];

        const normalized = currentBatch.map((f) => normalizeFood(f, fallbackDataType));
        const operations = normalized.map((food) =>
          db.foodItem.upsert({
            where: { fdcId: food.fdcId },
            update: food,
            create: food,
          })
        );

        pipeline.pause();
        db.$transaction(operations)
          .then(async () => {
            imported += currentBatch.length;
            const progress = Math.min(99, Math.round((imported / (imported + 500)) * 100));
            if (progress > lastReportedProgress || imported - lastDbWriteCount >= DB_WRITE_INTERVAL) {
              lastReportedProgress = progress;
              lastDbWriteCount = imported;
              const cp: ImportCheckpoint = { phase: 'json', offset: imported, imported };
              await updateJobProgress(jobId, {
                status: 'importing',
                progress,
                recordCount: imported,
                checkpoint: JSON.stringify(cp),
              });
            } else if (imported % CHECKPOINT_INTERVAL === 0) {
              await saveCheckpoint(jobId, { phase: 'json', offset: imported, imported });
            }
            pipeline.resume();
          })
          .catch((err) => {
            pipeline.destroy(err);
          });
      }
    });

    pipeline.on('end', () => resolve());
    pipeline.on('error', (err: Error) => {
      if (err.message === 'Job cancelled') resolve();
      else reject(err);
    });
  });

  if (batch.length > 0 && !signal.aborted) {
    const normalized = batch.map((f) => normalizeFood(f, fallbackDataType));
    const operations = normalized.map((food) =>
      db.foodItem.upsert({
        where: { fdcId: food.fdcId },
        update: food,
        create: food,
      })
    );
    await db.$transaction(operations);
    imported += batch.length;
  }

  return imported;
}

async function processCsvFiles(
  extractDir: string,
  jobId: number,
  signal: AbortSignal,
  initialCheckpoint?: ImportCheckpoint | null,
): Promise<number> {
  const foodCsv = findFileRecursive(extractDir, (n) => n.toLowerCase() === 'food.csv');
  const nutrientCsv = findFileRecursive(extractDir, (n) => n.toLowerCase() === 'food_nutrient.csv');

  if (!foodCsv) throw new Error('food.csv not found in archive');
  if (!nutrientCsv) throw new Error('food_nutrient.csv not found in archive');

  const cp = initialCheckpoint || { phase: 'food' as const, offset: 0, imported: 0 };
  let imported = cp.phase === 'nutrient' ? cp.imported : 0;

  if (cp.phase === 'food') {
    await updateJobProgress(jobId, { status: 'importing', progress: 56, recordCount: imported });

    const FOOD_BATCH_SIZE = 100;
    const CHECKPOINT_INTERVAL = 5000;
    const DB_WRITE_INTERVAL = 500;
    let foodBatch: any[] = [];
    let lastCheckpointLine = 0;
    let lastReportedProgress = 0;

    await streamCsvLines(foodCsv, async (cols, headers, lineNum) => {
      if (signal.aborted) return true;

      const fdcIdIdx = headers['fdc_id'] ?? headers['fdcid'];
      const descIdx = headers['description'];
      if (fdcIdIdx === undefined || descIdx === undefined) return false;

      const fdcId = parseInt(cols[fdcIdIdx]);
      const description = cols[descIdx] || '';
      if (!fdcId || !description) return false;

      const dataTypeIdx = headers['data_type'] ?? headers['datatype'];
      const brandIdx = headers['brand_owner'] ?? headers['brandowner'] ?? headers['brand_owner'];
      const gtinIdx = headers['gtin_upc'] ?? headers['gtinupc'];
      const servingIdx = headers['serving_size'] ?? headers['servingsize'];
      const servingUnitIdx = headers['serving_size_unit'] ?? headers['servingsizeunit'];

      const dataType = dataTypeIdx !== undefined ? cols[dataTypeIdx] || '' : '';
      const servingSize = servingIdx !== undefined ? parseFloat(cols[servingIdx]) || 100 : 100;
      const servingSizeUnit = servingUnitIdx !== undefined ? cols[servingUnitIdx] || 'g' : 'g';

      const food = normalizeFood({
        fdcId,
        description,
        dataType,
        brandOwner: brandIdx !== undefined ? cols[brandIdx] : undefined,
        gtinUpc: gtinIdx !== undefined ? cols[gtinIdx] : undefined,
        servingSize,
        servingSizeUnit,
        foodNutrients: [],
      });

      foodBatch.push(food);

      if (foodBatch.length >= FOOD_BATCH_SIZE) {
        const batch = foodBatch;
        foodBatch = [];

        await db.$transaction(
          batch.map((f: any) =>
            db.foodItem.upsert({
              where: { fdcId: f.fdcId },
              update: f,
              create: f,
            })
          )
        );

        imported += batch.length;
        const progress = Math.round((imported / (imported + 1000)) * 50) + 56;

        if (lineNum - lastCheckpointLine >= CHECKPOINT_INTERVAL) {
          lastCheckpointLine = lineNum;
          await saveCheckpoint(jobId, { phase: 'food', offset: lineNum, imported });
        }

        if (progress > lastReportedProgress || imported % DB_WRITE_INTERVAL === 0) {
          lastReportedProgress = progress;
          await updateJobProgress(jobId, {
            status: 'importing',
            progress: Math.min(progress, 79),
            recordCount: imported,
          });
        }
      }

      return false;
    }, cp.offset);

    if (foodBatch.length > 0 && !signal.aborted) {
      await db.$transaction(
        foodBatch.map((f: any) =>
          db.foodItem.upsert({
            where: { fdcId: f.fdcId },
            update: f,
            create: f,
          })
        )
      );
      imported += foodBatch.length;
    }

    await saveCheckpoint(jobId, { phase: 'nutrient', offset: 0, imported });
  }

  if (!signal.aborted) {
    const nutrientCp = cp.phase === 'nutrient' ? cp : { phase: 'nutrient' as const, offset: 0, imported };
    let nutrientOffset = nutrientCp.offset;
    let nutrientsFlushed = 0;
    let lastCheckpointLine = 0;

    const NUTRIENT_BATCH_SIZE = 2000;
    const CHECKPOINT_INTERVAL = 10000;
    let nutrientBatch = new Map<number, Map<number, number>>();

    const flushNutrients = async () => {
      const entries = Array.from(nutrientBatch.entries());
      nutrientBatch = new Map();

      const BATCH_SIZE = 50;
      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        if (signal.aborted) return;
        const chunk = entries.slice(i, i + BATCH_SIZE);
        const ops = chunk.map(([fdcId, nutrients]) => {
          const data: Record<string, number> = {};
          for (const [nutId, amount] of nutrients) {
            const field = NUTRIENT_FIELD_MAP[nutId];
            if (field) data[field] = amount;
          }
          return db.foodItem.updateMany({ where: { fdcId }, data });
        });
        await db.$transaction(ops);
      }
      nutrientsFlushed += entries.length;
    };

    await streamCsvLines(nutrientCsv, async (cols, headers, lineNum) => {
      if (signal.aborted) return true;

      const fdcIdIdx = headers['fdc_id'] ?? headers['fdcid'];
      const nutIdIdx = headers['nutrient_id'] ?? headers['nutrientid'] ?? headers['nutrientid'];
      const amountIdx = headers['amount'];
      if (fdcIdIdx === undefined || nutIdIdx === undefined || amountIdx === undefined) return false;

      const nutId = parseInt(cols[nutIdIdx]);
      if (!RELEVANT_NUTRIENT_IDS.has(nutId)) return false;

      const fdcId = parseInt(cols[fdcIdIdx]);
      const amount = parseFloat(cols[amountIdx]) || 0;

      let foodNutrients = nutrientBatch.get(fdcId);
      if (!foodNutrients) {
        foodNutrients = new Map();
        nutrientBatch.set(fdcId, foodNutrients);
      }
      foodNutrients.set(nutId, amount);

      if (nutrientBatch.size >= NUTRIENT_BATCH_SIZE) {
        await flushNutrients();

        if (lineNum - lastCheckpointLine >= CHECKPOINT_INTERVAL) {
          lastCheckpointLine = lineNum;
          await saveCheckpoint(jobId, { phase: 'nutrient', offset: lineNum, imported });
        }

        const progress = Math.min(80 + Math.round((nutrientsFlushed / (nutrientsFlushed + 5000)) * 19), 99);
        await updateJobProgress(jobId, { status: 'importing', progress, recordCount: imported });
      }

      return false;
    }, nutrientOffset);

    if (nutrientBatch.size > 0 && !signal.aborted) {
      await flushNutrients();
    }
  }

  return imported;
}

export async function startSeedJob(
  datasetKey: DatasetKey,
  _onProgress?: (count: number) => void
): Promise<number> {
  const dataset = USDA_DATASETS[datasetKey];
  if (!dataset) throw new Error(`Unknown dataset: ${datasetKey}`);

  const resumableCp = await findResumableCheckpoint(datasetKey);

  const job = await db.seedJob.create({
    data: {
      dataType: datasetKey,
      releaseDate: dataset.releaseDate,
      fileName: dataset.url.split('/').pop() || datasetKey,
      status: 'pending',
      checkpoint: resumableCp ? JSON.stringify(resumableCp) : null,
    },
  });

  const controller = new AbortController();
  activeJobs.set(job.id, controller);

  (async () => {
    const dir = jobTmpDir(job.id);
    const zipPath = join(dir, 'download.zip');
    try {
      await updateJobProgress(job.id, { status: 'downloading', progress: 0 });

      const response = await fetch(dataset.url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);

      const contentLength = parseInt(response.headers.get('content-length') || '0');
      if (!response.body) throw new Error('No response body');

      const totalBytes = await streamToFile(response.body, zipPath);

      if (contentLength > 0) {
        const dlProgress = Math.round((totalBytes / contentLength) * 50);
        await updateJobProgress(job.id, { status: 'downloading', progress: dlProgress });
      }

      await updateJobProgress(job.id, { status: 'extracting', progress: 50 });

      extractZip(zipPath, dir);
      try { unlinkSync(zipPath); } catch {}

      await updateJobProgress(job.id, { status: 'importing', progress: 55 });

      let count: number;

      if (dataset.format === 'csv') {
        count = await processCsvFiles(dir, job.id, controller.signal, resumableCp);
      } else {
        const jsonPath = findFileRecursive(dir, (n) => n.endsWith('.json'));
        if (!jsonPath) throw new Error('No JSON file found in extracted archive');

        const arrayKey = await findArrayKey(jsonPath);
        const key = arrayKey || '';
        count = await processJsonFileStream(
          jsonPath, key, job.id, controller.signal,
          DATA_TYPE_MAP[datasetKey], resumableCp
        );
      }

      await updateJobProgress(job.id, {
        status: 'completed',
        progress: 100,
        recordCount: count,
        checkpoint: null,
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
      cleanupDir(dir);
    }
  })();

  return job.id;
}

export async function startUploadSeedJob(
  fileBuffer: Buffer,
  fileName: string,
  dataType: string,
  _onProgress?: (count: number) => void
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
    const dir = jobTmpDir(job.id);
    try {
      await updateJobProgress(job.id, { status: 'extracting', progress: 10 });

      if (fileName.endsWith('.zip')) {
        const zipPath = join(dir, 'upload.zip');
        writeFileSync(zipPath, fileBuffer);
        extractZip(zipPath, dir);
        try { unlinkSync(zipPath); } catch {}
      } else if (fileName.endsWith('.json')) {
        const jsonPath = join(dir, 'upload.json');
        writeFileSync(jsonPath, fileBuffer);
      } else if (fileName.endsWith('.csv')) {
        const csvPath = join(dir, 'food.csv');
        writeFileSync(csvPath, fileBuffer);
      } else {
        throw new Error('Unsupported file format. Use .zip, .json, or .csv');
      }

      await updateJobProgress(job.id, { status: 'importing', progress: 20 });

      let count: number;

      const foodCsv = findFileRecursive(dir, (n) => n.toLowerCase() === 'food.csv');
      const jsonPath = findFileRecursive(dir, (n) => n.endsWith('.json'));

      if (foodCsv) {
        count = await processCsvFiles(dir, job.id, controller.signal);
      } else if (jsonPath) {
        const arrayKey = await findArrayKey(jsonPath);
        const key = arrayKey || '';
        count = await processJsonFileStream(
          jsonPath, key, job.id, controller.signal,
          DATA_TYPE_MAP[dataType] || dataType
        );
      } else {
        throw new Error('No importable files found (expected food.csv or .json)');
      }

      await updateJobProgress(job.id, {
        status: 'completed',
        progress: 100,
        recordCount: count,
        checkpoint: null,
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
      cleanupDir(dir);
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
