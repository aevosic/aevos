import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProjectGraph,
  computeMetrics,
  detectFileCollisions,
  filterDeposits,
  percentile,
  resolveEffectiveDeposits,
  validateDepositInput,
  validateProjectInput,
} from './ledgerEngine';
import { SEED_DEPOSIT_DRAFTS, SEED_PROJECTS } from './seedData';
import type { DepositEntry } from './types';

function makeLedger(): DepositEntry[] {
  return SEED_DEPOSIT_DRAFTS.map((draft, idx) => ({
    ...draft,
    seq: idx + 1,
    prevHash: idx === 0 ? 'GENESIS' : `hash-${idx}`,
    hash: `hash-${idx + 1}`,
  }));
}

test('percentile computes exact p50 and p95', () => {
  assert.equal(percentile([], 50), 0);
  assert.equal(percentile([100, 200, 300, 400, 500], 50), 300);
  assert.equal(percentile([100, 200, 300, 400, 500], 95), 500);
});

test('resolveEffectiveDeposits applies append-only review resolutions without mutating history', () => {
  const ledger = makeLedger();
  ledger.push({
    id: 'rev-001',
    seq: ledger.length + 1,
    timestamp: '2026-11-25T23:20:00.000Z',
    projectId: 'proj-aevos',
    agent: 'custom',
    agentLabel: 'Director Review',
    kind: 'review_resolution',
    parentDepositId: 'dep-006',
    status: 'done',
    summary: 'Approved Tasks.md parser after checking byte offsets',
    decision: 'Verified diff cleanliness on real vault.',
    artifacts: [],
    ramMb: 0,
    runtimeMs: 0,
    latencyMs: 0,
    prevHash: `hash-${ledger.length}`,
    hash: `hash-${ledger.length + 1}`,
  });

  const effective = resolveEffectiveDeposits(ledger);
  assert.equal(effective.length, SEED_DEPOSIT_DRAFTS.length);
  const resolved = effective.find((d) => d.id === 'dep-006');
  assert.ok(resolved);
  assert.equal(resolved.status, 'waiting_review');
  assert.equal(resolved.effectiveStatus, 'done');
  assert.equal(resolved.resolutionSeq, ledger.length);
});

test('detectFileCollisions flags files touched by distinct agents in the same project', () => {
  const effective = resolveEffectiveDeposits(makeLedger());
  const collisions = detectFileCollisions(effective, SEED_PROJECTS);

  // crates/aevos-wal/src/writer.rs touched by Aether Rust (done) and Claude Opus (waiting_review)
  const walCollision = collisions.find(
    (c) => c.projectId === 'proj-aevos' && c.artifactPath === 'crates/aevos-wal/src/writer.rs'
  );
  assert.ok(walCollision);
  assert.equal(walCollision.severity, 'active');
  assert.equal(walCollision.agents.length, 2);

  // daemon/src/watchdog.rs touched by Claude Opus & Codex CLI
  const watchdogCollision = collisions.find(
    (c) => c.projectId === 'proj-homeos' && c.artifactPath === 'daemon/src/watchdog.rs'
  );
  assert.ok(watchdogCollision);
  assert.equal(watchdogCollision.severity, 'active');
});

test('computeMetrics aggregates running RAM, queue counts, success rate, and agent stats', () => {
  const effective = resolveEffectiveDeposits(makeLedger());
  const metrics = computeMetrics(effective);

  assert.equal(metrics.totalDeposits, 10);
  assert.equal(metrics.runningCount, 2);
  assert.equal(metrics.waitingReviewCount, 3);
  assert.equal(metrics.doneCount, 4);
  assert.equal(metrics.failedCount, 1);
  assert.equal(metrics.successRate, 80);
  assert.equal(metrics.totalRamActiveMb, 68 + 238);
  assert.ok(metrics.p95LatencyMs >= metrics.p50LatencyMs);
  assert.ok(metrics.byAgent.length >= 5);
  assert.ok(metrics.timeSeries.length >= 1);
});

test('filterDeposits filters by project, agent, status, and search query', () => {
  const effective = resolveEffectiveDeposits(makeLedger());

  const reviewOnly = filterDeposits(effective, { status: 'waiting_review' });
  assert.equal(reviewOnly.length, 3);

  const aevosClaude = filterDeposits(effective, {
    projectId: 'proj-aevos',
    agent: 'claude',
  });
  assert.equal(aevosClaude.length, 1);
  assert.equal(aevosClaude[0].id, 'dep-006');

  const pathQuery = filterDeposits(effective, { query: 'ProRes' });
  assert.equal(pathQuery.length, 1);
  assert.equal(pathQuery[0].projectId, 'proj-beyond-premiere');
});

test('buildProjectGraph generates focused 3-column topology and constellation overview', () => {
  const effective = resolveEffectiveDeposits(makeLedger());
  const collisions = detectFileCollisions(effective, SEED_PROJECTS);

  const constellation = buildProjectGraph(SEED_PROJECTS, effective, collisions, null);
  assert.equal(
    constellation.nodes.filter((n) => n.kind === 'project').length,
    SEED_PROJECTS.length
  );
  assert.ok(constellation.edges.length > 0);

  const focused = buildProjectGraph(SEED_PROJECTS, effective, collisions, 'proj-aevos');
  assert.equal(focused.nodes.filter((n) => n.kind === 'project').length, 1);
  assert.equal(
    focused.nodes.filter((n) => n.kind === 'deposit' || n.kind === 'decision').length,
    2
  );
  const collidingArtifact = focused.nodes.find(
    (n) => n.kind === 'artifact' && n.artifactPath === 'crates/aevos-wal/src/writer.rs'
  );
  assert.ok(collidingArtifact);
  assert.equal(collidingArtifact.collision, true);
});

test('validation rejects empty or invalid deposit and project inputs', () => {
  const emptyDep = validateDepositInput({});
  assert.equal(emptyDep.valid, false);
  assert.ok(emptyDep.errors.projectId);
  assert.ok(emptyDep.errors.summary);

  const validDep = validateDepositInput({
    projectId: 'proj-aevos',
    agent: 'claude',
    status: 'waiting_review',
    summary: 'Verified zero-copy parser on 100k lines',
    artifacts: ['src/parser.rs'],
    ramMb: 120,
    runtimeMs: 4200,
    latencyMs: 310,
  });
  assert.equal(validDep.valid, true);

  const invalidProj = validateProjectInput({ name: 'A', repoPath: '' });
  assert.equal(invalidProj.valid, false);
  assert.ok(invalidProj.errors.name);
  assert.ok(invalidProj.errors.repoPath);
});
