import { useState, useEffect, useCallback, useRef, DragEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useTransferStore } from '../../stores/transferStore';
import TransferQueue from './TransferQueue';

interface FileEntry {
  name: string;
  is_dir: boolean;
  size: number;
  modified: number;
}

interface Props {
  connectionId: string;
}

export default function FilePanel({ connectionId }: Props) {
  const [remotePath, setRemotePath] = useState('/');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const addTransfer = useTransferStore((s) => s.addTransfer);

  const loadDir = useCallback(async (path: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await invoke<FileEntry[]>('sftp_list', { connectionId, path });
      setEntries(result);
      setRemotePath(path);
    } catch (e: any) {
      setError(typeof e === 'string' ? e : e?.message || 'Failed to list directory');
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => {
    loadDir('/');
  }, [loadDir]);

  const navigate = (entry: FileEntry) => {
    if (entry.is_dir) {
      const sep = remotePath.endsWith('/') ? '' : '/';
      loadDir(remotePath + sep + entry.name);
    }
    setSelected(entry.name);
  };

  const goUp = () => {
    if (remotePath === '/') return;
    const parent = remotePath.substring(0, remotePath.lastIndexOf('/')) || '/';
    loadDir(parent);
  };

  const handleDelete = async (entry: FileEntry) => {
    if (!confirm(`Delete "${entry.name}"?`)) return;
    try {
      const sep = remotePath.endsWith('/') ? '' : '/';
      await invoke('sftp_delete', { connectionId, path: remotePath + sep + entry.name, isDir: entry.is_dir });
      loadDir(remotePath);
    } catch (e: any) {
      setError(e?.toString() || 'Delete failed');
    }
  };

  // === Upload via button ===
  const handleUploadClick = async () => {
    try {
      // Use a simple prompt for path input (Tauri dialog plugin would be better)
      const path = prompt('Enter local file path to upload:');
      if (!path) return;

      const id = await invoke<string>('transfer_upload', {
        connectionId,
        localPath: path,
        remoteDir: remotePath,
      });

      addTransfer({
        id,
        connection_id: connectionId,
        direction: 'upload',
        remote_path: remotePath + '/' + (path.split('/').pop() || 'upload'),
        local_path: path,
        bytes_transferred: 0,
        status: 'queued',
      });
    } catch (e: any) {
      setError(e?.toString() || 'Upload failed');
    }
  };

  // === Download ===
  const handleDownload = async (entry: FileEntry) => {
    if (entry.is_dir) return;
    try {
      const localDir = prompt('Enter local directory to save to:');
      if (!localDir) return;

      const sep = remotePath.endsWith('/') ? '' : '/';
      const id = await invoke<string>('transfer_download', {
        connectionId,
        remotePath: remotePath + sep + entry.name,
        localDir,
      });

      addTransfer({
        id,
        connection_id: connectionId,
        direction: 'download',
        remote_path: remotePath + sep + entry.name,
        local_path: localDir + '/' + entry.name,
        bytes_transferred: 0,
        status: 'queued',
      });
    } catch (e: any) {
      setError(e?.toString() || 'Download failed');
    }
  };

  // === Drag and drop ===
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    // Try to get file paths from the drop event
    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // In some Tauri/webview setups, file.path is available
      const path = (file as any).path || file.name;
      if (!path) continue;

      try {
        const id = await invoke<string>('transfer_upload', {
          connectionId,
          localPath: path,
          remoteDir: remotePath,
        });
        addTransfer({
          id,
          connection_id: connectionId,
          direction: 'upload',
          remote_path: remotePath + '/' + file.name,
          local_path: path,
          bytes_transferred: 0,
          status: 'queued',
        });
      } catch (e: any) {
        setError(e?.toString() || 'Upload failed');
      }
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <div
      className="h-full flex flex-col bg-gray-950 text-gray-200"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-40 bg-blue-500/20 border-2 border-dashed border-blue-400 rounded-lg flex items-center justify-center pointer-events-none">
          <div className="text-blue-300 text-lg font-semibold">Drop files to upload</div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <button onClick={goUp} className="text-gray-400 hover:text-white text-sm px-1" title="Up">⬆</button>
        <button onClick={() => loadDir(remotePath)} className="text-gray-400 hover:text-white text-sm px-1" title="Refresh">↻</button>
        <div className="flex-1 text-sm text-gray-400 font-mono truncate">{remotePath}</div>
        <button onClick={handleUploadClick} className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-0.5 rounded">⬆ Upload</button>
      </div>

      {error && <div className="bg-red-900/40 text-red-300 px-3 py-1 text-xs">{error}</div>}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-gray-500 text-sm p-4">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-3 py-1.5 w-8"></th>
                <th className="text-left px-3 py-1.5">Name</th>
                <th className="text-right px-3 py-1.5 w-24">Size</th>
                <th className="text-right px-3 py-1.5 w-36">Modified</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr
                  key={e.name}
                  onClick={() => navigate(e)}
                  onDoubleClick={() => e.is_dir && navigate(e)}
                  className={`cursor-pointer hover:bg-gray-800/50 ${
                    selected === e.name ? 'bg-blue-900/30' : ''
                  }`}
                >
                  <td className="px-3 py-1">{e.is_dir ? '📁' : '📄'}</td>
                  <td className="px-3 py-1 truncate max-w-[250px]">{e.name}</td>
                  <td className="px-3 py-1 text-right text-gray-500">
                    {e.is_dir ? '-' : formatSize(e.size)}
                  </td>
                  <td className="px-3 py-1 text-right text-gray-600 text-xs">
                    {e.modified ? new Date(e.modified * 1000).toLocaleString() : '-'}
                  </td>
                  <td className="px-1 py-1 flex gap-0.5">
                    {!e.is_dir && (
                      <button
                        onClick={(ev) => { ev.stopPropagation(); handleDownload(e); }}
                        className="text-gray-500 hover:text-blue-400 text-xs px-1"
                        title="Download"
                      >⬇</button>
                    )}
                    <button
                      onClick={(ev) => { ev.stopPropagation(); handleDelete(e); }}
                      className="text-gray-500 hover:text-red-400 text-xs px-1"
                      title="Delete"
                    >🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-gray-600 px-3 py-1 bg-gray-900 border-t border-gray-800">
        {entries.length} item{entries.length !== 1 ? 's' : ''}
      </div>

      <TransferQueue />
    </div>
  );
}
