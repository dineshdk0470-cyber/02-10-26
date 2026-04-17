const jwt = require('jsonwebtoken');
const db   = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'iv-monitor-super-secret-key-2024';

const verifyJWT = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
        }
        const token   = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        const user = await db.users.findOneAsync({ _id: decoded.id });
        if (!user || !user.isActive) {
            return res.status(401).json({ success: false, error: 'User not found or deactivated.' });
        }
        // Strip password before attaching
        const { password: _, ...safeUser } = user;
        req.user = safeUser;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, error: 'Token expired. Please login again.' });
        }
        return res.status(401).json({ success: false, error: 'Invalid token.' });
    }
};

const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated.' });
    if (!roles.includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            error: `Access denied. Required role(s): ${roles.join(', ')}. Your role: ${req.user.role}`
        });
    }
    next();
};

module.exports = { verifyJWT, requireRole, JWT_SECRET };
