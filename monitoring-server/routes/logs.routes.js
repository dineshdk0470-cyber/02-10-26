const express = require('express');
const router = express.Router();
const { Patient, IVStatus, Alert } = require('../config/db');
const { verifyToken } = require('../middleware/verifyToken.middleware');

// GET /api/logs — Full IV usage log report
router.get('/', verifyToken, async (req, res) => {
    try {
        const { patient_id, limit = 100 } = req.query;
        const filter = {};
        if (patient_id) filter.patient_id = patient_id;

        let statuses = await IVStatus.findAll({ 
            where: filter, 
            order: [['last_updated', 'DESC']],
            limit: parseInt(limit)
        });

        const rawLogs = await Promise.all(statuses.map(async (s) => {
            const p = await Patient.findByPk(s.patient_id);
            return { ...s.toJSON(), patient_id: p ? p.toJSON() : null };
        }));

        // Aggregate summary per patient
        const patients = await Patient.findAll();
        const summary = await Promise.all(patients.map(async (p) => {
            const iv = await IVStatus.findOne({ where: { patient_id: p.id } });
            const allAlerts = await Alert.findAll({ where: { patient_id: p.id } });
            
            const totalAlerts = allAlerts.length;
            const criticalAlerts = allAlerts.filter(a => a.priority === 'CRITICAL').length;
            const unresolvedAlerts = allAlerts.filter(a => !a.resolved).length;

            return {
                patient: { id: p.id, name: p.name, room: p.room_number, bed: p.bed_number, status: p.status },
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
        const patient = await Patient.findByPk(req.params.id);
        if (!patient) return res.status(404).json({ success: false, error: 'Patient not found.' });

        const iv = await IVStatus.findOne({ where: { patient_id: req.params.id } });
        const alerts = await Alert.findAll({ 
            where: { patient_id: req.params.id },
            order: [['created_at', 'DESC']]
        });

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
