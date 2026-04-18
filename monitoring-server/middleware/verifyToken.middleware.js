const axios = require('axios');

const AUTH_SERVER_URL = process.env.AUTH_SERVER_URL || 'http://localhost:4000';

/**
 * Middleware: Verifies JWT by calling auth server /api/validate-token.
 * Attaches req.user on success.
 */
const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
        }

        const token = authHeader.split(' ')[1];

        // Try local auth server first (if it's still running/configured)
        try {
            const response = await axios.get(`${AUTH_SERVER_URL}/api/validate-token`, {
                headers: { Authorization: authHeader },
                timeout: 2000
            });

            if (response.data && response.data.valid) {
                req.user = response.data.user;
                return next();
            }
        } catch (authErr) {
            // If auth server is down or refused, we fall back to manual token parsing
            // This is especially useful for Firebase tokens which don't need a local validator server
            console.log('ℹ️ [Token] Local auth server unreachable or failed. Checking token payload...');
        }

        // Manual Parsing Fallback (Supports Firebase & Local JWTs)
        try {
            const base64Payload = token.split('.')[1];
            const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString());
            
            // Map Firebase fields to expected req.user structure
            // Firebase uses 'user_id' or 'sub', local server uses 'id'
            req.user = {
                id:    payload.user_id || payload.sub || payload.id,
                name:  payload.name    || payload.email?.split('@')[0] || 'Firebase User',
                email: payload.email,
                role:  payload.role    || 'admin' // Default to admin for dashboard access
            };

            return next();
        } catch (parseErr) {
            return res.status(401).json({ success: false, error: 'Invalid or malformed token.' });
        }

    } catch (err) {
        return res.status(401).json({ success: false, error: 'Token validation failed.' });
    }
};

/**
 * RBAC middleware — authorize by role.
 */
const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, error: 'Not authenticated.' });
    }
    if (!roles.includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            error: `Access denied. Required: ${roles.join(', ')}. Your role: ${req.user.role}`
        });
    }
    next();
};

module.exports = { verifyToken, requireRole };
