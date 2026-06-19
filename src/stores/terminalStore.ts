import { create } from 'zustand';

interface TerminalState {
  terminals: Record<string, { cols: number; rows: number }>;
  setSize: (id: string, cols: number, rows: number) => void;
  remove: (id: string) => void;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  terminals: {},
  setSize: (id, cols, rows) =>
    set((s) => ({
      terminals: { ...s.terminals, [id]: { cols, rows } },
    })),
  remove: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.terminals;
      return { terminals: rest };
    }),
}));
