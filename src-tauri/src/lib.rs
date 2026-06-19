pub mod commands;
pub mod ssh;
pub mod transfer;
pub mod storage;
pub mod events;
pub mod error;

use std::collections::HashMap;
use std::sync::Mutex;
use commands::connection::ConnectionManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ConnectionManager {
            sessions: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            commands::connection::connect,
            commands::connection::disconnect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
