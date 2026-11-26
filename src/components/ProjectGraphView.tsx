import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  FileCode2,
  Maximize2,
  Plus,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  buildProjectGraph,
  formatDuration,
  formatRam,
} from '../lib/ledgerEngine';
import type {
  EffectiveDeposit,
  FileCollision,
  GraphNode,
  Project,
} from '../lib/types';
import { StatusIndicator } from './StatusIndicator';

interface ProjectGraphViewProps {
  projects: Project[];
  deposits: EffectiveDeposit[];
  collisions: FileCollision[];
  focusedProjectId: string | null;
  onFocusProject: (projectId: string | null) => void;
  onOpenNewProject: () => void;
  onOpenLogDepositForProject: (projectId: string) => void;
  onSelectReviewDeposit: (depositId: string) => void;
}

const STATUS_STROKE: Record<string, string> = {
  running: '#38BDF8',
  waiting_review: '#F59E0B',
  done: '#10B981',
  failed: '#EF4444',
};

export function ProjectGraphView({
  projects,
  deposits,
  collisions,
  focusedProjectId,
  onFocusProject,
  onOpenNewProject,
  onOpenLogDepositForProject,
  onSelectReviewDeposit,
}: ProjectGraphViewProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const draggingRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null
  );

  const graph = useMemo(
    () => buildProjectGraph(projects, deposits, collisions, focusedProjectId),
    [projects, deposits, collisions, focusedProjectId]
  );

  const nodeMap = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const selectedNode: GraphNode | null = selectedNodeId
    ? nodeMap.get(selectedNodeId) ?? null
    : null;

  const selectedDeposit = useMemo(() => {
    if (!selectedNode?.depositId) return null;
    return deposits.find((d) => d.id === selectedNode.depositId) ?? null;
  }, [selectedNode, deposits]);

  const selectedProject = useMemo(() => {
    const pid = selectedNode?.projectId ?? focusedProjectId;
    return pid ? projects.find((p) => p.id === pid) ?? null : null;
  }, [selectedNode, focusedProjectId, projects]);

  const artifactTouches = useMemo(() => {
    if (!selectedNode?.artifactPath) return [];
    return deposits.filter(
      (d) =>
        d.projectId === selectedNode.projectId &&
        d.artifacts.includes(selectedNode.artifactPath!)
    );
  }, [selectedNode, deposits]);

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleFocusSwitch = (pid: string | null) => {
    onFocusProject(pid);
    setSelectedNodeId(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleNodeClick = (node: GraphNode) => {
    if (node.kind === 'project' && !focusedProjectId) {
      handleFocusSwitch(node.projectId);
      return;
    }
    setSelectedNodeId(node.id);
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if ((e.target as HTMLElement).closest('[data-graph-node="true"]')) return;
    draggingRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pan.x,
      origY: pan.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    const dx = (e.clientX - draggingRef.current.startX) / zoom;
    const dy = (e.clientY - draggingRef.current.startY) / zoom;
    setPan({ x: draggingRef.current.origX + dx, y: draggingRef.current.origY + dy });
  };

  const handlePointerUp = () => {
    draggingRef.current = null;
  };

  const focusedProject = focusedProjectId
    ? projects.find((p) => p.id === focusedProjectId) ?? null
    : null;

  return (
    <div className="space-y-5">
      {/* Header & Project Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-950 dark:text-[#F8FAFC]">
            {focusedProject ? `${focusedProject.name} Graph` : 'Project Graph'}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-[#8D98A8]">
            {focusedProject
              ? `Inspect every agent run, decision, and file artifact attached to ${focusedProject.name}.`
              : 'Click any project hub to drill into its agent runs, decisions, and artifact topology.'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {focusedProject && (
            <button
              type="button"
              onClick={() => onOpenLogDepositForProject(focusedProject.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Deposit to {focusedProject.name}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenNewProject}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-[#CBD5E1] bg-white dark:bg-[#141820] border border-slate-200 dark:border-[#242B35] rounded-md hover:border-slate-300 dark:hover:border-[#364050] transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* Project Scope Bar + Zoom Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Project graph scope"
          className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#12161D] border border-slate-200 dark:border-[#1F252F] rounded-lg overflow-x-auto max-w-full"
        >
          <button
            type="button"
            role="tab"
            aria-selected={focusedProjectId === null}
            onClick={() => handleFocusSwitch(null)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              focusedProjectId === null
                ? 'bg-white dark:bg-[#1D232E] text-slate-950 dark:text-white shadow-xs dark:shadow-none'
                : 'text-slate-600 dark:text-[#8D98A8] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All Projects
          </button>
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={focusedProjectId === p.id}
              onClick={() => handleFocusSwitch(p.id)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                focusedProjectId === p.id
                  ? 'bg-white dark:bg-[#1D232E] text-slate-950 dark:text-white shadow-xs dark:shadow-none'
                  : 'text-slate-600 dark:text-[#8D98A8] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span
                className="w-2 h-2 rounded-xs shrink-0"
                style={{ backgroundColor: p.accentColor }}
                aria-hidden="true"
              />
              <span>{p.name}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.65, Number((z - 0.15).toFixed(2))))}
            aria-label="Zoom out graph"
            className="p-2 text-slate-600 dark:text-[#94A0B2] bg-white dark:bg-[#141820] border border-slate-200 dark:border-[#242B35] rounded-md hover:text-slate-900 dark:hover:text-white"
          >
            <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-[#8490A2] w-11 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.6, Number((z + 0.15).toFixed(2))))}
            aria-label="Zoom in graph"
            className="p-2 text-slate-600 dark:text-[#94A0B2] bg-white dark:bg-[#141820] border border-slate-200 dark:border-[#242B35] rounded-md hover:text-slate-900 dark:hover:text-white"
          >
            <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleResetView}
            aria-label="Reset graph viewport"
            className="p-2 text-slate-600 dark:text-[#94A0B2] bg-white dark:bg-[#141820] border border-slate-200 dark:border-[#242B35] rounded-md hover:text-slate-900 dark:hover:text-white"
          >
            <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Main Graph Canvas + Right Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <div className="xl:col-span-8 bg-white dark:bg-[#0E1116] border border-slate-200 dark:border-[#1F252F] rounded-lg relative overflow-hidden min-h-[540px]">
          <svg
            data-testid="project-graph-svg"
            viewBox={`0 0 ${graph.width} ${graph.height}`}
            className="w-full h-[560px] cursor-grab active:cursor-grabbing select-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <defs>
              <pattern
                id="aevos-grid"
                width="32"
                height="32"
                patternUnits="userSpaceOnUse"
              >
                <circle
                  cx="1"
                  cy="1"
                  r="1"
                  className="fill-slate-300/60 dark:fill-[#242C38]"
                />
              </pattern>
            </defs>

            <rect width="100%" height="100%" fill="url(#aevos-grid)" />

            <g
              transform={`translate(${graph.width / 2}, ${graph.height / 2}) scale(${zoom}) translate(${-graph.width / 2 + pan.x}, ${-graph.height / 2 + pan.y})`}
            >
              {/* Edges */}
              {graph.edges.map((edge) => {
                const from = nodeMap.get(edge.from);
                const to = nodeMap.get(edge.to);
                if (!from || !to) return null;

                const midX = (from.x + to.x) / 2;
                const pathD = focusedProjectId
                  ? `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`
                  : `M ${from.x} ${from.y} L ${to.x} ${to.y}`;

                const isHighlighted =
                  selectedNodeId &&
                  (edge.from === selectedNodeId || edge.to === selectedNodeId);

                return (
                  <path
                    key={edge.id}
                    d={pathD}
                    fill="none"
                    stroke={
                      edge.kind === 'collision'
                        ? '#EF4444'
                        : isHighlighted
                        ? '#F59E0B'
                        : 'currentColor'
                    }
                    className={
                      edge.kind === 'collision'
                        ? 'opacity-85'
                        : isHighlighted
                        ? 'opacity-100'
                        : 'text-slate-300 dark:text-[#2A3342]'
                    }
                    strokeWidth={isHighlighted || edge.kind === 'collision' ? 2 : 1.25}
                    strokeDasharray={edge.kind === 'collision' ? '5 4' : undefined}
                  />
                );
              })}

              {/* Nodes */}
              {graph.nodes.map((node) => {
                const isSelected = node.id === selectedNodeId;
                const boxW =
                  node.kind === 'project'
                    ? 204
                    : node.kind === 'artifact'
                    ? 248
                    : focusedProjectId
                    ? 294
                    : 168;
                const boxH = node.kind === 'project' ? 64 : 56;
                const borderStroke = node.collision
                  ? '#EF4444'
                  : isSelected
                  ? '#F59E0B'
                  : node.kind === 'project'
                  ? node.accentColor ?? '#F59E0B'
                  : node.status
                  ? STATUS_STROKE[node.status]
                  : '#475569';

                const maxLabelChars = focusedProjectId ? 30 : 18;
                const maxSubChars = focusedProjectId ? 34 : 21;
                const displayLabel =
                  node.label.length > maxLabelChars
                    ? `${node.label.slice(0, maxLabelChars - 1)}…`
                    : node.label;
                const displaySub =
                  node.sublabel.length > maxSubChars
                    ? `${node.sublabel.slice(0, maxSubChars - 1)}…`
                    : node.sublabel;

                return (
                  <g
                    key={node.id}
                    data-graph-node="true"
                    transform={`translate(${node.x - boxW / 2}, ${node.y - boxH / 2})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${node.kind}: ${node.label} (${node.sublabel})`}
                    onClick={() => handleNodeClick(node)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleNodeClick(node);
                      }
                    }}
                    className="cursor-pointer focus:outline-none"
                  >
                    <rect
                      width={boxW}
                      height={boxH}
                      rx={8}
                      className={
                        isSelected
                          ? 'fill-slate-100 dark:fill-[#1A202B]'
                          : 'fill-white dark:fill-[#13171E]'
                      }
                      stroke={borderStroke}
                      strokeWidth={isSelected || node.kind === 'project' ? 1.75 : 1.15}
                    />
                    <rect
                      x={13}
                      y={node.kind === 'project' ? 17 : 14}
                      width={6}
                      height={6}
                      rx={1.5}
                      fill={borderStroke}
                    />
                    <text
                      x={27}
                      y={node.kind === 'project' ? 24 : 21}
                      className="fill-slate-900 dark:fill-[#F1F5F9]"
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '12px',
                        fontWeight: 600,
                        letterSpacing: '0.01em',
                        wordSpacing: '0.08em',
                      }}
                    >
                      {displayLabel}
                    </text>
                    <text
                      x={13}
                      y={node.kind === 'project' ? 46 : 41}
                      className="fill-slate-500 dark:fill-[#8490A2]"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10.5px',
                      }}
                    >
                      {displaySub}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Compact Legend */}
          <div className="absolute bottom-3 left-3 px-3 py-1.5 bg-white/90 dark:bg-[#111419]/90 border border-slate-200 dark:border-[#242B35] rounded-md flex items-center flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-[#8D98A8] pointer-events-none">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-sky-400" />
              Running
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-amber-400" />
              Waiting Review
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-emerald-500" />
              Done
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-rose-500" />
              Failed / Overlap
            </span>
          </div>
        </div>

        {/* Right Inspector Panel */}
        <div className="xl:col-span-4 bg-white dark:bg-[#111419] border border-slate-200 dark:border-[#1F252F] rounded-lg p-5 flex flex-col justify-between gap-5">
          {selectedDeposit ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-[#788496]">
                  Deposit #{selectedDeposit.seq} · {selectedDeposit.agentLabel}
                </span>
                <StatusIndicator status={selectedDeposit.effectiveStatus} />
              </div>

              <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white leading-snug">
                {selectedDeposit.summary}
              </h2>

              {selectedDeposit.decision && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-slate-500 dark:text-[#788496]">
                    Logged decision
                  </div>
                  <p className="text-sm text-slate-700 dark:text-[#CBD5E1] leading-relaxed">
                    {selectedDeposit.decision}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-200 dark:border-[#1F252F] font-mono tabular-nums">
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-[#788496] font-sans">RAM</div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5">
                    {formatRam(selectedDeposit.ramMb)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-[#788496] font-sans">
                    Runtime
                  </div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5">
                    {formatDuration(selectedDeposit.runtimeMs)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-[#788496] font-sans">
                    Latency
                  </div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5">
                    {selectedDeposit.latencyMs}ms
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-[#1F252F]">
                <div className="text-xs font-medium text-slate-500 dark:text-[#788496]">
                  Artifacts ({selectedDeposit.artifacts.length})
                </div>
                <ul className="space-y-1 font-mono text-xs text-slate-700 dark:text-[#CBD5E1]">
                  {selectedDeposit.artifacts.map((art) => (
                    <li key={art} className="flex items-center gap-1.5 truncate">
                      <FileCode2 className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                      <span className="truncate">{art}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {selectedDeposit.effectiveStatus === 'waiting_review' && (
                <button
                  type="button"
                  onClick={() => onSelectReviewDeposit(selectedDeposit.id)}
                  className="w-full py-2 text-xs font-medium text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors"
                >
                  Open in Review Queue
                </button>
              )}
            </div>
          ) : selectedNode?.kind === 'artifact' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-[#788496]">
                  Artifact Node
                </span>
                {selectedNode.collision && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                    <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                    Multi-agent overlap
                  </span>
                )}
              </div>

              <div className="font-mono text-sm font-semibold text-slate-950 dark:text-white break-all">
                {selectedNode.artifactPath}
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-[#1F252F]">
                <div className="text-xs font-medium text-slate-500 dark:text-[#788496]">
                  Touched by {artifactTouches.length} deposit{artifactTouches.length === 1 ? '' : 's'}
                </div>
                <div className="divide-y divide-slate-200 dark:divide-[#1F252F]">
                  {artifactTouches.map((dep) => (
                    <div key={dep.id} className="py-2.5 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-900 dark:text-white">
                          {dep.agentLabel} · #{dep.seq}
                        </span>
                        <StatusIndicator status={dep.effectiveStatus} compact />
                      </div>
                      <p className="text-xs text-slate-600 dark:text-[#8D98A8]">{dep.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : selectedProject ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-xs"
                  style={{ backgroundColor: selectedProject.accentColor }}
                />
                <span className="text-xs font-medium text-slate-500 dark:text-[#788496]">
                  Project Node
                </span>
              </div>
              <h2 className="font-display text-lg font-semibold text-slate-950 dark:text-white">
                {selectedProject.name}
              </h2>
              <p className="text-sm text-slate-600 dark:text-[#8D98A8] leading-relaxed">
                {selectedProject.description || 'Local-first project workspace.'}
              </p>
              <div className="font-mono text-xs text-slate-500 dark:text-[#788496] pt-2 border-t border-slate-200 dark:border-[#1F252F]">
                Path: {selectedProject.repoPath}
              </div>
              <div className="text-xs text-slate-600 dark:text-[#94A0B2]">
                Select any agent deposit or file artifact node on the canvas to inspect its decision log, exact paths, and resource telemetry.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Topology Inspector
              </h2>
              <p className="text-sm text-slate-600 dark:text-[#8D98A8] leading-relaxed">
                Click any project hub to drill into its 3-column execution topology (Project → Agent Deposits & Decisions → Produced Artifacts), or click a deposit node to inspect its proof and telemetry.
              </p>
              <div className="pt-2 border-t border-slate-200 dark:border-[#1F252F] text-xs font-mono tabular-nums text-slate-500 dark:text-[#788496] space-y-1">
                <div>{projects.length} project hubs</div>
                <div>{deposits.length} effective deposits</div>
                <div>{collisions.length} cross-agent file overlaps</div>
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 dark:border-[#1F252F] text-xs text-slate-500 dark:text-[#788496]">
            Drag canvas to pan · Click nodes to inspect
          </div>
        </div>
      </div>
    </div>
  );
}
