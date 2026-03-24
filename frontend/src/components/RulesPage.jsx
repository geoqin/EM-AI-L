import { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Alert, CircularProgress,
    List, ListItem, ListItemText, IconButton, Chip, Tooltip, Button, Divider,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField,
    FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SchoolIcon from '@mui/icons-material/School';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TipsAndUpdatesIcon from '@mui/icons-material/TipsAndUpdates';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import { getTriageRules, deleteTriageRule, approveRule, applyRulesToInbox, addRule, updateRule } from '../api/client';

const CATEGORY_COLORS = {
    regular: 'primary',
    junk: 'error',
    spam: 'error',
    for_review: 'warning',
    confirmed_junk: 'error',
};

const CATEGORY_OPTIONS = [
    { value: 'junk', label: 'Trash' },
    { value: 'spam', label: 'Spam' },
    { value: 'regular', label: 'Regular' },
    { value: 'for_review', label: 'For Review' },
];

const EMPTY_FORM = { sender_pattern: '', subject_pattern: '', category: 'junk', reason: '' };

export default function RulesPage() {
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [applying, setApplying] = useState(false);
    const [result, setResult] = useState(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingRule, setEditingRule] = useState(null); // null = adding new, object = editing
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    useEffect(() => { loadRules(); }, []);

    async function loadRules() {
        try {
            const rulesData = await getTriageRules();
            setRules(rulesData.rules);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function handleDeleteRule(ruleId) {
        try {
            await deleteTriageRule(ruleId);
            setRules(prev => prev.filter(r => r.id !== ruleId));
            setResult({ type: 'success', text: 'Rule deleted' });
            setTimeout(() => setResult(null), 3000);
        } catch (err) {
            console.error(err);
            setResult({ type: 'error', text: 'Failed to delete rule' });
        }
    }

    async function handleApproveRule(ruleId) {
        try {
            await approveRule(ruleId);
            setRules(prev => prev.map(r => r.id === ruleId ? { ...r, status: 'active' } : r));
            setResult({ type: 'success', text: 'Rule approved and activated' });
            setTimeout(() => setResult(null), 3000);
        } catch (err) {
            console.error(err);
            setResult({ type: 'error', text: 'Failed to approve rule' });
        }
    }

    async function handleApplyRule(ruleId = null) {
        try {
            setApplying(true);
            const data = await applyRulesToInbox(ruleId);
            setResult({ type: 'success', text: data.message });
            setTimeout(() => setResult(null), 4000);
        } catch (err) {
            console.error('Failed to apply rules:', err);
            setResult({ type: 'error', text: 'Failed to apply rules. Check console.' });
        } finally {
            setApplying(false);
        }
    }

    function openAddDialog() {
        setEditingRule(null);
        setForm(EMPTY_FORM);
        setDialogOpen(true);
    }

    function openEditDialog(rule) {
        setEditingRule(rule);
        setForm({
            sender_pattern: rule.sender_pattern || '',
            subject_pattern: rule.subject_pattern || '',
            category: rule.category || 'junk',
            reason: rule.reason || '',
        });
        setDialogOpen(true);
    }

    function closeDialog() {
        setDialogOpen(false);
        setEditingRule(null);
        setForm(EMPTY_FORM);
    }

    async function handleSaveRule() {
        if (!form.sender_pattern.trim()) return;
        try {
            setSaving(true);
            if (editingRule) {
                const data = await updateRule(editingRule.id, form);
                setRules(data.rules);
                setResult({ type: 'success', text: 'Rule updated' });
            } else {
                const data = await addRule(form);
                setRules(data.rules);
                setResult({ type: 'success', text: 'Rule created' });
            }
            setTimeout(() => setResult(null), 3000);
            closeDialog();
        } catch (err) {
            console.error(err);
            setResult({ type: 'error', text: `Failed to ${editingRule ? 'update' : 'create'} rule` });
        } finally {
            setSaving(false);
        }
    }

    const activeRules = rules.filter(r => r.status === 'active');
    const suggestedRules = rules.filter(r => r.status === 'suggested');

    if (loading) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 10, gap: 2 }}>
                <CircularProgress size={24} />
                <Typography color="text.secondary">Loading rules...</Typography>
            </Box>
        );
    }

    return (
        <Box data-tour="rules-content">
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <SchoolIcon sx={{ color: 'primary.main', fontSize: 28 }} />
                    <Typography variant="h5">Triage Rules</Typography>
                </Box>
                <Box data-tour="rules-add-area" sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="outlined" size="small" startIcon={<AddIcon />}
                        onClick={openAddDialog}>
                        Add Rule
                    </Button>
                    {activeRules.length > 0 && (
                        <Button variant="contained" size="small"
                            startIcon={applying ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
                            onClick={() => handleApplyRule(null)} disabled={applying}>
                            Apply All
                        </Button>
                    )}
                </Box>
            </Box>

            {result && <Alert severity={result.type} sx={{ mb: 3 }}>{result.text}</Alert>}

            {/* Suggested Rules */}
            {suggestedRules.length > 0 && (
                <Paper data-tour="rules-suggested" elevation={0} sx={{ p: 3, mb: 4, border: 2, borderColor: 'primary.main', borderStyle: 'dashed' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <TipsAndUpdatesIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                        <Typography variant="subtitle2">Suggested Rules</Typography>
                        <Chip label={suggestedRules.length} size="small" color="primary" sx={{ fontSize: '0.7rem', height: 20 }} />
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        The AI noticed patterns in your filtering actions and suggests these rules. Approve to activate, or dismiss if not useful.
                    </Typography>

                    <List dense disablePadding>
                        {suggestedRules.map((rule, index) => (
                            <Box key={rule.id}>
                                {index > 0 && <Divider />}
                                <ListItem sx={{ pr: 12 }}
                                    secondaryAction={
                                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                                            <Tooltip title="Approve rule">
                                                <IconButton edge="end" size="small" color="success"
                                                    onClick={() => handleApproveRule(rule.id)}>
                                                    <CheckCircleIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Edit">
                                                <IconButton edge="end" size="small" color="primary"
                                                    onClick={() => openEditDialog(rule)}>
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Dismiss">
                                                <IconButton edge="end" size="small"
                                                    onClick={() => handleDeleteRule(rule.id)}>
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    }
                                >
                                    <ListItemText
                                        primary={
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                    {rule.sender_pattern}
                                                </Typography>
                                                <Chip label={rule.category} size="small"
                                                    color={CATEGORY_COLORS[rule.category] || 'default'}
                                                    sx={{ fontSize: '0.65rem', height: 18 }} />
                                            </Box>
                                        }
                                        secondary={rule.reason}
                                    />
                                </ListItem>
                            </Box>
                        ))}
                    </List>
                </Paper>
            )}

            {/* Active Rules */}
            <Paper data-tour="rules-active" elevation={0} sx={{ p: 3, border: 1, borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <SchoolIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                    <Typography variant="subtitle2">Active Rules</Typography>
                    <Chip label={activeRules.length} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Active rules are used by the AI to classify future emails. Apply them manually to existing emails if needed.
                </Typography>

                {activeRules.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                        No active rules yet. Use "Add Rule" above, "Teach AI" from the Inbox, or approve suggested rules.
                    </Typography>
                ) : (
                    <List dense disablePadding>
                        {activeRules.map((rule, index) => (
                            <Box key={rule.id}>
                                {index > 0 && <Divider />}
                                <ListItem
                                    secondaryAction={
                                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                                            <Tooltip title="Edit rule">
                                                <IconButton edge="end" size="small" color="primary"
                                                    onClick={() => openEditDialog(rule)}>
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Apply rule to inbox">
                                                <IconButton edge="end" size="small" color="primary" onClick={() => handleApplyRule(rule.id)} disabled={applying}>
                                                    <PlayArrowIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Delete rule">
                                                <IconButton edge="end" size="small" onClick={() => handleDeleteRule(rule.id)} disabled={applying}>
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    }
                                >
                                    <ListItemText
                                        primary={
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                    {rule.sender_pattern}
                                                </Typography>
                                                <Chip label={rule.category} size="small"
                                                    color={CATEGORY_COLORS[rule.category] || 'default'}
                                                    sx={{ fontSize: '0.65rem', height: 18 }} />
                                            </Box>
                                        }
                                        secondary={
                                            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                                <Typography variant="caption" color="text.secondary">{rule.reason}</Typography>
                                                {rule.subject_pattern && (
                                                    <Typography variant="caption" color="primary.light">
                                                        Subject Match: {rule.subject_pattern}
                                                    </Typography>
                                                )}
                                            </Box>
                                        }
                                    />
                                </ListItem>
                            </Box>
                        ))}
                    </List>
                )}
            </Paper>

            {/* Add/Edit Rule Dialog */}
            <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
                <DialogTitle>{editingRule ? 'Edit Rule' : 'Add New Rule'}</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
                        <TextField
                            label="Sender Pattern"
                            placeholder="e.g. aliexpress.com or newsletter@company.com"
                            value={form.sender_pattern}
                            onChange={(e) => setForm(f => ({ ...f, sender_pattern: e.target.value }))}
                            fullWidth required size="small"
                            helperText="Matches emails from this domain or address"
                        />
                        <TextField
                            label="Subject Pattern (optional)"
                            placeholder="e.g. sale, promo, unsubscribe"
                            value={form.subject_pattern}
                            onChange={(e) => setForm(f => ({ ...f, subject_pattern: e.target.value }))}
                            fullWidth size="small"
                            helperText="Only match if subject also contains this text"
                        />
                        <FormControl fullWidth size="small">
                            <InputLabel>Category</InputLabel>
                            <Select
                                value={form.category}
                                label="Category"
                                onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                            >
                                {CATEGORY_OPTIONS.map(opt => (
                                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField
                            label="Reason / Description"
                            placeholder="Why should this rule exist?"
                            value={form.reason}
                            onChange={(e) => setForm(f => ({ ...f, reason: e.target.value }))}
                            fullWidth size="small" multiline rows={2}
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeDialog}>Cancel</Button>
                    <Button variant="contained" onClick={handleSaveRule}
                        disabled={saving || !form.sender_pattern.trim()}
                        startIcon={saving ? <CircularProgress size={14} color="inherit" /> : null}>
                        {saving ? 'Saving...' : editingRule ? 'Save Changes' : 'Add Rule'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
