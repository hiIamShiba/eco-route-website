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
    const { start, destination, vehicleType, fuelPrice } = req.body;

    if (!start || !destination) {
      return res.status(400).json({ error: "Start and Destination required" });
    }

    // 1. Geocode locations
    const startCoords = await getCoordinates(start);
    const endCoords = await getCoordinates(destination);

    if (!startCoords || !endCoords) {
      return res.status(404).json({ error: "Locations not found" });
    }

    // 2. Fetch Routes from OSRM (Request alternatives)
    const osrmUrl = `${OSRM_API}/${startCoords.lon},${startCoords.lat};${endCoords.lon},${endCoords.lat}`;

    const osrmResponse = await axios.get(osrmUrl, {
      params: {
        overview: "full",
        geometries: "geojson",
        alternatives: "true", // Request multiple routes
      },
    });

    if (!osrmResponse.data.routes || osrmResponse.data.routes.length === 0) {
      return res.status(404).json({ error: "No route found" });
    }

    // 3. Process and Optimize Routes
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
        isFastest: index === 0, // OSRM usually puts fastest first
        score: fuelStats.fuelUsed, // Lower is better
      };
    });

    // Sort by Fuel Used (Lowest first) to find Eco-Route
    const sortedByFuel = [...processedRoutes].sort(
      (a, b) => a.fuelUsedLiters - b.fuelUsedLiters,
    );

    // Identify the "Eco" route
    const ecoRouteId = sortedByFuel[0].id;

    res.json({
      start: startCoords,
      end: endCoords,
      routes: processedRoutes,
      bestFuelRouteId: ecoRouteId,
    });
  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
