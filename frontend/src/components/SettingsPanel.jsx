import { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Alert, CircularProgress,
    Switch, FormControlLabel, Divider,
    Button, Avatar, ToggleButton, ToggleButtonGroup, TextField,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import PersonIcon from '@mui/icons-material/Person';
import LogoutIcon from '@mui/icons-material/Logout';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import LinkIcon from '@mui/icons-material/Link';
import EmailIcon from '@mui/icons-material/Email';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SchoolIcon from '@mui/icons-material/School';
import SyncIcon from '@mui/icons-material/Sync';
import TokenIcon from '@mui/icons-material/Token';
import { getSettings, updateSettings, getLoginUrl, getOutlookLoginUrl, disconnectOutlook, disconnectGoogle } from '../api/client';
import { useThemeMode } from '../ThemeContext';

// Approximate cost per AI call (Gemini API pricing, mid-2025)
// These are rough estimates — actual costs vary with token count and model version.
const COST_PER_TIER = {
    lite: 0.001,   // ~$0.001 per triage/assignment call (Flash)
    mid: 0.005,    // ~$0.005 per chat/memory call (Flash/Pro mix)
    pro: 0.015,    // ~$0.015 per summary/draft call (Pro)
};

export default function SettingsPage({ userEmail, userName, onUserNameChange, onLogout, googleAuthenticated, outlookAuthenticated, outlookEmail, onOutlookChange, onGoogleChange, onReplayTutorial, credits }) {
    const { mode, toggleTheme } = useThemeMode();
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState(null);
    const [nameInput, setNameInput] = useState(userName || '');
    const [savingName, setSavingName] = useState(false);

    useEffect(() => { loadAll(); }, []);

    async function loadAll() {
        try {
            const data = await getSettings();
            setSettings(data.settings);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function handleChange(key, value) {
        if (value === null) return;
        try {
            setSaving(true);
            const data = await updateSettings({ [key]: value });
            setSettings(data.settings);
            setResult('Settings saved');
            setTimeout(() => setResult(null), 2000);
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    }

    async function handleSaveName() {
        if (!nameInput.trim()) return;
        setSavingName(true);
        try {
            await updateSettings({ display_name: nameInput.trim() });
            onUserNameChange?.(nameInput.trim());
            setResult('Display name updated');
            setTimeout(() => setResult(null), 2000);
        } catch (err) {
            console.error(err);
        } finally {
            setSavingName(false);
        }
    }

    // Estimate dollar cost from per-tier call counts
    function estimateDollarCost(c) {
        if (!c) return 0;
        return (c.lite_calls || 0) * COST_PER_TIER.lite
             + (c.mid_calls || 0) * COST_PER_TIER.mid
             + (c.pro_calls || 0) * COST_PER_TIER.pro;
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 10, gap: 2 }}>
                <CircularProgress size={24} />
                <Typography color="text.secondary">Loading settings...</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ maxWidth: 600, mx: 'auto' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 4 }}>
                <SettingsIcon sx={{ color: 'primary.main', fontSize: 32 }} />
                <Typography variant="h4">Account & Settings</Typography>
            </Box>

            {result && <Alert severity="success" sx={{ mb: 3 }}>{result}</Alert>}

            {/* Account Preferences */}
            <Typography variant="h6" sx={{ mb: 2 }}>Account Preferences</Typography>
            <Paper data-tour="settings-account" elevation={0} sx={{ p: 3, mb: 4, border: 1, borderColor: 'divider', borderRadius: 2 }}>

                {/* Auth Details & Sign Out */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Avatar sx={{ bgcolor: 'primary.light', width: 48, height: 48 }}>
                            <PersonIcon />
                        </Avatar>
                        <Box>
                            <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                {userName || userEmail || 'Signed in'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {[googleAuthenticated && 'Google', outlookAuthenticated && 'Outlook'].filter(Boolean).join(' + ') || 'Connected'}
                            </Typography>
                        </Box>
                    </Box>
                    <Button variant="outlined" color="error" startIcon={<LogoutIcon />} onClick={onLogout}>
                        Sign Out
                    </Button>
                </Box>

                <Divider sx={{ my: 3 }} />

                {/* Display Name */}
                <Box sx={{ mb: 3 }}>
                    <Typography variant="body1" sx={{ fontWeight: 500, mb: 0.5 }}>Display Name</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                        This name appears in the header. If you have multiple accounts you can give each a distinct name.
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <TextField
                            size="small"
                            fullWidth
                            placeholder="Enter your display name"
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                        />
                        <Button variant="contained" size="small" onClick={handleSaveName}
                            disabled={savingName || !nameInput.trim() || nameInput.trim() === userName}
                            sx={{ flexShrink: 0 }}>
                            {savingName ? 'Saving...' : 'Save'}
                        </Button>
                    </Box>
                </Box>

                <Divider sx={{ my: 3 }} />

                {/* Theme Toggle */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        {mode === 'dark' ? <DarkModeIcon color="action" /> : <LightModeIcon color="action" />}
                        <Box>
                            <Typography variant="body1">{mode === 'dark' ? 'Dark Mode' : 'Light Mode'}</Typography>
                            <Typography variant="caption" color="text.secondary">
                                {mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                            </Typography>
                        </Box>
                    </Box>
                    <Switch checked={mode === 'dark'} onChange={toggleTheme} />
                </Box>

                {/* Replay Tutorial */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <SchoolIcon color="action" />
                        <Box>
                            <Typography variant="body1">App Tutorial</Typography>
                            <Typography variant="caption" color="text.secondary">
                                Replay the onboarding walkthrough
                            </Typography>
                        </Box>
                    </Box>
                    <Button variant="outlined" size="small" onClick={onReplayTutorial}>
                        Replay Tour
                    </Button>
                </Box>

                {/* Linked Accounts (Stub) */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <LinkIcon color="action" />
                        <Box>
                            <Typography variant="body1">Linked Accounts</Typography>
                            <Typography variant="caption" color="text.secondary">Add secondary email addresses (Coming soon)</Typography>
                        </Box>
                    </Box>
                    <Button variant="text" disabled>Manage</Button>
                </Box>
            </Paper>

            {/* Email Providers */}
            <Typography variant="h6" sx={{ mb: 2 }}>Email Providers</Typography>
            <Paper data-tour="settings-providers" elevation={0} sx={{ p: 3, mb: 4, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Connect your email accounts. The AI assistant will monitor and triage emails from all connected providers.
                </Typography>

                {/* Gmail */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <EmailIcon sx={{ color: '#EA4335' }} />
                        <Box>
                            <Typography variant="body1" sx={{ fontWeight: 500 }}>Gmail</Typography>
                            {googleAuthenticated ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main' }} />
                                    <Typography variant="caption" color="success.main">
                                        Connected {userEmail ? `— ${userEmail}` : ''}
                                    </Typography>
                                </Box>
                            ) : (
                                <Typography variant="caption" color="text.secondary">Not connected</Typography>
                            )}
                        </Box>
                    </Box>
                    {googleAuthenticated ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                                <Typography variant="caption" color="text.secondary">Account Type</Typography>
                                <ToggleButtonGroup
                                    color="primary"
                                    value={settings?.gmail_account_type || settings?.account_type || 'personal'}
                                    exclusive
                                    size="small"
                                    onChange={(e, newType) => handleChange('gmail_account_type', newType)}
                                >
                                    <ToggleButton value="personal">Personal</ToggleButton>
                                    <ToggleButton value="work">Work</ToggleButton>
                                </ToggleButtonGroup>
                            </Box>
                            {/* Only show disconnect if Outlook is also connected (need at least one provider) */}
                            {outlookAuthenticated && (
                                <Button
                                    variant="outlined"
                                    size="small"
                                    color="error"
                                    onClick={async () => {
                                        try {
                                            await disconnectGoogle();
                                            onGoogleChange?.();
                                        } catch (err) {
                                            console.error('Failed to disconnect Google:', err);
                                        }
                                    }}
                                >
                                    Disconnect
                                </Button>
                            )}
                        </Box>
                    ) : (
                        <Button
                            variant="outlined"
                            size="small"
                            onClick={() => { window.location.href = getLoginUrl(); }}
                            sx={{ borderColor: '#EA4335', color: '#EA4335' }}
                        >
                            Connect
                        </Button>
                    )}
                </Box>

                <Divider sx={{ my: 2 }} />

                {/* Outlook */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <EmailIcon sx={{ color: '#0078D4' }} />
                        <Box>
                            <Typography variant="body1" sx={{ fontWeight: 500 }}>Outlook</Typography>
                            {outlookAuthenticated ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main' }} />
                                    <Typography variant="caption" color="success.main">
                                        Connected {outlookEmail ? `— ${outlookEmail}` : ''}
                                    </Typography>
                                </Box>
                            ) : (
                                <Typography variant="caption" color="text.secondary">Not connected</Typography>
                            )}
                        </Box>
                    </Box>
                    {outlookAuthenticated ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                                <Typography variant="caption" color="text.secondary">Account Type</Typography>
                                <ToggleButtonGroup
                                    color="primary"
                                    value={settings?.outlook_account_type || 'personal'}
                                    exclusive
                                    size="small"
                                    onChange={(e, newType) => handleChange('outlook_account_type', newType)}
                                >
                                    <ToggleButton value="personal">Personal</ToggleButton>
                                    <ToggleButton value="work">Work</ToggleButton>
                                </ToggleButtonGroup>
                            </Box>
                            {/* Only show disconnect if Google is also connected (need at least one provider) */}
                            {googleAuthenticated && (
                                <Button
                                    variant="outlined"
                                    size="small"
                                    color="error"
                                    onClick={async () => {
                                        try {
                                            await disconnectOutlook();
                                            onOutlookChange?.();
                                        } catch (err) {
                                            console.error('Failed to disconnect Outlook:', err);
                                        }
                                    }}
                                >
                                    Disconnect
                                </Button>
                            )}
                        </Box>
                    ) : (
                        <Button
                            variant="outlined"
                            size="small"
                            onClick={() => { window.location.href = getOutlookLoginUrl(); }}
                            sx={{ borderColor: '#0078D4', color: '#0078D4' }}
                        >
                            Connect
                        </Button>
                    )}
                </Box>
            </Paper>

            {/* Usage & Credits */}
            {credits && (
                <>
                    <Typography variant="h6" sx={{ mb: 2 }}>AI Usage This Month</Typography>
                    <Paper data-tour="settings-credits" elevation={0} sx={{ p: 3, mb: 4, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
                            <TokenIcon sx={{ color: 'primary.main' }} />
                            <Box>
                                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                    {credits.credits_used} credits used
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Resets on the 1st of each month
                                </Typography>
                            </Box>
                            <Box sx={{ ml: 'auto', textAlign: 'right' }}>
                                <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>
                                    ~${estimateDollarCost(credits).toFixed(3)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    est. API cost
                                </Typography>
                            </Box>
                        </Box>

                        {/* Per-tier breakdown */}
                        <Box sx={{
                            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5, mb: 2.5,
                        }}>
                            {[
                                { label: 'Lite', calls: credits.lite_calls || 0, cost: 1, examples: 'Triage, rules, scoring' },
                                { label: 'Mid', calls: credits.mid_calls || 0, cost: 3, examples: 'Chat, memory, briefing' },
                                { label: 'Pro', calls: credits.pro_calls || 0, cost: 5, examples: 'Summaries, drafts' },
                            ].map(t => (
                                <Paper key={t.label} elevation={0} sx={{
                                    p: 1.5, textAlign: 'center',
                                    bgcolor: 'action.hover', borderRadius: 1.5,
                                }}>
                                    <Typography variant="h6" sx={{ fontWeight: 700 }}>{t.calls}</Typography>
                                    <Typography variant="caption" sx={{ fontWeight: 600 }}>{t.label} calls</Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.65rem' }}>
                                        {t.cost} credit each
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.6rem', mt: 0.5 }}>
                                        {t.examples}
                                    </Typography>
                                </Paper>
                            ))}
                        </Box>

                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.6 }}>
                            Dollar estimates are approximate, based on Gemini API list pricing.
                            If you're using Google AI Studio's free tier, your actual cost may be $0.
                        </Typography>
                    </Paper>
                </>
            )}

        </Box>
    );
}
