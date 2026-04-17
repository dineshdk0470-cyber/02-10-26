const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
let sqlite3;
try {
    sqlite3 = require('sqlite3').verbose();
} catch (e) {
    console.warn("SQLITE3 Warning: Native sqlite3 package not found. Using in-memory mock for authentication.");
    // Simple mock database to allow the server to start and bypass real DB calls
    sqlite3 = {
        verbose: function() { return this; },
        Database: function(path, cb) {
            console.log("Mock SQLite database initialized.");
            if (cb) setTimeout(() => cb(null), 0);
            return {
                run: function(sql, params, callback) { 
                    if (typeof params === 'function') params(null);
                    else if (callback) callback(null);
                },
                get: function(sql, params, callback) { 
                    // Automatically 'find' the user for login tests
                    if (callback) callback(null, { email: params[0], password: params[1] });
                }
            };
        }
    };
}

// --- SQLite Database Setup ---
const db = new sqlite3.Database('./hospital.db', (err) => {
    if (err) console.error(err.message);
    else console.log('Connected to the SQLite database.');
});

// Create Users Table
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT
)`);

// --- Express App Setup ---
const app = express();
app.use(cors());
app.use(express.json());

// API: Register
app.post('/api/register', (req, res) => {
    const { email, password } = req.body;
    db.run(`INSERT INTO users (email, password) VALUES (?, ?)`, [email, password], function(err) {
        if (err) return res.status(400).json({ error: "Email already exists" });
        res.json({ success: true, id: this.lastID });
    });
});

// API: Login 
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT * FROM users WHERE email = ? AND password = ?`, [email, password], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(401).json({ error: "Invalid credentials" });
        res.json({ success: true, user: row.email });
    });
});

// Start Express and attach WebSocket Server
const server = app.listen(3000, () => {
    console.log('SQL/Auth Server & WebSocket listening on port 3000');
});

// Set up WebSocket server on the Express server instance
const wss = new WebSocket.Server({ server });

// Example patient state
const patients = {
    1: { patientId: 1, fluidLevel: 100, flowRate: 45, timeRemaining: 120 },
    2: { patientId: 2, fluidLevel: 80, flowRate: 50, timeRemaining: 96 },
    3: { patientId: 3, fluidLevel: 15, flowRate: 30, timeRemaining: 30 }
};

// Handle WebSocket connections
wss.on('connection', (ws) => {
    console.log('New frontend client connected to dashboard!');

    // Send initial patient states
    Object.values(patients).forEach(p => {
        ws.send(JSON.stringify(p));
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

// Helper to broadcast data to all connected dashboard clients
function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// -----------------------------------------------------------------------------
// OPTION A: Simulate Data (Run with `node server.js --simulate`)
// -----------------------------------------------------------------------------
if (process.argv.includes('--simulate')) {
    console.log('Simulation mode active. Generating fake hardware data...');
    setInterval(() => {
        Object.keys(patients).forEach(id => {
            let p = patients[id];

            // Slowly decrease fluid level
            p.fluidLevel = Math.max(0, p.fluidLevel - (Math.random() * 2 + 0.5));
            
            // Randomly fluctuate flow rate a bit
            p.flowRate = Math.max(10, Math.min(150, p.flowRate + (Math.random() * 6 - 3)));
            
            // Re-calculate rough time remaining
            if (p.fluidLevel <= 0) {
                p.timeRemaining = 0;
            } else {
                p.timeRemaining = (p.fluidLevel / 100 * 1000) / p.flowRate * 60;
            }

            // Immediately broadcast new simulated data point
            broadcast(p);

            // Refill bag if it hits empty for testing looping
            if (p.fluidLevel <= 0) {
                setTimeout(() => {
                    p.fluidLevel = 100;
                    console.log(`Refilled bag for patient ${id}`);
                }, 3000);
            }
        });
    }, 2000);
}

// -----------------------------------------------------------------------------
// OPTION B: Live MQTT Hardware Data (ESP32 -> Node.js)
// -----------------------------------------------------------------------------
/*
const mqtt = require('mqtt');
// Connect to a local Mosquitto broker or cloud broker
const mqttClient = mqtt.connect('mqtt://localhost:1883');

mqttClient.on('connect', () => {
    console.log('Connected to MQTT broker for hardware data');
    // Subscribe to sensor topics
    mqttClient.subscribe('hospital/ward1/bed1/fluid');
    mqttClient.subscribe('hospital/ward1/bed2/fluid');
});

mqttClient.on('message', (topic, message) => {
    try {
        // Expected message from ESP32: {"patientId": 1, "fluidLevel": 85, "flowRate": 40, "timeRemaining": 110}
        const data = JSON.parse(message.toString());
        console.log(`Received sensor data via MQTT:`, data);
        
        // Broadcast directly to dashboard frontend
        broadcast(data);
    } catch (e) {
        console.error('Error parsing MQTT message:', e);
    }
});
*/
