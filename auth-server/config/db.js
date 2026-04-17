const Datastore = require('@seald-io/nedb');
const path = require('path');

// In-memory datastores (no file persistence needed — pure in-memory)
const db = {
    users: new Datastore({ inMemoryOnly: true })
};

// Create indexes
db.users.ensureIndex({ fieldName: 'email', unique: true });

console.log('✅ [Auth-DB] NeDB in-memory datastore initialized');

module.exports = db;
