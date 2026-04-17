const db = require('../config/db');

// Priority matrix
const ALERT_PRIORITY = {
    STARTED:      'LOW',
    STOPPED:      'LOW',
    RESTORED:     'LOW',
    LOW_FLUID:    'MEDIUM',    // overridden below based on level
    LEAKAGE:      'HIGH',
    EMPTY:        'CRITICAL',
    DISCONNECTED: 'CRITICAL'
};

// Track last alert state per patient to avoid duplicate alerts
const lastAlertState = {};

/**
 * Evaluate current IVStatus and fire alerts if state changed.
 * @param {Object} status IVStatus document
 * @param {Object} io     Socket.IO server instance
 */
const evaluateAlerts = async (status, io) => {
    try {
        const patient = await db.patients.findOneAsync({ _id: status.patient_id });
        if (!patient) return;

        const pid = status.patient_id.toString();
        const prev = lastAlertState[pid] || {};
        const alerts = [];

        // ── DISCONNECTED ──────────────────────────────────
        if (!status.is_connected && prev.is_connected !== false) {
            alerts.push({
                alert_type: 'DISCONNECTED',
                priority: 'CRITICAL',
                message: `⚠️ CRITICAL: IV sensor disconnected for ${patient.name} in Room ${patient.room_number}.`
            });
        }

        // ── LEAKAGE ───────────────────────────────────────
        if (status.leakage_detected && !prev.leakage_detected) {
            alerts.push({
                alert_type: 'LEAKAGE',
                priority: 'HIGH',
                message: `🔴 HIGH: Possible IV tube leakage detected for ${patient.name} in Room ${patient.room_number}.`
            });
        }

        // ── EMPTY ─────────────────────────────────────────
        if (status.fluid_level <= 0 && prev.fluid_level > 0) {
            alerts.push({
                alert_type: 'EMPTY',
                priority: 'CRITICAL',
                message: `🚨 CRITICAL: IV bag EMPTY for ${patient.name} in Room ${patient.room_number}. Replace immediately!`
            });
            // Update patient status to critical
            await db.patients.updateAsync({ _id: status.patient_id }, { $set: { status: 'critical' } });
        }

        // ── LOW FLUID ─────────────────────────────────────
        const prevWasNormal = (prev.fluid_level === undefined || prev.fluid_level >= 30);
        if (status.fluid_level > 0 && status.fluid_level < 10 && prev.fluid_level >= 10) {
            alerts.push({
                alert_type: 'LOW_FLUID',
                priority: 'HIGH',
                message: `🔴 HIGH: IV fluid critically low (${status.fluid_level.toFixed(1)}%) for ${patient.name} in Room ${patient.room_number}.`
            });
        } else if (status.fluid_level >= 10 && status.fluid_level < 30 && prevWasNormal) {
            alerts.push({
                alert_type: 'LOW_FLUID',
                priority: 'MEDIUM',
                message: `🟡 MEDIUM: IV fluid running low (${status.fluid_level.toFixed(1)}%) for ${patient.name} in Room ${patient.room_number}.`
            });
        }

        // ── RESTORED ─────────────────────────────────────
        if (status.fluid_level > 0 && prev.fluid_level <= 0) {
            alerts.push({
                alert_type: 'RESTORED',
                priority: 'LOW',
                message: `✅ LOW: IV bag replaced — ${patient.name} restored to ${status.fluid_level.toFixed(1)}%.`
            });
            await db.patients.updateAsync({ _id: status.patient_id }, { $set: { status: 'active' } });
        }

        // Save and emit each alert
        for (const a of alerts) {
            const alert = await db.alerts.insertAsync({
                patient_id: status.patient_id,
                alert_type: a.alert_type,
                priority: a.priority,
                message: a.message,
                fluid_level_at_alert: status.fluid_level,
                resolved: false,
                timestamp: new Date()
            });

            const populated = { ...alert, patient_id: { name: patient.name, room_number: patient.room_number } };
            io.emit('new_alert', populated);
            console.log(`🔔 [Alert] ${a.priority}: ${a.alert_type} → ${patient.name}`);
        }

        // Update state cache
        lastAlertState[pid] = {
            is_connected: status.is_connected,
            leakage_detected: status.leakage_detected,
            fluid_level: status.fluid_level
        };

    } catch (err) {
        console.error('❌ [AlertEngine Error]', err.message);
    }
};

/**
 * Fire an explicit operational alert (start/stop).
 */
const fireOperationalAlert = async (patient, alertType, message, io) => {
    try {
        const alert = await db.alerts.insertAsync({
            patient_id: patient._id,
            alert_type: alertType,
            priority: ALERT_PRIORITY[alertType] || 'LOW',
            message,
            fluid_level_at_alert: null,
            resolved: false,
            timestamp: new Date()
        });
        io.emit('new_alert', alert);
    } catch (err) {
        console.error('❌ [Operational Alert Error]', err.message);
    }
};

module.exports = { evaluateAlerts, fireOperationalAlert, lastAlertState };
