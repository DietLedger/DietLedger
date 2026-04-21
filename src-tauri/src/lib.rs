#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

// Global state to track the Next.js server process
static SERVER_PROCESS: Mutex<Option<Child>> = Mutex::new(None);

/// Find a Node.js runtime (node or bun) available on the system
fn find_node_runtime() -> Option<String> {
    // Prefer bun (faster startup), fall back to node
    if which::which("bun").is_ok() {
        Some("bun".to_string())
    } else if which::which("node").is_ok() {
        Some("node".to_string())
    } else {
        None
    }
}

/// Start the Next.js standalone server as a sidecar process
#[tauri::command]
async fn start_server(app: tauri::AppHandle) -> Result<String, String> {
    let port = 3000;

    // Find the server.js entry point in the bundled resources
    let resource_dir = app.path()
        .resource_dir()
        .map_err(|e| e.to_string())?;

    let server_js = resource_dir.join("server").join("server.js");

    if !server_js.exists() {
        return Err(format!("Server not found at: {:?}", server_js));
    }

    // Find a Node.js runtime
    let runtime = find_node_runtime()
        .ok_or("Neither 'bun' nor 'node' found on this system. Please install Node.js or Bun.")?;

    println!("[NutriLabel] Using runtime: {}", runtime);
    println!("[NutriLabel] Server path: {:?}", server_js);

    // Set up data directory for the database
    let data_dir = app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    let database_url = format!("sqlite:{}", data_dir.join("nutrilabel.db").display());

    // Load saved FDA API key
    let fda_api_key = load_fda_api_key(&app);

    let mut cmd = Command::new(&runtime);
    cmd.arg(&server_js)
       .env("PORT", port.to_string())
       .env("DATABASE_URL", &database_url)
       .env("FDA_API_KEY", &fda_api_key)
       .env("HOSTNAME", "127.0.0.1")
       .env("NODE_ENV", "production");

    // On Windows, hide the console window
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let child = cmd.spawn().map_err(|e| format!("Failed to start server: {}", e))?;

    let mut lock = SERVER_PROCESS.lock().unwrap();
    *lock = Some(child);

    // Wait for server to be ready
    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:{}", port);
    
    for attempt in 1..=15 {
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        if let Ok(resp) = client.get(&url).send().await {
            if resp.status().is_success() {
                println!("[NutriLabel] Server ready after {} attempts", attempt);
                return Ok(url);
            }
        }
    }

    // Even if health check didn't pass, the server might still be starting
    Ok(url)
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

/// Get the stored FDA API key
#[tauri::command]
async fn get_fda_api_key(app: tauri::AppHandle) -> String {
    load_fda_api_key(&app)
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

/// Load FDA API key from config file, falling back to env var, then DEMO_KEY
fn load_fda_api_key(app: &tauri::AppHandle) -> String {
    // 1. Try config file
    if let Ok(config_dir) = app.path().app_config_dir() {
        let config_path = config_dir.join("config.json");
        if config_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&config_path) {
                if let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(key) = config.get("fda_api_key").and_then(|v| v.as_str()) {
                        return key.to_string();
                    }
                }
            }
        }
    }

    // 2. Try environment variable
    if let Ok(key) = std::env::var("FDA_API_KEY") {
        return key;
    }

    // 3. Default
    "DEMO_KEY".to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // In development, the Next.js dev server is already running via beforeDevCommand
            // In production, we start the bundled standalone server
            #[cfg(not(debug_assertions))]
            {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    match start_server(app_handle).await {
                        Ok(url) => {
                            println!("[NutriLabel] Server started at {}", url);
                            // Note: The main window URL needs to be set to the server URL
                            // This is handled by the devUrl in dev mode
                        }
                        Err(e) => eprintln!("[NutriLabel] Failed to start server: {}", e),
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
