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
