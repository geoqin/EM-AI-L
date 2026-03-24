import { useState, useEffect } from 'react';
import {
    Box, Typography, Alert, CircularProgress, Paper, Chip, Divider,
    List, ListItemButton, ListItemText, Select, MenuItem, FormControl, InputLabel,
    TextField, InputAdornment, IconButton,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import FolderIcon from '@mui/icons-material/Folder';
import EmailIcon from '@mui/icons-material/Email';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SortIcon from '@mui/icons-material/Sort';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { getThreads } from '../api/client';
import { fuzzyMatch } from '../utils/fuzzyMatch';

const CATEGORY_COLORS = {
    work: '#4fc3f7',
    personal: '#81c784',
    finance: '#ffb74d',
    shopping: '#f48fb1',
    social: '#ce93d8',
    other: '#90a4ae',
};

// Provider watermark logos (same as EmailList)
const PROVIDER_WATERMARK = {
    gmail: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cpath fill='%234285F4' d='M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z'/%3E%3Cpath fill='%2334A853' d='M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z'/%3E%3Cpath fill='%23FBBC05' d='M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z'/%3E%3Cpath fill='%23EA4335' d='M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z'/%3E%3C/svg%3E")`,
    outlook: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cpath fill='%230078D4' d='M44 10H4c-1.1 0-2 .9-2 2v24c0 1.1.9 2 2 2h40c1.1 0 2-.9 2-2V12c0-1.1-.9-2-2-2zm-1.4 2L24 26.5 5.4 12h37.2zM4 36V14.2l20 15 20-15V36H4z'/%3E%3C/svg%3E")`,
};

function getThreadProvider(providers) {
    if (!providers) return 'gmail';
    const list = providers.split(',');
    if (list.length === 1) return list[0];
    return list[0]; // Use dominant (first) provider for mixed threads
}

const SORT_OPTIONS = [
    { value: 'last_updated', label: 'Last Updated' },
    { value: 'email_count', label: 'Most Emails' },
    { value: 'category', label: 'Category' },
    { value: 'title', label: 'Title (A-Z)' },
];

export default function ThreadList({ onSelectThread, searchQuery = '' }) {
    const [threads, setThreads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [sortBy, setSortBy] = useState('last_updated');

    useEffect(() => { loadThreads(); }, []);

    async function loadThreads() {
        try {
            setLoading(true);
            const data = await getThreads();
            setThreads(data.threads);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (days === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (days === 1) return 'Yesterday';
        if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    // Filter then sort threads
    const filteredThreads = searchQuery.trim()
        ? threads.filter(t => fuzzyMatch(searchQuery, t.title, t.category, t.tldr))
        : threads;

    const sortedThreads = [...filteredThreads].sort((a, b) => {
        switch (sortBy) {
            case 'last_updated':
                return new Date(a.last_activity || 0) - new Date(b.last_activity || 0);
            case 'email_count':
                return (b.email_count || 0) - (a.email_count || 0);
            case 'category':
                return (a.category || 'other').localeCompare(b.category || 'other');
            case 'title':
                return (a.title || '').localeCompare(b.title || '');
            default:
                return 0;
        }
    });

    if (loading) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 10, gap: 2 }}>
                <CircularProgress size={24} />
                <Typography color="text.secondary">Loading threads...</Typography>
            </Box>
        );
    }

    return (
        <Box data-tour="thread-list">
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <AutoAwesomeIcon sx={{ color: 'primary.main' }} />
                    <Typography variant="h5">Threads</Typography>
                    {threads.length > 0 && (
                        <Chip label={`${threads.length}`} size="small" variant="outlined"
                            sx={{ borderColor: 'divider', color: 'text.secondary', fontSize: '0.75rem' }} />
                    )}
                </Box>
                {threads.length > 1 && (
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                        <Select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            startAdornment={<SortIcon sx={{ mr: 0.5, fontSize: 18, color: 'text.secondary' }} />}
                            sx={{ fontSize: '0.8rem' }}
                        >
                            {SORT_OPTIONS.map(opt => (
                                <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.8rem' }}>
                                    {opt.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

            {/* Thread List */}
            {sortedThreads.length === 0 ? (
                <Paper elevation={0} sx={{ textAlign: 'center', py: 8, px: 3, border: 1, borderColor: 'divider' }}>
                    <FolderIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                    <Typography variant="h6" color="text.secondary" gutterBottom>
                        No threads yet
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Go to the Inbox and click "Analyze Emails" to triage and thread your emails with AI.
                    </Typography>
                </Paper>
            ) : (
                <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', overflow: 'hidden' }}>
                    <List disablePadding>
                        {sortedThreads.map((thread, index) => {
                            const provider = getThreadProvider(thread.providers);
                            return (
                                <Box key={thread.id}>
                                    {index > 0 && <Divider />}
                                    <ListItemButton
                                        onClick={() => onSelectThread(thread.id)}
                                        sx={{
                                            py: 2, px: 2.5,
                                            flexDirection: 'column', alignItems: 'stretch', gap: 0.75,
                                            position: 'relative',
                                            overflow: 'hidden',
                                            '&:hover': { bgcolor: 'action.hover' },
                                            // Provider logo watermark
                                            '&::before': {
                                                content: '""',
                                                position: 'absolute',
                                                left: '50%',
                                                top: '50%',
                                                transform: 'translate(-50%, -50%) rotate(-15deg)',
                                                width: 160,
                                                height: 160,
                                                backgroundImage: PROVIDER_WATERMARK[provider],
                                                backgroundSize: 'contain',
                                                backgroundRepeat: 'no-repeat',
                                                backgroundPosition: 'center',
                                                opacity: 0.09,
                                                pointerEvents: 'none',
                                            },
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
                                                <Chip
                                                    label={thread.category || 'other'}
                                                    size="small"
                                                    sx={{
                                                        bgcolor: CATEGORY_COLORS[thread.category] || CATEGORY_COLORS.other,
                                                        color: '#fff',
                                                        fontSize: '0.65rem',
                                                        height: 20,
                                                        fontWeight: 600,
                                                        textTransform: 'uppercase',
                                                    }}
                                                />
                                                <Typography variant="subtitle2" sx={{
                                                    fontWeight: 600, overflow: 'hidden',
                                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}>
                                                    <Typography component="span" sx={{ color: 'text.secondary', fontWeight: 500, mr: 0.5, fontSize: '0.8rem' }}>
                                                        #{index + 1}
                                                    </Typography>
                                                    {thread.title}
                                                </Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                                                <Chip
                                                    icon={<EmailIcon sx={{ fontSize: '0.8rem !important' }} />}
                                                    label={thread.email_count}
                                                    size="small"
                                                    variant="outlined"
                                                    sx={{ borderColor: 'divider', fontSize: '0.7rem', height: 22 }}
                                                />
                                                <Typography variant="caption" color="text.secondary">
                                                    {formatDate(thread.last_activity)}
                                                </Typography>
                                                <ArrowForwardIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                                            </Box>
                                        </Box>

                                        {thread.tldr && (
                                            <Typography variant="body2" color="text.secondary" sx={{
                                                display: '-webkit-box', WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                                lineHeight: 1.5, fontSize: '0.8125rem',
                                            }}>
                                                {thread.tldr}
                                            </Typography>
                                        )}
                                    </ListItemButton>
                                </Box>
                            );
                        })}
                    </List>
                </Paper>
            )}
        </Box>
    );
}

