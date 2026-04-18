const express = require('express');
const router = express.Router();
const { Patient, IVStatus } = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/verifyToken.middleware');

// POST /api/patients — Add new patient
router.post('/', verifyToken, requireRole('doctor', 'nurse', 'admin'), async (req, res) => {
    try {
        const { name, age, room_number, bed_number, diagnosis, assigned_doctor } = req.body;
        if (!name || !room_number) {
            return res.status(400).json({ success: false, error: 'Name and room number are required.' });
        }

        const patient = await Patient.create({ 
            name, age, room_number, bed_number, diagnosis, assigned_doctor,
            status: 'active'
        });

        // Auto-create IVStatus record
        await IVStatus.create({ 
            patient_id: patient.id, 
            fluid_level: 100, 
            flow_rate: 45,
            is_running: false,
            is_connected: true,
            leakage_detected: false
        });

        console.log(`✅ [Patients] Created: ${name} — Room ${room_number}`);
        res.status(201).json({ success: true, patient });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/patients — Get all patients with IV status
router.get('/', verifyToken, async (req, res) => {
    try {
        const patients = await Patient.findAll({ order: [['admitted_at', 'DESC']] });

        const result = await Promise.all(patients.map(async (p) => {
            const iv = await IVStatus.findOne({ where: { patient_id: p.id } });
            return { ...p.toJSON(), ivStatus: iv ? iv.toJSON() : null };
        }));
        res.json({ success: true, count: result.length, patients: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/patients/:id — Single patient
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const patient = await Patient.findByPk(req.params.id);
        if (!patient) return res.status(404).json({ success: false, error: 'Patient not found.' });
        const iv = await IVStatus.findOne({ where: { patient_id: patient.id } });
        res.json({ success: true, patient: { ...patient.toJSON(), ivStatus: iv ? iv.toJSON() : null } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/patients/:id — Update patient
router.put('/:id', verifyToken, requireRole('doctor', 'admin'), async (req, res) => {
    try {
        await Patient.update(req.body, { where: { id: req.params.id } });
        const patient = await Patient.findByPk(req.params.id);
        if (!patient) return res.status(404).json({ success: false, error: 'Patient not found.' });
        res.json({ success: true, patient });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/patients/:id — Remove patient (admin only)
router.delete('/:id', verifyToken, requireRole('admin'), async (req, res) => {
    try {
        await Patient.destroy({ where: { id: req.params.id } });
        // IVStatus is cascaded automatically by our schema, but we can destroy it specifically
        await IVStatus.destroy({ where: { patient_id: req.params.id } });
        res.json({ success: true, message: 'Patient and IV record removed.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
