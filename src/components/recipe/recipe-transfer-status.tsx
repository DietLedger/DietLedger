import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export function RecipeTransferStatus({ status }: { status: { kind: 'ok' | 'err'; msg: string } | null }) {
  if (!status) return null;
  return (
    <div
      role={status.kind === 'err' ? 'alert' : 'status'}
      className={`mt-2 text-xs flex min-w-0 max-w-full gap-1.5 px-2 py-1.5 rounded ${
        status.kind === 'ok'
          ? 'items-center text-green-700 bg-green-50 border border-green-200'
          : 'items-start max-h-32 overflow-y-auto text-red-600 bg-red-50 border border-red-200'
      }`}
    >
      {status.kind === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
      <span className={status.kind === 'err' ? 'min-w-0 break-words [overflow-wrap:anywhere]' : 'truncate'}>{status.msg}</span>
    </div>
  );
}
