import { useState, useEffect } from 'react';
import {
    Box, Typography, Button, Alert, CircularProgress, Paper, Chip, Divider, IconButton,
    Dialog, DialogTitle, DialogContent, DialogActions, List, ListItemButton, ListItemText,
    Tooltip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PeopleIcon from '@mui/icons-material/People';
import AssignmentIcon from '@mui/icons-material/Assignment';
import InfoIcon from '@mui/icons-material/Info';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import {
    getThreadDetail, getEmailSuggestionsForThread, assignEmailToThread,
    removeEmailFromThread, deleteThread,
} from '../api/client';

export default function ThreadDetail({ threadId, onBack }) {
    const [thread, setThread] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [addEmailOpen, setAddEmailOpen] = useState(false);
    const [emailSuggestions, setEmailSuggestions] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [assigning, setAssigning] = useState(null);
    const [removing, setRemoving] = useState(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        loadThread();
    }, [threadId]);

    async function loadThread() {
        try {
            setLoading(true);
            const data = await getThreadDetail(threadId);
            setThread(data.thread);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleOpenAddEmail() {
        setAddEmailOpen(true);
        setLoadingSuggestions(true);
        try {
            const data = await getEmailSuggestionsForThread(threadId);
            setEmailSuggestions(data.suggestions || []);
        } catch (err) {
            console.error('Failed to load email suggestions:', err);
            setEmailSuggestions([]);
        } finally {
            setLoadingSuggestions(false);
        }
    }

    async function handleAssignEmail(emailId) {
        setAssigning(emailId);
        try {
            await assignEmailToThread(emailId, { thread_id: threadId });
            setEmailSuggestions(prev => prev.filter(e => e.id !== emailId));
            loadThread();
        } catch (err) {
            console.error('Failed to assign email:', err);
        } finally {
            setAssigning(null);
        }
    }

    async function handleRemoveEmail(emailId, e) {
        e.stopPropagation();
        setRemoving(emailId);
        try {
            await removeEmailFromThread(emailId);
            loadThread();
        } catch (err) {
            setError(err.message);
        } finally {
            setRemoving(null);
        }
    }

    async function handleDeleteThread() {
        setDeleting(true);
        try {
            await deleteThread(threadId);
            onBack(); // Return to thread list
        } catch (err) {
            setError(err.message);
            setDeleting(false);
        }
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleString([], {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
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
                <Typography color="text.secondary">Loading thread...</Typography>
            </Box>
        );
    }

    if (error) return <Alert severity="error">{error}</Alert>;
    if (!thread) return <Alert severity="warning">Thread not found</Alert>;

    const summary = thread.summary;

    return (
        <Box>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                <IconButton onClick={onBack} size="small">
                    <ArrowBackIcon />
                </IconButton>
                <Typography variant="h5" sx={{ flex: 1 }}>{thread.title}</Typography>
                <Button variant="outlined" size="small" startIcon={<AddIcon />}
                    onClick={handleOpenAddEmail} sx={{ mr: 1 }}>
                    Add Email
                </Button>
                <Tooltip title="Delete Thread">
                    <IconButton size="small" color="error"
                        onClick={() => setDeleteConfirmOpen(true)}>
                        <DeleteOutlineIcon />
                    </IconButton>
                </Tooltip>
                <Chip label={thread.category || 'other'} size="small"
                    sx={{ bgcolor: 'primary.main', color: '#fff', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.65rem', ml: 0.5 }} />
            </Box>

            {/* Summary Card */}
            {summary && (
                <Paper elevation={0} sx={{
                    p: 2.5, mb: 3, border: 1, borderColor: 'divider', borderRadius: 2,
                    background: 'linear-gradient(135deg, rgba(124,110,240,0.08), rgba(167,139,250,0.04))'
                }}>
                    <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <InfoIcon fontSize="small" color="primary" /> Summary
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 2, lineHeight: 1.6 }}>
                        {summary.tldr}
                    </Typography>

                    {/* Action Items */}
                    {summary.action_items && (
                        (() => {
                            const items = typeof summary.action_items === 'string' ? JSON.parse(summary.action_items) : summary.action_items;
                            return items.length > 0 ? (
                                <Box sx={{ mb: 2 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                                        <AssignmentIcon sx={{ fontSize: 14 }} /> Action Items
                                    </Typography>
                                    {items.map((item, i) => (
                                        <Typography key={i} variant="body2" color="text.secondary" sx={{ pl: 2, fontSize: '0.8rem' }}>
                                            • {item}
                                        </Typography>
                                    ))}
                                </Box>
                            ) : null;
                        })()
                    )}

                    {/* Key People */}
                    {summary.key_people && (
                        (() => {
                            const people = typeof summary.key_people === 'string' ? JSON.parse(summary.key_people) : summary.key_people;
                            return people.length > 0 ? (
                                <Box sx={{ mb: 1 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                                        <PeopleIcon sx={{ fontSize: 14 }} /> Key People
                                    </Typography>
                                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                        {people.map((p, i) => (
                                            <Chip key={i} label={typeof p === 'string' ? p : `${p.name}${p.role ? ` (${p.role})` : ''}`}
                                                size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                        ))}
                                    </Box>
                                </Box>
                            ) : null;
                        })()
                    )}

                    {summary.status && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                            <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main' }} />
                            <Typography variant="caption" color="text.secondary">{summary.status}</Typography>
                        </Box>
                    )}
                </Paper>
            )}

            {/* Email Timeline */}
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                Emails ({thread.emails?.length || 0})
            </Typography>
            <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', overflow: 'hidden' }}>
                {(thread.emails || []).map((email, index) => (
                    <Box key={email.id}>
                        {index > 0 && <Divider />}
                        <Box sx={{ py: 2, px: 2.5, '&:hover .remove-btn': { opacity: 1 } }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                    {extractName(email.from_email)}
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Typography variant="caption" color="text.secondary">
                                        {formatDate(email.received_at)}
                                    </Typography>
                                    <Tooltip title="Remove from thread">
                                        <IconButton
                                            className="remove-btn"
                                            size="small"
                                            sx={{ color: 'text.secondary', opacity: 0.3, transition: 'opacity 0.2s' }}
                                            onClick={(e) => handleRemoveEmail(email.id, e)}
                                            disabled={removing === email.id}
                                        >
                                            {removing === email.id
                                                ? <CircularProgress size={14} />
                                                : <RemoveCircleOutlineIcon fontSize="small" />}
                                        </IconButton>
                                    </Tooltip>
                                </Box>
                            </Box>
                            <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                                {email.subject || '(No Subject)'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{
                                display: '-webkit-box', WebkitLineClamp: 3,
                                WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                lineHeight: 1.5, fontSize: '0.8125rem',
                            }}>
                                {email.snippet}
                            </Typography>
                        </Box>
                    </Box>
                ))}
            </Paper>

            {/* Add Email Dialog */}
            <Dialog open={addEmailOpen} onClose={() => setAddEmailOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Add Email to Thread</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        AI-ranked emails most likely related to this thread.
                    </Typography>
                    {loadingSuggestions ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                            <CircularProgress size={24} />
                        </Box>
                    ) : emailSuggestions.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                            No candidate emails found.
                        </Typography>
                    ) : (
                        <List dense>
                            {emailSuggestions.map(email => (
                                <ListItemButton
                                    key={email.id}
                                    onClick={() => handleAssignEmail(email.id)}
                                    disabled={assigning !== null}
                                    sx={{ borderRadius: 1, mb: 0.5, border: 1, borderColor: 'divider' }}
                                >
                                    <ListItemText
                                        primary={
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Typography variant="body2" sx={{ fontWeight: 500, flex: 1 }}>
                                                    {email.subject || '(No Subject)'}
                                                </Typography>
                                                {email.current_thread_id && (
                                                    <Chip label={`In another thread`}
                                                        size="small" variant="outlined"
                                                        sx={{ fontSize: '0.6rem', height: 16 }} />
                                                )}
                                            </Box>
                                        }
                                        secondary={
                                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                                <Typography variant="caption">{email.from_email}</Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {formatDate(email.received_at)}
                                                </Typography>
                                            </Box>
                                        }
                                    />
                                    {assigning === email.id && <CircularProgress size={16} />}
                                </ListItemButton>
                            ))}
                        </List>
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
                <DialogTitle>Delete Thread?</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        This will delete the thread "{thread.title}" and unassign all {thread.emails?.length || 0} emails.
                        The emails themselves will not be deleted.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
                    <Button color="error" variant="contained" onClick={handleDeleteThread}
                        disabled={deleting}
                        startIcon={deleting ? <CircularProgress size={14} color="inherit" /> : <DeleteOutlineIcon />}>
                        {deleting ? 'Deleting...' : 'Delete Thread'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
