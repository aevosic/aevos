import { useCallback, useEffect, useMemo, useState } from 'react';
import { Menu, Moon, Plus, Radio, Sun } from 'lucide-react';
import { AuditLedgerView } from './components/AuditLedgerView';
import {
  CommandPaletteModal,
  LogDepositModal,
  NewProjectModal,
  ShortcutsModal,
} from './components/Modals';
import { OverviewView } from './components/OverviewView';
import { PerformanceView } from './components/PerformanceView';
import { ProjectGraphView } from './components/ProjectGraphView';
import { ReviewQueueView } from './components/ReviewQueueView';
import { Sidebar } from './components/Sidebar';
import {
  computeMetrics,
  detectFileCollisions,
  resolveEffectiveDeposits,
} from './lib/ledgerEngine';
import type {
  ActiveView,
  DepositEntry,
  NewDepositInput,
  NewProjectInput,
  Project,
} from './lib/types';

interface VerificationState {
  valid: boolean;
  entryCount: number;
  headHash: string;
  ledgerBytes: number;
  brokenAtSeq: number | null;
}

const VIEW_LABELS: Record<ActiveView, string> = {
  overview: 'Overview',
  review: 'Review Queue',
  graph: 'Project Graph',
  ledger: 'Audit Ledger',
  performance: 'Performance',
};

const VIEW_ORDER: ActiveView[] = ['overview', 'review', 'graph', 'ledger', 'performance'];

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [rawLedger, setRawLedger] = useState<DepositEntry[]>([]);
  const [verification, setVerification] = useState<VerificationState>({
    valid: true,
    entryCount: 0,
    headHash: 'GENESIS',
    ledgerBytes: 0,
    brokenAtSeq: null,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [streamLive, setStreamLive] = useState(false);

  const [activeView, setActiveView] = useState<ActiveView>('overview');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [reviewFocusDepositId, setReviewFocusDepositId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = window.localStorage.getItem('aevos-theme');
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [logDepositOpen, setLogDepositOpen] = useState(false);
  const [depositModalProjectId, setDepositModalProjectId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Sync Tailwind v4 .dark class on <html> and persist preference
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      window.localStorage.setItem('aevos-theme', theme);
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }, [theme]);

  // Initial load from local-first disk ledger API
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error(`Failed to load ledger (${res.status})`);
      const data = await res.json();
      setProjects(Array.isArray(data.projects) ? data.projects : []);
      setRawLedger(Array.isArray(data.ledger) ? data.ledger : []);
      if (data.verification) {
        setVerification(data.verification);
      }
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to reach local ledger server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Live SSE real-time stream subscription
  useEffect(() => {
    const source = new EventSource('/api/stream');

    source.addEventListener('connected', () => {
      setStreamLive(true);
    });

    source.addEventListener('deposit_appended', (ev) => {
      try {
        const parsed = JSON.parse((ev as MessageEvent).data);
        if (parsed.entry) {
          setRawLedger((prev) =>
            prev.some((e) => e.id === parsed.entry.id) ? prev : [...prev, parsed.entry]
          );
        }
        if (parsed.verification) {
          setVerification(parsed.verification);
        }
      } catch {
        // Ignore malformed SSE payload
      }
    });

    source.addEventListener('project_created', (ev) => {
      try {
        const project = JSON.parse((ev as MessageEvent).data) as Project;
        setProjects((prev) =>
          prev.some((p) => p.id === project.id) ? prev : [...prev, project]
        );
      } catch {
        // Ignore malformed SSE payload
      }
    });

    source.onerror = () => {
      setStreamLive(false);
    };

    return () => {
      source.close();
    };
  }, []);

  // Keyboard-first navigation shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }

      if (e.key === 'Escape') {
        setPaletteOpen(false);
        setLogDepositOpen(false);
        setNewProjectOpen(false);
        setShortcutsOpen(false);
        setMobileNavOpen(false);
        return;
      }

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditing =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable;
      if (isEditing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (paletteOpen || logDepositOpen || newProjectOpen || shortcutsOpen) return;

      if (e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        setActiveView(VIEW_ORDER[Number(e.key) - 1]);
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setDepositModalProjectId(selectedProjectId);
        setLogDepositOpen(true);
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        setNewProjectOpen(true);
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
      } else if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
      } else if (e.key === '[' || e.key === ']') {
        e.preventDefault();
        const scopeIds: Array<string | null> = [null, ...projects.map((p) => p.id)];
        const currentIdx = scopeIds.indexOf(selectedProjectId);
        const delta = e.key === ']' ? 1 : -1;
        const nextIdx = (currentIdx + delta + scopeIds.length) % scopeIds.length;
        setSelectedProjectId(scopeIds[nextIdx]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    projects,
    selectedProjectId,
    paletteOpen,
    logDepositOpen,
    newProjectOpen,
    shortcutsOpen,
  ]);

  // Derived domain state
  const allEffectiveDeposits = useMemo(
    () => resolveEffectiveDeposits(rawLedger),
    [rawLedger]
  );

  const scopedDeposits = useMemo(
    () =>
      selectedProjectId
        ? allEffectiveDeposits.filter((d) => d.projectId === selectedProjectId)
        : allEffectiveDeposits,
    [allEffectiveDeposits, selectedProjectId]
  );

  const allMetrics = useMemo(
    () => computeMetrics(allEffectiveDeposits),
    [allEffectiveDeposits]
  );

  const scopedMetrics = useMemo(() => computeMetrics(scopedDeposits), [scopedDeposits]);

  const allCollisions = useMemo(
    () => detectFileCollisions(allEffectiveDeposits, projects),
    [allEffectiveDeposits, projects]
  );

  const scopedCollisions = useMemo(
    () =>
      selectedProjectId
        ? allCollisions.filter((c) => c.projectId === selectedProjectId)
        : allCollisions,
    [allCollisions, selectedProjectId]
  );

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  // Mutations
  const handleCreateDeposit = async (input: NewDepositInput) => {
    const res = await fetch('/api/deposits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to append deposit.');
    }
    if (data.entry) {
      setRawLedger((prev) =>
        prev.some((e) => e.id === data.entry.id) ? prev : [...prev, data.entry]
      );
    }
    if (data.verification) {
      setVerification(data.verification);
    }
  };

  const handleCreateProject = async (input: NewProjectInput) => {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create project.');
    }
    if (data.project) {
      setProjects((prev) =>
        prev.some((p) => p.id === data.project.id) ? prev : [...prev, data.project]
      );
      setSelectedProjectId(data.project.id);
    }
  };

  const handleResolveDeposit = async (
    depositId: string,
    status: 'done' | 'failed',
    note: string
  ) => {
    const res = await fetch(`/api/deposits/${encodeURIComponent(depositId)}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, note }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to record review resolution.');
    }
    if (data.entry) {
      setRawLedger((prev) =>
        prev.some((e) => e.id === data.entry.id) ? prev : [...prev, data.entry]
      );
    }
    if (data.verification) {
      setVerification(data.verification);
    }
  };

  const handleInspectInGraph = (projectId: string) => {
    setSelectedProjectId(projectId);
    setActiveView('graph');
  };

  const handleSelectReviewDeposit = (depositId: string) => {
    setReviewFocusDepositId(depositId);
    setActiveView('review');
  };

  const openLogDeposit = (projectId?: string | null) => {
    setDepositModalProjectId(projectId ?? selectedProjectId);
    setLogDepositOpen(true);
  };

  return (
    <div className="min-h-screen flex bg-[#FAFAFB] dark:bg-[#0B0D10] text-[#11151C] dark:text-[#E8ECF2]">
      <Sidebar
        activeView={activeView}
        onSelectView={setActiveView}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
        deposits={allEffectiveDeposits}
        waitingReviewCount={allMetrics.waitingReviewCount}
        runningCount={allMetrics.runningCount}
        theme={theme}
        onSetTheme={setTheme}
        onOpenNewProject={() => setNewProjectOpen(true)}
        onOpenCommandPalette={() => setPaletteOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar — Clean SaaS Contextual Breadcrumb + Live Telemetry Stream + Primary CTA */}
        <header className="h-14 sticky top-0 z-30 bg-[#FAFAFB]/90 dark:bg-[#0B0D10]/90 backdrop-blur-sm border-b border-slate-200 dark:border-[#1E242D] px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-1.5 text-slate-600 dark:text-[#94A0B2] hover:text-slate-900 dark:hover:text-white rounded"
            >
              <Menu className="w-5 h-5" />
            </button>

            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-2 text-sm min-w-0 truncate"
            >
              <span className="font-medium text-slate-500 dark:text-[#788496] whitespace-nowrap">
                {VIEW_LABELS[activeView]}
              </span>
              {selectedProject && (
                <>
                  <span className="text-slate-300 dark:text-[#333D4B]" aria-hidden="true">
                    /
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white truncate">
                    {selectedProject.name}
                  </span>
                </>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {streamLive && (
              <span
                className="hidden md:inline-flex items-center gap-1.5 text-xs font-mono text-emerald-600 dark:text-emerald-400 whitespace-nowrap"
                title="Real-time local SSE stream connected"
              >
                <Radio className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Live stream</span>
              </span>
            )}
            <div
              role="group"
              aria-label="Theme mode"
              className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-[#141820] border border-slate-200 dark:border-[#242B35] rounded-md shrink-0"
            >
              <button
                type="button"
                onClick={() => setTheme('light')}
                aria-pressed={theme === 'light'}
                className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  theme === 'light'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-500 dark:text-[#8490A2] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Sun className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Light</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                aria-pressed={theme === 'dark'}
                className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  theme === 'dark'
                    ? 'bg-[#1D232E] text-white'
                    : 'text-slate-500 dark:text-[#8490A2] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Moon className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Dark</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => openLogDeposit()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0B0D10]"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Log Deposit</span>
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 w-full max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-7">
          {loading ? (
            <div className="space-y-6 animate-pulse" aria-busy="true">
              <div className="h-8 w-56 bg-slate-200 dark:bg-[#171C24] rounded" />
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-28 bg-slate-200/70 dark:bg-[#141820] rounded-lg"
                  />
                ))}
              </div>
              <div className="h-72 bg-slate-200/70 dark:bg-[#141820] rounded-lg" />
            </div>
          ) : loadError ? (
            <div
              role="alert"
              className="bg-white dark:bg-[#111419] border border-rose-200 dark:border-rose-500/30 rounded-lg p-6 space-y-3"
            >
              <h2 className="font-display text-base font-semibold text-rose-700 dark:text-rose-400">
                Unable to load local audit ledger
              </h2>
              <p className="text-sm text-slate-600 dark:text-[#8D98A8]">{loadError}</p>
              <button
                type="button"
                onClick={fetchState}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-950 bg-amber-500 rounded-md"
              >
                Retry connection
              </button>
            </div>
          ) : (
            <>
              {activeView === 'overview' && (
                <OverviewView
                  metrics={scopedMetrics}
                  deposits={scopedDeposits}
                  projects={projects}
                  collisions={scopedCollisions}
                  selectedProject={selectedProject}
                  chainValid={verification.valid}
                  headHash={verification.headHash}
                  onSelectView={setActiveView}
                  onInspectInGraph={handleInspectInGraph}
                  onSelectReviewDeposit={handleSelectReviewDeposit}
                  onCompleteRunning={(depositId) =>
                    handleResolveDeposit(depositId, 'done', 'Marked completed from live monitor.')
                  }
                  onOpenLogDeposit={() => openLogDeposit()}
                />
              )}

              {activeView === 'review' && (
                <ReviewQueueView
                  deposits={scopedDeposits}
                  projects={projects}
                  collisions={allCollisions}
                  initialSelectedId={reviewFocusDepositId}
                  onResolveDeposit={handleResolveDeposit}
                  onInspectInGraph={handleInspectInGraph}
                  onOpenLogDeposit={() => openLogDeposit()}
                />
              )}

              {activeView === 'graph' && (
                <ProjectGraphView
                  projects={projects}
                  deposits={allEffectiveDeposits}
                  collisions={allCollisions}
                  focusedProjectId={selectedProjectId}
                  onFocusProject={setSelectedProjectId}
                  onOpenNewProject={() => setNewProjectOpen(true)}
                  onOpenLogDepositForProject={(pid) => openLogDeposit(pid)}
                  onSelectReviewDeposit={handleSelectReviewDeposit}
                />
              )}

              {activeView === 'ledger' && (
                <AuditLedgerView
                  rawLedger={rawLedger}
                  effectiveDeposits={allEffectiveDeposits}
                  projects={projects}
                  selectedProjectId={selectedProjectId}
                  chainValid={verification.valid}
                  headHash={verification.headHash}
                  ledgerBytes={verification.ledgerBytes}
                  onOpenLogDeposit={() => openLogDeposit()}
                />
              )}

              {activeView === 'performance' && (
                <PerformanceView
                  metrics={scopedMetrics}
                  deposits={scopedDeposits}
                  projects={projects}
                  selectedProject={selectedProject}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Dialogs */}
      <LogDepositModal
        open={logDepositOpen}
        projects={projects}
        defaultProjectId={depositModalProjectId}
        onClose={() => setLogDepositOpen(false)}
        onSubmit={handleCreateDeposit}
      />

      <NewProjectModal
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onSubmit={handleCreateProject}
      />

      <CommandPaletteModal
        open={paletteOpen}
        projects={projects}
        theme={theme}
        onClose={() => setPaletteOpen(false)}
        onSelectView={setActiveView}
        onSelectProject={setSelectedProjectId}
        onInspectProjectInGraph={handleInspectInGraph}
        onOpenLogDeposit={() => openLogDeposit()}
        onOpenNewProject={() => setNewProjectOpen(true)}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
      />

      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
