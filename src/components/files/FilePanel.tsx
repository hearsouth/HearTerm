import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTransferStore } from '../../stores/transferStore';
import TransferQueue from './TransferQueue';

interface FileEntry {
  name: string; is_dir: boolean; size: number; modified: number;
}
interface TreeNode {
  entry: FileEntry; path: string; depth: number;
  expanded: boolean; children: TreeNode[] | null;
}
interface Props { connectionId: string; }

export default function FilePanel({ connectionId }: Props) {
  const [remotePath, setRemotePath] = useState('/');
  const [pathInput, setPathInput] = useState('/');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOverPanel, setDragOverPanel] = useState(false);
  const [dropDialog, setDropDialog] = useState<{ paths: string[] } | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<FileEntry | null>(null);
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [completions, setCompletions] = useState<string[]>([]);
  const addTransfer = useTransferStore((s) => s.addTransfer);
  const remotePathRef = useRef(remotePath);
  remotePathRef.current = remotePath;

  const loadChildren = useCallback(async (path: string): Promise<FileEntry[]> => {
    const result = await invoke<FileEntry[]>('sftp_list', { connectionId, path });
    result.sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return result;
  }, [connectionId]);

  const buildTreeToPath = useCallback(async (targetPath: string) => {
    setLoading(true); setError('');
    try {
      const segments = targetPath.split('/').filter(Boolean);
      let currentPath = '/';
      let roots: TreeNode[] = [];

      // Load root
      const rootEntries = await loadChildren('/');
      roots = rootEntries.map(e => ({
        entry: e, path: `/${e.name}`, depth: 0, expanded: false, children: null,
      }));

      if (segments.length === 0) {
        // Just root
        setTreeData(roots);
        setRemotePath('/'); setPathInput('/');
        setLoading(false); return;
      }

      // Walk down each segment, expanding as we go
      let parentNodes = roots;
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        currentPath = '/' + segments.slice(0, i + 1).join('/');
        const node = parentNodes.find(n => n.entry.name === seg && n.entry.is_dir);
        if (!node) break;

        if (i < segments.length - 1 || true) {
          // Load children for this node
          try {
            const entries = await loadChildren(currentPath);
            node.children = entries.map(e => ({
              entry: e,
              path: currentPath.endsWith('/') ? `${currentPath}${e.name}` : `${currentPath}/${e.name}`,
              depth: i + 1, expanded: false, children: null,
            }));
            node.expanded = true;
            parentNodes = node.children;
          } catch { node.expanded = false; break; }
        }
      }

      setTreeData(roots);
      setRemotePath(targetPath); setPathInput(targetPath);
      setSelectedSet(new Set());
      scrollTargetRef.current = targetPath;
    } catch (e: any) {
      setError(typeof e === 'string' ? e : e?.message || '列出目录失败');
    } finally { setLoading(false); }
  }, [loadChildren]);

  useEffect(() => { buildTreeToPath('/'); }, [buildTreeToPath]);

  // Scroll to target path after tree renders
  const scrollTargetRef = useRef<string | null>(null);
  useEffect(() => {
    if (!scrollTargetRef.current) return;
    const path = scrollTargetRef.current.replace(/\/$/, '') || '/';
    scrollTargetRef.current = null;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-folder="${path}"]`);
        if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    });
  }, [treeData]);

  // Native drag-drop
  useEffect(() => {
    let cancelled = false;
    const setup = async () => {
      const unlisten = await getCurrentWindow().onDragDropEvent(async (event) => {
        if (cancelled) return;
        if (event.payload.type === 'over') { setDragOverPanel(true); return; }
        if (event.payload.type === 'leave') { setDragOverPanel(false); return; }
        if (event.payload.type !== 'drop') return;
        setDragOverPanel(false);
        const { paths } = event.payload;
        // Show inline dialog to confirm target path
        setDropTargetPath(remotePathRef.current);
        setDropDialog({ paths });
      });
      if (cancelled) { unlisten(); }
      return unlisten;
    };
    const promise = setup();
    return () => { cancelled = true; promise.then(unlisten => unlisten?.()); };
  }, []); // run once, use ref for path

  const confirmUpload = async () => {
    if (!dropDialog) return;
    const targetDir = dropTargetPath || '/';
    for (const fp of dropDialog.paths) {
      try {
        const id = await invoke<string>('transfer_upload', { connectionId, localPath: fp, remoteDir: targetDir });
        addTransfer({ id, connection_id: connectionId, direction: 'upload',
          remote_path: targetDir + '/' + (fp.split('/').pop() || 'upload'),
          local_path: fp, bytes_transferred: 0, status: 'queued' });
      } catch (e: any) { setError(e?.toString() || '上传失败'); }
    }
    setDropDialog(null);
  };

  const tabComplete = async () => {
    setCompletions([]);
    const val = pathInput;
    const lastSlash = val.lastIndexOf('/');
    const dir = lastSlash >= 0 ? (val.substring(0, lastSlash) || '/') : '/';
    const partial = val.substring(lastSlash + 1);
    try {
      const entries = await invoke<FileEntry[]>('sftp_list', { connectionId, path: dir });
      const matches = entries
        .filter(e => e.name.toLowerCase().startsWith(partial.toLowerCase()))
        .map(e => e.name + (e.is_dir ? '/' : ''));
      if (matches.length === 1) {
        setPathInput(dir + (dir.endsWith('/') ? '' : '/') + matches[0]);
      } else if (matches.length > 1) {
        let common = partial;
        for (let i = partial.length; i < matches[0].length; i++) {
          const c = matches[0][i];
          if (matches.every(m => m.length > i && m[i] === c)) common += c;
          else break;
        }
        if (common !== partial) {
          setPathInput(dir + (dir.endsWith('/') ? '' : '/') + common);
        }
        setCompletions(matches);
      }
    } catch { /* ignore */ }
  };

  const tabCompleteDrop = async () => {
    const val = dropTargetPath;
    const lastSlash = val.lastIndexOf('/');
    const dir = lastSlash >= 0 ? (val.substring(0, lastSlash) || '/') : '/';
    const partial = val.substring(lastSlash + 1);
    try {
      const entries = await invoke<FileEntry[]>('sftp_list', { connectionId, path: dir });
      const matches = entries
        .filter(e => e.name.toLowerCase().startsWith(partial.toLowerCase()))
        .map(e => e.name + (e.is_dir ? '/' : ''));
      if (matches.length === 1) {
        setDropTargetPath(dir + (dir.endsWith('/') ? '' : '/') + matches[0]);
      } else if (matches.length > 1) {
        let common = partial;
        for (let i = partial.length; i < matches[0].length; i++) {
          const c = matches[0][i];
          if (matches.every(m => m.length > i && m[i] === c)) common += c;
          else break;
        }
        if (common !== partial) {
          setDropTargetPath(dir + (dir.endsWith('/') ? '' : '/') + common);
        }
      }
    } catch { /* ignore */ }
  };

  const navigateTo = () => {
    const p = pathInput.trim() || '/';
    buildTreeToPath(p.startsWith('/') ? p : '/' + p);
  };
  const goUp = () => {
    if (remotePath === '/') return;
    buildTreeToPath(remotePath.substring(0, remotePath.lastIndexOf('/')) || '/');
  };

  const toggleExpand = async (node: TreeNode) => {
    if (node.expanded) { node.expanded = false; setTreeData([...treeData]); return; }
    if (node.children === null) {
      try {
        const entries = await loadChildren(node.path);
        node.children = entries.map(e => ({
          entry: e,
          path: node.path.endsWith('/') ? `${node.path}${e.name}` : `${node.path}/${e.name}`,
          depth: node.depth + 1, expanded: false, children: null,
        }));
      } catch { return; }
    }
    node.expanded = true;
    setTreeData([...treeData]);
  };

  const flattenTree = (nodes: TreeNode[]): { node: TreeNode; depth: number }[] => {
    const res: { node: TreeNode; depth: number }[] = [];
    const walk = (list: TreeNode[]) => {
      for (const n of list) { res.push({ node: n, depth: n.depth }); if (n.expanded && n.children) walk(n.children); }
    };
    walk(nodes);
    return res;
  };

  const flatRows = flattenTree(treeData);

  const toggleSelect = (path: string) => {
    setSelectedSet(prev => { const n = new Set(prev); n.has(path) ? n.delete(path) : n.add(path); return n; });
    setConfirmDelete(null);
  };
  const selectAll = () => {
    if (selectedSet.size === treeData.length && treeData.length > 0) { setSelectedSet(new Set()); return; }
    setSelectedSet(new Set(treeData.map(n => n.path)));
  };
  const doDelete = async (entry: FileEntry, path: string) => {
    try { await invoke('sftp_delete', { connectionId, path, isDir: entry.is_dir }); buildTreeToPath(remotePath); }
    catch (e: any) { setError(e?.toString() || '删除失败'); }
  };

  const handleUploadClick = async () => {
    const paths = await open({ multiple: true, title: '选择要上传的文件' });
    if (!paths) return;
    for (const fp of Array.isArray(paths) ? paths : [paths]) {
      try {
        const id = await invoke<string>('transfer_upload', { connectionId, localPath: fp, remoteDir: remotePath });
        addTransfer({ id, connection_id: connectionId, direction: 'upload',
          remote_path: remotePath + '/' + (fp.split('/').pop() || 'upload'),
          local_path: fp, bytes_transferred: 0, status: 'queued' });
      } catch (e: any) { setError(e?.toString() || '上传失败'); }
    }
  };

  const handleDownload = async (node: TreeNode) => {
    const dir = await open({ directory: true, title: '选择保存目录' });
    if (!dir) return;
    const localDir = Array.isArray(dir) ? dir[0] : dir;
    try {
      const id = await invoke<string>('transfer_download', { connectionId, remotePath: node.path, localDir });
      addTransfer({ id, connection_id: connectionId, direction: 'download',
        remote_path: node.path, local_path: localDir + '/' + node.entry.name, bytes_transferred: 0, status: 'queued' });
    } catch (e: any) { setError(e?.toString() || '下载失败'); }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <div className="h-full flex flex-col text-gray-200 relative"
      onContextMenu={(e) => e.preventDefault()}>
      {/* Drop overlay / confirmation */}
      {(dragOverPanel || dropDialog) && (
        <div className="absolute inset-0 z-40 bg-blue-500/20 border-2 border-dashed border-blue-400 rounded-lg flex items-center justify-center">
          {dropDialog ? (
            <div className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 shadow-xl max-w-md w-full mx-4">
              <div className="text-sm text-gray-300 mb-2">上传 {dropDialog.paths.length} 个文件</div>
              <div className="flex items-center gap-2">
                <input
                  value={dropTargetPath}
                  onChange={e => setDropTargetPath(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') confirmUpload();
                    else if (e.key === 'Tab') { e.preventDefault(); tabCompleteDrop(); }
                    else if (e.key === 'Escape') setDropDialog(null);
                  }}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm font-mono text-gray-300 focus:outline-none focus:border-blue-500"
                  autoFocus
                  placeholder="远程目标路径"
                />
                <button onClick={confirmUpload} className="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded text-sm whitespace-nowrap">上传</button>
                <button onClick={() => setDropDialog(null)} className="text-gray-500 hover:text-gray-300 text-sm px-1">✕</button>
              </div>
            </div>
          ) : (
            <div className="text-blue-300 text-center pointer-events-none">
              <div className="text-lg font-semibold mb-1">拖放文件以远程上传</div>
              <div className="text-sm font-mono bg-blue-900/40 rounded px-3 py-1 inline-block">
                目标目录：{pathInput || '/'}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <button onClick={goUp} className="text-gray-400 hover:text-white text-sm px-1" title="向上一级">⬆</button>
        <button onClick={() => buildTreeToPath(remotePath)} className="text-gray-400 hover:text-white text-sm px-1" title="刷新">↻</button>
        <input value={pathInput} onChange={e => { setPathInput(e.target.value); setCompletions([]); }}
          onKeyDown={e => { if (e.key === 'Enter') navigateTo(); else if (e.key === 'Tab') { e.preventDefault(); tabComplete(); } }}
          onBlur={() => setCompletions([])}
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs font-mono text-gray-300 focus:outline-none focus:border-blue-500"
          placeholder="远程路径，回车跳转，Tab 补全" />
        <button onClick={handleUploadClick} className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-0.5 rounded whitespace-nowrap">⬆ 上传</button>
      </div>

      {/* Tab completions dropdown */}
      {completions.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-b mx-3 shadow-lg max-h-32 overflow-y-auto shrink-0">
          {completions.map(c => (
            <button key={c} onClick={() => {
              const val = pathInput;
              const lastSlash = val.lastIndexOf('/');
              const dir = lastSlash >= 0 ? (val.substring(0, lastSlash) || '/') : '/';
              setPathInput(dir + (dir.endsWith('/') ? '' : '/') + c);
              setCompletions([]);
            }} className="w-full text-left px-3 py-1 text-xs text-gray-300 hover:bg-gray-700 font-mono">{c}</button>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-900/40 text-red-300 px-3 py-1 text-xs flex items-center justify-between shrink-0">
          <span>{error}</span><button onClick={() => setError('')} className="text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      {/* Bulk actions */}
      {selectedSet.size > 0 && (
        <div className="bg-blue-900/30 border-b border-blue-800 px-3 py-1.5 flex items-center gap-2 shrink-0 text-xs">
          <span className="text-blue-300">已选 {selectedSet.size} 项</span>
          <button onClick={async () => {
            const dir = await open({ directory: true, title: '选择批量保存目录' });
            if (!dir) return;
            const localDir = Array.isArray(dir) ? dir[0] : dir;
            for (const spath of selectedSet) {
              const row = flatRows.find(r => r.node.path === spath);
              if (!row) continue;
              try {
                const id = await invoke<string>('transfer_download', { connectionId, remotePath: row.node.path, localDir });
                addTransfer({ id, connection_id: connectionId, direction: 'download',
                  remote_path: row.node.path, local_path: localDir + '/' + row.node.entry.name, bytes_transferred: 0, status: 'queued' });
              } catch {}
            }
          }} className="text-blue-300 hover:text-blue-200 px-2 py-0.5 border border-blue-700 rounded">⬇ 下载选中</button>
          <button onClick={async () => {
            if (confirmDelete) { setConfirmDelete(null); return; }
            setConfirmDelete({ name: '__bulk__', is_dir: false, size: 0, modified: 0 });
            let count = 0;
            for (const spath of selectedSet) {
              const row = flatRows.find(r => r.node.path === spath);
              if (!row) continue;
              try { await invoke('sftp_delete', { connectionId, path: row.node.path, isDir: row.node.entry.is_dir }); count++; } catch {}
            }
            setConfirmDelete(null);
            if (count > 0) buildTreeToPath(remotePath);
          }} className="text-red-400 hover:text-red-300 px-2 py-0.5 border border-red-700 rounded">🗑 删除选中</button>
          <button onClick={() => setSelectedSet(new Set())} className="text-gray-500 hover:text-gray-300 ml-auto">清除选择</button>
        </div>
      )}

      {/* File tree */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-gray-500 text-sm p-4">加载中…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900 text-gray-500 text-xs z-10">
              <tr>
                <th className="w-8 px-2 py-1.5"><input type="checkbox" checked={selectedSet.size === treeData.length && treeData.length > 0}
                  onChange={selectAll} className="rounded bg-gray-700 border-gray-600" /></th>
                <th className="text-left py-1.5">名称</th>
                <th className="text-right px-2 py-1.5 w-20">大小</th>
                <th className="text-right px-2 py-1.5 w-36">修改时间</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody>
              {flatRows.map(({ node, depth }) => (
                <Fragment key={node.path}>
                  <tr
                    data-folder={node.entry.is_dir ? node.path : undefined}
                    className={`cursor-pointer hover:bg-gray-800/50 ${selectedSet.has(node.path) ? 'bg-blue-900/20' : ''}`}>
                    {/* Checkbox — always at left edge */}
                    <td className="px-2 py-1" onClick={ev => ev.stopPropagation()}>
                      <input type="checkbox" checked={selectedSet.has(node.path)}
                        onChange={() => toggleSelect(node.path)} className="rounded bg-gray-700 border-gray-600" />
                    </td>
                    {/* Name column — indented with arrow + icon */}
                    <td className="py-1 truncate max-w-[200px]"
                      style={{ paddingLeft: `${depth * 16 + 4}px` }}
                      onClick={() => node.entry.is_dir && toggleExpand(node)}>
                      <span className="inline-flex items-center gap-1">
                        {node.entry.is_dir && (
                          <span className="text-gray-500 text-[10px] w-3 text-center inline-block leading-none">
                            {node.expanded ? '▼' : '▶'}
                          </span>
                        )}
                        <span>{node.entry.is_dir ? (node.expanded ? '📂' : '📁') : '📄'}</span>
                        <span className="truncate">{node.entry.name}</span>
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right text-gray-500" onClick={ev => ev.stopPropagation()}>
                      {node.entry.is_dir ? '-' : formatSize(node.entry.size)}
                    </td>
                    <td className="px-2 py-1 text-right text-gray-600 text-xs" onClick={ev => ev.stopPropagation()}>
                      {node.entry.modified ? new Date(node.entry.modified * 1000).toLocaleString() : '-'}
                    </td>
                    <td className="pr-2 py-1 flex gap-0.5 justify-end" onClick={ev => ev.stopPropagation()}>
                      <button onClick={() => handleDownload(node)}
                        className="text-gray-500 hover:text-blue-400 text-xs px-1">{node.entry.is_dir ? '📥' : '⬇'}</button>
                      {confirmDelete?.name === node.entry.name ? (<>
                        <button onClick={() => { doDelete(node.entry, node.path); setConfirmDelete(null); }}
                          className="text-red-400 hover:text-red-300 text-xs px-1 font-bold">确认</button>
                        <button onClick={() => setConfirmDelete(null)} className="text-gray-500 hover:text-gray-300 text-xs px-1">✕</button>
                      </>) : (
                        <button onClick={() => { setConfirmDelete({ ...node.entry }); setSelectedSet(new Set()); }}
                          className="text-gray-500 hover:text-red-400 text-xs px-1">🗑</button>
                      )}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-gray-600 px-3 py-1 bg-gray-900 border-t border-gray-800 shrink-0">
        {treeData.length} 项
      </div>
      <TransferQueue />
    </div>
  );
}
