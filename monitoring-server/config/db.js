const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, '../../hospital.sqlite'),
    logging: false
});

const Patient = sequelize.define('Patient', {
    name: { type: DataTypes.STRING, allowNull: false },
    age: { type: DataTypes.INTEGER },
    room_number: { type: DataTypes.STRING, allowNull: false },
    bed_number: { type: DataTypes.STRING },
    diagnosis: { type: DataTypes.STRING },
    assigned_doctor: { type: DataTypes.STRING },
    status: { type: DataTypes.STRING, defaultValue: 'active' },
    admitted_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
    tableName: 'patients',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
});

const IVStatus = sequelize.define('IVStatus', {
    patient_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    fluid_level: { type: DataTypes.DECIMAL(5, 2), defaultValue: 100.00 },
    flow_rate: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
    time_remaining_mins: { type: DataTypes.DECIMAL(10, 2) },
    is_running: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_connected: { type: DataTypes.BOOLEAN, defaultValue: true },
    leakage_detected: { type: DataTypes.BOOLEAN, defaultValue: false },
    bottle_volume_ml: { type: DataTypes.INTEGER, defaultValue: 500 },
    started_at: { type: DataTypes.DATE },
    stopped_at: { type: DataTypes.DATE },
    last_updated: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
    tableName: 'iv_status',
    timestamps: false
});

const Alert = sequelize.define('Alert', {
    patient_id: { type: DataTypes.INTEGER, allowNull: false },
    alert_type: { type: DataTypes.STRING, allowNull: false },
    priority: { type: DataTypes.STRING, defaultValue: 'NORMAL' },
    message: { type: DataTypes.STRING },
    resolved: { type: DataTypes.BOOLEAN, defaultValue: false },
    resolved_at: { type: DataTypes.DATE },
    acknowledged_by: { type: DataTypes.STRING }
}, {
    tableName: 'alerts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
});

Patient.hasOne(IVStatus, { foreignKey: 'patient_id', onDelete: 'CASCADE' });
IVStatus.belongsTo(Patient, { foreignKey: 'patient_id' });

Patient.hasMany(Alert, { foreignKey: 'patient_id', onDelete: 'CASCADE' });
Alert.belongsTo(Patient, { foreignKey: 'patient_id' });

console.log('✅ [Monitor-DB] Sequelize + SQLite configured');

module.exports = { sequelize, Patient, IVStatus, Alert };
