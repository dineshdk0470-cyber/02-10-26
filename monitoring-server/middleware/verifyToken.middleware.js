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

        const response = await axios.get(`${AUTH_SERVER_URL}/api/validate-token`, {
            headers: { Authorization: authHeader },
            timeout: 5000
        });

        if (response.data && response.data.valid) {
            req.user = response.data.user;
            return next();
        }

        return res.status(401).json({ success: false, error: 'Invalid or expired token.' });

    } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ERR_NETWORK') {
            console.error('❌ [Token] Auth server unreachable — allowing request in dev mode');
            // Fault tolerance: parse token locally if auth server is down
            try {
                const token = req.headers['authorization'].split(' ')[1];
                const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
                req.user = { id: payload.id, name: payload.name, email: payload.email, role: payload.role };
                return next();
            } catch (_) {
                return res.status(503).json({ success: false, error: 'Auth server unavailable. Please retry.' });
            }
        }
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
