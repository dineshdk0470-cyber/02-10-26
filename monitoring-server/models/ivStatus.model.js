const mongoose = require('mongoose');

const ivStatusSchema = new mongoose.Schema({
    patient_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Patient',
        required: true,
        unique: true
    },
    fluid_level: {
        type: Number,
        min: 0,
        max: 100,
        default: 100
    },
    flow_rate: {
        type: Number,
        default: 45,
        min: 0
    },
    bottle_volume_ml: {
        type: Number,
        default: 500
    },
    time_remaining_mins: {
        type: Number,
        default: 0
    },
    is_running: {
        type: Boolean,
        default: false
    },
    is_connected: {
        type: Boolean,
        default: true
    },
    leakage_detected: {
        type: Boolean,
        default: false
    },
    started_at: {
        type: Date,
        default: null
    },
    stopped_at: {
        type: Date,
        default: null
    },
    last_updated: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

module.exports = mongoose.model('IVStatus', ivStatusSchema);
