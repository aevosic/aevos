import type {
  AgentId,
  AgentPerformanceRow,
  DashboardMetrics,
  DepositEntry,
  DepositStatus,
  EffectiveDeposit,
  FileCollision,
  GraphEdge,
  GraphNode,
  NewDepositInput,
  NewProjectInput,
  Project,
  ProjectGraphData,
  TelemetryBucket,
  ValidationResult,
} from './types';

export const AGENT_LABELS: Record<AgentId, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
  codex: 'Codex',
  devin: 'Devin',
  aether: 'Aether',
  custom: 'Custom Agent',
};

export const VALID_AGENTS: readonly AgentId[] = [
  'claude',
  'gemini',
  'codex',
  'devin',
  'aether',
  'custom',
];

export const VALID_STATUSES: readonly DepositStatus[] = [
  'running',
  'done',
  'failed',
  'waiting_review',
];

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

/**
 * Folds an append-only ledger into effective task deposits.
 * Review resolution entries remain in the raw audit log for full immutability,
 * while updating the effectiveStatus of the parent deposit they resolve.
 */
export function resolveEffectiveDeposits(entries: DepositEntry[]): EffectiveDeposit[] {
  const ordered = [...entries].sort((a, b) => a.seq - b.seq);
  const byId = new Map<string, EffectiveDeposit>();
  const resultOrder: string[] = [];

  for (const entry of ordered) {
    if (entry.kind === 'deposit') {
      byId.set(entry.id, {
        ...entry,
        effectiveStatus: entry.status,
      });
      resultOrder.push(entry.id);
    } else if (entry.kind === 'review_resolution' && entry.parentDepositId) {
      const parent = byId.get(entry.parentDepositId);
      if (parent) {
        parent.effectiveStatus = entry.status;
        parent.resolvedAt = entry.timestamp;
        parent.resolutionNote = entry.decision || entry.summary;
        parent.resolutionSeq = entry.seq;
      }
    }
  }

  return resultOrder
    .map((id) => byId.get(id)!)
    .sort((a, b) => b.seq - a.seq);
}

/**
 * Detects file collisions where 2+ distinct agents touched the same file path
 * within the same project. Flags as "active" when any touching run is currently
 * running or waiting on director review.
 */
export function detectFileCollisions(
  deposits: EffectiveDeposit[],
  projects: Project[]
): FileCollision[] {
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const buckets = new Map<
    string,
    {
      projectId: string;
      artifactPath: string;
      agents: Set<string>;
      depositIds: string[];
      hasActive: boolean;
      lastTouchedAt: string;
    }
  >();

  for (const dep of deposits) {
    for (const rawPath of dep.artifacts) {
      const artifactPath = rawPath.trim();
      if (!artifactPath) continue;
      const key = `${dep.projectId}::${artifactPath}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          projectId: dep.projectId,
          artifactPath,
          agents: new Set<string>(),
          depositIds: [],
          hasActive: false,
          lastTouchedAt: dep.timestamp,
        };
        buckets.set(key, bucket);
      }
      bucket.agents.add(dep.agentLabel || AGENT_LABELS[dep.agent]);
      bucket.depositIds.push(dep.id);
      if (dep.effectiveStatus === 'running' || dep.effectiveStatus === 'waiting_review') {
        bucket.hasActive = true;
      }
      if (dep.timestamp > bucket.lastTouchedAt) {
        bucket.lastTouchedAt = dep.timestamp;
      }
    }
  }

  const collisions: FileCollision[] = [];
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.agents.size >= 2) {
      const project = projectMap.get(bucket.projectId);
      collisions.push({
        id: key,
        projectId: bucket.projectId,
        projectName: project?.name ?? bucket.projectId,
        artifactPath: bucket.artifactPath,
        agents: Array.from(bucket.agents),
        depositIds: bucket.depositIds,
        severity: bucket.hasActive ? 'active' : 'recent',
        lastTouchedAt: bucket.lastTouchedAt,
      });
    }
  }

  return collisions.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'active' ? -1 : 1;
    return b.lastTouchedAt.localeCompare(a.lastTouchedAt);
  });
}

export interface DepositFilterCriteria {
  projectId?: string | null;
  agent?: AgentId | 'all';
  status?: DepositStatus | 'all';
  query?: string;
}

export function filterDeposits(
  deposits: EffectiveDeposit[],
  criteria: DepositFilterCriteria
): EffectiveDeposit[] {
  const q = (criteria.query ?? '').trim().toLowerCase();
  return deposits.filter((dep) => {
    if (criteria.projectId && dep.projectId !== criteria.projectId) return false;
    if (criteria.agent && criteria.agent !== 'all' && dep.agent !== criteria.agent) return false;
    if (criteria.status && criteria.status !== 'all' && dep.effectiveStatus !== criteria.status) {
      return false;
    }
    if (q) {
      const haystack = [
        dep.summary,
        dep.decision ?? '',
        dep.agentLabel,
        dep.agent,
        dep.hash,
        ...dep.artifacts,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function computeMetrics(deposits: EffectiveDeposit[]): DashboardMetrics {
  const totalDeposits = deposits.length;
  let runningCount = 0;
  let waitingReviewCount = 0;
  let doneCount = 0;
  let failedCount = 0;
  let totalRamActiveMb = 0;
  let totalRuntimeMs = 0;

  const latencies: number[] = [];
  const rams: number[] = [];
  const agentMap = new Map<AgentId, EffectiveDeposit[]>();

  for (const dep of deposits) {
    if (dep.effectiveStatus === 'running') {
      runningCount += 1;
      totalRamActiveMb += dep.ramMb;
    } else if (dep.effectiveStatus === 'waiting_review') {
      waitingReviewCount += 1;
    } else if (dep.effectiveStatus === 'done') {
      doneCount += 1;
    } else if (dep.effectiveStatus === 'failed') {
      failedCount += 1;
    }

    latencies.push(dep.latencyMs);
    rams.push(dep.ramMb);
    totalRuntimeMs += dep.runtimeMs;

    const list = agentMap.get(dep.agent) ?? [];
    list.push(dep);
    agentMap.set(dep.agent, list);
  }

  const finishedCount = doneCount + failedCount;
  const successRate = finishedCount > 0 ? Math.round((doneCount / finishedCount) * 100) : 100;
  const avgRamMb = rams.length > 0 ? Math.round(rams.reduce((s, n) => s + n, 0) / rams.length) : 0;
  const peakRamMb = rams.length > 0 ? Math.max(...rams) : 0;

  const byAgent: AgentPerformanceRow[] = Array.from(agentMap.entries())
    .map(([agent, list]) => {
      const aDone = list.filter((d) => d.effectiveStatus === 'done').length;
      const aFailed = list.filter((d) => d.effectiveStatus === 'failed').length;
      const aWaiting = list.filter((d) => d.effectiveStatus === 'waiting_review').length;
      const aRunning = list.filter((d) => d.effectiveStatus === 'running').length;
      const aFinished = aDone + aFailed;
      const aLat = list.map((d) => d.latencyMs);
      const aRam = list.map((d) => d.ramMb);
      return {
        agent,
        label: AGENT_LABELS[agent] ?? agent,
        totalRuns: list.length,
        doneCount: aDone,
        failedCount: aFailed,
        waitingCount: aWaiting,
        runningCount: aRunning,
        successRate: aFinished > 0 ? Math.round((aDone / aFinished) * 100) : 100,
        p50LatencyMs: percentile(aLat, 50),
        p95LatencyMs: percentile(aLat, 95),
        avgRamMb: Math.round(aRam.reduce((s, n) => s + n, 0) / Math.max(1, aRam.length)),
        peakRamMb: Math.max(0, ...aRam),
        totalRuntimeMs: list.reduce((s, d) => s + d.runtimeMs, 0),
      };
    })
    .sort((a, b) => b.totalRuns - a.totalRuns);

  // Build chronological time-series buckets (up to 8 buckets across ledger history)
  const chronological = [...deposits].sort((a, b) => a.seq - b.seq);
  const bucketCount = Math.min(8, Math.max(1, chronological.length));
  const chunkSize = Math.max(1, Math.ceil(chronological.length / bucketCount));
  const timeSeries: TelemetryBucket[] = [];

  for (let i = 0; i < chronological.length; i += chunkSize) {
    const slice = chronological.slice(i, i + chunkSize);
    if (slice.length === 0) continue;
    const first = slice[0];
    const last = slice[slice.length - 1];
    const label = first.seq === last.seq ? `#${first.seq}` : `#${first.seq}–${last.seq}`;
    const sLat = slice.map((d) => d.latencyMs);
    const sRam = slice.map((d) => d.ramMb);
    timeSeries.push({
      label,
      p50LatencyMs: percentile(sLat, 50),
      p95LatencyMs: percentile(sLat, 95),
      avgRamMb: Math.round(sRam.reduce((s, n) => s + n, 0) / sRam.length),
      peakRamMb: Math.max(...sRam),
      depositCount: slice.length,
    });
  }

  return {
    totalDeposits,
    runningCount,
    waitingReviewCount,
    doneCount,
    failedCount,
    successRate,
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    avgRamMb,
    peakRamMb,
    totalRamActiveMb,
    totalRuntimeMs,
    byAgent,
    timeSeries,
  };
}

/**
 * Deterministic architectural graph layout:
 * - When `focusedProjectId` is null: shows all Projects arranged on a crisp horizontal/two-row architectural grid
 *   with their recent deposits orbiting beneath and shared/colliding artifact nodes highlighted.
 * - When `focusedProjectId` is set: shows a deep 3-column architectural topology for that project:
 *   Column 1: Project Hub -> Column 2: Agent Deposits & Decisions -> Column 3: Unique Artifacts (with collision flags).
 */
export function buildProjectGraph(
  projects: Project[],
  deposits: EffectiveDeposit[],
  collisions: FileCollision[],
  focusedProjectId: string | null
): ProjectGraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const collisionKeySet = new Set(collisions.map((c) => `${c.projectId}::${c.artifactPath}`));

  if (focusedProjectId) {
    const project = projects.find((p) => p.id === focusedProjectId);
    if (!project) {
      return { nodes: [], edges: [], width: 1080, height: 620 };
    }

    const projDeposits = deposits
      .filter((d) => d.projectId === project.id)
      .sort((a, b) => b.seq - a.seq);

    const uniqueArtifacts = new Map<
      string,
      { path: string; depositIds: string[]; collision: boolean }
    >();
    for (const dep of projDeposits) {
      for (const art of dep.artifacts) {
        const clean = art.trim();
        if (!clean) continue;
        const entry = uniqueArtifacts.get(clean) ?? {
          path: clean,
          depositIds: [],
          collision: collisionKeySet.has(`${project.id}::${clean}`),
        };
        entry.depositIds.push(dep.id);
        uniqueArtifacts.set(clean, entry);
      }
    }

    const artifactList = Array.from(uniqueArtifacts.values());
    const maxRows = Math.max(projDeposits.length, artifactList.length, 3);
    const rowGap = 92;
    const height = Math.max(580, maxRows * rowGap + 140);
    const width = 1120;

    // Column 1: Project Hub
    const hubId = `proj:${project.id}`;
    nodes.push({
      id: hubId,
      kind: 'project',
      label: project.name,
      sublabel: `${projDeposits.length} deposits · ${artifactList.length} artifacts`,
      x: 150,
      y: Math.round(height / 2),
      projectId: project.id,
      accentColor: project.accentColor,
    });

    // Column 2: Deposits
    const depStartY = Math.round((height - Math.max(0, projDeposits.length - 1) * rowGap) / 2);
    projDeposits.forEach((dep, idx) => {
      const nodeId = `dep:${dep.id}`;
      const y = depStartY + idx * rowGap;
      nodes.push({
        id: nodeId,
        kind: dep.decision ? 'decision' : 'deposit',
        label: dep.summary.length > 34 ? `${dep.summary.slice(0, 33)}…` : dep.summary,
        sublabel: `${dep.agentLabel} · #${dep.seq} · ${dep.latencyMs}ms`,
        x: 520,
        y,
        projectId: project.id,
        status: dep.effectiveStatus,
        agent: dep.agent,
        depositId: dep.id,
        ramMb: dep.ramMb,
        latencyMs: dep.latencyMs,
        runtimeMs: dep.runtimeMs,
      });
      edges.push({
        id: `e:${hubId}->${nodeId}`,
        from: hubId,
        to: nodeId,
        kind: 'project_deposit',
      });
    });

    // Column 3: Unique Artifacts
    const artGap = Math.max(66, Math.min(88, Math.floor((height - 120) / Math.max(1, artifactList.length))));
    const artStartY = Math.round((height - Math.max(0, artifactList.length - 1) * artGap) / 2);
    artifactList.forEach((art, idx) => {
      const nodeId = `art:${project.id}:${art.path}`;
      const y = artStartY + idx * artGap;
      const parts = art.path.split('/');
      const shortName = parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : art.path;
      nodes.push({
        id: nodeId,
        kind: 'artifact',
        label: shortName,
        sublabel: art.collision ? 'Multi-agent overlap' : `${art.depositIds.length} touch${art.depositIds.length > 1 ? 'es' : ''}`,
        x: 920,
        y,
        projectId: project.id,
        collision: art.collision,
        artifactPath: art.path,
      });

      for (const depId of art.depositIds) {
        edges.push({
          id: `e:dep:${depId}->${nodeId}`,
          from: `dep:${depId}`,
          to: nodeId,
          kind: art.collision ? 'collision' : 'deposit_artifact',
        });
      }
    });

    return { nodes, edges, width, height };
  }

  // Constellation overview of all projects
  const cols = Math.min(3, Math.max(1, projects.length));
  const rows = Math.ceil(projects.length / cols);
  const cellW = 360;
  const cellH = 290;
  const width = Math.max(1080, cols * cellW + 80);
  const height = Math.max(600, rows * cellH + 80);

  projects.forEach((project, pIdx) => {
    const col = pIdx % cols;
    const row = Math.floor(pIdx / cols);
    const cx = 210 + col * cellW;
    const cy = 175 + row * cellH;
    const projDeposits = deposits
      .filter((d) => d.projectId === project.id)
      .sort((a, b) => b.seq - a.seq);

    const hubId = `proj:${project.id}`;
    const projCollisions = collisions.filter((c) => c.projectId === project.id).length;
    nodes.push({
      id: hubId,
      kind: 'project',
      label: project.name,
      sublabel:
        projCollisions > 0
          ? `${projDeposits.length} runs · ${projCollisions} file overlap`
          : `${projDeposits.length} runs`,
      x: cx,
      y: cy,
      projectId: project.id,
      accentColor: project.accentColor,
      collision: projCollisions > 0,
    });

    // Place up to 4 most recent deposits in a balanced arc around the project hub
    const visibleDeps = projDeposits.slice(0, 4);
    const angles = [-Math.PI * 0.78, -Math.PI * 0.22, Math.PI * 0.22, Math.PI * 0.78];
    visibleDeps.forEach((dep, dIdx) => {
      const angle = angles[dIdx % angles.length];
      const rx = 128;
      const ry = 88;
      const dx = Math.round(cx + Math.cos(angle) * rx);
      const dy = Math.round(cy + Math.sin(angle) * ry);
      const depNodeId = `dep:${dep.id}`;
      nodes.push({
        id: depNodeId,
        kind: 'deposit',
        label: dep.agentLabel,
        sublabel: dep.summary.length > 22 ? `${dep.summary.slice(0, 21)}…` : dep.summary,
        x: dx,
        y: dy,
        projectId: project.id,
        status: dep.effectiveStatus,
        agent: dep.agent,
        depositId: dep.id,
        ramMb: dep.ramMb,
        latencyMs: dep.latencyMs,
        runtimeMs: dep.runtimeMs,
      });
      edges.push({
        id: `e:${hubId}->${depNodeId}`,
        from: hubId,
        to: depNodeId,
        kind: 'project_deposit',
      });
    });
  });

  return { nodes, edges, width, height };
}

export function validateDepositInput(input: Partial<NewDepositInput>): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.projectId || !input.projectId.trim()) {
    errors.projectId = 'Select a target project.';
  }
  if (!input.agent || !VALID_AGENTS.includes(input.agent)) {
    errors.agent = 'Select a valid agent.';
  }
  if (!input.status || !VALID_STATUSES.includes(input.status)) {
    errors.status = 'Select a valid deposit status.';
  }
  const summary = (input.summary ?? '').trim();
  if (summary.length < 4) {
    errors.summary = 'Provide a result-first summary (at least 4 characters).';
  } else if (summary.length > 240) {
    errors.summary = 'Summary must be 240 characters or fewer.';
  }

  if (typeof input.ramMb !== 'number' || !Number.isFinite(input.ramMb) || input.ramMb < 0 || input.ramMb > 131072) {
    errors.ramMb = 'RAM usage must be a non-negative number (MB).';
  }
  if (typeof input.runtimeMs !== 'number' || !Number.isFinite(input.runtimeMs) || input.runtimeMs < 0) {
    errors.runtimeMs = 'Runtime must be a non-negative number (ms).';
  }
  if (typeof input.latencyMs !== 'number' || !Number.isFinite(input.latencyMs) || input.latencyMs < 0) {
    errors.latencyMs = 'Latency must be a non-negative number (ms).';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateProjectInput(input: Partial<NewProjectInput>): ValidationResult {
  const errors: Record<string, string> = {};
  const name = (input.name ?? '').trim();
  if (name.length < 2) {
    errors.name = 'Project name must be at least 2 characters.';
  } else if (name.length > 60) {
    errors.name = 'Project name must be 60 characters or fewer.';
  }
  const repoPath = (input.repoPath ?? '').trim();
  if (repoPath.length < 2) {
    errors.repoPath = 'Enter a local workspace path (e.g. ~/Worlds/Project).';
  }
  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const rem = Math.round(secs % 60);
  return `${mins}m ${rem}s`;
}

export function formatRam(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${Math.round(mb)} MB`;
}

export function formatRelativeTime(iso: string, nowMs = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function slugifyProject(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';
}
