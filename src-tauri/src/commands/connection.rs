use tauri::State;
use crate::ssh::session::SshSession;
use crate::storage::db::Database;
use crate::storage::keyring;
use std::collections::HashMap;
use tokio::sync::Mutex;

pub struct ConnectionManager {
    pub sessions: Mutex<HashMap<String, SshSession>>,
}

#[tauri::command]
pub async fn connect(
    state: State<'_, ConnectionManager>,
    db: State<'_, Database>,
    id: String,
) -> Result<(), String> {
    // Look up connection from database
    let (host, port, username) = {
        let db_conn = db.conn.lock().unwrap();
        let conn = db_conn.query_row(
            "SELECT host, port, username FROM connections WHERE id = ?1",
            rusqlite::params![id],
            |row| Ok((row.get::<_,String>(0)?, row.get::<_,i64>(1)?, row.get::<_,String>(2)?)),
        ).map_err(|e| format!("Connection not found: {}", e))?;
        (conn.0, conn.1 as u16, conn.2)
    };

    let password = keyring::get_password(&db, &id).unwrap_or_default();

    let session = SshSession::connect(&host, port, &username, &password)
        .await
        .map_err(|e| e.to_string())?;

    state.sessions.lock().await.insert(id, session);
    Ok(())
}

#[tauri::command]
pub async fn test_connection(
    host: String,
    port: u16,
    username: String,
    password: String,
) -> Result<(), String> {
    let session = SshSession::connect(&host, port, &username, &password)
        .await
        .map_err(|e| e.to_string())?;
    session.handle.disconnect(russh::Disconnect::ByApplication, "", "English").await.ok();
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
