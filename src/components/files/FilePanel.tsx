import { useState, useEffect, useCallback, DragEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
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
  const [confirmDelete, setConfirmDelete] = useState<FileEntry | null>(null);
  const addTransfer = useTransferStore((s) => s.addTransfer);

  const loadDir = useCallback(async (path: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await invoke<FileEntry[]>('sftp_list', { connectionId, path });
      setEntries(result);
      setRemotePath(path);
    } catch (e: any) {
      setError(typeof e === 'string' ? e : e?.message || '列出目录失败');
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

  const handleDeleteClick = (entry: FileEntry) => {
    if (confirmDelete?.name !== entry.name) { setConfirmDelete(entry); return; }
    setConfirmDelete(null);
    doDelete(entry);
  };

  const doDelete = async (entry: FileEntry) => {
    try {
      const sep = remotePath.endsWith('/') ? '' : '/';
      await invoke('sftp_delete', { connectionId, path: remotePath + sep + entry.name, isDir: entry.is_dir });
      loadDir(remotePath);
    } catch (e: any) {
      setError(e?.toString() || '删除失败');
    }
  };

  // Upload via native file picker
  const handleUploadClick = async () => {
    const paths = await open({ multiple: true, title: '选择要上传的文件' });
    if (!paths) return;
    const files = Array.isArray(paths) ? paths : [paths];
    for (const path of files) {
      try {
        const id = await invoke<string>('transfer_upload', { connectionId, localPath: path, remoteDir: remotePath });
        addTransfer({
          id, connection_id: connectionId, direction: 'upload',
          remote_path: remotePath + '/' + (path.split('/').pop() || path.split('\\').pop() || 'upload'),
          local_path: path, bytes_transferred: 0, status: 'queued',
        });
      } catch (e: any) {
        setError(e?.toString() || '上传失败');
      }
    }
  };

  // Download via native directory picker
  const handleDownload = async (entry: FileEntry) => {
    if (entry.is_dir) return;
    const dir = await open({ directory: true, title: '选择保存目录' });
    if (!dir) return;
    const localDir = Array.isArray(dir) ? dir[0] : dir;
    try {
      const sep = remotePath.endsWith('/') ? '' : '/';
      const id = await invoke<string>('transfer_download', { connectionId, remotePath: remotePath + sep + entry.name, localDir });
      addTransfer({
        id, connection_id: connectionId, direction: 'download',
        remote_path: remotePath + sep + entry.name, local_path: localDir + '/' + entry.name,
        bytes_transferred: 0, status: 'queued',
      });
    } catch (e: any) {
      setError(e?.toString() || '下载失败');
    }
  };

  const handleDragOver = (e: DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = async (e: DragEvent) => {
    e.preventDefault(); setDragOver(false);
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const path = (e.dataTransfer.files[i] as any).path || e.dataTransfer.files[i].name;
      if (path) {
        try {
          const id = await invoke<string>('transfer_upload', { connectionId, localPath: path, remoteDir: remotePath });
          addTransfer({
            id, connection_id: connectionId, direction: 'upload',
            remote_path: remotePath + '/' + (path.split('/').pop() || path.split('\\').pop() || 'upload'),
            local_path: path, bytes_transferred: 0, status: 'queued',
          });
        } catch (e: any) { setError(e?.toString() || '上传失败'); }
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
    <div className="h-full flex flex-col text-gray-200"
      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {dragOver && (
        <div className="absolute inset-0 z-40 bg-blue-500/20 border-2 border-dashed border-blue-400 rounded-lg flex items-center justify-center pointer-events-none">
          <div className="text-blue-300 text-lg font-semibold">拖放文件以上传</div>
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <button onClick={goUp} className="text-gray-400 hover:text-white text-sm px-1" title="向上一级">⬆</button>
        <button onClick={() => loadDir(remotePath)} className="text-gray-400 hover:text-white text-sm px-1" title="刷新">↻</button>
        <div className="flex-1 text-sm text-gray-400 font-mono truncate">{remotePath}</div>
        <button onClick={handleUploadClick} className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-0.5 rounded">⬆ 上传</button>
      </div>

      {error && (
        <div className="bg-red-900/40 text-red-300 px-3 py-1 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-gray-500 text-sm p-4">加载中…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-3 py-1.5 w-8"></th>
                <th className="text-left px-3 py-1.5">名称</th>
                <th className="text-right px-3 py-1.5 w-24">大小</th>
                <th className="text-right px-3 py-1.5 w-36">修改时间</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.name}
                  onClick={() => { setConfirmDelete(null); navigate(e); }}
                  onDoubleClick={() => e.is_dir && navigate(e)}
                  className={`cursor-pointer hover:bg-gray-800/50 ${selected === e.name ? 'bg-blue-900/30' : ''}`}>
                  <td className="px-3 py-1">{e.is_dir ? '📁' : '📄'}</td>
                  <td className="px-3 py-1 truncate max-w-[250px]">{e.name}</td>
                  <td className="px-3 py-1 text-right text-gray-500">{e.is_dir ? '-' : formatSize(e.size)}</td>
                  <td className="px-3 py-1 text-right text-gray-600 text-xs">
                    {e.modified ? new Date(e.modified * 1000).toLocaleString() : '-'}
                  </td>
                  <td className="px-1 py-1 flex gap-0.5">
                    {!e.is_dir && (
                      <button onClick={(ev) => { ev.stopPropagation(); handleDownload(e); }}
                        className="text-gray-500 hover:text-blue-400 text-xs px-1" title="下载">⬇</button>
                    )}
                    {confirmDelete?.name === e.name ? (<>
                      <button onClick={(ev) => { ev.stopPropagation(); doDelete(e); setConfirmDelete(null); }}
                        className="text-red-400 hover:text-red-300 text-xs px-1 font-bold" title="确认删除">确认</button>
                      <button onClick={(ev) => { ev.stopPropagation(); setConfirmDelete(null); }}
                        className="text-gray-500 hover:text-gray-300 text-xs px-1" title="取消">✕</button>
                    </>) : (
                      <button onClick={(ev) => { ev.stopPropagation(); handleDeleteClick(e); }}
                        className="text-gray-500 hover:text-red-400 text-xs px-1" title="删除">🗑</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-gray-600 px-3 py-1 bg-gray-900 border-t border-gray-800">
        {entries.length} 项
      </div>

      <TransferQueue />
    </div>
  );
}
