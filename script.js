// Initialize map with a dark theme tile layer
const map = L.map('map', {
    zoomControl: false // Hide default zoom to look cleaner
}).setView([28.5355, 77.3910], 10);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; CARTO'
}).addTo(map);

// Add zoom control to top right
L.control.zoom({ position: 'topright' }).addTo(map);

// Layer group to hold our dynamic markers so we can clear them on new searches
let searchLayers = L.featureGroup().addTo(map);

document.getElementById('prediction-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusBox = document.getElementById('status-box');
    statusBox.style.color = '#00f3ff';
    statusBox.innerHTML = 'UPLINK ESTABLISHED...<br>COMPUTING TRAJECTORY...';

    // Gather data
    const payload = {
        last_lat: document.getElementById('last_lat').value,
        last_lon: document.getElementById('last_lon').value,
        altitude_ft: document.getElementById('alt').value,
        speed_knots: document.getElementById('spd').value,
        heading_deg: document.getElementById('hdg').value,
        vertical_speed_fpm: document.getElementById('vspd').value
    };

    try {
        // Ping our Python Backend
        const response = await fetch('http://127.0.0.1:5000/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.status === 'success') {
            plotResults(payload, data);
            statusBox.style.color = '#00ff66';
            statusBox.innerHTML = `TARGET ACQUIRED.<br>LAT: ${data.predicted_lat.toFixed(5)}<br>LON: ${data.predicted_lon.toFixed(5)}`;
        }
    } catch (error) {
        statusBox.style.color = '#ff003c';
        statusBox.innerHTML = 'CONNECTION FAILED.<br>IS PYTHON SERVER RUNNING?';
        console.error("Error:", error);
    }
});

function plotResults(input, output) {
    // Clear previous search data
    searchLayers.clearLayers();

    const startPoint = [parseFloat(input.last_lat), parseFloat(input.last_lon)];
    const endPoint = [output.predicted_lat, output.predicted_lon];

    // 1. Draw Last Known Location (Blue Dot)
    const startMarker = L.circleMarker(startPoint, {
        radius: 6,
        color: '#00f3ff',
        fillColor: '#00f3ff',
        fillOpacity: 1
    }).addTo(searchLayers).bindPopup('Last Known Telemetry');

    // 2. Draw Trajectory Line
    const trajectoryLine = L.polyline([startPoint, endPoint], {
        color: '#00f3ff',
        weight: 2,
        dashArray: '5, 10'
    }).addTo(searchLayers);

    // 3. Draw Predicted Probability Zones
    // Yellow Zone (Low Probability / Outer bound - 10km radius approx)
    L.circle(endPoint, {
        color: 'yellow',
        fillColor: 'yellow',
        fillOpacity: 0.1,
        radius: 10000 
    }).addTo(searchLayers);

    // Orange Zone (Medium Probability - 5km radius approx)
    L.circle(endPoint, {
        color: 'orange',
        fillColor: 'orange',
        fillOpacity: 0.2,
        radius: 5000 
    }).addTo(searchLayers);

    // Red Zone (High Probability / Centroid - 2km radius approx)
    L.circle(endPoint, {
        color: '#ff003c',
        fillColor: '#ff003c',
        fillOpacity: 0.4,
        radius: 2000 
    }).addTo(searchLayers).bindPopup('<b>PRIMARY TARGET ZONE</b>');

    // Smoothly pan and zoom camera to fit the entire flight path and zones
    map.flyToBounds(searchLayers.getBounds(), { padding: [50, 50], duration: 1.5 });
}
