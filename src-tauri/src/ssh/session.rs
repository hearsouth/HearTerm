use std::net::ToSocketAddrs;
use std::sync::Arc;
use russh::client::Handle;
use russh::client::Msg;
use russh::Channel;
use russh::ChannelMsg;
use russh::keys::key::PublicKey;
use crate::error::AppError;
use crate::ssh::config::{HostKeyStore, fingerprint};

pub struct SshSession {
    pub handle: Handle<ClientHandler>,
    host_key_store: HostKeyStore,
}

/// An open shell channel with read/write access.
pub struct ShellChannel {
    pub channel: Channel<Msg>,
    pub connection_id: String,
}

impl ShellChannel {
    /// Send data to the remote shell's stdin.
    pub async fn write(&mut self, data: &[u8]) -> Result<(), AppError> {
        let cursor = std::io::Cursor::new(data.to_vec());
        self.channel
            .data(cursor)
            .await
            .map_err(|e| AppError::Ssh(format!("Write failed: {}", e)))
    }

    /// Read available data from the remote shell's stdout/stderr.
    /// Returns the number of bytes read. Returns 0 on EOF.
    pub async fn read(&mut self, buf: &mut [u8]) -> Result<usize, AppError> {
        match self.channel.wait().await {
            Some(ChannelMsg::Data { ref data }) => {
                let len = data.len().min(buf.len());
                buf[..len].copy_from_slice(&data[..len]);
                Ok(len)
            }
            Some(ChannelMsg::ExtendedData { ref data, .. }) => {
                let len = data.len().min(buf.len());
                buf[..len].copy_from_slice(&data[..len]);
                Ok(len)
            }
            Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) => Ok(0),
            None => Ok(0),
            _ => Ok(0),
        }
    }

    /// Resize the PTY (e.g., when terminal window size changes).
    pub async fn resize(&mut self, cols: u32, rows: u32) -> Result<(), AppError> {
        self.channel
            .window_change(cols, rows, 0, 0)
            .await
            .map_err(|e| AppError::Ssh(format!("Resize failed: {}", e)))
    }
}

impl SshSession {
    /// Connect to an SSH server with password authentication.
    pub async fn connect(
        host: &str,
        port: u16,
        username: &str,
        password: &str,
    ) -> Result<Self, AppError> {
        let addr = (host, port)
            .to_socket_addrs()
            .map_err(|e| AppError::Ssh(format!("DNS resolve failed: {}", e)))?
            .next()
            .ok_or_else(|| AppError::Ssh("No address resolved".into()))?;

        let config = Arc::new(russh::client::Config::default());
        let store = HostKeyStore::new();

        let handler = ClientHandler {
            host: host.to_string(),
            port,
            store: std::sync::Mutex::new(store.clone()),
            host_key_verified: false,
            host_key_error: None,
        };

        let mut client = russh::client::connect(config, addr, handler)
            .await
            .map_err(|e| AppError::Ssh(format!("Connection failed: {}", e)))?;

        let auth_result = client
            .authenticate_password(username, password)
            .await
            .map_err(|e| AppError::Ssh(format!("Auth failed: {}", e)))?;

        if !auth_result {
            return Err(AppError::Ssh("Authentication rejected".into()));
        }

        Ok(SshSession {
            handle: client,
            host_key_store: store,
        })
    }

    /// Open an interactive shell session with PTY allocation.
    pub async fn open_shell(&mut self, connection_id: &str) -> Result<ShellChannel, AppError> {
        let channel = self
            .handle
            .channel_open_session()
            .await
            .map_err(|e| AppError::Ssh(format!("Failed to open session channel: {}", e)))?;

        // Request PTY
        channel
            .request_pty(false, "xterm-256color", 80, 24, 0, 0, &[])
            .await
            .map_err(|e| AppError::Ssh(format!("PTY request failed: {}", e)))?;

        // Start shell
        channel
            .request_shell(false)
            .await
            .map_err(|e| AppError::Ssh(format!("Shell request failed: {}", e)))?;

        Ok(ShellChannel {
            channel,
            connection_id: connection_id.to_string(),
        })
    }
}

/// Russh client handler with host key verification.
pub struct ClientHandler {
    host: String,
    port: u16,
    store: std::sync::Mutex<HostKeyStore>,
    host_key_verified: bool,
    host_key_error: Option<String>,
}

#[async_trait::async_trait]
impl russh::client::Handler for ClientHandler {
    type Error = anyhow::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        // Trust on first use (TOFU) policy
        let fp = fingerprint(server_public_key);
        let mut store = self.store.lock().unwrap();

        match store.get(&self.host, self.port) {
            Some(expected) if expected == fp => {
                self.host_key_verified = true;
                Ok(true)
            }
            Some(_existing) => {
                self.host_key_error = Some(format!(
                    "Host key mismatch for {}:{}. Possible MITM attack!",
                    self.host, self.port
                ));
                Ok(false)
            }
            None => {
                // First connection — save the fingerprint (TOFU)
                store.set(&self.host, self.port, &fp);
                self.host_key_verified = true;
                Ok(true)
            }
        }
    }
}
