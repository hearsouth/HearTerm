use sha2::{Sha256, Digest};

/// Compute a resume token for a remote file.
/// Used to verify the file hasn't changed when resuming a transfer.
pub fn compute_resume_token(
    remote_first_1kb: &[u8],
    file_size: u64,
    mtime: u64,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(remote_first_1kb);
    hasher.update(&file_size.to_le_bytes());
    hasher.update(&mtime.to_le_bytes());
    hex::encode(hasher.finalize())
}
