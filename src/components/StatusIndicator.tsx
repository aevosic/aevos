import { AlertTriangle, Check, Clock, Loader2 } from 'lucide-react';
import type { DepositStatus } from '../lib/types';

interface StatusIndicatorProps {
  status: DepositStatus;
  compact?: boolean;
}

const STATUS_META: Record<
  DepositStatus,
  { label: string; textClass: string; icon: 'running' | 'done' | 'failed' | 'waiting_review' }
> = {
  running: {
    label: 'Running',
    textClass: 'text-sky-600 dark:text-sky-400',
    icon: 'running',
  },
  waiting_review: {
    label: 'Waiting on review',
    textClass: 'text-amber-600 dark:text-amber-400',
    icon: 'waiting_review',
  },
  done: {
    label: 'Done',
    textClass: 'text-emerald-600 dark:text-emerald-400',
    icon: 'done',
  },
  failed: {
    label: 'Failed',
    textClass: 'text-rose-600 dark:text-rose-400',
    icon: 'failed',
  },
};

export function StatusIndicator({ status, compact = false }: StatusIndicatorProps) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${meta.textClass}`}
    >
      {meta.icon === 'running' && (
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
      )}
      {meta.icon === 'waiting_review' && (
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      )}
      {meta.icon === 'done' && (
        <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      )}
      {meta.icon === 'failed' && (
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      )}
      <span>{compact && status === 'waiting_review' ? 'Review' : meta.label}</span>
    </span>
  );
}
