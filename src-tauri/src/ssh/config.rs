use std::collections::HashMap;
use russh::keys::key::PublicKey;
use russh::keys::PublicKeyBase64;
use sha2::{Sha256, Digest};

/// In-memory host key store (will persist to SQLite in Phase 2).
/// Maps "host:port" → expected fingerprint hex string.
#[derive(Clone, Default)]
pub struct HostKeyStore {
    keys: HashMap<String, String>,
}

impl HostKeyStore {
    pub fn new() -> Self {
        Self {
            keys: HashMap::new(),
        }
    }

    pub fn get(&self, host: &str, port: u16) -> Option<&str> {
        self.keys
            .get(&format!("{}:{}", host, port))
            .map(|s| s.as_str())
    }

    pub fn set(&mut self, host: &str, port: u16, fingerprint: &str) {
        self.keys
            .insert(format!("{}:{}", host, port), fingerprint.to_string());
    }
}

/// Compute SHA256 fingerprint of an SSH public key.
pub fn fingerprint(key: &PublicKey) -> String {
    let mut hasher = Sha256::new();
    hasher.update(&key.public_key_bytes());
    hex::encode(hasher.finalize())
}
