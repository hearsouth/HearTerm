import { create } from 'zustand';

export type ThemeId = 'dark' | 'light' | 'warm' | 'cyber' | 'aurora' | 'moon' | 'sunset';

export const themes: { id: ThemeId; name: string }[] = [
  { id: 'dark', name: '暗色深度' },
  { id: 'light', name: '极简瑞士' },
  { id: 'warm', name: '和风侘寂' },
  { id: 'cyber', name: '赛博暗潮' },
  { id: 'aurora', name: '冰川圆角' },
  { id: 'moon', name: '月光银' },
  { id: 'sunset', name: '暖橙' },
];

interface ThemeState {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}

function applyTheme(t: ThemeId) {
  document.documentElement.setAttribute('data-theme', t);
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: (localStorage.getItem('hear-theme') as ThemeId) || 'dark',
  setTheme: (t) => {
    localStorage.setItem('hear-theme', t);
    applyTheme(t);
    set({ theme: t });
  },
}));

// Apply on import
applyTheme(useThemeStore.getState().theme);
