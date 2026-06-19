use tauri::State;
use crate::storage::db::Database;
use crate::storage::models::Connection;
use crate::storage::keyring;

#[tauri::command]
pub async fn save_connection(
    db: State<'_, Database>,
    conn: Connection,
) -> Result<(), String> {
    let db_conn = db.conn.lock().unwrap();
    let now = chrono::Utc::now().timestamp();

    db_conn
        .execute(
            "INSERT OR REPLACE INTO connections
             (id, name, host, port, username, auth_method, private_key_path,
              fingerprint, group_name, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                conn.id,
                conn.name,
                conn.host,
                conn.port,
                conn.username,
                conn.auth_method,
                conn.private_key_path,
                conn.fingerprint,
                conn.group_name,
                now,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_connections(
    db: State<'_, Database>,
) -> Result<Vec<Connection>, String> {
    let db_conn = db.conn.lock().unwrap();
    let mut stmt = db_conn
        .prepare(
            "SELECT id, name, host, port, username, auth_method,
                    private_key_path, fingerprint, group_name,
                    COALESCE(color_label, ''), created_at, updated_at,
                    last_connected_at
             FROM connections
             ORDER BY last_connected_at DESC NULLS LAST",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Connection {
                id: row.get(0)?,
                name: row.get(1)?,
                host: row.get(2)?,
                port: row.get(3)?,
                username: row.get(4)?,
                auth_method: row.get(5)?,
                private_key_path: row.get(6)?,
                fingerprint: row.get(7)?,
                group_name: row.get(8)?,
                color_label: {
                    let s: String = row.get(9)?;
                    if s.is_empty() { None } else { Some(s) }
                },
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                last_connected_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_connection(
    db: State<'_, Database>,
    id: String,
) -> Result<(), String> {
    let db_conn = db.conn.lock().unwrap();
    db_conn
        .execute("DELETE FROM connections WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    // Also delete password from keychain
    keyring::delete_password(&id).ok();
    Ok(())
}

#[tauri::command]
pub async fn store_password(
    connection_id: String,
    password: String,
) -> Result<(), String> {
    keyring::store_password(&connection_id, &password).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_password(
    connection_id: String,
) -> Result<String, String> {
    keyring::get_password(&connection_id).map_err(|e| e.to_string())
}
