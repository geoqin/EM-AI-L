import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import AppBrand from './AppBrand';
import {
    Box, Typography, Button, Container, Paper, Chip, Divider,
    Grid, IconButton, Link as MuiLink,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SpeedIcon from '@mui/icons-material/Speed';
import SecurityIcon from '@mui/icons-material/Security';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CategoryIcon from '@mui/icons-material/Category';
import RuleIcon from '@mui/icons-material/Rule';
import ChatIcon from '@mui/icons-material/Chat';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EmailIcon from '@mui/icons-material/Email';
import XIcon from '@mui/icons-material/X';
import GitHubIcon from '@mui/icons-material/GitHub';
import GoogleIcon from '@mui/icons-material/Google';
import { getLoginUrl, getOutlookLoginUrl, checkAuthStatus } from '../api/client';

export default function LandingPage() {
    const navigate = useNavigate();
    const location = useLocation();

    // If already authenticated, redirect to app
    useEffect(() => {
        checkAuthStatus().then(status => {
            if (status.authenticated) navigate('/app');
        }).catch(() => { });
    }, []);

    // Scroll to section if hash is present
    useEffect(() => {
        if (location.hash) {
            const el = document.getElementById(location.hash.slice(1));
            if (el) el.scrollIntoView({ behavior: 'smooth' });
        }
    }, [location]);

    return (
        <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Nav Bar */}
            <Box component="nav" sx={{
                position: 'sticky', top: 0, zIndex: 100,
                bgcolor: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)',
                borderBottom: 1, borderColor: 'divider',
            }}>
                <Container maxWidth="lg" sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    py: 1.5,
                }}>
                    <AppBrand onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <NavLink href="#features">Features</NavLink>
                        <NavLink href="#pricing">Pricing</NavLink>
                        <NavLink href="#support">Support</NavLink>
                        <Button variant="contained" size="small"
                            onClick={() => navigate('/app')}
                            sx={{
                                bgcolor: '#7c6ef0', px: 2.5,
                                '&:hover': { bgcolor: '#5a4ed4' },
                            }}>
                            Get Started
                        </Button>
                    </Box>
                </Container>
            </Box>

            {/* Hero Section */}
            <Box sx={{
                pt: { xs: 8, md: 14 }, pb: { xs: 8, md: 12 },
                textAlign: 'center',
                background: 'linear-gradient(180deg, rgba(124,110,240,0.06) 0%, transparent 100%)',
            }}>
                <Container maxWidth="md">
                    <Chip label="Currently in Beta" color="primary" variant="outlined"
                        sx={{ mb: 3, fontWeight: 500 }} />

                    <Typography variant="h2" sx={{
                        fontWeight: 800, mb: 3,
                        fontSize: { xs: '2.25rem', md: '3.5rem' },
                        lineHeight: 1.15,
                        letterSpacing: '-0.03em',
                    }}>
                        Your inbox,{' '}
                        <Box component="span" sx={{
                            background: 'linear-gradient(135deg, #7c6ef0, #a78bfa)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        }}>
                            intelligently managed
                        </Box>
                    </Typography>

                    <Typography variant="h6" color="text.secondary" sx={{
                        maxWidth: 560, mx: 'auto', mb: 5,
                        fontWeight: 400, lineHeight: 1.7,
                        fontSize: { xs: '1rem', md: '1.15rem' },
                    }}>
                        AI-powered triage, semantic threading, and a chat assistant that
                        understands your emails. Connect Gmail or Outlook and take back
                        control of your inbox.
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <Button variant="contained" size="large"
                            startIcon={<GoogleIcon />}
                            href={getLoginUrl()}
                            sx={{
                                px: 4, py: 1.5, bgcolor: '#fff', color: '#333',
                                fontWeight: 600, borderRadius: 3,
                                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                                '&:hover': { bgcolor: '#f5f5f5', transform: 'translateY(-2px)', boxShadow: '0 8px 24px rgba(0,0,0,0.16)' },
                                transition: 'all 0.2s ease',
                            }}>
                            Sign in with Google
                        </Button>
                        <Button variant="contained" size="large"
                            startIcon={<EmailIcon />}
                            href={getOutlookLoginUrl()}
                            sx={{
                                px: 4, py: 1.5, bgcolor: '#0078D4', color: '#fff',
                                fontWeight: 600, borderRadius: 3,
                                boxShadow: '0 4px 16px rgba(0,120,212,0.25)',
                                '&:hover': { bgcolor: '#006CBE', transform: 'translateY(-2px)', boxShadow: '0 8px 24px rgba(0,120,212,0.3)' },
                                transition: 'all 0.2s ease',
                            }}>
                            Sign in with Outlook
                        </Button>
                    </Box>

                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                        Free during beta. No credit card required.
                    </Typography>
                </Container>
            </Box>

            {/* Features Section */}
            <Box id="features" sx={{ py: { xs: 8, md: 12 } }}>
                <Container maxWidth="lg">
                    <Typography variant="h4" sx={{
                        textAlign: 'center', fontWeight: 700, mb: 2,
                        letterSpacing: '-0.02em',
                    }}>
                        Everything your inbox needs
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{
                        textAlign: 'center', mb: 8, maxWidth: 520, mx: 'auto',
                    }}>
                        Powered by AI that learns your preferences and adapts to how you work.
                    </Typography>

                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' },
                        gap: 4,
                    }}>
                        <FeatureCard
                            icon={<SpeedIcon />}
                            title="Smart Triage"
                            description="AI instantly classifies incoming emails as important, junk, spam, or needs review. Your inbox stays clean without lifting a finger."
                        />
                        <FeatureCard
                            icon={<CategoryIcon />}
                            title="Semantic Threading"
                            description="Emails are grouped by topic, not just reply chains. The AI understands context and clusters related conversations automatically."
                        />
                        <FeatureCard
                            icon={<ChatIcon />}
                            title="AI Chat Assistant"
                            description="Ask questions about your emails, draft replies, create filtering rules, and manage your inbox through natural conversation."
                        />
                        <FeatureCard
                            icon={<RuleIcon />}
                            title="Learned Rules"
                            description="Teach the AI your preferences. Override a classification once and it creates smart rules that apply to future emails."
                        />
                        <FeatureCard
                            icon={<SmartToyIcon />}
                            title="Draft Replies"
                            description="The AI drafts contextual replies matching the sender's tone. Review, edit, and send — all from within the app."
                        />
                        <FeatureCard
                            icon={<SecurityIcon />}
                            title="Multi-Account"
                            description="Connect Gmail and Outlook together. Manage all your email from a single intelligent dashboard."
                        />
                    </Box>
                </Container>
            </Box>

            {/* Pricing Section */}
            <Box id="pricing" sx={{
                py: { xs: 8, md: 12 },
                bgcolor: 'background.default',
            }}>
                <Container maxWidth="lg">
                    <Chip label="Beta Pricing" color="primary" variant="outlined"
                        sx={{ display: 'flex', width: 'fit-content', mx: 'auto', mb: 3 }} />

                    <Typography variant="h4" sx={{
                        textAlign: 'center', fontWeight: 700, mb: 2,
                        letterSpacing: '-0.02em',
                    }}>
                        Simple, transparent pricing
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{
                        textAlign: 'center', mb: 8, maxWidth: 480, mx: 'auto',
                    }}>
                        All tiers are free during the beta. Pricing will be finalised before general availability.
                    </Typography>

                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' },
                        gap: 3,
                        maxWidth: 960,
                        mx: 'auto',
                    }}>
                        <PricingCard
                            tier="Free"
                            price="$0"
                            period="forever"
                            description="For personal use"
                            features={[
                                '1 email account',
                                'AI triage (50 emails/day)',
                                'Basic threading',
                                '10 AI chat messages/day',
                                'Community support',
                            ]}
                            cta="Get Started"
                            ctaVariant="outlined"
                        />
                        <PricingCard
                            tier="Pro"
                            price="$9"
                            period="/month"
                            description="For power users"
                            highlighted
                            features={[
                                '2 email accounts',
                                'Unlimited AI triage',
                                'Advanced semantic threading',
                                'Unlimited AI chat',
                                'Draft replies & sending',
                                'Custom triage rules',
                                'Priority support',
                            ]}
                            cta="Start Free Trial"
                            ctaVariant="contained"
                        />
                        <PricingCard
                            tier="Max"
                            price="$24"
                            period="/month"
                            description="For teams & professionals"
                            features={[
                                '5 email accounts',
                                'Everything in Pro',
                                'Team shared rules',
                                'API access',
                                'Advanced analytics',
                                'Dedicated support',
                                'Early access to features',
                            ]}
                            cta="Contact Us"
                            ctaVariant="outlined"
                        />
                    </Box>

                    <Typography variant="caption" color="text.secondary" sx={{
                        display: 'block', textAlign: 'center', mt: 4,
                    }}>
                        Prices shown are indicative and subject to change before general availability.
                        All features are available during the beta at no cost.
                    </Typography>
                </Container>
            </Box>

            {/* Footer */}
            <Box id="support" component="footer" sx={{
                bgcolor: '#1a1a2e', color: '#e2e4f0',
                pt: { xs: 6, md: 8 }, pb: 4,
            }}>
                <Container maxWidth="lg">
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '2fr 1fr 1fr 1fr' },
                        gap: { xs: 4, md: 6 },
                        mb: 6,
                    }}>
                        {/* Brand */}
                        <Box>
                            <AppBrand sx={{ mb: 1.5 }} />
                            <Typography variant="body2" sx={{ color: '#9298b8', maxWidth: 280, lineHeight: 1.7 }}>
                                AI-powered email management that learns how you work.
                                Currently in beta — join early and shape the product.
                            </Typography>
                        </Box>

                        {/* Product */}
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.08em', color: '#9298b8' }}>
                                Product
                            </Typography>
                            <FooterLink href="#features">Features</FooterLink>
                            <FooterLink href="#pricing">Pricing</FooterLink>
                            <FooterLink href="/app">Dashboard</FooterLink>
                            <FooterLink>Changelog</FooterLink>
                        </Box>

                        {/* Support */}
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.08em', color: '#9298b8' }}>
                                Support
                            </Typography>
                            <FooterLink>Help Center</FooterLink>
                            <FooterLink>Documentation</FooterLink>
                            <FooterLink href="mailto:support@emailaiassistant.com">Contact Us</FooterLink>
                            <FooterLink>Status</FooterLink>
                        </Box>

                        {/* Legal */}
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.08em', color: '#9298b8' }}>
                                Legal
                            </Typography>
                            <FooterLink>Privacy Policy</FooterLink>
                            <FooterLink>Terms of Service</FooterLink>
                            <FooterLink>Cookie Policy</FooterLink>
                        </Box>
                    </Box>

                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 3 }} />

                    <Box sx={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        flexWrap: 'wrap', gap: 2,
                    }}>
                        <Typography variant="caption" sx={{ color: '#9298b8' }}>
                            &copy; {new Date().getFullYear()} EMail-AI-Laundry. All rights reserved.
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <IconButton size="small" sx={{ color: '#9298b8', '&:hover': { color: '#e2e4f0' } }}>
                                <XIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                            <IconButton size="small" sx={{ color: '#9298b8', '&:hover': { color: '#e2e4f0' } }}>
                                <GitHubIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                            <IconButton size="small" sx={{ color: '#9298b8', '&:hover': { color: '#e2e4f0' } }}>
                                <EmailIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Box>
                    </Box>
                </Container>
            </Box>
        </Box>
    );
}

/* --- Sub-components --- */

function NavLink({ href, children }) {
    return (
        <MuiLink href={href} underline="none" sx={{
            color: 'text.secondary', fontSize: '0.875rem', fontWeight: 500,
            '&:hover': { color: 'primary.main' },
            transition: 'color 0.15s',
        }}>
            {children}
        </MuiLink>
    );
}

function FeatureCard({ icon, title, description }) {
    return (
        <Paper elevation={0} sx={{
            p: 4, borderRadius: 3,
            border: 1, borderColor: 'divider',
            transition: 'all 0.2s ease',
            '&:hover': {
                borderColor: 'primary.light',
                boxShadow: '0 8px 32px rgba(124,110,240,0.08)',
                transform: 'translateY(-4px)',
            },
        }}>
            <Box sx={{
                width: 48, height: 48, borderRadius: 2,
                background: 'linear-gradient(135deg, rgba(124,110,240,0.1), rgba(167,139,250,0.1))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                mb: 2.5,
                color: 'primary.main',
            }}>
                {icon}
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, fontSize: '1.05rem' }}>
                {title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                {description}
            </Typography>
        </Paper>
    );
}

function PricingCard({ tier, price, period, description, features, highlighted, cta, ctaVariant }) {
    return (
        <Paper elevation={highlighted ? 3 : 0} sx={{
            p: 4, borderRadius: 3,
            border: highlighted ? 2 : 1,
            borderColor: highlighted ? 'primary.main' : 'divider',
            position: 'relative',
            transition: 'all 0.2s ease',
            '&:hover': { transform: 'translateY(-4px)' },
        }}>
            {highlighted && (
                <Chip label="Most Popular" size="small" color="primary"
                    sx={{
                        position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                        fontWeight: 600, fontSize: '0.7rem',
                    }}
                />
            )}

            <Typography variant="subtitle2" color="primary.main" sx={{ fontWeight: 600, mb: 0.5 }}>
                {tier}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {description}
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mb: 3 }}>
                <Typography variant="h3" sx={{ fontWeight: 800, letterSpacing: '-0.03em' }}>
                    {price}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    {period}
                </Typography>
            </Box>

            <Button fullWidth variant={ctaVariant} size="large"
                href={getLoginUrl()}
                sx={{
                    mb: 3, py: 1.25, borderRadius: 2, fontWeight: 600,
                    ...(ctaVariant === 'contained' && {
                        bgcolor: '#7c6ef0', '&:hover': { bgcolor: '#5a4ed4' },
                    }),
                }}>
                {cta}
            </Button>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {features.map((feature, i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <CheckCircleIcon sx={{ fontSize: 18, color: 'success.main', mt: 0.1, flexShrink: 0 }} />
                        <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                            {feature}
                        </Typography>
                    </Box>
                ))}
            </Box>
        </Paper>
    );
}

function FooterLink({ href, children }) {
    return (
        <MuiLink href={href || '#'} underline="none" sx={{
            display: 'block', color: '#e2e4f0', fontSize: '0.85rem',
            mb: 1.25, opacity: 0.75,
            '&:hover': { opacity: 1, color: '#a78bfa' },
            transition: 'all 0.15s',
        }}>
            {children}
        </MuiLink>
    );
}
