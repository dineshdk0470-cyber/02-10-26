const db = require('../config/db');
const { evaluateAlerts } = require('./alertEngine');

// Active simulation intervals keyed by patient_id string
const activeSimulations = {};

// Simulation tick every 2 seconds
const TICK_INTERVAL_MS = 2000;

// Drain rate: % per tick (randomized for realism)
const BASE_DRAIN_RATE = 0.8;

/**
 * Start sensor simulation for a patient.
 * @param {string}   patientId  NeDB Id string
 * @param {Object}   io         Socket.IO server instance
 */
const startSimulation = (patientId, io) => {
    if (activeSimulations[patientId]) {
        console.log(`⚠️  [Simulator] Already running for patient ${patientId}`);
        return;
    }

    console.log(`🚀 [Simulator] Starting for patient ${patientId}`);

    const interval = setInterval(async () => {
        try {
            const status = await db.ivStatus.findOneAsync({ patient_id: patientId });
            if (!status || !status.is_running) {
                stopSimulation(patientId);
                return;
            }

            // ── Realistic drain with randomness ──────────
            const drain = BASE_DRAIN_RATE + (Math.random() * 0.6 - 0.3); // ±0.3%
            let newLevel = Math.max(0, status.fluid_level - drain);

            // ── Random flow rate fluctuation ──────────────
            let newFlowRate = status.flow_rate + (Math.random() * 4 - 2);
            newFlowRate = Math.max(0, Math.min(200, newFlowRate));

            // ── 3% chance of leakage per tick ────────────
            const leakageEvent = Math.random() < 0.03;
            if (leakageEvent) {
                newLevel = Math.max(0, newLevel - 5); // extra drain on leakage
                newFlowRate = 0;
            }

            // ── 2% chance of momentary disconnection ─────
            const disconnectEvent = Math.random() < 0.02;

            // ── Time remaining calculation ────────────────
            const timeRemaining = newLevel <= 0 ? 0
                : newFlowRate > 0
                    ? (newLevel / 100 * (status.bottle_volume_ml || 500)) / newFlowRate * 60
                    : 999;

            // ── Persist new state ─────────────────────────
            const update = {
                fluid_level: parseFloat(newLevel.toFixed(2)),
                flow_rate: parseFloat(newFlowRate.toFixed(1)),
                time_remaining_mins: parseFloat(timeRemaining.toFixed(1)),
                leakage_detected: leakageEvent,
                is_connected: !disconnectEvent,
                last_updated: new Date()
            };

            await db.ivStatus.updateAsync({ _id: status._id }, { $set: update });
            const updatedStatus = await db.ivStatus.findOneAsync({ _id: status._id });

            // ── Build broadcast payload ───────────────────
            const payload = {
                patientId:      patientId,
                fluidLevel:     updatedStatus.fluid_level,
                flowRate:       updatedStatus.flow_rate,
                timeRemaining:  updatedStatus.time_remaining_mins,
                leakage:        updatedStatus.leakage_detected,
                connected:      updatedStatus.is_connected,
                timestamp:      updatedStatus.last_updated
            };

            // Emit to all connected dashboard clients
            io.emit('sensor_update', payload);

            // Run alert engine on every tick
            await evaluateAlerts(updatedStatus, io);

            // ── Auto-reconnect simulation ─────────────────
            if (disconnectEvent) {
                setTimeout(async () => {
                    await db.ivStatus.updateAsync({ patient_id: patientId }, { $set: { is_connected: true } });
                }, 3000);
            }

            // ── Auto-stop if bottle empty ─────────────────
            if (newLevel <= 0) {
                console.log(`🛑 [Simulator] Bottle EMPTY for patient ${patientId}`);
                await db.ivStatus.updateAsync({ _id: status._id }, { $set: { is_running: false } });
                io.emit('monitoring_stopped', { patientId, reason: 'EMPTY' });
                stopSimulation(patientId);
            }

        } catch (err) {
            console.error(`❌ [Simulator Tick Error] ${patientId}:`, err.message);
        }
    }, TICK_INTERVAL_MS);

    activeSimulations[patientId] = interval;
};

/**
 * Stop sensor simulation for a patient.
 */
const stopSimulation = (patientId) => {
    if (activeSimulations[patientId]) {
        clearInterval(activeSimulations[patientId]);
        delete activeSimulations[patientId];
        console.log(`🛑 [Simulator] Stopped for patient ${patientId}`);
    }
};

/**
 * Returns list of all currently active patient IDs being simulated.
 */
const getActiveSimulations = () => Object.keys(activeSimulations);

module.exports = { startSimulation, stopSimulation, getActiveSimulations };
