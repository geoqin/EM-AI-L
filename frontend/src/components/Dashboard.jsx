import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AppBar, Toolbar, Typography, Box, Container, CircularProgress,
    Tabs, Tab, IconButton, Tooltip, Chip,
} from '@mui/material';
import AppBrand from './AppBrand';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DeleteIcon from '@mui/icons-material/Delete';
import InboxIcon from '@mui/icons-material/Inbox';
import SettingsIcon from '@mui/icons-material/Settings';
import SchoolIcon from '@mui/icons-material/School';
import { checkAuthStatus } from '../api/client';
import EmailList from './EmailList';
import ThreadList from './ThreadList';
import ThreadDetail from './ThreadDetail';
import JunkList from './TriageList';
import SettingsPage from './SettingsPanel';
import RulesPage from './RulesPage';
import SmartBar from './SmartBar';
import OnboardingTutorial, { isOnboardingComplete, resetOnboarding } from './OnboardingTutorial';

export default function Dashboard() {
    const navigate = useNavigate();
    const [authenticated, setAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState(0);
    const [selectedThread, setSelectedThread] = useState(null);
    const [userEmail, setUserEmail] = useState(null);
    const [userName, setUserName] = useState(null);
    const [googleAuthenticated, setGoogleAuthenticated] = useState(false);
    const [outlookAuthenticated, setOutlookAuthenticated] = useState(false);
    const [outlookEmail, setOutlookEmail] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showTutorial, setShowTutorial] = useState(false);
    const [credits, setCredits] = useState(null);
    const tutorialEventRef = useRef(null);

    const fireTutorialEvent = useCallback((eventName) => {
        if (tutorialEventRef.current) {
            tutorialEventRef.current(eventName);
        }
    }, []);

    useEffect(() => {
        checkAuth();
    }, []);

    async function checkAuth() {
        try {
            const status = await checkAuthStatus();
            setAuthenticated(status.authenticated);
            if (status.email) setUserEmail(status.email);
            if (status.name) setUserName(status.name);
            if (status.credits) setCredits(status.credits);
            setGoogleAuthenticated(!!status.googleAuthenticated);
            setOutlookAuthenticated(!!status.outlookAuthenticated);
            if (status.outlookEmail) setOutlookEmail(status.outlookEmail);

            if (!status.authenticated) {
                navigate('/');
            } else {
                // Show tutorial for new users
                if (!isOnboardingComplete()) {
                    // Small delay to let the dashboard render first
                    setTimeout(() => setShowTutorial(true), 600);
                }
            }
        } catch (err) {
            console.error('Auth check failed:', err);
            setAuthenticated(false);
            navigate('/');
        } finally {
            setLoading(false);
        }
    }

    async function handleLogout() {
        try {
            await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/auth/logout`, { method: 'POST', credentials: 'include' });
        } catch { /* ignore */ }
        setAuthenticated(false);
        setGoogleAuthenticated(false);
        setOutlookAuthenticated(false);
        setUserEmail(null);
        setUserName(null);
        setOutlookEmail(null);
        navigate('/');
    }

    function handleTabChange(_, v) {
        setTab(v);
        setSelectedThread(null);
        setSearchQuery('');
        // Fire tutorial events for tab navigation
        const tabEvents = { 1: 'tab-threads', 2: 'tab-trash', 3: 'tab-rules' };
        if (tabEvents[v]) fireTutorialEvent(tabEvents[v]);
    }

    function handleReplayTutorial() {
        resetOnboarding();
        setTab(0);
        setSelectedThread(null);
        setSearchQuery('');
        // Small delay to switch to inbox first
        setTimeout(() => setShowTutorial(true), 300);
    }

    if (loading) {
        return (
            <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <CircularProgress size={24} />
                <Typography color="text.secondary">Starting up...</Typography>
            </Box>
        );
    }

    if (!authenticated) return null;

    function renderContent() {
        if (selectedThread) {
            return <ThreadDetail threadId={selectedThread} onBack={() => setSelectedThread(null)} />;
        }

        switch (tab) {
            case 0:
                return <EmailList searchQuery={searchQuery} onTutorialEvent={fireTutorialEvent} />;
            case 1:
                return <ThreadList onSelectThread={setSelectedThread} searchQuery={searchQuery} />;
            case 2:
                return <JunkList searchQuery={searchQuery} />;
            case 3:
                return <RulesPage />;
            case 4:
                return <SettingsPage userEmail={userEmail} userName={userName} onUserNameChange={setUserName}
                    googleAuthenticated={googleAuthenticated}
                    outlookAuthenticated={outlookAuthenticated} outlookEmail={outlookEmail}
                    onOutlookChange={() => checkAuth()}
                    onGoogleChange={() => checkAuth()}
                    onLogout={handleLogout}
                    onReplayTutorial={handleReplayTutorial}
                    credits={credits} />;
            default:
                return null;
        }
    }

    const showSmartBar = tab < 3 && !selectedThread;

    return (
        <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <AppBar position="sticky" elevation={0}
                sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
                <Toolbar sx={{ justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AppBrand fontSize="1.25rem" onClick={() => { setTab(0); setSelectedThread(null); setSearchQuery(''); }} />
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        {credits && (
                            <Tooltip title={`${credits.credits_used} credits used this month`}>
                                <Chip
                                    size="small"
                                    label={`${credits.credits_used} credits`}
                                    sx={{
                                        fontSize: '0.7rem', height: 22,
                                        bgcolor: 'primary.main',
                                        color: '#fff',
                                        fontWeight: 700,
                                    }}
                                />
                            </Tooltip>
                        )}
                        {(userName || userEmail) && (
                            <Tooltip title={userEmail || ''}>
                                <Typography variant="caption" color="text.secondary" sx={{
                                    maxWidth: { xs: 80, sm: 200 }, overflow: 'hidden',
                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    cursor: userEmail ? 'help' : 'default',
                                }}>
                                    {userName ? `Logged in as ${userName}` : userEmail}
                                </Typography>
                            </Tooltip>
                        )}

                        <Tooltip title="Settings">
                            <IconButton
                                data-tour="settings-button"
                                onClick={() => { setTab(4); setSelectedThread(null); setSearchQuery(''); fireTutorialEvent('tab-settings'); }}
                                sx={{
                                    color: tab === 4 ? 'primary.main' : 'text.secondary',
                                    bgcolor: tab === 4 ? 'action.selected' : 'transparent'
                                }}
                            >
                                <SettingsIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Toolbar>

                <Container maxWidth="md" disableGutters>
                    {showSmartBar && (
                        <Box sx={{ px: 2, pb: 1 }}>
                            <SmartBar key={tab} searchQuery={searchQuery} onSearchChange={setSearchQuery} onTutorialEvent={fireTutorialEvent} />
                        </Box>
                    )}

                    {tab !== 4 && (
                        <Tabs value={selectedThread ? false : tab}
                            onChange={handleTabChange}
                            data-tour="tab-bar"
                            sx={{
                                px: 2, minHeight: 40,
                                '& .MuiTab-root': { minHeight: 40, py: 0.5, fontSize: '0.8rem' },
                            }}
                            variant="scrollable"
                            scrollButtons="auto"
                        >
                            <Tab icon={<InboxIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Inbox" />
                            <Tab data-tour="threads-tab" icon={<AutoAwesomeIcon sx={{ fontSize: 18 }} />} iconPosition="start" label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>Threads<Chip label="Beta" size="small" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700, bgcolor: '#ef4444', color: '#fff' }} /></Box>} />
                            <Tab data-tour="trash-tab" icon={<DeleteIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Trash" />
                            <Tab data-tour="rules-tab" icon={<SchoolIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Rules" />
                        </Tabs>
                    )}
                </Container>
            </AppBar>

            <Container maxWidth="md" sx={{ flex: 1, py: 3 }}>
                {renderContent()}
            </Container>

            {/* Onboarding tutorial overlay */}
            <OnboardingTutorial
                active={showTutorial}
                onComplete={() => setShowTutorial(false)}
                onEvent={tutorialEventRef}
            />
        </Box>
    );
}
