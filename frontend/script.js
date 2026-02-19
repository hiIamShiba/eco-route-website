// --- INITIALIZATION ---
const defaultLat = 10.762622; // Ho Chi Minh City
const defaultLon = 106.660172;

const map = L.map("map").setView([defaultLat, defaultLon], 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

// Store layers with their IDs for easy lookup
// Format: { routeId: { layer: LeafletLayer, isEco: boolean } }
let routeLayerMap = {};
let bestRouteId = null;

// --- DOM ELEMENTS ---
const startInput = document.getElementById("start-input");
const destInput = document.getElementById("dest-input");
const vehicleSelect = document.getElementById("vehicle-select");
const fuelPriceInput = document.getElementById("fuel-price");
const loadingDiv = document.getElementById("loading");
const errorDiv = document.getElementById("error-msg");
const resultsPanel = document.getElementById("results-panel");
const routesList = document.getElementById("routes-list");

// --- MAIN FUNCTION ---
async function calculateRoutes() {
  // 1. Reset UI
  loadingDiv.classList.remove("hidden");
  errorDiv.classList.add("hidden");
  resultsPanel.classList.add("hidden");
  routesList.innerHTML = "";
  clearMap();

  const payload = {
    start: startInput.value,
    destination: destInput.value,
    vehicleType: vehicleSelect.value,
    fuelPrice: parseFloat(fuelPriceInput.value),
  };

  try {
    const response = await fetch("/api/calculate-route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    loadingDiv.classList.add("hidden");

    if (!response.ok)
      throw new Error(data.error || "Failed to calculate route");

    // Store the ID of the best fuel route globally
    bestRouteId = data.bestFuelRouteId;

    // 2. Render Everything
    renderMap(data);
    renderSidebar(data);

    // 3. Auto-select the Best/Eco route initially
    highlightRoute(bestRouteId);
  } catch (err) {
    loadingDiv.classList.add("hidden");
    errorDiv.textContent = err.message;
    errorDiv.classList.remove("hidden");
  }
}

// --- MAP FUNCTIONS ---

function clearMap() {
  // Remove all previous route layers
  Object.values(routeLayerMap).forEach((item) => map.removeLayer(item.layer));
  routeLayerMap = {};

  // Note: We keep the Start/End markers if we want, or clear them too.
  // For this MVP, let's clear markers by removing all layers except tiles,
  // but simply tracking layers is safer.
  map.eachLayer((layer) => {
    if (layer instanceof L.Marker || layer instanceof L.Polyline) {
      map.removeLayer(layer);
    }
  });
}

function renderMap(data) {
  // Add Start/End Markers
  const startMarker = L.marker([data.start.lat, data.start.lon])
    .addTo(map)
    .bindPopup("Start");
  const endMarker = L.marker([data.end.lat, data.end.lon])
    .addTo(map)
    .bindPopup("Destination");

  // Fit bounds to show the whole trip
  const bounds = L.latLngBounds(
    [data.start.lat, data.start.lon],
    [data.end.lat, data.end.lon],
  );
  map.fitBounds(bounds, { padding: [50, 50] });

  // Draw Routes
  data.routes.forEach((route) => {
    const isEco = route.id === data.bestFuelRouteId;

    // Initial Draw Style (will be updated by highlightRoute immediately after)
    const polyline = L.geoJSON(route.geometry, {
      style: { className: "route-line" }, // We rely on JS styling mostly
    }).addTo(map);

    // Bind Click Event to the Line
    polyline.on("click", () => {
      highlightRoute(route.id);
    });

    // Add Tooltip
    polyline.bindTooltip(
      `Fuel: ${route.fuelUsedLiters}L (${route.durationMin} mins)`,
      { sticky: true },
    );

    // Store in our map
    routeLayerMap[route.id] = {
      layer: polyline,
      isEco: isEco,
    };
  });
}

// --- SIDEBAR FUNCTIONS ---

function renderSidebar(data) {
  resultsPanel.classList.remove("hidden");

  // Sort: Eco first
  const sortedRoutes = data.routes.sort((a, b) => {
    if (a.id === data.bestFuelRouteId) return -1;
    if (b.id === data.bestFuelRouteId) return 1;
    return 0;
  });

  sortedRoutes.forEach((route) => {
    const isEco = route.id === data.bestFuelRouteId;
    const isFastest = route.isFastest;

    const card = document.createElement("div");
    // Add data-id attribute to find this card later
    card.dataset.id = route.id;
    card.className = `route-card ${isEco ? "eco-best" : ""}`;

    // Bind Click Event to the Card
    card.onclick = () => highlightRoute(route.id);

    let badges = "";
    if (isEco)
      badges += `<span class="badge badge-eco">🌿 Most Fuel Efficient</span> `;
    if (isFastest) badges += `<span class="badge badge-fast">⚡ Fastest</span>`;

    card.innerHTML = `
            ${badges}
            <div class="stats-row">
                <span>⏱ ${route.durationMin} min</span>
                <span>📏 ${route.distanceKm} km</span>
            </div>
            <div class="stats-row" style="margin-top:8px; border-top:1px solid #eee; padding-top:5px;">
                <span class="fuel-stat">⛽ ${route.fuelUsedLiters} Liters</span>
                <span class="cost-stat">💰 ${parseInt(route.fuelCost).toLocaleString()} VND</span>
            </div>
        `;
    routesList.appendChild(card);
  });
}

// --- INTERACTION LOGIC (CORE FEATURE UPDATE) ---

function highlightRoute(selectedId) {
  // 1. Update Map Styles
  Object.keys(routeLayerMap).forEach((id) => {
    // Convert id to number because object keys are strings
    const numericId = parseInt(id);
    const item = routeLayerMap[id];
    const isSelected = numericId === selectedId;

    if (isSelected) {
      // SELECTED STYLE
      const activeColor = item.isEco ? "#2e7d32" : "#1a73e8"; // Green if Eco, Blue otherwise

      item.layer.setStyle({
        color: activeColor,
        weight: 8, // Thicker
        opacity: 1.0, // Fully visible
      });

      item.layer.bringToFront(); // Ensure it draws on top of others
    } else {
      // UNSELECTED STYLE
      item.layer.setStyle({
        color: "#9aa0a6", // Grey
        weight: 4, // Thinner
        opacity: 0.4, // Faded
      });
    }
  });

  // 2. Update Sidebar Styles
  const cards = document.querySelectorAll(".route-card");
  cards.forEach((card) => {
    if (parseInt(card.dataset.id) === selectedId) {
      card.classList.add("active");
      // Scroll sidebar to show selected card if needed
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      card.classList.remove("active");
    }
  });
}
