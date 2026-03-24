import { useState, useRef, useEffect } from 'react';
import {
    Box, Typography, TextField, IconButton, Paper, Chip, Button,
    Fab, Badge, Slide, Divider, CircularProgress, Alert,
} from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import CloseIcon from '@mui/icons-material/Close';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import SendIcon from '@mui/icons-material/Send';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditIcon from '@mui/icons-material/Edit';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import EmailIcon from '@mui/icons-material/Email';
import { getChatBriefing, sendChatMessage, sendDraft, generateDraft } from '../api/client';

const URGENCY_COLORS = { high: 'error', medium: 'warning', low: 'info', none: 'default' };

export default function ChatWidget() {
    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [emailContext, setEmailContext] = useState(null); // currently focused email
    const [emailMap, setEmailMap] = useState({}); // id -> email data
    const [pendingDraft, setPendingDraft] = useState(null);
    const [editingDraft, setEditingDraft] = useState(null);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    function addMessage(msg) {
        setMessages(prev => [...prev, { ...msg, timestamp: Date.now() }]);
    }

    async function handleBriefing() {
        setLoading(true);
        addMessage({ type: 'system', content: 'Scanning your inbox...' });
        try {
            const data = await getChatBriefing();
            const { briefing, emails } = data;

            // Build email map
            const map = {};
            emails.forEach(e => { map[e.id] = e; });
            setEmailMap(prev => ({ ...prev, ...map }));

            if (briefing.message) {
                // No new emails
                addMessage({ type: 'assistant', content: briefing.message });
            } else {
                // Got briefing data
                addMessage({ type: 'briefing', content: briefing });

                // If there are emails needing reply, focus on the first one
                const needsReply = (briefing.emails || []).find(e => e.needs_reply);
                if (needsReply && map[needsReply.id]) {
                    setEmailContext(map[needsReply.id]);
                    addMessage({
                        type: 'question',
                        emailId: needsReply.id,
                        content: `**${needsReply.from_name}** needs a reply.\n${needsReply.questions?.length ? needsReply.questions.map(q => `• ${q}`).join('\n') : 'What would you like to say?'}`,
                    });
                }
            }
        } catch (err) {
            addMessage({ type: 'error', content: `Failed to get briefing: ${err.message}` });
        } finally {
            setLoading(false);
        }
    }

    async function handleSend() {
        if (!input.trim() || loading) return;
        const userText = input.trim();
        setInput('');
        addMessage({ type: 'user', content: userText });

        // If editing a draft, re-draft with user instructions
        if (editingDraft) {
            setLoading(true);
            try {
                const data = await generateDraft(editingDraft.emailId, userText);
                setPendingDraft(data.draft);
                setEditingDraft(null);
                addMessage({ type: 'draft', content: data.draft });
            } catch (err) {
                addMessage({ type: 'error', content: `Failed to redraft: ${err.message}` });
            } finally {
                setLoading(false);
            }
            return;
        }

        // Normal conversation flow
        setLoading(true);
        try {
            const history = messages
                .filter(m => m.type === 'user' || m.type === 'assistant' || m.type === 'question')
                .slice(-10)
                .map(m => ({ role: m.type === 'user' ? 'user' : 'assistant', content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }));

            const data = await sendChatMessage(history, userText, emailContext?.id);

            addMessage({ type: 'assistant', content: data.response });

            if (data.draft) {
                setPendingDraft(data.draft);
                addMessage({ type: 'draft', content: data.draft });
                // If we didn't have an email context but the AI resolved one, set it
                if (!emailContext && data.draft.emailId) {
                    const resolved = emailMap[data.draft.emailId] || {
                        id: data.draft.emailId,
                        from_email: data.draft.to,
                        subject: data.draft.subject?.replace(/^Re:\s*/i, ''),
                    };
                    setEmailContext(resolved);
                }
            }

            if (data.triagedCount > 0) {
                addMessage({ type: 'system', content: `✅ Moved ${data.triagedCount} email${data.triagedCount > 1 ? 's' : ''} to ${data.triageCategory}.` });
            }
        } catch (err) {
            addMessage({ type: 'error', content: `Error: ${err.message}` });
        } finally {
            setLoading(false);
        }
    }

    async function handleSendDraft() {
        if (!pendingDraft) return;
        setLoading(true);
        try {
            await sendDraft(pendingDraft.emailId, pendingDraft.subject, pendingDraft.body);
            addMessage({ type: 'system', content: '✅ Email sent!' });
            setPendingDraft(null);
            setEmailContext(null);

            // Move to next email needing reply
            const lastBriefing = messages.findLast(m => m.type === 'briefing');
            if (lastBriefing) {
                const replied = new Set(messages.filter(m => m.type === 'system' && m.content.includes('sent')).map(() => emailContext?.id));
                const next = (lastBriefing.content.emails || []).find(e => e.needs_reply && !replied.has(e.id) && e.id !== emailContext?.id);
                if (next && emailMap[next.id]) {
                    setEmailContext(emailMap[next.id]);
                    addMessage({
                        type: 'question',
                        emailId: next.id,
                        content: `Next up: **${next.from_name}**\n${next.questions?.length ? next.questions.map(q => `• ${q}`).join('\n') : 'What should I say?'}`,
                    });
                }
            }
        } catch (err) {
            addMessage({ type: 'error', content: `Failed to send: ${err.message}` });
        } finally {
            setLoading(false);
        }
    }

    function handleEditDraft() {
        setEditingDraft(pendingDraft);
        setPendingDraft(null);
        addMessage({ type: 'assistant', content: "What changes would you like to the draft?" });
    }

    function handleSkipDraft() {
        setPendingDraft(null);
        setEmailContext(null);
        addMessage({ type: 'system', content: 'Skipped. Moving on.' });
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    function renderMessage(msg, idx) {
        switch (msg.type) {
            case 'user':
                return (
                    <Box key={idx} sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
                        <Paper sx={{
                            px: 2, py: 1, maxWidth: '85%', bgcolor: 'primary.main', color: 'primary.contrastText',
                            borderRadius: '12px 12px 2px 12px',
                        }}>
                            <Typography variant="body2">{msg.content}</Typography>
                        </Paper>
                    </Box>
                );

            case 'assistant':
            case 'question':
                return (
                    <Box key={idx} sx={{ display: 'flex', justifyContent: 'flex-start', mb: 1.5 }}>
                        <Paper sx={{
                            px: 2, py: 1, maxWidth: '85%', bgcolor: 'action.hover',
                            borderRadius: '12px 12px 12px 2px',
                        }}>
                            {msg.type === 'question' && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                                    <EmailIcon sx={{ fontSize: 14, color: 'primary.main' }} />
                                    <Typography variant="caption" color="primary">Reply needed</Typography>
                                </Box>
                            )}
                            <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{msg.content}</Typography>
                        </Paper>
                    </Box>
                );

            case 'briefing':
                return (
                    <Box key={idx} sx={{ mb: 2 }}>
                        <Paper sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                                <AutoAwesomeIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                                <Typography variant="subtitle2">{msg.content.greeting}</Typography>
                            </Box>
                            {(msg.content.emails || []).map((e, i) => (
                                <Box key={i} sx={{
                                    p: 1.5, mb: 1, borderLeft: 3, bgcolor: 'background.paper',
                                    borderColor: URGENCY_COLORS[e.urgency] ? `${URGENCY_COLORS[e.urgency]}.main` : 'divider',
                                    borderRadius: '0 8px 8px 0', cursor: 'pointer',
                                    '&:hover': { bgcolor: 'action.selected' },
                                }}
                                    onClick={() => { if (emailMap[e.id]) setEmailContext(emailMap[e.id]); }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                                            {e.from_name}
                                        </Typography>
                                        {e.urgency !== 'none' && (
                                            <Chip label={e.urgency} size="small" color={URGENCY_COLORS[e.urgency]}
                                                sx={{ fontSize: '0.6rem', height: 18 }} />
                                        )}
                                        {e.needs_reply && (
                                            <Chip label="reply" size="small" variant="outlined" color="primary"
                                                sx={{ fontSize: '0.6rem', height: 18 }} />
                                        )}
                                    </Box>
                                    <Typography variant="caption" sx={{ display: 'block' }}>{e.summary}</Typography>
                                    {(e.key_info || []).map((info, j) => (
                                        <Typography key={j} variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                            • {info}
                                        </Typography>
                                    ))}
                                </Box>
                            ))}
                        </Paper>
                    </Box>
                );

            case 'draft':
                return (
                    <Box key={idx} sx={{ mb: 2 }}>
                        <Paper sx={{
                            p: 2, border: 1, borderColor: 'success.main', borderRadius: 2,
                            background: 'linear-gradient(135deg, rgba(76,175,80,0.04), rgba(76,175,80,0.01))',
                        }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <EmailIcon sx={{ fontSize: 16, color: 'success.main' }} />
                                <Typography variant="subtitle2" color="success.main">Draft Reply</Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                To: {msg.content.to} | Subject: {msg.content.subject}
                            </Typography>
                            <Typography variant="body2" sx={{ whiteSpace: 'pre-line', mb: 1.5, p: 1.5, bgcolor: 'background.paper', borderRadius: 1 }}>
                                {msg.content.body}
                            </Typography>
                            {msg.content.notes && (
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, fontStyle: 'italic' }}>
                                    💡 {msg.content.notes}
                                </Typography>
                            )}
                            {pendingDraft && pendingDraft === msg.content && (
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Button size="small" variant="contained" color="success"
                                        startIcon={<CheckCircleIcon />} onClick={handleSendDraft} disabled={loading}>
                                        Send
                                    </Button>
                                    <Button size="small" variant="outlined" startIcon={<EditIcon />}
                                        onClick={handleEditDraft} disabled={loading}>
                                        Edit
                                    </Button>
                                    <Button size="small" color="inherit" startIcon={<SkipNextIcon />}
                                        onClick={handleSkipDraft} disabled={loading}>
                                        Skip
                                    </Button>
                                </Box>
                            )}
                        </Paper>
                    </Box>
                );

            case 'system':
                return (
                    <Box key={idx} sx={{ textAlign: 'center', mb: 1 }}>
                        <Typography variant="caption" color="text.secondary">{msg.content}</Typography>
                    </Box>
                );

            case 'error':
                return (
                    <Box key={idx} sx={{ mb: 1.5 }}>
                        <Alert severity="error" sx={{ py: 0 }}>
                            <Typography variant="caption">{msg.content}</Typography>
                        </Alert>
                    </Box>
                );

            default:
                return null;
        }
    }

    // Chat panel dimensions
    const panelWidth = expanded ? 400 : 360;

    return (
        <>
            {/* FAB button */}
            {!open && (
                <Fab color="primary" onClick={() => setOpen(true)}
                    sx={{
                        position: 'fixed', bottom: 24, right: 24, zIndex: 1300,
                        background: 'linear-gradient(135deg, #7c6ef0, #a78bfa)',
                        '&:hover': { background: 'linear-gradient(135deg, #6b5ce0, #9577f0)' },
                    }}>
                    <ChatIcon />
                </Fab>
            )}

            {/* Chat panel */}
            <Slide direction="left" in={open} mountOnEnter unmountOnExit>
                <Paper elevation={expanded ? 0 : 8} sx={{
                    position: 'fixed',
                    ...(expanded ? {
                        top: 0,
                        right: 0,
                        bottom: 0,
                        width: panelWidth,
                        height: '100vh',
                        borderRadius: 0,
                        borderLeft: 1,
                        borderColor: 'divider',
                        boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.25)',
                    } : {
                        bottom: 24,
                        right: 24,
                        width: panelWidth,
                        height: 480,
                        borderRadius: 3,
                    }),
                    zIndex: 1200,
                    display: 'flex', flexDirection: 'column',
                    overflow: 'hidden',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}>
                    {/* Header */}
                    <Box sx={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        px: 2, py: 1.5,
                        background: 'linear-gradient(135deg, #7c6ef0, #a78bfa)',
                        color: '#fff',
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AutoAwesomeIcon sx={{ fontSize: 20 }} />
                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>AI Assistant</Typography>
                        </Box>
                        <Box>
                            <IconButton size="small" sx={{ color: '#fff' }}
                                onClick={() => setExpanded(!expanded)}>
                                {expanded ? <CloseFullscreenIcon fontSize="small" /> : <OpenInFullIcon fontSize="small" />}
                            </IconButton>
                            <IconButton size="small" sx={{ color: '#fff' }}
                                onClick={() => setOpen(false)}>
                                <CloseIcon fontSize="small" />
                            </IconButton>
                        </Box>
                    </Box>

                    {/* Context indicator */}
                    {emailContext && (
                        <Box sx={{
                            px: 2, py: 0.75, bgcolor: 'action.hover',
                            display: 'flex', alignItems: 'center', gap: 1, borderBottom: 1, borderColor: 'divider',
                        }}>
                            <EmailIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>
                                {emailContext.from_email} — {emailContext.subject}
                            </Typography>
                            <IconButton size="small" onClick={() => setEmailContext(null)}>
                                <CloseIcon sx={{ fontSize: 12 }} />
                            </IconButton>
                        </Box>
                    )}

                    {/* Messages area */}
                    <Box sx={{
                        flex: 1, overflow: 'auto', px: 2, py: 2,
                        display: 'flex', flexDirection: 'column',
                    }}>
                        {messages.length === 0 ? (
                            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                                <AutoAwesomeIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
                                <Typography variant="body2" color="text.secondary" textAlign="center">
                                    Your AI email assistant. Click below to get a briefing on your unread emails.
                                </Typography>
                                <Button variant="contained" onClick={handleBriefing} disabled={loading}
                                    startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />}
                                    sx={{
                                        background: 'linear-gradient(135deg, #7c6ef0, #a78bfa)',
                                        '&:hover': { background: 'linear-gradient(135deg, #6b5ce0, #9577f0)' },
                                    }}>
                                    {loading ? 'Scanning...' : 'Get Briefing'}
                                </Button>
                            </Box>
                        ) : (
                            <>
                                {messages.map((msg, idx) => renderMessage(msg, idx))}
                                {loading && (
                                    <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 1 }}>
                                        <Paper sx={{ px: 2, py: 1, bgcolor: 'action.hover', borderRadius: '12px 12px 12px 2px' }}>
                                            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                                                <CircularProgress size={12} />
                                                <Typography variant="caption" color="text.secondary">Thinking...</Typography>
                                            </Box>
                                        </Paper>
                                    </Box>
                                )}
                                <div ref={messagesEndRef} />
                            </>
                        )}
                    </Box>

                    {/* Input area */}
                    {messages.length > 0 && (
                        <>
                            <Divider />
                            <Box sx={{ p: 1.5, display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                                <TextField
                                    fullWidth size="small" multiline maxRows={3}
                                    placeholder={editingDraft ? "Describe changes to the draft..." : "Type your response..."}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.875rem' } }}
                                />
                                <IconButton color="primary" onClick={handleSend} disabled={!input.trim() || loading}
                                    sx={{
                                        bgcolor: 'primary.main', color: '#fff', '&:hover': { bgcolor: 'primary.dark' },
                                        '&.Mui-disabled': { bgcolor: 'action.disabledBackground' }, width: 36, height: 36
                                    }}>
                                    <SendIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                            </Box>
                            {/* Quick actions */}
                            <Box sx={{ px: 1.5, pb: 1, display: 'flex', gap: 0.5 }}>
                                <Chip label="📋 New Briefing" size="small" variant="outlined" clickable
                                    onClick={handleBriefing} disabled={loading}
                                    sx={{ fontSize: '0.7rem', height: 24 }} />
                            </Box>
                        </>
                    )}
                </Paper>
            </Slide>
        </>
    );
}
