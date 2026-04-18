const express = require('express');
const router = express.Router();
const { Patient, Alert } = require('../config/db');
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

        let alerts = await Alert.findAll({ 
            where: filter, 
            order: [['created_at', 'DESC']], 
            limit: parseInt(limit) 
        });

        const result = await Promise.all(alerts.map(async (a) => {
            const p = await Patient.findByPk(a.patient_id);
            return { ...a.toJSON(), patient_id: p ? p.toJSON() : null }; // Mimic Mongoose populate
        }));

        res.json({ success: true, count: result.length, alerts: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/alerts/critical — Only unresolved critical alerts
router.get('/critical', verifyToken, async (req, res) => {
    try {
        let alerts = await Alert.findAll({ 
            where: { priority: 'CRITICAL', resolved: false },
            order: [['created_at', 'DESC']]
        });

        const result = await Promise.all(alerts.map(async (a) => {
            const p = await Patient.findByPk(a.patient_id);
            return { ...a.toJSON(), patient_id: p ? p.toJSON() : null };
        }));

        res.json({ success: true, count: result.length, alerts: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PATCH /api/alerts/:id/resolve — Mark alert as resolved
router.patch('/:id/resolve', verifyToken, requireRole('doctor', 'nurse', 'admin'), async (req, res) => {
    try {
        await Alert.update(
            { resolved: true, resolved_at: new Date(), acknowledged_by: req.user.name },
            { where: { id: req.params.id } }
        );
        const alert = await Alert.findByPk(req.params.id);
        if (!alert) return res.status(404).json({ success: false, error: 'Alert not found.' });
        res.json({ success: true, message: 'Alert resolved.', alert });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/alerts — Clear all resolved alerts (admin only)
router.delete('/clear', verifyToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await Alert.destroy({ where: { resolved: true } });
        res.json({ success: true, message: `Cleared ${result} resolved alerts.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
