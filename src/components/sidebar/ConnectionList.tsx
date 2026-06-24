import { useEffect, useState, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useConnectionStore, Connection } from '../../stores/connectionStore';

interface Props {
  onNewConnection: () => void;
  onEditConnection: (conn: Connection) => void;
  onConnect: (id: string) => void;
  showNewGroup?: boolean;
  onShowNewGroupChange?: (v: boolean) => void;
}

export default function ConnectionList({ onNewConnection, onEditConnection, onConnect, showNewGroup: showNewGroupProp, onShowNewGroupChange }: Props) {
  const { connections, setConnections, activeId } = useConnectionStore();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<string | null>(null);
  const [connectError, setConnectError] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const showNewGroup = showNewGroupProp ?? false;
  const [newGroupName, setNewGroupName] = useState('');
  const [allGroups, setAllGroups] = useState<string[]>([]);
  const [moveMenuConnId, setMoveMenuConnId] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>();

  const refresh = () => {
    Promise.all([
      invoke<Connection[]>('list_connections'),
      invoke<string[]>('list_groups'),
    ]).then(([conns, groups]) => {
      setConnections(conns);
      setAllGroups(groups);
    }).catch(console.error);
  };

  useEffect(() => { refresh(); }, []);

  // Close move menu on outside click
  useEffect(() => {
    if (!moveMenuConnId) return;
    const handler = () => setMoveMenuConnId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [moveMenuConnId]);

  const grouped = useMemo(() => {
    const map: Record<string, Connection[]> = {};
    for (const g of new Set([...allGroups, ...connections.map(c => c.group_name || '默认')])) {
      map[g] = [];
    }
    for (const c of connections) {
      const g = c.group_name || '默认';
      map[g].push(c);
    }
    return map;
  }, [connections, allGroups]);

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => { const n = new Set(prev); n.has(group) ? n.delete(group) : n.add(group); return n; });
  };

  const handleConnectClick = async (conn: Connection) => {
    setConnectError('');
    try { await onConnect(conn.id); }
    catch (e: any) { setConnectError(typeof e === 'string' ? e : e?.message || '连接失败'); }
  };

  const startRename = (group: string) => { setEditingGroup(group); setEditGroupName(group); };
  const confirmRename = async () => {
    if (!editingGroup || !editGroupName || editGroupName === editingGroup) { setEditingGroup(null); return; }
    try { await invoke('rename_group', { oldName: editingGroup, newName: editGroupName }); refresh(); }
    catch (e: any) { setConnectError(e?.toString() || '重命名失败'); }
    setEditingGroup(null);
  };

  const deleteGroupFn = async (group: string) => {
    if (confirmDeleteGroup !== group) { setConfirmDeleteGroup(group); return; }
    setConfirmDeleteGroup(null);
    try { await invoke('delete_group', { groupName: group }); refresh(); }
    catch (e: any) { setConnectError(e?.toString() || '删除分组失败'); }
  };

  const createGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    try {
      await invoke('create_group', { name });
      refresh();
      setCollapsedGroups(prev => { const n = new Set(prev); n.delete(name); return n; });
    } catch (e: any) { setConnectError(e?.toString() || '创建分组失败'); }
    onShowNewGroupChange?.(false);
    setNewGroupName('');
  };

  const moveToGroup = async (connId: string, groupName: string) => {
    setMoveMenuConnId(null);
    try { await invoke('move_to_group', { connectionId: connId, groupName }); refresh(); }
    catch (e: any) { setConnectError(e?.toString() || '移动失败'); }
  };

  const handleDeleteClick = (conn: Connection) => {
    if (confirmDeleteId !== conn.id) { setConfirmDeleteId(conn.id); clearTimeout(confirmTimer.current); confirmTimer.current = setTimeout(() => setConfirmDeleteId(null), 4000); return; }
    setConfirmDeleteId(null); clearTimeout(confirmTimer.current); doDelete(conn);
  };
  const doDelete = async (conn: Connection) => {
    setDeleting(conn.id); setConnectError('');
    try { await invoke('delete_connection', { id: conn.id }); refresh(); }
    catch (e: any) { setConnectError(typeof e === 'string' ? e : e?.message || '删除失败'); }
    finally { setDeleting(null); }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {connectError && (
        <div className="[var(--danger-soft)]/30 border [var(--danger)]/50 [var(--danger)] px-3 py-2 rounded-md text-xs mb-2 flex justify-between items-center">
          <span>{connectError}</span>
          <button onClick={() => setConnectError('')} className="[var(--danger)] hover:text-[var(--danger)] ml-2 shrink-0">✕</button>
        </div>
      )}
      {Object.entries(grouped).length === 0 && connections.length === 0 ? (
        <p className="text-xs [var(--text-tertiary)] px-2 py-4 text-center">
          暂无连接。<br />
          <button onClick={onNewConnection} className="[var(--accent)] hover:[var(--accent-hover)] mt-1">添加一个</button>
        </p>
      ) : (
        Object.entries(grouped).map(([group, conns]) => (
          <div key={group} className="mb-1.5">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors group" style={{background:'var(--depth-2)'}}>
              <button onClick={() => toggleGroup(group)} className="text-[10px] shrink-0 transition-colors" style={{ color: 'var(--text-muted)' }}>
                {collapsedGroups.has(group) ? '▶' : '▼'}
              </button>
              {editingGroup === group ? (
                <input value={editGroupName} onChange={e => setEditGroupName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setEditingGroup(null); }}
                  onBlur={confirmRename}
                  className="flex-1 min-w-0 bg-[var(--bg-input)] border rounded px-1.5 py-0.5 text-xs outline-none" autoFocus
                  style={{ borderColor: 'var(--accent)', color: 'var(--text-primary)' }} />
              ) : (
                <span className="font-medium text-xs truncate min-w-0" style={{ color: 'var(--text-primary)' }}>{group}</span>
              )}
              <span className="text-[10px] px-1.5 py-px rounded-full shrink-0" style={{ color: 'var(--text-muted)', background: 'var(--bg-input)' }}>{conns.length}</span>
              <div className="ml-auto flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={() => startRename(group)} className="text-[10px] px-0.5" style={{ color: 'var(--text-muted)' }} title="重命名">✏️</button>
                {confirmDeleteGroup === group ? (<> 
                  <button onClick={() => deleteGroupFn(group)} className="text-[10px] px-0.5 font-bold" style={{ color: 'var(--danger)' }}>确认</button>
                  <button onClick={() => setConfirmDeleteGroup(null)} className="text-[10px] px-0.5" style={{ color: 'var(--text-muted)' }}>✕</button>
                </>) : (
                  <button onClick={() => deleteGroupFn(group)} className="text-[10px] px-0.5" style={{ color: 'var(--text-muted)' }} title="删除分组">🗑</button>
                )}
              </div>
            </div>
            {!collapsedGroups.has(group) && conns.map(c => (
              <div key={c.id} className={`flex items-center rounded-md text-sm transition-colors ml-3 mr-0.5 my-0.5 relative ${
                activeId === c.id
                  ? 'conn-row-active [var(--accent)]/15 border-l-2 [var(--accent)] [var(--accent-hover)]'
                  : 'conn-row-hover [var(--text-secondary)] border-l-2 border-transparent'
              }`}>
                <button onDoubleClick={() => handleConnectClick(c)} onClick={() => handleConnectClick(c)}
                  className="flex-1 text-left px-2 py-1.5 truncate min-w-0">
                  <div className="truncate font-medium">{c.name}</div>
                  <div className="text-xs [var(--text-tertiary)] truncate">{c.username}@{c.host}:{c.port}</div>
                </button>
                <div className="flex items-center gap-0.5 pr-1 shrink-0">
                  {/* Move to group */}
                  <div className="relative">
                    <button onClick={(e) => { e.stopPropagation(); setMoveMenuConnId(moveMenuConnId === c.id ? null : c.id); }}
                      className="[var(--text-tertiary)] hover:[var(--success)] px-1 py-0.5 text-xs opacity-60 hover:opacity-100 transition-opacity" title="移动到分组">↗</button>
                    {moveMenuConnId === c.id && (
                      <div className="absolute right-0 top-full mt-1 z-[100] bg-[var(--depth-3)] border border-[var(--border-default)] rounded-[var(--radius-md)] shadow-lg py-1 min-w-[120px]">
                        {Object.keys(grouped).filter(g => g !== group).map(g => (
                          <button key={g} onClick={(e) => { e.stopPropagation(); moveToGroup(c.id, g); }}
                            className="w-full text-left px-3 py-1.5 text-xs [var(--text-primary)] hover:[var(--depth-3)]/70 transition-colors">
                            📁 {g}
                          </button>
                        ))}
                        {Object.keys(grouped).filter(g => g !== group).length === 0 && (
                          <div className="px-3 py-1 text-xs [var(--text-tertiary)]">无其他分组</div>
                        )}
                      </div>
                    )}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); onEditConnection(c); }}
                    className="[var(--text-tertiary)] hover:[var(--accent)] px-1 py-0.5 text-xs opacity-60 hover:opacity-100 transition-opacity" title="编辑">✏️</button>
                  {confirmDeleteId === c.id ? (<>
                    <button onClick={(e) => { e.stopPropagation(); doDelete(c); }}
                      disabled={deleting === c.id} className="[var(--danger)] hover:[var(--danger)] px-1 py-0.5 text-xs font-bold disabled:opacity-30">确认</button>
                    <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); clearTimeout(confirmTimer.current); }}
                      className="[var(--text-tertiary)] hover:[var(--text-primary)] px-0.5 py-0.5 text-xs">✕</button>
                  </>) : (
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(c); }}
                      className="[var(--text-tertiary)] hover:[var(--danger)] px-1 py-0.5 text-xs opacity-60 hover:opacity-100 transition-opacity" title="删除">🗑</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))
      )}
      {showNewGroup ? (
        <div className="flex items-center gap-1.5 px-1.5 py-1.5">
          <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createGroup(); if (e.key === 'Escape') { onShowNewGroupChange?.(false); setNewGroupName(''); } }}
            placeholder="输入分组名称" autoFocus
            className="flex-1 [var(--depth-2)] border [var(--accent)]/50 rounded-md px-2.5 py-1 text-xs outline-none focus:border-blue-400 transition-colors" />
          <button onClick={createGroup} className="text-xs [var(--accent)] hover:[var(--accent-hover)] px-1.5 py-0.5 rounded hover:[var(--accent)]/10 transition-colors">✓</button>
          <button onClick={() => { onShowNewGroupChange?.(false); setNewGroupName(''); }} className="text-xs [var(--text-tertiary)] hover:[var(--text-primary)] px-1.5 py-0.5 rounded hover:[var(--depth-3)]/50 transition-colors">✕</button>
        </div>
      ) : (
        <button onClick={() => onShowNewGroupChange?.(true)} className="w-full text-xs [var(--text-tertiary)] hover:[var(--text-secondary)] py-1.5 text-left px-1.5 rounded-md hover:[var(--depth-2)]/30 transition-colors">
          + 新建分组
        </button>
      )}
    </div>
  );
}
