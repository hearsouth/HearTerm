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
use commands::sftp::SftpClients;
use storage::db::Database;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("ssh-tool");

    let database = Database::new(app_dir).expect("Failed to initialize database");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ConnectionManager {
            sessions: tokio::sync::Mutex::new(HashMap::new()),
        })
        .manage(TerminalChannels {
            writers: Arc::new(Mutex::new(HashMap::new())),
        })
        .manage(SftpClients {
            clients: Arc::new(Mutex::new(HashMap::new())),
        })
        .manage(database)
        .invoke_handler(tauri::generate_handler![
            commands::connection::connect,
            commands::connection::disconnect,
            commands::terminal::term_open,
            commands::terminal::term_write,
            commands::terminal::term_resize,
            commands::settings::save_connection,
            commands::settings::update_connection,
            commands::settings::list_connections,
            commands::settings::delete_connection,
            commands::settings::store_password,
            commands::settings::get_password,
            commands::settings::rename_group,
            commands::settings::move_to_group,
            commands::settings::delete_group,
            commands::settings::create_group,
            commands::settings::list_groups,
            commands::settings::export_config,
            commands::settings::import_config,
            commands::sftp::sftp_list,
            commands::sftp::sftp_mkdir,
            commands::sftp::sftp_delete,
            commands::sftp::sftp_rename,
            commands::transfer::transfer_upload,
            commands::transfer::transfer_download,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
