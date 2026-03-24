import { createContext, useContext, useState, useMemo } from 'react';
import { ThemeProvider as MuiThemeProvider, CssBaseline } from '@mui/material';
import { createTheme } from '@mui/material/styles';

const ThemeContext = createContext({ mode: 'light', toggleTheme: () => { } });

export function useThemeMode() {
    return useContext(ThemeContext);
}

const sharedTypography = {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    h5: { fontWeight: 600, letterSpacing: '-0.01em' },
    h6: { fontWeight: 600, letterSpacing: '-0.01em' },
};

const sharedComponents = {
    MuiButton: {
        styleOverrides: {
            root: { textTransform: 'none', fontWeight: 500, borderRadius: 8 },
        },
    },
    MuiPaper: {
        styleOverrides: {
            root: { backgroundImage: 'none' },
        },
    },
    MuiAppBar: {
        styleOverrides: {
            root: { backgroundImage: 'none' },
        },
    },
};

function buildTheme(mode) {
    const isDark = mode === 'dark';
    return createTheme({
        palette: {
            mode,
            primary: {
                main: '#7c6ef0',
                light: isDark ? '#9185f5' : '#a99af5',
                dark: '#5a4ed4',
            },
            secondary: {
                main: '#a78bfa',
            },
            background: isDark
                ? { default: '#0f1117', paper: '#161822' }
                : { default: '#f5f6fa', paper: '#ffffff' },
            text: isDark
                ? { primary: '#e2e4f0', secondary: '#9298b8' }
                : { primary: '#1a1a2e', secondary: '#5c5f7a' },
            success: { main: isDark ? '#4ade80' : '#22c55e' },
            error: { main: isDark ? '#f87171' : '#ef4444' },
            warning: { main: isDark ? '#fbbf24' : '#f59e0b' },
            divider: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.08)',
        },
        typography: sharedTypography,
        shape: { borderRadius: 12 },
        components: sharedComponents,
    });
}

export default function ThemeContextProvider({ children }) {
    const [mode, setMode] = useState(() => {
        try {
            return localStorage.getItem('theme-mode') || 'light';
        } catch {
            return 'light';
        }
    });

    const toggleTheme = () => {
        setMode(prev => {
            const next = prev === 'dark' ? 'light' : 'dark';
            try { localStorage.setItem('theme-mode', next); } catch { }
            return next;
        });
    };

    const theme = useMemo(() => buildTheme(mode), [mode]);

    return (
        <ThemeContext.Provider value={{ mode, toggleTheme }}>
            <MuiThemeProvider theme={theme}>
                <CssBaseline />
                {children}
            </MuiThemeProvider>
        </ThemeContext.Provider>
    );
}
