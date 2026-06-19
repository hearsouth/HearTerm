import { useState } from 'react';
import ConnectionDialog from './components/dialogs/ConnectionDialog';
import ConnectionList from './components/sidebar/ConnectionList';
import TerminalPanel from './components/terminal/TerminalPanel';
import FilePanel from './components/files/FilePanel';

type Tab = 'terminal' | 'files';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('terminal');

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'w-[260px]' : 'w-0'
        } transition-all duration-200 bg-gray-900 border-r border-gray-800 overflow-hidden`}
      >
        <div className="w-[260px] h-full flex flex-col p-3">
          <div className="text-sm font-semibold text-gray-400 mb-4">CONNECTIONS</div>
          <ConnectionList onNewConnection={() => setDialogOpen(true)} />
          <button
            onClick={() => setDialogOpen(true)}
            className="w-full py-2 mt-2 text-sm bg-blue-600 hover:bg-blue-500 rounded transition-colors"
          >
            + New Connection
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        <div
          data-tauri-drag-region
          className="h-10 flex items-center px-4 bg-gray-900 border-b border-gray-800 shrink-0 gap-3"
        >
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-gray-500 hover:text-gray-300 text-sm"
          >
            ☰
          </button>
          <span className="text-xs text-gray-500">SSH Tool</span>

          {/* Tabs */}
          {activeConnectionId && (
            <div className="flex gap-1 ml-4">
              <button
                onClick={() => setActiveTab('terminal')}
                className={`px-3 py-1 text-xs rounded-t transition-colors ${
                  activeTab === 'terminal'
                    ? 'bg-gray-950 text-gray-200'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Terminal
              </button>
              <button
                onClick={() => setActiveTab('files')}
                className={`px-3 py-1 text-xs rounded-t transition-colors ${
                  activeTab === 'files'
                    ? 'bg-gray-950 text-gray-200'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Files
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0">
          {activeConnectionId ? (
            activeTab === 'terminal' ? (
              <TerminalPanel connectionId={activeConnectionId} />
            ) : (
              <FilePanel connectionId={activeConnectionId} />
            )
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-4xl mb-4">⚡</div>
                <h2 className="text-xl font-light text-gray-400 mb-2">Welcome</h2>
                <p className="text-sm text-gray-600">Connect to a server to get started</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConnectionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConnected={(id) => {
          setActiveConnectionId(id);
          setActiveTab('terminal');
          setDialogOpen(false);
        }}
      />
    </div>
  );
}

export default App;
