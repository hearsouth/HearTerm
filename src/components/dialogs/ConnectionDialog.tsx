import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useConnectionStore, Connection } from '../../stores/connectionStore';

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
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);
  const [showPassword, setShowPassword] = useState(false);

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
      setShowPassword(true);
      invoke<string>('get_password', { connectionId: editConnection.id })
        .then((pwd) => { if (pwd) setPassword(pwd); })
        .catch(() => {});
    } else if (open) {
      setName(''); setHost(''); setPort('22'); setUsername(''); setPassword('');
      setGroupName('默认');
      setTestResult(null); setError(''); setShowPassword(false);
    }
  }, [editConnection, open]);

  const inputClass = "w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--border-focus)]";
  const labelClass = "text-xs block mb-1";
  const btnClass = "px-4 py-2 text-sm rounded-[var(--radius-sm)] transition-colors";

  const handleSaveOnly = async () => {
    if (!host || !username) return;
    const id = isEdit ? editConnection!.id : crypto.randomUUID();
    const conn: Connection = {
      ...(isEdit ? editConnection! : {}),
      id, name: name || `${username}@${host}`, host,
      port: parseInt(port) || 22, username, auth_method: 'password',
      group_name: groupName,
      created_at: editConnection?.created_at ?? Date.now(),
      updated_at: Date.now(),
    };
    try {
      if (isEdit) await invoke('update_connection', { conn });
      else await invoke('save_connection', { conn });
      if (password) await invoke('store_password', { connectionId: id, password });
      invoke<Connection[]>('list_connections').then(useConnectionStore.getState().setConnections);
      onClose();
    } catch (e: any) { setError(typeof e === 'string' ? e : e?.message || String(e) || '保存失败'); }
  };

  const handleConnect = async () => {
    if (!host || !username) return;
    setConnecting(true); setError('');
    const id = isEdit ? editConnection!.id : crypto.randomUUID();
    const conn: Connection = {
      ...(isEdit ? editConnection! : {}),
      id, name: name || `${username}@${host}`, host,
      port: parseInt(port) || 22, username, auth_method: 'password',
      group_name: groupName,
      created_at: editConnection?.created_at ?? Date.now(),
      updated_at: Date.now(),
    };
    try {
      if (isEdit) await invoke('update_connection', { conn });
      else await invoke('save_connection', { conn });
      if (password) await invoke('store_password', { connectionId: id, password });
      if (!isEdit) invoke<Connection[]>('list_connections').then(useConnectionStore.getState().setConnections);
      onConnected(id);
      onClose();
    } catch (e: any) { 
      setError(typeof e === 'string' ? e : String(e) || '连接失败'); 
      console.error('handleConnect error:', e);
    }
    finally { setConnecting(false); }
  };

  const handleTestConnection = async () => {
    if (!host || !username) return;
    setTesting(true); setTestResult(null);
    try { await invoke('test_connection', { host, port: parseInt(port) || 22, username, password }); setTestResult('success'); }
    catch { setTestResult('fail'); }
    finally { setTesting(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[420px] rounded-xl shadow-2xl p-6 border" onClick={e => e.stopPropagation()}
        style={{ background: 'var(--color-bg)', borderColor: 'var(--border)' }}>
        <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>{isEdit ? '编辑连接' : '新建连接'}</h2>

        <div className="space-y-3.5">
          <div>
            <label className={labelClass} style={{ color: 'var(--text-secondary)' }}>连接名称</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="如：生产服务器" className={inputClass} style={{ color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label className={labelClass} style={{ color: 'var(--text-secondary)' }}>主机地址</label>
            <input value={host} onChange={e => setHost(e.target.value)} placeholder="192.168.1.1 或 example.com" className={inputClass} style={{ color: 'var(--text-primary)' }} />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelClass} style={{ color: 'var(--text-secondary)' }}>端口</label>
              <input value={port} onChange={e => setPort(e.target.value)} placeholder="22" className={inputClass} style={{ color: 'var(--text-primary)' }} />
            </div>
            <div className="flex-1">
              <label className={labelClass} style={{ color: 'var(--text-secondary)' }}>用户名</label>
              <input value={username} onChange={e => setUsername(e.target.value)} placeholder="root" className={inputClass} style={{ color: 'var(--text-primary)' }} />
            </div>
          </div>
          <div>
            <label className={labelClass} style={{ color: 'var(--text-secondary)' }}>密码</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                className={inputClass + " pr-10"} style={{ color: 'var(--text-primary)' }} />
              <button onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs"
                style={{ color: 'var(--text-muted)' }}>{showPassword ? '🙈' : '👁'}</button>
            </div>
          </div>
          <div>
            <label className={labelClass} style={{ color: 'var(--text-secondary)' }}>分组</label>
            <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="默认" className={inputClass} style={{ color: 'var(--text-primary)' }} />
          </div>
        </div>

        {error && (
          <div className="mt-4 p-2 rounded text-xs" style={{ background: 'var(--danger)', color: '#fff', opacity: 0.2 }}>
            {error}
          </div>
        )}

        <div className="flex justify-between items-center mt-6">
          <button onClick={handleTestConnection} disabled={testing || !host || !username}
            className={btnClass} style={{
              color: 'var(--text-secondary)', borderColor: 'var(--border)',
              border: '1px solid var(--border)', opacity: (testing || !host || !username) ? 0.5 : 1 }}>
            {testing ? '测试中…' : testResult === 'success' ? '✓ 通过' : '测试连接'}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className={btnClass} style={{ color: 'var(--text-secondary)' }}>取消</button>
            <button onClick={handleSaveOnly} className={btnClass} style={{ color: 'var(--text-primary)', border: '1px solid var(--border)' }}>保存</button>
            <button onClick={handleConnect} disabled={connecting || !host || !username}
              className={btnClass} style={{ background: 'var(--accent)', color: '#fff', opacity: (connecting || !host || !username) ? 0.5 : 1 }}>
              {connecting ? '连接中…' : isEdit ? '连接' : '保存并连接'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
