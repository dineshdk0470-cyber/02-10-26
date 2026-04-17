const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/verifyToken.middleware');

// GET /api/alerts — Get all alerts (filterable)
router.get('/', verifyToken, async (req, res) => {
    try {
        const { patient_id, priority, alert_type, resolved, limit = 50 } = req.query;
        const filter = {};
        if (patient_id)  filter.patient_id  = patient_id;
        if (priority)    filter.priority    = priority;
        if (alert_type)  filter.alert_type  = alert_type;
        if (resolved !== undefined) filter.resolved = resolved === 'true';

        let alerts = await db.alerts.findAsync(filter);
        
        // Manual sort and limit
        alerts.sort((a,b) => new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt));
        alerts = alerts.slice(0, parseInt(limit));

        const result = await Promise.all(alerts.map(async (a) => {
            const p = await db.patients.findOneAsync({ _id: a.patient_id });
            return { ...a, patient_id: p }; // Mimic Mongoose populate
        }));

        res.json({ success: true, count: result.length, alerts: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/alerts/critical — Only unresolved critical alerts
router.get('/critical', verifyToken, async (req, res) => {
    try {
        let alerts = await db.alerts.findAsync({ priority: 'CRITICAL', resolved: false });
        alerts.sort((a,b) => new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt));

        const result = await Promise.all(alerts.map(async (a) => {
            const p = await db.patients.findOneAsync({ _id: a.patient_id });
            return { ...a, patient_id: p };
        }));

        res.json({ success: true, count: result.length, alerts: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PATCH /api/alerts/:id/resolve — Mark alert as resolved
router.patch('/:id/resolve', verifyToken, requireRole('doctor', 'nurse', 'admin'), async (req, res) => {
    try {
        const n = await db.alerts.updateAsync(
            { _id: req.params.id },
            { $set: { resolved: true, resolved_at: new Date(), acknowledged_by: req.user.name } },
            {}
        );
        if (!n) return res.status(404).json({ success: false, error: 'Alert not found.' });
        const alert = await db.alerts.findOneAsync({ _id: req.params.id });
        res.json({ success: true, message: 'Alert resolved.', alert });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/alerts — Clear all resolved alerts (admin only)
router.delete('/clear', verifyToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await db.alerts.removeAsync({ resolved: true }, { multi: true });
        res.json({ success: true, message: `Cleared ${result} resolved alerts.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
