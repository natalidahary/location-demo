# Location Demo – Provider-Agnostic Location Validation Platform

A full-stack geo system demonstrating how to build a production-style location validation engine using HERE Free-tier services while keeping the backend fully vendor-agnostic.

<img width="700" height="400" alt="Screenshot 2026-03-02 at 23 21 36" src="https://github.com/user-attachments/assets/c4c20614-0d06-4087-8979-dea9aa0b6ae5" />

## Stack

- Backend: .NET 10 Web API
- Frontend: React + Vite + TypeScript
- Map Rendering: HERE Maps JavaScript SDK
- Spatial Engine: NetTopologySuite
- Architecture Goal: Switch map providers (HERE ↔ Azure Maps) via DI without touching business logic

## What This System Does

This is not just a map demo.  
It is a structured location intelligence layer with validation and service-area control.

### Core Capabilities

#### Address Intelligence

- Forward Geocoding (address → coordinates)
- Reverse Geocoding (map click → structured address)
- Autosuggest (live search suggestions)

With enforced quality rules:

- Minimum confidence threshold
- House-number requirement
- Optional city match validation

#### Spatial Service-Area Validation

- Service areas stored as GeoJSON
- Point-in-polygon validation using NetTopologySuite
- Structured validation result (isAllowed, areaId, errorCode)

This ensures service eligibility decisions are controlled by your domain logic — not by HERE.

#### Routing

Route calculation between selected point and destination.

Returns:

- Distance
- Duration
- Flexible polyline

Route is drawn on the map.

#### Isoline (Drive-Time Polygon)

- Generates 10-minute reachable area from selected point
- Drawn as polygon overlay
- Toggle show/hide behavior

#### POI Search

- Keyword & category-based discovery
- Separate POI markers
- Clicking a POI:
  - Centers map
  - Draws route from selected point to POI
  - Does not replace validated address

---

## HERE Free Plan – Services Used

This project uses only services available in the HERE Free / Limited plan.

Based on actual usage, the system consumes:

- Geocoding & Search
  - Autosuggest
  - Discover / Search (POI)
  - Geocode & Reverse Geocode
- Routing
  - Isoline Routing
  - Standard routing
- Maps
  - Vector Tiles
  - Rendering metadata

All usage remains within free-tier service categories.  
No enterprise-only datasets or fleet services are used.

---

## What Is Custom (Business Layer)

The project adds a structured domain layer on top of HERE:

- Confidence enforcement
- House-number enforcement
- City validation logic
- GeoJSON-managed service areas
- Point-in-polygon validation
- Unified API response contract
- Provider-agnostic abstraction (`ILocationService`)

HERE DTOs never leak into the domain layer.

---

## Architecture Overview

```
Frontend (React + HERE JS)
        ↓
Backend Controllers
        ↓
ILocationService
        ↓
HereLocationService (current provider)
```

To switch to Azure Maps:

- Implement `AzureLocationService`
- Change DI registration
- No controller or business-rule changes required

---

## Backend API Endpoints

All endpoints return a unified response contract:

```json
{
  "success": true,
  "errorCode": null,
  "message": null,
  "data": { ... },
  "metadata": { ... }
}
```

Endpoints:

- `POST /locations/geocode`
- `POST /locations/reverse-geocode`
- `POST /locations/autosuggest`
- `POST /locations/route`
- `POST /locations/isoline`
- `POST /locations/poi`
- `GET /locations/service-areas`

---

## Running the Application

### Prerequisites

- .NET SDK 10+
- Node.js 18+
- HERE API Key

### Backend

```bash
dotnet run --project backend/LocationDemo.Api
```

Default:

```
http://localhost:5206
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
```

Set:

```
VITE_HERE_API_KEY=YOUR_HERE_API_KEY
VITE_API_BASE=http://localhost:5206
```

Run:

```bash
npm run dev
```

Open:

```
http://localhost:5173
```

Frontend source is in `frontend/src/*.tsx`.

---

## Configuration Highlights

`backend/LocationDemo.Api/appsettings.json`

```json
"GeocodeQuality": {
  "MinConfidence": 0.8,
  "RequireHouseNumber": true,
  "EnforceCityMatch": true
},
"SpatialValidation": {
  "GeoJsonPath": "Location/Data/service-areas.geojson",
  "DefaultAreaId": "caesarea"
}
```
