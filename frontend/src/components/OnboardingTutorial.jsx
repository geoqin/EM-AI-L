import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

const STORAGE_KEY = 'onboarding-complete';

// ── Color schemes ──
const COLORS = {
    guide:   { r: 255, g: 152, b: 0 },   // orange — "click here next"
    info:    { r: 124, g: 110, b: 240 },  // purple — informational
    wait:    { r: 124, g: 110, b: 240 },  // purple — waiting/pulse
    success: { r: 76,  g: 175, b: 80 },   // green  — completed action
};

function rgba(c, a) { return `rgba(${c.r},${c.g},${c.b},${a})`; }

/**
 * Tutorial steps — a reactive state machine.
 *
 * `passthrough` steps use orange to guide user to click.
 * `dismiss` steps use purple for informational highlights.
 * `pulse` steps use purple for waiting states.
 */
const STEPS = [
    // ── Welcome ──
    {
        id: 'welcome',
        target: null,
        text: "Welcome to your AI-powered inbox! Let's walk through the basics together. You'll learn by doing — just follow the prompts.",
        position: 'center',
        waitFor: 'dismiss',
        cta: "Let's go",
    },

    // ── Inbox: Sync ──
    {
        id: 'sync',
        target: '[data-tour="sync-button"]',
        text: 'Start by syncing your emails. Click the Sync button to pull in your latest messages.',
        position: 'bottom',
        waitFor: 'sync-started',
        passthrough: true,
    },
    {
        id: 'sync-wait',
        target: '[data-tour="sync-button"]',
        text: 'Syncing your emails...',
        position: 'bottom',
        waitFor: 'sync-complete',
        passthrough: true,
        pulse: true,
    },

    // ── Inbox: Analyze ──
    {
        id: 'analyze',
        target: '[data-tour="analyze-button"]',
        text: "Great! Now let's triage. Click Analyze and the AI will classify each email as important, junk, needs review, or spam.",
        position: 'bottom',
        waitFor: 'analyze-started',
        passthrough: true,
    },
    {
        id: 'analyze-wait',
        target: '[data-tour="analyze-button"]',
        text: 'The AI is analyzing your emails...',
        position: 'bottom',
        waitFor: 'analyze-complete',
        passthrough: true,
        pulse: true,
    },

    // ── Inbox: Results ──
    {
        id: 'inbox-result',
        target: '[data-tour="email-row"]',
        text: "Your inbox is triaged! Coloured highlights show junk and review items. Click any email to override its classification — the AI learns from your corrections.",
        position: 'right',
        waitFor: 'dismiss',
        cta: 'Got it',
    },

    // ── Smart Bar: intro ──
    {
        id: 'smart-bar',
        target: '[data-tour="smart-bar-input"]',
        text: 'This is your AI chat bar. Try it out — type a question like "summarize my inbox" and press Enter.',
        position: 'bottom',
        waitFor: 'smartbar-chat-opened',
        passthrough: true,
    },

    // ── Smart Bar: chat opened ──
    {
        id: 'smart-bar-chat',
        target: '[data-tour="smart-bar-area"]',
        text: "The AI responds right here. You can ask it to create rules, triage emails, summarize threads, or draft replies. Use the X button or press Escape to close the chat when you're done.",
        position: 'bottom',
        waitFor: 'smartbar-chat-closed',
        passthrough: true,
    },

    // ── Threads ──
    {
        id: 'go-threads',
        target: '[data-tour="threads-tab"]',
        text: 'Now click Threads to see how the AI groups your emails by topic — not just by reply chain. This feature is in beta.',
        position: 'bottom',
        waitFor: 'tab-threads',
        passthrough: true,
    },
    {
        id: 'threads-view',
        target: '[data-tour="thread-list"]',
        text: 'Each thread is an AI-grouped conversation. Click one to see its emails, summary, and memory. You can delete threads you don\'t want — the AI won\'t recreate them.',
        position: 'bottom',
        waitFor: 'dismiss',
        cta: 'Got it',
    },

    // ── Trash: navigate ──
    {
        id: 'go-trash',
        target: '[data-tour="trash-tab"]',
        text: 'Next, check out Trash. Click it to see what the AI flagged as junk.',
        position: 'bottom',
        waitFor: 'tab-trash',
        passthrough: true,
    },

    // ── Trash: overview ──
    {
        id: 'trash-overview',
        target: '[data-tour="trash-content"]',
        text: "This is your trash. Emails the AI classified as junk end up here. You can rescue any email back to inbox, or teach the AI a rule from any item.",
        position: 'bottom',
        waitFor: 'dismiss',
        cta: 'Next',
    },

    // ── Trash: action selector ──
    {
        id: 'trash-action',
        target: '[data-tour="trash-action-selector"]',
        text: "This is the action that will be applied to trashed emails in your real mailbox. You can change it anytime — move to junk, archive, delete permanently, or do nothing. Toggle auto-apply to let the AI act automatically.",
        position: 'bottom',
        waitFor: 'dismiss',
        cta: 'Next',
    },

    // ── Trash: apply button ──
    {
        id: 'trash-apply',
        target: '[data-tour="apply-action-button"]',
        text: "When you're ready, click Apply Action to execute the chosen action on all trashed emails in your actual email provider. This is the only step that touches your real inbox.",
        position: 'bottom',
        waitFor: 'dismiss',
        cta: 'Got it',
    },

    // ── Rules: navigate ──
    {
        id: 'go-rules',
        target: '[data-tour="rules-tab"]',
        text: 'Now click Rules to see how the AI learns your preferences.',
        position: 'bottom',
        waitFor: 'tab-rules',
        passthrough: true,
    },

    // ── Rules: overview ──
    {
        id: 'rules-overview',
        target: '[data-tour="rules-content"]',
        text: "Rules are patterns the AI uses to classify future emails. They're created automatically when you override a classification, or you can ask the AI chat to create them for you.",
        position: 'bottom',
        waitFor: 'dismiss',
        cta: 'Next',
    },

    // ── Rules: add & apply ──
    {
        id: 'rules-add',
        target: '[data-tour="rules-add-area"]',
        text: "Use Add Rule to create rules manually — specify a sender pattern, subject match, and category. Apply All runs every active rule against your current inbox.",
        position: 'bottom',
        waitFor: 'dismiss',
        cta: 'Next',
    },

    // ── Rules: suggested ──
    {
        id: 'rules-suggested',
        target: '[data-tour="rules-suggested"]',
        text: "When the AI notices patterns in your filtering, it suggests new rules here. Approve to activate them, edit to refine, or dismiss if they're not useful.",
        position: 'bottom',
        waitFor: 'dismiss',
        cta: 'Next',
        optional: true,
    },

    // ── Rules: active ──
    {
        id: 'rules-active',
        target: '[data-tour="rules-active"]',
        text: "Active rules run every time you analyze emails. You can edit, apply individually, or delete any rule. The more you teach the AI, the smarter it gets.",
        position: 'bottom',
        waitFor: 'dismiss',
        cta: 'Got it',
    },

    // ── Settings: navigate ──
    {
        id: 'go-settings',
        target: '[data-tour="settings-button"]',
        text: 'Finally, click Settings to configure your account.',
        position: 'bottom-end',
        waitFor: 'tab-settings',
        passthrough: true,
    },

    // ── Settings: account ──
    {
        id: 'settings-account',
        target: '[data-tour="settings-account"]',
        text: "Here you can set your display name, toggle dark mode, replay this tutorial, or sign out.",
        position: 'bottom',
        waitFor: 'dismiss',
        cta: 'Next',
    },

    // ── Settings: providers ──
    {
        id: 'settings-providers',
        target: '[data-tour="settings-providers"]',
        text: "Connect additional email providers here. The AI will monitor and triage emails from all connected accounts — Gmail, Outlook, or both.",
        position: 'bottom',
        waitFor: 'dismiss',
        cta: 'Next',
    },

    // ── Settings: credits ──
    {
        id: 'settings-credits',
        target: '[data-tour="settings-credits"]',
        text: "This section tracks your AI usage. Each operation costs 1–5 credits depending on complexity — triage costs 1, chat costs 3, and drafting costs 5. You'll also see an estimated dollar cost based on Gemini API pricing (which may be $0 if you're on Google's free tier). Usage resets monthly.",
        position: 'top',
        waitFor: 'dismiss',
        cta: 'Got it',
    },

    // ── Done ──
    {
        id: 'done',
        target: null,
        text: "You're all set! Your inbox is synced, triaged, and organized. Explore on your own — the AI chat is always there to help.",
        position: 'center',
        waitFor: 'dismiss',
        cta: 'Start using the app',
    },
];

export default function OnboardingTutorial({ active, onComplete, onEvent }) {
    const [stepIndex, setStepIndex] = useState(0);
    const [spotlightRect, setSpotlightRect] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({});
    const [flashState, setFlashState] = useState(null); // 'success' | null
    const rafRef = useRef(null);
    const scrolledRef = useRef(null); // track which step we've scrolled for

    const currentStep = STEPS[stepIndex];

    // Determine highlight color based on step type
    function getStepColor() {
        if (flashState === 'success') return COLORS.success;
        if (currentStep?.pulse) return COLORS.wait;
        if (currentStep?.passthrough) return COLORS.guide;
        return COLORS.info;
    }

    // ── Auto-scroll to target element ──
    const measure = useCallback(() => {
        if (!active || !currentStep?.target) {
            setSpotlightRect(null);
            setTooltipPos(getTooltipPos('center', null));
            return;
        }
        const el = document.querySelector(currentStep.target);
        if (!el) {
            setSpotlightRect(null);
            setTooltipPos(getTooltipPos(currentStep.position, null));
            return;
        }

        // Auto-scroll into view once per step
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight;
        if (scrolledRef.current !== currentStep.id) {
            if (rect.top < 80 || rect.bottom > vh - 40) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                scrolledRef.current = currentStep.id;
                return; // let scroll settle, re-measure next frame
            }
            scrolledRef.current = currentStep.id;
        }

        const pad = 8;
        const minRadius = 8; // never show sharp corners
        const elRadius = getComputedBorderRadius(el);
        // For large content elements, clip the spotlight to the visible viewport
        // so it doesn't extend above the AppBar or below the screen
        const appBar = document.querySelector('.MuiAppBar-root');
        const appBarBottom = appBar?.getBoundingClientRect()?.bottom || 0;
        const vh = window.innerHeight;
        let top = rect.top - pad;
        let height = rect.height + pad * 2;
        // Only clamp if the element extends above the AppBar (i.e. it's a content area, not a tab/bar)
        if (top < appBarBottom && !appBar?.contains(el)) {
            const clipped = appBarBottom - top;
            top = appBarBottom;
            height = height - clipped;
        }
        // Also clamp bottom to viewport
        if (top + height > vh) {
            height = vh - top;
        }
        const sr = {
            top,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: Math.max(0, height),
            borderRadius: Math.max(minRadius, elRadius > 0 ? elRadius + pad : minRadius),
        };
        setSpotlightRect(sr);
        setTooltipPos(getTooltipPos(currentStep.position, sr));
    }, [active, currentStep]);

    // ── rAF loop for continuous measurement ──
    useEffect(() => {
        if (!active) return;
        scrolledRef.current = null; // reset on step change
        measure();
        const loop = () => { measure(); rafRef.current = requestAnimationFrame(loop); };
        rafRef.current = requestAnimationFrame(loop);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [active, stepIndex, measure]);

    // ── Scroll lock during tutorial ──
    useEffect(() => {
        if (!active) return;
        const handler = (e) => {
            // Allow scroll inside passthrough targets (e.g. chat widget)
            if (currentStep?.passthrough && currentStep?.target) {
                const targetEl = document.querySelector(currentStep.target);
                if (targetEl && targetEl.contains(e.target)) return;
            }
            e.preventDefault();
        };
        document.addEventListener('wheel', handler, { passive: false });
        document.addEventListener('touchmove', handler, { passive: false });
        return () => {
            document.removeEventListener('wheel', handler);
            document.removeEventListener('touchmove', handler);
        };
    }, [active, currentStep]);

    // ── Listen for external events ──
    useEffect(() => {
        if (!active || !onEvent) return;
        onEvent.current = (eventName) => {
            if (currentStep?.waitFor === eventName) {
                advance();
            }
        };
        return () => { onEvent.current = null; };
    }, [active, stepIndex, currentStep]);

    function advance() {
        // Flash green on passthrough completion (not pulse/wait steps)
        if (currentStep?.passthrough && !currentStep?.pulse && spotlightRect) {
            setFlashState('success');
            setTimeout(() => {
                setFlashState(null);
                doAdvance();
            }, 500);
            return;
        }
        doAdvance();
    }

    function doAdvance() {
        let next = stepIndex + 1;
        while (next < STEPS.length) {
            const step = STEPS[next];
            if (step.optional && step.target && !document.querySelector(step.target)) {
                next++;
                continue;
            }
            break;
        }
        if (next >= STEPS.length) {
            finish();
        } else {
            setStepIndex(next);
        }
    }

    function finish() {
        localStorage.setItem(STORAGE_KEY, 'true');
        setStepIndex(0);
        onComplete();
    }

    function handleSkip() {
        finish();
    }

    function handleCta() {
        if (currentStep?.waitFor === 'dismiss') {
            advance();
        }
    }

    if (!active) return null;

    const isCenter = !currentStep.target;
    const showCta = !!currentStep.cta;
    const sr = spotlightRect;
    const radius = sr ? sr.borderRadius : 0;
    const c = getStepColor();
    const cStr = `${c.r},${c.g},${c.b}`;

    // Pick animation
    let animation = 'tour-shine 2.5s ease-in-out infinite';
    if (flashState === 'success') animation = 'tour-success 0.5s ease-out forwards';
    else if (currentStep.pulse) animation = 'tour-pulse 2s ease-in-out infinite';
    else if (currentStep.passthrough) animation = 'tour-guide 1.5s ease-in-out infinite';

    return (
        <>
            {/* Dark overlay with cutout */}
            <Box sx={{ position: 'fixed', inset: 0, zIndex: 9998, pointerEvents: 'none' }}>
                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                    <defs>
                        <mask id="tour-mask">
                            <rect x="0" y="0" width="100%" height="100%" fill="white" />
                            {sr && (
                                <rect
                                    x={sr.left} y={sr.top}
                                    width={sr.width} height={sr.height}
                                    rx={radius} ry={radius}
                                    fill="black"
                                />
                            )}
                        </mask>
                        {sr && (
                            <radialGradient id="tour-glow"
                                cx={sr.left + sr.width / 2}
                                cy={sr.top + sr.height / 2}
                                r={Math.max(sr.width, sr.height) * 1.2}
                                gradientUnits="userSpaceOnUse"
                            >
                                <stop offset="0%" stopColor={rgba(c, 0.35)} />
                                <stop offset="40%" stopColor={rgba(c, 0.12)} />
                                <stop offset="100%" stopColor={rgba(c, 0)} />
                            </radialGradient>
                        )}
                    </defs>
                    {/* Main dimmed overlay */}
                    <rect
                        x="0" y="0" width="100%" height="100%"
                        fill="rgba(0,0,0,0.55)"
                        mask="url(#tour-mask)"
                        style={{ pointerEvents: currentStep.passthrough ? 'none' : 'auto' }}
                    />
                    {/* Glow radiating from spotlight */}
                    {sr && (
                        <rect
                            x="0" y="0" width="100%" height="100%"
                            fill="url(#tour-glow)"
                            mask="url(#tour-mask)"
                            style={{ pointerEvents: 'none' }}
                        />
                    )}
                </svg>

                {/* Spotlight ring */}
                {sr && (
                    <Box sx={{
                        position: 'absolute',
                        top: sr.top, left: sr.left,
                        width: sr.width, height: sr.height,
                        borderRadius: `${radius}px`,
                        border: `2px solid ${rgba(c, 0.8)}`,
                        boxShadow: [
                            `0 0 12px ${rgba(c, 0.5)}`,
                            `0 0 30px ${rgba(c, 0.3)}`,
                            `inset 0 0 12px ${rgba(c, 0.15)}`,
                        ].join(', '),
                        pointerEvents: 'none',
                        transition: 'top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease',
                        animation,
                    }} />
                )}
            </Box>

            {/* Tooltip */}
            <Paper elevation={8} sx={{
                position: 'fixed',
                ...tooltipPos,
                maxWidth: isCenter ? 420 : 340,
                p: 2.5,
                borderRadius: 3,
                border: 1,
                borderColor: currentStep.passthrough && !currentStep.pulse
                    ? 'warning.main'
                    : 'primary.light',
                zIndex: 10000,
                transition: 'top 0.25s ease, left 0.25s ease, right 0.25s ease',
                pointerEvents: 'auto',
            }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <AutoAwesomeIcon sx={{
                        fontSize: 20, mt: 0.25, flexShrink: 0,
                        color: currentStep.passthrough && !currentStep.pulse
                            ? 'warning.main'
                            : 'primary.main',
                    }} />
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" sx={{ lineHeight: 1.7, mb: showCta ? 2 : 1 }}>
                            {currentStep.text}
                        </Typography>

                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Button size="small" onClick={handleSkip}
                                sx={{ color: 'text.secondary', fontSize: '0.75rem', textTransform: 'none' }}>
                                Skip tutorial
                            </Button>
                            {showCta && (
                                <Button size="small" variant="contained" onClick={handleCta}
                                    sx={{
                                        bgcolor: '#7c6ef0', px: 2, fontSize: '0.8rem',
                                        textTransform: 'none',
                                        '&:hover': { bgcolor: '#5a4ed4' },
                                    }}>
                                    {currentStep.cta}
                                </Button>
                            )}
                        </Box>
                    </Box>
                </Box>
            </Paper>

            {/* Animations — dynamic colors via CSS custom properties */}
            <style>{`
                @keyframes tour-guide {
                    0%, 100% {
                        box-shadow: 0 0 12px rgba(${cStr},0.5), 0 0 30px rgba(${cStr},0.3), inset 0 0 12px rgba(${cStr},0.15);
                        border-color: rgba(${cStr},0.8);
                    }
                    50% {
                        box-shadow: 0 0 24px rgba(${cStr},0.8), 0 0 50px rgba(${cStr},0.5), inset 0 0 20px rgba(${cStr},0.25);
                        border-color: rgba(${cStr},1);
                    }
                }
                @keyframes tour-pulse {
                    0%, 100% {
                        box-shadow: 0 0 12px rgba(${cStr},0.5), 0 0 30px rgba(${cStr},0.3), inset 0 0 12px rgba(${cStr},0.15);
                    }
                    50% {
                        box-shadow: 0 0 20px rgba(${cStr},0.7), 0 0 50px rgba(${cStr},0.4), inset 0 0 20px rgba(${cStr},0.25);
                    }
                }
                @keyframes tour-shine {
                    0%, 100% {
                        box-shadow: 0 0 12px rgba(${cStr},0.5), 0 0 30px rgba(${cStr},0.3), inset 0 0 12px rgba(${cStr},0.15);
                        border-color: rgba(${cStr},0.8);
                    }
                    50% {
                        box-shadow: 0 0 18px rgba(${cStr},0.65), 0 0 40px rgba(${cStr},0.35), inset 0 0 16px rgba(${cStr},0.2);
                        border-color: rgba(${cStr},0.95);
                    }
                }
                @keyframes tour-success {
                    0% {
                        box-shadow: 0 0 12px rgba(${cStr},0.5), 0 0 30px rgba(${cStr},0.3);
                        border-color: rgba(${cStr},0.8);
                        transform: scale(1);
                    }
                    40% {
                        box-shadow: 0 0 30px rgba(${cStr},0.8), 0 0 60px rgba(${cStr},0.5), inset 0 0 20px rgba(${cStr},0.3);
                        border-color: rgba(${cStr},1);
                        transform: scale(1.03);
                    }
                    100% {
                        box-shadow: 0 0 20px rgba(${cStr},0.4), 0 0 40px rgba(${cStr},0.2);
                        border-color: rgba(${cStr},0.6);
                        transform: scale(1);
                    }
                }
            `}</style>
        </>
    );
}

/**
 * Check if onboarding has been completed before.
 */
export function isOnboardingComplete() {
    try {
        return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
}

/**
 * Reset onboarding so it shows again.
 */
export function resetOnboarding() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch { }
}

/**
 * Get the computed border-radius of an element in px.
 * Falls back to checking significant child elements (handles wrapper divs).
 */
function getComputedBorderRadius(el) {
    try {
        const style = window.getComputedStyle(el);
        let r = parseFloat(style.borderRadius) || 0;
        if (r === 0) {
            // Walk child elements for common MUI components that carry their own radius
            const child = el.querySelector(
                '[class*="MuiOutlinedInput-root"], [class*="MuiPaper-root"], ' +
                '[class*="MuiButton-root"], [class*="MuiTab-root"], [class*="MuiButtonBase-root"]'
            );
            if (child) {
                r = parseFloat(window.getComputedStyle(child).borderRadius) || 0;
            }
        }
        return r;
    } catch {
        return 0;
    }
}

/**
 * Calculate tooltip position relative to the spotlight.
 */
function getTooltipPos(position, rect) {
    if (!rect || position === 'center') {
        return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }

    const gap = 14;
    const margin = 16;
    const tooltipHeight = 180;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let pos = position;

    if (pos === 'top' && rect.top - gap - tooltipHeight < margin) {
        pos = 'bottom';
    }
    if (pos === 'bottom' && rect.top + rect.height + gap + tooltipHeight > vh - margin) {
        pos = 'top';
    }

    const centerX = Math.max(margin, Math.min(rect.left + rect.width / 2, vw - 180));

    switch (pos) {
        case 'bottom':
            return {
                top: Math.min(rect.top + rect.height + gap, vh - tooltipHeight - margin),
                left: centerX,
                transform: 'translateX(-50%)',
            };
        case 'bottom-end':
            return {
                top: Math.min(rect.top + rect.height + gap, vh - tooltipHeight - margin),
                right: Math.max(margin, vw - rect.left - rect.width),
            };
        case 'top':
            return {
                top: Math.max(margin, rect.top - gap - tooltipHeight),
                left: centerX,
            };
        case 'right':
            return {
                top: Math.max(margin, Math.min(rect.top + rect.height / 2, vh - tooltipHeight)),
                left: Math.min(rect.left + rect.width + gap, vw - 360),
                transform: 'translateY(-50%)',
            };
        case 'left':
            return {
                top: Math.max(margin, Math.min(rect.top + rect.height / 2, vh - tooltipHeight)),
                right: Math.max(margin, vw - rect.left + gap),
                transform: 'translateY(-50%)',
            };
        default:
            return {
                top: Math.min(rect.top + rect.height + gap, vh - tooltipHeight - margin),
                left: Math.max(margin, rect.left),
            };
    }
}
