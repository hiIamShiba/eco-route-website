const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "../frontend")));

// --- CONFIGURATION ---
const OSRM_API = "http://router.project-osrm.org/route/v1/driving";
const NOMINATIM_API = "https://nominatim.openstreetmap.org/search";

// --- CACHING ---
const searchCache = {};

// --- VEHICLE DATA ---
// Consumption: Liters per 100km
// Optimal Speed: The speed (km/h) where the engine is most efficient
const VEHICLES = {
  motorbike: {
    baseConsumption: 2.5,
    optimalSpeed: 50,
    dragFactor: 0.05,
  },
  car: {
    baseConsumption: 7.0,
    optimalSpeed: 80,
    dragFactor: 0.1,
  },
  truck: {
    baseConsumption: 15.0,
    optimalSpeed: 70,
    dragFactor: 0.2,
  },
};

// --- HELPER: Geocoding ---
async function getCoordinates(query) {
  try {
    const response = await axios.get(NOMINATIM_API, {
      params: {
        q: query,
        format: "json",
        limit: 1,
      },
      headers: { "User-Agent": "EcoRouteMVP/1.0" },
    });
    if (response.data && response.data.length > 0) {
      return {
        lat: parseFloat(response.data[0].lat),
        lon: parseFloat(response.data[0].lon),
        display_name: response.data[0].display_name,
      };
    }
    return null;
  } catch (error) {
    console.error("Geocoding error:", error.message);
    return null;
  }
}

// --- HELPER: Fuel Calculation Logic ---
// This is the "AI" component that optimizes based on physics heuristics
function calculateFuel(route, vehicleType) {
  const vehicle = VEHICLES[vehicleType] || VEHICLES.car;

  const distanceKm = route.distance / 1000;
  const durationHr = route.duration / 3600;

  // Avoid division by zero
  const avgSpeed = durationHr > 0 ? distanceKm / durationHr : 0;

  // Traffic/Efficiency Factor Calculation
  // If average speed is much lower than optimal, it implies stop-and-go traffic (inefficient).
  // If average speed is much higher (very rare on OSRM), drag increases.

  let efficiencyFactor = 1.0;

  if (avgSpeed < vehicle.optimalSpeed) {
    // Traffic penalty: Slower than optimal implies traffic/city driving
    // Simple curve: 10% inefficiency for every 10km/h drop
    const speedDiff = vehicle.optimalSpeed - avgSpeed;
    efficiencyFactor += (speedDiff / 20) * 0.2;
  } else {
    // Highway penalty: Drag increases with square of speed, but keeping it linear for MVP
    const speedDiff = avgSpeed - vehicle.optimalSpeed;
    efficiencyFactor += (speedDiff / 30) * 0.1;
  }

  // Base Calculation
  // (Distance / 100) * Rate * EfficiencyFactor
  const fuelUsed =
    (distanceKm / 100) * vehicle.baseConsumption * efficiencyFactor;

  return {
    fuelUsed: parseFloat(fuelUsed.toFixed(2)),
    avgSpeed: Math.round(avgSpeed),
    efficiencyFactor: parseFloat(efficiencyFactor.toFixed(2)),
  };
}

// --- API ENDPOINT ---
app.post("/api/calculate-route", async (req, res) => {
  try {
    const {
      start,
      destination,
      vehicleType,
      fuelPrice,
      startLat,
      startLon,
      destLat,
      destLon,
    } = req.body;

    let startCoords, endCoords;

    // 1. GET START COORDINATES
    if (startLat && startLon) {
      // Option A: Frontend gave us coordinates (Perfect!)
      startCoords = { lat: parseFloat(startLat), lon: parseFloat(startLon) };
    } else {
      // Option B: Frontend only gave text, we must search (Fallback)
      startCoords = await getCoordinates(start);
    }

    // 2. GET END COORDINATES
    if (destLat && destLon) {
      endCoords = { lat: parseFloat(destLat), lon: parseFloat(destLon) };
    } else {
      endCoords = await getCoordinates(destination);
    }

    // Validation
    if (!startCoords || !endCoords) {
      return res.status(404).json({
        error: "Locations not found. Please try selecting from the dropdown.",
      });
    }

    // 3. Fetch Routes from OSRM
    const osrmUrl = `${OSRM_API}/${startCoords.lon},${startCoords.lat};${endCoords.lon},${endCoords.lat}`;

    // ... (The rest of the code is exactly the same as before) ...
    const osrmResponse = await axios.get(osrmUrl, {
      params: { overview: "full", geometries: "geojson", alternatives: "true" },
    });

    if (!osrmResponse.data.routes || osrmResponse.data.routes.length === 0) {
      return res.status(404).json({ error: "No route found" });
    }

    const processedRoutes = osrmResponse.data.routes.map((route, index) => {
      const fuelStats = calculateFuel(route, vehicleType);
      const cost = fuelStats.fuelUsed * (fuelPrice || 0);

      return {
        id: index,
        geometry: route.geometry,
        distanceKm: (route.distance / 1000).toFixed(1),
        durationMin: (route.duration / 60).toFixed(0),
        fuelUsedLiters: fuelStats.fuelUsed,
        fuelCost: cost.toFixed(0),
        avgSpeed: fuelStats.avgSpeed,
        isFastest: index === 0,
        score: fuelStats.fuelUsed,
      };
    });

    const sortedByFuel = [...processedRoutes].sort(
      (a, b) => a.fuelUsedLiters - b.fuelUsedLiters,
    );

    res.json({
      start: startCoords,
      end: endCoords,
      routes: processedRoutes,
      bestFuelRouteId: sortedByFuel[0].id,
    });
  } catch (error) {
    console.error("Server Error:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Autocomplete Search Endpoint
app.get("/api/search", async (req, res) => {
  const query = req.query.q;

  if (!query || query.length < 3) {
    return res.json([]);
  }

  // 1. Check Cache
  const cacheKey = query.toLowerCase();
  if (searchCache[cacheKey]) {
    console.log(`Returning cached result for: ${query}`);
    return res.json(searchCache[cacheKey]);
  }

  // 2. Fetch from Nominatim
  try {
    const response = await axios.get(NOMINATIM_API, {
      params: {
        q: query,
        format: "json",
        addressdetails: 1,
        limit: 5,
      },
      headers: { "User-Agent": "EcoRouteMVP/1.0" },
    });

    const results = response.data.map((item) => ({
      display_name: item.display_name,
      lat: item.lat,
      lon: item.lon,
    }));

    // 3. Save to Cache
    searchCache[cacheKey] = results;

    res.json(results);
  } catch (error) {
    console.error("Search API Error:", error.message);
    res.status(500).json({ error: "Search failed" });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
