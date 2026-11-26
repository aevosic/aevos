import {
  Activity,
  Command,
  GitBranch,
  Inbox,
  Keyboard,
  LayoutGrid,
  Moon,
  Plus,
  ScrollText,
  Sun,
  X,
} from 'lucide-react';
import type { ActiveView, EffectiveDeposit, Project } from '../lib/types';

interface SidebarProps {
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  deposits: EffectiveDeposit[];
  waitingReviewCount: number;
  runningCount: number;
  theme: 'dark' | 'light';
  onSetTheme: (theme: 'dark' | 'light') => void;
  onOpenNewProject: () => void;
  onOpenCommandPalette: () => void;
  onOpenShortcuts: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  activeView,
  onSelectView,
  projects,
  selectedProjectId,
  onSelectProject,
  deposits,
  waitingReviewCount,
  runningCount,
  theme,
  onSetTheme,
  onOpenNewProject,
  onOpenCommandPalette,
  onOpenShortcuts,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const navItems: Array<{
    id: ActiveView;
    label: string;
    shortcut: string;
    icon: typeof LayoutGrid;
    count?: number;
  }> = [
    { id: 'overview', label: 'Overview', shortcut: '1', icon: LayoutGrid, count: runningCount > 0 ? runningCount : undefined },
    { id: 'review', label: 'Review Queue', shortcut: '2', icon: Inbox, count: waitingReviewCount > 0 ? waitingReviewCount : undefined },
    { id: 'graph', label: 'Project Graph', shortcut: '3', icon: GitBranch },
    { id: 'ledger', label: 'Audit Ledger', shortcut: '4', icon: ScrollText },
    { id: 'performance', label: 'Performance', shortcut: '5', icon: Activity },
  ];

  const getProjectCounts = (projectId: string) => {
    let review = 0;
    let running = 0;
    for (const d of deposits) {
      if (d.projectId !== projectId) continue;
      if (d.effectiveStatus === 'waiting_review') review += 1;
      if (d.effectiveStatus === 'running') running += 1;
    }
    return { review, running };
  };

  const handleViewClick = (view: ActiveView) => {
    onSelectView(view);
    onCloseMobile();
  };

  const handleProjectClick = (projectId: string | null) => {
    onSelectProject(projectId);
    onCloseMobile();
  };

  const content = (
    <div className="flex flex-col h-full bg-[#F4F5F7] dark:bg-[#0E1116] border-r border-slate-200 dark:border-[#1E242D] select-none">
      {/* Brand Wordmark */}
      <div className="h-14 px-5 flex items-center justify-between border-b border-slate-200 dark:border-[#1E242D] shrink-0">
        <button
          type="button"
          onClick={() => {
            onSelectProject(null);
            onSelectView('overview');
            onCloseMobile();
          }}
          className="font-display text-[17px] font-bold tracking-tight text-slate-900 dark:text-[#F1F5F9] whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
        >
          Aevos
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation drawer"
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Primary Workspace Views */}
      <nav aria-label="Primary workspace navigation" className="px-3 pt-4 pb-3 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleViewClick(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                isActive
                  ? 'bg-white dark:bg-[#181D25] text-slate-950 dark:text-white shadow-xs dark:shadow-none ring-1 ring-slate-200/80 dark:ring-[#2A313D]'
                  : 'text-slate-600 dark:text-[#94A0B2] hover:text-slate-900 dark:hover:text-[#E8ECF2] hover:bg-slate-200/50 dark:hover:bg-[#151A22]'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-400 dark:text-[#667285]'
                  }`}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                {item.count !== undefined && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      item.id === 'review'
                        ? 'text-amber-600 dark:text-amber-400 font-semibold'
                        : 'text-sky-600 dark:text-sky-400'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
                <span className="font-mono text-[11px] text-slate-400 dark:text-[#556070]">
                  {item.shortcut}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      {/* Active Projects Section */}
      <div className="px-3 pt-3 border-t border-slate-200 dark:border-[#1E242D] flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-3 mb-2">
          <span className="text-xs font-medium text-slate-500 dark:text-[#788496]">
            Projects
          </span>
          <button
            type="button"
            onClick={() => {
              onOpenNewProject();
              onCloseMobile();
            }}
            aria-label="Create new project"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-[#94A0B2] hover:text-amber-600 dark:hover:text-amber-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded px-1 py-0.5"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>New</span>
          </button>
        </div>

        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => handleProjectClick(null)}
            className={`w-full flex items-center justify-between px-3 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
              selectedProjectId === null
                ? 'bg-slate-200/70 dark:bg-[#171C24] text-slate-950 dark:text-white font-medium'
                : 'text-slate-600 dark:text-[#94A0B2] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/40 dark:hover:bg-[#141920]'
            }`}
          >
            <span className="truncate">All Projects</span>
            <span className="font-mono text-xs tabular-nums text-slate-400 dark:text-[#667285]">
              {deposits.length}
            </span>
          </button>

          {projects.map((project) => {
            const isSelected = selectedProjectId === project.id;
            const counts = getProjectCounts(project.id);
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => handleProjectClick(project.id)}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                  isSelected
                    ? 'bg-slate-200/70 dark:bg-[#171C24] text-slate-950 dark:text-white font-medium'
                    : 'text-slate-600 dark:text-[#94A0B2] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/40 dark:hover:bg-[#141920]'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-2 h-2 rounded-xs shrink-0"
                    style={{ backgroundColor: project.accentColor }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{project.name}</span>
                </span>
                <span className="flex items-center gap-2 font-mono text-xs tabular-nums shrink-0">
                  {counts.review > 0 && (
                    <span className="text-amber-600 dark:text-amber-400" title="Waiting on review">
                      {counts.review}r
                    </span>
                  )}
                  {counts.running > 0 && (
                    <span className="text-sky-600 dark:text-sky-400" title="Currently running">
                      {counts.running}a
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Keyboard & Theme Controls */}
      <div className="p-3 border-t border-slate-200 dark:border-[#1E242D] space-y-2 shrink-0">
        <div
          role="group"
          aria-label="Sidebar theme switch"
          className="grid grid-cols-2 gap-1 p-0.5 bg-slate-200/70 dark:bg-[#141820] border border-slate-200 dark:border-[#242B35] rounded-md"
        >
          <button
            type="button"
            onClick={() => onSetTheme('light')}
            aria-pressed={theme === 'light'}
            className={`inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
              theme === 'light'
                ? 'bg-white text-slate-950 shadow-xs'
                : 'text-slate-600 dark:text-[#8490A2] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sun className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Light</span>
          </button>
          <button
            type="button"
            onClick={() => onSetTheme('dark')}
            aria-pressed={theme === 'dark'}
            className={`inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
              theme === 'dark'
                ? 'bg-[#1D232E] text-white'
                : 'text-slate-600 dark:text-[#8490A2] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Moon className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Dark</span>
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="flex-1 flex items-center justify-between px-2.5 py-1.5 text-xs text-slate-600 dark:text-[#94A0B2] bg-white dark:bg-[#141820] border border-slate-200 dark:border-[#242B35] rounded-md hover:border-slate-300 dark:hover:border-[#343E4D] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <span className="flex items-center gap-1.5">
              <Command className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Switch</span>
            </span>
            <span className="font-mono text-[11px] text-slate-400 dark:text-[#667285]">⌘K</span>
          </button>

          <button
            type="button"
            onClick={onOpenShortcuts}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            className="p-2 text-slate-500 hover:text-slate-900 dark:text-[#8D98A8] dark:hover:text-white bg-white dark:bg-[#141820] border border-slate-200 dark:border-[#242B35] rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <Keyboard className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">
        {content}
      </aside>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-64 max-w-[82vw] h-full z-10">{content}</aside>
        </div>
      )}
    </>
  );
}
