import { useState, useEffect, useRef } from 'react';
import {
    Popper, Paper, List, ListItemButton, ListItemText, ListItemIcon,
    Typography, CircularProgress, Box, Chip, Divider, ClickAwayListener, Fade,
} from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AddIcon from '@mui/icons-material/Add';
import { getThreadSuggestions, assignEmailToThread } from '../api/client';

/**
 * ThreadPicker — a dropdown that appears attached to an anchor element.
 * Shows AI-ranked thread suggestions for an email.
 */
export default function ThreadPicker({ emailId, anchorEl, open, onClose, onAssigned }) {
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [assigning, setAssigning] = useState(null);

    useEffect(() => {
        if (open && emailId) fetchSuggestions();
    }, [open, emailId]);

    async function fetchSuggestions() {
        setLoading(true);
        try {
            const data = await getThreadSuggestions(emailId);
            setSuggestions(data.suggestions || []);
        } catch (err) {
            console.error('Failed to load thread suggestions:', err);
            setSuggestions([]);
        } finally {
            setLoading(false);
        }
    }

    async function handleSelect(suggestion) {
        setAssigning(suggestion.thread_id || 'new');
        try {
            if (suggestion.type === 'existing') {
                await assignEmailToThread(emailId, { thread_id: suggestion.thread_id });
            } else {
                await assignEmailToThread(emailId, {
                    new_thread_title: suggestion.title,
                    new_thread_category: suggestion.category,
                });
            }
            onAssigned?.();
            onClose();
        } catch (err) {
            console.error('Failed to assign thread:', err);
        } finally {
            setAssigning(null);
        }
    }

    const CATEGORY_COLORS = {
        work: '#5b8def', personal: '#8b5cf6', finance: '#10b981',
        shopping: '#f59e0b', social: '#ec4899', other: '#6b7280',
    };

    return (
        <Popper open={open} anchorEl={anchorEl} placement="bottom-end" transition style={{ zIndex: 1400 }}>
            {({ TransitionProps }) => (
                <Fade {...TransitionProps} timeout={200}>
                    <div>
                        <ClickAwayListener onClickAway={onClose}>
                            <Paper elevation={8} sx={{
                                width: 300, maxHeight: 320, overflow: 'auto',
                                border: 1, borderColor: 'divider', borderRadius: 2,
                            }}>
                                <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                        Assign to Thread
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        AI-ranked suggestions
                                    </Typography>
                                </Box>

                                {loading ? (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                        <CircularProgress size={24} />
                                    </Box>
                                ) : (
                                    <List dense sx={{ py: 0.5 }}>
                                        {suggestions.map((s, idx) => (
                                            <Box key={s.thread_id || `new-${idx}`}>
                                                {s.type === 'new' && suggestions.length > 1 && (
                                                    <Divider sx={{ my: 0.5 }} />
                                                )}
                                                <ListItemButton
                                                    onClick={() => handleSelect(s)}
                                                    disabled={assigning !== null}
                                                    sx={{ px: 2, py: 1, gap: 1 }}
                                                >
                                                    <ListItemIcon sx={{ minWidth: 28 }}>
                                                        {s.type === 'new' ? (
                                                            <AddIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                                                        ) : (
                                                            <AccountTreeIcon sx={{ fontSize: 18, color: CATEGORY_COLORS[s.category] || '#6b7280' }} />
                                                        )}
                                                    </ListItemIcon>
                                                    <ListItemText
                                                        primary={
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                <Typography variant="body2" sx={{
                                                                    fontWeight: 500, overflow: 'hidden',
                                                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                                                                }}>
                                                                    {s.type === 'new' ? `Create: "${s.title}"` : s.title}
                                                                </Typography>
                                                            </Box>
                                                        }
                                                        secondary={
                                                            <Chip
                                                                label={s.category}
                                                                size="small"
                                                                sx={{
                                                                    fontSize: '0.6rem', height: 16, mt: 0.25,
                                                                    bgcolor: CATEGORY_COLORS[s.category] || '#6b7280',
                                                                    color: '#fff',
                                                                }}
                                                            />
                                                        }
                                                    />
                                                    {assigning === (s.thread_id || 'new') && (
                                                        <CircularProgress size={16} />
                                                    )}
                                                </ListItemButton>
                                            </Box>
                                        ))}
                                    </List>
                                )}
                            </Paper>
                        </ClickAwayListener>
                    </div>
                </Fade>
            )}
        </Popper>
    );
}
