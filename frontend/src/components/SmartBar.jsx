import { useState, useRef, useEffect } from 'react';
import {
    Box, TextField, InputAdornment, IconButton, Paper, Typography,
    CircularProgress, Chip, Tooltip, Button, Collapse,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { sendChatMessage } from '../api/client';

const CHAT_STORAGE_KEY = 'smartbar-chat-history';
const MAX_CHAT_HEIGHT = 360;

function loadChatHistory() {
    try {
        const stored = localStorage.getItem(CHAT_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function saveChatHistory(messages) {
    try {
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch { /* ignore quota errors */ }
}

/**
 * SmartBar — unified search + AI chat bar.
 * Type to filter emails (real-time search), press Enter to chat with AI.
 * Chat history appears above the input as message bubbles.
 */
export default function SmartBar({ searchQuery, onSearchChange, onTutorialEvent }) {
    const [chatMessages, setChatMessages] = useState(loadChatHistory);
    const [chatOpen, setChatOpen] = useState(() => loadChatHistory().length > 0);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiInput, setAiInput] = useState('');
    const [mode, setMode] = useState('search'); // 'search' or 'chat'
    const inputRef = useRef(null);
    const chatEndRef = useRef(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatMessages]);

    // Persist chat history
    useEffect(() => {
        saveChatHistory(chatMessages);
    }, [chatMessages]);

    function addMessage(role, content, meta = {}) {
        const msg = { role, content, timestamp: Date.now(), ...meta };
        setChatMessages(prev => [...prev, msg]);
        return msg;
    }

    async function handleSendMessage(text) {
        const query = (text || aiInput).trim();
        if (!query || aiLoading) return;

        // Switch to chat mode and open chat
        setMode('chat');
        setChatOpen(true);
        setAiInput('');
        onTutorialEvent?.('smartbar-chat-opened');

        // Add user message
        const updatedMessages = [...chatMessages, { role: 'user', content: query, timestamp: Date.now() }];
        setChatMessages(updatedMessages);

        setAiLoading(true);
        try {
            // Send full conversation history to AI for context
            const apiHistory = updatedMessages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
            const data = await sendChatMessage(apiHistory, query);

            const aiMsg = {
                role: 'assistant',
                content: data.response,
                timestamp: Date.now(),
                triagedCount: data.triagedCount || 0,
                triageCategory: data.triageCategory || null,
                suggestedRule: data.suggestedRule || null,
                intent: data.intent || null,
            };
            setChatMessages(prev => [...prev, aiMsg]);
        } catch (err) {
            setChatMessages(prev => [...prev, {
                role: 'assistant',
                content: `Error: ${err.message}`,
                timestamp: Date.now(),
                isError: true,
            }]);
        } finally {
            setAiLoading(false);
        }
    }

    function handleKeyDown(e) {
        if (mode === 'chat') {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
            if (e.key === 'Escape') {
                setMode('search');
                setAiInput('');
                setChatOpen(false);
                onTutorialEvent?.('smartbar-chat-closed');
            }
        } else {
            // Search mode: Enter switches to AI chat
            if (e.key === 'Enter' && !e.shiftKey && searchQuery.trim()) {
                e.preventDefault();
                handleSendMessage(searchQuery);
                onSearchChange('');
            }
            if (e.key === 'Escape') {
                onSearchChange('');
                setChatOpen(false);
            }
        }
    }

    function handleClearChat() {
        setChatMessages([]);
        saveChatHistory([]);
        setChatOpen(false);
        setMode('search');
        onTutorialEvent?.('smartbar-chat-closed');
    }

    function handleCloseChat() {
        setChatOpen(false);
        setMode('search');
        onTutorialEvent?.('smartbar-chat-closed');
    }

    const showChat = chatOpen && chatMessages.length > 0;

    return (
        <Box data-tour="smart-bar-area" sx={{ width: '100%' }}>
            {/* Chat history — above the input, like a messaging app */}
            <Collapse in={showChat}>
                <Paper elevation={2} sx={{
                    mb: 1, borderRadius: 2, overflow: 'hidden',
                    border: 1, borderColor: 'divider',
                }}>
                    {/* Chat header */}
                    <Box sx={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        px: 1.5, py: 0.75,
                        borderBottom: 1, borderColor: 'divider',
                        bgcolor: 'background.default',
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <AutoAwesomeIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                            <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main' }}>
                                AI Chat
                            </Typography>
                        </Box>
                        <Box>
                            <Tooltip title="Clear chat history">
                                <IconButton size="small" onClick={handleClearChat}>
                                    <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Close chat">
                                <IconButton size="small" onClick={handleCloseChat}>
                                    <CloseIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    </Box>

                    {/* Chat messages — scrollable */}
                    <Box sx={{
                        maxHeight: MAX_CHAT_HEIGHT,
                        overflowY: 'auto',
                        px: 1.5, py: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                    }}>
                        {chatMessages.map((msg, i) => (
                            <ChatBubble key={i} message={msg} onQuickReply={handleSendMessage} aiLoading={aiLoading} />
                        ))}
                        {aiLoading && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 1 }}>
                                <CircularProgress size={14} />
                                <Typography variant="caption" color="text.secondary">AI is thinking...</Typography>
                            </Box>
                        )}
                        <div ref={chatEndRef} />
                    </Box>
                </Paper>
            </Collapse>

            {/* Input bar */}
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                <TextField
                    data-tour="smart-bar-input"
                    inputRef={inputRef}
                    size="small"
                    fullWidth
                    placeholder={mode === 'chat' ? "Reply to AI..." : "Search or ask AI anything... (Enter to ask AI)"}
                    value={mode === 'chat' ? aiInput : searchQuery}
                    onChange={(e) => mode === 'chat' ? setAiInput(e.target.value) : onSearchChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    sx={{
                        '& .MuiOutlinedInput-root': {
                            borderRadius: 3,
                            bgcolor: 'background.default',
                            '&:hover': { bgcolor: 'action.hover' },
                        },
                    }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                {aiLoading ? (
                                    <CircularProgress size={18} />
                                ) : mode === 'chat' ? (
                                    <AutoAwesomeIcon sx={{ fontSize: 20, color: 'primary.main' }} />
                                ) : (
                                    <SearchIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                                )}
                            </InputAdornment>
                        ),
                        endAdornment: (
                            <InputAdornment position="end">
                                {mode === 'chat' ? (
                                    <>
                                        <Tooltip title="Send (Enter)">
                                            <span>
                                                <IconButton size="small" onClick={() => handleSendMessage()}
                                                    disabled={aiLoading || !aiInput.trim()}
                                                    sx={{ color: 'primary.main' }}>
                                                    <SendIcon sx={{ fontSize: 18 }} />
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                        <Tooltip title="Back to search">
                                            <IconButton size="small" onClick={() => { setMode('search'); setAiInput(''); }}>
                                                <SearchIcon sx={{ fontSize: 16 }} />
                                            </IconButton>
                                        </Tooltip>
                                    </>
                                ) : (
                                    searchQuery && (
                                        <>
                                            <Tooltip title="Ask AI (Enter)">
                                                <IconButton size="small" onClick={() => handleSendMessage(searchQuery)}
                                                    disabled={aiLoading || !searchQuery.trim()}
                                                    sx={{ color: 'primary.main' }}>
                                                    <AutoAwesomeIcon sx={{ fontSize: 18 }} />
                                                </IconButton>
                                            </Tooltip>
                                            <IconButton size="small" onClick={() => { onSearchChange(''); }}>
                                                <ClearIcon sx={{ fontSize: 16 }} />
                                            </IconButton>
                                        </>
                                    )
                                )}
                                {chatMessages.length > 0 && !chatOpen && (
                                    <Tooltip title="Show chat history">
                                        <IconButton size="small" onClick={() => { setChatOpen(true); setMode('chat'); }}
                                            sx={{ color: 'primary.main' }}>
                                            <AutoAwesomeIcon sx={{ fontSize: 16 }} />
                                            <Typography variant="caption" sx={{ fontSize: '0.6rem', ml: 0.25 }}>
                                                {chatMessages.filter(m => m.role === 'user').length}
                                            </Typography>
                                        </IconButton>
                                    </Tooltip>
                                )}
                            </InputAdornment>
                        ),
                    }}
                />
            </Box>
        </Box>
    );
}

/**
 * Individual chat bubble — AI messages in theme color, user messages in white.
 */
function ChatBubble({ message, onQuickReply, aiLoading }) {
    const isUser = message.role === 'user';
    const isError = message.isError;

    return (
        <Box sx={{
            display: 'flex',
            justifyContent: isUser ? 'flex-end' : 'flex-start',
            width: '100%',
        }}>
            <Box sx={{
                maxWidth: '85%',
                px: 1.5, py: 1,
                borderRadius: isUser
                    ? '12px 12px 4px 12px'
                    : '12px 12px 12px 4px',
                bgcolor: isError
                    ? 'error.main'
                    : isUser
                        ? 'background.paper'
                        : 'primary.main',
                color: isError
                    ? '#fff'
                    : isUser
                        ? 'text.primary'
                        : '#fff',
                border: isUser ? 1 : 0,
                borderColor: 'divider',
                boxShadow: 1,
            }}>
                <Typography variant="body2" sx={{
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    fontSize: '0.82rem',
                }}>
                    {message.content}
                </Typography>

                {/* Action chips for AI messages */}
                {!isUser && !isError && (
                    <Box sx={{ mt: 0.5 }}>
                        {message.triagedCount > 0 && (
                            <Chip
                                label={`Moved ${message.triagedCount} email${message.triagedCount > 1 ? 's' : ''} to ${message.triageCategory}`}
                                size="small" variant="outlined"
                                sx={{ mt: 0.5, fontSize: '0.65rem', color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}
                            />
                        )}
                        {message.suggestedRule && (
                            <Chip
                                label={`Rule created: ${message.suggestedRule.sender_pattern} \u2192 ${message.suggestedRule.category}`}
                                size="small" variant="outlined"
                                sx={{ mt: 0.5, ml: 0.5, fontSize: '0.65rem', color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}
                            />
                        )}

                        {/* Quick reply buttons when AI asks a yes/no question */}
                        {message.intent === 'suggest_rule' && !message.suggestedRule && (
                            <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
                                <Button size="small" variant="contained"
                                    disabled={aiLoading}
                                    onClick={() => onQuickReply('Yes, create that rule')}
                                    sx={{
                                        fontSize: '0.7rem', py: 0.25, px: 1,
                                        bgcolor: 'rgba(255,255,255,0.2)',
                                        color: '#fff',
                                        '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' },
                                    }}>
                                    Yes
                                </Button>
                                <Button size="small" variant="outlined"
                                    disabled={aiLoading}
                                    onClick={() => onQuickReply('No, don\'t create a rule')}
                                    sx={{
                                        fontSize: '0.7rem', py: 0.25, px: 1,
                                        color: '#fff',
                                        borderColor: 'rgba(255,255,255,0.3)',
                                        '&:hover': { borderColor: 'rgba(255,255,255,0.5)' },
                                    }}>
                                    No
                                </Button>
                            </Box>
                        )}
                    </Box>
                )}

                {/* Timestamp */}
                <Typography variant="caption" sx={{
                    display: 'block', mt: 0.25,
                    fontSize: '0.6rem',
                    opacity: 0.6,
                    textAlign: isUser ? 'right' : 'left',
                    color: isUser ? 'text.secondary' : 'rgba(255,255,255,0.7)',
                }}>
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Typography>
            </Box>
        </Box>
    );
}
