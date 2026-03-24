import React from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

/**
 * EMail-AI-Laundry brand name with highlighted capitals/dashes.
 * Capital letters and dashes get the gradient highlight, lowercase gets faded neutral.
 *
 * @param {object} props
 * @param {'h4'|'h5'|'h6'|'subtitle1'} [props.variant='h6'] — MUI Typography variant
 * @param {number} [props.fontSize] — override font size
 * @param {object} [props.sx] — additional sx styles on the wrapper
 * @param {function} [props.onClick] — click handler
 */
export default function AppBrand({ variant = 'h6', fontSize, sx = {}, onClick }) {
    const highlight = {
        background: 'linear-gradient(135deg, #7c6ef0, #a78bfa)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        fontWeight: 700,
    };
    const faded = {
        color: '#9298b8',
        fontWeight: 400,
    };

    return (
        <Typography
            variant={variant}
            component="span"
            sx={{
                cursor: onClick ? 'pointer' : 'inherit',
                fontSize,
                display: 'inline-flex',
                letterSpacing: '-0.01em',
                ...sx,
            }}
            onClick={onClick}
        >
            <Box component="span" sx={highlight}>E</Box>
            <Box component="span" sx={highlight}>M</Box>
            <Box component="span" sx={faded}>ail</Box>
            <Box component="span" sx={highlight}>-</Box>
            <Box component="span" sx={highlight}>A</Box>
            <Box component="span" sx={highlight}>I</Box>
            <Box component="span" sx={highlight}>-</Box>
            <Box component="span" sx={highlight}>L</Box>
            <Box component="span" sx={faded}>aundry</Box>
        </Typography>
    );
}
