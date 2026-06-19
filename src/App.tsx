import { useState } from 'react';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-[260px]' : 'w-0'} transition-all duration-200 bg-gray-900 border-r border-gray-800 overflow-hidden`}>
        <div className="w-[260px] h-full flex flex-col p-3">
          <div className="text-sm font-semibold text-gray-400 mb-4">CONNECTIONS</div>
          <div className="flex-1" />
          <button className="w-full py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded transition-colors">
            + New Connection
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        {/* Title bar (draggable region) */}
        <div data-tauri-drag-region className="h-10 flex items-center px-4 bg-gray-900 border-b border-gray-800">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-gray-500 hover:text-gray-300 text-sm mr-3"
          >
            ☰
          </button>
          <span className="text-xs text-gray-500">SSH Tool</span>
        </div>

        {/* Content */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-4">⚡</div>
            <h2 className="text-xl font-light text-gray-400 mb-2">Welcome to SSH Tool</h2>
            <p className="text-sm text-gray-600">Connect to a server to get started</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
