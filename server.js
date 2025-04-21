const express = require('express');
const fs = require('fs').promises; // Use promises for async file operations
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000; // You can change this port if needed
const MARKERS_FILE = path.join(__dirname, 'markers.json');

// --- Middleware ---
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON request bodies

// --- Helper Functions ---

// Read markers from the JSON file
async function readMarkers() {
    try {
        const data = await fs.readFile(MARKERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // If file doesn't exist or is invalid JSON, return an empty object
        if (error.code === 'ENOENT') {
            console.log("markers.json not found, starting with empty data.");
            return {};
        }
        console.error("Error reading markers file:", error);
        throw new Error('Could not read marker data.'); // Propagate error for handling
    }
}

// Write markers to the JSON file
async function writeMarkers(markers) {
    try {
        await fs.writeFile(MARKERS_FILE, JSON.stringify(markers, null, 2), 'utf8'); // Pretty print JSON
    } catch (error) {
        console.error("Error writing markers file:", error);
        throw new Error('Could not save marker data.'); // Propagate error for handling
    }
}

// --- API Routes ---

// GET /api/markers - Get all markers
app.get('/api/markers', async (req, res) => {
    console.log("GET /api/markers received");
    try {
        const markers = await readMarkers();
        res.json(markers);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/markers - Create a new marker
app.post('/api/markers', async (req, res) => {
    console.log("POST /api/markers received with body:", req.body);
    const { latlng, data } = req.body;

    if (!latlng || !data || !data.name) {
        return res.status(400).json({ message: 'Missing required marker data (latlng, data.name).' });
    }

    try {
        const markers = await readMarkers();

        // Find the next available ID
        const ids = Object.keys(markers).map(Number);
        const nextId = ids.length > 0 ? Math.max(...ids) + 1 : 0;

        const newMarker = { latlng, data };
        markers[nextId] = newMarker;

        await writeMarkers(markers);
        console.log(`Marker ${nextId} created successfully.`);
        res.status(201).json({ id: nextId, ...newMarker }); // Send back the new marker with its ID
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/markers/:id - Update an existing marker (data and/or latlng)
app.put('/api/markers/:id', async (req, res) => {
    const markerId = req.params.id;
    const { latlng, data } = req.body; // Can update position, data, or both
    console.log(`PUT /api/markers/${markerId} received with body:`, req.body);

    if (!latlng && !data) {
        return res.status(400).json({ message: 'No update data provided (latlng or data).' });
    }

    try {
        const markers = await readMarkers();

        if (!markers[markerId]) {
            return res.status(404).json({ message: `Marker with ID ${markerId} not found.` });
        }

        // Update fields selectively
        if (latlng) {
            markers[markerId].latlng = latlng;
        }
        if (data) {
            markers[markerId].data = { ...markers[markerId].data, ...data }; // Merge new data with existing
        }

        await writeMarkers(markers);
        console.log(`Marker ${markerId} updated successfully.`);
        res.json({ id: markerId, ...markers[markerId] }); // Send back the updated marker
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// DELETE /api/markers/:id - Delete a marker
app.delete('/api/markers/:id', async (req, res) => {
    const markerId = req.params.id;
    console.log(`DELETE /api/markers/${markerId} received`);

    try {
        const markers = await readMarkers();

        if (!markers[markerId]) {
            return res.status(404).json({ message: `Marker with ID ${markerId} not found.` });
        }

        delete markers[markerId];

        await writeMarkers(markers);
        console.log(`Marker ${markerId} deleted successfully.`);
        res.status(200).json({ message: `Marker ${markerId} deleted successfully.` }); // Send success status
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Garden map server listening on http://localhost:${PORT}`);
}); 