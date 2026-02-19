***

# 🌿 EcoRoute MVP - Fuel Optimized Navigation

> A smart routing application that calculates the most fuel-efficient path, not just the fastest one.

![Project Status](https://img.shields.io/badge/Status-MVP-success) ![License](https://img.shields.io/badge/License-MIT-blue) ![Node](https://img.shields.io/badge/Node.js-v18%2B-green)

## 📖 Overview

**EcoRoute** is a full-stack web application designed to help drivers save money and reduce carbon emissions. Unlike standard mapping apps that prioritize speed, EcoRoute analyzes route data to determine fuel consumption based on vehicle physics, traffic patterns, and road types.

It features an interactive map where users can select their vehicle type (Motorbike, Car, Truck), input current fuel prices, and compare different routes based on **Cost vs. Time**.

## ✨ Key Features

*   **🗺️ Interactive Map:** Full-screen map powered by Leaflet.js & OpenStreetMap.
*   **📍 Geocoding:** Intelligent address search using Nominatim API (converts "Ben Thanh Market" to coordinates).
*   **🛣️ Multi-Route Analysis:** Fetches alternative routes using the OSRM Engine.
*   **⛽ Physics-Based Fuel Engine:** Custom backend logic calculates fuel usage based on distance, average speed, and vehicle efficiency curves.
*   **👆 Interactive Selection:** Click on any route line or sidebar card to highlight details.
*   **💰 Cost Estimation:** Real-time calculation of trip cost in VND based on user-input fuel prices.
*   **🚗 Vehicle Profiles:** distinct algorithms for Motorbikes, Cars, and Trucks.

## 🛠️ Tech Stack

### Frontend
*   **HTML5 / CSS3** (Custom responsive design)
*   **Vanilla JavaScript** (ES6+)
*   **Leaflet.js** (Mapping library)

### Backend
*   **Node.js** (Runtime environment)
*   **Express.js** (REST API)
*   **Axios** (HTTP Client)

### APIs
*   **OSRM** (Open Source Routing Machine)
*   **OpenStreetMap Nominatim** (Geocoding)

## 🧮 How The Algorithm Works

The core value of this MVP is the fuel estimation logic located in `backend/server.js`. It doesn't just use distance; it applies a **Physics Heuristic**:

1.  **Base Consumption:** Takes the manufacturer's average liters/100km.
2.  **Optimal Speed Curve:** Every vehicle has an "optimal speed" (e.g., 50km/h for motorbikes, 80km/h for cars).
3.  **Efficiency Factor:**
    *   **Traffic Penalty:** If the route's average speed is significantly *lower* than optimal (indicating stop-and-go traffic), fuel consumption increases.
    *   **Drag Penalty:** If speed is significantly *higher* (highway), wind resistance increases consumption.

```javascript
Fuel Used = (Distance / 100) * Base_Rate * Efficiency_Factor
```

## 🚀 How to Run Locally

Follow these steps to get the project running on your machine.

### Prerequisites
*   [Node.js](https://nodejs.org/) installed.

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/YOUR_USERNAME/eco-route-mvp.git
    cd eco-route-mvp
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Start the Server**
    ```bash
    npm start
    ```

4.  **View in Browser**
    Open `http://localhost:3000` in Chrome, Firefox, or Edge.

## 📂 Project Structure

```text
/eco-route-mvp
│
├── /backend
│   └── server.js       # Express Server & Calculation Logic
│
├── /frontend
│   ├── index.html      # Main UI
│   ├── style.css       # Styling & Responsive Layout
│   └── script.js       # Map Logic & API Calls
│
├── package.json        # Dependencies & Scripts
└── README.md           # Documentation
```

## 🔮 Future Improvements

*   **Elevation Data:** Integrate OpenTopoData to account for hills (going uphill consumes ~3x more fuel).
*   **EV Support:** Add kWh consumption logic for Electric Vehicles.
*   **Live Traffic:** Switch to Mapbox or TomTom API for real-time traffic jam avoidance.
*   **User Accounts:** Save favorite routes and vehicle profiles.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1.  Fork the project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

---

**Developed with ❤️ in Vietnam**
