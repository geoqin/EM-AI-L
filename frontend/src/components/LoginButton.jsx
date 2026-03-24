import { Box, Typography, Button, Paper, Divider } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import EmailIcon from '@mui/icons-material/Email';
import { getLoginUrl, getOutlookLoginUrl } from '../api/client';
import AppBrand from './AppBrand';

export default function LoginButton() {
    return (
        <Box
            sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                py: 10,
                gap: 3,
                textAlign: 'center',
            }}
        >
            <Paper
                elevation={0}
                className="login-icon-float"
                sx={{
                    width: 80,
                    height: 80,
                    borderRadius: 4,
                    background: 'linear-gradient(135deg, #7c6ef0, #a78bfa)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '2rem',
                    boxShadow: '0 0 40px rgba(124, 110, 240, 0.15)',
                }}
            >
                📧
            </Paper>

            <AppBrand variant="h4" />

            <Typography color="text.secondary" sx={{ maxWidth: 420, lineHeight: 1.7 }}>
                Connect your email to get AI-powered summaries,
                intelligent threading, and draft replies.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1, width: 280 }}>
                <Button
                    variant="contained"
                    size="large"
                    startIcon={<GoogleIcon />}
                    href={getLoginUrl()}
                    sx={{
                        px: 4,
                        py: 1.5,
                        bgcolor: 'white',
                        color: '#333',
                        fontWeight: 600,
                        fontSize: '0.9375rem',
                        borderRadius: 3,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                        '&:hover': {
                            bgcolor: '#f5f5f5',
                            transform: 'translateY(-2px)',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                        },
                        transition: 'all 0.2s ease',
                    }}
                >
                    Sign in with Google
                </Button>

                <Divider sx={{ my: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">or</Typography>
                </Divider>

                <Button
                    variant="contained"
                    size="large"
                    startIcon={<EmailIcon />}
                    href={getOutlookLoginUrl()}
                    sx={{
                        px: 4,
                        py: 1.5,
                        bgcolor: '#0078D4',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: '0.9375rem',
                        borderRadius: 3,
                        boxShadow: '0 4px 12px rgba(0,120,212,0.3)',
                        '&:hover': {
                            bgcolor: '#006CBE',
                            transform: 'translateY(-2px)',
                            boxShadow: '0 8px 24px rgba(0,120,212,0.4)',
                        },
                        transition: 'all 0.2s ease',
                    }}
                >
                    Sign in with Outlook
                </Button>
            </Box>
        </Box>
    );
}
