//! Pure-Rust native macOS WKWebView desktop application for Aevos HQ.

use aevos_hq::http;
use aevos_hq::ledger::DiskLedgerStore;
use muda::{
    accelerator::{Accelerator, Code, Modifiers},
    Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu,
};
use std::env;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};
use tao::{
    dpi::LogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder},
    window::{Window, WindowBuilder},
};
use wry::{WebView, WebViewBuilder};

const DEFAULT_PORT: u16 = 4748;
const DARK_BG: (u8, u8, u8, u8) = (9, 9, 11, 255);

enum AppEvent {
    Menu(String),
}

struct AppWindow {
    webview: WebView,
    _window: Window,
}

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
    if let Ok(exe) = env::current_exe() {
        if let Some(macos_dir) = exe.parent() {
            if macos_dir.file_name().and_then(|s| s.to_str()) == Some("MacOS") {
                if let Some(workspace) = macos_dir
                    .parent()
                    .and_then(|contents| contents.parent())
                    .and_then(|app| app.parent())
                {
                    if has_workspace_markers(workspace) {
                        return workspace.to_path_buf();
                    }
                }
            }
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

fn data_dir() -> PathBuf {
    env::var("AEVOS_HQ_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| resolve_root().join("data"))
}

fn dist_dir() -> PathBuf {
    env::var("AEVOS_HQ_DIST_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| resolve_root().join("dist"))
}

fn probe_verify(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(500)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    let req = format!(
        "GET /api/ledger/verify HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(req.as_bytes()).is_err() || stream.flush().is_err() {
        return false;
    }
    let mut raw = String::new();
    if stream.read_to_string(&mut raw).is_err() {
        return false;
    }
    raw.lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok())
        == Some(200)
}

fn ensure_backend(data: &Path, dist: &Path) -> Result<(), String> {
    if probe_verify(DEFAULT_PORT) {
        return Ok(());
    }

    let store = DiskLedgerStore::new(data)?;
    let dist_owned = dist.to_path_buf();
    thread::spawn(move || {
        if let Err(err) = http::serve_blocking(store, dist_owned, DEFAULT_PORT) {
            eprintln!("Backend server error: {err}");
        }
    });

    let addr = SocketAddr::from(([127, 0, 0, 1], DEFAULT_PORT));
    let deadline = Instant::now() + Duration::from_secs(3);
    while Instant::now() < deadline {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(100)).is_ok()
            && probe_verify(DEFAULT_PORT)
        {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(25));
    }

    Err(format!(
        "Timed out waiting 3s for backend at 127.0.0.1:{DEFAULT_PORT}"
    ))
}

fn run_check(data: &Path, dist: &Path) -> Result<(), String> {
    if !data.is_dir() {
        return Err(format!("Missing data directory: {}", data.display()));
    }
    let index_html = dist.join("index.html");
    if !index_html.is_file() {
        return Err(format!("Missing dist/index.html: {}", index_html.display()));
    }

    let store = DiskLedgerStore::new(data)?;
    let (ephemeral_port, _hub) = http::bind_and_spawn(store, dist.to_path_buf(), 0)?;
    if !probe_verify(ephemeral_port) {
        return Err(format!(
            "Ephemeral backend on 127.0.0.1:{ephemeral_port} failed GET /api/ledger/verify"
        ));
    }

    println!("AEVOS_HQ_APP_CHECK=OK");
    Ok(())
}

fn build_menu() -> Menu {
    let menu = Menu::new();

    let app_menu = Submenu::with_items(
        "Aevos HQ",
        true,
        &[
            &PredefinedMenuItem::hide(None),
            &PredefinedMenuItem::hide_others(None),
            &PredefinedMenuItem::separator(),
            &PredefinedMenuItem::quit(None),
        ],
    )
    .expect("app menu");

    let edit_menu = Submenu::with_items(
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(None),
            &PredefinedMenuItem::redo(None),
            &PredefinedMenuItem::separator(),
            &PredefinedMenuItem::cut(None),
            &PredefinedMenuItem::copy(None),
            &PredefinedMenuItem::paste(None),
            &PredefinedMenuItem::select_all(None),
        ],
    )
    .expect("edit menu");

    let view_menu = Submenu::with_items(
        "View",
        true,
        &[&MenuItem::with_id(
            "reload",
            "Reload",
            true,
            Some(Accelerator::new(Some(Modifiers::SUPER), Code::KeyR)),
        )],
    )
    .expect("view menu");

    let window_menu = Submenu::with_items(
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(None),
            &PredefinedMenuItem::close_window(None),
        ],
    )
    .expect("window menu");

    menu.append_items(&[&app_menu, &edit_menu, &view_menu, &window_menu])
        .expect("menu append");
    menu
}

fn main() {
    let data = data_dir();
    let dist = dist_dir();

    if env::args().skip(1).any(|arg| arg == "--check") {
        if let Err(err) = run_check(&data, &dist) {
            eprintln!("AEVOS_HQ_APP_CHECK=FAIL: {err}");
            std::process::exit(1);
        }
        return;
    }

    if let Err(err) = ensure_backend(&data, &dist) {
        eprintln!("Failed to initialize Aevos HQ backend: {err}");
        std::process::exit(1);
    }

    let event_loop = EventLoopBuilder::<AppEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();

    let menu = build_menu();
    #[cfg(target_os = "macos")]
    menu.init_for_nsapp();
    MenuEvent::set_event_handler(Some(move |event: MenuEvent| {
        let _ = proxy.send_event(AppEvent::Menu(event.id.0.clone()));
    }));

    let window = WindowBuilder::new()
        .with_title("Aevos HQ")
        .with_inner_size(LogicalSize::new(1380.0, 880.0))
        .with_min_inner_size(LogicalSize::new(1024.0, 680.0))
        .with_background_color(DARK_BG)
        .build(&event_loop)
        .expect("window");

    let url = format!("http://127.0.0.1:{DEFAULT_PORT}/");
    let webview = WebViewBuilder::new()
        .with_background_color(DARK_BG)
        .with_url(&url)
        .with_devtools(cfg!(debug_assertions))
        .build(&window)
        .expect("webview");

    let app_window = AppWindow {
        webview,
        _window: window,
    };

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        let _ = &menu;
        match event {
            Event::UserEvent(AppEvent::Menu(id)) if id == "reload" => {
                let _ = app_window.webview.evaluate_script("location.reload()");
            }
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                *control_flow = ControlFlow::Exit;
            }
            _ => {}
        }
    });
}
