use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use crate::error::AppError;
use crate::events::TransferProgress;
use crate::ssh::sftp::SftpClient;

const CHUNK_SIZE: usize = 1_048_576; // 1 MB

/// Upload a local file to a remote path, emitting progress events.
pub async fn upload_file(
    sftp: &mut SftpClient,
    local_path: &str,
    remote_path: &str,
    transfer_id: &str,
    app: &AppHandle,
) -> Result<(), AppError> {
    let metadata = tokio::fs::metadata(local_path).await?;
    let total = metadata.len();
    let mut file = tokio::fs::File::open(local_path).await?;
    let mut buf = vec![0u8; CHUNK_SIZE];
    let mut transferred: u64 = 0;
    let start_time = std::time::Instant::now();

    // Create remote file for writing
    let mut remote = sftp.open_write(remote_path).await?;

    loop {
        let n = file.read(&mut buf).await?;
        if n == 0 { break; }

        remote.write_all(&buf[..n]).await
            .map_err(|e| AppError::Sftp(format!("write: {}", e)))?;

        transferred += n as u64;
        let elapsed = start_time.elapsed().as_secs_f64().max(0.1);
        let speed = transferred as f64 / elapsed;

        let _ = app.emit("transfer-progress", TransferProgress {
            transfer_id: transfer_id.to_string(),
            bytes_transferred: transferred,
            total_bytes: total,
            speed_bytes_per_sec: speed,
        });
    }

    remote.shutdown().await.ok();
    Ok(())
}

/// Recursively upload a local directory to a remote path.
pub async fn upload_dir(
    sftp: &mut SftpClient,
    local_dir: &str,
    remote_dir: &str,
    transfer_id: &str,
    app: &AppHandle,
) -> Result<(), AppError> {
    // Create remote directory
    if let Err(e) = sftp.mkdir(remote_dir).await {
        // Ignore "already exists" errors
        let _ = e;
    }
    let mut entries = tokio::fs::read_dir(local_dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name().to_string_lossy().to_string();
        let local_path = format!("{}/{}", local_dir.trim_end_matches('/'), name);
        let remote_path = format!("{}/{}", remote_dir.trim_end_matches('/'), name);
        if entry.file_type().await?.is_dir() {
            Box::pin(upload_dir(sftp, &local_path, &remote_path, transfer_id, app)).await?;
        } else {
            upload_file(sftp, &local_path, &remote_path, transfer_id, app).await?;
        }
    }
    Ok(())
}

/// Download a remote file to a local path, emitting progress events.
pub async fn download_file(
    sftp: &mut SftpClient,
    remote_path: &str,
    local_path: &str,
    transfer_id: &str,
    app: &AppHandle,
) -> Result<(), AppError> {
    let (mut remote, total) = sftp.open_read(remote_path).await?;
    let mut file = tokio::fs::File::create(local_path).await?;
    let mut buf = vec![0u8; CHUNK_SIZE];
    let mut transferred: u64 = 0;
    let start_time = std::time::Instant::now();

    loop {
        let n = remote.read(&mut buf).await
            .map_err(|e| AppError::Sftp(format!("read: {}", e)))?;
        if n == 0 { break; }

        file.write_all(&buf[..n]).await?;

        transferred += n as u64;
        let elapsed = start_time.elapsed().as_secs_f64().max(0.1);
        let speed = transferred as f64 / elapsed;

        let _ = app.emit("transfer-progress", TransferProgress {
            transfer_id: transfer_id.to_string(),
            bytes_transferred: transferred,
            total_bytes: total,
            speed_bytes_per_sec: speed,
        });
    }

    file.shutdown().await.ok();
    Ok(())
}

/// Recursively download a remote directory to a local path.
pub async fn download_dir(
    sftp: &mut SftpClient,
    remote_dir: &str,
    local_dir: &str,
    transfer_id: &str,
    app: &AppHandle,
) -> Result<(), AppError> {
    tokio::fs::create_dir_all(local_dir).await?;
    let entries = sftp.list(remote_dir).await?;
    for entry in entries {
        let remote_path = format!("{}/{}", remote_dir.trim_end_matches('/'), entry.name);
        let local_path = format!("{}/{}", local_dir.trim_end_matches('/'), entry.name);
        if entry.is_dir {
            Box::pin(download_dir(sftp, &remote_path, &local_path, transfer_id, app)).await?;
        } else {
            download_file(sftp, &remote_path, &local_path, transfer_id, app).await?;
        }
    }
    Ok(())
}
