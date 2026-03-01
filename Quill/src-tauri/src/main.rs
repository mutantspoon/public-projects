// Prevents additional console window on Windows in release. DO NOT REMOVE.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri::Emitter;
use tauri_plugin_dialog::DialogExt;

const MAX_RECENT_FILES: usize = 10;
const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10MB

// ─── Settings ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Settings {
    #[serde(default = "default_theme")]
    theme: String,
    #[serde(default = "default_font_size")]
    font_size: u32,
    #[serde(default = "default_true")]
    word_wrap: bool,
    #[serde(default = "default_window_width")]
    window_width: u32,
    #[serde(default = "default_window_height")]
    window_height: u32,
    #[serde(default)]
    window_x: Option<i32>,
    #[serde(default)]
    window_y: Option<i32>,
    #[serde(default)]
    recent_files: Vec<String>,
}

fn default_theme() -> String { "dark".into() }
fn default_font_size() -> u32 { 14 }
fn default_true() -> bool { true }
fn default_window_width() -> u32 { 1000 }
fn default_window_height() -> u32 { 700 }

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            font_size: default_font_size(),
            word_wrap: default_true(),
            window_width: default_window_width(),
            window_height: default_window_height(),
            window_x: None,
            window_y: None,
            recent_files: Vec::new(),
        }
    }
}

// ─── App State ───────────────────────────────────────────────────────────────

struct AppState {
    settings: Settings,
    current_file: Option<String>,
    modified: bool,
    startup_file: Option<String>,
    config_dir: PathBuf,
}

type SharedState = Mutex<AppState>;

// ─── Config Path ─────────────────────────────────────────────────────────────

/// Returns the same settings directory as the Python version:
/// - Windows: %APPDATA%\Quill\
/// - macOS:   ~/Library/Application Support/Quill/
/// - Linux:   ~/.quill/
fn get_config_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    if let Ok(appdata) = std::env::var("APPDATA") {
        return PathBuf::from(appdata).join("Quill");
    }

    #[cfg(target_os = "macos")]
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("Quill");
    }

    // Linux / fallback
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join(".quill");
    }

    PathBuf::from(".quill")
}

// ─── Settings persistence ─────────────────────────────────────────────────────

fn load_settings(config_dir: &PathBuf) -> Settings {
    let path = config_dir.join("settings.json");
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(s) = serde_json::from_str::<Settings>(&content) {
                return s;
            }
        }
    }
    Settings::default()
}

fn save_settings(config_dir: &PathBuf, settings: &Settings) {
    let _ = fs::create_dir_all(config_dir);
    let path = config_dir.join("settings.json");
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        let _ = fs::write(&path, json);
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn update_title(app: &AppHandle, state: &AppState) {
    let name = state
        .current_file
        .as_deref()
        .map(|p| {
            std::path::Path::new(p)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
        })
        .unwrap_or_else(|| "Untitled".to_string());
    let modified = if state.modified { "*" } else { "" };
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title(&format!("Quill - {}{}", name, modified));
    }
}

fn add_recent_file_impl(settings: &mut Settings, path: &str) {
    settings.recent_files.retain(|p| p != path);
    settings.recent_files.insert(0, path.to_string());
    settings.recent_files.truncate(MAX_RECENT_FILES);
}

/// Read a file as text, trying UTF-8 then falling back to latin-1.
fn read_file(path: &str) -> Result<String, String> {
    let p = std::path::Path::new(path);
    if !p.exists() {
        return Err("File does not exist".into());
    }
    let meta = fs::metadata(p).map_err(|e| e.to_string())?;
    if meta.len() > MAX_FILE_SIZE {
        return Err(format!(
            "File too large ({}MB). Maximum is 10MB.",
            meta.len() / 1024 / 1024
        ));
    }
    let bytes = fs::read(p).map_err(|e| e.to_string())?;
    match String::from_utf8(bytes.clone()) {
        Ok(s) => Ok(s),
        Err(_) => Ok(bytes.iter().map(|&b| b as char).collect()),
    }
}

// ─── File Commands ────────────────────────────────────────────────────────────

#[tauri::command]
fn new_file(app: AppHandle, state: State<'_, SharedState>) -> serde_json::Value {
    let mut s = state.lock().unwrap();
    s.current_file = None;
    s.modified = false;
    update_title(&app, &s);
    serde_json::json!({ "success": true, "content": "" })
}

#[tauri::command]
fn open_file(app: AppHandle, state: State<'_, SharedState>) -> serde_json::Value {
    let picked = app
        .dialog()
        .file()
        .add_filter("Markdown files", &["md", "markdown", "txt"])
        .blocking_pick_file();

    let path = match picked {
        Some(fp) => match fp.into_path() {
            Ok(p) => p,
            Err(_) => return serde_json::json!({ "success": false, "cancelled": true }),
        },
        None => return serde_json::json!({ "success": false, "cancelled": true }),
    };

    let path_str = path.to_string_lossy().to_string();
    match read_file(&path_str) {
        Ok(content) => {
            let mut s = state.lock().unwrap();
            s.current_file = Some(path_str.clone());
            s.modified = false;
            add_recent_file_impl(&mut s.settings, &path_str);
            let config_dir = s.config_dir.clone();
            save_settings(&config_dir, &s.settings);
            update_title(&app, &s);
            serde_json::json!({ "success": true, "content": content, "path": path_str })
        }
        Err(e) => serde_json::json!({ "success": false, "error": e }),
    }
}

#[tauri::command]
fn open_recent_file(
    path: String,
    app: AppHandle,
    state: State<'_, SharedState>,
) -> serde_json::Value {
    match read_file(&path) {
        Ok(content) => {
            let mut s = state.lock().unwrap();
            s.current_file = Some(path.clone());
            s.modified = false;
            add_recent_file_impl(&mut s.settings, &path);
            let config_dir = s.config_dir.clone();
            save_settings(&config_dir, &s.settings);
            update_title(&app, &s);
            serde_json::json!({ "success": true, "content": content, "path": path })
        }
        Err(e) => {
            if e.contains("does not exist") {
                let mut s = state.lock().unwrap();
                s.settings.recent_files.retain(|p| p != &path);
                let config_dir = s.config_dir.clone();
                save_settings(&config_dir, &s.settings);
            }
            serde_json::json!({ "success": false, "error": e })
        }
    }
}

#[tauri::command]
fn save_file(
    content: String,
    app: AppHandle,
    state: State<'_, SharedState>,
) -> serde_json::Value {
    let current = state.lock().unwrap().current_file.clone();
    if let Some(path) = current {
        save_to_path(&path, &content, &app, &state)
    } else {
        save_file_as(content, app, state)
    }
}

#[tauri::command]
fn save_file_as(
    content: String,
    app: AppHandle,
    state: State<'_, SharedState>,
) -> serde_json::Value {
    let picked = app
        .dialog()
        .file()
        .add_filter("Markdown files", &["md"])
        .add_filter("Text files", &["txt"])
        .set_file_name("Untitled.md")
        .blocking_save_file();

    let path = match picked {
        Some(fp) => match fp.into_path() {
            Ok(p) => p,
            Err(_) => return serde_json::json!({ "success": false, "cancelled": true }),
        },
        None => return serde_json::json!({ "success": false, "cancelled": true }),
    };

    let path_str = path.to_string_lossy().to_string();
    save_to_path(&path_str, &content, &app, &state)
}

fn save_to_path(
    path: &str,
    content: &str,
    app: &AppHandle,
    state: &State<'_, SharedState>,
) -> serde_json::Value {
    match fs::write(path, content.as_bytes()) {
        Ok(_) => {
            let mut s = state.lock().unwrap();
            s.current_file = Some(path.to_string());
            s.modified = false;
            add_recent_file_impl(&mut s.settings, path);
            let config_dir = s.config_dir.clone();
            save_settings(&config_dir, &s.settings);
            update_title(app, &s);
            serde_json::json!({ "success": true, "path": path })
        }
        Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
    }
}

#[tauri::command]
fn set_current_file(
    path: Option<String>,
    app: AppHandle,
    state: State<'_, SharedState>,
) -> serde_json::Value {
    let mut s = state.lock().unwrap();
    s.current_file = path.clone();
    s.modified = false;
    if let Some(p) = &path {
        add_recent_file_impl(&mut s.settings, p);
        let config_dir = s.config_dir.clone();
        save_settings(&config_dir, &s.settings);
    }
    update_title(&app, &s);
    serde_json::json!({ "success": true, "path": path })
}

#[tauri::command]
fn get_file_state(state: State<'_, SharedState>) -> serde_json::Value {
    let s = state.lock().unwrap();
    let filename = s
        .current_file
        .as_deref()
        .map(|p| {
            std::path::Path::new(p)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
        })
        .unwrap_or_else(|| "Untitled".to_string());
    serde_json::json!({
        "path": s.current_file,
        "modified": s.modified,
        "filename": filename,
    })
}

#[tauri::command]
fn set_modified(modified: bool, app: AppHandle, state: State<'_, SharedState>) {
    let mut s = state.lock().unwrap();
    s.modified = modified;
    update_title(&app, &s);
}

// ─── Recent Files ─────────────────────────────────────────────────────────────

#[tauri::command]
fn get_recent_files(state: State<'_, SharedState>) -> Vec<String> {
    state.lock().unwrap().settings.recent_files.clone()
}

#[tauri::command]
fn add_recent_file(path: String, state: State<'_, SharedState>) {
    let mut s = state.lock().unwrap();
    add_recent_file_impl(&mut s.settings, &path);
    let config_dir = s.config_dir.clone();
    save_settings(&config_dir, &s.settings);
}

#[tauri::command]
fn clear_recent_files(state: State<'_, SharedState>) {
    let mut s = state.lock().unwrap();
    s.settings.recent_files.clear();
    let config_dir = s.config_dir.clone();
    save_settings(&config_dir, &s.settings);
}

// ─── Settings Commands ────────────────────────────────────────────────────────

#[tauri::command]
fn get_settings(state: State<'_, SharedState>) -> serde_json::Value {
    let s = state.lock().unwrap();
    serde_json::json!({
        "theme": s.settings.theme,
        "font_size": s.settings.font_size,
        "word_wrap": s.settings.word_wrap,
    })
}

#[tauri::command]
fn set_theme(theme: String, state: State<'_, SharedState>) -> serde_json::Value {
    let mut s = state.lock().unwrap();
    s.settings.theme = theme.clone();
    let config_dir = s.config_dir.clone();
    save_settings(&config_dir, &s.settings);
    serde_json::json!({ "success": true, "theme": theme })
}

#[tauri::command]
fn set_font_size(size: u32, state: State<'_, SharedState>) -> serde_json::Value {
    let mut s = state.lock().unwrap();
    s.settings.font_size = size.clamp(8, 32);
    let font_size = s.settings.font_size;
    let config_dir = s.config_dir.clone();
    save_settings(&config_dir, &s.settings);
    serde_json::json!({ "success": true, "font_size": font_size })
}

#[tauri::command]
fn set_word_wrap(enabled: bool, state: State<'_, SharedState>) -> serde_json::Value {
    let mut s = state.lock().unwrap();
    s.settings.word_wrap = enabled;
    let config_dir = s.config_dir.clone();
    save_settings(&config_dir, &s.settings);
    serde_json::json!({ "success": true, "word_wrap": enabled })
}

#[tauri::command]
fn toggle_word_wrap(state: State<'_, SharedState>) -> serde_json::Value {
    let mut s = state.lock().unwrap();
    s.settings.word_wrap = !s.settings.word_wrap;
    let word_wrap = s.settings.word_wrap;
    let config_dir = s.config_dir.clone();
    save_settings(&config_dir, &s.settings);
    serde_json::json!({ "success": true, "word_wrap": word_wrap })
}

// ─── Window State Commands ────────────────────────────────────────────────────

#[tauri::command]
fn get_window_size(state: State<'_, SharedState>) -> serde_json::Value {
    let s = state.lock().unwrap();
    serde_json::json!({ "width": s.settings.window_width, "height": s.settings.window_height })
}

#[tauri::command]
fn save_window_size(width: u32, height: u32, state: State<'_, SharedState>) {
    let mut s = state.lock().unwrap();
    s.settings.window_width = width;
    s.settings.window_height = height;
    let config_dir = s.config_dir.clone();
    save_settings(&config_dir, &s.settings);
}

#[tauri::command]
fn get_window_position(state: State<'_, SharedState>) -> serde_json::Value {
    let s = state.lock().unwrap();
    serde_json::json!({ "x": s.settings.window_x, "y": s.settings.window_y })
}

#[tauri::command]
fn save_window_position(x: i32, y: i32, state: State<'_, SharedState>) {
    let mut s = state.lock().unwrap();
    s.settings.window_x = Some(x);
    s.settings.window_y = Some(y);
    let config_dir = s.config_dir.clone();
    save_settings(&config_dir, &s.settings);
}

// ─── App Lifecycle Commands ───────────────────────────────────────────────────

#[tauri::command]
fn get_startup_file(
    app: AppHandle,
    state: State<'_, SharedState>,
) -> Option<serde_json::Value> {
    let startup_path = state.lock().unwrap().startup_file.take();
    let path = startup_path?;

    match read_file(&path) {
        Ok(content) => {
            let mut s = state.lock().unwrap();
            s.current_file = Some(path.clone());
            s.modified = false;
            add_recent_file_impl(&mut s.settings, &path);
            let config_dir = s.config_dir.clone();
            save_settings(&config_dir, &s.settings);
            update_title(&app, &s);
            Some(serde_json::json!({ "content": content, "path": path }))
        }
        Err(_) => None,
    }
}

#[tauri::command]
fn force_close(app: AppHandle, state: State<'_, SharedState>) {
    // Save window geometry before destroying
    if let Some(window) = app.get_webview_window("main") {
        if let (Ok(size), Ok(pos)) = (window.outer_size(), window.outer_position()) {
            let mut s = state.lock().unwrap();
            s.settings.window_width = size.width;
            s.settings.window_height = size.height;
            s.settings.window_x = Some(pos.x);
            s.settings.window_y = Some(pos.y);
            let config_dir = s.config_dir.clone();
            save_settings(&config_dir, &s.settings);
        }
        // destroy() skips the close-requested event, preventing re-entry
        let _ = window.destroy();
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

fn main() {
    // Collect startup file from command-line args (Windows "Open with" launches a new process)
    let startup_file: Option<String> = std::env::args()
        .nth(1)
        .filter(|a| !a.starts_with('-'));

    let config_dir = get_config_dir();
    let _ = fs::create_dir_all(&config_dir);
    let settings = load_settings(&config_dir);

    // Capture initial window geometry from settings before moving into closure
    let init_width = settings.window_width;
    let init_height = settings.window_height;
    let init_x = settings.window_x;
    let init_y = settings.window_y;

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(AppState {
            settings,
            current_file: None,
            modified: false,
            startup_file: startup_file.clone(),
            config_dir,
        }))
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("main") {
                // Restore saved window geometry (logical pixels to match Python behavior)
                let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
                    width: init_width as f64,
                    height: init_height as f64,
                }));
                if let (Some(x), Some(y)) = (init_x, init_y) {
                    let _ = window.set_position(tauri::Position::Logical(
                        tauri::LogicalPosition { x: x as f64, y: y as f64 },
                    ));
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            new_file,
            open_file,
            open_recent_file,
            save_file,
            save_file_as,
            set_current_file,
            get_file_state,
            set_modified,
            get_recent_files,
            add_recent_file,
            clear_recent_files,
            get_settings,
            set_theme,
            set_font_size,
            set_word_wrap,
            toggle_word_wrap,
            get_window_size,
            save_window_size,
            get_window_position,
            save_window_position,
            get_startup_file,
            force_close,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            // Handle macOS "Open with" while app is already running (Finder sends Opened event)
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = &event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        let path_str = path.to_string_lossy().to_string();
                        if let Ok(content) = fs::read_to_string(&path) {
                            let _ = _app.emit(
                                "open-file",
                                serde_json::json!({ "path": path_str, "content": content }),
                            );
                        }
                    }
                }
            }
            let _ = event;
        });
}
