use tauri::{AppHandle, Emitter, State};
use crate::commands::connection::ConnectionManager;
use crate::commands::sftp::SftpClients;
use crate::storage::db::Database;
use crate::transfer::engine;

async fn get_or_create_sftp(
    sftp_state: &SftpClients,
    state: &ConnectionManager,
    connection_id: &str,
) -> Result<crate::ssh::sftp::SftpClient, String> {
    let existing = sftp_state.clients.lock().unwrap().remove(connection_id);
    if let Some(client) = existing { return Ok(client); }
    let sessions = state.sessions.lock().await;
    let session = sessions.get(connection_id).ok_or("Connection not found")?;
    crate::ssh::sftp::SftpClient::from_session(session).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn transfer_upload(
    sftp_state: State<'_, SftpClients>,
    state: State<'_, ConnectionManager>,
    db: State<'_, Database>,
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

    // Insert transfer record
    let now = chrono::Utc::now().timestamp();
    db.conn.lock().unwrap().execute(
        "INSERT INTO transfers (id, connection_id, direction, remote_path, local_path, total_size, status, created_at, updated_at)
         VALUES (?1, ?2, 'upload', ?3, ?4, 0, 'queued', ?5, ?5)",
        rusqlite::params![transfer_id, connection_id, remote_path, local_path, now],
    ).map_err(|e| e.to_string())?;

    let mut client = get_or_create_sftp(&sftp_state, &state, &connection_id).await?;

    let tid = transfer_id.clone();
    let app2 = app.clone();
    let db2 = db.conn.clone();

    tokio::spawn(async move {
        // Auto-detect directory
        let is_dir = tokio::fs::metadata(&local_path).await.map(|m| m.is_dir()).unwrap_or(false);
        let result = if is_dir {
            engine::upload_dir(&mut client, &local_path, &remote_path, &tid, &app2).await
        } else {
            engine::upload_file(&mut client, &local_path, &remote_path, &tid, &app2).await
        };

        match result {
            Ok(()) => {
                let now = chrono::Utc::now().timestamp();
                db2.lock().unwrap().execute(
                    "UPDATE transfers SET status='completed', completed_at=?1, updated_at=?1 WHERE id=?2",
                    rusqlite::params![now, tid],
                ).ok();
                let _ = app2.emit("transfer-complete", serde_json::json!({"transfer_id": tid, "status": "completed"}));
            }
            Err(e) => {
                let now = chrono::Utc::now().timestamp();
                db2.lock().unwrap().execute(
                    "UPDATE transfers SET status='failed', error_message=?1, updated_at=?2 WHERE id=?3",
                    rusqlite::params![e.to_string(), now, tid],
                ).ok();
                let _ = app2.emit("transfer-complete", serde_json::json!({"transfer_id": tid, "status": "failed", "error": e.to_string()}));
            }
        }
    });

    Ok(transfer_id)
}

#[tauri::command]
pub async fn transfer_download(
    sftp_state: State<'_, SftpClients>,
    state: State<'_, ConnectionManager>,
    db: State<'_, Database>,
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

    let now = chrono::Utc::now().timestamp();
    db.conn.lock().unwrap().execute(
        "INSERT INTO transfers (id, connection_id, direction, remote_path, local_path, total_size, status, created_at, updated_at)
         VALUES (?1, ?2, 'download', ?3, ?4, 0, 'queued', ?5, ?5)",
        rusqlite::params![transfer_id, connection_id, remote_path, local_path, now],
    ).map_err(|e| e.to_string())?;

    let mut client = get_or_create_sftp(&sftp_state, &state, &connection_id).await?;

    let tid = transfer_id.clone();
    let app2 = app.clone();
    let db2 = db.conn.clone();

    tokio::spawn(async move {
        // Detect if remote path is a directory
        let is_dir = match client.metadata(&remote_path).await {
            Ok(meta) => meta.is_dir,
            Err(_) => false,
        };

        let result = if is_dir {
            engine::download_dir(&mut client, &remote_path, &local_path, &tid, &app2).await
        } else {
            engine::download_file(&mut client, &remote_path, &local_path, &tid, &app2).await
        };

        match result {
            Ok(()) => {
                let now = chrono::Utc::now().timestamp();
                db2.lock().unwrap().execute(
                    "UPDATE transfers SET status='completed', completed_at=?1, updated_at=?1 WHERE id=?2",
                    rusqlite::params![now, tid],
                ).ok();
                let _ = app2.emit("transfer-complete", serde_json::json!({"transfer_id": tid, "status": "completed", "local_path": local_path}));
            }
            Err(e) => {
                let now = chrono::Utc::now().timestamp();
                db2.lock().unwrap().execute(
                    "UPDATE transfers SET status='failed', error_message=?1, updated_at=?2 WHERE id=?3",
                    rusqlite::params![e.to_string(), now, tid],
                ).ok();
                let _ = app2.emit("transfer-complete", serde_json::json!({"transfer_id": tid, "status": "failed", "error": e.to_string()}));
            }
        }
    });

    Ok(transfer_id)
}
