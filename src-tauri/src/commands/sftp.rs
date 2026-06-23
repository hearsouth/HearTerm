use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::State;
use crate::commands::connection::ConnectionManager;
use crate::ssh::sftp::{FileEntry, SftpClient};

pub struct SftpClients {
    pub clients: Arc<Mutex<HashMap<String, SftpClient>>>,
}

async fn get_or_create_client(
    sftp_state: &SftpClients,
    state: &ConnectionManager,
    connection_id: &str,
) -> Result<SftpClient, String> {
    let existing = sftp_state.clients.lock().unwrap().remove(connection_id);
    if let Some(client) = existing {
        return Ok(client);
    }

    let client = {
        let sessions = state.sessions.lock().await;
        let session = sessions.get(connection_id).ok_or("Connection not found")?;
        SftpClient::from_session(session)
            .await
            .map_err(|e| e.to_string())?
    };

    Ok(client)
}

pub fn put_client(sftp_state: &SftpClients, connection_id: &str, client: SftpClient) {
    sftp_state
        .clients
        .lock()
        .unwrap()
        .insert(connection_id.to_string(), client);
}

#[tauri::command]
pub async fn sftp_list(
    sftp_state: State<'_, SftpClients>,
    state: State<'_, ConnectionManager>,
    connection_id: String,
    path: String,
) -> Result<Vec<FileEntry>, String> {
    let mut client = get_or_create_client(&sftp_state, &state, &connection_id).await?;
    let result = client.list(&path).await.map_err(|e| e.to_string());
    put_client(&sftp_state, &connection_id, client);
    result
}

#[tauri::command]
pub async fn sftp_mkdir(
    sftp_state: State<'_, SftpClients>,
    connection_id: String,
    path: String,
) -> Result<(), String> {
    let mut client = sftp_state
        .clients
        .lock()
        .unwrap()
        .remove(&connection_id)
        .ok_or("SFTP session not open")?;
    let result = client.mkdir(&path).await.map_err(|e| e.to_string());
    put_client(&sftp_state, &connection_id, client);
    result
}

#[tauri::command]
pub async fn sftp_delete(
    sftp_state: State<'_, SftpClients>,
    connection_id: String,
    path: String,
    is_dir: bool,
) -> Result<(), String> {
    let mut client = sftp_state
        .clients
        .lock()
        .unwrap()
        .remove(&connection_id)
        .ok_or("SFTP session not open")?;
    let result = if is_dir {
        client.remove_dir(&path).await.map_err(|e| e.to_string())
    } else {
        client.remove_file(&path).await.map_err(|e| e.to_string())
    };
    put_client(&sftp_state, &connection_id, client);
    result
}

#[tauri::command]
pub async fn sftp_rename(
    sftp_state: State<'_, SftpClients>,
    connection_id: String,
    from: String,
    to: String,
) -> Result<(), String> {
    let mut client = sftp_state
        .clients
        .lock()
        .unwrap()
        .remove(&connection_id)
        .ok_or("SFTP session not open")?;
    let result = client.rename(&from, &to).await.map_err(|e| e.to_string());
    put_client(&sftp_state, &connection_id, client);
    result
}
