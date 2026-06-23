import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useTransferStore, TransferItem } from '../../stores/transferStore';

export default function TransferQueue() {
  const { transfers, addTransfer, updateTransfer } = useTransferStore();

  useEffect(() => {
    const unlistenProgress = listen<{
      transfer_id: string;
      bytes_transferred: number;
      total_bytes: number;
      speed_bytes_per_sec: number;
    }>('transfer-progress', (e) => {
      updateTransfer(e.payload.transfer_id, {
        bytes_transferred: e.payload.bytes_transferred,
        total_size: e.payload.total_bytes,
        speed_bytes_per_sec: e.payload.speed_bytes_per_sec,
        status: 'transferring',
      });
    });

    const unlistenComplete = listen<{
      transfer_id: string;
      status: string;
      error?: string;
    }>('transfer-complete', (e) => {
      updateTransfer(e.payload.transfer_id, {
        status: e.payload.status as TransferItem['status'],
        error_message: e.payload.error,
      });
    });

    return () => {
      unlistenProgress.then((f) => f());
      unlistenComplete.then((f) => f());
    };
  }, [addTransfer, updateTransfer]);

  const activeTransfers = transfers.filter(
    (t) => t.status === 'queued' || t.status === 'transferring'
  );
  const doneTransfers = transfers.filter(
    (t) => t.status === 'completed' || t.status === 'failed'
  );

  if (transfers.length === 0) return null;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const formatSpeed = (bps: number) => {
    if (bps < 1024) return `${bps.toFixed(0)} B/s`;
    if (bps < 1048576) return `${(bps / 1024).toFixed(0)} KB/s`;
    return `${(bps / 1048576).toFixed(1)} MB/s`;
  };

  return (
    <div className="bg-gray-800/50 border-t border-gray-700/50 rounded-t-lg mt-1">
      {activeTransfers.map((t) => (
        <TransferBar key={t.id} transfer={t} formatSize={formatSize} formatSpeed={formatSpeed} />
      ))}
      {doneTransfers.map((t) => (
        <TransferBar key={t.id} transfer={t} formatSize={formatSize} formatSpeed={formatSpeed} />
      ))}
    </div>
  );
}

function TransferBar({
  transfer,
  formatSize,
  formatSpeed,
}: {
  transfer: TransferItem;
  formatSize: (b: number) => string;
  formatSpeed: (b: number) => string;
}) {
  const pct =
    transfer.total_size && transfer.total_size > 0
      ? Math.min(100, (transfer.bytes_transferred / transfer.total_size) * 100)
      : 0;

  const isActive = transfer.status === 'transferring' || transfer.status === 'queued';
  const isDone = transfer.status === 'completed';
  const isFailed = transfer.status === 'failed';

  const name = transfer.remote_path.split('/').pop() || transfer.remote_path;

  return (
    <div className="px-3 py-2 border-b border-gray-700/30 text-xs">
      <div className="flex items-center justify-between mb-1">
        <span className="text-gray-300 truncate max-w-[280px] font-medium">
          {transfer.direction === 'upload' ? '⬆' : '⬇'} {name}
        </span>
        <span className={`ml-2 shrink-0 ${isFailed ? 'text-red-400' : isDone ? 'text-green-400' : 'text-blue-400'}`}>
          {isFailed ? '❌ 失败' : isDone ? '✅ 完成' : `${pct.toFixed(0)}%`}
        </span>
      </div>

      {isActive && (
        <>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-gray-600">
            <span>
              {formatSize(transfer.bytes_transferred)} / {transfer.total_size ? formatSize(transfer.total_size) : '?'}
            </span>
            <span>
              {transfer.speed_bytes_per_sec ? formatSpeed(transfer.speed_bytes_per_sec) : ''}
            </span>
          </div>
        </>
      )}

      {isFailed && (
        <div className="text-red-400/80 text-xs mt-1 bg-red-500/5 px-2 py-0.5 rounded">{transfer.error_message || 'Transfer failed'}</div>
      )}
    </div>
  );
}
