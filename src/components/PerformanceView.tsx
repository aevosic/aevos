import { useState } from 'react';
import { formatDuration, formatRam } from '../lib/ledgerEngine';
import type { DashboardMetrics, EffectiveDeposit, Project } from '../lib/types';

interface PerformanceViewProps {
  metrics: DashboardMetrics;
  deposits: EffectiveDeposit[];
  projects: Project[];
  selectedProject: Project | null;
}

export function PerformanceView({
  metrics,
  deposits,
  projects,
  selectedProject,
}: PerformanceViewProps) {
  const [hoveredBucketIdx, setHoveredBucketIdx] = useState<number | null>(null);

  const buckets = metrics.timeSeries;
  const maxLatency = Math.max(
    400,
    ...buckets.map((b) => Math.max(b.p95LatencyMs, b.p50LatencyMs))
  );
  const maxAgentRam = Math.max(256, ...metrics.byAgent.map((a) => a.peakRamMb));

  // SVG chart dimensions
  const chartW = 720;
  const chartH = 220;
  const padL = 56;
  const padR = 20;
  const padT = 18;
  const padB = 34;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;

  const getX = (idx: number) =>
    buckets.length <= 1
      ? padL + innerW / 2
      : padL + (idx / (buckets.length - 1)) * innerW;

  const getY = (val: number) => padT + innerH - (val / maxLatency) * innerH;

  const p50Points = buckets.map((b, i) => `${getX(i)},${getY(b.p50LatencyMs)}`).join(' ');
  const p95Points = buckets.map((b, i) => `${getX(i)},${getY(b.p95LatencyMs)}`).join(' ');

  const projectBreakdown = projects
    .map((proj) => {
      const list = deposits.filter((d) => d.projectId === proj.id);
      const uniqueFiles = new Set(list.flatMap((d) => d.artifacts)).size;
      const avgRam =
        list.length > 0
          ? Math.round(list.reduce((s, d) => s + d.ramMb, 0) / list.length)
          : 0;
      const totalRuntime = list.reduce((s, d) => s + d.runtimeMs, 0);
      const done = list.filter((d) => d.effectiveStatus === 'done').length;
      const failed = list.filter((d) => d.effectiveStatus === 'failed').length;
      return {
        project: proj,
        runs: list.length,
        uniqueFiles,
        avgRam,
        totalRuntime,
        done,
        failed,
      };
    })
    .filter((row) => !selectedProject || row.project.id === selectedProject.id);

  const hoveredBucket = hoveredBucketIdx !== null ? buckets[hoveredBucketIdx] : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-950 dark:text-[#F8FAFC]">
          Performance & Telemetry
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-[#8D98A8]">
          {selectedProject
            ? `Latency percentiles, memory ceiling, and execution efficiency for ${selectedProject.name}.`
            : 'Historical P50/P95 latency tracking, RAM footprint across agents, and project runtime costs.'}
        </p>
      </div>

      {/* Latency & RAM Dual Visualization */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Latency Trend SVG */}
        <section
          aria-label="Latency percentile tracking chart"
          className="xl:col-span-7 bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#1F252F] rounded-lg p-5 space-y-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Latency trajectory (P50 vs P95)
              </h2>
              <p className="text-xs text-slate-500 dark:text-[#788496] mt-0.5">
                Across chronological ledger windows
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
              <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-[#94A0B2]">
                <span className="w-2.5 h-0.5 bg-amber-500" />
                P95 {metrics.p95LatencyMs}ms
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-[#94A0B2]">
                <span className="w-2.5 h-0.5 bg-sky-400" />
                P50 {metrics.p50LatencyMs}ms
              </span>
            </div>
          </div>

          {buckets.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-sm text-slate-500 dark:text-[#788496]">
              No latency samples in current scope.
            </div>
          ) : (
            <div className="relative">
              <svg
                viewBox={`0 0 ${chartW} ${chartH}`}
                className="w-full h-[220px] overflow-visible"
                role="img"
                aria-label="Line chart of P50 and P95 agent latency in milliseconds"
              >
                {/* Horizontal gridlines */}
                {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                  const val = Math.round(maxLatency * t);
                  const y = getY(val);
                  return (
                    <g key={t}>
                      <line
                        x1={padL}
                        x2={chartW - padR}
                        y1={y}
                        y2={y}
                        className="stroke-slate-200 dark:stroke-[#1E242D]"
                        strokeWidth={1}
                      />
                      <text
                        x={padL - 8}
                        y={y + 4}
                        textAnchor="end"
                        className="fill-slate-400 dark:fill-[#667285] text-[10px]"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        {val}ms
                      </text>
                    </g>
                  );
                })}

                {/* P95 Line */}
                {buckets.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    points={p95Points}
                  />
                )}

                {/* P50 Line */}
                {buckets.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#38BDF8"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    points={p50Points}
                  />
                )}

                {/* Data Points & Hover Targets */}
                {buckets.map((b, i) => {
                  const cx = getX(i);
                  return (
                    <g
                      key={b.label}
                      onMouseEnter={() => setHoveredBucketIdx(i)}
                      onMouseLeave={() => setHoveredBucketIdx(null)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={cx - 24}
                        y={padT}
                        width={48}
                        height={innerH}
                        fill="transparent"
                      />
                      <circle
                        cx={cx}
                        cy={getY(b.p95LatencyMs)}
                        r={hoveredBucketIdx === i ? 4.5 : 3}
                        fill="#F59E0B"
                      />
                      <circle
                        cx={cx}
                        cy={getY(b.p50LatencyMs)}
                        r={hoveredBucketIdx === i ? 4.5 : 3}
                        fill="#38BDF8"
                      />
                      <text
                        x={cx}
                        y={chartH - 10}
                        textAnchor="middle"
                        className="fill-slate-500 dark:fill-[#788496] text-[10px]"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        {b.label}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {hoveredBucket && (
                <div className="mt-2 px-3 py-2 bg-slate-50 dark:bg-[#161B23] border border-slate-200 dark:border-[#242B35] rounded text-xs font-mono tabular-nums flex flex-wrap items-center justify-between gap-3">
                  <span className="text-slate-900 dark:text-white font-semibold">
                    Window {hoveredBucket.label} ({hoveredBucket.depositCount} runs)
                  </span>
                  <span className="text-sky-600 dark:text-sky-400">
                    P50 {hoveredBucket.p50LatencyMs}ms
                  </span>
                  <span className="text-amber-600 dark:text-amber-400">
                    P95 {hoveredBucket.p95LatencyMs}ms
                  </span>
                  <span className="text-slate-600 dark:text-[#94A0B2]">
                    Avg RAM {formatRam(hoveredBucket.avgRamMb)}
                  </span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* RAM Footprint Distribution by Agent */}
        <section
          aria-label="RAM usage by agent"
          className="xl:col-span-5 bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#1F252F] rounded-lg p-5 space-y-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                RAM footprint by agent
              </h2>
              <p className="text-xs text-slate-500 dark:text-[#788496] mt-0.5">
                Average vs peak memory consumption
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-[#8490A2] shrink-0">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-xs bg-amber-500" />
                Avg
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-xs bg-slate-300 dark:bg-[#323C4C]" />
                Peak
              </span>
            </div>
          </div>

          {metrics.byAgent.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-[#788496]">
              No agent runs recorded.
            </div>
          ) : (
            <div className="space-y-4 pt-1">
              {metrics.byAgent.map((row) => {
                const avgPct = Math.max(4, Math.round((row.avgRamMb / maxAgentRam) * 100));
                const peakPct = Math.max(4, Math.round((row.peakRamMb / maxAgentRam) * 100));
                return (
                  <div key={row.agent} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-900 dark:text-[#E8ECF2]">
                        {row.label}
                      </span>
                      <span className="font-mono tabular-nums text-slate-500 dark:text-[#8490A2]">
                        avg {formatRam(row.avgRamMb)} · peak {formatRam(row.peakRamMb)}
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 dark:bg-[#181D25] rounded-xs overflow-hidden relative">
                      <div
                        className="absolute inset-y-0 left-0 bg-slate-300 dark:bg-[#323C4C] rounded-xs"
                        style={{ width: `${peakPct}%` }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 bg-amber-500 rounded-xs"
                        style={{ width: `${avgPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Agent Efficiency Benchmark Table */}
      <section aria-label="Agent efficiency breakdown">
        <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-[#E8ECF2] mb-3">
          Agent benchmark comparison
        </h2>
        <div className="bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#1F252F] rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1F252F] text-xs font-medium text-slate-500 dark:text-[#788496]">
                <th className="py-2.5 pl-4 pr-3 font-medium">Agent</th>
                <th className="py-2.5 px-3 font-medium text-right">Deposits</th>
                <th className="py-2.5 px-3 font-medium text-right">Success rate</th>
                <th className="py-2.5 px-3 font-medium text-right">P50 latency</th>
                <th className="py-2.5 px-3 font-medium text-right">P95 latency</th>
                <th className="py-2.5 px-3 font-medium text-right">Avg RAM</th>
                <th className="py-2.5 px-3 font-medium text-right">Peak RAM</th>
                <th className="py-2.5 pl-3 pr-4 font-medium text-right">Total runtime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-[#1B2029] text-sm font-mono tabular-nums">
              {metrics.byAgent.map((row) => (
                <tr key={row.agent} className="hover:bg-slate-50 dark:hover:bg-[#151921]">
                  <td className="py-3 pl-4 pr-3 font-sans font-medium text-slate-900 dark:text-white">
                    {row.label}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-700 dark:text-[#CBD5E1]">
                    {row.totalRuns}
                  </td>
                  <td
                    className={`py-3 px-3 text-right ${
                      row.successRate >= 80
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : row.successRate >= 50
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {row.successRate}%
                  </td>
                  <td className="py-3 px-3 text-right text-slate-700 dark:text-[#CBD5E1]">
                    {row.p50LatencyMs}ms
                  </td>
                  <td className="py-3 px-3 text-right text-slate-700 dark:text-[#CBD5E1]">
                    {row.p95LatencyMs}ms
                  </td>
                  <td className="py-3 px-3 text-right text-slate-700 dark:text-[#CBD5E1]">
                    {formatRam(row.avgRamMb)}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-700 dark:text-[#CBD5E1]">
                    {formatRam(row.peakRamMb)}
                  </td>
                  <td className="py-3 pl-3 pr-4 text-right text-slate-700 dark:text-[#CBD5E1]">
                    {formatDuration(row.totalRuntimeMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Project Resource Allocation */}
      <section aria-label="Resource usage by project">
        <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-[#E8ECF2] mb-3">
          Project resource breakdown
        </h2>
        <div className="bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#1F252F] rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1F252F] text-xs font-medium text-slate-500 dark:text-[#788496]">
                <th className="py-2.5 pl-4 pr-3 font-medium">Project</th>
                <th className="py-2.5 px-3 font-medium">Local Path</th>
                <th className="py-2.5 px-3 font-medium text-right">Deposits</th>
                <th className="py-2.5 px-3 font-medium text-right">Unique files</th>
                <th className="py-2.5 px-3 font-medium text-right">Avg RAM</th>
                <th className="py-2.5 pl-3 pr-4 font-medium text-right">Total runtime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-[#1B2029] text-sm">
              {projectBreakdown.map((row) => (
                <tr key={row.project.id} className="hover:bg-slate-50 dark:hover:bg-[#151921]">
                  <td className="py-3 pl-4 pr-3 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-xs shrink-0"
                        style={{ backgroundColor: row.project.accentColor }}
                      />
                      <span>{row.project.name}</span>
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono text-xs text-slate-500 dark:text-[#8490A2]">
                    {row.project.repoPath}
                  </td>
                  <td className="py-3 px-3 font-mono text-xs tabular-nums text-right text-slate-700 dark:text-[#CBD5E1]">
                    {row.runs}
                  </td>
                  <td className="py-3 px-3 font-mono text-xs tabular-nums text-right text-slate-700 dark:text-[#CBD5E1]">
                    {row.uniqueFiles}
                  </td>
                  <td className="py-3 px-3 font-mono text-xs tabular-nums text-right text-slate-700 dark:text-[#CBD5E1]">
                    {formatRam(row.avgRam)}
                  </td>
                  <td className="py-3 pl-3 pr-4 font-mono text-xs tabular-nums text-right text-slate-700 dark:text-[#CBD5E1]">
                    {formatDuration(row.totalRuntime)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
