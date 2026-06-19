use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;
use crate::commands::connection::ConnectionManager;
use crate::events::TerminalOutput;

/// Pending writes for each connection. Used by the background read loop
/// to forward user input to the SSH shell.
type WriteSender = mpsc::UnboundedSender<Vec<u8>>;

pub struct TerminalChannels {
    pub writers: Arc<Mutex<HashMap<String, WriteSender>>>,
}

#[tauri::command]
pub async fn term_open(
    state: State<'_, ConnectionManager>,
    term_state: State<'_, TerminalChannels>,
    connection_id: String,
    app: AppHandle,
) -> Result<(), String> {
    // Get session (drop lock before awaiting open_shell)
    let mut session = {
        let mut sessions = state.sessions.lock().unwrap();
        sessions
            .remove(&connection_id)
            .ok_or("Connection not found")?
    };

    let mut shell = session
        .open_shell(&connection_id)
        .await
        .map_err(|e| e.to_string())?;

    // Put the session back (with consumed handle for the shell)
    // Note: after open_shell, we no longer need the session in the map
    // because the shell channel is independent. We re-insert for disconnect.
    state
        .sessions
        .lock()
        .unwrap()
        .insert(connection_id.clone(), session);

    // Create channel for term_write → shell forwarding
    let (write_tx, mut write_rx) = mpsc::unbounded_channel::<Vec<u8>>();

    // Store the sender so term_write can use it
    term_state
        .inner()
        .writers
        .lock()
        .unwrap()
        .insert(connection_id.clone(), write_tx);

    let cid = connection_id.clone();
    let writers = Arc::clone(&term_state.inner().writers);

    // Background task: read from SSH shell AND forward user writes
    tokio::spawn(async move {
        let mut buf = vec![0u8; 4096];
        loop {
            tokio::select! {
                // User typed something → forward to SSH stdin
                Some(data) = write_rx.recv() => {
                    if let Err(e) = shell.write(&data).await {
                        eprintln!("term_write error for {}: {}", cid, e);
                    }
                }
                // SSH shell produced output → send to frontend
                result = shell.read(&mut buf) => {
                    match result {
                        Ok(0) => break, // EOF
                        Ok(n) => {
                            let _ = app.emit("terminal-output", TerminalOutput {
                                connection_id: cid.clone(),
                                data: buf[..n].to_vec(),
                            });
                        }
                        Err(e) => {
                            eprintln!("term_read error for {}: {}", cid, e);
                            break;
                        }
                    }
                }
            }
        }

        // Cleanup
        writers.lock().unwrap().remove(&cid);

        let _ = app.emit("terminal-output", TerminalOutput {
            connection_id: cid,
            data: b"\r\n\x1b[31m[Connection closed]\x1b[0m\r\n".to_vec(),
        });
    });

    Ok(())
}

#[tauri::command]
pub async fn term_write(
    term_state: State<'_, TerminalChannels>,
    connection_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let writers = term_state.inner().writers.lock().unwrap();
    if let Some(tx) = writers.get(&connection_id) {
        tx.send(data).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Terminal not open for this connection".into())
    }
}

#[tauri::command]
pub async fn term_resize(
    _connection_id: String,
    _cols: u32,
    _rows: u32,
) -> Result<(), String> {
    // To implement resize, we'd need to store the ShellChannel handle.
    // For now, the PTY size is fixed at 80x24.
    // ShellChannel resize will be added when we store the channel in state.
    Ok(())
}
