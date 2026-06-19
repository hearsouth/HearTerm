use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("SSH error: {0}")]
    Ssh(String),
    #[error("SFTP error: {0}")]
    Sftp(String),
    #[error("Database error: {0}")]
    Database(String),
    #[error("Keyring error: {0}")]
    Keyring(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Generic(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
