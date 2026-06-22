import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useConnectionStore } from '../../stores/connectionStore';
import type { Connection } from '../../stores/connectionStore';

interface Props {
  open: boolean;
  onClose: () => void;
  onConnected: (id: string) => void;
  editConnection?: Connection | null;
}

export default function ConnectionDialog({ open, onClose, onConnected, editConnection }: Props) {
  const isEdit = !!editConnection;

  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [groupName, setGroupName] = useState('默认');
  const [showPassword, setShowPassword] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);

  // Pre-fill fields when editing
  useEffect(() => {
    if (editConnection) {
      setName(editConnection.name);
      setHost(editConnection.host);
      setPort(String(editConnection.port));
      setUsername(editConnection.username);
      setGroupName(editConnection.group_name || '默认');
      setPassword('');
      setTestResult(null);
      setError('');
      setShowPassword(true); // 编辑时默认显示密码
      invoke<string>('get_password', { connectionId: editConnection.id })
        .then((pwd) => { if (pwd) setPassword(pwd); })
        .catch(() => {});
    } else if (open) {
      setName('');
      setHost('');
      setPort('22');
      setUsername('');
      setPassword('');
      setGroupName('默认');
      setTestResult(null);
      setError('');
      setShowPassword(false);
    }
  }, [editConnection, open]);

  if (!open) return null;

  const handleTestConnection = async () => {
    if (!host || !username) return;
    setTesting(true);
    setTestResult(null);
    setError('');
    const testId = crypto.randomUUID();
    try {
      await invoke('connect', { id: testId, host, port: parseInt(port) || 22, username, password });
      setTestResult('success');
      await invoke('disconnect', { id: testId }).catch(() => {});
    } catch (e: any) {
      setTestResult('fail');
      setError(typeof e === 'string' ? e : e?.message || '连接失败');
    } finally {
      setTesting(false);
    }
  };

  const handleConnect = async () => {
    if (!host || !username) return;
    setConnecting(true);
    setError('');
    const id = isEdit ? editConnection!.id : crypto.randomUUID();
    try {
      await invoke('connect', { id, host, port: parseInt(port) || 22, username, password });

      const now = Date.now();
      const conn: Connection = {
        id,
        name: name || `${username}@${host}`,
        host,
        port: parseInt(port) || 22,
        username,
        auth_method: 'password',
        group_name: groupName,
        created_at: editConnection?.created_at ?? now,
        updated_at: now,
      };

      if (isEdit) {
        await invoke('update_connection', { conn });
      } else {
        await invoke('save_connection', { conn });
      }

      if (password) {
        await invoke('store_password', { connectionId: id, password });
      }

      if (!isEdit) {
        invoke<Connection[]>('list_connections').then(useConnectionStore.getState().setConnections);
      }

      onConnected(id);
      onClose();
    } catch (e: any) {
      setError(typeof e === 'string' ? e : e?.message || '操作失败');
    } finally {
      setConnecting(false);
    }
  };

  const handleSaveOnly = async () => {
    // Works for both new and edit mode
    if (!host || !username) return;
    const id = isEdit ? editConnection!.id : crypto.randomUUID();
    const conn: Connection = {
      ...(isEdit ? editConnection! : {}),
      id,
      name: name || `${username}@${host}`,
      host,
      port: parseInt(port) || 22,
      username,
      auth_method: 'password',
      group_name: groupName,
      created_at: editConnection?.created_at ?? Date.now(),
      updated_at: Date.now(),
    };
    try {
      if (isEdit) {
        await invoke('update_connection', { conn });
      } else {
        await invoke('save_connection', { conn });
      }
      if (password) {
        await invoke('store_password', { connectionId: id, password });
      }
      if (!isEdit) {
        // New connection: refresh sidebar list
        invoke<Connection[]>('list_connections').then(useConnectionStore.getState().setConnections);
      }
      onClose();
    } catch (e: any) {
      setError(typeof e === 'string' ? e : e?.message || '保存失败');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg w-[420px] p-6 shadow-2xl border border-gray-800">
        <h2 className="text-lg font-semibold mb-4">
          {isEdit ? `编辑：${editConnection!.name}` : '新建连接'}
        </h2>

        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 px-3 py-2 rounded text-sm mb-4">
            {error}
          </div>
        )}

        {testResult === 'success' && (
          <div className="bg-green-900/40 border border-green-700 text-green-300 px-3 py-2 rounded text-sm mb-4">
            ✓ 连接成功
          </div>
        )}

        <div className="space-y-3">
          <Field label="名称" value={name} onChange={setName} placeholder="我的服务器" />
          <Field label="主机" value={host} onChange={setHost} placeholder="192.168.1.100" />
          <div className="flex gap-2">
            <div className="flex-1">
              <Field label="用户名" value={username} onChange={setUsername} placeholder="root" />
            </div>
            <div className="w-24">
              <Field label="端口" value={port} onChange={setPort} placeholder="22" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">密码</label>
            {isEdit && !password && (
              <div className="text-yellow-400/80 text-xs mb-1">⚠ 尚未保存密码，请输入后点击"保存"或"连接"</div>
            )}
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
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-sm"
                tabIndex={-1}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <Field label="分组" value={groupName} onChange={setGroupName} placeholder="默认" />
        </div>

        <div className="flex justify-between items-center mt-6">
          <button
            onClick={handleTestConnection}
            disabled={testing || !host || !username}
            className="px-3 py-2 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded transition-colors disabled:opacity-50"
          >
            {testing ? '测试中…' : testResult === 'success' ? '✓ 已通过' : '测试连接'}
          </button>

          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">
              取消
            </button>
            <button
              onClick={handleSaveOnly}
              className="px-4 py-2 text-sm border border-gray-700 hover:border-gray-500 text-gray-300 rounded transition-colors"
            >
              保存
            </button>
            <button
              onClick={handleConnect}
              disabled={connecting || !host || !username}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded transition-colors"
            >
              {connecting ? '连接中…' : isEdit ? '连接' : '保存并连接'}
            </button>
          </div>
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
