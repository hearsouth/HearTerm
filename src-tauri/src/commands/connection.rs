use std::collections::HashMap;
use tokio::sync::Mutex;
use tauri::State;
use crate::ssh::session::SshSession;

pub struct ConnectionManager {
    pub sessions: Mutex<HashMap<String, SshSession>>,
}

#[tauri::command]
pub async fn connect(
    state: State<'_, ConnectionManager>,
    id: String,
    host: String,
    port: u16,
    username: String,
    password: String,
) -> Result<(), String> {
    let session = SshSession::connect(&host, port, &username, &password)
        .await
        .map_err(|e| e.to_string())?;

    state.sessions.lock().await.insert(id, session);
    Ok(())
}

#[tauri::command]
pub async fn disconnect(
    state: State<'_, ConnectionManager>,
    id: String,
) -> Result<(), String> {
    let session = state.sessions.lock().await.remove(&id);

    if let Some(session) = session {
        session
            .handle
            .disconnect(
                russh::Disconnect::ByApplication,
                "user disconnected",
                "English",
            )
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
