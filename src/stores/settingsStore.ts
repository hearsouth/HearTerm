import { create } from 'zustand';

export type Theme = 'dark' | 'light';

interface Settings {
  theme: Theme;
  fontSize: number;
  fontFamily: string;
  terminalTheme: string;
}

interface SettingsState extends Settings {
  setTheme: (theme: Theme) => void;
  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;
  setTerminalTheme: (name: string) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'dark',
  fontSize: 14,
  fontFamily: 'JetBrains Mono',
  terminalTheme: 'tokyo-night',
  setTheme: (theme) => set({ theme }),
  setFontSize: (fontSize) => set({ fontSize }),
  setFontFamily: (fontFamily) => set({ fontFamily }),
  setTerminalTheme: (terminalTheme) => set({ terminalTheme }),
}));
