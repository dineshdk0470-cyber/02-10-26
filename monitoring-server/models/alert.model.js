const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
    patient_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Patient',
        required: true
    },
    alert_type: {
        type: String,
        enum: ['LOW_FLUID', 'EMPTY', 'LEAKAGE', 'DISCONNECTED', 'RESTORED', 'STARTED', 'STOPPED'],
        required: true
    },
    priority: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        required: true
    },
    message: {
        type: String,
        required: true
    },
    fluid_level_at_alert: {
        type: Number,
        default: null
    },
    resolved: {
        type: Boolean,
        default: false
    },
    resolved_at: {
        type: Date,
        default: null
    },
    acknowledged_by: {
        type: String,
        default: null
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

module.exports = mongoose.model('Alert', alertSchema);
