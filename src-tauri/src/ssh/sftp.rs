use russh_sftp::client::SftpSession;
use crate::error::AppError;
use crate::ssh::session::SshSession;

pub struct SftpClient {
    session: SftpSession,
}

/// File entry from a directory listing.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FileEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
}

impl SftpClient {
    /// Open an SFTP session from an existing SSH session.
    pub async fn from_session(session: &SshSession) -> Result<Self, AppError> {
        let channel = session
            .handle
            .channel_open_session()
            .await
            .map_err(|e| AppError::Sftp(format!("Failed to open channel: {}", e)))?;

        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(|e| AppError::Sftp(format!("SFTP subsystem request failed: {}", e)))?;

        let stream = channel.into_stream();
        let sftp = SftpSession::new(stream)
            .await
            .map_err(|e| AppError::Sftp(format!("SFTP init failed: {}", e)))?;

        Ok(SftpClient { session: sftp })
    }

    /// List directory contents.
    pub async fn list(&mut self, path: &str) -> Result<Vec<FileEntry>, AppError> {
        let dir = self
            .session
            .read_dir(path)
            .await
            .map_err(|e| AppError::Sftp(format!("read_dir '{}': {}", path, e)))?;

        let mut entries = Vec::new();
        for entry in dir {
            let metadata = entry.metadata();
            entries.push(FileEntry {
                name: entry.file_name(),
                is_dir: metadata.is_dir(),
                size: metadata.len(),
                modified: metadata.mtime.unwrap_or(0) as u64,
            });
        }
        Ok(entries)
    }

    /// Get file/directory metadata.
    pub async fn metadata(&mut self, path: &str) -> Result<FileEntry, AppError> {
        let attrs = self
            .session
            .metadata(path)
            .await
            .map_err(|e| AppError::Sftp(format!("metadata '{}': {}", path, e)))?;

        Ok(FileEntry {
            name: std::path::Path::new(path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(path)
                .to_string(),
            is_dir: attrs.is_dir(),
            size: attrs.len(),
            modified: attrs.mtime.unwrap_or(0) as u64,
        })
    }

    /// Create a new directory.
    pub async fn mkdir(&mut self, path: &str) -> Result<(), AppError> {
        self.session
            .create_dir(path)
            .await
            .map_err(|e| AppError::Sftp(format!("mkdir '{}': {}", path, e)))?;
        Ok(())
    }

    /// Delete a file.
    pub async fn remove_file(&mut self, path: &str) -> Result<(), AppError> {
        self.session
            .remove_file(path)
            .await
            .map_err(|e| AppError::Sftp(format!("remove_file '{}': {}", path, e)))?;
        Ok(())
    }

    /// Delete a directory.
    pub async fn remove_dir(&mut self, path: &str) -> Result<(), AppError> {
        self.session
            .remove_dir(path)
            .await
            .map_err(|e| AppError::Sftp(format!("remove_dir '{}': {}", path, e)))?;
        Ok(())
    }

    /// Rename/move a file or directory.
    pub async fn rename(&mut self, from: &str, to: &str) -> Result<(), AppError> {
        self.session
            .rename(from, to)
            .await
            .map_err(|e| AppError::Sftp(format!("rename '{}' → '{}': {}", from, to, e)))?;
        Ok(())
    }

    /// Read an entire file from remote.
    pub async fn read_file(&mut self, path: &str) -> Result<Vec<u8>, AppError> {
        self.session
            .read(path)
            .await
            .map_err(|e| AppError::Sftp(format!("read_file '{}': {}", path, e)))
    }

    /// Write data to a remote file (creates or truncates).
    pub async fn write_file(&mut self, path: &str, data: &[u8]) -> Result<(), AppError> {
        self.session
            .write(path, data)
            .await
            .map_err(|e| AppError::Sftp(format!("write_file '{}': {}", path, e)))?;
        Ok(())
    }

    /// Open a remote file for chunked reading. Returns file size.
    pub async fn open_read(&mut self, path: &str) -> Result<(russh_sftp::client::fs::File, u64), AppError> {
        let file = self.session
            .open(path)
            .await
            .map_err(|e| AppError::Sftp(format!("open_read '{}': {}", path, e)))?;
        let meta = self.session
            .metadata(path)
            .await
            .map_err(|e| AppError::Sftp(format!("metadata '{}': {}", path, e)))?;
        Ok((file, meta.len()))
    }

    /// Open a remote file for chunked writing (creates or truncates).
    pub async fn open_write(&mut self, path: &str) -> Result<russh_sftp::client::fs::File, AppError> {
        self.session
            .create(path)
            .await
            .map_err(|e| AppError::Sftp(format!("open_write '{}': {}", path, e)))
    }
}
