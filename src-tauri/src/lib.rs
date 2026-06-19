pub mod commands;
pub mod ssh;
pub mod transfer;
pub mod storage;
pub mod events;
pub mod error;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use commands::connection::ConnectionManager;
use commands::terminal::TerminalChannels;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ConnectionManager {
            sessions: Mutex::new(HashMap::new()),
        })
        .manage(TerminalChannels {
            writers: Arc::new(Mutex::new(HashMap::new())),
        })
        .invoke_handler(tauri::generate_handler![
            commands::connection::connect,
            commands::connection::disconnect,
            commands::terminal::term_open,
            commands::terminal::term_write,
            commands::terminal::term_resize,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
