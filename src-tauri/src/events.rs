use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct TerminalOutput {
    pub connection_id: String,
    pub data: Vec<u8>,
}

#[derive(Clone, Serialize)]
pub struct TransferProgress {
    pub transfer_id: String,
    pub bytes_transferred: u64,
    pub total_bytes: u64,
    pub speed_bytes_per_sec: f64,
}

#[derive(Clone, Serialize)]
pub struct ConnectionStatus {
    pub connection_id: String,
    pub status: String,
    pub message: Option<String>,
}
