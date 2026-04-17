const Datastore = require('@seald-io/nedb');

const db = {
    patients:  new Datastore({ inMemoryOnly: true }),
    ivStatus:  new Datastore({ inMemoryOnly: true }),
    alerts:    new Datastore({ inMemoryOnly: true })
};

db.ivStatus.ensureIndex({ fieldName: 'patient_id', unique: true });

console.log('✅ [Monitor-DB] NeDB in-memory datastores initialized');

module.exports = db;
