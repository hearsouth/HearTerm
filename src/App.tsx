import { useState, useCallback, useRef } from 'react';
import ConnectionDialog from './components/dialogs/ConnectionDialog';
import ConnectionList from './components/sidebar/ConnectionList';
import TerminalPanel from './components/terminal/TerminalPanel';
import FilePanel from './components/files/FilePanel';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { save, open } from '@tauri-apps/plugin-dialog';
import { useConnectionStore } from './stores/connectionStore';
import type { Connection } from './stores/connectionStore';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [dialogKey, setDialogKey] = useState(0);

  // All connections that have been activated (keep their terminals alive)
  const [activeConnections, setActiveConnections] = useState<Set<string>>(new Set());

  // Terminal tabs per connection
  const [terminalTabs, setTerminalTabs] = useState<Record<string, string[]>>({});
  const [activeTermIndex, setActiveTermIndex] = useState<Record<string, number>>({});

  // Split ratio
  const [splitRatio, setSplitRatio] = useState(0.35);
  const [isDragging, setIsDragging] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  const ensureTerminal = useCallback((connId: string) => {
    setActiveConnections(prev => new Set([...prev, connId]));
    setTerminalTabs((prev) => {
      if (prev[connId]?.length) return prev;
      return { ...prev, [connId]: [`${connId}-t0`] };
    });
    setActiveTermIndex((prev) => {
      if (prev[connId] !== undefined) return prev;
      return { ...prev, [connId]: 0 };
    });
  }, []);

  const addTerminal = useCallback((connId: string) => {
    setTerminalTabs((prev) => {
      const tabs = prev[connId] || [];
      return { ...prev, [connId]: [...tabs, `${connId}-t${tabs.length}`] };
    });
    setActiveTermIndex((prev) => {
      const tabs = terminalTabs[connId] || [];
      return { ...prev, [connId]: tabs.length };
    });
  }, [terminalTabs]);

  const closeTerminal = useCallback((connId: string, idx: number) => {
    setTerminalTabs((prev) => {
      const tabs = [...(prev[connId] || [])];
      if (tabs.length <= 1) return prev;
      tabs.splice(idx, 1);
      return { ...prev, [connId]: tabs };
    });
    setActiveTermIndex((prev) => {
      const cur = prev[connId] || 0;
      const tabs = terminalTabs[connId] || [];
      const newLen = tabs.length - 1;
      if (cur >= newLen) return { ...prev, [connId]: Math.max(0, newLen - 1) };
      if (cur > idx) return { ...prev, [connId]: cur - 1 };
      return prev;
    });
  }, [terminalTabs]);

  const onSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const el = mainRef.current;
    if (!el) return;
    const onMove = (ev: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const ratio = 1 - (ev.clientY - rect.top) / rect.height;
      setSplitRatio(Math.max(0.15, Math.min(0.7, ratio)));
    };
    const onUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const handleConnect = async (connId: string) => {
    const conn = useConnectionStore.getState().connections.find(c => c.id === connId);
    if (!conn) throw new Error('连接不存在');

    let password: string;
    try {
      password = await invoke<string>('get_password', { connectionId: connId });
    } catch (_e) {
      setEditingConnection(conn);
      setDialogKey(k => k + 1);
      setDialogOpen(true);
      return;
    }

    await invoke('connect', {
      id: connId, host: conn.host, port: conn.port,
      username: conn.username, password,
    });
    setActiveConnectionId(connId);
    ensureTerminal(connId);
  };

  const handleEditConnection = (conn: Connection) => {
    setEditingConnection(conn);
    setDialogKey(k => k + 1);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingConnection(null);
  };

  const handleExport = async () => {
    const path = await save({ defaultPath: 'ssh-tool-config.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!path) return;
    try { await invoke('export_config', { path }); }
    catch (e: any) { /* ignore */ }
  };

  const handleImport = async () => {
    const path = await open({ filters: [{ name: 'JSON', extensions: ['json'] }], multiple: false });
    if (!path) return;
    try {
      await invoke('import_config', { path });
      // Refresh connection list
      invoke<Connection[]>('list_connections').then(useConnectionStore.getState().setConnections);
    } catch (e: any) { /* ignore */ }
  };

  const getTabs = (connId: string) => terminalTabs[connId] || [];
  const getTermIdx = (connId: string) => activeTermIndex[connId] || 0;

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-[260px]' : 'w-0'} transition-all duration-200 bg-gray-900 border-r border-gray-800 overflow-hidden shrink-0`}>
        <div className="w-[260px] h-full flex flex-col p-3">
          <div className="text-sm font-semibold text-gray-400 mb-4">连接</div>
          <ConnectionList
            onNewConnection={() => { setDialogKey(k => k + 1); setDialogOpen(true); }}
            onEditConnection={handleEditConnection}
            onConnect={handleConnect}
          />
          <button onClick={() => { setDialogKey(k => k + 1); setDialogOpen(true); }}
            className="w-full py-2 mt-2 text-sm bg-blue-600 hover:bg-blue-500 rounded transition-colors">
            + 新建连接
          </button>
          <div className="flex gap-1 mt-1">
            <button onClick={handleExport} className="flex-1 py-1.5 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 rounded transition-colors">
              📤 导出
            </button>
            <button onClick={handleImport} className="flex-1 py-1.5 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 rounded transition-colors">
              📥 导入
            </button>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Titlebar */}
        <div data-tauri-drag-region className="h-10 flex items-center px-4 bg-gray-900 border-b border-gray-800 shrink-0 gap-3">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-500 hover:text-gray-300 text-sm">☰</button>
          <span className="text-xs text-gray-500">SSH 工具</span>

          {/* Terminal tabs for active connection */}
          {activeConnectionId && (() => {
            const tabs = getTabs(activeConnectionId);
            const idx = getTermIdx(activeConnectionId);
            return tabs.length > 0 ? (
              <div className="flex items-center gap-0.5 ml-2">
                {tabs.map((tid, i) => (
                  <div key={tid} className="flex items-center">
                    <button
                      onClick={() => setActiveTermIndex(prev => ({ ...prev, [activeConnectionId]: i }))}
                      className={`px-2 py-0.5 text-xs rounded-t transition-colors ${i === idx ? 'bg-gray-950 text-gray-200' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'}`}
                    >终端 {i + 1}</button>
                    {tabs.length > 1 && (
                      <button onClick={() => closeTerminal(activeConnectionId, i)} className="text-gray-600 hover:text-red-400 text-[10px] ml-0.5">✕</button>
                    )}
                  </div>
                ))}
                <button onClick={() => addTerminal(activeConnectionId)} className="text-gray-500 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-gray-800">+</button>
              </div>
            ) : null;
          })()}

          <div className="ml-auto flex items-center gap-2" data-tauri-drag-region="false">
            <button onClick={() => getCurrentWindow().minimize()} className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400 transition-colors" title="最小化" />
            <button onClick={() => getCurrentWindow().toggleMaximize()} className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400 transition-colors" title="最大化" />
            <button onClick={() => getCurrentWindow().close()} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 transition-colors" title="关闭" />
          </div>
        </div>

        {/* Content: keep all active connections mounted, CSS show/hide */}
        <div className="flex-1 min-h-0 relative">
          {[...activeConnections].map(connId => {
            const tabs = getTabs(connId);
            const termIdx = getTermIdx(connId);
            const isActive = connId === activeConnectionId;
            return (
              <div
                key={connId}
                ref={isActive ? mainRef : undefined}
                className={`absolute inset-0 flex flex-col min-h-0 ${isDragging && isActive ? 'select-none' : ''}`}
                style={{ visibility: isActive ? 'visible' : 'hidden', zIndex: isActive ? 10 : 0, backgroundColor: '#1a1b26', ...(isDragging ? { willChange: 'height' } : {}) }}
              >
                {/* Terminal area */}
                <div className="min-h-0 relative overflow-hidden" style={{ flex: `1 1 ${(1 - splitRatio) * 100}%` }}>
                  {tabs.map((tid, idx) => (
                    <div key={tid} className="absolute inset-0" style={{ visibility: idx === termIdx ? 'visible' : 'hidden' }}>
                      <TerminalPanel terminalId={tid} connectionId={connId} />
                    </div>
                  ))}
                </div>

                {/* Resize handle */}
                <div
                  onMouseDown={onSplitterMouseDown}
                  className={`h-[5px] shrink-0 cursor-row-resize transition-colors relative ${isDragging ? 'bg-blue-500' : 'bg-[#24283b] hover:bg-gray-600'}`}
                >
                  {isDragging && <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-blue-400/50" />}
                </div>

                {/* File browser */}
                <div className="min-h-0 overflow-hidden" style={{ flex: `0 0 ${splitRatio * 100}%` }}>
                  <FilePanel key={`file-${connId}`} connectionId={connId} />
                </div>
              </div>
            );
          })}

          {activeConnections.size === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-4xl mb-4">⚡</div>
                <h2 className="text-xl font-light text-gray-400 mb-2">欢迎</h2>
                <p className="text-sm text-gray-600">连接服务器以开始使用</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConnectionDialog
        key={dialogKey}
        open={dialogOpen}
        onClose={handleDialogClose}
        onConnected={(id) => {
          setActiveConnectionId(id);
          ensureTerminal(id);
          handleDialogClose();
        }}
        editConnection={editingConnection}
      />
    </div>
  );
}

export default App;
