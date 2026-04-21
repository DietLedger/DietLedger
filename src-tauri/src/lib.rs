#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

// Global state to track the Next.js server process
static SERVER_PROCESS: Mutex<Option<Child>> = Mutex::new(None);

/// Start the Next.js standalone server as a sidecar process
#[tauri::command]
async fn start_server(app: tauri::AppHandle) -> Result<String, String> {
    let port = 3000;
    
    // Determine the server binary path based on the platform
    let server_path = if cfg!(target_os = "windows") {
        app.path()
            .resource_dir()
            .map_err(|e| e.to_string())?
            .join("server")
            .join("server.exe")
    } else {
        app.path()
            .resource_dir()
            .map_err(|e| e.to_string())?
            .join("server")
            .join("server")
    };

    if !server_path.exists() {
        return Err(format!("Server not found at: {:?}", server_path));
    }

    // Set up environment
    let db_path = app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&db_path).map_err(|e| e.to_string())?;

    let database_url = format!("sqlite:{}", db_path.join("nutrilabel.db").display());

    // Read FDA API key from env or use default
    let fda_api_key = std::env::var("FDA_API_KEY").unwrap_or_else(|_| "DEMO_KEY".to_string());

    let mut cmd = Command::new(&server_path);
    cmd.env("PORT", port.to_string())
       .env("DATABASE_URL", &database_url)
       .env("FDA_API_KEY", &fda_api_key)
       .env("HOSTNAME", "127.0.0.1");

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let child = cmd.spawn().map_err(|e| format!("Failed to start server: {}", e))?;

    let mut lock = SERVER_PROCESS.lock().unwrap();
    *lock = Some(child);

    // Wait a moment for server to start
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    Ok(format!("http://127.0.0.1:{}", port))
}

/// Stop the Next.js server process
#[tauri::command]
async fn stop_server() -> Result<String, String> {
    let mut lock = SERVER_PROCESS.lock().unwrap();
    if let Some(mut child) = lock.take() {
        child.kill().map_err(|e| format!("Failed to kill server: {}", e))?;
        Ok("Server stopped".to_string())
    } else {
        Ok("No server running".to_string())
    }
}

/// Get the FDA API key (stored securely in the app)
#[tauri::command]
async fn get_fda_api_key() -> String {
    std::env::var("FDA_API_KEY").unwrap_or_else(|_| "DEMO_KEY".to_string())
}

/// Save the FDA API key to a local config file
#[tauri::command]
async fn save_fda_api_key(app: tauri::AppHandle, key: String) -> Result<String, String> {
    let config_dir = app.path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    
    let config_path = config_dir.join("config.json");
    let config = serde_json::json!({ "fda_api_key": key });
    std::fs::write(&config_path, config.to_string()).map_err(|e| e.to_string())?;
    
    std::env::set_var("FDA_API_KEY", &key);
    Ok("API key saved".to_string())
}

/// Check the health of the FDA API
#[tauri::command]
async fn check_fda_api(api_key: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://api.nal.usda.gov/fdc/v1/foods/search?api_key={}&query=apple&pageSize=1",
        api_key
    );
    
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    
    Ok(serde_json::json!({
        "status": response.status().as_u16(),
        "ok": response.status().is_success()
    }))
}

fn load_config(app: &tauri::AppHandle) {
    if let Ok(config_dir) = app.path().app_config_dir() {
        let config_path = config_dir.join("config.json");
        if config_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&config_path) {
                if let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(key) = config.get("fda_api_key").and_then(|v| v.as_str()) {
                        std::env::set_var("FDA_API_KEY", key);
                    }
                }
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Load saved config (API key, etc.)
            load_config(&app.handle().clone());
            
            // In development, the Next.js dev server is already running
            // In production, we start the bundled server
            #[cfg(not(debug_assertions))]
            {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    match start_server(app_handle).await {
                        Ok(url) => println!("Server started at {}", url),
                        Err(e) => eprintln!("Failed to start server: {}", e),
                    }
                });
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_server,
            stop_server,
            get_fda_api_key,
            save_fda_api_key,
            check_fda_api,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
