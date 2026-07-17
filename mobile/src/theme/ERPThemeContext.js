import React, { createContext, useContext, useMemo, useState } from 'react';

const palettes = {
  light: {
    name: 'light',
    label: 'Light',
    background: '#f4f7fb',
    surface: '#ffffff',
    surfaceAlt: '#eff6ff',
    border: '#dbe3ef',
    text: '#0f172a',
    muted: '#64748b',
    primary: '#2563eb',
    primarySoft: '#dbeafe',
    tableHead: '#eaf1fb',
    header: '#0b2345',
    headerAlt: '#15385f',
    headerBorder: '#31577d',
    headerText: '#ffffff',
    headerMuted: '#b8c7dc',
    headerAccent: '#67e8f9',
  },
};

const headerPalettes = [
  { header: '#0b2345', headerAlt: '#15385f', headerBorder: '#31577d', headerText: '#ffffff', headerMuted: '#b8c7dc', headerAccent: '#67e8f9' },
  { header: '#312e81', headerAlt: '#4338ca', headerBorder: '#6366f1', headerText: '#ffffff', headerMuted: '#d8d7f5', headerAccent: '#c4b5fd' },
  { header: '#134e4a', headerAlt: '#115e59', headerBorder: '#2f766f', headerText: '#ffffff', headerMuted: '#c7e8e4', headerAccent: '#99f6e4' },
  { header: '#1e293b', headerAlt: '#334155', headerBorder: '#526279', headerText: '#ffffff', headerMuted: '#cbd5e1', headerAccent: '#93c5fd' },
  { header: '#ffffff', headerAlt: '#eff6ff', headerBorder: '#dbe3ef', headerText: '#0f172a', headerMuted: '#64748b', headerAccent: '#2563eb' },
];

const ERPThemeContext = createContext({
  theme: palettes.light,
  themeName: 'light',
  toggleTheme: () => {},
  cycleHeaderColor: () => {},
});

export function ERPThemeProvider({ children }) {
  const [themeName] = useState('light');
  const [headerPaletteIndex, setHeaderPaletteIndex] = useState(0);
  const value = useMemo(() => ({
    theme: { ...palettes[themeName], ...headerPalettes[headerPaletteIndex] },
    themeName,
    toggleTheme: () => {},
    cycleHeaderColor: () => setHeaderPaletteIndex(current => (current + 1) % headerPalettes.length),
  }), [headerPaletteIndex, themeName]);

  return <ERPThemeContext.Provider value={value}>{children}</ERPThemeContext.Provider>;
}

export const useERPTheme = () => useContext(ERPThemeContext);
