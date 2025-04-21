/* script.js */
console.log("Garden Map script loaded.");

// --- Constants ---
const API_BASE_URL = 'http://localhost:3000/api'; // Adjust if server runs elsewhere

// Placeholder dimensions - replace with actual image dimensions
const imageWidth = 1000;
const imageHeight = 750;
const imageUrl = 'garden_map.jpg'; // UPDATED PATH: Look in root directory

// --- Wait for DOM to load before initializing map and attaching listeners ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed.");

    // Initialize the map
    const map = L.map('map', {
        crs: L.CRS.Simple, // Use simple coordinates, not lat/lng
        minZoom: -1, // Adjust as needed
        maxZoom: 2, // Adjust as needed
        center: [imageHeight / 2, imageWidth / 2], // Center the map on the image center
        zoom: 0 // Initial zoom level
    });

    // Define the image bounds based on its dimensions
    // The coordinates are [y, x] or [lat, lng] in Leaflet's default view
    // For CRS.Simple, it's often easier to think in [y, x] from the top-left corner (0,0)
    const southWest = map.unproject([0, imageHeight], map.getMaxZoom());
    const northEast = map.unproject([imageWidth, 0], map.getMaxZoom());
    const imageBounds = L.latLngBounds(southWest, northEast);

    // Add the image overlay
    L.imageOverlay(imageUrl, imageBounds).addTo(map);

    // Fit the map view to the image bounds
    map.fitBounds(imageBounds);

    // Add zoom controls
    map.addControl(new L.Control.Zoom({ position: 'topright' }));

    console.log("Map initialized.");

    // --- Get Modal Elements ---
    const modal = document.getElementById('marker-modal');
    const modalTitle = document.getElementById('modal-title');
    const markerForm = document.getElementById('marker-form');
    const markerIdInput = document.getElementById('marker-id');
    const markerLatLngInput = document.getElementById('marker-latlng');
    const plantNameInput = document.getElementById('plant-name');
    const plantedDateInput = document.getElementById('planted-date');
    const logbookInput = document.getElementById('logbook');
    const infoLinkInput = document.getElementById('info-link');
    const pictureRepoInput = document.getElementById('picture-repo');

    // --- Marker Data (Client-Side Cache) ---
    let markersData = {}; // Store client-side marker data { id: { latlng: L.LatLng, data: {...}, layer: L.Marker } }
    // We no longer need nextMarkerId on the client, the server assigns IDs

    // --- Modal Functions ---
    function openModal(options = {}) {
        markerForm.reset(); // Clear previous data
        markerIdInput.value = options.id || ''; // Set ID for editing, empty for new
        markerLatLngInput.value = options.latlng ? JSON.stringify(options.latlng) : ''; // Store latlng for new marker

        if (options.id !== undefined && markersData[options.id]) {
            // Editing existing marker
            modalTitle.textContent = "Edit Plant Marker";
            const data = markersData[options.id].data;
            plantNameInput.value = data.name || '';
            plantedDateInput.value = data.plantedDate || '';
            logbookInput.value = data.logbook || '';
            infoLinkInput.value = data.infoLink || '';
            pictureRepoInput.value = data.pictureRepo || '';
        } else {
            // Adding new marker
            modalTitle.textContent = "Add New Plant Marker";
            // Set default date if needed
            plantedDateInput.value = new Date().toISOString().split('T')[0];
        }

        modal.style.display = 'block';
        plantNameInput.focus(); // Focus the first field
    }

    // Assign closeModal to window to make it accessible from inline onclick
    window.closeModal = function() {
        modal.style.display = 'none';
        markerForm.reset();
    }

    // Close modal if user clicks outside of it
    window.onclick = function(event) {
        if (event.target == modal) {
            closeModal();
        }
    }

    // --- API Helper Function ---
    async function apiRequest(endpoint, method = 'GET', body = null) {
        const url = `${API_BASE_URL}${endpoint}`;
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
        };
        if (body) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: response.statusText }));
                console.error(`API Error (${response.status}):`, errorData.message || response.statusText);
                alert(`Error: ${errorData.message || response.statusText}`);
                throw new Error(`API request failed: ${response.status}`);
            }
            // Handle successful responses that might not have a body (e.g., DELETE)
            if (response.status === 204 || response.headers.get('content-length') === '0') {
                return null; // Or return { success: true } or similar if needed
            }
            return await response.json();
        } catch (error) {
            console.error("Network or API request error:", error);
            alert("Failed to communicate with the server. Please check the connection and try again.");
            throw error; // Re-throw to stop subsequent processing if needed
        }
    }

    // --- Marker Functions ---

    function createPopupContent(id, data) {
        // Basic popup content - can be expanded
        return `
            <h3>${data.name || 'Unnamed Plant'}</h3>
            <p>Planted: ${data.plantedDate || 'Unknown'}</p>
            <p>Log: ${data.logbook || '<i>No log entries yet.</i>'}</p>
            <p>Info: ${data.infoLink ? `<a href="${data.infoLink}" target="_blank">Link</a>` : '<i>No link</i>'}</p>
            <p>Pics: ${data.pictureRepo || '<i>No picture repository</i>'}</p>
            <hr>
            <button onclick="editMarker(${id})">Edit</button>
            <button onclick="deleteMarker(${id})">Delete</button>
        `;
    }

    // Adds a marker layer to the map and stores it in the client-side cache
    function addMarkerToMap(id, latlng, data) {
        // Convert latlng object from server if necessary (ensure it's a Leaflet LatLng)
        const leafletLatLng = (latlng instanceof L.LatLng) ? latlng : L.latLng(latlng.lat, latlng.lng);

        const marker = L.marker(leafletLatLng, {
            draggable: true
        }).addTo(map);

        marker.bindPopup(createPopupContent(id, data));

        // Store marker data and the layer itself locally
        markersData[id] = { latlng: leafletLatLng, data, layer: marker };

        // Add event listener for drag end to update position via API
        marker.on('dragend', async function(event) {
            const updatedLatLng = event.target.getLatLng();
            console.log(`Marker ${id} dragged to:`, updatedLatLng);
            try {
                await apiRequest(`/markers/${id}`, 'PUT', { latlng: updatedLatLng });
                // Update local cache after successful API call
                markersData[id].latlng = updatedLatLng;
                console.log(`Marker ${id} position updated successfully via API.`);
            } catch (error) {
                console.error(`Failed to update marker ${id} position via API.`);
                // Optional: Revert marker position visually if API call fails?
                // event.target.setLatLng(markersData[id].latlng);
            }
        });

        console.log(`Marker ${id} added/updated visually at:`, leafletLatLng);
    }

    // --- Edit/Delete Functions ---
    // Attach to window object to make them globally accessible from inline onclick handlers
    window.editMarker = function(id) {
        console.log("Opening edit modal for marker:", id);
        if (markersData[id]) {
            openModal({ id: id });
        } else {
            console.error("Cannot edit marker, ID not found:", id);
            alert("Error: Could not find marker data to edit.");
        }
    }

    window.deleteMarker = async function(id) {
        console.log("Attempting to delete marker:", id);
        if (confirm(`Are you sure you want to delete marker ${id}?`)) {
            try {
                await apiRequest(`/markers/${id}`, 'DELETE');

                // If API call is successful, remove from map and local cache
                if (markersData[id]) {
                    map.removeLayer(markersData[id].layer); // Remove from map
                    delete markersData[id]; // Remove from our data store
                    console.log("Marker deleted successfully:", id);
                } else {
                    console.warn("Marker already removed from map/cache, but delete API call succeeded for ID:", id);
                }
            } catch (error) {
                console.error(`Failed to delete marker ${id} via API.`);
                // No need to alert here as apiRequest handles it
            }
        }
    }

    // --- Map Interaction ---
    map.on('click', function(e) {
        console.log("Map clicked at: ", e.latlng);
        // Open modal to add a new marker at the clicked location
        openModal({ latlng: e.latlng });
    });

    // --- Form Handling ---
    if(markerForm) {
        markerForm.addEventListener('submit', async function(event) {
            event.preventDefault(); // Prevent actual form submission
            console.log("Form submitted");

            const id = markerIdInput.value ? markerIdInput.value : null; // Keep ID as string for API
            const latlngString = markerLatLngInput.value;

            const formData = {
                name: plantNameInput.value,
                plantedDate: plantedDateInput.value,
                logbook: logbookInput.value,
                infoLink: infoLinkInput.value,
                pictureRepo: pictureRepoInput.value
            };

            try {
                if (id && markersData[id]) {
                    // --- Update existing marker --- (Send only data, latlng updated via drag)
                    console.log("Updating marker data:", id);
                    const updatedMarker = await apiRequest(`/markers/${id}`, 'PUT', { data: formData });
                    if (updatedMarker) {
                         // Update local data store and popup
                        markersData[id].data = updatedMarker.data;
                        markersData[id].layer.setPopupContent(createPopupContent(id, updatedMarker.data));
                        console.log("Marker data updated successfully.")
                    }
                } else if (latlngString) {
                    // --- Create new marker ---
                    let latlng;
                    try {
                        latlng = JSON.parse(latlngString);
                        if (typeof latlng !== 'object' || latlng === null || !('lat' in latlng) || !('lng' in latlng)) {
                             throw new Error("Parsed latlng is not in the expected format.");
                        }
                    } catch (e) {
                        console.error("Error parsing latlng string:", latlngString, e);
                        alert("Error: Invalid location data for new marker.");
                        return;
                    }

                    console.log("Creating new marker with data:", formData);
                    const newMarker = await apiRequest('/markers', 'POST', { latlng: latlng, data: formData });
                    if (newMarker) {
                        addMarkerToMap(newMarker.id, newMarker.latlng, newMarker.data); // Add to map using ID from server
                        console.log("New marker created successfully with ID:", newMarker.id);
                    }
                } else {
                    console.error("Form submitted without ID or LatLng.");
                    alert("Error: Cannot save marker without location or ID.");
                    return;
                }

                closeModal();
            } catch (error) {
                console.error("Error saving marker:", error);
                // No need to alert here as apiRequest handles it
            }
        });
    } else {
        console.error("Marker form element not found!");
    }

    // --- Initial Load --- Function to load markers from server
    async function loadInitialMarkers() {
        console.log("Loading initial markers from server...");
        try {
            const markers = await apiRequest('/markers');
            // Clear existing markers from map if any (e.g., during hot-reload)
            for (const id in markersData) {
                if (markersData[id].layer) {
                    map.removeLayer(markersData[id].layer);
                }
            }
            markersData = {}; // Reset local cache

            // Add markers from server to map
            for (const id in markers) {
                const markerInfo = markers[id];
                addMarkerToMap(id, markerInfo.latlng, markerInfo.data);
            }
            console.log("Initial markers loaded successfully.");
        } catch (error) {
            console.error("Failed to load initial markers:", error);
            alert("Could not load markers from the server. Please ensure the server is running and try refreshing.");
        }
    }

    // Load markers now that the DOM is ready
    loadInitialMarkers();

    console.log("Marker handling setup completed with modal and API integration.");

}); // End of DOMContentLoaded listener 