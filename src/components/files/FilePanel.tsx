import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

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
      const newPath = remotePath.endsWith('/')
        ? remotePath + entry.name
        : remotePath + '/' + entry.name;
      loadDir(newPath);
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
      await invoke('sftp_delete', { connectionId, path: remotePath + '/' + entry.name, isDir: entry.is_dir });
      loadDir(remotePath);
    } catch (e: any) {
      setError(typeof e === 'string' ? e : e?.message || 'Delete failed');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <div className="h-full flex flex-col bg-gray-950 text-gray-200">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <button onClick={goUp} className="text-gray-400 hover:text-white text-sm px-2" title="Up">
          ⬆
        </button>
        <button onClick={() => loadDir(remotePath)} className="text-gray-400 hover:text-white text-sm px-2" title="Refresh">
          ↻
        </button>
        <div className="flex-1 text-sm text-gray-400 font-mono truncate">{remotePath}</div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/40 text-red-300 px-3 py-1 text-xs">{error}</div>
      )}

      {/* File list */}
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
                <th className="w-16"></th>
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
                  <td className="px-3 py-1 truncate max-w-[300px]">{e.name}</td>
                  <td className="px-3 py-1 text-right text-gray-500">
                    {e.is_dir ? '-' : formatSize(e.size)}
                  </td>
                  <td className="px-3 py-1 text-right text-gray-600 text-xs">
                    {e.modified ? new Date(e.modified * 1000).toLocaleString() : '-'}
                  </td>
                  <td className="px-1 py-1">
                    <button
                      onClick={(ev) => { ev.stopPropagation(); handleDelete(e); }}
                      className="text-gray-600 hover:text-red-400 text-xs px-1"
                      title="Delete"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="text-center text-gray-600 py-8">
                    Empty directory
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Status bar */}
      <div className="text-xs text-gray-600 px-3 py-1 bg-gray-900 border-t border-gray-800">
        {entries.length} item{entries.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
