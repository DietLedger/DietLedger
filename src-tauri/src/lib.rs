//! NutriLabel - Tauri v2 Desktop Shell
//! Loads the static Next.js export — no server needed at runtime.
//! All data is stored in the browser's IndexedDB (via the WebView).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

/// Get the app version
#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Get the app's data directory path
#[tauri::command]
fn get_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    let data_dir = app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    Ok(data_dir.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|_app| {
            // Nothing to start — the frontend is a static site
            // All logic runs in the WebView (IndexedDB, FDA API calls)
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            get_data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
