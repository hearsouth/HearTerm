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
                conn.id, conn.name, conn.host, conn.port,
                conn.username, conn.auth_method, conn.private_key_path,
                conn.fingerprint, conn.group_name, now, now,
            ],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_connection(
    db: State<'_, Database>,
    conn: Connection,
) -> Result<(), String> {
    let db_conn = db.conn.lock().unwrap();
    let now = chrono::Utc::now().timestamp();
    db_conn
        .execute(
            "UPDATE connections SET name=?2, host=?3, port=?4, username=?5,
             auth_method=?6, private_key_path=?7, fingerprint=?8,
             group_name=?9, color_label=?10, updated_at=?11
             WHERE id=?1",
            rusqlite::params![
                conn.id, conn.name, conn.host, conn.port,
                conn.username, conn.auth_method, conn.private_key_path,
                conn.fingerprint, conn.group_name, conn.color_label, now,
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
    // Inline password deletion (avoid nested lock)
    db_conn
        .execute("DELETE FROM passwords WHERE connection_id = ?1", [&id])
        .ok();
    Ok(())
}

#[tauri::command]
pub async fn store_password(
    db: State<'_, Database>,
    connection_id: String,
    password: String,
) -> Result<(), String> {
    keyring::store_password(&db, &connection_id, &password).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_password(
    db: State<'_, Database>,
    connection_id: String,
) -> Result<String, String> {
    keyring::get_password(&db, &connection_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_group(
    db: State<'_, Database>,
    name: String,
) -> Result<(), String> {
    let db_conn = db.conn.lock().unwrap();
    let now = chrono::Utc::now().timestamp();
    db_conn
        .execute(
            "INSERT OR IGNORE INTO groups (name, created_at) VALUES (?1, ?2)",
            rusqlite::params![name, now],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_groups(
    db: State<'_, Database>,
) -> Result<Vec<String>, String> {
    let db_conn = db.conn.lock().unwrap();
    let mut stmt = db_conn
        .prepare("SELECT name FROM groups ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_group(
    db: State<'_, Database>,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    let db_conn = db.conn.lock().unwrap();
    db_conn
        .execute("UPDATE groups SET name = ?1 WHERE name = ?2", rusqlite::params![new_name, old_name])
        .map_err(|e| e.to_string())?;
    db_conn
        .execute("UPDATE connections SET group_name = ?1 WHERE group_name = ?2", rusqlite::params![new_name, old_name])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn move_to_group(
    db: State<'_, Database>,
    connection_id: String,
    group_name: String,
) -> Result<(), String> {
    let db_conn = db.conn.lock().unwrap();
    // Ensure group exists
    let now = chrono::Utc::now().timestamp();
    db_conn
        .execute("INSERT OR IGNORE INTO groups (name, created_at) VALUES (?1, ?2)", rusqlite::params![group_name, now])
        .map_err(|e| e.to_string())?;
    db_conn
        .execute("UPDATE connections SET group_name = ?1 WHERE id = ?2", rusqlite::params![group_name, connection_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_group(
    db: State<'_, Database>,
    group_name: String,
) -> Result<(), String> {
    let db_conn = db.conn.lock().unwrap();
    db_conn
        .execute("DELETE FROM groups WHERE name = ?1", rusqlite::params![group_name])
        .map_err(|e| e.to_string())?;
    db_conn
        .execute("UPDATE connections SET group_name = '默认' WHERE group_name = ?1", rusqlite::params![group_name])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize)]
struct ExportData {
    version: u32,
    connections: Vec<Connection>,
    passwords: std::collections::HashMap<String, String>, // plaintext passwords
}

#[tauri::command]
pub async fn export_config(db: State<'_, Database>, path: String) -> Result<(), String> {
    let json = do_export(&db)?;
    std::fs::write(&path, json).map_err(|e| format!("Write file: {}", e))?;
    Ok(())
}

fn do_export(db: &Database) -> Result<String, String> {
    let connections: Vec<Connection> = {
        let db_conn = db.conn.lock().unwrap();
        let mut stmt = db_conn.prepare(
            "SELECT id, name, host, port, username, auth_method, private_key_path,
                    fingerprint, group_name, COALESCE(color_label, ''), created_at,
                    updated_at, last_connected_at FROM connections"
        ).map_err(|e| e.to_string())?;
        let result = stmt.query_map([], |row| Ok(Connection {
            id: row.get(0)?, name: row.get(1)?, host: row.get(2)?, port: row.get(3)?,
            username: row.get(4)?, auth_method: row.get(5)?, private_key_path: row.get(6)?,
            fingerprint: row.get(7)?, group_name: row.get(8)?,
            color_label: { let s: String = row.get(9)?; if s.is_empty() { None } else { Some(s) } },
            created_at: row.get(10)?, updated_at: row.get(11)?, last_connected_at: row.get(12)?,
        })).map_err(|e| e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())?;
        result
    }; // release DB lock
    let passwords = crate::storage::keyring::export_passwords(db).map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&ExportData { version: 1, connections, passwords }).map_err(|e| e.to_string())
}

fn do_import(db: &Database, json: &str) -> Result<(), String> {
    let data: ExportData = serde_json::from_str(json).map_err(|e| format!("JSON: {}", e))?;
    {
        let db_conn = db.conn.lock().unwrap();
        for c in &data.connections {
            db_conn.execute(
                "INSERT OR REPLACE INTO connections (id,name,host,port,username,auth_method,private_key_path,fingerprint,group_name,color_label,created_at,updated_at,last_connected_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
                rusqlite::params![c.id,c.name,c.host,c.port,c.username,c.auth_method,c.private_key_path,c.fingerprint,c.group_name,c.color_label,c.created_at,c.updated_at,c.last_connected_at],
            ).map_err(|e| e.to_string())?;
        }
    } // release lock before calling store_password
    for (cid, pw) in &data.passwords {
        crate::storage::keyring::store_password(db, cid, pw).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn import_config(db: State<'_, Database>, path: String) -> Result<(), String> {
    let json = std::fs::read_to_string(&path).map_err(|e| format!("Read file: {}", e))?;
    do_import(&db, &json)?;
    Ok(())
}
