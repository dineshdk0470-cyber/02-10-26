require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.AUTH_PORT || 4000;

// ── Middleware ────────────────────────────────
app.use(cors({
    origin: ['http://localhost:5000', 'http://127.0.0.1:5500', '*'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Request Logger ────────────────────────────
app.use((req, res, next) => {
    console.log(`[Auth] ${req.method} ${req.path} — ${new Date().toLocaleTimeString()}`);
    next();
});

// ── Routes ────────────────────────────────────
app.use('/api', authRoutes);

// ── Health Check ─────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'UP', service: 'Auth Server', port: PORT, time: new Date().toISOString() });
});

// ── 404 Fallback ─────────────────────────────
app.use((req, res) => {
    res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.path}` });
});

// ── Error Handler ─────────────────────────────
app.use((err, req, res, next) => {
    console.error('❌ [Auth Unhandled Error]', err.message);
    res.status(500).json({ success: false, error: 'Internal server error.' });
});

// ── Seed Default Admin ────────────────────────
const seedAdmin = async () => {
    try {
        const existing = await db.users.findOneAsync({ email: 'admin@hospital.com' });
        if (!existing) {
            const hash = await bcrypt.hash('Admin@123', 10);
            await db.users.insertAsync({
                name: 'System Administrator',
                email: 'admin@hospital.com',
                password: hash,
                role: 'admin',
                isActive: true,
                created_at: new Date()
            });
            console.log('🌱 [Auth] Seeded default admin → admin@hospital.com / Admin@123');
        }

        const doctorExists = await db.users.findOneAsync({ email: 'doctor@hospital.com' });
        if (!doctorExists) {
            const hash = await bcrypt.hash('Doctor@123', 10);
            await db.users.insertAsync({
                name: 'Dr. Priya Sharma',
                email: 'doctor@hospital.com',
                password: hash,
                role: 'doctor',
                isActive: true,
                created_at: new Date()
            });
            console.log('🌱 [Auth] Seeded doctor → doctor@hospital.com / Doctor@123');
        }

        const nurseExists = await db.users.findOneAsync({ email: 'nurse@hospital.com' });
        if (!nurseExists) {
            const hash = await bcrypt.hash('Nurse@123', 10);
            await db.users.insertAsync({
                name: 'Nurse Aisha',
                email: 'nurse@hospital.com',
                password: hash,
                role: 'nurse',
                isActive: true,
                created_at: new Date()
            });
            console.log('🌱 [Auth] Seeded nurse → nurse@hospital.com / Nurse@123');
        }
    } catch (err) {
        console.error('❌ [Seed Error]', err.message);
    }
};

// ── Start Server ──────────────────────────────
const start = async () => {
    await seedAdmin();
    app.listen(PORT, () => {
        console.log('');
        console.log('╔══════════════════════════════════════════╗');
        console.log(`║  🔐 Auth Server running on port ${PORT}     ║`);
        console.log('║  Endpoints:                              ║');
        console.log('║  POST /api/register                      ║');
        console.log('║  POST /api/login                         ║');
        console.log('║  GET  /api/validate-token                ║');
        console.log('║  GET  /api/users  (admin only)           ║');
        console.log('║  GET  /health                            ║');
        console.log('╚══════════════════════════════════════════╝');
        console.log('');
        console.log('🔑 Default Credentials:');
        console.log('   Admin  → admin@hospital.com  / Admin@123');
        console.log('   Doctor → doctor@hospital.com / Doctor@123');
        console.log('   Nurse  → nurse@hospital.com  / Nurse@123');
        console.log('');
    });
};

start();
