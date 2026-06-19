use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private_key_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fingerprint: Option<String>,
    pub group_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_label: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub last_connected_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transfer {
    pub id: String,
    pub connection_id: Option<String>,
    pub direction: String,
    pub remote_path: String,
    pub local_path: String,
    pub total_size: Option<i64>,
    pub bytes_transferred: i64,
    pub chunk_size: i64,
    pub status: String,
    pub resume_token: Option<String>,
    pub error_message: Option<String>,
    pub speed_bytes_per_sec: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub completed_at: Option<i64>,
}
