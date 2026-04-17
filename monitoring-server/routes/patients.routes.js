const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/verifyToken.middleware');

// POST /api/patients — Add new patient
router.post('/', verifyToken, requireRole('doctor', 'nurse', 'admin'), async (req, res) => {
    try {
        const { name, age, room_number, bed_number, diagnosis, assigned_doctor } = req.body;
        if (!name || !room_number) {
            return res.status(400).json({ success: false, error: 'Name and room number are required.' });
        }

        const patient = await db.patients.insertAsync({ 
            name, age, room_number, bed_number, diagnosis, assigned_doctor,
            status: 'active', admitted_at: new Date(), created_at: new Date()
        });

        // Auto-create IVStatus record
        await db.ivStatus.insertAsync({ 
            patient_id: patient._id, 
            fluid_level: 100, 
            flow_rate: 45,
            is_running: false,
            is_connected: true,
            leakage_detected: false,
            last_updated: new Date()
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
        const patients = await db.patients.findAsync({});
        // Sort manually since NeDB find doesn't have a chainable sort in some versions
        patients.sort((a,b) => new Date(b.admitted_at) - new Date(a.admitted_at));

        const result = await Promise.all(patients.map(async (p) => {
            const iv = await db.ivStatus.findOneAsync({ patient_id: p._id });
            return { ...p, ivStatus: iv || null };
        }));
        res.json({ success: true, count: result.length, patients: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/patients/:id — Single patient
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const patient = await db.patients.findOneAsync({ _id: req.params.id });
        if (!patient) return res.status(404).json({ success: false, error: 'Patient not found.' });
        const iv = await db.ivStatus.findOneAsync({ patient_id: patient._id });
        res.json({ success: true, patient: { ...patient, ivStatus: iv } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/patients/:id — Update patient
router.put('/:id', verifyToken, requireRole('doctor', 'admin'), async (req, res) => {
    try {
        const n = await db.patients.updateAsync({ _id: req.params.id }, { $set: req.body }, { returnUpdatedDocs: true });
        if (!n) return res.status(404).json({ success: false, error: 'Patient not found.' });
        const patient = await db.patients.findOneAsync({ _id: req.params.id });
        res.json({ success: true, patient });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/patients/:id — Remove patient (admin only)
router.delete('/:id', verifyToken, requireRole('admin'), async (req, res) => {
    try {
        await db.patients.removeAsync({ _id: req.params.id }, {});
        await db.ivStatus.removeAsync({ patient_id: req.params.id }, {});
        res.json({ success: true, message: 'Patient and IV record removed.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
