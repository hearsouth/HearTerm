use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use rand::RngCore;
use sha2::{Sha256, Digest};
use crate::error::AppError;

fn derive_key(master: &[u8], salt: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(master);
    hasher.update(salt.as_bytes());
    let result = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&result);
    key
}

pub fn generate_master_key() -> Vec<u8> {
    let mut key = vec![0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut key);
    key
}

pub fn encrypt(master_key: &[u8], plaintext: &str, salt: &str) -> Result<String, AppError> {
    let key = derive_key(master_key, salt);
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| AppError::Generic(format!("Cipher init: {}", e)))?;

    let mut nonce_bytes = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| AppError::Generic(format!("Encrypt: {}", e)))?;

    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(hex::encode(&combined))
}

pub fn decrypt(master_key: &[u8], encoded: &str, salt: &str) -> Result<String, AppError> {
    let combined = hex::decode(encoded)
        .map_err(|e| AppError::Generic(format!("Hex decode: {}", e)))?;

    if combined.len() < 12 {
        return Err(AppError::Generic("Invalid ciphertext".into()));
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let key = derive_key(master_key, salt);
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| AppError::Generic(format!("Cipher init: {}", e)))?;

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| AppError::Generic(format!("Decrypt: {}", e)))?;

    String::from_utf8(plaintext)
        .map_err(|e| AppError::Generic(format!("UTF-8: {}", e)))
}
