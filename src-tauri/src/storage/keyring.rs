use crate::error::AppError;

const SERVICE_NAME: &str = "ssh-tool";

/// Store password in OS keychain.
pub fn store_password(connection_id: &str, password: &str) -> Result<(), AppError> {
    let entry = keyring::Entry::new(SERVICE_NAME, connection_id)
        .map_err(|e| AppError::Keyring(e.to_string()))?;
    entry
        .set_password(password)
        .map_err(|e| AppError::Keyring(e.to_string()))?;
    Ok(())
}

/// Retrieve password from OS keychain.
pub fn get_password(connection_id: &str) -> Result<String, AppError> {
    let entry = keyring::Entry::new(SERVICE_NAME, connection_id)
        .map_err(|e| AppError::Keyring(e.to_string()))?;
    entry
        .get_password()
        .map_err(|e| AppError::Keyring(e.to_string()))
}

/// Delete password from OS keychain.
pub fn delete_password(connection_id: &str) -> Result<(), AppError> {
    let entry = keyring::Entry::new(SERVICE_NAME, connection_id)
        .map_err(|e| AppError::Keyring(e.to_string()))?;
    entry
        .delete_credential()
        .map_err(|e| AppError::Keyring(e.to_string()))?;
    Ok(())
}
