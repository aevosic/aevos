import { Fragment, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileCode2,
  Search,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import {
  AGENT_LABELS,
  VALID_AGENTS,
  filterDeposits,
  formatDuration,
  formatRam,
} from '../lib/ledgerEngine';
import type {
  AgentId,
  DepositEntry,
  DepositStatus,
  EffectiveDeposit,
  Project,
} from '../lib/types';
import { StatusIndicator } from './StatusIndicator';

interface AuditLedgerViewProps {
  rawLedger: DepositEntry[];
  effectiveDeposits: EffectiveDeposit[];
  projects: Project[];
  selectedProjectId: string | null;
  chainValid: boolean;
  headHash: string;
  ledgerBytes: number;
  onOpenLogDeposit: () => void;
}

export function AuditLedgerView({
  rawLedger,
  effectiveDeposits,
  projects,
  selectedProjectId,
  chainValid,
  headHash,
  ledgerBytes,
  onOpenLogDeposit,
}: AuditLedgerViewProps) {
  const [query, setQuery] = useState('');
  const [agentFilter, setAgentFilter] = useState<AgentId | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<DepositStatus | 'all'>('all');
  const [showRawAppendLog, setShowRawAppendLog] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showApiSnippet, setShowApiSnippet] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const filteredEffective = useMemo(
    () =>
      filterDeposits(effectiveDeposits, {
        projectId: selectedProjectId,
        agent: agentFilter,
        status: statusFilter,
        query,
      }),
    [effectiveDeposits, selectedProjectId, agentFilter, statusFilter, query]
  );

  const filteredRaw = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...rawLedger]
      .sort((a, b) => b.seq - a.seq)
      .filter((entry) => {
        if (selectedProjectId && entry.projectId !== selectedProjectId) return false;
        if (agentFilter !== 'all' && entry.agent !== agentFilter) return false;
        if (statusFilter !== 'all' && entry.status !== statusFilter) return false;
        if (q) {
          const text = [entry.summary, entry.decision ?? '', entry.agentLabel, entry.hash, ...entry.artifacts]
            .join(' ')
            .toLowerCase();
          if (!text.includes(q)) return false;
        }
        return true;
      });
  }, [rawLedger, selectedProjectId, agentFilter, statusFilter, query]);

  const rows: Array<DepositEntry | EffectiveDeposit> = showRawAppendLog
    ? filteredRaw
    : filteredEffective;

  const isEffective = (row: DepositEntry | EffectiveDeposit): row is EffectiveDeposit =>
    'effectiveStatus' in row;

  const sampleProjectId = selectedProjectId ?? projects[0]?.id ?? 'proj-aevos';
  const curlSnippet = `curl -X POST http://localhost:3000/api/deposits \\
  -H "Content-Type: application/json" \\
  -d '{
    "projectId": "${sampleProjectId}",
    "agent": "claude",
    "agentLabel": "Claude Opus",
    "status": "waiting_review",
    "summary": "Verified zero-copy parser against 50k fixture lines",
    "decision": "Kept allocations flat; passed twice on cold run.",
    "artifacts": ["crates/aevos-tasks/src/parser.rs"],
    "ramMb": 142,
    "runtimeMs": 4820,
    "latencyMs": 310,
    "verificationRuns": 2
  }'`;

  const handleCopyCurl = async () => {
    try {
      await navigator.clipboard.writeText(curlSnippet);
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 1800);
    } catch {
      // Clipboard blocked in non-secure context; ignore gracefully
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Integrity Readout */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-950 dark:text-[#F8FAFC]">
            Audit Ledger
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-[#8D98A8]">
            Immutable append-only JSONL history on disk with SHA-256 hash chaining across every agent deposit and review resolution.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowApiSnippet((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-[#CBD5E1] bg-white dark:bg-[#141820] border border-slate-200 dark:border-[#242B35] rounded-md hover:border-slate-300 dark:hover:border-[#364050] transition-colors whitespace-nowrap"
          >
            <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Agent API</span>
          </button>
          <a
            href="/api/ledger/export"
            download="aevos-audit-ledger.jsonl"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-[#CBD5E1] bg-white dark:bg-[#141820] border border-slate-200 dark:border-[#242B35] rounded-md hover:border-slate-300 dark:hover:border-[#364050] transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export JSONL</span>
          </a>
        </div>
      </div>

      {/* Chain Proof Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#1F252F] rounded-lg text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono tabular-nums">
          <span className="inline-flex items-center gap-1.5 font-sans font-medium text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            <span>{chainValid ? 'SHA-256 chain verified' : 'Chain mismatch detected'}</span>
          </span>
          <span className="text-slate-500 dark:text-[#8490A2]">
            {rawLedger.length} lines on disk
          </span>
          <span className="text-slate-500 dark:text-[#8490A2]">
            {(ledgerBytes / 1024).toFixed(1)} KB
          </span>
          <span className="text-slate-500 dark:text-[#8490A2]">Head {headHash}</span>
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-[#94A0B2] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showRawAppendLog}
            onChange={(e) => setShowRawAppendLog(e.target.checked)}
            className="rounded border-slate-300 dark:border-[#333D4B] text-amber-500 focus:ring-amber-500"
          />
          <span>Show raw append-only review events</span>
        </label>
      </div>

      {/* Collapsible Agent Deposit API Snippet */}
      {showApiSnippet && (
        <div className="bg-slate-50 dark:bg-[#0D1015] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-[#242B35] rounded-lg p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Append directly from Claude, Gemini, Codex, Devin, or local Rust CLI hooks
            </span>
            <button
              type="button"
              onClick={handleCopyCurl}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
            >
              {copiedCurl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Copy curl</span>
                </>
              )}
            </button>
          </div>
          <pre className="text-xs font-mono overflow-x-auto text-slate-800 dark:text-slate-300 leading-relaxed">
            {curlSnippet}
          </pre>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search audit ledger"
            placeholder="Search summaries, file paths, decisions, or hashes…"
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#242B35] rounded-md text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#667285] focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by agent"
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value as AgentId | 'all')}
            className="px-3 py-2 text-xs font-medium bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#242B35] rounded-md text-slate-700 dark:text-[#CBD5E1] focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="all">All Agents</option>
            {VALID_AGENTS.map((a) => (
              <option key={a} value={a}>
                {AGENT_LABELS[a]}
              </option>
            ))}
          </select>

          <div
            role="group"
            aria-label="Filter by status"
            className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#12161D] border border-slate-200 dark:border-[#1F252F] rounded-md"
          >
            {(
              [
                ['all', 'All'],
                ['running', 'Running'],
                ['waiting_review', 'Review'],
                ['done', 'Done'],
                ['failed', 'Failed'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setStatusFilter(val)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  statusFilter === val
                    ? 'bg-white dark:bg-[#1D232E] text-slate-950 dark:text-white shadow-xs dark:shadow-none'
                    : 'text-slate-600 dark:text-[#8D98A8] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* High-density Ledger Table */}
      {rows.length === 0 ? (
        <div className="bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#1F252F] rounded-lg p-10 text-center space-y-3">
          <p className="text-sm text-slate-600 dark:text-[#8D98A8]">
            No ledger entries match the current filters.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setAgentFilter('all');
                setStatusFilter('all');
              }}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-[#CBD5E1] border border-slate-200 dark:border-[#242B35] rounded-md"
            >
              Reset filters
            </button>
            <button
              type="button"
              onClick={onOpenLogDeposit}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-950 bg-amber-500 rounded-md"
            >
              Log Deposit
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#1F252F] rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1F252F] text-xs font-medium text-slate-500 dark:text-[#788496]">
                <th className="py-2.5 pl-4 pr-2 font-medium w-14">Seq</th>
                <th className="py-2.5 px-3 font-medium">Summary & Agent</th>
                <th className="py-2.5 px-3 font-medium">Project</th>
                <th className="py-2.5 px-3 font-medium">Status</th>
                <th className="py-2.5 px-3 font-medium text-right">RAM</th>
                <th className="py-2.5 px-3 font-medium text-right">Runtime</th>
                <th className="py-2.5 px-3 font-medium text-right">Latency</th>
                <th className="py-2.5 pl-3 pr-4 font-medium text-right">Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-[#1B2029] text-sm">
              {rows.map((row) => {
                const effectiveRow = isEffective(row) ? row : null;
                const status: DepositStatus = effectiveRow ? effectiveRow.effectiveStatus : row.status;
                const proj = projectMap.get(row.projectId);
                const isExpanded = expandedId === row.id;

                return (
                  <Fragment key={row.id}>
                    <tr className="hover:bg-slate-50 dark:hover:bg-[#151921] transition-colors">
                      <td className="py-3 pl-4 pr-2 font-mono text-xs tabular-nums text-slate-400 dark:text-[#667285] align-top">
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : row.id)}
                          aria-expanded={isExpanded}
                          aria-label={`Inspect deposit #${row.seq}`}
                          className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          <span>#{row.seq}</span>
                        </button>
                      </td>
                      <td className="py-3 px-3 align-top max-w-md">
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : row.id)}
                          className="text-left font-medium text-slate-900 dark:text-[#F1F5F9] hover:text-amber-600 dark:hover:text-amber-400 transition-colors leading-snug"
                        >
                          {row.summary}
                        </button>
                        <div className="mt-0.5 text-xs text-slate-500 dark:text-[#8490A2]">
                          {row.agentLabel} · {row.kind === 'review_resolution' ? 'Review resolution' : `${row.artifacts.length} artifacts`} ·{' '}
                          <span className="font-mono tabular-nums">
                            {new Date(row.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600 dark:text-[#9BA6B8] whitespace-nowrap align-top">
                        {proj?.name ?? row.projectId}
                      </td>
                      <td className="py-3 px-3 align-top">
                        <StatusIndicator status={status} compact />
                      </td>
                      <td className="py-3 px-3 font-mono text-xs tabular-nums text-right text-slate-700 dark:text-[#CBD5E1] whitespace-nowrap align-top">
                        {formatRam(row.ramMb)}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs tabular-nums text-right text-slate-700 dark:text-[#CBD5E1] whitespace-nowrap align-top">
                        {formatDuration(row.runtimeMs)}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs tabular-nums text-right text-slate-700 dark:text-[#CBD5E1] whitespace-nowrap align-top">
                        {row.latencyMs}ms
                      </td>
                      <td className="py-3 pl-3 pr-4 font-mono text-xs tabular-nums text-right text-slate-400 dark:text-[#667285] whitespace-nowrap align-top">
                        {row.hash.slice(0, 8)}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-slate-50/80 dark:bg-[#0D1015]">
                        <td colSpan={8} className="px-6 py-4 space-y-3 text-xs">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <div className="font-medium text-slate-500 dark:text-[#788496]">
                                Decision & verification proof
                              </div>
                              <p className="text-slate-800 dark:text-[#D4DCE7] leading-relaxed">
                                {row.decision || 'No additional decision notes recorded.'}
                              </p>
                              {effectiveRow?.resolutionNote && (
                                <p className="text-emerald-600 dark:text-emerald-400 pt-1">
                                  Resolution (#{effectiveRow.resolutionSeq}): {effectiveRow.resolutionNote}
                                </p>
                              )}
                            </div>

                            <div className="space-y-1">
                              <div className="font-medium text-slate-500 dark:text-[#788496]">
                                Exact artifacts
                              </div>
                              {row.artifacts.length === 0 ? (
                                <p className="text-slate-500 dark:text-[#788496]">None</p>
                              ) : (
                                <ul className="space-y-1 font-mono text-slate-700 dark:text-[#CBD5E1]">
                                  {row.artifacts.map((art) => (
                                    <li key={art} className="flex items-center gap-1.5">
                                      <FileCode2
                                        className="w-3.5 h-3.5 text-slate-400 shrink-0"
                                        aria-hidden="true"
                                      />
                                      <span>{art}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-200 dark:border-[#1E242D] flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11px] text-slate-500 dark:text-[#788496]">
                            <span>ID: {row.id}</span>
                            <span>Prev: {row.prevHash}</span>
                            <span>Hash: {row.hash}</span>
                            <span>Timestamp: {row.timestamp}</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
