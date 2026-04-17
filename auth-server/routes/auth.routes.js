const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../config/db');
const { verifyJWT, requireRole, JWT_SECRET } = require('../middleware/auth.middleware');

const router      = express.Router();
const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '8h';

// ── POST /api/register ────────────────────────
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ success: false, error: 'Name, email, and password are required.' });
        }
        const existing = await db.users.findOneAsync({ email: email.toLowerCase() });
        if (existing) return res.status(409).json({ success: false, error: 'Email already registered.' });

        const hashed = await bcrypt.hash(password, SALT_ROUNDS);
        const user   = await db.users.insertAsync({
            name,
            email:      email.toLowerCase(),
            password:   hashed,
            role:       role || 'nurse',
            isActive:   true,
            lastLogin:  null,
            created_at: new Date()
        });

        const { password: _, ...safeUser } = user;
        console.log(`✅ [Auth] Registered: ${email} (${role || 'nurse'})`);
        res.status(201).json({ success: true, message: 'Registration successful.', user: safeUser });
    } catch (err) {
        console.error('❌ [Register]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /api/login ───────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required.' });

        const user = await db.users.findOneAsync({ email: email.toLowerCase() });
        if (!user) return res.status(401).json({ success: false, error: 'Invalid email or password.' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ success: false, error: 'Invalid email or password.' });

        if (!user.isActive) return res.status(403).json({ success: false, error: 'Account deactivated.' });

        await db.users.updateAsync({ _id: user._id }, { $set: { lastLogin: new Date() } });

        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role, name: user.name },
            JWT_SECRET,
            { expiresIn: TOKEN_EXPIRY }
        );

        console.log(`✅ [Auth] Login: ${email} (${user.role})`);
        res.json({
            success: true,
            message: 'Login successful.',
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role }
        });
    } catch (err) {
        console.error('❌ [Login]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /api/validate-token ───────────────────
router.get('/validate-token', verifyJWT, (req, res) => {
    res.json({ success: true, valid: true, user: req.user });
});

// ── GET /api/users (admin only) ───────────────
router.get('/users', verifyJWT, requireRole('admin'), async (req, res) => {
    try {
        const users = await db.users.findAsync({});
        const safe  = users.map(({ password: _, ...u }) => u);
        res.json({ success: true, count: safe.length, users: safe });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── DELETE /api/users/:id (admin only) ────────
router.delete('/users/:id', verifyJWT, requireRole('admin'), async (req, res) => {
    try {
        const n = await db.users.removeAsync({ _id: req.params.id }, {});
        if (!n) return res.status(404).json({ success: false, error: 'User not found.' });
        res.json({ success: true, message: 'User deleted.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
