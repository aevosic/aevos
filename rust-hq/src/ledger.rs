//! Local-first disk ledger store with SHA-256 hash chaining and file locking.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub const VALID_AGENTS: [&str; 6] = ["claude", "gemini", "codex", "devin", "aether", "custom"];
pub const VALID_STATUSES: [&str; 4] = ["running", "done", "failed", "waiting_review"];
const PROJECT_ACCENTS: [&str; 7] = [
    "#F59E0B", "#38BDF8", "#10B981", "#A78BFA", "#F43F5E", "#FB923C", "#2DD4BF",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: String,
    pub repo_path: String,
    pub accent_color: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DepositEntry {
    pub id: String,
    pub seq: u64,
    pub timestamp: String,
    pub project_id: String,
    pub agent: String,
    pub agent_label: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_deposit_id: Option<String>,
    pub status: String,
    pub summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decision: Option<String>,
    pub artifacts: Vec<String>,
    pub ram_mb: i64,
    pub runtime_ms: i64,
    pub latency_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification_runs: Option<u32>,
    pub prev_hash: String,
    pub hash: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CanonicalPayload<'a> {
    id: &'a str,
    seq: u64,
    timestamp: &'a str,
    project_id: &'a str,
    agent: &'a str,
    agent_label: &'a str,
    kind: &'a str,
    parent_deposit_id: Option<&'a str>,
    status: &'a str,
    summary: &'a str,
    decision: Option<&'a str>,
    artifacts: &'a [String],
    ram_mb: i64,
    runtime_ms: i64,
    latency_ms: i64,
    verification_runs: Option<u32>,
    prev_hash: &'a str,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewProjectInput {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub repo_path: String,
    #[serde(default)]
    pub accent_color: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewDepositInput {
    #[serde(default)]
    pub project_id: String,
    #[serde(default)]
    pub agent: String,
    #[serde(default)]
    pub agent_label: Option<String>,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub decision: Option<String>,
    #[serde(default)]
    pub artifacts: Vec<String>,
    #[serde(default)]
    pub ram_mb: f64,
    #[serde(default)]
    pub runtime_ms: f64,
    #[serde(default)]
    pub latency_ms: f64,
    #[serde(default)]
    pub verification_runs: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerVerificationResult {
    pub valid: bool,
    pub entry_count: usize,
    pub head_hash: String,
    pub ledger_bytes: u64,
    pub broken_at_seq: Option<u64>,
}

struct FileLock {
    path: PathBuf,
}

impl FileLock {
    fn acquire(lock_path: &Path) -> Result<Self, String> {
        let deadline = SystemTime::now() + Duration::from_secs(5);
        loop {
            match OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(lock_path)
            {
                Ok(mut f) => {
                    let _ = writeln!(f, "pid={}", std::process::id());
                    return Ok(Self {
                        path: lock_path.to_path_buf(),
                    });
                }
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                    if let Ok(meta) = fs::metadata(lock_path) {
                        if let Ok(modified) = meta.modified() {
                            if SystemTime::now()
                                .duration_since(modified)
                                .unwrap_or_default()
                                > Duration::from_secs(30)
                            {
                                let _ = fs::remove_file(lock_path);
                                continue;
                            }
                        }
                    }
                    if SystemTime::now() >= deadline {
                        return Err(format!("Timed out waiting for ledger lock {}", lock_path.display()));
                    }
                    thread::sleep(Duration::from_millis(20));
                }
                Err(e) => return Err(format!("Failed to acquire ledger lock: {e}")),
            }
        }
    }
}

impl Drop for FileLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

pub fn now_iso_utc() -> String {
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let secs = (ms / 1000) as i64;
    let milli = ms % 1000;
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{milli:03}Z",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

fn rand_hex4() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mix = (nanos as u64) ^ ((std::process::id() as u64) << 16);
    format!("{:04x}", (mix ^ (mix >> 17)) & 0xffff)
}

pub fn agent_label(agent: &str) -> &'static str {
    match agent {
        "claude" => "Claude",
        "gemini" => "Gemini",
        "codex" => "Codex",
        "devin" => "Devin",
        "aether" => "Aether",
        _ => "Custom Agent",
    }
}

pub fn slugify_project(name: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in name.trim().to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            prev_dash = false;
        } else if !prev_dash && !out.is_empty() {
            out.push('-');
            prev_dash = true;
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "project".to_string()
    } else {
        trimmed
    }
}

pub fn sanitize_artifacts(raw: &[String]) -> Vec<String> {
    let mut cleaned = Vec::new();
    for item in raw {
        let s: String = item
            .chars()
            .filter(|c| !matches!(c, '\r' | '\n' | '\t' | '\0'))
            .collect::<String>()
            .trim()
            .chars()
            .take(260)
            .collect();
        if !s.is_empty() && !cleaned.contains(&s) {
            cleaned.push(s);
        }
        if cleaned.len() >= 24 {
            break;
        }
    }
    cleaned
}

fn is_valid_hex_color(s: &str) -> bool {
    let bytes = s.as_bytes();
    bytes.len() == 7 && bytes[0] == b'#' && bytes[1..].iter().all(|b| b.is_ascii_hexdigit())
}

pub fn compute_entry_hash(entry: &DepositEntry) -> String {
    let payload = CanonicalPayload {
        id: &entry.id,
        seq: entry.seq,
        timestamp: &entry.timestamp,
        project_id: &entry.project_id,
        agent: &entry.agent,
        agent_label: &entry.agent_label,
        kind: &entry.kind,
        parent_deposit_id: entry.parent_deposit_id.as_deref(),
        status: &entry.status,
        summary: &entry.summary,
        decision: entry.decision.as_deref(),
        artifacts: &entry.artifacts,
        ram_mb: entry.ram_mb,
        runtime_ms: entry.runtime_ms,
        latency_ms: entry.latency_ms,
        verification_runs: entry.verification_runs,
        prev_hash: &entry.prev_hash,
    };
    let serialized = serde_json::to_string(&payload).unwrap_or_default();
    let digest = Sha256::digest(serialized.as_bytes());
    let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    hex[..16].to_string()
}

pub fn validate_project_input(input: &NewProjectInput) -> BTreeMap<String, String> {
    let mut errors = BTreeMap::new();
    let name_len = input.name.trim().chars().count();
    if name_len < 2 {
        errors.insert("name".into(), "Project name must be at least 2 characters.".into());
    } else if name_len > 60 {
        errors.insert("name".into(), "Project name must be 60 characters or fewer.".into());
    }
    if input.repo_path.trim().chars().count() < 2 {
        errors.insert(
            "repoPath".into(),
            "Enter a local workspace path (e.g. /path/to/workspace).".into(),
        );
    }
    errors
}

pub fn validate_deposit_input(input: &NewDepositInput) -> BTreeMap<String, String> {
    let mut errors = BTreeMap::new();
    if input.project_id.trim().is_empty() {
        errors.insert("projectId".into(), "Select a target project.".into());
    }
    if !VALID_AGENTS.contains(&input.agent.as_str()) {
        errors.insert("agent".into(), "Select a valid agent.".into());
    }
    if !VALID_STATUSES.contains(&input.status.as_str()) {
        errors.insert("status".into(), "Select a valid deposit status.".into());
    }
    let summary_len = input.summary.trim().chars().count();
    if summary_len < 4 {
        errors.insert(
            "summary".into(),
            "Provide a result-first summary (at least 4 characters).".into(),
        );
    } else if summary_len > 240 {
        errors.insert("summary".into(), "Summary must be 240 characters or fewer.".into());
    }
    if !input.ram_mb.is_finite() || input.ram_mb < 0.0 || input.ram_mb > 131_072.0 {
        errors.insert("ramMb".into(), "RAM usage must be a non-negative number (MB).".into());
    }
    if !input.runtime_ms.is_finite() || input.runtime_ms < 0.0 {
        errors.insert("runtimeMs".into(), "Runtime must be a non-negative number (ms).".into());
    }
    if !input.latency_ms.is_finite() || input.latency_ms < 0.0 {
        errors.insert("latencyMs".into(), "Latency must be a non-negative number (ms).".into());
    }
    errors
}

#[derive(Clone)]
pub struct DiskLedgerStore {
    data_dir: PathBuf,
    ledger_path: PathBuf,
    projects_path: PathBuf,
    lock_path: PathBuf,
}

impl DiskLedgerStore {
    pub fn new(base_dir: &Path) -> Result<Self, String> {
        if base_dir.components().any(|c| matches!(c, Component::ParentDir)) {
            return Err("Data directory path must not contain '..'".into());
        }
        fs::create_dir_all(base_dir).map_err(|e| format!("Cannot create data dir: {e}"))?;
        let data_dir = fs::canonicalize(base_dir).map_err(|e| format!("Cannot resolve data dir: {e}"))?;
        let ledger_path = data_dir.join("audit-ledger.jsonl");
        let projects_path = data_dir.join("projects.json");
        let lock_path = data_dir.join("audit-ledger.lock");

        let store = Self {
            data_dir,
            ledger_path,
            projects_path,
            lock_path,
        };
        store.ensure_initialized()?;
        Ok(store)
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    fn ensure_initialized(&self) -> Result<(), String> {
        if !self.projects_path.exists() {
            let projects = default_projects();
            let json = serde_json::to_string_pretty(&projects).map_err(|e| e.to_string())?;
            fs::write(&self.projects_path, json).map_err(|e| e.to_string())?;
        }
        if !self.ledger_path.exists() {
            fs::write(&self.ledger_path, "").map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn list_projects(&self) -> Vec<Project> {
        fs::read_to_string(&self.projects_path)
            .ok()
            .and_then(|s| serde_json::from_str::<Vec<Project>>(&s).ok())
            .unwrap_or_default()
    }

    pub fn resolve_project_id(&self, id_or_slug: &str) -> Option<String> {
        let needle = id_or_slug.trim().to_lowercase();
        self.list_projects()
            .into_iter()
            .find(|p| p.id.to_lowercase() == needle || p.slug.to_lowercase() == needle || p.name.to_lowercase() == needle)
            .map(|p| p.id)
    }

    pub fn create_project(&self, input: NewProjectInput) -> Result<Project, BTreeMap<String, String>> {
        let errors = validate_project_input(&input);
        if !errors.is_empty() {
            return Err(errors);
        }
        let _lock = FileLock::acquire(&self.lock_path).map_err(|e| {
            let mut m = BTreeMap::new();
            m.insert("lock".into(), e);
            m
        })?;
        let mut projects = self.list_projects();
        let clean_name: String = input.name.trim().chars().take(60).collect();
        let base_slug = slugify_project(&clean_name);
        let mut slug = base_slug.clone();
        let mut suffix = 2u32;
        while projects.iter().any(|p| p.slug == slug) {
            slug = format!("{base_slug}-{suffix}");
            suffix += 1;
        }
        let accent = input
            .accent_color
            .as_deref()
            .filter(|c| is_valid_hex_color(c))
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| PROJECT_ACCENTS[projects.len() % PROJECT_ACCENTS.len()].to_string());

        let project = Project {
            id: format!("proj-{slug}-{}", rand_hex4()),
            name: clean_name,
            slug,
            description: input.description.trim().chars().take(280).collect(),
            repo_path: input.repo_path.trim().chars().take(200).collect(),
            accent_color: accent,
            created_at: now_iso_utc(),
        };
        projects.push(project.clone());
        let json = serde_json::to_string_pretty(&projects).unwrap_or_else(|_| "[]".into());
        if let Err(e) = fs::write(&self.projects_path, json) {
            let mut m = BTreeMap::new();
            m.insert("io".into(), e.to_string());
            return Err(m);
        }
        Ok(project)
    }

    pub fn read_ledger(&self) -> Vec<DepositEntry> {
        let raw = match fs::read_to_string(&self.ledger_path) {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
        raw.lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .filter_map(|l| serde_json::from_str::<DepositEntry>(l).ok())
            .collect()
    }

    pub fn read_raw_jsonl(&self) -> String {
        fs::read_to_string(&self.ledger_path).unwrap_or_default()
    }

    pub fn verify_chain(&self) -> LedgerVerificationResult {
        let entries = self.read_ledger();
        let mut expected_prev = "GENESIS".to_string();
        let mut broken_at_seq = None;

        for (idx, entry) in entries.iter().enumerate() {
            let recomputed = compute_entry_hash(entry);
            if entry.seq != (idx as u64) + 1
                || entry.prev_hash != expected_prev
                || entry.hash != recomputed
            {
                broken_at_seq = Some(entry.seq);
                break;
            }
            expected_prev = entry.hash.clone();
        }

        let ledger_bytes = fs::metadata(&self.ledger_path).map(|m| m.len()).unwrap_or(0);
        let head_hash = entries
            .last()
            .map(|e| e.hash.clone())
            .unwrap_or_else(|| "GENESIS".into());

        LedgerVerificationResult {
            valid: broken_at_seq.is_none(),
            entry_count: entries.len(),
            head_hash,
            ledger_bytes,
            broken_at_seq,
        }
    }

    pub fn append_deposit(
        &self,
        input: NewDepositInput,
    ) -> Result<DepositEntry, BTreeMap<String, String>> {
        let mut errors = validate_deposit_input(&input);
        if !errors.is_empty() {
            return Err(errors);
        }
        let projects = self.list_projects();
        if !projects.iter().any(|p| p.id == input.project_id) {
            errors.insert("projectId".into(), "Target project does not exist.".into());
            return Err(errors);
        }

        let _lock = FileLock::acquire(&self.lock_path).map_err(|e| {
            let mut m = BTreeMap::new();
            m.insert("lock".into(), e);
            m
        })?;

        let existing = self.read_ledger();
        let (seq, prev_hash) = match existing.last() {
            Some(last) => (last.seq + 1, last.hash.clone()),
            None => (1, "GENESIS".to_string()),
        };

        let custom_label = input
            .agent_label
            .as_deref()
            .unwrap_or("")
            .trim()
            .chars()
            .take(48)
            .collect::<String>();
        let label = if custom_label.is_empty() {
            agent_label(&input.agent).to_string()
        } else {
            custom_label
        };

        let decision = input
            .decision
            .as_deref()
            .unwrap_or("")
            .trim()
            .chars()
            .take(600)
            .collect::<String>();
        let decision_opt = if decision.is_empty() {
            None
        } else {
            Some(decision)
        };

        let mut entry = DepositEntry {
            id: format!("dep-{seq:03}-{}", rand_hex4()),
            seq,
            timestamp: now_iso_utc(),
            project_id: input.project_id,
            agent: input.agent,
            agent_label: label,
            kind: "deposit".into(),
            parent_deposit_id: None,
            status: input.status,
            summary: input.summary.trim().chars().take(240).collect(),
            decision: decision_opt,
            artifacts: sanitize_artifacts(&input.artifacts),
            ram_mb: input.ram_mb.round() as i64,
            runtime_ms: input.runtime_ms.round() as i64,
            latency_ms: input.latency_ms.round() as i64,
            verification_runs: input.verification_runs.map(|v| v.min(20)),
            prev_hash,
            hash: String::new(),
        };
        entry.hash = compute_entry_hash(&entry);
        append_jsonl_line(&self.ledger_path, &entry).map_err(|e| {
            let mut m = BTreeMap::new();
            m.insert("io".into(), e);
            m
        })?;
        Ok(entry)
    }

    pub fn append_review_resolution(
        &self,
        parent_deposit_id: &str,
        target_status: &str,
        note: &str,
    ) -> Result<DepositEntry, String> {
        if target_status != "done" && target_status != "failed" {
            return Err("Review status must be \"done\" or \"failed\".".into());
        }
        let _lock = FileLock::acquire(&self.lock_path)?;
        let existing = self.read_ledger();
        let parent = existing
            .iter()
            .find(|e| e.id == parent_deposit_id && e.kind == "deposit")
            .cloned()
            .ok_or_else(|| "Deposit not found in audit ledger.".to_string())?;

        let (seq, prev_hash) = match existing.last() {
            Some(last) => (last.seq + 1, last.hash.clone()),
            None => (1, "GENESIS".to_string()),
        };

        let clean_note: String = note.trim().chars().take(500).collect();
        let prefix: String = parent.summary.chars().take(115).collect();
        let summary = if target_status == "done" {
            format!("Approved #{}: {prefix}", parent.seq)
        } else {
            format!("Requested revision on #{}: {prefix}", parent.seq)
        };
        let decision = if !clean_note.is_empty() {
            clean_note
        } else if target_status == "done" {
            "Verified artifacts and approved deposit for project baseline.".into()
        } else {
            "Flagged for revision before merging into project baseline.".into()
        };

        let mut entry = DepositEntry {
            id: format!("rev-{seq:03}-{}", rand_hex4()),
            seq,
            timestamp: now_iso_utc(),
            project_id: parent.project_id,
            agent: "custom".into(),
            agent_label: "Director Review".into(),
            kind: "review_resolution".into(),
            parent_deposit_id: Some(parent.id),
            status: target_status.into(),
            summary,
            decision: Some(decision),
            artifacts: Vec::new(),
            ram_mb: 0,
            runtime_ms: 0,
            latency_ms: 0,
            verification_runs: None,
            prev_hash,
            hash: String::new(),
        };
        entry.hash = compute_entry_hash(&entry);
        append_jsonl_line(&self.ledger_path, &entry)?;
        Ok(entry)
    }
}

fn append_jsonl_line(path: &Path, entry: &DepositEntry) -> Result<(), String> {
    let line = serde_json::to_string(entry).map_err(|e| e.to_string())?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("Cannot open ledger: {e}"))?;
    writeln!(file, "{line}").map_err(|e| format!("Cannot append ledger: {e}"))
}

fn default_projects() -> Vec<Project> {
    vec![Project {
        id: "proj-aevos-hq".into(),
        name: "Aevos HQ".into(),
        slug: "aevos-hq".into(),
        description: "Local-first Rust audit ledger, live SSE dashboard, and project graph for multi-agent work.".into(),
        repo_path: ".".into(),
        accent_color: "#F59E0B".into(),
        created_at: "2026-11-25T00:00:00.000Z".into(),
    }]
}
