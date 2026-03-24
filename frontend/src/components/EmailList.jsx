import { useState, useEffect } from 'react';
import {
    Box, Typography, Button, Alert, CircularProgress, Paper,
    List, ListItemButton, IconButton, Tooltip, Chip, Switch, FormControlLabel,
    TextField, InputAdornment, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
    Select, MenuItem,
} from '@mui/material';
import InboxIcon from '@mui/icons-material/Inbox';
import SyncIcon from '@mui/icons-material/Sync';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import TipsAndUpdatesIcon from '@mui/icons-material/TipsAndUpdates';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InboxOutlinedIcon from '@mui/icons-material/MoveToInbox';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { getEmails, syncEmails, overrideTriage, processEmailsStream, moveHighlightedToJunk, revertTriage, getThreads, checkAuthStatus } from '../api/client';
import TeachAIDialog from './ReclassifyDialog';
import ThreadPicker from './ThreadPicker';
import { scoreEmail } from '../utils/fuzzyMatch';

const HIGHLIGHT_COLORS = {
    junk: { bg: 'rgba(244, 67, 54, 0.12)', border: '#f44336' },
    spam: { bg: 'rgba(244, 67, 54, 0.12)', border: '#f44336' },
    for_review: { bg: 'rgba(255, 193, 7, 0.15)', border: '#ffc107' },
    gmail_spam: { bg: 'rgba(255, 152, 0, 0.15)', border: '#ff9800' },
};

// Provider watermark logos (inline SVG data URIs)
const PROVIDER_WATERMARK = {
    gmail: {
        // Modern Google "G" logo with brand colors
        image: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cpath fill='%234285F4' d='M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z'/%3E%3Cpath fill='%2334A853' d='M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z'/%3E%3Cpath fill='%23FBBC05' d='M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z'/%3E%3Cpath fill='%23EA4335' d='M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z'/%3E%3C/svg%3E")`,
        label: 'Gmail',
    },
    outlook: {
        // Outlook envelope icon in Microsoft blue
        image: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cpath fill='%230078D4' d='M44 10H4c-1.1 0-2 .9-2 2v24c0 1.1.9 2 2 2h40c1.1 0 2-.9 2-2V12c0-1.1-.9-2-2-2zm-1.4 2L24 26.5 5.4 12h37.2zM4 36V14.2l20 15 20-15V36H4z'/%3E%3C/svg%3E")`,
        label: 'Outlook',
    },
};

export default function EmailList({ searchQuery = '', onTutorialEvent }) {
    const [emails, setEmails] = useState([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [sweeping, setSweeping] = useState(false);
    const [successMsg, setSuccessMsg] = useState(null);
    const [error, setError] = useState(null);
    const [teachEmail, setTeachEmail] = useState(null);
    const [pickerEmail, setPickerEmail] = useState(null);
    const [pickerAnchor, setPickerAnchor] = useState(null);
    const [triageMode, setTriageMode] = useState(false);
    const [triageSnapshot, setTriageSnapshot] = useState([]); // Pre-analysis state for Cancel revert
    const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
    const [reverting, setReverting] = useState(false);
    const [threadDisplayMap, setThreadDisplayMap] = useState({});
    const [analyzeProgress, setAnalyzeProgress] = useState('');
    const [providerFilter, setProviderFilter] = useState('all');
    const [syncCount, setSyncCount] = useState(20);
    const [syncProvider, setSyncProvider] = useState('all');
    const [connectedAccounts, setConnectedAccounts] = useState([]);

    useEffect(() => {
        loadEmails();
        loadConnectedAccounts();
    }, []);

    async function loadConnectedAccounts() {
        try {
            const status = await checkAuthStatus();
            const accounts = [];
            if (status.authenticated && status.email) {
                accounts.push({ provider: 'gmail', email: status.email });
            }
            if (status.outlookAuthenticated && status.outlookEmail) {
                accounts.push({ provider: 'outlook', email: status.outlookEmail });
            }
            setConnectedAccounts(accounts);
        } catch (err) {
            console.error('Failed to load accounts:', err);
        }
    }

    async function loadEmails() {
        try {
            setLoading(true);
            const [emailData, threadData] = await Promise.all([getEmails(200), getThreads()]);
            setEmails(emailData.emails);
            // Build DB-ID → sequential display number map (sorted ascending by last_activity)
            const sorted = [...(threadData.threads || [])].sort(
                (a, b) => new Date(a.last_activity || 0) - new Date(b.last_activity || 0)
            );
            const map = {};
            sorted.forEach((t, i) => { map[t.id] = i + 1; });
            setThreadDisplayMap(map);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleSync() {
        try {
            setSyncing(true);
            onTutorialEvent?.('sync-started');
            await syncEmails(syncCount, syncProvider);
            await loadEmails();
            setSuccessMsg('Emails synced!');
            setTimeout(() => setSuccessMsg(null), 3000);
            onTutorialEvent?.('sync-complete');
        } catch (err) {
            setError(err.message);
        } finally {
            setSyncing(false);
        }
    }

    async function handleAnalyze() {
        try {
            setAnalyzing(true);
            setAnalyzeProgress('Starting analysis...');
            onTutorialEvent?.('analyze-started');

            // Save pre-analysis snapshot so Cancel can revert
            const snapshot = emails.map(e => ({
                id: e.id,
                category: e.triage_category || 'unprocessed',
                reason: e.triage_reason || null,
            }));
            setTriageSnapshot(snapshot);

            const data = await processEmailsStream((msg) => {
                setAnalyzeProgress(msg);
            });
            await loadEmails();
            setTriageMode(true);
            setSuccessMsg(data.message);
            setTimeout(() => setSuccessMsg(null), 4000);
            onTutorialEvent?.('analyze-complete');
        } catch (err) {
            setError(err.message);
        } finally {
            setAnalyzing(false);
            setAnalyzeProgress('');
        }
    }

    async function handleConfirmTriage() {
        try {
            setSweeping(true);
            const data = await moveHighlightedToJunk();
            await loadEmails();
            setTriageMode(false);
            setTriageSnapshot([]);
            setSuccessMsg(data.message);
            setTimeout(() => setSuccessMsg(null), 4000);
        } catch (err) {
            setError(err.message);
        } finally {
            setSweeping(false);
        }
    }

    function handleCancelClick() {
        setCancelDialogOpen(true);
    }

    async function handleCancelConfirmed() {
        setCancelDialogOpen(false);
        if (triageSnapshot.length === 0) {
            setTriageMode(false);
            return;
        }

        try {
            setReverting(true);
            await revertTriage(triageSnapshot);
            await loadEmails();
            setTriageMode(false);
            setTriageSnapshot([]);
            setSuccessMsg('Analysis results discarded.');
            setTimeout(() => setSuccessMsg(null), 3000);
        } catch (err) {
            setError(err.message);
        } finally {
            setReverting(false);
        }
    }

    async function handleRowClick(email) {
        if (!triageMode) return; // Only toggle in triage mode

        // Gmail spam emails: click to rescue to inbox
        if (email.gmail_spam) {
            try {
                await overrideTriage(email.id, 'regular');
                setEmails(prev => prev.map(e =>
                    e.id === email.id ? { ...e, triage_category: 'regular', gmail_spam: 0 } : e
                ));
                setSuccessMsg('Email rescued from Gmail spam folder');
                setTimeout(() => setSuccessMsg(null), 3000);
            } catch (err) {
                setError(err.message);
            }
            return;
        }

        // Toggle logic:
        // Red (junk/spam) -> White (regular)
        // Yellow (for_review) -> Red (junk)
        // White (regular/unprocessed) -> Red (junk)
        const currentCat = email.triage_category;
        let newCat;
        if (currentCat === 'junk' || currentCat === 'spam') {
            newCat = 'regular';
        } else if (currentCat === 'for_review') {
            newCat = 'junk';
        } else {
            newCat = 'junk';
        }

        try {
            await overrideTriage(email.id, newCat);
            // Update locally for instant feedback
            setEmails(prev => prev.map(e =>
                e.id === email.id ? { ...e, triage_category: newCat } : e
            ));
        } catch (err) {
            setError(err.message);
        }
    }

    async function handleSingleMoveToJunk(email, e) {
        e.stopPropagation();
        try {
            await overrideTriage(email.id, 'confirmed_junk');
            setEmails(prev => prev.map(em =>
                em.id === email.id ? { ...em, triage_category: 'confirmed_junk' } : em
            ));
        } catch (err) {
            setError(err.message);
        }
    }

    async function handleMoveToInbox(email, e) {
        e.stopPropagation();
        try {
            await overrideTriage(email.id, 'regular');
            setEmails(prev => prev.map(em =>
                em.id === email.id ? { ...em, triage_category: 'regular' } : em
            ));
        } catch (err) {
            setError(err.message);
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

    function extractName(fromStr) {
        if (!fromStr) return 'Unknown';
        const match = fromStr.match(/^"?([^"<]+)"?\s*</);
        if (match) return match[1].trim();
        const emailMatch = fromStr.match(/^([^@]+)@/);
        if (emailMatch) return emailMatch[1];
        return fromStr;
    }

    // Filter emails for display
    // Normal mode: hide confirmed_junk and gmail_spam
    // Triage mode: show gmail_spam emails too (for rescue)
    const inboxEmails = emails.filter(e => {
        if (e.triage_category === 'confirmed_junk') return false;
        if (e.triage_category === 'actioned') return false;
        if (e.gmail_spam && !triageMode) return false;
        if (providerFilter !== 'all' && (e.provider || 'gmail') !== providerFilter) return false;
        return true;
    });
    const filteredEmails = searchQuery.trim()
        ? inboxEmails
            .map(e => ({ ...e, _score: scoreEmail(searchQuery, e) }))
            .filter(e => e._score > 0)
            .sort((a, b) => b._score - a._score)
        : inboxEmails;
    const junkCount = filteredEmails.filter(e => ['junk', 'spam'].includes(e.triage_category)).length;
    const forReviewCount = filteredEmails.filter(e => e.triage_category === 'for_review').length;
    const gmailSpamCount = filteredEmails.filter(e => e.gmail_spam).length;

    if (loading) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 10, gap: 2 }}>
                <CircularProgress size={24} />
                <Typography color="text.secondary">Loading emails...</Typography>
            </Box>
        );
    }

    return (
        <Box>
            {/* Row 1: Title + Sync controls */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <InboxIcon sx={{ color: 'primary.main' }} />
                    <Typography variant="h5">Inbox</Typography>
                </Box>

                {!triageMode && (
                    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
                        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>Sync latest</Typography>
                        <Select
                            value={syncCount}
                            onChange={(e) => setSyncCount(e.target.value)}
                            size="small"
                            sx={{ fontSize: '0.8rem', minWidth: 65, height: 32 }}
                        >
                            <MenuItem value={20}>20</MenuItem>
                            <MenuItem value={50}>50</MenuItem>
                            <MenuItem value={100}>100</MenuItem>
                        </Select>
                        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>emails from</Typography>
                        {connectedAccounts.length > 1 ? (
                            <Select
                                value={syncProvider}
                                onChange={(e) => setSyncProvider(e.target.value)}
                                size="small"
                                sx={{ fontSize: '0.8rem', minWidth: 120, height: 32 }}
                            >
                                <MenuItem value="all">All mailboxes</MenuItem>
                                {connectedAccounts.map(a => (
                                    <MenuItem key={a.provider} value={a.provider}>
                                        {a.email}
                                    </MenuItem>
                                ))}
                            </Select>
                        ) : (
                            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                {connectedAccounts[0]?.email || 'all mailboxes'}
                            </Typography>
                        )}
                        <Button data-tour="sync-button" variant="outlined" size="small" startIcon={syncing ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
                            disabled={syncing || analyzing} onClick={handleSync}
                            sx={{ height: 32, whiteSpace: 'nowrap' }}
                        >
                            {syncing ? 'Syncing...' : 'Sync Emails'}
                        </Button>
                    </Box>
                )}
            </Box>

            {/* Row 2: Email count + Provider filters + Analyze */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip label={`${inboxEmails.length} emails`} size="small" variant="outlined"
                        sx={{ borderColor: 'divider', color: 'text.secondary', fontSize: '0.75rem' }} />

                    {/* Provider filter tabs */}
                    {!triageMode && (() => {
                        const allCount = emails.filter(e => e.triage_category !== 'confirmed_junk' && e.triage_category !== 'actioned' && (!e.gmail_spam || triageMode)).length;
                        const providers = [...new Set(emails.map(e => e.provider || 'gmail'))];
                        const showFilters = providers.length > 1;
                        if (!showFilters) return null;
                        return (
                            <>
                                <Chip
                                    label={`All (${allCount})`}
                                    size="small"
                                    variant={providerFilter === 'all' ? 'filled' : 'outlined'}
                                    onClick={() => setProviderFilter('all')}
                                    sx={{
                                        fontWeight: providerFilter === 'all' ? 600 : 400,
                                        bgcolor: providerFilter === 'all' ? 'action.selected' : undefined,
                                    }}
                                />
                                {providers.map(p => {
                                    const count = emails.filter(e => (e.provider || 'gmail') === p && e.triage_category !== 'confirmed_junk' && e.triage_category !== 'actioned' && (!e.gmail_spam || triageMode)).length;
                                    const corner = PROVIDER_WATERMARK[p];
                                    return (
                                        <Chip
                                            key={p}
                                            label={`${corner?.label || p} (${count})`}
                                            size="small"
                                            variant={providerFilter === p ? 'filled' : 'outlined'}
                                            onClick={() => setProviderFilter(p)}
                                            sx={{
                                                fontWeight: providerFilter === p ? 600 : 400,
                                                bgcolor: providerFilter === p ? (p === 'outlook' ? 'rgba(0,120,212,0.15)' : 'rgba(66,133,244,0.15)') : undefined,
                                                borderColor: providerFilter === p ? (p === 'outlook' ? '#0078D4' : '#4285F4') : undefined,
                                            }}
                                        />
                                    );
                                })}
                            </>
                        );
                    })()}
                </Box>

                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    {!triageMode && (
                        <Button data-tour="analyze-button" variant="contained" size="small" color="secondary"
                            startIcon={analyzing ? <CircularProgress size={16} color="inherit" /> : <AutoFixHighIcon />}
                            disabled={analyzing || syncing} onClick={handleAnalyze}
                            sx={{ height: 32, whiteSpace: 'nowrap' }}
                        >
                            {analyzing ? 'Analyzing...' : 'Analyze Emails'}
                        </Button>
                    )}
                    {analyzing && analyzeProgress && (
                        <Typography variant="caption" color="text.secondary" sx={{
                            animation: 'pulse 1.5s ease-in-out infinite',
                            '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
                        }}>
                            {analyzeProgress}
                        </Typography>
                    )}
                </Box>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
            {successMsg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMsg(null)}>{successMsg}</Alert>}

            {/* Triage mode banner */}
            {triageMode && (
                <Paper elevation={2} sx={{
                    mb: 2, p: 2, borderRadius: 2,
                    border: 1, borderColor: 'warning.main',
                    background: 'linear-gradient(135deg, rgba(255,193,7,0.08), rgba(255,152,0,0.04))',
                }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                ✨ Triage Mode
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                {junkCount > 0
                                    ? `${junkCount} email${junkCount === 1 ? '' : 's'} selected for trash.`
                                    : 'No emails selected for trash yet.'}
                                {forReviewCount > 0 && ` ${forReviewCount} borderline (yellow) — click to confirm as trash or leave.`}
                                {gmailSpamCount > 0 && ` ${gmailSpamCount} caught by Gmail spam — click to rescue.`}
                                {' '}Click emails to toggle selection.
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                            <Button
                                variant="contained" color="success" size="small"
                                startIcon={sweeping ? <CircularProgress size={14} color="inherit" /> : <CheckCircleIcon />}
                                disabled={sweeping || reverting || junkCount === 0}
                                onClick={handleConfirmTriage}
                            >
                                {sweeping ? 'Moving...' : `Confirm (${junkCount})`}
                            </Button>
                            <Button
                                variant="outlined" color="inherit" size="small"
                                startIcon={reverting ? <CircularProgress size={14} color="inherit" /> : <CancelIcon />}
                                disabled={sweeping || reverting}
                                onClick={handleCancelClick}
                            >
                                {reverting ? 'Reverting...' : 'Cancel'}
                            </Button>
                        </Box>
                    </Box>
                </Paper>
            )}

            {/* Email List */}
            {filteredEmails.length === 0 ? (
                <Paper elevation={0} sx={{ textAlign: 'center', py: 8, px: 3, border: 1, borderColor: 'divider' }}>
                    <InboxIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                    <Typography variant="h6" color="text.secondary" gutterBottom>Your inbox is empty</Typography>
                    <Typography variant="body2" color="text.secondary">Click Sync Emails to fetch new messages.</Typography>
                </Paper>
            ) : (
                <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', overflow: 'hidden' }}>
                    <List disablePadding>
                        {filteredEmails.map((email, index) => {
                            const isGmailSpam = !!email.gmail_spam;
                            const effectiveCategory = isGmailSpam ? 'gmail_spam' : email.triage_category;
                            // Only show highlighting in triage mode
                            const highlight = triageMode ? HIGHLIGHT_COLORS[effectiveCategory] : null;

                            return (
                                <ListItemButton
                                    key={email.id}
                                    {...(index === 0 ? { 'data-tour': 'email-row' } : {})}
                                    onClick={() => handleRowClick(email)}
                                    sx={{
                                        py: 1.5, px: 2.5,
                                        flexDirection: 'column', alignItems: 'stretch', gap: 0.5,
                                        bgcolor: highlight?.bg || 'transparent',
                                        borderLeft: 4,
                                        borderColor: highlight?.border || 'transparent',
                                        borderBottom: index < filteredEmails.length - 1 ? '1px solid' : 'none',
                                        borderBottomColor: 'divider',
                                        transition: 'background-color 0.2s, border-color 0.2s',
                                        cursor: triageMode ? 'pointer' : 'default',
                                        position: 'relative',
                                        overflow: 'hidden',
                                        '&:hover': {
                                            bgcolor: triageMode
                                                ? (highlight ? highlight.bg : 'action.hover')
                                                : 'action.hover',
                                        },
                                        // Provider logo watermark
                                        '&::before': {
                                            content: '""',
                                            position: 'absolute',
                                            left: '50%',
                                            top: '50%',
                                            transform: 'translate(-50%, -50%) rotate(-15deg)',
                                            width: 160,
                                            height: 160,
                                            backgroundImage: PROVIDER_WATERMARK[email.provider || 'gmail']?.image,
                                            backgroundSize: 'contain',
                                            backgroundRepeat: 'no-repeat',
                                            backgroundPosition: 'center',
                                            opacity: 0.09,
                                            pointerEvents: 'none',
                                        },
                                    }}
                                >
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
                                            <Typography variant="subtitle2" sx={{
                                                fontWeight: 600, overflow: 'hidden',
                                                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }}>
                                                {extractName(email.from_email || '')}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                                            <Typography variant="caption" color="text.secondary">
                                                {formatDate(email.received_at)}
                                            </Typography>
                                            {!triageMode && (
                                                <>
                                                    <Tooltip title="Teach AI a rule">
                                                        <IconButton size="small" sx={{ color: 'primary.main' }}
                                                            onClick={(e) => { e.stopPropagation(); setTeachEmail(email); }}>
                                                            <TipsAndUpdatesIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Move to Trash">
                                                        <IconButton size="small" sx={{ color: 'error.main' }}
                                                            onClick={(e) => handleSingleMoveToJunk(email, e)}>
                                                            <DeleteOutlineIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </>
                                            )}
                                        </Box>
                                    </Box>

                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <Typography variant="body2" sx={{
                                            fontWeight: 500, overflow: 'hidden',
                                            textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                                        }}>
                                            {email.subject || '(No Subject)'}
                                        </Typography>
                                        {!triageMode && email.semantic_thread_id ? (
                                            <Chip
                                                icon={<AccountTreeIcon sx={{ fontSize: 12 }} />}
                                                label={`Thread #${threadDisplayMap[email.semantic_thread_id] || '?'}`}
                                                size="small"
                                                variant="outlined"
                                                clickable
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setPickerEmail(email);
                                                    setPickerAnchor(e.currentTarget);
                                                }}
                                                sx={{ fontSize: '0.6rem', height: 18, flexShrink: 0, cursor: 'pointer' }}
                                            />
                                        ) : !triageMode && (
                                            <Tooltip title="Assign to thread">
                                                <IconButton
                                                    size="small"
                                                    sx={{ color: 'text.secondary', opacity: 0.5, '&:hover': { opacity: 1 } }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setPickerEmail(email);
                                                        setPickerAnchor(e.currentTarget);
                                                    }}
                                                >
                                                    <AccountTreeIcon sx={{ fontSize: 16 }} />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                    </Box>

                                    <Typography variant="caption" color="text.secondary" sx={{
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {email.snippet || ''}
                                    </Typography>
                                </ListItemButton>
                            );
                        })}
                    </List>
                </Paper>
            )}

            {/* Cancel Triage Confirmation Dialog */}
            <Dialog open={cancelDialogOpen} onClose={() => setCancelDialogOpen(false)}>
                <DialogTitle>Cancel Triage?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to cancel? All analysis results will be discarded and emails will return to their previous state.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCancelDialogOpen(false)}>Go Back</Button>
                    <Button onClick={handleCancelConfirmed} color="error" variant="contained">
                        Discard & Exit
                    </Button>
                </DialogActions>
            </Dialog>

            {teachEmail && (
                <TeachAIDialog open={!!teachEmail} email={teachEmail} onClose={() => setTeachEmail(null)}
                    onComplete={() => { loadEmails(); setTeachEmail(null); setSuccessMsg('Rule saved!'); setTimeout(() => setSuccessMsg(null), 4000); }} />
            )}

            <ThreadPicker
                emailId={pickerEmail?.id}
                anchorEl={pickerAnchor}
                open={!!pickerEmail}
                onClose={() => { setPickerEmail(null); setPickerAnchor(null); }}
                onAssigned={() => {
                    setPickerEmail(null);
                    setPickerAnchor(null);
                    loadEmails();
                }}
            />
        </Box>
    );
}
