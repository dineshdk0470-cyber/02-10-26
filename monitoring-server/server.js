require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const db         = require('./config/db');
const patientRoutes    = require('./routes/patients.routes');
const { router: monitoringRouter, setIO } = require('./routes/monitoring.routes');
const alertRoutes      = require('./routes/alerts.routes');
const logRoutes        = require('./routes/logs.routes');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.MONITOR_PORT || 5000;

// ── Socket.IO ─────────────────────────────────
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Inject io into monitoring routes
setIO(io);

// ── Middleware ────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, res, next) => {
    console.log(`[Monitor] ${req.method} ${req.path} — ${new Date().toLocaleTimeString()}`);
    next();
});

// ── Routes ────────────────────────────────────
app.use('/api/patients',          patientRoutes);
app.use('/api',                   monitoringRouter);
app.use('/api/alerts',            alertRoutes);
app.use('/api/logs',              logRoutes);

// ── Health Check ─────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'UP', service: 'Monitoring Server', port: PORT, time: new Date().toISOString() });
});

// ── 404 ───────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.path}` });
});

// ── Error Handler ─────────────────────────────
app.use((err, req, res, next) => {
    console.error('❌ [Monitor Unhandled]', err.message);
    res.status(500).json({ success: false, error: 'Internal server error.' });
});

// ── Socket.IO Events ──────────────────────────
io.on('connection', (socket) => {
    console.log(`🔌 [Socket.IO] Client connected: ${socket.id}`);

    // Send current state of all patients on connect
    db.ivStatus.findAsync({ is_running: true })
        .then(async (statuses) => {
            for (const s of statuses) {
                const p = await db.patients.findOneAsync({ _id: s.patient_id });
                if (p) {
                    socket.emit('sensor_update', {
                        patientId:     p._id,
                        fluidLevel:    s.fluid_level,
                        flowRate:      s.flow_rate,
                        timeRemaining: s.time_remaining_mins,
                        leakage:       s.leakage_detected,
                        connected:     s.is_connected,
                        timestamp:     s.last_updated
                    });
                }
            }
        });

    socket.on('disconnect', () => {
        console.log(`🔌 [Socket.IO] Client disconnected: ${socket.id}`);
    });
});

// ── Seed Sample Patients ──────────────────────
const seedPatients = async () => {
    try {
        const count = await db.patients.countAsync({});
        if (count > 0) return;

        const samples = [
            { name: 'Ravi Kumar',    age: 45, room_number: '101', bed_number: 'A', diagnosis: 'Post-Surgery Recovery',  assigned_doctor: 'Dr. Priya Sharma', status: 'active', admitted_at: new Date() },
            { name: 'Meena Devi',    age: 62, room_number: '102', bed_number: 'B', diagnosis: 'Severe Dehydration',      assigned_doctor: 'Dr. Priya Sharma', status: 'active', admitted_at: new Date() },
            { name: 'Arjun Patel',   age: 28, room_number: '103', bed_number: 'A', diagnosis: 'Antibiotic Treatment',   assigned_doctor: 'Dr. Priya Sharma', status: 'active', admitted_at: new Date() },
        ];

        for (const s of samples) {
            const p = await db.patients.insertAsync(s);
            await db.ivStatus.insertAsync({
                patient_id:   p._id,
                fluid_level:  Math.floor(Math.random() * 60) + 30,  // 30–90%
                flow_rate:    Math.floor(Math.random() * 40) + 30,   // 30–70 mL/hr
                is_running:   false,
                is_connected: true,
                leakage_detected: false,
                last_updated: new Date()
            });
        }

        console.log('🌱 [Monitor] Seeded 3 sample patients');
    } catch (err) {
        console.error('❌ [Seed Error]', err.message);
    }
};

// ── Start Server ──────────────────────────────
const start = async () => {
    await seedPatients();

    server.listen(PORT, () => {
        console.log('');
        console.log('╔══════════════════════════════════════════════════╗');
        console.log(`║  📡 Monitoring Server running on port ${PORT}        ║`);
        console.log('║  Endpoints:                                      ║');
        console.log('║  POST /api/patients          → Add patient       ║');
        console.log('║  GET  /api/patients          → List patients     ║');
        console.log('║  POST /api/start-monitoring  → Start IV monitor  ║');
        console.log('║  POST /api/stop-monitoring   → Stop IV monitor   ║');
        console.log('║  GET  /api/alerts            → Get alerts        ║');
        console.log('║  GET  /api/logs              → Usage logs        ║');
        console.log('║  WS   Socket.IO on port 5000 → Live updates      ║');
        console.log('╚══════════════════════════════════════════════════╝');
        console.log('');
    });
};

start();
