import { useState, useRef } from 'react';
import ConnectionDialog from './components/dialogs/ConnectionDialog';
import ConnectionList from './components/sidebar/ConnectionList';
import TerminalPanel from './components/terminal/TerminalPanel';
import FilePanel from './components/files/FilePanel';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { save, open } from '@tauri-apps/plugin-dialog';
import { useConnectionStore } from './stores/connectionStore';
import { useThemeStore, themes } from './stores/themeStore';
import type { Connection } from './stores/connectionStore';

/* ── Style helpers ── */
const s = (vars: string) => vars.split(' ').map(v => `var(--${v})`).join(' ');

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const sidebarResizing = useRef(false);
  const onSidebarResize = (e: React.MouseEvent) => {
    e.preventDefault(); sidebarResizing.current = true;
    const startX = e.clientX; const startW = sidebarWidth;
    const onMove = (ev: MouseEvent) => setSidebarWidth(Math.max(180, Math.min(400, startW + ev.clientX - startX)));
    const onUp = () => { sidebarResizing.current = false; document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); document.body.style.cursor=''; };
    document.body.style.cursor='col-resize'; document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
  };
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [dialogKey, setDialogKey] = useState(0);
  const [activeConnections, setActiveConnections] = useState<Set<string>>(new Set());
  const [terminalTabs, setTerminalTabs] = useState<Record<string, { id: string; name: string }[]>>({});
  const [activeTermIndex, setActiveTermIndex] = useState<Record<string, number>>({});
  const [splitRatio, setSplitRatio] = useState(0.35);
  const [isDragging, setIsDragging] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string>('');
  const [filePosition, setFilePosition] = useState<'right' | 'bottom'>(
    (localStorage.getItem('hear-file-pos') as 'right' | 'bottom') || 'right'
  );
  const { theme, setTheme } = useThemeStore();

  const onSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); setIsDragging(true);
    const el = mainRef.current; if (!el) return;
    const isH = filePosition === 'right';
    const onMove = (ev: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const r = isH
        ? 1 - (ev.clientX - rect.left) / rect.width
        : 1 - (ev.clientY - rect.top) / rect.height;
      setSplitRatio(Math.max(0.2, Math.min(0.7, r)));
    };
    const onUp = () => { setIsDragging(false); document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); document.body.style.cursor=''; };
    document.body.style.cursor = isH ? 'col-resize' : 'row-resize';
    document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
  };

  const ensureTerminal = (connId: string) => {
    setTerminalTabs(prev => prev[connId]?.length ? prev : { ...prev, [connId]: [{ id: `${connId}-1`, name: '终端 1' }] });
    setActiveTermIndex(prev => prev[connId] !== undefined ? prev : { ...prev, [connId]: 0 });
  };
  const addTerminal = (connId: string) => {
    setTerminalTabs(prev => {
      const tabs = [...(prev[connId]||[])]; tabs.push({ id: `${connId}-${tabs.length+1}`, name: `终端 ${tabs.length+1}` });
      setActiveTermIndex(p=>({...p,[connId]:tabs.length-1})); return {...prev,[connId]:tabs};
    });
  };
  const closeTerminal = (connId:string, idx:number) => {
    setTerminalTabs(prev => {
      const tabs = [...(prev[connId]||[])]; tabs.splice(idx,1);
      if(!tabs.length){ const n={...prev}; delete n[connId]; return n; }
      setActiveTermIndex(p=>({...p,[connId]:Math.min(p[connId]||0,tabs.length-1)})); return {...prev,[connId]:tabs};
    });
  };
  const getTabs = (connId:string) => terminalTabs[connId]||[];
  const getTermIdx = (connId:string) => activeTermIndex[connId]||0;

  const handleEditConnection = (conn:Connection) => { setEditingConnection(conn); setDialogKey(k=>k+1); setDialogOpen(true); };
  const handleDialogClose = () => { setDialogOpen(false); setEditingConnection(null); };
  const handleExport = async () => { const p = await save({ defaultPath:'HearTerm-config.json', filters:[{name:'JSON',extensions:['json']}] }); if(p) try{await invoke('export_config',{path:p})}catch(e){console.error(e)}; };
  const handleImport = async () => { const p = await open({ filters:[{name:'JSON',extensions:['json']}], multiple:false }); if(p) try{await invoke('import_config',{path:p}); invoke<Connection[]>('list_connections').then(useConnectionStore.getState().setConnections)}catch(e){console.error(e)}; };
  const handleConnect = async (connId:string) => { 
    try { 
      await invoke('connect', { id: connId });
      setActiveConnectionId(connId); 
      setActiveConnections(p => new Set(p).add(connId)); 
      ensureTerminal(connId); 
    } catch(e) {
      console.error('connect FAILED:', JSON.stringify(e));
      setToast('连接失败: ' + (typeof e === 'string' ? e : JSON.stringify(e)));
    }
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{background:'var(--depth-0)'}}>
      {/* ── Sidebar ── */}
      <div className="shrink-0 flex flex-row overflow-hidden" style={{width: sidebarOpen ? sidebarWidth : 0, transition: sidebarResizing.current ? 'none' : 'width 200ms'}}>
        <div className="flex-1 flex flex-col min-h-0" style={{background:'var(--depth-1)'}}>
          <div className="flex-1 flex flex-col p-4 min-h-0 overflow-y-auto">
            <div className="flex items-center gap-2 mb-5 px-1">
              <span className="text-base">⚡</span>
              <span className="text-sm font-semibold tracking-tight" style={{color:'var(--text-primary)'}}>HearTerm</span>
            </div>
            <ConnectionList onNewConnection={()=>{setDialogKey(k=>k+1);setDialogOpen(true)}} onEditConnection={handleEditConnection} onConnect={handleConnect} />
            <div className="mt-auto pt-3 space-y-1.5">
              <button onClick={()=>{setDialogKey(k=>k+1);setDialogOpen(true)}}
                className="w-full py-2 text-xs font-medium rounded-md transition-colors" style={{background:'var(--accent)',color:'#fff'}}>
                新建连接
              </button>
              <div className="flex gap-1.5">
                <button onClick={handleExport} className="flex-1 py-1.5 text-[11px] rounded-md border transition-colors"
                  style={{color:'var(--text-secondary)',borderColor:'var(--border-subtle)',background:'var(--depth-2)'}}>导出</button>
                <button onClick={handleImport} className="flex-1 py-1.5 text-[11px] rounded-md border transition-colors"
                  style={{color:'var(--text-secondary)',borderColor:'var(--border-subtle)',background:'var(--depth-2)'}}>导入</button>
              </div>
            </div>
          </div>
        </div>
        {/* Drag handle */}
        <div onMouseDown={onSidebarResize}
          className="w-[4px] shrink-0 cursor-col-resize transition-colors hover:bg-[var(--accent)]"
          style={{background:'var(--border-subtle)'}} />
      </div>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Titlebar */}
        <div data-tauri-drag-region className="h-10 flex items-center px-4 shrink-0 gap-3 select-none"
          style={{background:'var(--depth-1)', borderBottom:'1px solid var(--border-subtle)'}}>
          <button onClick={()=>setSidebarOpen(!sidebarOpen)} className="text-sm leading-none transition-colors" style={{color:'var(--text-tertiary)'}}>☰</button>
          {activeConnectionId && (()=>{
            const tabs = getTabs(activeConnectionId); const idx = getTermIdx(activeConnectionId);
            return (
              <div className="flex items-center gap-0.5">
                {tabs.map((tab,i)=>(
                  <div key={tab.id} className="flex items-center">
                    <button onClick={()=>setActiveTermIndex(p=>({...p,[activeConnectionId]:i}))}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-t transition-colors"
                      style={{color:i===idx?'var(--text-primary)':'var(--text-tertiary)',background:i===idx?'var(--depth-3)':'transparent'}}>
                      {tab.name}
                    </button>
                    {tabs.length>1&&<button onClick={()=>closeTerminal(activeConnectionId,i)} className="text-[9px] ml-0.5" style={{color:'var(--text-tertiary)'}}>✕</button>}
                  </div>
                ))}
                <button onClick={()=>addTerminal(activeConnectionId)} className="text-[11px] px-1.5 py-0.5 rounded transition-colors"
                  style={{color:'var(--text-tertiary)',background:'var(--depth-2)'}}>+</button>
              </div>
            );
          })()}
          <div className="flex-1" />
          {/* Settings gear */}
          <div className="relative" data-tauri-drag-region="false">
            <button onClick={()=>setSettingsOpen(!settingsOpen)} className="w-6 h-6 flex items-center justify-center rounded transition-colors text-sm"
              style={{color:'var(--text-tertiary)',background:settingsOpen?'var(--hover)':'transparent'}}>⚙</button>
            {settingsOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={()=>setSettingsOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-40 py-1.5 rounded-lg shadow-xl border"
                  style={{background:'var(--depth-3)',borderColor:'var(--border-default)'}}>
                  <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider" style={{color:'var(--text-tertiary)'}}>主题</div>
                  {themes.map(t=>(
                    <button key={t.id} onClick={()=>{setTheme(t.id as any);setSettingsOpen(false)}}
                      className="w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between"
                      style={{color:theme===t.id?'var(--accent)':'var(--text-primary)',background:theme===t.id?'var(--active)':'transparent'}}>
                      {t.name}{theme===t.id&&<span>✓</span>}
                    </button>
                  ))}
                  <div className="border-t my-1" style={{borderColor:'var(--border-subtle)'}} />
                  <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider" style={{color:'var(--text-tertiary)'}}>窗口</div>
                  <button onClick={()=>{setFilePosition('right');localStorage.setItem('hear-file-pos','right');setSettingsOpen(false)}}
                    className="w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between"
                    style={{color:filePosition==='right'?'var(--accent)':'var(--text-primary)',background:filePosition==='right'?'var(--active)':'transparent'}}>
                    文件在右侧 {filePosition==='right'&&<span>✓</span>}
                  </button>
                  <button onClick={()=>{setFilePosition('bottom');localStorage.setItem('hear-file-pos','bottom');setSettingsOpen(false)}}
                    className="w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between"
                    style={{color:filePosition==='bottom'?'var(--accent)':'var(--text-primary)',background:filePosition==='bottom'?'var(--active)':'transparent'}}>
                    文件在下方 {filePosition==='bottom'&&<span>✓</span>}
                  </button>
                  <div className="border-t my-1" style={{borderColor:'var(--border-subtle)'}} />
                  <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider" style={{color:'var(--text-tertiary)'}}>数据</div>
                  <button onClick={()=>{handleExport();setSettingsOpen(false)}}
                    className="w-full text-left px-3 py-1.5 text-xs transition-colors" style={{color:'var(--text-primary)'}}>📤 导出配置</button>
                  <button onClick={()=>{handleImport();setSettingsOpen(false)}}
                    className="w-full text-left px-3 py-1.5 text-xs transition-colors" style={{color:'var(--text-primary)'}}>📥 导入配置</button>
                </div>
              </>
            )}
          </div>
          {/* Window controls */}
          <div className="flex items-center gap-2" data-tauri-drag-region="false">
            <button onClick={()=>getCurrentWindow().minimize()} className="w-2.5 h-2.5 rounded-full bg-yellow-500/80 hover:bg-yellow-400" />
            <button onClick={()=>getCurrentWindow().toggleMaximize()} className="w-2.5 h-2.5 rounded-full bg-green-500/80 hover:bg-green-400" />
            <button onClick={()=>getCurrentWindow().close()} className="w-2.5 h-2.5 rounded-full bg-red-500/80 hover:bg-red-400" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 relative" ref={mainRef}>
          {[...activeConnections].map(connId=>{
            const tabs=getTabs(connId); const idx=getTermIdx(connId); const active=connId===activeConnectionId;
            return (
              <div key={connId}
                className={`absolute inset-0 flex min-h-0 ${filePosition === 'right' ? 'flex-row' : 'flex-col'}`}
                style={{visibility:active?'visible':'hidden',zIndex:active?10:0}}>
              <div className="h-full min-w-0 relative" style={{flexBasis:`${(1-splitRatio)*100}%`}}>
                {tabs.map((tab,i)=>(
                  <div key={tab.id} className="absolute inset-0" style={{visibility:i===idx?'visible':'hidden'}}>
                    <TerminalPanel terminalId={tab.id} connectionId={connId} />
                  </div>
                ))}
              </div>
              {/* Resize handle */}
              <div onMouseDown={onSplitterMouseDown}
                className={`shrink-0 transition-colors hover:bg-[var(--accent)] ${filePosition === 'right' ? 'w-[4px] cursor-col-resize' : 'h-[4px] cursor-row-resize'}`}
                style={{background:isDragging?'var(--accent)':'var(--border-subtle)'}} />
              {/* File panel */}
              <div className="overflow-hidden" style={{
                ...(filePosition === 'right' ? {flexBasis:`${splitRatio*100}%`,minWidth:0} : {flexBasis:`${splitRatio*100}%`,minHeight:0})
              }}>
              <FilePanel connectionId={connId} />
              </div>
              </div>
            );
          })}
          {activeConnections.size===0&&(
            <div className="flex items-center justify-center h-full" style={{background:'var(--depth-0)'}}>
              <div className="text-center space-y-3">
                <div className="text-6xl opacity-20">⚡</div>
                <p className="text-sm" style={{color:'var(--text-tertiary)'}}>选择左侧连接开始使用</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConnectionDialog key={dialogKey} open={dialogOpen} onClose={handleDialogClose}
        onConnected={async (id) => {
          try { await invoke('connect', { id }); } catch(e) { setToast('连接失败: ' + JSON.stringify(e)); return; }
          setActiveConnectionId(id);
          setActiveConnections(p => new Set(p).add(id));
          ensureTerminal(id);
          handleDialogClose();
        }}
        editConnection={editingConnection} />

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 rounded-lg shadow-lg text-sm animate-pulse"
          style={{background:'var(--danger-soft)',color:'var(--danger)',border:'1px solid var(--danger)'}}
          onClick={()=>setToast('')}>
          {toast}
        </div>
      )}
    </div>
  );
}
export default App;
