/**
 * IV Monitor — Static Frontend Server
 * Serves login.html and index.html on http://localhost:3000
 * The backend microservices (auth + monitoring) run separately on 4000/5000.
 */
const express = require('express');
const path    = require('path');

const app  = express();
const PORT = 3000;

// Serve all files in the project root as static assets
app.use(express.static(path.join(__dirname)));

// Explicit routes for clarity
app.get('/',        (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/login',   (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════════════╗');
    console.log(`║  🌐 Frontend  →  http://localhost:${PORT}           ║`);
    console.log('║     Login    →  http://localhost:3000/login    ║');
    console.log('║     Dashboard→  http://localhost:3000/dashboard║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log('');
});
