use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;
use crate::commands::connection::ConnectionManager;
use crate::ssh::sftp::{FileEntry, SftpClient};

pub struct SftpClients {
    pub clients: Mutex<HashMap<String, SftpClient>>,
}

/// Ensure an SFTP client exists for the connection, returning the client
/// (removed from the map to avoid holding the lock across await).
async fn get_or_create_client(
    sftp_state: &SftpClients,
    state: &ConnectionManager,
    connection_id: &str,
) -> Result<SftpClient, String> {
    // Try to get existing client
    let existing = sftp_state.clients.lock().unwrap().remove(connection_id);
    if let Some(client) = existing {
        return Ok(client);
    }

    // Create new SFTP session
    let mut session = {
        let mut sessions = state.sessions.lock().unwrap();
        sessions
            .remove(connection_id)
            .ok_or("Connection not found")?
    };

    let client = SftpClient::from_session(&mut session)
        .await
        .map_err(|e| e.to_string())?;

    // Put session back
    state
        .sessions
        .lock()
        .unwrap()
        .insert(connection_id.to_string(), session);

    Ok(client)
}

/// Put client back into the map after operation.
fn put_client(sftp_state: &SftpClients, connection_id: &str, client: SftpClient) {
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
    let mut client = {
        sftp_state
            .clients
            .lock()
            .unwrap()
            .remove(&connection_id)
            .ok_or("SFTP session not open")?
    };
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
    let mut client = {
        sftp_state
            .clients
            .lock()
            .unwrap()
            .remove(&connection_id)
            .ok_or("SFTP session not open")?
    };
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
    let mut client = {
        sftp_state
            .clients
            .lock()
            .unwrap()
            .remove(&connection_id)
            .ok_or("SFTP session not open")?
    };
    let result = client.rename(&from, &to).await.map_err(|e| e.to_string());
    put_client(&sftp_state, &connection_id, client);
    result
}
