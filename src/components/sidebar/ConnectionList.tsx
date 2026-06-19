import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useConnectionStore, Connection } from '../../stores/connectionStore';

interface Props {
  onNewConnection: () => void;
}

export default function ConnectionList({ onNewConnection }: Props) {
  const { connections, setConnections, activeId, setActive, removeConnection } =
    useConnectionStore();

  useEffect(() => {
    invoke<Connection[]>('list_connections')
      .then(setConnections)
      .catch(console.error);
  }, [setConnections]);

  const handleContextMenu = (e: React.MouseEvent, conn: Connection) => {
    e.preventDefault();
    // Simple context menu — will be enhanced in Task 2.6
    const action = window.confirm(`Delete connection "${conn.name}"?`);
    if (action) {
      invoke('delete_connection', { id: conn.id })
        .then(() => removeConnection(conn.id))
        .catch(console.error);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto space-y-0.5">
      {connections.length === 0 ? (
        <p className="text-xs text-gray-600 px-2 py-4 text-center">
          No saved connections.
          <br />
          <button
            onClick={onNewConnection}
            className="text-blue-400 hover:text-blue-300 mt-1"
          >
            Add one
          </button>
        </p>
      ) : (
        connections.map((c) => (
          <button
            key={c.id}
            onClick={() => setActive(c.id)}
            onContextMenu={(e) => handleContextMenu(e, c)}
            className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
              activeId === c.id
                ? 'bg-blue-600/40 text-blue-300'
                : 'hover:bg-gray-800 text-gray-400'
            }`}
          >
            <div className="truncate font-medium">{c.name}</div>
            <div className="text-xs text-gray-600 truncate">
              {c.username}@{c.host}:{c.port}
            </div>
          </button>
        ))
      )}
    </div>
  );
}
