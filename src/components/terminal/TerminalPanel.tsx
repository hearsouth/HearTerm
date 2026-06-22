import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import 'xterm/css/xterm.css';

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

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'JetBrains Mono, monospace',
      theme: {
        background: '#1a1b26',
        foreground: '#a9b1d6',
        cursor: '#c0caf5',
        selectionBackground: '#33467c',
        black: '#32344a',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#ad8ee6',
        cyan: '#449dab',
        white: '#9699a8',
        brightBlack: '#444b6a',
        brightRed: '#ff7a93',
        brightGreen: '#b9f27c',
        brightYellow: '#ff9e64',
        brightBlue: '#7da6ff',
        brightMagenta: '#bb9af7',
        brightCyan: '#0db9d7',
        brightWhite: '#acb0d0',
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

    // User input → send to backend
    term.onData((data) => {
      const bytes = new TextEncoder().encode(data);
      invoke('term_write', {
        terminalId,
        data: Array.from(bytes),
      }).catch(console.error);
    });

    // Backend output → render in terminal
    const unlistenPromise = listen<{ connection_id: string; data: number[] }>(
      'terminal-output',
      (event) => {
        if (event.payload.connection_id === terminalIdRef.current) {
          term.write(new Uint8Array(event.payload.data));
        }
      },
    );

    // Open terminal channel on backend
    invoke('term_open', { terminalId, connectionId }).catch(console.error);

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, [terminalId, connectionId]);

  return <div ref={termRef} className="h-full w-full" />;
}
