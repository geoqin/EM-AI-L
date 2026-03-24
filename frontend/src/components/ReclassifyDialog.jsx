import { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Box, Typography, Paper, CircularProgress, Alert, Chip, Divider,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import { generateRule, overrideTriage } from '../api/client';

const CATEGORIES = [
    { value: 'regular', label: '✅ Regular', desc: 'Normal email, keep in inbox', color: 'success' },
    { value: 'junk', label: '🗑️ Trash', desc: 'Move to trash', color: 'error' },
    { value: 'for_review', label: '🟡 For Review', desc: 'Needs a second look before trashing', color: 'warning' },
];

/**
 * "Teach AI" dialog — user explains WHY an email belongs in a category,
 * AI generates a rule, user approves before it's saved.
 * This is separate from reclassification (which is instant, no dialog).
 */
export default function TeachAIDialog({ open, email, onClose, onComplete }) {
    const [reasoning, setReasoning] = useState('');
    const [proposedRules, setProposedRules] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [step, setStep] = useState('input'); // input | preview | done

    if (!email) return null;

    const currentCategory = email.triage_category || 'unprocessed';

    function handleClose() {
        setReasoning('');
        setProposedRules([]);
        setLoading(false);
        setSaving(false);
        setError(null);
        setStep('input');
        onClose();
    }

    async function handleGenerate() {
        if (!reasoning.trim()) return;
        setError(null);

        try {
            setLoading(true);
            const data = await generateRule(email.id, currentCategory, reasoning);
            setProposedRules(data.rules || []);
            setStep('preview');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleApproveRule() {
        try {
            setSaving(true);
            setError(null);

            // The new rule will define the target category (often it's the rule without an ID)
            const newRule = proposedRules.find(r => !r.id) || proposedRules[0];
            const ruleCategory = newRule?.category || currentCategory;

            const res = await fetch(`http://localhost:3001/api/threads/emails/${email.id}/triage`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: ruleCategory, rules: proposedRules }),
            });
            if (!res.ok) throw new Error('Failed to save rules');
            setStep('done');
            setTimeout(() => {
                handleClose();
                onComplete?.();
            }, 1200);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
                <AutoAwesomeIcon color="primary" />
                Teach AI — Add a Rule
            </DialogTitle>

            <DialogContent>
                {/* Email context */}
                <Paper elevation={0} sx={{ p: 2, mb: 2.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{email.from_email}</Typography>
                    <Typography variant="body2">{email.subject || '(No Subject)'}</Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
                        <Typography variant="caption" color="text.secondary">Classification:</Typography>
                        <Chip label={currentCategory} size="small"
                            color={CATEGORIES.find(c => c.value === currentCategory)?.color || 'default'}
                            sx={{ fontSize: '0.65rem', height: 18 }} />
                    </Box>
                </Paper>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {step === 'input' && (
                    <>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Explain why this email (or similar ones) should be classified this way.
                            The AI will create a reusable rule from your reasoning.
                        </Typography>
                        <TextField
                            fullWidth multiline rows={3} autoFocus
                            label="Your reasoning"
                            placeholder="e.g. 'AliExpress promotional emails that aren't about my orders should be junk, but shipping updates are important'"
                            value={reasoning}
                            onChange={(e) => setReasoning(e.target.value)}
                        />
                    </>
                )}

                {step === 'preview' && proposedRules.length > 0 && (
                    <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <AutoAwesomeIcon sx={{ fontSize: 16 }} /> Proposed Rules
                        </Typography>

                        {proposedRules.map((rule, idx) => (
                            <Paper key={idx} elevation={0} sx={{
                                p: 2, mb: 2, border: 1, borderColor: 'primary.main', borderRadius: 1,
                                background: 'linear-gradient(135deg, rgba(124,110,240,0.06), rgba(167,139,250,0.03))'
                            }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                    {rule.id ? (
                                        <Chip label="Updated Existing Rule" size="small" color="secondary" sx={{ fontSize: '0.6rem', height: 18 }} />
                                    ) : (
                                        <Chip label="New Rule" size="small" color="primary" sx={{ fontSize: '0.6rem', height: 18 }} />
                                    )}
                                </Box>

                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                        {rule.sender_pattern}
                                    </Typography>
                                    <Chip label={rule.category} size="small"
                                        color={CATEGORIES.find(c => c.value === rule.category)?.color || 'default'}
                                        sx={{ fontSize: '0.65rem', height: 18 }} />
                                </Box>

                                {rule.subject_pattern && (
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                        Subject pattern: "{rule.subject_pattern}"
                                    </Typography>
                                )}

                                <Typography variant="body2" sx={{ mb: 1.5 }}>
                                    {rule.reason}
                                </Typography>

                                <Divider sx={{ my: 1.5 }} />

                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                    {rule.explanation}
                                </Typography>
                            </Paper>
                        ))}
                    </Box>
                )}

                {step === 'done' && (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                        <CheckCircleIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
                        <Typography variant="h6" color="success.main">Rule saved!</Typography>
                        <Typography variant="body2" color="text.secondary">
                            The AI will use this rule for future triage.
                        </Typography>
                    </Box>
                )}
            </DialogContent>

            {step === 'input' && (
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={handleClose} color="inherit">Cancel</Button>
                    <Button variant="contained" onClick={handleGenerate}
                        disabled={!reasoning.trim() || loading}
                        startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />}
                        sx={{
                            background: 'linear-gradient(135deg, #7c6ef0, #a78bfa)',
                            '&:hover': { background: 'linear-gradient(135deg, #6b5ce0, #9577f0)' }
                        }}>
                        {loading ? 'Thinking...' : 'Generate Rule'}
                    </Button>
                </DialogActions>
            )}

            {step === 'preview' && (
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => { setStep('input'); setProposedRules([]); }} color="inherit">
                        Back
                    </Button>
                    <Button variant="contained" color="success" onClick={handleApproveRule}
                        disabled={saving}
                        startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <CheckCircleIcon />}>
                        {saving ? 'Saving...' : 'Approve Rule'}
                    </Button>
                </DialogActions>
            )}
        </Dialog>
    );
}
