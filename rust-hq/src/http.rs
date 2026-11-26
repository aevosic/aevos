//! Lightweight HTTP/1.1 + SSE server bound strictly to 127.0.0.1.

use crate::ledger::{DiskLedgerStore, NewDepositInput, NewProjectInput};
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

#[derive(Clone)]
pub struct SseHub {
    clients: Arc<Mutex<Vec<TcpStream>>>,
}

impl SseHub {
    pub fn new() -> Self {
        Self {
            clients: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn add(&self, mut stream: TcpStream) {
        let hello = format!(
            "event: connected\ndata: {}\n\n",
            json!({ "ok": true, "ts": crate::ledger::now_iso_utc() })
        );
        if stream.write_all(hello.as_bytes()).is_ok() && stream.flush().is_ok() {
            if let Ok(mut guard) = self.clients.lock() {
                guard.push(stream);
            }
        }
    }

    pub fn broadcast(&self, event_type: &str, payload: &Value) {
        let msg = format!("event: {event_type}\ndata: {payload}\n\n");
        self.write_all_clients(msg.as_bytes());
    }

    pub fn keepalive(&self) {
        self.write_all_clients(b": keepalive\n\n");
    }

    fn write_all_clients(&self, bytes: &[u8]) {
        if let Ok(mut guard) = self.clients.lock() {
            guard.retain_mut(|stream| stream.write_all(bytes).is_ok() && stream.flush().is_ok());
        }
    }
}

#[derive(Deserialize)]
struct ReviewBody {
    #[serde(default)]
    status: String,
    #[serde(default)]
    note: String,
}

pub fn serve_blocking(store: DiskLedgerStore, dist_dir: PathBuf, port: u16) -> Result<(), String> {
    let addr = format!("127.0.0.1:{port}");
    let listener =
        TcpListener::bind(&addr).map_err(|e| format!("Failed to bind {addr}: {e}"))?;
    let hub = SseHub::new();

    // Background keepalive thread for active SSE dashboards
    let hub_ka = hub.clone();
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(25));
        hub_ka.keepalive();
    });

    println!(
        "Aevos HQ (Rust) listening on http://{addr} (data={}, dist={})",
        store.data_dir().display(),
        dist_dir.display()
    );

    for stream in listener.incoming() {
        match stream {
            Ok(s) => {
                let st = store.clone();
                let dd = dist_dir.clone();
                let hb = hub.clone();
                thread::spawn(move || handle_connection(s, &st, &dd, &hb));
            }
            Err(_) => break,
        }
    }
    Ok(())
}

pub fn bind_and_spawn(
    store: DiskLedgerStore,
    dist_dir: PathBuf,
    port: u16,
) -> Result<(u16, SseHub), String> {
    let addr = format!("127.0.0.1:{port}");
    let listener =
        TcpListener::bind(&addr).map_err(|e| format!("Failed to bind {addr}: {e}"))?;
    let bound_port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let hub = SseHub::new();
    let hub_ret = hub.clone();
    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let st = store.clone();
            let dd = dist_dir.clone();
            let hb = hub.clone();
            thread::spawn(move || handle_connection(stream, &st, &dd, &hb));
        }
    });
    Ok((bound_port, hub_ret))
}

fn handle_connection(
    mut stream: TcpStream,
    store: &DiskLedgerStore,
    dist_dir: &Path,
    hub: &SseHub,
) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let mut reader = match stream.try_clone() {
        Ok(s) => BufReader::new(s),
        Err(_) => return,
    };

    let mut request_line = String::new();
    if reader.read_line(&mut request_line).unwrap_or(0) == 0 {
        return;
    }
    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() < 2 {
        let _ = write_json(&mut stream, 400, &json!({ "error": "Malformed request" }));
        return;
    }
    let method = parts[0];
    let raw_target = parts[1];
    let path = raw_target.split('?').next().unwrap_or("/");

    let mut content_length: usize = 0;
    loop {
        let mut hdr = String::new();
        if reader.read_line(&mut hdr).unwrap_or(0) == 0 {
            break;
        }
        let trimmed = hdr.trim();
        if trimmed.is_empty() {
            break;
        }
        if let Some((k, v)) = trimmed.split_once(':') {
            if k.eq_ignore_ascii_case("content-length") {
                content_length = v.trim().parse::<usize>().unwrap_or(0);
            }
        }
    }

    if content_length > 512 * 1024 {
        let _ = write_json(&mut stream, 413, &json!({ "error": "Payload too large" }));
        return;
    }
    let mut body_bytes = vec![0u8; content_length];
    if content_length > 0 && reader.read_exact(&mut body_bytes).is_err() {
        let _ = write_json(&mut stream, 400, &json!({ "error": "Incomplete body" }));
        return;
    }

    match (method, path) {
        ("GET", "/api/stream") => {
            let hdr = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache, no-transform\r\nConnection: keep-alive\r\n\r\n";
            if stream.write_all(hdr.as_bytes()).is_ok() && stream.flush().is_ok() {
                let _ = stream.set_read_timeout(None);
                hub.add(stream);
            }
        }
        ("GET", "/api/state") => {
            let payload = json!({
                "projects": store.list_projects(),
                "ledger": store.read_ledger(),
                "verification": store.verify_chain(),
            });
            let _ = write_json(&mut stream, 200, &payload);
        }
        ("GET", "/api/projects") => {
            let _ = write_json(&mut stream, 200, &json!({ "projects": store.list_projects() }));
        }
        ("POST", "/api/projects") => {
            let input: NewProjectInput = serde_json::from_slice(&body_bytes).unwrap_or(NewProjectInput {
                name: String::new(),
                description: String::new(),
                repo_path: String::new(),
                accent_color: None,
            });
            match store.create_project(input) {
                Ok(project) => {
                    let val = serde_json::to_value(&project).unwrap_or(Value::Null);
                    hub.broadcast("project_created", &val);
                    let _ = write_json(&mut stream, 201, &json!({ "project": project }));
                }
                Err(errors) => {
                    let _ = write_json(
                        &mut stream,
                        400,
                        &json!({ "error": "Invalid project payload", "errors": errors }),
                    );
                }
            }
        }
        ("GET", "/api/deposits") => {
            let _ = write_json(
                &mut stream,
                200,
                &json!({
                    "ledger": store.read_ledger(),
                    "verification": store.verify_chain(),
                }),
            );
        }
        ("POST", "/api/deposits") => {
            let input: NewDepositInput = match serde_json::from_slice(&body_bytes) {
                Ok(v) => v,
                Err(_) => {
                    let _ = write_json(
                        &mut stream,
                        400,
                        &json!({ "error": "Invalid deposit JSON" }),
                    );
                    return;
                }
            };
            match store.append_deposit(input) {
                Ok(entry) => {
                    let verification = store.verify_chain();
                    let payload = json!({ "entry": entry, "verification": verification });
                    hub.broadcast("deposit_appended", &payload);
                    let _ = write_json(&mut stream, 201, &payload);
                }
                Err(errors) => {
                    let _ = write_json(
                        &mut stream,
                        400,
                        &json!({ "error": "Invalid deposit payload", "errors": errors }),
                    );
                }
            }
        }
        ("POST", p) if p.starts_with("/api/deposits/") && p.ends_with("/review") => {
            let id = p
                .trim_start_matches("/api/deposits/")
                .trim_end_matches("/review");
            if id.is_empty() || id.contains('/') {
                let _ = write_json(&mut stream, 404, &json!({ "error": "Deposit not found" }));
                return;
            }
            let body: ReviewBody = serde_json::from_slice(&body_bytes).unwrap_or(ReviewBody {
                status: String::new(),
                note: String::new(),
            });
            if body.status != "done" && body.status != "failed" {
                let _ = write_json(
                    &mut stream,
                    400,
                    &json!({ "error": "Review status must be \"done\" or \"failed\"." }),
                );
                return;
            }
            match store.append_review_resolution(id, &body.status, &body.note) {
                Ok(entry) => {
                    let verification = store.verify_chain();
                    let payload = json!({ "entry": entry, "verification": verification });
                    hub.broadcast("deposit_appended", &payload);
                    let _ = write_json(&mut stream, 201, &payload);
                }
                Err(err) => {
                    let _ = write_json(&mut stream, 404, &json!({ "error": err }));
                }
            }
        }
        ("GET", "/api/ledger/verify") => {
            let v = store.verify_chain();
            let _ = write_json(&mut stream, 200, &serde_json::to_value(v).unwrap_or(Value::Null));
        }
        ("GET", "/api/ledger/export") => {
            let raw = store.read_raw_jsonl();
            let hdr = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/x-ndjson; charset=utf-8\r\nContent-Disposition: attachment; filename=\"aevos-audit-ledger.jsonl\"\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                raw.len()
            );
            let _ = stream.write_all(hdr.as_bytes());
            let _ = stream.write_all(raw.as_bytes());
            let _ = stream.flush();
        }
        ("GET", _) | ("HEAD", _) => serve_static(&mut stream, dist_dir, path, method == "HEAD"),
        _ => {
            let _ = write_json(&mut stream, 404, &json!({ "error": "Not found" }));
        }
    }
}

fn serve_static(stream: &mut TcpStream, dist_dir: &Path, req_path: &str, head_only: bool) {
    let rel = req_path.trim_start_matches('/');
    if Path::new(rel)
        .components()
        .any(|c| matches!(c, Component::ParentDir | Component::RootDir | Component::Prefix(_)))
    {
        let _ = write_json(stream, 403, &json!({ "error": "Forbidden path" }));
        return;
    }

    let dist_canon = match fs::canonicalize(dist_dir) {
        Ok(p) => p,
        Err(_) => {
            let _ = write_json(stream, 503, &json!({ "error": "Frontend dist/ not built" }));
            return;
        }
    };

    let candidate = if rel.is_empty() {
        dist_canon.join("index.html")
    } else {
        dist_canon.join(rel)
    };

    let target = match fs::canonicalize(&candidate) {
        Ok(p) if p.starts_with(&dist_canon) && p.is_file() => p,
        _ => {
            // Only fall back to SPA index.html for non-asset navigation routes
            if rel.contains('.') {
                let _ = write_json(stream, 404, &json!({ "error": "Asset not found" }));
                return;
            }
            dist_canon.join("index.html")
        }
    };

    let bytes = match fs::read(&target) {
        Ok(b) => b,
        Err(_) => {
            let _ = write_json(stream, 404, &json!({ "error": "File not found" }));
            return;
        }
    };

    let ctype = content_type_for(&target);
    let hdr = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: {ctype}\r\nContent-Length: {}\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n",
        bytes.len()
    );
    let _ = stream.write_all(hdr.as_bytes());
    if !head_only {
        let _ = stream.write_all(&bytes);
    }
    let _ = stream.flush();
}

fn content_type_for(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "application/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "woff2" => "font/woff2",
        "ico" => "image/x-icon",
        _ => "application/octet-stream",
    }
}

fn write_json(stream: &mut TcpStream, status: u16, val: &Value) -> std::io::Result<()> {
    let text = if status == 200 { "OK" } else if status == 201 { "Created" } else if status == 400 { "Bad Request" } else if status == 403 { "Forbidden" } else if status == 404 { "Not Found" } else if status == 413 { "Payload Too Large" } else { "Error" };
    let body = serde_json::to_vec(val).unwrap_or_else(|_| b"{}".to_vec());
    let hdr = format!(
        "HTTP/1.1 {status} {text}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(hdr.as_bytes())?;
    stream.write_all(&body)?;
    stream.flush()
}
