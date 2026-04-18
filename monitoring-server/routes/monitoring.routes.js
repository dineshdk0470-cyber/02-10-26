const express = require('express');
const router = express.Router();
const { Patient, IVStatus } = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/verifyToken.middleware');
const { startSimulation, stopSimulation, getActiveSimulations } = require('../services/sensorSimulator');
const { fireOperationalAlert } = require('../services/alertEngine');

// Injected by monitoring server.js
let ioRef = null;
const setIO = (io) => { ioRef = io; };

// POST /api/start-monitoring
router.post('/start-monitoring', verifyToken, requireRole('doctor', 'nurse', 'admin'), async (req, res) => {
    try {
        const { patient_id, fluid_level, flow_rate, bottle_volume_ml } = req.body;
        if (!patient_id) return res.status(400).json({ success: false, error: 'patient_id is required.' });

        const patient = await Patient.findByPk(patient_id);
        if (!patient) return res.status(404).json({ success: false, error: 'Patient not found.' });

        let status = await IVStatus.findOne({ where: { patient_id } });
        if (!status) {
            status = await IVStatus.create({ patient_id });
        }

        if (status.is_running) {
            return res.status(409).json({ success: false, error: 'Monitoring already running for this patient.' });
        }

        // Set starting values
        const update = {
            fluid_level: fluid_level !== undefined ? fluid_level : 100,
            flow_rate: flow_rate || 45,
            bottle_volume_ml: bottle_volume_ml || 500,
            is_running: true,
            is_connected: true,
            leakage_detected: false,
            started_at: new Date(),
            stopped_at: null,
            last_updated: new Date()
        };

        await status.update(update);

        startSimulation(patient_id, ioRef);

        await fireOperationalAlert(
            patient,
            'STARTED',
            `✅ Monitoring STARTED for ${patient.name} in Room ${patient.room_number} by ${req.user.name}.`,
            ioRef
        );

        ioRef.emit('monitoring_started', { patientId: patient_id, patient: patient.name });
        console.log(`▶️  [Monitor] Started for ${patient.name}`);

        res.json({ success: true, message: `Monitoring started for ${patient.name}.`, status: status.toJSON() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/stop-monitoring
router.post('/stop-monitoring', verifyToken, requireRole('doctor', 'nurse', 'admin'), async (req, res) => {
    try {
        const { patient_id } = req.body;
        if (!patient_id) return res.status(400).json({ success: false, error: 'patient_id is required.' });

        const patient = await Patient.findByPk(patient_id);
        if (!patient) return res.status(404).json({ success: false, error: 'Patient not found.' });

        const status = await IVStatus.findOne({ where: { patient_id } });
        if (!status || !status.is_running) {
            return res.status(409).json({ success: false, error: 'Monitoring is not running for this patient.' });
        }

        await status.update({ is_running: false, stopped_at: new Date(), last_updated: new Date() });

        stopSimulation(patient_id);

        await fireOperationalAlert(
            patient,
            'STOPPED',
            `🛑 Monitoring STOPPED for ${patient.name} in Room ${patient.room_number} by ${req.user.name}.`,
            ioRef
        );

        ioRef.emit('monitoring_stopped', { patientId: patient_id, patient: patient.name });
        console.log(`⏹️  [Monitor] Stopped for ${patient.name}`);

        res.json({ success: true, message: `Monitoring stopped for ${patient.name}.`, status: status.toJSON() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/active-monitoring — List all currently active simulations
router.get('/active-monitoring', verifyToken, async (req, res) => {
    try {
        const activeIds = getActiveSimulations();
        const statuses = await IVStatus.findAll({ where: { patient_id: activeIds, is_running: true } });
        
        const result = await Promise.all(statuses.map(async (s) => {
            const p = await Patient.findByPk(s.patient_id);
            return { ...s.toJSON(), patient_id: p ? p.toJSON() : null }; // Mimic Mongoose populate
        }));

        res.json({ success: true, count: result.length, active: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = { router, setIO };
