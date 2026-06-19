import { create } from 'zustand';

export interface Connection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_method: string;
  private_key_path?: string;
  fingerprint?: string;
  group_name: string;
  color_label?: string;
  created_at: number;
  updated_at: number;
  last_connected_at?: number;
}

interface ConnectionState {
  connections: Connection[];
  activeId: string | null;
  setConnections: (connections: Connection[]) => void;
  setActive: (id: string | null) => void;
  addConnection: (c: Connection) => void;
  removeConnection: (id: string) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connections: [],
  activeId: null,
  setConnections: (connections) => set({ connections }),
  setActive: (id) => set({ activeId: id }),
  addConnection: (c) => set((s) => ({ connections: [...s.connections, c] })),
  removeConnection: (id) =>
    set((s) => ({
      connections: s.connections.filter((c) => c.id !== id),
      activeId: s.activeId === id ? null : s.activeId,
    })),
}));
