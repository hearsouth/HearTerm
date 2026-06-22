use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;
use crate::commands::connection::ConnectionManager;
use crate::events::TerminalOutput;

type WriteSender = mpsc::UnboundedSender<Vec<u8>>;

pub struct TerminalChannels {
    pub writers: Arc<Mutex<HashMap<String, WriteSender>>>,
}

#[tauri::command]
pub async fn term_open(
    state: State<'_, ConnectionManager>,
    term_state: State<'_, TerminalChannels>,
    terminal_id: String,
    connection_id: String,
    app: AppHandle,
) -> Result<(), String> {
    let mut shell = {
        let sessions = state.sessions.lock().await;
        let session = sessions
            .get(&connection_id)
            .ok_or("Connection not found")?;
        session
            .open_shell(&connection_id)
            .await
            .map_err(|e| e.to_string())?
    };

    let (write_tx, mut write_rx) = mpsc::unbounded_channel::<Vec<u8>>();

    term_state
        .inner()
        .writers
        .lock()
        .unwrap()
        .insert(terminal_id.clone(), write_tx);

    let tid = terminal_id.clone();
    let writers = Arc::clone(&term_state.inner().writers);

    tokio::spawn(async move {
        let mut buf = vec![0u8; 4096];
        loop {
            tokio::select! {
                Some(data) = write_rx.recv() => {
                    if let Err(e) = shell.write(&data).await {
                        eprintln!("term_write error for {}: {}", tid, e);
                    }
                }
                result = shell.read(&mut buf) => {
                    match result {
                        Ok(0) => break,
                        Ok(n) => {
                            let _ = app.emit("terminal-output", TerminalOutput {
                                connection_id: tid.clone(),
                                data: buf[..n].to_vec(),
                            });
                        }
                        Err(e) => {
                            eprintln!("term_read error for {}: {}", tid, e);
                            break;
                        }
                    }
                }
            }
        }

        writers.lock().unwrap().remove(&tid);
        let _ = app.emit("terminal-output", TerminalOutput {
            connection_id: tid,
            data: b"\r\n\x1b[31m[Connection closed]\x1b[0m\r\n".to_vec(),
        });
    });

    Ok(())
}

#[tauri::command]
pub async fn term_write(
    term_state: State<'_, TerminalChannels>,
    terminal_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let writers = term_state.inner().writers.lock().unwrap();
    if let Some(tx) = writers.get(&terminal_id) {
        tx.send(data).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Terminal not open for this ID".into())
    }
}

#[tauri::command]
pub async fn term_resize(
    _terminal_id: String,
    _cols: u32,
    _rows: u32,
) -> Result<(), String> {
    Ok(())
}
