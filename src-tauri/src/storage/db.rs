use rusqlite::{Connection, Result as SqlResult};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub struct Database {
    pub conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new(app_dir: PathBuf) -> SqlResult<Self> {
        std::fs::create_dir_all(&app_dir).ok();
        let db_path = app_dir.join("ssh-tool.db");
        let conn = Connection::open(db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.run_migrations()?;
        Ok(db)
    }

    fn run_migrations(&self) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS connections (
                id              TEXT PRIMARY KEY,
                name            TEXT NOT NULL,
                host            TEXT NOT NULL,
                port            INTEGER DEFAULT 22,
                username        TEXT NOT NULL,
                auth_method     TEXT DEFAULT 'password',
                private_key_path TEXT,
                fingerprint     TEXT,
                group_name      TEXT DEFAULT 'Default',
                color_label     TEXT,
                created_at      INTEGER NOT NULL,
                updated_at      INTEGER NOT NULL,
                last_connected_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS transfers (
                id              TEXT PRIMARY KEY,
                connection_id   TEXT,
                direction       TEXT NOT NULL,
                remote_path     TEXT NOT NULL,
                local_path      TEXT NOT NULL,
                total_size      INTEGER,
                bytes_transferred INTEGER DEFAULT 0,
                chunk_size      INTEGER DEFAULT 1048576,
                status          TEXT DEFAULT 'queued',
                resume_token    TEXT,
                error_message   TEXT,
                speed_bytes_per_sec INTEGER,
                created_at      INTEGER NOT NULL,
                updated_at      INTEGER NOT NULL,
                completed_at    INTEGER
            );

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS passwords (
                connection_id   TEXT PRIMARY KEY,
                encrypted_password TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS groups (
                name TEXT PRIMARY KEY,
                created_at INTEGER NOT NULL
            );
            "
        )?;
        Ok(())
    }
}
