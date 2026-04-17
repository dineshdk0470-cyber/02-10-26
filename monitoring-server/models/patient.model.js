const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Patient name is required'],
        trim: true
    },
    age: {
        type: Number,
        min: 0,
        max: 150
    },
    room_number: {
        type: String,
        required: [true, 'Room number is required'],
        trim: true
    },
    bed_number: {
        type: String,
        default: 'A'
    },
    diagnosis: {
        type: String,
        default: 'General'
    },
    assigned_doctor: {
        type: String,
        default: 'Unassigned'
    },
    status: {
        type: String,
        enum: ['active', 'discharged', 'critical'],
        default: 'active'
    },
    admitted_at: {
        type: Date,
        default: Date.now
    },
    discharged_at: {
        type: Date,
        default: null
    }
}, { timestamps: true });

module.exports = mongoose.model('Patient', patientSchema);
