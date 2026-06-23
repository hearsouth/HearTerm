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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-[#1a1b26] rounded-xl w-[440px] p-6 shadow-2xl border border-gray-700/60">
        <h2 className="text-lg font-semibold mb-5 text-gray-100">
          {isEdit ? `编辑：${editConnection!.name}` : '🔌 新建连接'}
        </h2>

        {error && (
          <div className="bg-red-900/30 border border-red-800/50 text-red-300 px-3 py-2 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        {testResult === 'success' && (
          <div className="bg-green-900/30 border border-green-800/50 text-green-300 px-3 py-2 rounded-lg text-sm mb-4">
            ✓ 连接成功
          </div>
        )}

        <div className="space-y-3.5">
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
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">密码</label>
            {isEdit && !password && (
              <div className="text-yellow-400/80 text-xs mb-1.5 bg-yellow-500/5 px-2 py-1 rounded border border-yellow-600/20">⚠ 尚未保存密码，请输入后点击"保存"或"连接"</div>
            )}
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                className="w-full bg-gray-800/70 border border-gray-700/60 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/20 transition-colors pr-10"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-sm transition-colors"
                tabIndex={-1}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <Field label="分组" value={groupName} onChange={setGroupName} placeholder="默认" />
        </div>

        <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-800/60">
          <button
            onClick={handleTestConnection}
            disabled={testing || !host || !username}
            className="px-3.5 py-2.5 text-xs text-gray-400 hover:text-white border border-gray-700/60 hover:border-gray-500 rounded-lg transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {testing ? '测试中…' : testResult === 'success' ? '✓ 已通过' : '🔍 测试连接'}
          </button>

          <div className="flex gap-2.5">
            <button onClick={onClose} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200 transition-colors">
              取消
            </button>
            <button
              onClick={handleSaveOnly}
              className="px-4 py-2.5 text-sm border border-gray-700/60 hover:border-gray-500 text-gray-300 rounded-lg transition-all duration-150 hover:bg-gray-800/50"
            >
              保存
            </button>
            <button
              onClick={handleConnect}
              disabled={connecting || !host || !username}
              className="px-5 py-2.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-all duration-150 font-medium shadow-sm shadow-blue-900/30"
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
      <label className="block text-xs text-gray-500 mb-1.5 font-medium">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-800/70 border border-gray-700/60 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/20 transition-colors"
        placeholder={placeholder}
      />
    </div>
  );
}
