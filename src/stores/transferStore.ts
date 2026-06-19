import { create } from 'zustand';

export interface TransferItem {
  id: string;
  connection_id?: string;
  direction: 'upload' | 'download';
  remote_path: string;
  local_path: string;
  total_size?: number;
  bytes_transferred: number;
  status: 'queued' | 'transferring' | 'paused' | 'completed' | 'failed' | 'cancelled';
  speed_bytes_per_sec?: number;
  error_message?: string;
}

interface TransferState {
  transfers: TransferItem[];
  setTransfers: (t: TransferItem[]) => void;
  updateTransfer: (id: string, updates: Partial<TransferItem>) => void;
  addTransfer: (t: TransferItem) => void;
}

export const useTransferStore = create<TransferState>((set) => ({
  transfers: [],
  setTransfers: (transfers) => set({ transfers }),
  updateTransfer: (id, updates) =>
    set((s) => ({
      transfers: s.transfers.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  addTransfer: (t) => set((s) => ({ transfers: [...s.transfers, t] })),
}));
