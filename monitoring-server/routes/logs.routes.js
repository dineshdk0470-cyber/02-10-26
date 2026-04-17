const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/verifyToken.middleware');

// GET /api/logs — Full IV usage log report
router.get('/', verifyToken, async (req, res) => {
    try {
        const { patient_id, limit = 100 } = req.query;
        const filter = {};
        if (patient_id) filter.patient_id = patient_id;

        // Get all IVStatus history
        let statuses = await db.ivStatus.findAsync(filter);
        statuses.sort((a,b) => new Date(b.last_updated) - new Date(a.last_updated));
        statuses = statuses.slice(0, parseInt(limit));

        const rawLogs = await Promise.all(statuses.map(async (s) => {
            const p = await db.patients.findOneAsync({ _id: s.patient_id });
            return { ...s, patient_id: p };
        }));

        // Aggregate summary per patient
        const patients = await db.patients.findAsync({});
        const summary = await Promise.all(patients.map(async (p) => {
            const iv = await db.ivStatus.findOneAsync({ patient_id: p._id });
            const allAlerts = await db.alerts.findAsync({ patient_id: p._id });
            
            const totalAlerts = allAlerts.length;
            const criticalAlerts = allAlerts.filter(a => a.priority === 'CRITICAL').length;
            const unresolvedAlerts = allAlerts.filter(a => !a.resolved).length;

            return {
                patient: { id: p._id, name: p.name, room: p.room_number, bed: p.bed_number, status: p.status },
                ivStatus: iv ? {
                    fluidLevel:    iv.fluid_level,
                    flowRate:      iv.flow_rate,
                    isRunning:     iv.is_running,
                    startedAt:     iv.started_at,
                    stoppedAt:     iv.stopped_at,
                    lastUpdated:   iv.last_updated
                } : null,
                alerts: { total: totalAlerts, critical: criticalAlerts, unresolved: unresolvedAlerts }
            };
        }));

        res.json({
            success: true,
            generatedAt: new Date().toISOString(),
            summary,
            rawLogs
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/logs/patient/:id — Per-patient log
router.get('/patient/:id', verifyToken, async (req, res) => {
    try {
        const patient = await db.patients.findOneAsync({ _id: req.params.id });
        if (!patient) return res.status(404).json({ success: false, error: 'Patient not found.' });

        const iv = await db.ivStatus.findOneAsync({ patient_id: req.params.id });
        const alerts = await db.alerts.findAsync({ patient_id: req.params.id });
        alerts.sort((a,b) => new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt));

        res.json({
            success: true,
            patient,
            ivStatus: iv,
            alerts,
            stats: {
                totalAlerts: alerts.length,
                criticalAlerts: alerts.filter(a => a.priority === 'CRITICAL').length,
                resolvedAlerts: alerts.filter(a => a.resolved).length
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
