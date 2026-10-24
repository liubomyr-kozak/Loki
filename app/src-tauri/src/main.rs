#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
#[cfg(target_os = "macos")]
use tauri::ActivationPolicy;
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

struct ServerProcess(Mutex<Option<Child>>);

// User-resizable popover size (logical px), persisted to disk so it
// survives app restarts. Both axes are free within their own minimum —
// no upper clamp, same as an ordinary OS window — this is a plain
// resizable NSWindow, no custom drag handles or per-frame JS math (see the
// WindowEvent::Resized handler below for the after-the-fact recenter).
struct PanelSize(Mutex<(f64, f64)>);
const MIN_PANEL_WIDTH: f64 = 360.0;
const MIN_PANEL_HEIGHT: f64 = 400.0;
const DEFAULT_PANEL_WIDTH: f64 = 360.0;
const DEFAULT_PANEL_HEIGHT: f64 = 520.0;

// Same idea for the Workspace ("main") window, which used to open at a
// hardcoded 900x640 every single time: it is destroyed on exit_dashboard
// (close(), not hide()), so nothing about its geometry survived unless it
// was written to disk. Kept in its own state/file rather than reusing
// PanelSize — the two windows have unrelated sizes and minimums.
struct WorkspaceSize(Mutex<(f64, f64)>);
const MIN_WORKSPACE_WIDTH: f64 = 600.0;
const MIN_WORKSPACE_HEIGHT: f64 = 480.0;
const DEFAULT_WORKSPACE_WIDTH: f64 = 900.0;
const DEFAULT_WORKSPACE_HEIGHT: f64 = 640.0;

// Debounces the native-resize -> recenter step: a live user drag fires many
// WindowEvent::Resized events in a row. We capture the window's center x
// once at the start of a burst (anchor) and, once no new Resized event has
// landed for RESIZE_SETTLE_MS, smoothly animate the window back so it's
// centered on that anchor again — resizing from one edge naturally drifts
// the center away from the tray icon, same as any normal OS window.
struct ResizeAnchor(Mutex<Option<(f64, std::time::Instant)>>);
const RESIZE_SETTLE_MS: u64 = 250;

// Set to `now` right before any *programmatic* resize (force_compact on tray
// show, the dashboard enter/exit transitions). The WindowEvent::Resized
// handler ignores events that land within PROGRAMMATIC_RESIZE_GRACE_MS of this
// mark, so the delayed recenter_after_resize never fights a position we just
// set deliberately (e.g. the tray-show set_position centering the popover
// under the icon). Only a genuine user edge-drag — which arrives with no
// recent mark — schedules a recenter.
struct ProgrammaticResize(Mutex<Option<std::time::Instant>>);
const PROGRAMMATIC_RESIZE_GRACE_MS: u64 = 500;

fn mark_programmatic_resize(app: &tauri::AppHandle) {
    *app.state::<ProgrammaticResize>().0.lock().unwrap() = Some(std::time::Instant::now());
}

fn config_override() -> Option<PathBuf> {
    let value = std::env::var_os("CONFIG_FILE").filter(|v| !v.is_empty())?;
    let file = PathBuf::from(value);
    if file.is_absolute() { Some(file) } else { Some(std::env::current_dir().ok()?.join(file)) }
}

fn settings_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Some(file) = config_override() {
        return file.parent().map(Path::to_path_buf);
    }
    let directory = app.path().app_config_dir().ok()?;
    if cfg!(debug_assertions) {
        let id = app.config().identifier.clone() + ".dev";
        Some(directory.with_file_name(id))
    } else {
        Some(directory)
    }
}

fn panel_size_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    settings_dir(app).map(|d| d.join("panel-width.json"))
}

fn load_panel_size(app: &tauri::AppHandle) -> (f64, f64) {
    panel_size_file(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .map(|v| {
            let width = v
                .get("width")
                .and_then(|w| w.as_f64())
                .map(|w| w.max(MIN_PANEL_WIDTH))
                .unwrap_or(DEFAULT_PANEL_WIDTH);
            let height = v
                .get("height")
                .and_then(|h| h.as_f64())
                .map(|h| h.max(MIN_PANEL_HEIGHT))
                .unwrap_or(DEFAULT_PANEL_HEIGHT);
            (width, height)
        })
        .unwrap_or((DEFAULT_PANEL_WIDTH, DEFAULT_PANEL_HEIGHT))
}

fn save_panel_size(app: &tauri::AppHandle, width: f64, height: f64) {
    if let Some(path) = panel_size_file(app) {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&path, serde_json::json!({ "width": width, "height": height }).to_string());
    }
}

fn workspace_size_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    settings_dir(app).map(|d| d.join("workspace-size.json"))
}

fn load_workspace_size(app: &tauri::AppHandle) -> (f64, f64) {
    workspace_size_file(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .map(|v| {
            let width = v
                .get("width")
                .and_then(|w| w.as_f64())
                .map(|w| w.max(MIN_WORKSPACE_WIDTH))
                .unwrap_or(DEFAULT_WORKSPACE_WIDTH);
            let height = v
                .get("height")
                .and_then(|h| h.as_f64())
                .map(|h| h.max(MIN_WORKSPACE_HEIGHT))
                .unwrap_or(DEFAULT_WORKSPACE_HEIGHT);
            (width, height)
        })
        .unwrap_or((DEFAULT_WORKSPACE_WIDTH, DEFAULT_WORKSPACE_HEIGHT))
}

fn save_workspace_size(app: &tauri::AppHandle, width: f64, height: f64) {
    if let Some(path) = workspace_size_file(app) {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&path, serde_json::json!({ "width": width, "height": height }).to_string());
    }
}

// Read the Workspace window's live size and write it to disk. Called both
// from the debounced Resized handler and from exit_dashboard — the latter
// because closing can beat the settle timer, which would otherwise lose the
// last drag of a session.
fn persist_workspace_size(app: &tauri::AppHandle) {
    let Some(win) = app.get_webview_window("main") else { return };
    if let (Ok(size), Ok(scale)) = (win.inner_size(), win.scale_factor()) {
        let logical_width = (size.width as f64 / scale).max(MIN_WORKSPACE_WIDTH);
        let logical_height = (size.height as f64 / scale).max(MIN_WORKSPACE_HEIGHT);
        *app.state::<WorkspaceSize>().0.lock().unwrap() = (logical_width, logical_height);
        save_workspace_size(app, logical_width, logical_height);
    }
}

// Tracks whether the dashboard view is currently open, so the
// tray click handler and the Focused(false) auto-hide logic can avoid
// clobbering it (e.g. re-locking to the compact popover size mid-dashboard).
struct DashboardOpen(std::sync::atomic::AtomicBool);

// Set by the `ExitRequested` handler right before it kills the managed
// child, so the health-poll thread (which is racing that same child on a
// background thread) can tell "child slot is None/dead because the user
// quit" apart from "child died on its own (e.g. port already in use)".
// Without this, quitting during the startup health-poll window (a real
// window given the multi-MB esbuild bundle cold-start) reads the just-taken
// `None` slot as an early crash and fires a false fatal dialog + crash.log.
struct AppExiting(std::sync::atomic::AtomicBool);

// Drives the Workspace grow animation from a native thread: lerps the
// "main" window frame from the launcher's vacated spot to the centered
// dashboard frame, one main-thread step per ~16ms tick, with animate:false
// so the WKWebView re-layouts at the new size on every frame. This MUST NOT
// be driven by any webview rAF loop: the launcher webview gets occluded by
// "main" the moment it appears and WKWebView throttles/pauses rAF in
// occluded views — that froze the old frontend-driven animation, leaving
// the Workspace window stuck at the popover's position/size.
#[cfg(target_os = "macos")]
fn animate_dashboard_grow(
    app: tauri::AppHandle,
    start: objc2_foundation::NSRect,
    target: objc2_foundation::NSRect,
) {
    std::thread::spawn(move || {
        const STEPS: u32 = 28; // ~450ms at 16ms per step
        for i in 1..=STEPS {
            let lin = i as f64 / STEPS as f64;
            // Ease-in-out cubic, same curve the old JS driver used.
            let t = if lin < 0.5 {
                4.0 * lin * lin * lin
            } else {
                1.0 - (-2.0 * lin + 2.0).powi(3) / 2.0
            };
            let app_step = app.clone();
            let done = i == STEPS;
            let _ = app.run_on_main_thread(move || {
                use objc2_app_kit::NSWindow;
                use objc2_foundation::{NSPoint, NSRect, NSSize};
                use tauri_nspanel::ManagerExt;

                // Workspace was closed mid-animation — nothing left to move.
                let Some(win) = app_step.get_webview_window("main") else { return };
                if let Ok(ptr) = win.ns_window() {
                    let ns_win: &NSWindow = unsafe { &*(ptr as *mut NSWindow) };
                    let lerp = |a: f64, b: f64| a + (b - a) * t;
                    let frame = NSRect {
                        origin: NSPoint {
                            x: lerp(start.origin.x, target.origin.x),
                            y: lerp(start.origin.y, target.origin.y),
                        },
                        size: NSSize {
                            width: lerp(start.size.width, target.size.width),
                            height: lerp(start.size.height, target.size.height),
                        },
                    };
                    ns_win.setFrame_display_animate(frame, true, false);
                }
                if done {
                    // "main" has fully grown past launcher's bounds — safe to
                    // hide launcher now (it sat fully occluded underneath for
                    // the whole animation, so this is a visual no-op).
                    if let Ok(panel) = app_step.get_webview_panel("launcher") {
                        panel.order_out(None);
                        reset_launcher_view(&app_step);
                    }
                }
            });
            std::thread::sleep(std::time::Duration::from_millis(16));
        }
    });
}

// Resets the launcher popover to the main apps view (user invariant: the
// popover has ZERO view memory — every reveal shows the apps list, never a
// leftover Settings view). Called from every code path that shows OR hides
// the launcher. Uses direct evaluateJavaScript into the launcher webview
// (the frontend registers window.__launcherReset in useTrayNavigationSync)
// instead of the Tauri event bus — targeted event delivery into a hidden
// NSPanel webview proved unreliable, eval is not.
fn reset_launcher_view(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("launcher") {
        let _ = win.eval("window.__launcherReset && window.__launcherReset()");
    }
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

// Both initial launch and restart use the same checkout regardless of cwd.
fn spawn_dev_backend() -> std::io::Result<Child> {
    let repo = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let mut command = Command::new("node");
    command.arg(repo.join("dist/backend/server.js"))
        .current_dir(repo)
        .env("LOKI_PORT", "9999");
    if let Some(file) = config_override() {
        command.env("CONFIG_FILE", file);
    }
    command.spawn()
}

#[tauri::command]
async fn restart_backend(state: tauri::State<'_, ServerProcess>) -> Result<(), String> {
    if !cfg!(debug_assertions) {
        return Err("Restart is not available in a packaged build".into());
    }
    let mut guard = state.0.lock().unwrap();
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
    }
    match spawn_dev_backend() {
        Ok(child) => {
            *guard = Some(child);
            Ok(())
        }
        Err(e) => Err(format!("Failed to restart backend: {e}")),
    }
}

#[tauri::command]
fn open_config_in_editor(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(&path).spawn();
    #[cfg(target_os = "linux")]
    let result = Command::new("xdg-open").arg(&path).spawn();
    #[cfg(target_os = "windows")]
    let result = Command::new("cmd").args(["/C", "start", "", &path]).spawn();

    result.map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("invalid url".into());
    }
    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(&url).spawn();
    #[cfg(target_os = "linux")]
    let result = Command::new("xdg-open").arg(&url).spawn();
    #[cfg(target_os = "windows")]
    let result = Command::new("cmd").args(["/C", "start", "", &url]).spawn();

    result.map(|_| ()).map_err(|e| e.to_string())
}

// Opens a live attach session for an app's session-provider window.
//
// `command` is the paste-able attach command for the app's *active* session
// provider (tmux, ...), as returned by the backend's
// `GET /api/apps/:name/attach-command` (see `api.getAttachCommand` in
// app/src/api.ts). This command is provider-agnostic on the Rust side:
// it no longer knows about tmux sockets/session names, it just executes
// whatever string the backend hands it.
//
// Callers fetch the command via `api.getAttachCommand(name)` and invoke this
// with `{ command }` — see `app/src/lib/tauri.ts::openInTerminal`,
// `TerminalButton.tsx`, and `SessionsDropdown.tsx`. `SessionsDropdown` only
// has a command to offer when `SessionInfo.appName` is non-null (unmanaged
// tmux windows have no app to resolve a command for, so their button is
// disabled).
//
// Returns `Ok(msg)`: `msg` is empty on success, or a short user-presentable
// notice when the active provider has no live-attach concept (e.g. the
// "detached" provider returns an empty command — nothing to open, view logs
// instead). `Err` is reserved for actual OS-level failures.
#[tauri::command]
fn open_in_terminal(command: String) -> Result<String, String> {
    let command = command.trim();
    if command.is_empty() {
        return Ok("No live attach for this session backend — view logs instead.".into());
    }

    #[cfg(target_os = "macos")]
    {
        // Not everyone has iTerm — use it when installed, otherwise fall
        // back to the stock Terminal.app.
        let has_iterm = mac_has_iterm();

        let script = if has_iterm {
            // iTerm's "create window … command" executes the string DIRECTLY
            // (exec, no shell) — a compound like `cd '…' && yarn install` is
            // not an executable, so the window used to die the instant it
            // opened. Run it through a login shell instead (login so
            // nvm/homebrew PATH from the user's profile is available).
            let shell_cmd = format!("/bin/zsh -lc '{}'", command.replace('\'', "'\\''"));
            // Escape for embedding inside the AppleScript double-quoted string.
            let escaped = shell_cmd.replace('\\', "\\\\").replace('"', "\\\"");
            format!(
                r#"tell application "iTerm"
    activate
    create window with default profile command "{escaped}"
end tell"#
            )
        } else {
            // Terminal.app's "do script" types the line into a fresh window
            // already running the user's login shell — no wrapper needed.
            let escaped = command.replace('\\', "\\\\").replace('"', "\\\"");
            format!(
                r#"tell application "Terminal"
    activate
    do script "{escaped}"
end tell"#
            )
        };
        return Command::new("osascript")
            .args(["-e", &script])
            .spawn()
            .map(|_| String::new())
            .map_err(|e| e.to_string());
    }
    #[cfg(not(target_os = "macos"))]
    {
        // No native "open a terminal window running X" primitive without
        // extra deps on these platforms: best-effort execute the command
        // directly rather than hard-failing.
        #[cfg(target_os = "linux")]
        let result = Command::new("sh").arg("-c").arg(command).spawn();
        #[cfg(target_os = "windows")]
        let result = Command::new("cmd").args(["/C", command]).spawn();

        result.map(|_| String::new()).map_err(|e| e.to_string())
    }
}

/// Bring the terminal app open_in_terminal uses to the front, for when the
/// backend switched an already attached tmux client to another app instead
/// of opening a new window.
#[tauri::command]
fn focus_terminal() {
    #[cfg(target_os = "macos")]
    {
        let app = if mac_has_iterm() { "iTerm" } else { "Terminal" };
        let _ = Command::new("osascript")
            .args(["-e", &format!(r#"tell application "{app}" to activate"#)])
            .spawn();
    }
}

#[cfg(target_os = "macos")]
fn mac_has_iterm() -> bool {
    std::path::Path::new("/Applications/iTerm.app").exists()
        || std::env::var_os("HOME")
            .map(|h| PathBuf::from(h).join("Applications/iTerm.app").exists())
            .unwrap_or(false)
}

// Forces the window back to the compact popover state at its persisted
// (width, height), preserving its current top-left corner. Called right
// before the tray show branch positions/shows the panel, so a dashboard
// left open from a previous session never leaks into the popover view.
// Stays resizable — AppKit's own edge-drag is what lets the user resize
// both axes natively; only a minimum is enforced per axis, no maximum.
#[cfg(target_os = "macos")]
fn force_compact(win: &tauri::WebviewWindow, width: f64, height: f64) {
    use objc2_app_kit::NSWindow;
    use objc2_foundation::{NSPoint, NSRect, NSSize};
    let _ = win.set_resizable(true);
    if let Ok(ptr) = win.ns_window() {
        let ns_win: &NSWindow = unsafe { &*(ptr as *mut NSWindow) };
        let frame = ns_win.frame();
        // Keep the current top-left; only resize.
        // AppKit origin is bottom-left, so adjust y to preserve the top edge.
        let new_size = NSSize { width, height };
        let top = frame.origin.y + frame.size.height;
        let new_origin = NSPoint { x: frame.origin.x, y: top - new_size.height };
        ns_win.setFrame_display_animate(NSRect { origin: new_origin, size: new_size }, true, false);
    }
    // Tauri's set_max_size(None) does not reliably clear the native NSWindow
    // contentMaxSize on macOS (see enter_dashboard above for the same
    // caveat) — set both content min/max directly instead so growth is
    // never silently clamped back down.
    if let Ok(ptr) = win.ns_window() {
        use objc2_foundation::NSSize;
        let ns_win: &NSWindow = unsafe { &*(ptr as *mut NSWindow) };
        ns_win.setContentMinSize(NSSize { width: MIN_PANEL_WIDTH, height: MIN_PANEL_HEIGHT });
        ns_win.setContentMaxSize(NSSize { width: 100_000.0, height: 100_000.0 });
    }
}

// Positions `win` directly under the tray icon rect from a
// TrayIconEvent::Click, sized to `panel_width`. Shared by both the compact
// "main" popover and the "launcher" popover so they line up under the icon
// the same way. Falls back to tauri_plugin_positioner's TrayBottomCenter if
// the scale/monitor lookup fails.
#[cfg(target_os = "macos")]
fn position_under_tray(win: &tauri::WebviewWindow, rect: &tauri::Rect, panel_width: f64) {
    let positioned = (|| -> Option<()> {
        let scale = win.scale_factor().ok()?;
        let monitor = win.current_monitor().ok()??;

        let icon_x_phys: f64 = match rect.position {
            tauri::Position::Physical(p) => p.x as f64,
            tauri::Position::Logical(p) => p.x * scale,
        };
        let icon_y_phys: f64 = match rect.position {
            tauri::Position::Physical(p) => p.y as f64,
            tauri::Position::Logical(p) => p.y * scale,
        };
        let icon_w_phys: f64 = match rect.size {
            tauri::Size::Physical(s) => s.width as f64,
            tauri::Size::Logical(s) => s.width * scale,
        };
        let icon_h_phys: f64 = match rect.size {
            tauri::Size::Physical(s) => s.height as f64,
            tauri::Size::Logical(s) => s.height * scale,
        };

        let icon_center_x = icon_x_phys + icon_w_phys / 2.0;
        let icon_bottom_y = icon_y_phys + icon_h_phys;

        let win_w = (panel_width * scale) as i32;
        let gap = (4.0 * scale) as i32;

        let mon = monitor.position();
        let msz = monitor.size();

        let raw_x = icon_center_x as i32 - win_w / 2;
        let max_x = mon.x + msz.width as i32 - win_w;
        let x = raw_x.clamp(mon.x, max_x);
        let y = icon_bottom_y as i32 + gap;

        let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
        Some(())
    })();

    if positioned.is_none() {
        use tauri_plugin_positioner::{Position, WindowExt};
        let _ = win.move_window(Position::TrayBottomCenter);
    }
}

#[cfg(target_os = "macos")]
fn current_center_x(win: &tauri::WebviewWindow) -> f64 {
    use objc2_app_kit::NSWindow;
    win.ns_window()
        .ok()
        .map(|ptr| {
            let ns_win: &NSWindow = unsafe { &*(ptr as *mut NSWindow) };
            let frame = ns_win.frame();
            frame.origin.x + frame.size.width / 2.0
        })
        .unwrap_or(0.0)
}
#[cfg(not(target_os = "macos"))]
fn current_center_x(win: &tauri::WebviewWindow) -> f64 {
    match (win.outer_position(), win.outer_size()) {
        (Ok(pos), Ok(size)) => pos.x as f64 + size.width as f64 / 2.0,
        _ => 0.0,
    }
}

// Read the launcher's settled size off the live window and write it to disk.
//
// Deliberately independent of recenter_after_resize: persistence used to live
// at the tail of that function, *after* its `let Some(anchor_x) = .. else
// { return }` guard, so any drag that ended without a surviving anchor (the
// programmatic-resize grace window clears it, and only the first of several
// racing settle threads ever sees it set) silently dropped the new size. The
// window was resized on screen and nothing was saved.
fn persist_panel_size(app: &tauri::AppHandle) {
    let Some(win) = app.get_webview_window("launcher") else { return };
    if let (Ok(size), Ok(scale)) = (win.inner_size(), win.scale_factor()) {
        let logical_width = (size.width as f64 / scale).max(MIN_PANEL_WIDTH);
        let logical_height = (size.height as f64 / scale).max(MIN_PANEL_HEIGHT);
        *app.state::<PanelSize>().0.lock().unwrap() = (logical_width, logical_height);
        save_panel_size(app, logical_width, logical_height);
    }
}

// Called once RESIZE_SETTLE_MS after the last native WindowEvent::Resized —
// i.e. the user has let go of the edge. Native single-edge resize naturally
// drags the window's center away from wherever it started (same as any
// ordinary OS window); this animates it back to the anchor center x
// captured at the start of the drag (see the on_window_event handler) in
// one smooth, one-shot transition. Persisting the settled size is
// persist_panel_size's job, called by the settle thread before this.
fn recenter_after_resize(app: &tauri::AppHandle) {
    let Some(win) = app.get_webview_window("launcher") else { return };
    let anchor_x = app
        .state::<ResizeAnchor>()
        .0
        .lock()
        .unwrap()
        .map(|(cx, _)| cx);
    *app.state::<ResizeAnchor>().0.lock().unwrap() = None;
    let Some(anchor_x) = anchor_x else { return };

    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSWindow;
        use objc2_foundation::{NSPoint, NSRect};
        if let Ok(ptr) = win.ns_window() {
            let ns_win: &NSWindow = unsafe { &*(ptr as *mut NSWindow) };
            let frame = ns_win.frame();
            let mut new_x = anchor_x - frame.size.width / 2.0;
            if let Ok(Some(mon)) = win.current_monitor() {
                let mp = mon.position();
                let ms = mon.size();
                let max_x = mp.x as f64 + ms.width as f64 - frame.size.width;
                new_x = new_x.clamp(mp.x as f64, max_x.max(mp.x as f64));
            }
            let new_frame = NSRect {
                origin: NSPoint { x: new_x, y: frame.origin.y },
                size: frame.size,
            };
            // animate:true — this is a single one-shot transition after the
            // drag has already settled, not a per-frame update, so a smooth
            // native animation here is exactly what "плавненько" asked for.
            ns_win.setFrame_display_animate(new_frame, true, true);
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        if let Ok(size) = win.outer_size() {
            let new_x = (anchor_x - size.width as f64 / 2.0) as i32;
            if let Ok(pos) = win.outer_position() {
                let _ = win.set_position(tauri::PhysicalPosition::new(new_x, pos.y));
            }
        }
    }

}

#[tauri::command]
fn set_tray_count(app: tauri::AppHandle, n: u32) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_title(if n > 0 { Some(n.to_string()) } else { None });
    }
}

// App names are free-form (spaces, '&', '#', non-ASCII), so they can't be
// pasted into the window URL raw. Percent-encode everything outside the
// unreserved set rather than pulling in a crate for one call site.
fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

// Same direct-eval channel as reset_launcher_view: the two windows hold
// independent Redux stores, so the requested tab (and the app row to select)
// must travel natively into an already-open Workspace window — the frontend
// registers window.__openDashboardTab. A fresh window gets both from its URL
// instead, so this only runs on re-entry.
fn push_dashboard_target(win: &tauri::WebviewWindow, tab: Option<&str>, app_name: Option<&str>) {
    let tab = tab.filter(|t| matches!(*t, "apps" | "plugins" | "environment"));
    if tab.is_none() && app_name.is_none() {
        return;
    }
    // serde_json quotes/escapes both values — app names are free-form and
    // would otherwise break out of the JS string literal.
    let tab_arg = serde_json::to_string(&tab).unwrap_or_else(|_| "null".into());
    let app_arg = serde_json::to_string(&app_name).unwrap_or_else(|_| "null".into());
    let _ = win.eval(&format!(
        "window.__openDashboardTab && window.__openDashboardTab({tab_arg}, {app_arg})"
    ));
}

// Loki lives in the menu bar (Accessory: no Dock icon, not in Cmd+Tab), but
// while the Workspace window is open it is a real window people switch to and
// from, so it joins Cmd+Tab and the Dock for exactly that long.
fn set_workspace_switchable(app: &tauri::AppHandle, open: bool) {
    #[cfg(target_os = "macos")]
    {
        let policy = if open { ActivationPolicy::Regular } else { ActivationPolicy::Accessory };
        let _ = app.set_activation_policy(policy);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, open);
    }
}

#[tauri::command]
fn enter_dashboard(
    app: tauri::AppHandle,
    state_dash: tauri::State<DashboardOpen>,
    tab: Option<String>,
    // Deliberately single-word: Tauri maps JS camelCase onto snake_case params,
    // so an `app_name` here would silently arrive as None for a caller sending
    // `app` — and `app` itself is taken by the AppHandle above.
    selected: Option<String>,
) {
    // A fresh Workspace window boots on the 'apps' tab (uiSlice initialState),
    // the only tab callers pass today, so the tab needs no plumbing there. A
    // preselected app does: it travels as an extra `&app=` query param on the
    // window URL, read synchronously on first render (same channel as
    // `?window=workspace`). The eval below covers re-entry instead, when the
    // existing window may sit on another tab / another app.
    let workspace_url = match selected.as_deref() {
        Some(name) => format!("index.html?window=workspace&app={}", percent_encode(name)),
        None => "index.html?window=workspace".to_string(),
    };
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSWindow;
        use objc2_foundation::{NSPoint, NSRect, NSSize};
        use tauri_nspanel::ManagerExt;

        // Re-entry guard: Workspace is already open (tray click re-opens the
        // launcher popover even in Workspace mode, so the user can reach the
        // "Workspace" row again). Building a second window with the "main"
        // label fails with a duplicate-label error, which used to bounce into
        // the error path below — front the existing window instead and
        // dismiss the launcher popover.
        if let Some(win) = app.get_webview_window("main") {
            set_workspace_switchable(&app, true);
            let _ = win.show();
            let _ = win.set_focus();
            push_dashboard_target(&win, tab.as_deref(), selected.as_deref());
            if let Ok(panel) = app.get_webview_panel("launcher") {
                panel.order_out(None);
                reset_launcher_view(&app);
            }
            return;
        }

        // Capture launcher's live on-screen frame AND its screen before
        // touching anything — both are always valid/visible here, since the
        // "Workspace" row that triggers this command lives inside launcher's
        // own Settings view. Reading `.screen()` from launcher (already
        // mapped on-screen) rather than from "main" (not yet shown at the
        // point the target frame is computed below) matters: NSWindow.screen
        // can return nil for a window that hasn't been ordered front yet,
        // which silently fell back to `current_frame` as the "screen" and
        // centered the 900x640 target INSIDE launcher's own small frame —
        // the bug where Workspace opened pinned to launcher's corner instead
        // of centered on the real display.
        let Some((current_frame, screen_frame)) = app
            .get_webview_window("launcher")
            .and_then(|w| w.ns_window().ok())
            .map(|ptr| {
                let ns_win: &NSWindow = unsafe { &*(ptr as *mut NSWindow) };
                let frame = ns_win.frame();
                let screen_frame = ns_win.screen().map(|s| s.frame()).unwrap_or(frame);
                (frame, screen_frame)
            })
        else {
            return;
        };

        // Launcher stays visible (but occluded) until the grow animation
        // completes — animate_dashboard_grow hides it on its last step.
        // "main" is created fresh per Workspace session (paired with the
        // `win.close()` in exit_dashboard) and is never converted to an
        // NSPanel — it only ever needs to be a plain resizable window for
        // its short lifetime, so there's no popover chrome to set up here.
        // `?window=workspace` lets the frontend resolve its window role
        // synchronously on first render (see app/src/hooks/windowRole.ts)
        // — no async label lookup, no flash of the popover UI while the
        // window is already growing.
        let win = match tauri::WebviewWindowBuilder::new(
            &app,
            "main",
            tauri::WebviewUrl::App(workspace_url.clone().into()),
        )
        .decorations(false)
        .transparent(true)
        .resizable(true)
        .visible(false)
        .always_on_top(false)
        .skip_taskbar(true)
        .inner_size(DEFAULT_PANEL_WIDTH, DEFAULT_PANEL_HEIGHT)
        .build()
        {
            Ok(win) => win,
            Err(e) => {
                eprintln!("Failed to create Workspace window: {e}");
                // Make sure the launcher popover is (still) visible so the
                // user isn't left with neither window on screen.
                if let Ok(panel) = app.get_webview_panel("launcher") {
                    panel.show();
                }
                return;
            }
        };

        if let Ok(ptr) = win.ns_window() {
            let ns_win: &NSWindow = unsafe { &*(ptr as *mut NSWindow) };

            // Exact position/size match to launcher's vacated spot, before
            // the window is shown — no display/animate needed pre-show.
            ns_win.setFrame_display_animate(current_frame, false, false);

            // Tauri's set_max_size(None) does not reliably clear the native
            // NSWindow contentMaxSize on macOS — set both content min/max
            // directly so growth toward the 900x640 target is never
            // silently clamped back down.
            ns_win.setContentMinSize(NSSize { width: MIN_WORKSPACE_WIDTH, height: MIN_WORKSPACE_HEIGHT });
            ns_win.setContentMaxSize(NSSize { width: 100_000.0, height: 100_000.0 });
        }

        // Compute a centered frame on whichever screen launcher currently
        // lives on (captured above, before "main" existed), at the size the
        // user last left Workspace at — not the old hardcoded 900x640.
        let (ws_width, ws_height) = *app.state::<WorkspaceSize>().0.lock().unwrap();
        let target_size = NSSize { width: ws_width, height: ws_height };
        let origin = NSPoint {
            x: screen_frame.origin.x + (screen_frame.size.width - target_size.width) / 2.0,
            y: screen_frame.origin.y + (screen_frame.size.height - target_size.height) / 2.0,
        };
        let target_frame = NSRect { origin, size: target_size };

        set_workspace_switchable(&app, true);
        let _ = win.show();
        let _ = win.set_focus();

        // Native-thread grow animation — see animate_dashboard_grow for why
        // this must not depend on any webview's rAF loop.
        animate_dashboard_grow(app.clone(), current_frame, target_frame);

        state_dash
            .0
            .store(true, std::sync::atomic::Ordering::SeqCst);
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Re-entry guard — same as the macOS branch above.
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.show();
            let _ = win.set_focus();
            push_dashboard_target(&win, tab.as_deref(), selected.as_deref());
            if let Some(launcher) = app.get_webview_window("launcher") {
                let _ = launcher.hide();
                reset_launcher_view(&app);
            }
            return;
        }

        let launcher_pos = app
            .get_webview_window("launcher")
            .and_then(|w| w.outer_position().ok());

        if let Some(win) = app.get_webview_window("launcher") {
            let _ = win.hide();
            reset_launcher_view(&app);
        }

        let mut builder = tauri::WebviewWindowBuilder::new(
            &app,
            "main",
            tauri::WebviewUrl::App(workspace_url.clone().into()),
        )
        .decorations(false)
        .transparent(true)
        .resizable(true)
        .visible(false)
        .always_on_top(false)
        // Shown in the taskbar / Alt+Tab while open, like Cmd+Tab on macOS.
        .skip_taskbar(false)
        .title("Loki")
        .inner_size(DEFAULT_PANEL_WIDTH, DEFAULT_PANEL_HEIGHT);

        if let Some(pos) = launcher_pos {
            builder = builder.position(pos.x as f64, pos.y as f64);
        }

        let (ws_width, ws_height) = *app.state::<WorkspaceSize>().0.lock().unwrap();

        if let Ok(win) = builder.build() {
            let _ = win.show();
            let _ = win.set_size(tauri::LogicalSize::new(ws_width, ws_height));

            // Center manually on the current monitor (NSPanel ignores center()).
            if let Ok(Some(mon)) = win.current_monitor() {
                let scale = win.scale_factor().unwrap_or(1.0);
                let msz = mon.size();
                let mpos = mon.position();
                let w = (ws_width * scale) as i32;
                let h = (ws_height * scale) as i32;
                let x = mpos.x + (msz.width as i32 - w) / 2;
                let y = mpos.y + (msz.height as i32 - h) / 2;
                let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
            }
        }

        state_dash
            .0
            .store(true, std::sync::atomic::Ordering::SeqCst);
    }
}

#[tauri::command]
fn exit_dashboard(app: tauri::AppHandle, state_dash: tauri::State<DashboardOpen>) {
    // "main" is created fresh every time Workspace opens (see
    // enter_dashboard) and is never converted to an NSPanel, so there's
    // nothing to restore — just close it outright; the next Workspace open
    // builds a brand new window. Capture its size first: close() destroys the
    // window, and the debounced Resized persist may not have fired yet if the
    // user closed right after letting go of the edge.
    persist_workspace_size(&app);
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.close();
    }
    set_workspace_switchable(&app, false);

    // Closing Workspace does NOT re-show the launcher (user requirement:
    // nothing pops up on close — the launcher appears only via a tray
    // click). Still reset its view so the next tray reveal starts on the
    // main apps list, not wherever it was left (e.g. Settings).
    reset_launcher_view(&app);

    state_dash
        .0
        .store(false, std::sync::atomic::Ordering::SeqCst);
}

// --- task-5: packaged-branch resiliency (node discovery, health-poll, --------
// crash-marker + dialog + shell-out fallback). Extends the packaged spawn
// block task-4 already set up in `main()` below; does not touch the dev
// branch or the resource-path/env-handoff logic task-4 built.

// Д-4 (AC-7.1/AC-7.2): resolve a node executable through a fallback ladder
// instead of a bare `Command::new("node")`, because a packaged macOS `.app`
// launched from Finder inherits a minimal PATH that often does not include
// the user's Node.js install (nvm/homebrew shims live in shell-profile-only
// PATH extensions). Returns the first candidate that resolves; `None` means
// none of the fallbacks found a usable node.
// The backend needs Node 18+ (`fetch` is used unpolyfilled in
// backend/plugins/pluginStore.ts). A candidate that runs but is older is NOT
// usable: accepting it trades "node not found" — a message that tells the user
// what to do — for a crash deep inside the backend that does not.
const MIN_NODE_MAJOR: u32 = 18;

/// Why the ladder came up empty, so the fatal dialog can say something more
/// useful than "not found" when node exists but is too old.
enum NodeSearch {
    Found(PathBuf),
    /// Highest major version seen among candidates that ran but were rejected.
    TooOld(u32),
    NotFound,
}

/// The runtime `scripts/bundle-node-runtime.js` puts in the installer. It is
/// tried before anything on the machine so a fresh install works without a
/// Node.js setup, and so the backend always runs on the version CI tested.
fn bundled_node(resource_dir: &Path) -> PathBuf {
    let name = if cfg!(target_os = "windows") { "node.exe" } else { "node" };
    resource_dir.join("resources").join("node").join(name)
}

fn discover_node(resource_dir: &Path) -> NodeSearch {
    let mut newest_rejected: Option<u32> = None;

    let mut consider = |path: PathBuf| -> Option<PathBuf> {
        match node_major(&path) {
            Some(major) if major >= MIN_NODE_MAJOR => Some(path),
            Some(major) => {
                newest_rejected = Some(newest_rejected.map_or(major, |seen: u32| seen.max(major)));
                None
            }
            None => None,
        }
    };

    // 0. The runtime shipped inside the app. Absent when the build opted out
    // with LOKI_BUNDLE_NODE=0; then the ladder below finds the user's own.
    let bundled = bundled_node(resource_dir);
    if bundled.is_file() {
        if let Some(found) = consider(bundled) {
            return NodeSearch::Found(found);
        }
    }

    // 1. Plain "node" resolved via the process's own (possibly truncated) PATH.
    if let Some(found) = consider(PathBuf::from("node")) {
        return NodeSearch::Found(found);
    }

    // 2. Login-shell PATH: macOS Finder-launched apps do not source the
    // user's shell profile, so `~/.nvm`/homebrew PATH exports set up there
    // are invisible to step 1 above. Ask the login shell directly.
    #[cfg(not(target_os = "windows"))]
    if let Some(shell) = std::env::var_os("SHELL") {
        if let Ok(output) = Command::new(&shell).arg("-lc").arg("command -v node").output() {
            if output.status.success() {
                let resolved = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !resolved.is_empty() {
                    if let Some(found) = consider(PathBuf::from(resolved)) {
                        return NodeSearch::Found(found);
                    }
                }
            }
        }
    }

    // 3. Common install locations, tried in order; first usable file wins.
    for candidate in common_node_locations() {
        if candidate.is_file() {
            if let Some(found) = consider(candidate) {
                return NodeSearch::Found(found);
            }
        }
    }

    match newest_rejected {
        Some(major) => NodeSearch::TooOld(major),
        None => NodeSearch::NotFound,
    }
}

/// Runs `<path> --version` and parses the major version out of `vNN.x.y`.
/// `None` means the candidate did not run at all.
fn node_major(path: &Path) -> Option<u32> {
    let output = hide_console(Command::new(path).arg("--version")).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    text.trim()
        .trim_start_matches('v')
        .split('.')
        .next()?
        .parse()
        .ok()
}

// node.exe is a console program. Spawned from this GUI-subsystem app without
// CREATE_NO_WINDOW, Windows opens a console window for it, and closing that
// window kills the backend. Its own children inherit the hidden console.
#[cfg(target_os = "windows")]
fn hide_console(command: &mut Command) -> &mut Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW)
}

#[cfg(not(target_os = "windows"))]
fn hide_console(command: &mut Command) -> &mut Command {
    command
}

#[cfg(not(target_os = "windows"))]
fn common_node_locations() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(&home);

        // nvm: no single canonical path — pick any installed version under
        // ~/.nvm/versions/node/<version>/bin/node, newest-looking dir first.
        let nvm_versions = home.join(".nvm").join("versions").join("node");
        if let Ok(entries) = std::fs::read_dir(&nvm_versions) {
            let mut dirs: Vec<_> = entries.filter_map(|e| e.ok()).collect();
            dirs.sort_by_key(|e| e.file_name());
            dirs.reverse();
            for dir in dirs {
                candidates.push(dir.path().join("bin").join("node"));
            }
        }

        // fnm keeps the same layout one level deeper; like nvm it has no
        // stable "current" path unless the shell exported one.
        let fnm_versions = home
            .join(".local")
            .join("share")
            .join("fnm")
            .join("node-versions");
        if let Ok(entries) = std::fs::read_dir(&fnm_versions) {
            let mut dirs: Vec<_> = entries.filter_map(|e| e.ok()).collect();
            dirs.sort_by_key(|e| e.file_name());
            dirs.reverse();
            for dir in dirs {
                candidates.push(dir.path().join("installation").join("bin").join("node"));
            }
        }

        // Version managers that DO publish one stable shim path.
        candidates.push(home.join(".volta").join("bin").join("node"));
        candidates.push(home.join(".asdf").join("shims").join("node"));
        candidates.push(home.join(".local").join("bin").join("node"));
    }

    // homebrew (Apple Silicon, then Intel default prefix).
    candidates.push(PathBuf::from("/opt/homebrew/bin/node"));
    candidates.push(PathBuf::from("/usr/local/bin/node"));
    // Linux: distro packages land in /usr/bin; Linuxbrew has its own prefix.
    // Without these the ladder reached step 3 on Linux and always came up
    // empty — every macOS-shaped candidate above misses a plain `apt install
    // nodejs`.
    candidates.push(PathBuf::from("/usr/bin/node"));
    candidates.push(PathBuf::from("/home/linuxbrew/.linuxbrew/bin/node"));
    candidates
}

#[cfg(target_os = "windows")]
fn common_node_locations() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    candidates.push(PathBuf::from(r"C:\Program Files\nodejs\node.exe"));
    candidates.push(PathBuf::from(r"C:\Program Files (x86)\nodejs\node.exe"));
    // nvm-windows symlinks its active version at NVM_SYMLINK (defaults to
    // "C:\Program Files\nodejs" but is configurable in settings.txt).
    if let Some(symlink) = std::env::var_os("NVM_SYMLINK") {
        candidates.push(PathBuf::from(symlink).join("node.exe"));
    }
    if let Some(appdata) = std::env::var_os("APPDATA") {
        candidates.push(PathBuf::from(appdata).join("nvm").join("node.exe"));
    }
    candidates
}

// Д-6: crash-marker + dialog + shell-out fallback for any of the fatal
// packaged-branch errors (dirs not creatable, node not found, health-poll
// timeout, early child-exit). `panic = "abort"` stays set in the release
// profile (Cargo.toml, size-optimization profile — intentionally unchanged
// by this task), which means a panic inside the dialog call would abort the
// whole process immediately with no unwind: `catch_unwind` cannot be the
// primary way this becomes visible to the user. So the crash-marker file is
// written first, unconditionally, before the dialog is even attempted, and
// the shell-out fallback fires whenever the dialog call fails to confirm
// (not only if a panic happens to be caught).
fn report_fatal_error(app: &tauri::AppHandle, log_dir: &std::path::Path, message: &str) {
    // Step 1: crash-marker, before any dialog attempt. Plain fs::write, no
    // dependency on Tauri plugin state, so it lands even if the next step
    // aborts the process outright.
    let crash_log = log_dir.join("crash.log");
    let _ = std::fs::write(&crash_log, format!("{message}\n"));

    // Step 2: attempt the native dialog. Wrapped in catch_unwind as a
    // best-effort belt-and-suspenders (harmless if panic strategy ever
    // changes back to unwind), but the real contract is the Err path below.
    let dialog_ok = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        app.dialog()
            .message(message)
            .kind(MessageDialogKind::Error)
            .title("Loki Orchestrator")
            .blocking_show()
    }));

    // Step 3: always-attempt shell-out fallback on the Err/non-confirmed
    // path — this is the primary mechanism, not a catch_unwind-only branch.
    let confirmed = matches!(dialog_ok, Ok(true));
    if !confirmed {
        shell_out_fallback(message);
    }
}

#[cfg(target_os = "macos")]
fn shell_out_fallback(message: &str) {
    let script = format!(
        "display alert \"Loki Orchestrator\" message \"{}\" as critical",
        message.replace('\\', "\\\\").replace('"', "'")
    );
    let _ = Command::new("osascript").arg("-e").arg(script).status();
}

#[cfg(target_os = "windows")]
fn shell_out_fallback(message: &str) {
    let script = format!(
        "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('{}', 'Loki Orchestrator')",
        message.replace('\'', "''")
    );
    let _ = Command::new("powershell")
        .arg("-Command")
        .arg(script)
        .status();
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn shell_out_fallback(message: &str) {
    eprintln!("Loki Orchestrator fatal error: {message}");
}

/// What to tell the user when the backend died before answering. The usual
/// cause is another program already listening on port 9999; naming it
/// turns a vague "may be in use" into something the user can act on.
fn early_exit_message() -> String {
    match port_9999_owner() {
        Some(owner) => format!(
            "Port 9999 is already used by {owner}. Loki Orchestrator needs this port: \
             stop that program (or move it to another port) and start Loki again."
        ),
        None => "Loki Orchestrator backend exited before it became ready \
                 (port 9999 may already be in use)."
            .to_string(),
    }
}

/// "<command> (PID <pid>)" of the process listening on TCP 9999, via lsof.
#[cfg(unix)]
fn port_9999_owner() -> Option<String> {
    let output = Command::new("lsof")
        .args(["-nP", "-iTCP:9999", "-sTCP:LISTEN", "-Fpc"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let pid = text.lines().find_map(|l| l.strip_prefix('p'))?;
    let command = text.lines().find_map(|l| l.strip_prefix('c')).unwrap_or("another program");
    Some(format!("{command} (PID {pid})"))
}

#[cfg(not(unix))]
fn port_9999_owner() -> Option<String> {
    None
}

// Д-5 (AC-7.3): the packaged spawn only gets `Ok(child)` back from
// `Command::spawn()`, which just means the OS accepted the exec — the node
// process can still die milliseconds later (e.g. port 9999, hardcoded below,
// already in use: `server.ts` throws on `app.listen` and the child exits)
// with nothing surfaced anywhere. Race a health-check GET against
// `child.try_wait()` in a background thread so either outcome (early exit,
// or no 200 within the timeout budget) reports loudly instead of silently.
fn spawn_health_poll(app: tauri::AppHandle, log_dir: PathBuf) {
    std::thread::spawn(move || {
        // Checks the managed child's own liveness via `try_wait()`. Returns
        // `true` only when *our* child has actually exited — an intentional
        // quit (ExitRequested already flipped AppExiting and killed/took the
        // child) is not a crash, so this returns `false` in that case and
        // the caller stays silent instead of firing a fatal dialog.
        let is_own_child_dead = |app: &tauri::AppHandle| -> bool {
            if app
                .state::<AppExiting>()
                .0
                .load(std::sync::atomic::Ordering::SeqCst)
            {
                return false;
            }
            let state = app.state::<ServerProcess>();
            let mut guard = state.0.lock().unwrap();
            match guard.as_mut() {
                Some(child) => matches!(child.try_wait(), Ok(Some(_))),
                // None here only happens post-exit-request (guarded above) or
                // if spawn itself never populated the slot; either way it is
                // not "our child died", so don't report it as one.
                None => false,
            }
        };

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(8);
        loop {
            // Intentional quit in progress (ExitRequested already fired):
            // stop polling silently. Neither an early-exit nor a timeout
            // report is warranted for a normal shutdown.
            if app
                .state::<AppExiting>()
                .0
                .load(std::sync::atomic::Ordering::SeqCst)
            {
                return;
            }

            if is_own_child_dead(&app) {
                report_fatal_error(&app, &log_dir, &early_exit_message());
                return;
            }

            // task-5/should-fix-2: a *different* process already listening on
            // 9999 (e.g. another Loki instance) would also answer this GET
            // with 200, which would otherwise make a dead child look
            // "Healthy". Guard against that race by re-checking our own
            // child's liveness right after the call succeeds, rather than
            // trusting the pre-call check alone (the 500ms request window is
            // enough time for the child to have died in between).
            if ureq::get("http://127.0.0.1:9999/api/config")
                .timeout(std::time::Duration::from_millis(500))
                .call()
                .is_ok()
            {
                if is_own_child_dead(&app) {
                    report_fatal_error(&app, &log_dir, &early_exit_message());
                    return;
                }
                return; // Healthy.
            }

            if std::time::Instant::now() >= deadline {
                // Same race as the child-died branches above: an intentional
                // quit can flip AppExiting while this thread was blocked in
                // the ureq call above, and the deadline may have already
                // elapsed by the time control returns here. Re-check before
                // reporting so a legitimate shutdown during the last poll
                // window isn't misreported as "did not respond in time".
                if app
                    .state::<AppExiting>()
                    .0
                    .load(std::sync::atomic::Ordering::SeqCst)
                {
                    return;
                }
                report_fatal_error(
                    &app,
                    &log_dir,
                    "Loki Orchestrator backend did not respond in time.",
                );
                return;
            }

            std::thread::sleep(std::time::Duration::from_millis(250));
        }
    });
}

fn main() {
    let last_shown: Arc<Mutex<Option<std::time::Instant>>> = Arc::new(Mutex::new(None));
    let last_shown_tray = Arc::clone(&last_shown);
    let last_shown_event = Arc::clone(&last_shown);

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        // task-5/Д-6: registers the dialog plugin so app.dialog()/DialogExt is
        // available to the packaged-branch error handler below. Without this
        // line the capability permission and Cargo dependency do nothing —
        // the call site would hit an unmanaged-state panic instead.
        .plugin(tauri_plugin_dialog::init());

    // Register the tauri-nspanel plugin (macOS only) so that
    // WebviewPanelManager state is available and get_webview_panel() works
    // from any handler. Must be registered before setup() runs.
    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_nspanel::init());
    }

    builder
        .manage(ServerProcess(Mutex::new(None)))
        .manage(DashboardOpen(std::sync::atomic::AtomicBool::new(false)))
        .manage(AppExiting(std::sync::atomic::AtomicBool::new(false)))
        .manage(PanelSize(Mutex::new((DEFAULT_PANEL_WIDTH, DEFAULT_PANEL_HEIGHT))))
        .manage(WorkspaceSize(Mutex::new((
            DEFAULT_WORKSPACE_WIDTH,
            DEFAULT_WORKSPACE_HEIGHT,
        ))))
        .manage(ResizeAnchor(Mutex::new(None)))
        .manage(ProgrammaticResize(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            quit_app,
            set_tray_count,
            open_config_in_editor,
            open_in_terminal,
            focus_terminal,
            open_url,
            enter_dashboard,
            exit_dashboard,
            restart_backend
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(ActivationPolicy::Accessory);

            // Load the persisted popover size (survives restarts) before
            // anything positions/sizes the window.
            {
                let size = load_panel_size(&app.handle());
                *app.state::<PanelSize>().0.lock().unwrap() = size;

                let ws_size = load_workspace_size(&app.handle());
                *app.state::<WorkspaceSize>().0.lock().unwrap() = ws_size;
            }

            // Spawn the Express backend. Dev and packaged builds resolve the
            // server entry point differently (task-4/Д-1): in dev the repo's
            // own `dist/backend/server.js` is resolved from the Cargo manifest;
            // in a packaged `.app` there is no repo
            // checkout on disk, so the entry point, cwd and env handoff all
            // come from Tauri's app-scoped path API instead.
            {
                let state = app.state::<ServerProcess>();
                let mut guard = state.0.lock().unwrap();
                if guard.is_none() {
                    if cfg!(debug_assertions) {
                        // Dev branch: byte-identical to the pre-packaged-mode
                        // spawn. Do not change anything here.
                        match spawn_dev_backend() {
                            Ok(child) => *guard = Some(child),
                            Err(e) => eprintln!("Failed to start backend: {e}"),
                        }
                    } else {
                        // Packaged branch: no repo checkout to cd into and no
                        // bundled dist/ tree at a fixed relative path, so every
                        // path the backend needs is resolved through Tauri's
                        // app-scoped dirs and handed over via env instead of
                        // relying on cwd (AC-6.2/AC-6.3).
                        //
                        // app_config_dir()/app_log_dir() must exist before the
                        // backend spawns (it writes config/state/logs under
                        // them on first run); if we can't create them, surface
                        // that instead of silently spawning against a missing
                        // directory (AC-2.1/AC-2.2 — the loud dialog/crash-marker
                        // surface for this belongs to a later task, so this
                        // branch just refuses to spawn and logs).
                        let config_dir = app.path().app_config_dir();
                        let log_dir = app.path().app_log_dir();
                        let resource_dir = app.path().resource_dir();

                        match (config_dir, log_dir, resource_dir) {
                            (Ok(config_dir), Ok(log_dir), Ok(resource_dir)) => {
                                let config_mkdir = std::fs::create_dir_all(&config_dir);
                                let log_mkdir = std::fs::create_dir_all(&log_dir);

                                match (config_mkdir, log_mkdir) {
                                    (Ok(()), Ok(())) => {
                                        // Pinned resource-path contract (shared
                                        // with task-3/tauri.conf.json bundle.resources):
                                        // the server bundle and catalog live under
                                        // a `resources/` subdirectory of
                                        // resource_dir(), not at its root.
                                        let server_path =
                                            resource_dir.join("resources").join("server.js");
                                        let catalog_path =
                                            resource_dir.join("resources").join("catalog.json");
                                        let marketplace_dir =
                                            resource_dir.join("resources").join("marketplace");
                                        // app_config_dir() is already a private
                                        // per-app directory, so the config goes
                                        // straight in it — no `state`
                                        // nesting. The backend keeps state and
                                        // logs beside the config file, so this
                                        // one path decides the whole folder.
                                        let config_file = config_override()
                                            .unwrap_or_else(|| config_dir.join("loki-config.json"));

                                        // No `.current_dir()` here on purpose: the
                                        // packaged server is a single-file bundle
                                        // with an absolute path, so it needs no
                                        // cwd-relative resolution at all (AC-6.3).
                                        //
                                        // task-5/Д-4: node discovery ladder instead
                                        // of a bare `Command::new("node")` — see
                                        // discover_node() above.
                                        match discover_node(&resource_dir) {
                                            NodeSearch::Found(node_bin) => {
                                                match hide_console(&mut Command::new(&node_bin))
                                                    .arg(&server_path)
                                                    // task-5/grill-me: port is
                                                    // intentionally left
                                                    // hardcoded (no dynamic
                                                    // port allocation) per
                                                    // fr.md AC-7.3. A second
                                                    // instance (e.g. `tauri dev`
                                                    // running alongside this
                                                    // packaged app) makes our
                                                    // own `spawn()` succeed but
                                                    // the child's own
                                                    // `app.listen` fails, so it
                                                    // exits quickly — that
                                                    // early-exit IS caught by
                                                    // the health-poll below.
                                                    // What is NOT specially
                                                    // detected/handled is a
                                                    // squatter that also
                                                    // answers 200 on the same
                                                    // port: the poll re-checks
                                                    // this child's own
                                                    // liveness before trusting
                                                    // that 200 (see
                                                    // spawn_health_poll), so a
                                                    // dead child is still
                                                    // reported even then; only
                                                    // instance-identity
                                                    // handshaking (out of
                                                    // scope) would remain to
                                                    // fully attribute *which*
                                                    // process answered.
                                                    .env("LOKI_PORT", "9999")
                                                    .env("CONFIG_FILE", &config_file)
                                                    .env("CATALOG_FILE", &catalog_path)
                                                    .env("MARKETPLACE_DIR", &marketplace_dir)
                                                    .spawn()
                                                {
                                                    Ok(child) => {
                                                        *guard = Some(child);
                                                        // task-5/Д-5: race a
                                                        // health-check against
                                                        // early child-exit in
                                                        // the background so a
                                                        // silent death (e.g.
                                                        // port 9999 already
                                                        // taken) surfaces
                                                        // instead of vanishing.
                                                        drop(guard);
                                                        spawn_health_poll(
                                                            app.handle().clone(),
                                                            log_dir.clone(),
                                                        );
                                                    }
                                                    Err(e) => {
                                                        eprintln!(
                                                            "Failed to start backend: {e}"
                                                        );
                                                        report_fatal_error(
                                                            app.handle(),
                                                            &log_dir,
                                                            &format!(
                                                                "Failed to start the Loki Orchestrator backend: {e}"
                                                            ),
                                                        );
                                                    }
                                                }
                                            }
                                            // task-5/AC-7.2: no silent
                                            // eprintln-into-the-void — node
                                            // discovery exhausted every
                                            // fallback, so this is reported
                                            // the same way as any other
                                            // fatal packaged-branch error.
                                            NodeSearch::TooOld(major) => {
                                                // "Not found" would be a lie
                                                // here, and the lie costs the
                                                // user the one fact that makes
                                                // the fix obvious.
                                                let msg = format!(
                                                    "Node.js {major} is too old. Loki Orchestrator \
                                                     needs Node.js {MIN_NODE_MAJOR} or newer; \
                                                     install it and make sure it comes first on \
                                                     your PATH."
                                                );
                                                eprintln!("Failed to start backend: {msg}");
                                                report_fatal_error(app.handle(), &log_dir, &msg);
                                            }
                                            NodeSearch::NotFound => {
                                                eprintln!(
                                                    "Failed to start backend: Node.js not found"
                                                );
                                                report_fatal_error(
                                                    app.handle(),
                                                    &log_dir,
                                                    "Node.js not found. Loki Orchestrator could \
                                                     not locate a node executable in PATH or any \
                                                     common install location.",
                                                );
                                            }
                                        }
                                    }
                                    (config_mkdir, log_mkdir) => {
                                        if let Err(e) = config_mkdir {
                                            eprintln!(
                                                "Failed to create app_config_dir: {e}"
                                            );
                                        }
                                        if let Err(e) = log_mkdir {
                                            eprintln!("Failed to create app_log_dir: {e}");
                                        }
                                        report_fatal_error(
                                            app.handle(),
                                            &log_dir,
                                            "Loki Orchestrator could not create its config/log \
                                             directory and cannot start.",
                                        );
                                    }
                                }
                            }
                            (config_dir, log_dir, resource_dir) => {
                                if let Err(e) = config_dir {
                                    eprintln!("Failed to resolve app_config_dir: {e}");
                                }
                                if let Err(e) = log_dir {
                                    eprintln!("Failed to resolve app_log_dir: {e}");
                                }
                                if let Err(e) = resource_dir {
                                    eprintln!("Failed to resolve resource_dir: {e}");
                                }
                                // No app_log_dir() to write crash.log into if
                                // that very lookup is what failed — fall back
                                // to the OS temp dir so the marker still lands
                                // somewhere discoverable.
                                report_fatal_error(
                                    app.handle(),
                                    &std::env::temp_dir(),
                                    "Loki Orchestrator could not resolve its application \
                                     directories and cannot start.",
                                );
                            }
                        }
                    }
                }
            }

            // Convert the "launcher" WebviewWindow to an NSPanel once at
            // startup ("main" is never a panel — it's created fresh, as a
            // plain window, only while Workspace is open; see
            // enter_dashboard/exit_dashboard). This must be done exactly
            // once; subsequent access goes through
            // app_handle.get_webview_panel(label).
            #[cfg(target_os = "macos")]
            {
                use tauri_nspanel::{cocoa::appkit::NSWindowCollectionBehavior, WebviewWindowExt};

                // `resizable` only affects the style mask here — once a window is
                // panel-ified, tauri-nspanel (not Tauri's own resizable config)
                // governs whether the native edge-drag resize is available.
                let setup_popover_panel = |label: &str, resizable: bool| {
                    if let Some(win) = app.get_webview_window(label) {
                        let panel = win.to_panel().unwrap();

                        // NonactivatingPanel (1 << 7 = 128): the panel never activates
                        // the app nor steals focus/Space from a fullscreen app.
                        #[allow(non_upper_case_globals)]
                        const NSWindowStyleMaskNonActivatingPanel: i32 = 1 << 7;
                        // Resizable (1 << 3 = 8): native edge-drag resize for the
                        // popover's width (height is locked via min==max size).
                        #[allow(non_upper_case_globals)]
                        const NSWindowStyleMaskResizable: i32 = 1 << 3;
                        let mut style_mask = NSWindowStyleMaskNonActivatingPanel;
                        if resizable {
                            style_mask |= NSWindowStyleMaskResizable;
                        }
                        panel.set_style_mask(style_mask);

                        // Allow the panel to appear on top of any fullscreen Space
                        // and on every Space simultaneously.
                        panel.set_collection_behaviour(
                            NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
                                | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary,
                        );

                        // Float window level (4): sits above normal windows and
                        // fullscreen app chrome without going above system UI.
                        #[allow(non_upper_case_globals)]
                        const NSFloatWindowLevel: i32 = 4;
                        panel.set_level(NSFloatWindowLevel);

                        // Start hidden; the tray click handler will show it.
                        panel.order_out(None);
                    }
                };

                // Launcher now owns the resizable popover behavior "main"
                // used to have (edge-drag resize, PanelSize persistence,
                // position-under-tray, the resize-anchor recenter system).
                setup_popover_panel("launcher", true);
            }

            // On non-macOS platforms just hide the window normally.
            #[cfg(not(target_os = "macos"))]
            if let Some(win) = app.get_webview_window("launcher") {
                let _ = win.hide();
            }

            let tray_image = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))
                .expect("failed to load tray icon");
            TrayIconBuilder::with_id("main-tray")
                .icon(tray_image)
                .icon_as_template(true)
                .on_tray_icon_event(move |tray, event| {
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        rect,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();

                        // Launcher popover show/hide toggle — runs on EVERY tray click,
                        // Workspace open or not (user requirement: the icon always
                        // brings up the launcher; its NSPanel float level puts it above
                        // the Workspace window). Launcher is the permanent home of the
                        // compact tray popover, "main" is reserved solely for the
                        // Workspace view.
                        #[cfg(target_os = "macos")]
                        {
                            use tauri_nspanel::ManagerExt;

                            if let Ok(panel) = app.get_webview_panel("launcher") {
                                if !panel.is_visible() {
                                    if let Some(win) = app.get_webview_window("launcher") {
                                        let (panel_width, panel_height) = *app.state::<PanelSize>().0.lock().unwrap();
                                        mark_programmatic_resize(app);
                                        force_compact(&win, panel_width, panel_height);

                                        // Position the popover directly under the tray icon.
                                        // set_position still operates on the underlying WebviewWindow
                                        // which shares the same NSWindow pointer as the panel.
                                        position_under_tray(&win, &rect, panel_width);
                                    }

                                    *last_shown_tray.lock().unwrap() =
                                        Some(std::time::Instant::now());

                                    // Show via panel: orderFrontRegardless so the panel
                                    // appears even when the app is not active (Accessory mode).
                                    panel.show();

                                    // The only Rust->JS signal left: force the view back to
                                    // the main menu on every reveal (confirmed requirement —
                                    // Settings has no icon-driven memory anymore).
                                    reset_launcher_view(&app);
                                } else {
                                    panel.order_out(None);
                                    reset_launcher_view(&app);
                                }
                            }
                        }

                        #[cfg(not(target_os = "macos"))]
                        if let Some(win) = app.get_webview_window("launcher") {
                            if !win.is_visible().unwrap_or(false) {
                                // Windows taskbar/tray sits at the bottom, so the popover
                                // must open above the icon, not below it as on macOS.
                                // TrayCenter already accounts for this per-OS (its y calc
                                // subtracts the window height, i.e. places the window above
                                // the tray rect), so no manual offset math is needed here.
                                use tauri_plugin_positioner::{Position, WindowExt};
                                let _ = win.move_window(Position::TrayCenter);

                                let _ = win.show();
                                reset_launcher_view(&app);
                            } else {
                                let _ = win.hide();
                                reset_launcher_view(&app);
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(move |window, event| {
            // However Workspace goes away (exit_dashboard, Cmd+Q on the
            // window, a crash of its webview), Loki drops back out of Cmd+Tab.
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    set_workspace_switchable(window.app_handle(), false);
                    window
                        .app_handle()
                        .state::<DashboardOpen>()
                        .0
                        .store(false, std::sync::atomic::Ordering::SeqCst);
                }
                return;
            }
            // NSPanel with NonactivatingPanel style mask does NOT normally fire
            // Focused(false) because it never becomes the key window. However if
            // the OS does send it (e.g. another window comes to front) we still
            // want to dismiss the popover after a short grace period.
            if let tauri::WindowEvent::Focused(false) = event {
                // The launcher popover dismisses on blur/click-outside unconditionally
                // — unlike "main" it has no dual-purpose Workspace mode to preserve.
                if window.label() == "launcher" {
                    #[cfg(target_os = "macos")]
                    {
                        use tauri_nspanel::ManagerExt;
                        if let Ok(panel) = window.app_handle().get_webview_panel("launcher") {
                            panel.order_out(None);
                        }
                    }
                    #[cfg(not(target_os = "macos"))]
                    let _ = window.hide();
                    reset_launcher_view(window.app_handle());
                    return;
                }
                if window
                    .app_handle()
                    .state::<DashboardOpen>()
                    .0
                    .load(std::sync::atomic::Ordering::SeqCst)
                {
                    return;
                }
                let should_hide = {
                    let guard = last_shown_event.lock().unwrap();
                    match *guard {
                        Some(t) => t.elapsed() > std::time::Duration::from_millis(300),
                        None => true,
                    }
                };
                if should_hide {
                    #[cfg(target_os = "macos")]
                    {
                        use tauri_nspanel::ManagerExt;
                        if let Ok(panel) = window.app_handle().get_webview_panel("main") {
                            panel.order_out(None);
                        }
                    }
                    #[cfg(not(target_os = "macos"))]
                    let _ = window.hide();
                }
            }

            // Native edge-drag resize (see the resizable NSPanel styleMask in
            // setup()) fires a Resized event per frame while dragging. Debounce:
            // capture the pre-drag center as an anchor on the first event of a
            // burst, then recenter once RESIZE_SETTLE_MS after the last one —
            // i.e. once the user has actually let go.
            if let tauri::WindowEvent::Resized(_) = event {
                // "main" (Workspace) is a normal window, so it must NOT recenter —
                // but it still has to persist its size, which is what the old
                // blanket `return` here dropped on the floor. Debounce it on the
                // same settle timer and leave the recenter path below to
                // "launcher" alone.
                if window.label() == "main" {
                    let app_handle = window.app_handle().clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(RESIZE_SETTLE_MS));
                        let for_main_thread = app_handle.clone();
                        let _ = app_handle.run_on_main_thread(move || {
                            persist_workspace_size(&for_main_thread);
                        });
                    });
                    return;
                }
                if window.label() != "launcher" {
                    return;
                }
                let app_handle = window.app_handle();
                if app_handle
                    .state::<DashboardOpen>()
                    .0
                    .load(std::sync::atomic::Ordering::SeqCst)
                {
                    return;
                }
                // Skip resizes we triggered ourselves (force_compact on tray
                // show, dashboard enter/exit). Their final position is already
                // set correctly by the caller; letting recenter_after_resize
                // run would yank the window back to a stale pre-resize center —
                // that was the "launcher shifts left on icon click" bug.
                {
                    let prog_state = app_handle.state::<ProgrammaticResize>();
                    let mut prog = prog_state.0.lock().unwrap();
                    if let Some(t) = *prog {
                        if t.elapsed() < std::time::Duration::from_millis(PROGRAMMATIC_RESIZE_GRACE_MS) {
                            // Drop any anchor captured during this programmatic
                            // burst so a later user drag starts clean.
                            *app_handle.state::<ResizeAnchor>().0.lock().unwrap() = None;
                            return;
                        }
                        *prog = None;
                    }
                }
                let Some(webview_win) = app_handle.get_webview_window("launcher") else { return };
                let anchor_state = app_handle.state::<ResizeAnchor>();
                let mut guard = anchor_state.0.lock().unwrap();
                let now = std::time::Instant::now();
                let is_new_burst = match *guard {
                    Some((_, t)) => now.duration_since(t) > std::time::Duration::from_millis(RESIZE_SETTLE_MS),
                    None => true,
                };
                let anchor_x = if is_new_burst {
                    current_center_x(&webview_win)
                } else {
                    guard.map(|(cx, _)| cx).unwrap_or_else(|| current_center_x(&webview_win))
                };
                *guard = Some((anchor_x, now));
                drop(guard);

                let app_handle = app_handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(RESIZE_SETTLE_MS));
                    let settled = {
                        let state = app_handle.state::<ResizeAnchor>();
                        let g = state.0.lock().unwrap();
                        matches!(*g, Some((_, t)) if t.elapsed() >= std::time::Duration::from_millis(RESIZE_SETTLE_MS))
                    };
                    if settled {
                        // AppKit (NSWindow/setFrame_display_animate inside
                        // recenter_after_resize) is main-thread-only — calling
                        // it from this background sleeper thread is undefined
                        // behavior and is what was crashing the app right
                        // after a resize. Hop back to the main thread first.
                        let for_main_thread = app_handle.clone();
                        let _ = app_handle.run_on_main_thread(move || {
                            // Persist FIRST, unconditionally: recenter_after_resize
                            // bails out early when the anchor is gone, and the size
                            // must survive that path too.
                            persist_panel_size(&for_main_thread);
                            recenter_after_resize(&for_main_thread);
                        });
                    }
                });
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                // Flip this BEFORE killing/taking the child: the health-poll
                // thread reads it on every tick and a `None` slot it observes
                // afterwards is then known to be an intentional shutdown, not
                // a crash (see AppExiting's doc comment above).
                if let Some(exiting) = app_handle.try_state::<AppExiting>() {
                    exiting.0.store(true, std::sync::atomic::Ordering::SeqCst);
                }
                if let Some(state) = app_handle.try_state::<ServerProcess>() {
                    if let Some(mut child) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        });
}
