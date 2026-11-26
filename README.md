# Aevos

Local-first multi-agent audit HQ built in pure Rust (`tao` + `wry` WKWebView + `muda`), paired with a SHA-256 hash-chained append-only JSONL ledger and a live Server-Sent Events (SSE) React & Tailwind telemetry dashboard strictly bound to `127.0.0.1:4748`.

Maintained by [Aevosic](https://github.com/aevosic).

## Architecture

- **`rust-hq/`**: Pure-Rust workspace containing:
  - `src/ledger.rs` — Append-only JSONL audit ledger with deterministic SHA-256 hash chaining (`seq`, `prevHash`, `hash`) and project manifest store.
  - `src/http.rs` — Lightweight HTTP/1.1 + SSE server bound to `127.0.0.1:4748` serving the REST API, live `/api/stream` events, and built static assets.
  - `src/bin/aevos-hq.rs` — CLI & background server (`serve`, `deposit`, `project`, `verify`, `selftest`).
  - `src/bin/aevos-hq-app.rs` — Native macOS WKWebView desktop wrapper (`tao` + `wry` + `muda`) with zero Electron or Node runtime.
- **`src/`**: React 19, TypeScript, and Tailwind CSS dashboard (`Overview`, `Review Queue`, `Project Graph`, `Audit Ledger`, `Performance`).

## Quick Start

### 1. Build the Frontend UI
```bash
npm install
npm run build
```

### 2. Build the Rust Server, CLI & Desktop App
```bash
cd rust-hq
cargo build --release
```

### 3. Run
From the repository root:

```bash
# Start the local HTTP/SSE daemon on http://127.0.0.1:4748
./rust-hq/target/release/aevos-hq serve

# Launch the native desktop app (connects to 127.0.0.1:4748 or starts an embedded server)
./rust-hq/target/release/aevos-hq-app
```

## CLI Usage

```bash
# Record a verified work deposit
./rust-hq/target/release/aevos-hq deposit \
  --project aevos-hq \
  --agent claude \
  --status waiting_review \
  --summary "Implemented zero-copy WAL reader" \
  --decision "Verified 2x under concurrent writes" \
  --artifact "src/wal.rs" \
  --ram-mb 42 \
  --runtime-ms 1840

# List or add projects
./rust-hq/target/release/aevos-hq project list
./rust-hq/target/release/aevos-hq project add \
  --name "My Workspace" \
  --repo "/path/to/workspace"

# Verify SHA-256 hash chain integrity
./rust-hq/target/release/aevos-hq verify

# Run built-in 11-check self-test suite
./rust-hq/target/release/aevos-hq selftest
```

## Environment Overrides

- `AEVOS_HQ_ROOT` — Override the workspace root used to locate `data/` and `dist/`.
- `AEVOS_HQ_DATA_DIR` — Override the ledger and project store directory (defaults to `<root>/data`).
- `AEVOS_HQ_DIST_DIR` — Override the static frontend build directory (defaults to `<root>/dist`).
- `AEVOS_HQ_URL` — Override the target server URL for CLI commands (defaults to `http://127.0.0.1:4748`).
