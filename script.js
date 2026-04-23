// Only run the map script if the map container is on the page
if (document.getElementById('map')) {

    const map = L.map('map', {
        zoomControl: false 
    }).setView([28.5355, 77.3910], 10);

    // 1. BASE LAYER: Realistic Satellite Imagery
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    }).addTo(map);

    // 2. OVERLAY LAYER: City names, country borders, oceans, and roads
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Labels &copy; Esri'
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    let searchLayers = L.featureGroup().addTo(map);

    document.getElementById('prediction-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const statusBox = document.getElementById('status-box');
        statusBox.style.color = '#00f3ff';
        statusBox.innerHTML = 'UPLINK ESTABLISHED...<br>COMPUTING TRAJECTORY...';

        // Gather data (Logic completely untouched)
        const payload = {
            last_lat: document.getElementById('last_lat').value,
            last_lon: document.getElementById('last_lon').value,
            altitude_ft: document.getElementById('alt').value,
            speed_knots: document.getElementById('spd').value,
            heading_deg: document.getElementById('hdg').value,
            vertical_speed_fpm: document.getElementById('vspd').value
        };

        try {
            // Ping Python Backend
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
        searchLayers.clearLayers();

        const startPoint = [parseFloat(input.last_lat), parseFloat(input.last_lon)];
        const endPoint = [output.predicted_lat, output.predicted_lon];

        const startMarker = L.circleMarker(startPoint, {
            radius: 6,
            color: '#00f3ff',
            fillColor: '#00f3ff',
            fillOpacity: 1
        }).addTo(searchLayers).bindPopup('Last Known Telemetry');

        const trajectoryLine = L.polyline([startPoint, endPoint], {
            color: '#00f3ff',
            weight: 2,
            dashArray: '5, 10'
        }).addTo(searchLayers);

        L.circle(endPoint, {
            color: '#facc15',
            fillColor: '#facc15',
            fillOpacity: 0.2, 
            radius: 10000 
        }).addTo(searchLayers);

        L.circle(endPoint, {
            color: '#fb923c', 
            fillColor: '#fb923c',
            fillOpacity: 0.3,
            radius: 5000 
        }).addTo(searchLayers);

        L.circle(endPoint, {
            color: '#ff003c',
            fillColor: '#ff003c',
            fillOpacity: 0.6,
            radius: 2000 
        }).addTo(searchLayers).bindPopup('<b>PRIMARY TARGET ZONE</b>');

        map.flyToBounds(searchLayers.getBounds(), { padding: [50, 50], duration: 1.5 });
    }
}
