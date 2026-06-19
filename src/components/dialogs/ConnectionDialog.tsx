import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface Props {
  open: boolean;
  onClose: () => void;
  onConnected: (id: string) => void;
}

export default function ConnectionDialog({ open, onClose, onConnected }: Props) {
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleConnect = async () => {
    if (!host || !username) return;
    setConnecting(true);
    setError('');
    const id = crypto.randomUUID();

    try {
      await invoke('connect', {
        id,
        host,
        port: parseInt(port) || 22,
        username,
        password,
      });
      onConnected(id);
      onClose();
    } catch (e: any) {
      setError(typeof e === 'string' ? e : e?.message || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg w-[420px] p-6 shadow-2xl border border-gray-800">
        <h2 className="text-lg font-semibold mb-4">New Connection</h2>

        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 px-3 py-2 rounded text-sm mb-4">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <Field label="Name" value={name} onChange={setName} placeholder="My Server" />
          <Field label="Host" value={host} onChange={setHost} placeholder="192.168.1.100" />
          <Field label="Port" value={port} onChange={setPort} placeholder="22" />
          <Field label="Username" value={username} onChange={setUsername} placeholder="root" />

          <div>
            <label className="block text-xs text-gray-400 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 pr-10"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                tabIndex={-1}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleConnect}
            disabled={connecting || !host || !username}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded transition-colors"
          >
            {connecting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        placeholder={placeholder}
      />
    </div>
  );
}
