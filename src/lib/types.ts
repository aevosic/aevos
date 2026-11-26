export type AgentId = 'claude' | 'gemini' | 'codex' | 'devin' | 'aether' | 'custom';

export type DepositStatus = 'running' | 'done' | 'failed' | 'waiting_review';

export type EntryKind = 'deposit' | 'review_resolution';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  repoPath: string;
  accentColor: string;
  createdAt: string;
}

export interface DepositEntry {
  id: string;
  seq: number;
  timestamp: string;
  projectId: string;
  agent: AgentId;
  agentLabel: string;
  kind: EntryKind;
  parentDepositId?: string;
  status: DepositStatus;
  summary: string;
  decision?: string;
  artifacts: string[];
  ramMb: number;
  runtimeMs: number;
  latencyMs: number;
  verificationRuns?: number;
  prevHash: string;
  hash: string;
}

export interface EffectiveDeposit extends DepositEntry {
  effectiveStatus: DepositStatus;
  resolvedAt?: string;
  resolutionNote?: string;
  resolutionSeq?: number;
}

export interface FileCollision {
  id: string;
  projectId: string;
  projectName: string;
  artifactPath: string;
  agents: string[];
  depositIds: string[];
  severity: 'active' | 'recent';
  lastTouchedAt: string;
}

export interface AgentPerformanceRow {
  agent: AgentId;
  label: string;
  totalRuns: number;
  doneCount: number;
  failedCount: number;
  waitingCount: number;
  runningCount: number;
  successRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  avgRamMb: number;
  peakRamMb: number;
  totalRuntimeMs: number;
}

export interface TelemetryBucket {
  label: string;
  p50LatencyMs: number;
  p95LatencyMs: number;
  avgRamMb: number;
  peakRamMb: number;
  depositCount: number;
}

export interface DashboardMetrics {
  totalDeposits: number;
  runningCount: number;
  waitingReviewCount: number;
  doneCount: number;
  failedCount: number;
  successRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  avgRamMb: number;
  peakRamMb: number;
  totalRamActiveMb: number;
  totalRuntimeMs: number;
  byAgent: AgentPerformanceRow[];
  timeSeries: TelemetryBucket[];
}

export interface GraphNode {
  id: string;
  kind: 'project' | 'deposit' | 'artifact' | 'decision';
  label: string;
  sublabel: string;
  x: number;
  y: number;
  projectId: string;
  status?: DepositStatus;
  agent?: AgentId;
  collision?: boolean;
  depositId?: string;
  artifactPath?: string;
  accentColor?: string;
  ramMb?: number;
  latencyMs?: number;
  runtimeMs?: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: 'project_deposit' | 'deposit_artifact' | 'deposit_decision' | 'collision';
}

export interface ProjectGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

export interface NewDepositInput {
  projectId: string;
  agent: AgentId;
  agentLabel?: string;
  status: DepositStatus;
  summary: string;
  decision?: string;
  artifacts: string[];
  ramMb: number;
  runtimeMs: number;
  latencyMs: number;
  verificationRuns?: number;
}

export interface NewProjectInput {
  name: string;
  description: string;
  repoPath: string;
  accentColor?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export type ActiveView = 'overview' | 'review' | 'graph' | 'ledger' | 'performance';
