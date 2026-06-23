import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import 'xterm/css/xterm.css';

const TERMINAL_THEMES: Record<string, { bg: string; fg: string }> = {
  dark:   { bg: '#08090a', fg: '#d0d6e0' },
  light:  { bg: '#ffffff', fg: '#18181b' },
  warm:   { bg: '#f5f0e8', fg: '#2d2818' },
  cyber:  { bg: '#0a0a0f', fg: '#00ff88' },
  aurora: { bg: '#0d1117', fg: '#c9d1d9' },
  moon:   { bg: '#1a1a2e', fg: '#c0c0ff' },
  sunset: { bg: '#2d2018', fg: '#f0e0d0' },
};

const DEFAULT_THEME = 'dark';

function getTerminalColors(theme: string) {
  return TERMINAL_THEMES[theme] || TERMINAL_THEMES[DEFAULT_THEME];
}

interface Props {
  terminalId: string;
  connectionId: string;
}

export default function TerminalPanel({ terminalId, connectionId }: Props) {
  const termRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const terminalIdRef = useRef(terminalId);
  terminalIdRef.current = terminalId;

  useEffect(() => {
    if (!termRef.current) return;

    const currentTheme = document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;
    const colors = getTerminalColors(currentTheme);

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
      scrollback: 10000,
      allowProposedApi: true,
      theme: {
        background: colors.bg,
        foreground: colors.fg,
        cursor: colors.fg,
        selectionBackground: 'rgba(128,128,128,0.3)',
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(termRef.current);
    fitAddon.fit();

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Theme change → update terminal colors
    const themeObserver = new MutationObserver(() => {
      const t = document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;
      const c = getTerminalColors(t);
      term.options.theme = {
        ...term.options.theme,
        background: c.bg,
        foreground: c.fg,
        cursor: c.fg,
      };
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    term.onData((data) => {
      invoke('term_write', { terminalId, data: Array.from(new TextEncoder().encode(data)) }).catch(console.error);
    });

    const unlistenPromise = listen<{ connection_id: string; data: number[] }>(
      'terminal-output',
      (event) => {
        if (event.payload.connection_id === terminalIdRef.current) {
          term.write(new Uint8Array(event.payload.data));
        }
      },
    );

    invoke('term_open', { terminalId, connectionId }).catch(console.error);

    const resizeObserver = new ResizeObserver(() => fitAddon.fit());
    resizeObserver.observe(termRef.current);

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
      resizeObserver.disconnect();
      themeObserver.disconnect();
      term.dispose();
    };
  }, [terminalId, connectionId]);

  return <div ref={termRef} className="h-full w-full" />;
}
