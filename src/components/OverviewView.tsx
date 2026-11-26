import { AlertTriangle, ArrowRight, FileCode2, GitBranch, ShieldCheck } from 'lucide-react';
import {
  formatDuration,
  formatRam,
  formatRelativeTime,
} from '../lib/ledgerEngine';
import type {
  ActiveView,
  DashboardMetrics,
  EffectiveDeposit,
  FileCollision,
  Project,
} from '../lib/types';
import { StatusIndicator } from './StatusIndicator';

interface OverviewViewProps {
  metrics: DashboardMetrics;
  deposits: EffectiveDeposit[];
  projects: Project[];
  collisions: FileCollision[];
  selectedProject: Project | null;
  chainValid: boolean;
  headHash: string;
  onSelectView: (view: ActiveView) => void;
  onInspectInGraph: (projectId: string) => void;
  onSelectReviewDeposit: (depositId: string) => void;
  onCompleteRunning: (depositId: string) => Promise<void>;
  onOpenLogDeposit: () => void;
}

export function OverviewView({
  metrics,
  deposits,
  projects,
  collisions,
  selectedProject,
  chainValid,
  headHash,
  onSelectView,
  onInspectInGraph,
  onSelectReviewDeposit,
  onCompleteRunning,
  onOpenLogDeposit,
}: OverviewViewProps) {
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const runningDeposits = deposits.filter((d) => d.effectiveStatus === 'running');
  const waitingDeposits = deposits.filter((d) => d.effectiveStatus === 'waiting_review');
  const recentDeposits = deposits.slice(0, 8);

  return (
    <div className="space-y-8">
      {/* Scope Heading */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-950 dark:text-[#F8FAFC] text-balance">
            {selectedProject ? selectedProject.name : 'Workspace Operations'}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-[#8D98A8]">
            {selectedProject
              ? `${selectedProject.description} · ${selectedProject.repoPath}`
              : 'Live agent activity, director review queue, file-overlap guardrails, and append-only telemetry.'}
          </p>
        </div>

        {selectedProject && (
          <button
            type="button"
            onClick={() => onInspectInGraph(selectedProject.id)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-[#E2E8F0] bg-white dark:bg-[#141820] border border-slate-200 dark:border-[#242B35] rounded-md hover:border-slate-300 dark:hover:border-[#364050] transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <GitBranch className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <span>Open Project Graph</span>
          </button>
        )}
      </div>

      {/* Primary KPI Strip — Single-elevation flat bordered grid */}
      <section
        aria-label="Key telemetry metrics"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#1F252F] rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-[#1F252F]"
      >
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-[#8490A2]">
            Active agents
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-semibold tabular-nums text-slate-950 dark:text-white">
              {metrics.runningCount}
            </span>
            <span className="font-mono text-xs tabular-nums text-sky-600 dark:text-sky-400">
              {formatRam(metrics.totalRamActiveMb)} active RAM
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-[#788496] font-mono tabular-nums">
            Peak {formatRam(metrics.peakRamMb)} · Avg {formatRam(metrics.avgRamMb)}
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-[#8490A2]">
            Waiting on me
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span
              className={`font-mono text-2xl font-semibold tabular-nums ${
                metrics.waitingReviewCount > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-950 dark:text-white'
              }`}
            >
              {metrics.waitingReviewCount}
            </span>
            <button
              type="button"
              onClick={() => onSelectView('review')}
              className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline whitespace-nowrap"
            >
              <span>Triage queue</span>
              <ArrowRight className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-[#788496]">
            {metrics.waitingReviewCount === 0
              ? 'All deposits reviewed'
              : 'Deposits awaiting director sign-off'}
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-[#8490A2]">
            Latency (P50 / P95)
          </div>
          <div className="mt-2 flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-2xl font-semibold text-slate-950 dark:text-white">
              {metrics.p50LatencyMs}ms
            </span>
            <span className="text-xs text-slate-400 dark:text-[#667285]">/</span>
            <span className="text-sm font-medium text-slate-600 dark:text-[#9BA6B8]">
              {metrics.p95LatencyMs}ms
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-[#788496] font-mono tabular-nums">
            {formatDuration(metrics.totalRuntimeMs)} total runtime
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-[#8490A2]">
            Completion & ledger chain
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-semibold tabular-nums text-slate-950 dark:text-white">
              {metrics.successRate}%
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-mono text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{chainValid ? headHash.slice(0, 8) : 'Check'}</span>
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-[#788496] font-mono tabular-nums">
            {metrics.doneCount} done · {metrics.failedCount} failed · {metrics.totalDeposits} total
          </div>
        </div>
      </section>

      {/* Main Split: Live & Recent Deposits (Left) + Review & Collision Guardrails (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Left 8 cols: Live Running + Recent Deposits */}
        <div className="xl:col-span-8 space-y-6">
          {/* Running Right Now */}
          {runningDeposits.length > 0 && (
            <section aria-label="Running right now">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-[#E8ECF2]">
                  Running right now
                </h2>
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-[#788496]">
                  {runningDeposits.length} active
                </span>
              </div>

              <div className="bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#1F252F] rounded-lg divide-y divide-slate-200 dark:divide-[#1F252F]">
                {runningDeposits.map((dep) => {
                  const proj = projectMap.get(dep.projectId);
                  return (
                    <div
                      key={dep.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-[#8490A2]">
                          <span className="font-medium text-slate-900 dark:text-[#E8ECF2]">
                            {dep.agentLabel}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{proj?.name ?? dep.projectId}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">#{dep.seq}</span>
                        </div>
                        <p className="text-sm font-medium text-slate-900 dark:text-[#F1F5F9]">
                          {dep.summary}
                        </p>
                        {dep.artifacts.length > 0 && (
                          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs font-mono text-slate-500 dark:text-[#788496]">
                            {dep.artifacts.map((art) => (
                              <span key={art} className="truncate max-w-xs">
                                {art}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center sm:flex-col sm:items-end justify-between gap-1.5 shrink-0">
                        <div className="flex items-center gap-3">
                          <StatusIndicator status={dep.effectiveStatus} />
                          <button
                            type="button"
                            onClick={() => onCompleteRunning(dep.id)}
                            className="px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-[#CBD5E1] border border-slate-200 dark:border-[#2A3240] rounded hover:border-emerald-500/60 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors whitespace-nowrap"
                          >
                            Mark done
                          </button>
                        </div>
                        <div className="font-mono text-xs tabular-nums text-slate-500 dark:text-[#8490A2]">
                          {formatRam(dep.ramMb)} · {dep.latencyMs}ms · {formatDuration(dep.runtimeMs)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Recent Deposits Table */}
          <section aria-label="Recent audit deposits">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-[#E8ECF2]">
                Recent deposits
              </h2>
              <button
                type="button"
                onClick={() => onSelectView('ledger')}
                className="text-xs font-medium text-slate-600 dark:text-[#94A0B2] hover:text-slate-950 dark:hover:text-white transition-colors"
              >
                View full ledger
              </button>
            </div>

            {recentDeposits.length === 0 ? (
              <div className="bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#1F252F] rounded-lg p-8 text-center">
                <p className="text-sm text-slate-600 dark:text-[#8D98A8]">
                  No deposits recorded for this scope yet.
                </p>
                <button
                  type="button"
                  onClick={onOpenLogDeposit}
                  className="mt-4 px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-amber-500 dark:text-slate-950 rounded-md hover:opacity-90 transition-opacity"
                >
                  Log first deposit
                </button>
              </div>
            ) : (
              <div className="bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#1F252F] rounded-lg overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-[#1F252F] text-xs font-medium text-slate-500 dark:text-[#788496]">
                      <th className="py-2.5 pl-4 pr-3 font-medium">Seq</th>
                      <th className="py-2.5 px-3 font-medium">Agent & Summary</th>
                      <th className="py-2.5 px-3 font-medium">Project</th>
                      <th className="py-2.5 px-3 font-medium">Status</th>
                      <th className="py-2.5 px-3 font-medium text-right">RAM</th>
                      <th className="py-2.5 pl-3 pr-4 font-medium text-right">Latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 dark:divide-[#1B2029] text-sm">
                    {recentDeposits.map((dep) => {
                      const proj = projectMap.get(dep.projectId);
                      return (
                        <tr
                          key={dep.id}
                          className="hover:bg-slate-50 dark:hover:bg-[#151921] transition-colors"
                        >
                          <td className="py-3 pl-4 pr-3 font-mono text-xs tabular-nums text-slate-400 dark:text-[#667285] align-top">
                            #{dep.seq}
                          </td>
                          <td className="py-3 px-3 align-top max-w-md">
                            <div className="font-medium text-slate-900 dark:text-[#F1F5F9] leading-snug">
                              {dep.summary}
                            </div>
                            <div className="mt-1 flex items-center flex-wrap gap-x-2 text-xs text-slate-500 dark:text-[#8490A2]">
                              <span>{dep.agentLabel}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {dep.artifacts.length} file{dep.artifacts.length === 1 ? '' : 's'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{formatRelativeTime(dep.timestamp)}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-xs text-slate-600 dark:text-[#9BA6B8] whitespace-nowrap align-top">
                            <button
                              type="button"
                              onClick={() => onInspectInGraph(dep.projectId)}
                              className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                            >
                              {proj?.name ?? dep.projectId}
                            </button>
                          </td>
                          <td className="py-3 px-3 align-top">
                            <StatusIndicator status={dep.effectiveStatus} compact />
                          </td>
                          <td className="py-3 px-3 font-mono text-xs tabular-nums text-right text-slate-700 dark:text-[#CBD5E1] whitespace-nowrap align-top">
                            {formatRam(dep.ramMb)}
                          </td>
                          <td className="py-3 pl-3 pr-4 font-mono text-xs tabular-nums text-right text-slate-700 dark:text-[#CBD5E1] whitespace-nowrap align-top">
                            {dep.latencyMs}ms
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Right 4 cols: Waiting on Me + File Collision Guardrails */}
        <div className="xl:col-span-4 space-y-6">
          {/* Waiting on Review Preview */}
          <section aria-label="Director review queue preview">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-[#E8ECF2]">
                Waiting on me
              </h2>
              <span className="font-mono text-xs tabular-nums text-amber-600 dark:text-amber-400">
                {waitingDeposits.length} pending
              </span>
            </div>

            <div className="bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#1F252F] rounded-lg divide-y divide-slate-200 dark:divide-[#1F252F]">
              {waitingDeposits.length === 0 ? (
                <div className="p-5 text-sm text-slate-500 dark:text-[#788496]">
                  Review queue is clear. No agent runs are blocked on your sign-off.
                </div>
              ) : (
                waitingDeposits.slice(0, 4).map((dep) => {
                  const proj = projectMap.get(dep.projectId);
                  return (
                    <button
                      key={dep.id}
                      type="button"
                      onClick={() => onSelectReviewDeposit(dep.id)}
                      className="w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-[#151921] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-[#8490A2]">
                        <span>
                          {proj?.name ?? dep.projectId} · {dep.agentLabel}
                        </span>
                        <span className="font-mono tabular-nums">#{dep.seq}</span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-900 dark:text-[#F1F5F9] leading-snug">
                        {dep.summary}
                      </p>
                      <div className="mt-2 flex items-center justify-between text-xs font-mono tabular-nums text-slate-500 dark:text-[#788496]">
                        <span>{dep.artifacts.length} artifacts</span>
                        <span className="text-amber-600 dark:text-amber-400 font-sans font-medium">
                          Inspect →
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* File Collision Guardrails */}
          <section aria-label="Multi-agent file overlap alerts">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-[#E8ECF2]">
                File overlap watch
              </h2>
              <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-[#788496]">
                {collisions.length} detected
              </span>
            </div>

            <div className="bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#1F252F] rounded-lg divide-y divide-slate-200 dark:divide-[#1F252F]">
              {collisions.length === 0 ? (
                <div className="p-5 text-sm text-slate-500 dark:text-[#788496]">
                  No overlapping file edits across parallel agents.
                </div>
              ) : (
                collisions.slice(0, 5).map((col) => (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => onInspectInGraph(col.projectId)}
                    className="w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-[#151921] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-slate-700 dark:text-[#CBD5E1]">
                        {col.projectName}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          col.severity === 'active'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-500 dark:text-[#8490A2]'
                        }`}
                      >
                        <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                        <span>{col.severity === 'active' ? 'Active overlap' : 'Historical'}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 font-mono text-xs text-slate-900 dark:text-[#F1F5F9] truncate">
                      <FileCode2 className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                      <span className="truncate">{col.artifactPath}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-[#8490A2]">
                      Touched by {col.agents.join(', ')}
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
