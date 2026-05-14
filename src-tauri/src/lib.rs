use enigo::{Direction, Enigo, Key, Keyboard, Mouse, Settings as EnigoSettings};
use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicI32, Ordering},
    mpsc::SyncSender,
    Mutex, OnceLock,
};
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_store::StoreExt;

#[cfg(windows)]
use winapi::{
    shared::minwindef::{LPARAM, LRESULT, WPARAM},
    um::{libloaderapi::GetModuleHandleW, winuser::*},
};

static HOOK_TX: OnceLock<SyncSender<()>> = OnceLock::new();
static MOUSE_DOWN_X: AtomicI32 = AtomicI32::new(0);
static MOUSE_DOWN_Y: AtomicI32 = AtomicI32::new(0);

// ── Data model ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub model: String,
    pub api_key: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub providers: Vec<Provider>,
    pub active_provider_id: String,
    pub trigger_mode: String,
    pub min_chars: u32,
    pub popup_linger_ms: u64,
    pub system_prompt: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            providers: vec![Provider {
                id: "zhipu".to_string(),
                name: "智谱 AI".to_string(),
                base_url: "https://open.bigmodel.cn/api/paas/v4".to_string(),
                model: "glm-4.5-air".to_string(),
                api_key: String::new(),
            }],
            active_provider_id: "zhipu".to_string(),
            trigger_mode: "auto".to_string(),
            min_chars: 2,
            popup_linger_ms: 0,
            system_prompt: None,
        }
    }
}

pub struct ConfigState(pub Mutex<AppConfig>);
pub struct SidecarState(pub Mutex<Option<u16>>);

// ── Config persistence ────────────────────────────────────────────────────────

fn load_config_from_store(app: &AppHandle) -> AppConfig {
    let store = match app.store("settings.json") {
        Ok(s) => s,
        Err(_) => return AppConfig::default(),
    };
    if let Some(val) = store.get("config") {
        if let Ok(cfg) = serde_json::from_value::<AppConfig>(val) {
            return cfg;
        }
    }
    // Migrate from old per-key format
    let api_key = store.get("api_key").and_then(|v| v.as_str().map(str::to_string)).unwrap_or_default();
    let base_url = store.get("base_url").and_then(|v| v.as_str().map(str::to_string))
        .unwrap_or_else(|| "https://open.bigmodel.cn/api/paas/v4".to_string());
    let model = store.get("model").and_then(|v| v.as_str().map(str::to_string))
        .unwrap_or_else(|| "glm-4.5-air".to_string());
    let system_prompt = store.get("system_prompt").and_then(|v| v.as_str().map(str::to_string));
    AppConfig {
        providers: vec![Provider { id: "default".to_string(), name: "默认".to_string(), base_url, model, api_key }],
        active_provider_id: "default".to_string(),
        trigger_mode: "auto".to_string(),
        min_chars: 2,
        popup_linger_ms: 0,
        system_prompt,
    }
}

fn persist_config(app: &AppHandle, config: &AppConfig) {
    if let Ok(store) = app.store("settings.json") {
        let _ = store.set("config", serde_json::to_value(config).unwrap_or(serde_json::Value::Null));
        let _ = store.save();
    }
}

fn start_sidecar(app: &AppHandle) {
    let app_handle = app.clone();
    std::thread::spawn(move || {
        let config_dir = match app_handle.path().app_data_dir() {
            Ok(d) => d,
            Err(e) => { eprintln!("app_data_dir error: {}", e); return; }
        };
        if let Err(e) = std::fs::create_dir_all(&config_dir) {
            eprintln!("create_dir_all error: {}", e); return;
        }
        let config_path = config_dir.join("settings.json");

        let is_dev = cfg!(debug_assertions);
        let mut cmd = if is_dev {
            let project_root = std::env::var("CARGO_MANIFEST_DIR")
                .map(std::path::PathBuf::from)
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
            let sidecar_path = project_root.join("sidecar/dist/index.cjs");
            let mut c = Command::new("node");
            c.arg(&sidecar_path);
            c.current_dir(&project_root);
            c
        } else {
            Command::new("sidecar")
        };

        let mut child = match cmd
            .arg("--config-path")
            .arg(&config_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => { eprintln!("spawn sidecar failed: {}", e); return; }
        };

        if let Some(stderr) = child.stderr.take() {
            std::thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        eprintln!("[sidecar stderr] {}", line);
                    }
                }
            });
        }

        if let Some(stdout) = child.stdout.take() {
            let reader = BufReader::new(stdout);
            let start = Instant::now();
            for line in reader.lines() {
                if start.elapsed() > Duration::from_secs(10) {
                    eprintln!("sidecar start timeout"); break;
                }
                match line {
                    Ok(line) => {
                        println!("[sidecar stdout] {}", line);
                        if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&line) {
                            if msg.get("type").and_then(|v| v.as_str()) == Some("ready") {
                                if let Some(port) = msg.get("port").and_then(|v| v.as_u64()) {
                                    if let Some(state) = app_handle.try_state::<SidecarState>() {
                                        *state.0.lock().unwrap() = Some(port as u16);
                                    }
                                    println!("Sidecar ready on port {}", port);
                                    return;
                                }
                            }
                        }
                    }
                    Err(e) => { eprintln!("read line error: {}", e); break; }
                }
            }
        }
        eprintln!("sidecar failed to start or did not emit ready");
    });
}

// ── Tray menu ─────────────────────────────────────────────────────────────────

fn build_tray_menu<M: Manager<tauri::Wry>>(manager: &M, config: &AppConfig) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{MenuBuilder, MenuItem, PredefinedMenuItem};
    let toggle = MenuItem::with_id(manager, "toggle", "● 划词翻译  已启用", false, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(manager)?;
    let provider_items: Vec<MenuItem<tauri::Wry>> = config.providers.iter().map(|p| {
        let label = if p.id == config.active_provider_id { format!("✓  {}", p.name) } else { format!("    {}", p.name) };
        MenuItem::with_id(manager, format!("provider:{}", p.id), label, true, None::<&str>)
    }).collect::<tauri::Result<_>>()?;
    let sep2 = PredefinedMenuItem::separator(manager)?;
    let auto_item = MenuItem::with_id(manager, "trigger:auto",
        if config.trigger_mode == "auto" { "✓  自动翻译" } else { "    自动翻译" }, true, None::<&str>)?;
    let btn_item = MenuItem::with_id(manager, "trigger:button",
        if config.trigger_mode == "button" { "✓  显示按钮" } else { "    显示按钮" }, true, None::<&str>)?;
    let sep3 = PredefinedMenuItem::separator(manager)?;
    let settings_item = MenuItem::with_id(manager, "settings", "设置…", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(manager, "quit", "退出", true, None::<&str>)?;
    let mut builder = MenuBuilder::new(manager).item(&toggle).item(&sep1);
    for item in &provider_items { builder = builder.item(item); }
    builder.item(&sep2).item(&auto_item).item(&btn_item).item(&sep3).item(&settings_item).item(&quit_item).build()
}

fn rebuild_tray(app: &AppHandle, config: &AppConfig) {
    if let Ok(menu) = build_tray_menu(app, config) {
        if let Some(tray) = app.tray_by_id("main-tray") {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

// ── Windows mouse hook ────────────────────────────────────────────────────────

#[cfg(windows)]
unsafe extern "system" fn mouse_hook_proc(n_code: i32, w_param: WPARAM, l_param: LPARAM) -> LRESULT {
    if n_code >= 0 {
        let ms = &*(l_param as *const MSLLHOOKSTRUCT);
        match w_param as u32 {
            WM_LBUTTONDOWN => {
                MOUSE_DOWN_X.store(ms.pt.x, Ordering::Relaxed);
                MOUSE_DOWN_Y.store(ms.pt.y, Ordering::Relaxed);
            }
            WM_LBUTTONUP => {
                let dx = ms.pt.x - MOUSE_DOWN_X.load(Ordering::Relaxed);
                let dy = ms.pt.y - MOUSE_DOWN_Y.load(Ordering::Relaxed);
                if dx * dx + dy * dy > 225 {
                    if let Some(tx) = HOOK_TX.get() { let _ = tx.try_send(()); }
                }
            }
            _ => {}
        }
    }
    CallNextHookEx(std::ptr::null_mut(), n_code, w_param, l_param)
}

#[cfg(windows)]
fn start_mouse_hook(app: AppHandle) {
    let (tx, rx) = std::sync::mpsc::sync_channel::<()>(1);
    let _ = HOOK_TX.set(tx);
    std::thread::spawn(move || {
        for () in rx {
            for label in &["popup", "trigger-btn"] {
                if let Some(w) = app.get_webview_window(label) {
                    if w.is_focused().unwrap_or(false) { continue; }
                }
            }
            let app = app.clone();
            tauri::async_runtime::spawn(async move { handle_translate_shortcut(app).await; });
        }
    });
    std::thread::spawn(|| unsafe {
        let hook = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook_proc), GetModuleHandleW(std::ptr::null()), 0);
        if hook.is_null() { return; }
        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        UnhookWindowsHookEx(hook);
    });
}

// ── Sidecar URL ──────────────────────────────────────────────────────────────

#[tauri::command]
fn get_sidecar_url(sidecar_state: tauri::State<'_, SidecarState>) -> Result<String, String> {
    let port = sidecar_state.0.lock().map_err(|e| e.to_string())?
        .ok_or_else(|| "Sidecar 尚未启动，请稍后重试".to_string())?;
    Ok(format!("http://localhost:{}", port))
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
fn get_config(config_state: tauri::State<'_, ConfigState>) -> Result<AppConfig, String> {
    config_state.0.lock().map(|c| c.clone()).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_config(config: AppConfig, app: tauri::AppHandle, config_state: tauri::State<'_, ConfigState>) -> Result<(), String> {
    { let mut c = config_state.0.lock().map_err(|e| e.to_string())?; *c = config.clone(); }
    persist_config(&app, &config);
    rebuild_tray(&app, &config);
    let _ = app.emit("config-changed", &config);
    Ok(())
}

#[tauri::command]
fn show_popup(text: String, x: i32, y: i32, app: tauri::AppHandle) -> Result<(), String> {
    if let Some(popup) = app.get_webview_window("popup") {
        let _ = popup.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: 420, height: 320 }));
        let _ = popup.set_position(tauri::PhysicalPosition::new(x, y));
        let _ = popup.show();
        let _ = popup.set_focus();
        let _ = popup.emit("selection-text", SelectionPayload { text, x, y });
    }
    Ok(())
}

// ── Selection payload & shortcut handler ─────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SelectionPayload { pub text: String, pub x: i32, pub y: i32 }

async fn handle_translate_shortcut(app: AppHandle) {
    let (trigger_mode, min_chars) = {
        let cs = app.state::<ConfigState>();
        let cfg = cs.0.lock().unwrap();
        (cfg.trigger_mode.clone(), cfg.min_chars)
    };
    let mut enigo = match Enigo::new(&EnigoSettings::default()) {
        Ok(e) => e, Err(e) => { eprintln!("Enigo: {}", e); return; }
    };
    let (cursor_x, cursor_y) = enigo.location().unwrap_or((100, 100));
    let prev_clipboard = app.clipboard().read_text().unwrap_or_default();
    let _ = enigo.key(Key::Control, Direction::Press);
    let _ = enigo.key(Key::Unicode('c'), Direction::Click);
    let _ = enigo.key(Key::Control, Direction::Release);
    tokio::time::sleep(Duration::from_millis(300)).await;
    let selected_text = match app.clipboard().read_text() { Ok(t) => t, Err(_) => return };
    let selected_text = selected_text.trim().to_string();
    if selected_text.is_empty() || selected_text == prev_clipboard.trim() || selected_text.chars().count() < min_chars as usize { return; }
    let (mut pos_x, mut pos_y) = (cursor_x + 20, cursor_y + 20);
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let sw = monitor.size().width as i32;
        let sh = monitor.size().height as i32;
        pos_x = pos_x.min(sw - 440).max(0);
        pos_y = pos_y.min(sh - 340).max(0);
    }
    if trigger_mode == "button" {
        if let Some(btn_win) = app.get_webview_window("trigger-btn") {
            let _ = btn_win.set_position(tauri::PhysicalPosition::new(cursor_x + 12, cursor_y + 4));
            let _ = btn_win.show();
            let _ = btn_win.set_focus();
            let _ = btn_win.emit("trigger-ready", SelectionPayload { text: selected_text, x: pos_x, y: pos_y });
        }
    } else {
        if let Some(popup) = app.get_webview_window("popup") {
            let _ = popup.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: 420, height: 320 }));
            let _ = popup.set_position(tauri::PhysicalPosition::new(pos_x, pos_y));
            let _ = popup.show();
            let _ = popup.set_focus();
            let _ = popup.emit("selection-text", SelectionPayload { text: selected_text, x: pos_x, y: pos_y });
        }
    }
}

// ── App entry ─────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let config = load_config_from_store(&app.handle());
            let menu = build_tray_menu(app, &config)?;
            tauri::tray::TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("划词翻译")
                .on_menu_event(|app, event| {
                    let id = event.id().as_ref();
                    match id {
                        "quit" => app.exit(0),
                        "settings" => {
                            if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.set_focus(); }
                        }
                        id if id.starts_with("provider:") => {
                            let provider_id = id["provider:".len()..].to_string();
                            let cs = app.state::<ConfigState>();
                            let new_cfg = { let mut c = cs.0.lock().unwrap(); c.active_provider_id = provider_id; c.clone() };
                            persist_config(app, &new_cfg);
                            rebuild_tray(app, &new_cfg);
                            let _ = app.emit("config-changed", &new_cfg);
                        }
                        "trigger:auto" | "trigger:button" => {
                            let mode = if id == "trigger:auto" { "auto" } else { "button" };
                            let cs = app.state::<ConfigState>();
                            let new_cfg = { let mut c = cs.0.lock().unwrap(); c.trigger_mode = mode.to_string(); c.clone() };
                            persist_config(app, &new_cfg);
                            rebuild_tray(app, &new_cfg);
                            let _ = app.emit("config-changed", &new_cfg);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    use tauri::tray::{MouseButton, TrayIconEvent};
                    if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.set_focus(); }
                    }
                })
                .build(app)?;
            app.manage(ConfigState(Mutex::new(config)));
            app.manage(SidecarState(Mutex::new(None)));
            start_sidecar(app.handle());
            #[cfg(windows)]
            start_mouse_hook(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_sidecar_url, get_config, save_config, show_popup])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
