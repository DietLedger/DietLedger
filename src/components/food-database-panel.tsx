'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Database,
  Download,
  Upload,
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  Trash2,
  HardDrive,
  Server,
  FileArchive,
} from 'lucide-react';
import { fmt } from '@/lib/format';

interface DatasetStatus {
  key: string;
  name: string;
  releaseDate: string;
  lastImported: string | null;
  recordCount: number;
  status: 'imported' | 'not_imported';
  format: 'json' | 'csv';
}

interface JobStatus {
  id: number;
  dataType: string;
  releaseDate: string;
  status: string;
  progress: number;
  recordCount: number;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface DBStats {
  totalFoods: number;
  byDataType: Array<{ dataType: string; count: number }>;
  bySource: Array<{ source: string; count: number }>;
  recentJobs: Array<{
    id: number;
    dataType: string;
    releaseDate: string;
    recordCount: number;
    status: string;
    completedAt: string | null;
  }>;
}

interface SearchResult {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner: string | null;
  nutrients: { calories: number; protein: number; totalFat: number; totalCarbs: number };
}

function statusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-brand-500" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-destructive" />;
    case 'importing':
    case 'downloading':
    case 'extracting':
      return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
    default:
      return <Database className="w-4 h-4 text-stone-400" />;
  }
}

const ImportProgressCard = React.memo(function ImportProgressCard({
  jobId,
  onJobDone,
}: {
  jobId: number | null;
  onJobDone: () => void;
}) {
  const [job, setJob] = useState<JobStatus | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (jobId === null) {
      setJob(null);
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/foods/seed/${jobId}`);
        if (res.ok) {
          const data: JobStatus = await res.json();
          setJob(data);
          if (data.status === 'completed' || data.status === 'failed') {
            if (pollRef.current) clearInterval(pollRef.current);
            onJobDone();
          }
        }
      } catch {
        // ignore
      }
    };

    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId, onJobDone]);

  const handleCancel = useCallback(async () => {
    if (!jobId) return;
    try {
      await fetch(`/api/foods/seed/${jobId}`, { method: 'DELETE' });
      setJob(null);
      onJobDone();
    } catch {
      // ignore
    }
  }, [jobId, onJobDone]);

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-stone-700 flex items-center gap-2">
          <Server className="w-4 h-4 text-brand-600" />
          Import Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {job ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {statusIcon(job.status)}
              <span className="text-sm font-medium capitalize">{job.status}</span>
              <span className="text-xs text-stone-400 ml-auto">
                {job.dataType}
              </span>
            </div>
            <Progress value={job.progress} className="h-2" />
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span>{job.recordCount.toLocaleString()} records imported</span>
              <span>{Math.round(job.progress)}%</span>
            </div>
            {(job.status === 'importing' || job.status === 'downloading' || job.status === 'extracting') && (
              <p className="text-xs text-stone-400 text-center">
                {job.status === 'importing' && job.recordCount > 0
                  ? 'Importing records — this may take a while for large datasets...'
                  : job.status === 'downloading'
                  ? 'Downloading from USDA...'
                  : 'Extracting archive...'}
              </p>
            )}
            {job.error && (
              <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                {job.error}
              </p>
            )}
            {(job.status === 'downloading' ||
              job.status === 'extracting' ||
              job.status === 'importing') && (
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={handleCancel}
              >
                Cancel Job
              </Button>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-stone-400">
            <Server className="w-8 h-8 mx-auto mb-2 text-stone-300" />
            <p className="text-sm">No active import jobs</p>
            <p className="text-xs mt-1">Select a dataset above to start seeding</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export default function FoodDatabasePanel() {
  const [datasets, setDatasets] = useState<DatasetStatus[]>([]);
  const [stats, setStats] = useState<DBStats | null>(null);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [testQuery, setTestQuery] = useState('');
  const [testResults, setTestResults] = useState<SearchResult[]>([]);
  const [testSource, setTestSource] = useState<string>('');
  const [testSearching, setTestSearching] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDataType, setUploadDataType] = useState('foundation');
  const [uploading, setUploading] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [seedRes, statsRes] = await Promise.all([
        fetch('/api/foods/seed'),
        fetch('/api/foods/stats'),
      ]);
      if (seedRes.ok) {
        const seedData = await seedRes.json();
        setDatasets(seedData.datasets || []);
      }
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onJobDone = useCallback(() => {
    setActiveJobId(null);
    fetchData();
  }, [fetchData]);

  const handleSeed = useCallback(async (datasetKey: string) => {
    try {
      const res = await fetch('/api/foods/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset: datasetKey }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveJobId(data.jobId);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('dataType', uploadDataType);
      const res = await fetch('/api/foods/seed/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        setActiveJobId(data.jobId);
        setUploadFile(null);
      }
    } catch {
      // ignore
    } finally {
      setUploading(false);
    }
  }, [uploadFile, uploadDataType]);

  const handleTestSearch = useCallback(async () => {
    if (!testQuery.trim()) return;
    setTestSearching(true);
    try {
      const res = await fetch(`/api/foods/search?query=${encodeURIComponent(testQuery)}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setTestResults(data.foods || []);
        setTestSource(data.source || '');
      }
    } catch {
      // ignore
    } finally {
      setTestSearching(false);
    }
  }, [testQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-[60vh]">
      <div className="space-y-4 pr-2">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-stone-700 flex items-center gap-2">
                <Download className="w-4 h-4 text-brand-600" />
                USDA Datasets
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {datasets.map((ds) => (
                  <div
                    key={ds.key}
                    className="p-3 border border-stone-200 rounded-lg hover:border-stone-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-stone-900">{ds.name}</p>
                        <p className="text-xs text-stone-400 mt-0.5">
                          Release: {ds.releaseDate}
                          {ds.format === 'csv' && (
                            <span className="text-stone-500 ml-2">CSV format</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {ds.status === 'imported' ? (
                          <Badge className="bg-brand-100 text-brand-700 border-brand-200 text-[10px] h-5">
                            {ds.recordCount.toLocaleString()} records
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] h-5">
                            Not imported
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          className="bg-brand-600 hover:bg-brand-700 h-7 text-xs gap-1"
                          onClick={() => handleSeed(ds.key)}
                          disabled={activeJobId !== null}
                        >
                          <Download className="w-3 h-3" />
                          {ds.status === 'imported' ? 'Update' : 'Seed'}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <ImportProgressCard jobId={activeJobId} onJobDone={onJobDone} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-stone-700 flex items-center gap-2">
                <FileArchive className="w-4 h-4 text-brand-600" />
                Manual Upload
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-stone-400 mb-3">
                Upload a USDA dataset .zip or .json file if download is blocked.
              </p>
              <div className="space-y-3">
                <Input
                  type="file"
                  accept=".zip,.json"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <select
                    value={uploadDataType}
                    onChange={(e) => setUploadDataType(e.target.value)}
                    className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="foundation">Foundation</option>
                    <option value="srLegacy">SR Legacy</option>
                    <option value="fndds">FNDDS</option>
                    <option value="branded">Branded</option>
                    <option value="full">Full</option>
                  </select>
                  <Button
                    onClick={handleUpload}
                    disabled={!uploadFile || uploading || activeJobId !== null}
                    className="bg-brand-600 hover:bg-brand-700 gap-1"
                  >
                    {uploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    Upload
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-stone-700 flex items-center gap-2">
                <Search className="w-4 h-4 text-brand-600" />
                Search Test
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder="Test search (e.g., chicken)..."
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTestSearch()}
                  className="flex-1 text-sm"
                />
                <Button
                  onClick={handleTestSearch}
                  disabled={testSearching || !testQuery.trim()}
                  className="bg-brand-600 hover:bg-brand-700"
                >
                  {testSearching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>
              {testSource && (
                <Badge
                  variant={testSource === 'local' ? 'default' : 'outline'}
                  className={`text-[10px] h-5 mb-2 ${
                    testSource === 'local'
                      ? 'bg-brand-100 text-brand-700 border-brand-200'
                      : testSource === 'fda'
                      ? 'bg-blue-100 text-blue-700 border-blue-200'
                      : 'bg-amber-100 text-amber-700 border-amber-200'
                  }`}
                >
                  Source: {testSource === 'local' ? 'Local DB' : testSource === 'fda' ? 'Network' : 'Fallback'}
                </Badge>
              )}
              <ScrollArea className="max-h-[200px]">
                <div className="space-y-1">
                  {testResults.map((food) => (
                    <div
                      key={food.fdcId}
                      className="p-2 rounded border border-stone-200 text-sm"
                    >
                      <div className="font-medium text-stone-900 truncate">{food.description}</div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-stone-400">
                        <Badge variant="outline" className="text-[9px] h-4">
                          {food.dataType}
                        </Badge>
                        <span>{fmt(food.nutrients.calories)} cal</span>
                        <span>P: {fmt(food.nutrients.protein)}g</span>
                      </div>
                    </div>
                  ))}
                  {testResults.length === 0 && testQuery && !testSearching && (
                    <p className="text-xs text-stone-400 text-center py-4">
                      Click search to test
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {stats && (
          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-stone-700 flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-brand-600" />
                  Database Statistics
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {stats.totalFoods.toLocaleString()} total foods
                  </Badge>
                  {!clearConfirm ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => setClearConfirm(true)}
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Clear Database
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={async () => {
                          await fetch('/api/foods/stats', { method: 'DELETE' });
                          setClearConfirm(false);
                          fetchData();
                        }}
                      >
                        Confirm Clear
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setClearConfirm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {stats.byDataType.map((dt) => (
                  <div key={dt.dataType} className="p-3 bg-stone-50 rounded-lg">
                    <p className="text-xs text-stone-500">{dt.dataType}</p>
                    <p className="text-lg font-semibold text-stone-900">
                      {dt.count.toLocaleString()}
                    </p>
                  </div>
                ))}
                {stats.bySource.map((s) => (
                  <div key={s.source} className="p-3 bg-stone-50 rounded-lg">
                    <p className="text-xs text-stone-500">Source: {s.source}</p>
                    <p className="text-lg font-semibold text-stone-900">
                      {s.count.toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
              {stats.recentJobs.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <p className="text-xs font-medium text-stone-500 mb-2">Recent Import Jobs</p>
                  <div className="space-y-1">
                    {stats.recentJobs.map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between text-xs text-stone-500 py-1"
                      >
                        <span className="capitalize">{job.dataType}</span>
                        <span>{job.recordCount.toLocaleString()} records</span>
                        <span>{job.completedAt ? new Date(job.completedAt).toLocaleDateString() : '—'}</span>
                        {statusIcon(job.status)}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}
