use tauri::{AppHandle, Emitter, State};
use crate::commands::sftp::SftpClients;
use crate::transfer::engine;

#[tauri::command]
pub async fn transfer_upload(
    sftp_state: State<'_, SftpClients>,
    app: AppHandle,
    connection_id: String,
    local_path: String,
    remote_dir: String,
) -> Result<String, String> {
    let transfer_id = uuid::Uuid::new_v4().to_string();
    let filename = std::path::Path::new(&local_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("upload");
    let remote_path = format!("{}/{}", remote_dir.trim_end_matches('/'), filename);

    let mut client = {
        sftp_state.clients.lock().unwrap()
            .remove(&connection_id)
            .ok_or("SFTP session not open")?
    };

    let tid = transfer_id.clone();
    let app2 = app.clone();

    // Spawn background upload task
    tokio::spawn(async move {
        let result = engine::upload_file(
            &mut client,
            &local_path,
            &remote_path,
            &tid,
            &app2,
        ).await;

        match result {
            Ok(()) => {
                let _ = app2.emit("transfer-complete", serde_json::json!({
                    "transfer_id": tid,
                    "status": "completed"
                }));
            }
            Err(e) => {
                let _ = app2.emit("transfer-complete", serde_json::json!({
                    "transfer_id": tid,
                    "status": "failed",
                    "error": e.to_string()
                }));
            }
        }
    });

    Ok(transfer_id)
}

#[tauri::command]
pub async fn transfer_download(
    sftp_state: State<'_, SftpClients>,
    app: AppHandle,
    connection_id: String,
    remote_path: String,
    local_dir: String,
) -> Result<String, String> {
    let transfer_id = uuid::Uuid::new_v4().to_string();
    let filename = std::path::Path::new(&remote_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("download");
    let local_path = format!("{}/{}", local_dir.trim_end_matches('/'), filename);

    let mut client = {
        sftp_state.clients.lock().unwrap()
            .remove(&connection_id)
            .ok_or("SFTP session not open")?
    };

    let tid = transfer_id.clone();
    let app2 = app.clone();

    tokio::spawn(async move {
        let result = engine::download_file(
            &mut client,
            &remote_path,
            &local_path,
            &tid,
            &app2,
        ).await;

        match result {
            Ok(()) => {
                let _ = app2.emit("transfer-complete", serde_json::json!({
                    "transfer_id": tid,
                    "status": "completed",
                    "local_path": local_path
                }));
            }
            Err(e) => {
                let _ = app2.emit("transfer-complete", serde_json::json!({
                    "transfer_id": tid,
                    "status": "failed",
                    "error": e.to_string()
                }));
            }
        }
    });

    Ok(transfer_id)
}
