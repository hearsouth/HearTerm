use rusqlite::params;
use crate::error::AppError;
use crate::storage::crypto;
use crate::storage::db::Database;

const MASTER_KEY_SETTING: &str = "encryption_master_key";

/// Get or create the master encryption key (stored in settings table).
fn get_master_key(db: &Database) -> Result<Vec<u8>, AppError> {
    let conn = db.conn.lock().unwrap();

    // Try to get existing key
    let existing: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![MASTER_KEY_SETTING],
            |row| row.get(0),
        )
        .ok();

    if let Some(hex_key) = existing {
        return hex::decode(&hex_key)
            .map_err(|e| AppError::Generic(format!("Key decode: {}", e)));
    }

    // Generate new key and store it
    let key = crypto::generate_master_key();
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        params![MASTER_KEY_SETTING, hex::encode(&key)],
    )
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(key)
}

/// Store password encrypted locally.
pub fn store_password(db: &Database, connection_id: &str, password: &str) -> Result<(), AppError> {
    let master_key = get_master_key(db)?;
    let encrypted = crypto::encrypt(&master_key, password, connection_id)?;

    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO passwords (connection_id, encrypted_password) VALUES (?1, ?2)",
        params![connection_id, encrypted],
    )
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(())
}

/// Retrieve and decrypt password.
pub fn get_password(db: &Database, connection_id: &str) -> Result<String, AppError> {
    let master_key = get_master_key(db)?;

    let conn = db.conn.lock().unwrap();
    let encrypted: String = conn
        .query_row(
            "SELECT encrypted_password FROM passwords WHERE connection_id = ?1",
            params![connection_id],
            |row| row.get(0),
        )
        .map_err(|e| AppError::Generic(format!("Password not found: {}", e)))?;

    crypto::decrypt(&master_key, &encrypted, connection_id)
}

/// Delete stored password.
pub fn delete_password(db: &Database, connection_id: &str) -> Result<(), AppError> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "DELETE FROM passwords WHERE connection_id = ?1",
        params![connection_id],
    )
    .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

/// Decrypt all stored passwords for export (returns plaintext).
pub fn export_passwords(db: &Database) -> Result<std::collections::HashMap<String, String>, AppError> {
    let master_key = get_master_key(db)?;
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT connection_id, encrypted_password FROM passwords")
        .map_err(|e| AppError::Database(e.to_string()))?;
    let rows: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| AppError::Database(e.to_string()))?
        .collect::<Result<_, _>>()
        .map_err(|e| AppError::Database(e.to_string()))?;
    let mut map = std::collections::HashMap::new();
    for (cid, encrypted) in rows {
        let plain = crypto::decrypt(&master_key, &encrypted, &cid)?;
        map.insert(cid, plain);
    }
    Ok(map)
}
