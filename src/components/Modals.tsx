import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import {
  AGENT_LABELS,
  VALID_AGENTS,
  validateDepositInput,
  validateProjectInput,
} from '../lib/ledgerEngine';
import type {
  ActiveView,
  AgentId,
  DepositStatus,
  NewDepositInput,
  NewProjectInput,
  Project,
} from '../lib/types';

/* -------------------------------------------------------------------------- */
/* Log Deposit Modal                                                          */
/* -------------------------------------------------------------------------- */

interface LogDepositModalProps {
  open: boolean;
  projects: Project[];
  defaultProjectId: string | null;
  onClose: () => void;
  onSubmit: (input: NewDepositInput) => Promise<void>;
}

export function LogDepositModal({
  open,
  projects,
  defaultProjectId,
  onClose,
  onSubmit,
}: LogDepositModalProps) {
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? '');
  const [agent, setAgent] = useState<AgentId>('claude');
  const [agentLabel, setAgentLabel] = useState('Claude Opus');
  const [status, setStatus] = useState<DepositStatus>('waiting_review');
  const [summary, setSummary] = useState('');
  const [decision, setDecision] = useState('');
  const [artifactsText, setArtifactsText] = useState('');
  const [ramMb, setRamMb] = useState('164');
  const [runtimeMs, setRuntimeMs] = useState('5400');
  const [latencyMs, setLatencyMs] = useState('320');
  const [verificationRuns, setVerificationRuns] = useState('2');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setProjectId(defaultProjectId ?? projects[0]?.id ?? '');
      setErrors({});
      setSubmitError(null);
    }
  }, [open, defaultProjectId, projects]);

  if (!open) return null;

  const handleAgentChange = (next: AgentId) => {
    setAgent(next);
    const defaults: Record<AgentId, string> = {
      claude: 'Claude Opus',
      gemini: 'Gemini Pro',
      codex: 'Codex CLI',
      devin: 'Devin',
      aether: 'Aether Rust',
      custom: 'Custom Agent',
    };
    setAgentLabel(defaults[next]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const artifacts = artifactsText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const payload: NewDepositInput = {
      projectId,
      agent,
      agentLabel: agentLabel.trim() || AGENT_LABELS[agent],
      status,
      summary,
      decision: decision.trim() || undefined,
      artifacts,
      ramMb: ramMb.trim() === '' ? Number.NaN : Number(ramMb),
      runtimeMs: runtimeMs.trim() === '' ? Number.NaN : Number(runtimeMs),
      latencyMs: latencyMs.trim() === '' ? Number.NaN : Number(latencyMs),
      verificationRuns: verificationRuns.trim() ? Number(verificationRuns) : undefined,
    };

    const validation = validateDepositInput(payload);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setErrors({});
    setSubmitError(null);
    setSaving(true);
    try {
      await onSubmit(payload);
      setSummary('');
      setDecision('');
      setArtifactsText('');
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to append deposit.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="log-deposit-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[1px]"
    >
      <div className="w-full max-w-xl bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#242B35] rounded-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#1F252F] flex items-center justify-between">
          <h2
            id="log-deposit-title"
            className="font-display text-base font-semibold text-slate-950 dark:text-white"
          >
            Log Agent Deposit
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close log deposit dialog"
            className="p-1 text-slate-500 hover:text-slate-900 dark:text-[#8490A2] dark:hover:text-white rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="dep-project"
                className="block text-xs font-medium text-slate-600 dark:text-[#94A0B2] mb-1"
              >
                Project
              </label>
              <select
                id="dep-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#0D1015] border border-slate-200 dark:border-[#242B35] rounded-md text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Select a project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {errors.projectId && (
                <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                  {errors.projectId}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="dep-status"
                className="block text-xs font-medium text-slate-600 dark:text-[#94A0B2] mb-1"
              >
                Status
              </label>
              <select
                id="dep-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as DepositStatus)}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#0D1015] border border-slate-200 dark:border-[#242B35] rounded-md text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="waiting_review">Waiting on review</option>
                <option value="running">Running</option>
                <option value="done">Done</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="dep-agent"
                className="block text-xs font-medium text-slate-600 dark:text-[#94A0B2] mb-1"
              >
                Agent family
              </label>
              <select
                id="dep-agent"
                value={agent}
                onChange={(e) => handleAgentChange(e.target.value as AgentId)}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#0D1015] border border-slate-200 dark:border-[#242B35] rounded-md text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {VALID_AGENTS.map((a) => (
                  <option key={a} value={a}>
                    {AGENT_LABELS[a]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="dep-agent-label"
                className="block text-xs font-medium text-slate-600 dark:text-[#94A0B2] mb-1"
              >
                Agent instance label
              </label>
              <input
                id="dep-agent-label"
                type="text"
                value={agentLabel}
                onChange={(e) => setAgentLabel(e.target.value)}
                placeholder="e.g. Claude Opus, Aether Rust"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#0D1015] border border-slate-200 dark:border-[#242B35] rounded-md text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="dep-summary"
              className="block text-xs font-medium text-slate-600 dark:text-[#94A0B2] mb-1"
            >
              Result-first summary
            </label>
            <input
              id="dep-summary"
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What was built, fixed, or verified?"
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#0D1015] border border-slate-200 dark:border-[#242B35] rounded-md text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#5C6778] focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {errors.summary && (
              <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                {errors.summary}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="dep-decision"
              className="block text-xs font-medium text-slate-600 dark:text-[#94A0B2] mb-1"
            >
              Decision & verification notes (optional)
            </label>
            <textarea
              id="dep-decision"
              rows={2}
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
              placeholder="Key architectural trade-off or physical verification proof…"
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#0D1015] border border-slate-200 dark:border-[#242B35] rounded-md text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#5C6778] focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label
              htmlFor="dep-artifacts"
              className="block text-xs font-medium text-slate-600 dark:text-[#94A0B2] mb-1"
            >
              Exact files / artifacts (comma or newline separated)
            </label>
            <input
              id="dep-artifacts"
              type="text"
              value={artifactsText}
              onChange={(e) => setArtifactsText(e.target.value)}
              placeholder="crates/aevos-wal/src/writer.rs, tests/wal_test.rs"
              className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-[#0D1015] border border-slate-200 dark:border-[#242B35] rounded-md text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#5C6778] focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label
                htmlFor="dep-ram"
                className="block text-xs font-medium text-slate-600 dark:text-[#94A0B2] mb-1"
              >
                RAM (MB)
              </label>
              <input
                id="dep-ram"
                type="number"
                min={0}
                value={ramMb}
                onChange={(e) => setRamMb(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 dark:bg-[#0D1015] border border-slate-200 dark:border-[#242B35] rounded-md text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              {errors.ramMb && (
                <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                  {errors.ramMb}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="dep-runtime"
                className="block text-xs font-medium text-slate-600 dark:text-[#94A0B2] mb-1"
              >
                Runtime (ms)
              </label>
              <input
                id="dep-runtime"
                type="number"
                min={0}
                value={runtimeMs}
                onChange={(e) => setRuntimeMs(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 dark:bg-[#0D1015] border border-slate-200 dark:border-[#242B35] rounded-md text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              {errors.runtimeMs && (
                <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                  {errors.runtimeMs}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="dep-latency"
                className="block text-xs font-medium text-slate-600 dark:text-[#94A0B2] mb-1"
              >
                Latency (ms)
              </label>
              <input
                id="dep-latency"
                type="number"
                min={0}
                value={latencyMs}
                onChange={(e) => setLatencyMs(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 dark:bg-[#0D1015] border border-slate-200 dark:border-[#242B35] rounded-md text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              {errors.latencyMs && (
                <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                  {errors.latencyMs}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="dep-runs"
                className="block text-xs font-medium text-slate-600 dark:text-[#94A0B2] mb-1"
              >
                Verified runs
              </label>
              <input
                id="dep-runs"
                type="number"
                min={0}
                max={20}
                value={verificationRuns}
                onChange={(e) => setVerificationRuns(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 dark:bg-[#0D1015] border border-slate-200 dark:border-[#242B35] rounded-md text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {submitError && (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
              {submitError}
            </p>
          )}

          <div className="pt-3 border-t border-slate-200 dark:border-[#1F252F] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-[#CBD5E1] border border-slate-200 dark:border-[#242B35] rounded-md hover:bg-slate-50 dark:hover:bg-[#181D26]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium text-slate-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-md transition-colors"
            >
              {saving ? 'Appending…' : 'Append Deposit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* New Project Modal                                                          */
/* -------------------------------------------------------------------------- */

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: NewProjectInput) => Promise<void>;
}

const ACCENT_SWATCHES = ['#F59E0B', '#38BDF8', '#10B981', '#A78BFA', '#F43F5E', '#2DD4BF'];

export function NewProjectModal({ open, onClose, onSubmit }: NewProjectModalProps) {
  const [name, setName] = useState('');
  const [repoPath, setRepoPath] = useState('~/Worlds/');
  const [description, setDescription] = useState('');
  const [accentColor, setAccentColor] = useState(ACCENT_SWATCHES[0]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setErrors({});
      setSubmitError(null);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: NewProjectInput = { name, repoPath, description, accentColor };
    const check = validateProjectInput(payload);
    if (!check.valid) {
      setErrors(check.errors);
      return;
    }

    setErrors({});
    setSubmitError(null);
    setSaving(true);
    try {
      await onSubmit(payload);
      setName('');
      setRepoPath('~/Worlds/');
      setDescription('');
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to create project.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-project-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[1px]"
    >
      <div className="w-full max-w-md bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#242B35] rounded-lg shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#1F252F] flex items-center justify-between">
          <h2
            id="new-project-title"
            className="font-display text-base font-semibold text-slate-950 dark:text-white"
          >
            Create Project Node
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close new project dialog"
            className="p-1 text-slate-500 hover:text-slate-900 dark:text-[#8490A2] dark:hover:text-white rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4">
          <div>
            <label
              htmlFor="proj-name"
              className="block text-xs font-medium text-slate-600 dark:text-[#94A0B2] mb-1"
            >
              Project name
            </label>
            <input
              id="proj-name"
              type="text"
              value={name}
              onChange={(e) => {
                const v = e.target.value;
                setName(v);
                if (repoPath === '~/Worlds/' || repoPath.startsWith('~/Worlds/')) {
                  setRepoPath(`~/Worlds/${v.replace(/\s+/g, '')}`);
                }
              }}
              placeholder="e.g. Aether Engine"
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#0D1015] border border-slate-200 dark:border-[#242B35] rounded-md text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {errors.name && (
              <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                {errors.name}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="proj-path"
              className="block text-xs font-medium text-slate-600 dark:text-[#94A0B2] mb-1"
            >
              Local workspace path
            </label>
            <input
              id="proj-path"
              type="text"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="~/Worlds/AetherEngine"
              className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-[#0D1015] border border-slate-200 dark:border-[#242B35] rounded-md text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {errors.repoPath && (
              <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                {errors.repoPath}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="proj-desc"
              className="block text-xs font-medium text-slate-600 dark:text-[#94A0B2] mb-1"
            >
              Purpose (optional)
            </label>
            <textarea
              id="proj-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What agents build and log under this node…"
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#0D1015] border border-slate-200 dark:border-[#242B35] rounded-md text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-600 dark:text-[#94A0B2] mb-2">
              Graph hub accent
            </span>
            <div className="flex items-center gap-2.5">
              {ACCENT_SWATCHES.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setAccentColor(hex)}
                  aria-label={`Select color ${hex}`}
                  aria-pressed={accentColor === hex}
                  className={`w-6 h-6 rounded-sm transition-transform ${
                    accentColor === hex
                      ? 'ring-2 ring-offset-2 ring-amber-500 dark:ring-offset-[#111419] scale-110'
                      : 'opacity-75 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          </div>

          {submitError && (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
              {submitError}
            </p>
          )}

          <div className="pt-3 border-t border-slate-200 dark:border-[#1F252F] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-[#CBD5E1] border border-slate-200 dark:border-[#242B35] rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium text-slate-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-md"
            >
              {saving ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Command Palette Modal (⌘K)                                                 */
/* -------------------------------------------------------------------------- */

interface CommandPaletteModalProps {
  open: boolean;
  projects: Project[];
  theme: 'dark' | 'light';
  onClose: () => void;
  onSelectView: (view: ActiveView) => void;
  onSelectProject: (projectId: string | null) => void;
  onInspectProjectInGraph: (projectId: string) => void;
  onOpenLogDeposit: () => void;
  onOpenNewProject: () => void;
  onToggleTheme: () => void;
}

interface PaletteItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPaletteModal({
  open,
  projects,
  theme,
  onClose,
  onSelectView,
  onSelectProject,
  onInspectProjectInGraph,
  onOpenLogDeposit,
  onOpenNewProject,
  onToggleTheme,
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const base: PaletteItem[] = [
      {
        id: 'act-deposit',
        group: 'Actions',
        label: 'Log Agent Deposit',
        hint: 'N',
        run: onOpenLogDeposit,
      },
      {
        id: 'act-project',
        group: 'Actions',
        label: 'Create New Project Node',
        hint: 'P',
        run: onOpenNewProject,
      },
      {
        id: 'act-theme',
        group: 'Actions',
        label: theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode',
        hint: 'T',
        run: onToggleTheme,
      },
      {
        id: 'view-overview',
        group: 'Views',
        label: 'Go to Overview',
        hint: '1',
        run: () => onSelectView('overview'),
      },
      {
        id: 'view-review',
        group: 'Views',
        label: 'Go to Review Queue',
        hint: '2',
        run: () => onSelectView('review'),
      },
      {
        id: 'view-graph',
        group: 'Views',
        label: 'Go to Project Graph',
        hint: '3',
        run: () => onSelectView('graph'),
      },
      {
        id: 'view-ledger',
        group: 'Views',
        label: 'Go to Audit Ledger',
        hint: '4',
        run: () => onSelectView('ledger'),
      },
      {
        id: 'view-perf',
        group: 'Views',
        label: 'Go to Performance Telemetry',
        hint: '5',
        run: () => onSelectView('performance'),
      },
      {
        id: 'proj-all',
        group: 'Projects',
        label: 'Switch scope: All Projects',
        run: () => onSelectProject(null),
      },
      ...projects.map((p) => ({
        id: `proj-${p.id}`,
        group: 'Projects',
        label: `Switch to ${p.name}`,
        hint: p.repoPath,
        run: () => onSelectProject(p.id),
      })),
      ...projects.map((p) => ({
        id: `graph-${p.id}`,
        group: 'Graph Drilldown',
        label: `Open ${p.name} in Project Graph`,
        run: () => onInspectProjectInGraph(p.id),
      })),
    ];

    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q) ||
        (item.hint ?? '').toLowerCase().includes(q)
    );
  }, [
    projects,
    query,
    theme,
    onOpenLogDeposit,
    onOpenNewProject,
    onToggleTheme,
    onSelectView,
    onSelectProject,
    onInspectProjectInGraph,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  const execute = (item: PaletteItem) => {
    onClose();
    item.run();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] p-4 bg-black/60 backdrop-blur-[1px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#242B35] rounded-lg shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-[#1F252F] flex items-center gap-3">
          <Search className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((i) => Math.min(items.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter' && items[activeIndex]) {
                e.preventDefault();
                execute(items[activeIndex]);
              }
            }}
            placeholder="Jump to project, view, or action…"
            aria-label="Command palette search"
            className="w-full text-sm bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#667285] focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-white"
          >
            ESC
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto py-2">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-[#788496]">
              No matching commands or projects.
            </div>
          ) : (
            items.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => execute(item)}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left text-sm transition-colors ${
                  idx === activeIndex
                    ? 'bg-slate-100 dark:bg-[#1A202B] text-slate-950 dark:text-white'
                    : 'text-slate-700 dark:text-[#CBD5E1]'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className="text-[11px] font-mono text-slate-400 dark:text-[#667285] w-24 shrink-0">
                    {item.group}
                  </span>
                  <span className="truncate font-medium">{item.label}</span>
                </span>
                {item.hint && (
                  <span className="font-mono text-[11px] text-slate-400 dark:text-[#667285] truncate max-w-[140px]">
                    {item.hint}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Keyboard Shortcuts Modal (?)                                               */
/* -------------------------------------------------------------------------- */

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  if (!open) return null;

  const groups = [
    {
      title: 'Navigation',
      rows: [
        ['⌘K / Ctrl+K', 'Open Command Palette'],
        ['1 – 5', 'Switch workspace views (Overview → Performance)'],
        ['[ / ]', 'Cycle previous / next active project'],
        ['Esc', 'Close active dialog'],
      ],
    },
    {
      title: 'Actions & Triage',
      rows: [
        ['N', 'Log a new agent deposit'],
        ['P', 'Create a new project node'],
        ['T', 'Toggle Light / Dark mode'],
        ['J / K', 'Step through pending items in Review Queue'],
        ['?', 'Toggle keyboard shortcuts reference'],
      ],
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[1px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#242B35] rounded-lg shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#1F252F] flex items-center justify-between">
          <h2
            id="shortcuts-title"
            className="font-display text-base font-semibold text-slate-950 dark:text-white"
          >
            Keyboard Navigation
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts dialog"
            className="p-1 text-slate-500 hover:text-slate-900 dark:text-[#8490A2] dark:hover:text-white rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-5">
          {groups.map((group) => (
            <div key={group.title} className="space-y-2">
              <h3 className="text-xs font-medium text-slate-500 dark:text-[#788496]">
                {group.title}
              </h3>
              <div className="divide-y divide-slate-200 dark:divide-[#1F252F] border border-slate-200 dark:border-[#1F252F] rounded-md">
                {group.rows.map(([keys, desc]) => (
                  <div
                    key={keys}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-4 text-xs"
                  >
                    <span className="text-slate-700 dark:text-[#CBD5E1]">{desc}</span>
                    <kbd className="font-mono text-[11px] px-1.5 py-0.5 bg-slate-100 dark:bg-[#181D25] border border-slate-200 dark:border-[#2B3340] rounded text-slate-800 dark:text-[#E2E8F0] whitespace-nowrap">
                      {keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
