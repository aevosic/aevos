import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  FileCode2,
  GitBranch,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import {
  formatDuration,
  formatRam,
  formatRelativeTime,
} from '../lib/ledgerEngine';
import type { EffectiveDeposit, FileCollision, Project } from '../lib/types';
import { StatusIndicator } from './StatusIndicator';

interface ReviewQueueViewProps {
  deposits: EffectiveDeposit[];
  projects: Project[];
  collisions: FileCollision[];
  initialSelectedId: string | null;
  onResolveDeposit: (
    depositId: string,
    status: 'done' | 'failed',
    note: string
  ) => Promise<void>;
  onInspectInGraph: (projectId: string) => void;
  onOpenLogDeposit: () => void;
}

export function ReviewQueueView({
  deposits,
  projects,
  collisions,
  initialSelectedId,
  onResolveDeposit,
  onInspectInGraph,
  onOpenLogDeposit,
}: ReviewQueueViewProps) {
  const pending = deposits.filter((d) => d.effectiveStatus === 'waiting_review');
  const recentlyResolved = deposits
    .filter((d) => d.resolutionSeq !== undefined)
    .slice(0, 5);

  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId ?? pending[0]?.id ?? null
  );
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState<'done' | 'failed' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialSelectedId && pending.some((d) => d.id === initialSelectedId)) {
      setSelectedId(initialSelectedId);
    }
  }, [initialSelectedId, pending]);

  useEffect(() => {
    if (pending.length === 0) {
      setSelectedId(null);
    } else if (!selectedId || !pending.some((d) => d.id === selectedId)) {
      setSelectedId(pending[0].id);
    }
  }, [pending, selectedId]);

  const activeDeposit = pending.find((d) => d.id === selectedId) ?? pending[0] ?? null;
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const activeProject = activeDeposit ? projectMap.get(activeDeposit.projectId) : null;

  const activeCollisions = activeDeposit
    ? collisions.filter(
        (c) =>
          c.projectId === activeDeposit.projectId &&
          activeDeposit.artifacts.includes(c.artifactPath)
      )
    : [];

  // Keyboard navigation J / K within the queue
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey) {
        return;
      }
      if (pending.length <= 1) return;
      const idx = pending.findIndex((d) => d.id === selectedId);
      if (e.key === 'j') {
        e.preventDefault();
        const next = pending[(idx + 1) % pending.length];
        setSelectedId(next.id);
      } else if (e.key === 'k') {
        e.preventDefault();
        const prev = pending[(idx - 1 + pending.length) % pending.length];
        setSelectedId(prev.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pending, selectedId]);

  const handleAction = async (decision: 'done' | 'failed') => {
    if (!activeDeposit) return;
    setSubmitting(decision);
    setErrorMsg(null);
    try {
      await onResolveDeposit(activeDeposit.id, decision, note);
      setNote('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to record review decision.');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-950 dark:text-[#F8FAFC]">
            Review Queue
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-[#8D98A8]">
            Inspect artifacts, verification runs, and decisions before appending sign-off to the audit ledger.
          </p>
        </div>
        <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-[#788496]">
          {pending.length} waiting · Press J / K to step
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#1F252F] rounded-lg p-12 text-center space-y-3">
          <div className="mx-auto w-10 h-10 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" aria-hidden="true" />
          </div>
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            All agent deposits reviewed
          </h2>
          <p className="text-sm text-slate-600 dark:text-[#8D98A8] max-w-md mx-auto">
            No pending runs are waiting on director approval. Every prior decision is sealed in the append-only disk ledger.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={onOpenLogDeposit}
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-amber-500 dark:text-slate-950 rounded-md hover:opacity-90 transition-opacity"
            >
              Log a new deposit
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Queue List */}
          <div className="lg:col-span-5 bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#1F252F] rounded-lg divide-y divide-slate-200 dark:divide-[#1F252F]">
            {pending.map((dep) => {
              const proj = projectMap.get(dep.projectId);
              const isSelected = dep.id === activeDeposit?.id;
              const hasOverlap = collisions.some(
                (c) => c.projectId === dep.projectId && dep.artifacts.includes(c.artifactPath)
              );

              return (
                <button
                  key={dep.id}
                  type="button"
                  onClick={() => setSelectedId(dep.id)}
                  aria-pressed={isSelected}
                  className={`w-full text-left p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 ${
                    isSelected
                      ? 'bg-slate-100/80 dark:bg-[#181D26]'
                      : 'hover:bg-slate-50 dark:hover:bg-[#141820]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-[#8490A2]">
                    <span className="truncate">
                      <span className="font-medium text-slate-800 dark:text-[#CBD5E1]">
                        {proj?.name ?? dep.projectId}
                      </span>{' '}
                      · {dep.agentLabel}
                    </span>
                    <span className="font-mono tabular-nums shrink-0">#{dep.seq}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-slate-950 dark:text-[#F8FAFC] leading-snug">
                    {dep.summary}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs font-mono tabular-nums text-slate-500 dark:text-[#788496]">
                    <span>
                      {dep.artifacts.length} file{dep.artifacts.length === 1 ? '' : 's'} ·{' '}
                      {formatRam(dep.ramMb)} · {dep.latencyMs}ms
                    </span>
                    {hasOverlap && (
                      <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-sans font-medium">
                        <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                        <span>Overlap</span>
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Inspection Dossier */}
          {activeDeposit && (
            <div className="lg:col-span-7 bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#1F252F] rounded-lg p-6 space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 dark:border-[#1F252F] pb-5">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-[#8490A2]">
                    <span className="font-medium text-slate-900 dark:text-white">
                      {activeProject?.name ?? activeDeposit.projectId}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{activeDeposit.agentLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">Seq #{activeDeposit.seq}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatRelativeTime(activeDeposit.timestamp)}</span>
                  </div>
                  <h2 className="font-display text-lg font-semibold text-slate-950 dark:text-white leading-snug">
                    {activeDeposit.summary}
                  </h2>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <StatusIndicator status={activeDeposit.effectiveStatus} />
                  <button
                    type="button"
                    onClick={() => onInspectInGraph(activeDeposit.projectId)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-[#CBD5E1] border border-slate-200 dark:border-[#262E3A] rounded-md hover:bg-slate-50 dark:hover:bg-[#181D26] transition-colors whitespace-nowrap"
                  >
                    <GitBranch className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Graph</span>
                  </button>
                </div>
              </div>

              {/* Resource Telemetry Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-1">
                <div>
                  <div className="text-xs text-slate-500 dark:text-[#788496]">RAM usage</div>
                  <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                    {formatRam(activeDeposit.ramMb)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-[#788496]">Runtime</div>
                  <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                    {formatDuration(activeDeposit.runtimeMs)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-[#788496]">Latency</div>
                  <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                    {activeDeposit.latencyMs}ms
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-[#788496]">Verified runs</div>
                  <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                    {activeDeposit.verificationRuns ?? 1}x
                  </div>
                </div>
              </div>

              {/* Decision & Physical Proof Notes */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-medium text-slate-500 dark:text-[#788496]">
                  Decision & proof notes
                </h3>
                <p className="text-sm leading-relaxed text-slate-800 dark:text-[#D4DCE7]">
                  {activeDeposit.decision || 'No additional decision notes attached to this deposit.'}
                </p>
              </div>

              {/* Artifacts Produced */}
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-slate-500 dark:text-[#788496]">
                  Exact artifacts ({activeDeposit.artifacts.length})
                </h3>
                {activeDeposit.artifacts.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-[#788496]">
                    No file artifacts declared.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-200/80 dark:divide-[#1F252F] border border-slate-200 dark:border-[#1F252F] rounded-md">
                    {activeDeposit.artifacts.map((art) => {
                      const col = activeCollisions.find((c) => c.artifactPath === art);
                      return (
                        <li
                          key={art}
                          className="px-3 py-2 flex items-center justify-between gap-3 text-xs font-mono"
                        >
                          <span className="flex items-center gap-2 min-w-0 text-slate-800 dark:text-[#E2E8F0]">
                            <FileCode2
                              className="w-3.5 h-3.5 text-slate-400 shrink-0"
                              aria-hidden="true"
                            />
                            <span className="truncate">{art}</span>
                          </span>
                          {col && (
                            <span className="text-rose-600 dark:text-rose-400 font-sans font-medium whitespace-nowrap shrink-0">
                              Also touched by {col.agents.filter((a) => a !== activeDeposit.agentLabel).join(', ')}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Append-only Resolution Form */}
              <div className="pt-4 border-t border-slate-200 dark:border-[#1F252F] space-y-3">
                <label
                  htmlFor="director-review-note"
                  className="block text-xs font-medium text-slate-600 dark:text-[#94A0B2]"
                >
                  Director review note (appended immutably to disk ledger)
                </label>
                <textarea
                  id="director-review-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional verification note or revision instruction…"
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#0D1015] border border-slate-200 dark:border-[#242B35] rounded-md text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#5C6778] focus:outline-none focus:ring-2 focus:ring-amber-500"
                />

                {errorMsg && (
                  <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                    {errorMsg}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <span className="font-mono text-xs text-slate-400 dark:text-[#667285]">
                    Hash {activeDeposit.hash}
                  </span>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      disabled={submitting !== null}
                      onClick={() => handleAction('failed')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-md hover:bg-rose-100 dark:hover:bg-rose-500/20 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{submitting === 'failed' ? 'Recording…' : 'Flag for Revision'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={submitting !== null}
                      onClick={() => handleAction('done')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap"
                    >
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{submitting === 'done' ? 'Approving…' : 'Approve & Merge'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recently Resolved Audit Trail */}
      {recentlyResolved.length > 0 && (
        <section aria-label="Recently resolved reviews" className="pt-2">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-[#E8ECF2] mb-3">
            Recently signed off
          </h2>
          <div className="bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#1F252F] rounded-lg divide-y divide-slate-200 dark:divide-[#1F252F]">
            {recentlyResolved.map((dep) => {
              const proj = projectMap.get(dep.projectId);
              return (
                <div
                  key={dep.id}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-slate-900 dark:text-white">
                      {dep.summary}
                    </span>
                    <div className="text-xs text-slate-500 dark:text-[#8490A2] mt-0.5">
                      {proj?.name ?? dep.projectId} · {dep.agentLabel} · Resolved via seq #
                      {dep.resolutionSeq} — {dep.resolutionNote}
                    </div>
                  </div>
                  <StatusIndicator status={dep.effectiveStatus} />
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
