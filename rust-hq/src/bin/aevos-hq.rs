//! Aevos HQ CLI & Server — local-first audit ledger, deposit CLI, and live SSE dashboard.

use aevos_hq::http;
use aevos_hq::ledger::{self, DiskLedgerStore, NewDepositInput, NewProjectInput};
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::time::Duration;

const DEFAULT_PORT: u16 = 4748;

fn has_workspace_markers(dir: &Path) -> bool {
    dir.join("dist").exists() || dir.join("data").exists()
}

fn resolve_root() -> PathBuf {
    if let Ok(root) = env::var("AEVOS_HQ_ROOT") {
        let trimmed = root.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    if let Ok(cwd) = env::current_dir() {
        if has_workspace_markers(&cwd) {
            return cwd;
        }
        if let Some(parent) = cwd.parent() {
            if has_workspace_markers(parent) {
                return parent.to_path_buf();
            }
        }
    }
    if let Ok(exe) = env::current_exe() {
        for ancestor in exe.ancestors().skip(1).take(5) {
            if has_workspace_markers(ancestor) {
                return ancestor.to_path_buf();
            }
        }
    }
    env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn default_data_dir() -> PathBuf {
    env::var("AEVOS_HQ_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| resolve_root().join("data"))
}

fn default_dist_dir() -> PathBuf {
    env::var("AEVOS_HQ_DIST_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| resolve_root().join("dist"))
}

fn default_url(port: u16) -> String {
    env::var("AEVOS_HQ_URL").unwrap_or_else(|_| format!("http://127.0.0.1:{port}"))
}

fn next_val(args: &[String], i: &mut usize, flag: &str) -> Result<String, String> {
    if *i + 1 >= args.len() {
        return Err(format!("Missing value after {flag}"));
    }
    *i += 1;
    Ok(args[*i].clone())
}

fn http_request(
    host_port: &str,
    method: &str,
    path: &str,
    body: Option<&str>,
) -> Result<(u16, String), String> {
    let mut stream =
        TcpStream::connect(host_port).map_err(|e| format!("connect {host_port}: {e}"))?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let req = match body {
        Some(b) => format!(
            "{method} {path} HTTP/1.1\r\nHost: {host_port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{b}",
            b.len()
        ),
        None => format!(
            "{method} {path} HTTP/1.1\r\nHost: {host_port}\r\nConnection: close\r\n\r\n"
        ),
    };
    stream.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
    stream.flush().map_err(|e| e.to_string())?;
    let mut raw = String::new();
    stream.read_to_string(&mut raw).map_err(|e| e.to_string())?;
    let (head, resp_body) = raw.split_once("\r\n\r\n").unwrap_or((&raw, ""));
    let status = head
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|c| c.parse::<u16>().ok())
        .unwrap_or(0);
    Ok((status, resp_body.to_string()))
}

fn host_port_from_url(url: &str) -> String {
    url.trim()
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .split('/')
        .next()
        .unwrap_or("127.0.0.1:4748")
        .to_string()
}

fn cmd_serve(args: &[String]) -> Result<(), String> {
    let mut port = env::var("PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(DEFAULT_PORT);
    let mut data_dir = default_data_dir();
    let mut dist_dir = default_dist_dir();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--port" => {
                port = next_val(args, &mut i, "--port")?
                    .parse::<u16>()
                    .map_err(|e| e.to_string())?
            }
            "--data-dir" => data_dir = PathBuf::from(next_val(args, &mut i, "--data-dir")?),
            "--dist-dir" => dist_dir = PathBuf::from(next_val(args, &mut i, "--dist-dir")?),
            other => return Err(format!("Unknown serve flag: {other}")),
        }
        i += 1;
    }
    let store = DiskLedgerStore::new(&data_dir)?;
    http::serve_blocking(store, dist_dir, port)
}

fn cmd_deposit(args: &[String]) -> Result<(), String> {
    let mut project = String::new();
    let mut agent = String::new();
    let mut label = None;
    let mut status = "done".to_string();
    let mut summary = String::new();
    let mut decision = None;
    let mut artifacts = Vec::new();
    let mut ram_mb = 0.0f64;
    let mut runtime_ms = 0.0f64;
    let mut latency_ms = 0.0f64;
    let mut verify_runs = None;
    let mut data_dir = default_data_dir();
    let mut url = default_url(DEFAULT_PORT);
    let mut offline = false;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--project" => project = next_val(args, &mut i, "--project")?,
            "--agent" => agent = next_val(args, &mut i, "--agent")?,
            "--label" => label = Some(next_val(args, &mut i, "--label")?),
            "--status" => status = next_val(args, &mut i, "--status")?,
            "--summary" => summary = next_val(args, &mut i, "--summary")?,
            "--decision" => decision = Some(next_val(args, &mut i, "--decision")?),
            "--artifact" => artifacts.push(next_val(args, &mut i, "--artifact")?),
            "--ram-mb" => {
                ram_mb = next_val(args, &mut i, "--ram-mb")?
                    .parse()
                    .map_err(|e| format!("--ram-mb: {e}"))?
            }
            "--runtime-ms" => {
                runtime_ms = next_val(args, &mut i, "--runtime-ms")?
                    .parse()
                    .map_err(|e| format!("--runtime-ms: {e}"))?
            }
            "--latency-ms" => {
                latency_ms = next_val(args, &mut i, "--latency-ms")?
                    .parse()
                    .map_err(|e| format!("--latency-ms: {e}"))?
            }
            "--verify-runs" => {
                verify_runs = Some(
                    next_val(args, &mut i, "--verify-runs")?
                        .parse::<u32>()
                        .map_err(|e| format!("--verify-runs: {e}"))?,
                )
            }
            "--data-dir" => data_dir = PathBuf::from(next_val(args, &mut i, "--data-dir")?),
            "--url" => url = next_val(args, &mut i, "--url")?,
            "--offline" => offline = true,
            other => return Err(format!("Unknown deposit flag: {other}")),
        }
        i += 1;
    }

    let store = DiskLedgerStore::new(&data_dir)?;
    let project_id = store
        .resolve_project_id(&project)
        .ok_or_else(|| {
            format!("Unknown project '{project}'. Run `aevos-hq project list` or pass exact id/slug.")
        })?;

    let input = NewDepositInput {
        project_id,
        agent,
        agent_label: label,
        status,
        summary,
        decision,
        artifacts,
        ram_mb,
        runtime_ms,
        latency_ms,
        verification_runs: verify_runs,
    };

    if !offline {
        let host = host_port_from_url(&url);
        let body = serde_json::to_string(&input).map_err(|e| e.to_string())?;
        if let Ok((code, resp)) = http_request(&host, "POST", "/api/deposits", Some(&body)) {
            if code == 201 {
                println!("{resp}");
                return Ok(());
            }
            return Err(format!("Server rejected deposit ({code}): {resp}"));
        }
    }

    match store.append_deposit(input) {
        Ok(entry) => {
            let verification = store.verify_chain();
            println!(
                "{}",
                json!({ "entry": entry, "verification": verification, "mode": "disk-fallback" })
            );
            Ok(())
        }
        Err(errs) => Err(format!("Validation failed: {}", json!(errs))),
    }
}

fn cmd_project(args: &[String]) -> Result<(), String> {
    let sub = args.first().map(String::as_str).unwrap_or("");
    let rest = if args.is_empty() { &[][..] } else { &args[1..] };
    match sub {
        "list" => {
            let mut data_dir = default_data_dir();
            let mut i = 0;
            while i < rest.len() {
                if rest[i] == "--data-dir" {
                    data_dir = PathBuf::from(next_val(rest, &mut i, "--data-dir")?);
                } else {
                    return Err(format!("Unknown flag: {}", rest[i]));
                }
                i += 1;
            }
            let store = DiskLedgerStore::new(&data_dir)?;
            println!(
                "{}",
                serde_json::to_string_pretty(&store.list_projects()).unwrap_or_default()
            );
            Ok(())
        }
        "add" => {
            let mut name = String::new();
            let mut description = String::new();
            let mut repo_path = String::new();
            let mut accent_color = None;
            let mut data_dir = default_data_dir();
            let mut url = default_url(DEFAULT_PORT);
            let mut offline = false;
            let mut i = 0;
            while i < rest.len() {
                match rest[i].as_str() {
                    "--name" => name = next_val(rest, &mut i, "--name")?,
                    "--description" => description = next_val(rest, &mut i, "--description")?,
                    "--repo" => repo_path = next_val(rest, &mut i, "--repo")?,
                    "--color" => accent_color = Some(next_val(rest, &mut i, "--color")?),
                    "--data-dir" => data_dir = PathBuf::from(next_val(rest, &mut i, "--data-dir")?),
                    "--url" => url = next_val(rest, &mut i, "--url")?,
                    "--offline" => offline = true,
                    other => return Err(format!("Unknown project add flag: {other}")),
                }
                i += 1;
            }
            let input = NewProjectInput {
                name,
                description,
                repo_path,
                accent_color,
            };
            if !offline {
                let host = host_port_from_url(&url);
                let body = serde_json::to_string(&input).map_err(|e| e.to_string())?;
                if let Ok((code, resp)) = http_request(&host, "POST", "/api/projects", Some(&body))
                {
                    if code == 201 {
                        println!("{resp}");
                        return Ok(());
                    }
                    return Err(format!("Server rejected project ({code}): {resp}"));
                }
            }
            let store = DiskLedgerStore::new(&data_dir)?;
            match store.create_project(input) {
                Ok(p) => {
                    println!("{}", json!({ "project": p, "mode": "disk-fallback" }));
                    Ok(())
                }
                Err(errs) => Err(format!("Validation failed: {}", json!(errs))),
            }
        }
        _ => Err("Usage: aevos-hq project <list|add> ...".into()),
    }
}

fn cmd_verify(args: &[String]) -> Result<(), String> {
    let mut data_dir = default_data_dir();
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--data-dir" {
            data_dir = PathBuf::from(next_val(args, &mut i, "--data-dir")?);
        } else {
            return Err(format!("Unknown verify flag: {}", args[i]));
        }
        i += 1;
    }
    let store = DiskLedgerStore::new(&data_dir)?;
    let res = store.verify_chain();
    println!("{}", serde_json::to_string_pretty(&res).unwrap_or_default());
    if res.valid {
        Ok(())
    } else {
        Err(format!("Chain broken at seq {:?}", res.broken_at_seq))
    }
}

fn cmd_selftest(args: &[String]) -> Result<(), String> {
    let mut dist_dir = default_dist_dir();
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--dist-dir" {
            dist_dir = PathBuf::from(next_val(args, &mut i, "--dist-dir")?);
        }
        i += 1;
    }

    let scratch = resolve_root().join(".selftest-scratch");
    if scratch.exists() {
        let _ = fs::remove_dir_all(&scratch);
    }
    let result = run_selftest_inner(&scratch, &dist_dir);
    let _ = fs::remove_dir_all(&scratch);
    result
}

fn run_selftest_inner(scratch: &Path, dist_dir: &Path) -> Result<(), String> {
    let mut passed = 0usize;
    let store = DiskLedgerStore::new(scratch)?;

    // 1. Clean empty initial ledger verification (0 fake deposits)
    let v0 = store.verify_chain();
    assert_check(
        v0.valid && v0.entry_count == 0 && v0.head_hash == "GENESIS",
        "1. initial empty ledger valid (0 entries, GENESIS)",
        &mut passed,
    )?;

    // 2. Create project
    let proj = store
        .create_project(NewProjectInput {
            name: "Selftest World".into(),
            description: "Isolated test project".into(),
            repo_path: "./selftest-workspace".into(),
            accent_color: Some("#38BDF8".into()),
        })
        .map_err(|e| format!("create_project failed: {:?}", e))?;
    assert_check(
        proj.slug == "selftest-world",
        "2. project created with deterministic slug",
        &mut passed,
    )?;

    // 3. Append 2 deposits + verify chain
    let dep1 = store
        .append_deposit(NewDepositInput {
            project_id: proj.id.clone(),
            agent: "claude".into(),
            agent_label: Some("Claude Selftest".into()),
            status: "done".into(),
            summary: "First real deposit entry in selftest".into(),
            decision: Some("Verified seq 1 hash chain".into()),
            artifacts: vec!["rust-hq/src/ledger.rs".into()],
            ram_mb: 10.0,
            runtime_ms: 80.0,
            latency_ms: 15.0,
            verification_runs: Some(2),
        })
        .map_err(|e| format!("append_deposit 1 failed: {:?}", e))?;
    let dep2 = store
        .append_deposit(NewDepositInput {
            project_id: proj.id.clone(),
            agent: "claude".into(),
            agent_label: Some("Claude Selftest".into()),
            status: "waiting_review".into(),
            summary: "Built deterministic self-test pass for Aevos HQ".into(),
            decision: Some("Ready for director review".into()),
            artifacts: vec!["rust-hq/src/main.rs".into()],
            ram_mb: 14.0,
            runtime_ms: 120.0,
            latency_ms: 22.0,
            verification_runs: Some(2),
        })
        .map_err(|e| format!("append_deposit 2 failed: {:?}", e))?;
    let v1 = store.verify_chain();
    assert_check(
        v1.valid && v1.entry_count == 2 && dep1.seq == 1 && dep2.seq == 2,
        "3. two deposits appended & chain valid (2 entries)",
        &mut passed,
    )?;

    // 4. Review resolution appends immutable resolution entry
    let rev = store.append_review_resolution(&dep2.id, "done", "Approved in selftest")?;
    let v2 = store.verify_chain();
    assert_check(
        v2.valid && v2.entry_count == 3 && rev.kind == "review_resolution",
        "4. review resolution appended (3 entries)",
        &mut passed,
    )?;

    // 5. Live HTTP + static dist + path traversal check on ephemeral port
    let (port, _hub) = http::bind_and_spawn(store.clone(), dist_dir.to_path_buf(), 0)?;
    let host = format!("127.0.0.1:{port}");

    let (code_state, body_state) = http_request(&host, "GET", "/api/state", None)?;
    let state_json: Value = serde_json::from_str(&body_state).map_err(|e| e.to_string())?;
    assert_check(
        code_state == 200 && state_json["ledger"].as_array().map(|a| a.len()) == Some(3),
        "5. HTTP GET /api/state returns 3 ledger entries",
        &mut passed,
    )?;

    let post_body = json!({
        "projectId": proj.id,
        "agent": "gemini",
        "status": "done",
        "summary": "HTTP POST deposit verified through Rust API",
        "artifacts": ["rust-hq/src/http.rs"],
        "ramMb": 9,
        "runtimeMs": 45,
        "latencyMs": 11
    })
    .to_string();
    let (code_post, _) = http_request(&host, "POST", "/api/deposits", Some(&post_body))?;
    assert_check(
        code_post == 201,
        "6. HTTP POST /api/deposits returns 201 Created",
        &mut passed,
    )?;

    let (code_ver, body_ver) = http_request(&host, "GET", "/api/ledger/verify", None)?;
    let ver_json: Value = serde_json::from_str(&body_ver).map_err(|e| e.to_string())?;
    assert_check(
        code_ver == 200 && ver_json["valid"] == true && ver_json["entryCount"] == 4,
        "7. HTTP GET /api/ledger/verify confirms 4 valid entries",
        &mut passed,
    )?;

    let (code_exp, body_exp) = http_request(&host, "GET", "/api/ledger/export", None)?;
    assert_check(
        code_exp == 200 && body_exp.lines().count() == 4,
        "8. HTTP GET /api/ledger/export returns 4 NDJSON lines",
        &mut passed,
    )?;

    let (code_idx, body_idx) = http_request(&host, "GET", "/", None)?;
    assert_check(
        code_idx == 200 && body_idx.contains("<html"),
        "9. HTTP GET / serves built dist/index.html",
        &mut passed,
    )?;

    let (code_trav, _) = http_request(&host, "GET", "/../../etc/passwd", None)?;
    assert_check(
        code_trav == 403,
        "10. path traversal /../../etc/passwd rejected with 403",
        &mut passed,
    )?;

    // 6. Negative control: 1-character tamper in audit-ledger.jsonl MUST fail verify at exact seq 2
    let ledger_file = scratch.join("audit-ledger.jsonl");
    let raw = fs::read_to_string(&ledger_file).map_err(|e| e.to_string())?;
    let mut tampered = String::new();
    for (idx, line) in raw.lines().enumerate() {
        if idx == 1 {
            tampered.push_str(&line.replace("Built deterministic", "Tampered corrupt"));
        } else {
            tampered.push_str(line);
        }
        tampered.push('\n');
    }
    fs::write(&ledger_file, tampered).map_err(|e| e.to_string())?;
    let v_bad = store.verify_chain();
    assert_check(
        !v_bad.valid && v_bad.broken_at_seq == Some(2),
        "11. negative control: 1-line tamper caught at brokenAtSeq == 2",
        &mut passed,
    )?;

    println!("SELFTEST PASSED: {passed}/11 checks");
    Ok(())
}

fn assert_check(ok: bool, label: &str, passed: &mut usize) -> Result<(), String> {
    if ok {
        *passed += 1;
        println!("  [PASS] {label}");
        Ok(())
    } else {
        Err(format!("  [FAIL] {label}"))
    }
}

fn print_help() {
    println!(
        "aevos-hq — Local-first Rust server & deposit CLI\n\n\
         COMMANDS:\n  \
         serve      [--port 4748] [--data-dir <dir>] [--dist-dir <dir>]\n  \
         deposit    --project <id|slug> --agent <claude|gemini|codex|devin|aether|custom> --summary <txt> [options]\n  \
         project    <list|add> [--name <txt> --repo <path> --description <txt> --color <#hex>]\n  \
         verify     [--data-dir <dir>]\n  \
         selftest   [--dist-dir <dir>]"
    );
}

fn main() {
    let _ = ledger::VALID_AGENTS;
    let args: Vec<String> = env::args().skip(1).collect();
    if args.is_empty() || args[0] == "--help" || args[0] == "-h" {
        print_help();
        return;
    }
    let res = match args[0].as_str() {
        "serve" => cmd_serve(&args[1..]),
        "deposit" => cmd_deposit(&args[1..]),
        "project" => cmd_project(&args[1..]),
        "verify" => cmd_verify(&args[1..]),
        "selftest" => cmd_selftest(&args[1..]),
        other => Err(format!("Unknown command: {other}")),
    };
    if let Err(e) = res {
        eprintln!("Error: {e}");
        std::process::exit(1);
    }
}
