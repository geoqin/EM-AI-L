import { useState, useEffect } from 'react';
import {
    Box, Typography, Button, Alert, CircularProgress, Paper, Chip, Tooltip,
    List, ListItemButton, IconButton, Divider, Select, MenuItem,
    Switch, FormControlLabel,
} from '@mui/material';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import TipsAndUpdatesIcon from '@mui/icons-material/TipsAndUpdates';
import DeleteIcon from '@mui/icons-material/Delete';
import MoveToInboxIcon from '@mui/icons-material/MoveToInbox';
import { getEmailsByCategory, applyAllActions, dismissJunk, getSettings, updateSettings, overrideTriage } from '../api/client';
import TeachAIDialog from './ReclassifyDialog';

const ACTION_LABELS = {
    move_to_junk: 'Move to Junk/Trash folder',
    archive: 'Archive',
    delete: 'Delete permanently',
    do_nothing: 'Do nothing',
};

export default function JunkList() {
    const [emails, setEmails] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const [teachEmail, setTeachEmail] = useState(null);
    const [junkAction, setJunkAction] = useState('move_to_junk');
    const [autoApply, setAutoApply] = useState(false);
    const [dismissing, setDismissing] = useState(false);

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        try {
            setLoading(true);
            const [emailData, settingsData] = await Promise.all([
                getEmailsByCategory('confirmed_junk'),
                getSettings(),
            ]);
            setEmails(emailData.emails);
            setTotal(emailData.total);
            setJunkAction(settingsData.settings?.junk_action || 'move_to_junk');
            setAutoApply(settingsData.settings?.auto_apply_actions === 'true');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleMoveToInbox(emailId) {
        try {
            await overrideTriage(emailId, 'unprocessed');
            setEmails(prev => prev.filter(e => e.id !== emailId));
            setTotal(prev => prev - 1);
        } catch (err) {
            setError(err.message);
        }
    }

    async function handleApplyAll() {
        try {
            setApplying(true);
            const data = await applyAllActions('confirmed_junk');
            setResult(data.message);
            await loadData();
            setTimeout(() => setResult(null), 4000);
        } catch (err) {
            setError(err.message);
        } finally {
            setApplying(false);
        }
    }

    async function handleDismissAll() {
        try {
            setDismissing(true);
            const data = await dismissJunk();
            setResult(data.message);
            await loadData();
            setTimeout(() => setResult(null), 4000);
        } catch (err) {
            setError(err.message);
        } finally {
            setDismissing(false);
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

    if (loading) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 10, gap: 2 }}>
                <CircularProgress size={24} />
                <Typography color="text.secondary">Loading...</Typography>
            </Box>
        );
    }

    return (
        <Box data-tour="trash-content">
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <DeleteIcon sx={{ color: 'warning.main' }} />
                    <Typography variant="h5">Trash</Typography>
                    <Chip label={`${total}`} size="small" variant="outlined"
                        sx={{ borderColor: 'divider', color: 'text.secondary', fontSize: '0.75rem' }} />
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box data-tour="trash-action-selector" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                Action:
                            </Typography>
                            <Select
                                value={junkAction}
                                onChange={async (e) => {
                                    const val = e.target.value;
                                    setJunkAction(val);
                                    try { await updateSettings({ junk_action: val }); }
                                    catch (err) { console.error(err); }
                                }}
                                size="small"
                                sx={{ fontSize: '0.75rem', height: 28, minWidth: 140 }}
                            >
                                {Object.entries(ACTION_LABELS).map(([value, label]) => (
                                    <MenuItem key={value} value={value} sx={{ fontSize: '0.8rem' }}>{label}</MenuItem>
                                ))}
                            </Select>
                            <FormControlLabel
                                control={
                                    <Switch
                                        size="small"
                                        checked={autoApply}
                                        onChange={async (e) => {
                                            const val = e.target.checked;
                                            setAutoApply(val);
                                            try { await updateSettings({ auto_apply_actions: val }); }
                                            catch (err) { console.error(err); }
                                        }}
                                    />
                                }
                                label={<Typography variant="caption" color="text.secondary">Auto</Typography>}
                                sx={{ ml: 0.5, mr: 0 }}
                            />
                        </Box>
                        <Button data-tour="apply-action-button" variant="contained" color="warning" size="small"
                            startIcon={applying ? <CircularProgress size={16} color="inherit" /> : <DeleteSweepIcon />}
                            disabled={applying || dismissing || total === 0} onClick={handleApplyAll}>
                            Apply Action{total > 0 ? ` (${total})` : ''}
                        </Button>
                        {total > 0 && (
                            <Button variant="outlined" color="inherit" size="small"
                                disabled={applying || dismissing}
                                onClick={handleDismissAll}>
                                {dismissing ? 'Dismissing...' : 'Dismiss All'}
                            </Button>
                        )}
                    </Box>
                </Box>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
            {result && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setResult(null)}>{result}</Alert>}

            {emails.length === 0 ? (
                <Paper elevation={0} sx={{ textAlign: 'center', py: 8, px: 3, border: 1, borderColor: 'divider' }}>
                    <DeleteIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                    <Typography variant="h6" color="text.secondary" gutterBottom>No trashed emails</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Emails you sweep from the Inbox will appear here.
                    </Typography>
                </Paper>
            ) : (
                <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', overflow: 'hidden' }}>
                    <List disablePadding>
                        {emails.map((email, index) => (
                            <Box key={email.id}>
                                {index > 0 && <Divider />}
                                <ListItemButton
                                    sx={{
                                        py: 1.5, px: 2.5,
                                        flexDirection: 'column', alignItems: 'stretch', gap: 0.5,
                                        opacity: email.triage_action_taken ? 0.5 : 1,
                                    }}
                                    disableRipple
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
                                            <Tooltip title="Teach AI a rule">
                                                <IconButton size="small" sx={{ color: 'primary.main' }}
                                                    onClick={(e) => { e.stopPropagation(); setTeachEmail(email); }}>
                                                    <TipsAndUpdatesIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Move to Inbox">
                                                <IconButton size="small" sx={{ color: 'success.main' }}
                                                    onClick={(e) => { e.stopPropagation(); handleMoveToInbox(email.id); }}>
                                                    <MoveToInboxIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </Box>

                                    <Typography variant="body2" sx={{
                                        fontWeight: 500, overflow: 'hidden',
                                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {email.subject || '(No Subject)'}
                                    </Typography>

                                    {email.triage_reason && (
                                        <Typography variant="caption" color="text.secondary">
                                            {email.triage_reason}
                                        </Typography>
                                    )}
                                </ListItemButton>
                            </Box>
                        ))}
                    </List>
                </Paper>
            )}

            <TeachAIDialog
                open={!!teachEmail}
                email={teachEmail}
                onClose={() => setTeachEmail(null)}
                onComplete={() => { loadData(); setResult('Rule saved!'); setTimeout(() => setResult(null), 4000); }}
            />
        </Box>
    );
}
