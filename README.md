# Azure Geo Platform – Provider‑Agnostic Location Validation

A full‑stack geo system demonstrating a production‑style location validation engine using **Azure Maps** while keeping the backend vendor‑agnostic.

## Stack

- Backend: .NET 10 Web API
- Frontend: React + Vite + TypeScript
- Map Rendering: Azure Maps Web SDK
- Spatial Engine: NetTopologySuite (local GeoJSON validation)
- Architecture Goal: switch map providers via DI without touching business logic

## What This System Does

This is not just a map demo. It is a structured location intelligence layer with validation and service‑area control.

### Core Capabilities

#### Address Intelligence

- Forward Geocoding (address → coordinates)
- Reverse Geocoding (map click → structured address)
- Autosuggest (live search suggestions)

With enforced quality rules:

- Minimum confidence threshold
- House‑number requirement
- Optional city match validation

#### Spatial Service‑Area Validation

- Service areas stored as GeoJSON
- Point‑in‑polygon validation using NetTopologySuite
- Structured validation result (isInside, areaId, reason)

#### Routing

Route calculation between selected point and destination.

Returns:

- Distance
- Duration
- Path coordinates

Route is drawn on the map with gradient + arrows.

#### Isoline (Drive‑Time Polygon)

- Generates 10‑minute reachable area from selected point
- Drawn as polygon overlay
- Toggle show/hide behavior

#### POI Search

- Keyword & category‑based discovery
- Category‑colored POI markers
- Clicking a POI:
  - Centers map
  - Draws route from selected point to POI
  - Does not replace validated address

#### Context Menu (Right‑Click)

- Set start point
- Set destination
- Validate inside service area
- Measure distance
- Reset

#### Geolocation

- “Use my location” (browser geolocation)
- Centers map + reverse‑geocodes automatically

#### Static Map Export

- Export current map view as PNG
- Route line included when available
- Useful for reports / PDF / email

#### Image Overlays (Decll / Planning)

Two overlay modes for planning images (PNG/JPG):

Manual overlay:
- Upload image → appears centered on current view
- Drag to move, rotate, and scale with handles
- Opacity slider, lock/unlock, reset, remove
- Uses Azure Maps **ImageLayer** for rendering; the drag/rotate/scale UI is custom

Geo‑anchored overlay:
- Upload image **together with its world file** (.pgw/.jgw/.wld/.tfw)
- The overlay is placed automatically from the file’s coordinates
- No rotation (north‑up for spatial accuracy)
- Uses Azure Maps **ImageLayer** for rendering; placement UI is custom

#### Caesarea View

- “Open Caesarea View” button zooms to a predefined bounding box
- Includes Caesarea residential + industrial area
- The button and bounds are custom (not a built‑in Azure control)

---

## Azure Maps – Services Used

This project uses these Azure Maps services:

- **Maps / Base Map Tiles** (interactive map)
- **Traffic** (flow + incidents overlay)
- **Search**
  - Autosuggest
  - Geocode + Reverse Geocode
  - POI Discover
- **Routing**
  - Route directions
  - Isoline / reachability
- **Render – Static Map** (PNG export)
- **Image Layer** (client‑side overlays)

Not used:

- Weather tiles
- Imagery tiles
- Location Insights
- Geolocation service (we use browser geolocation)
- Time Zone

---

## Overlay Persistence (Azure Blob Storage)

Overlays are saved in Azure Blob Storage:

- Container: `overlays`
- Image file (PNG/JPG)
- Matching metadata JSON (`<id>.json`)

Backend reads the storage connection string from:

```
AZURE_STORAGE_CONNECTION_STRING
```

This is **server‑side only** and never exposed to the frontend.

---

## What Is Custom (Business Layer)

- Confidence enforcement
- House‑number enforcement
- City validation logic
- GeoJSON‑managed service areas
- Point‑in‑polygon validation
- Unified API response contract
- Provider‑agnostic abstraction (`ILocationService`)

Azure Maps DTOs never leak into the domain layer.

---

## Architecture Overview

```
Frontend (React + Azure Maps Web SDK)
        ↓
Backend Controllers
        ↓
ILocationService
        ↓
AzureLocationService (current provider)
```

To switch providers:

- Implement another `ILocationService`
- Change DI registration
- No controller or business‑rule changes required

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
- `POST /locations/validate`
- `POST /locations/static-map`
- `POST /overlays`
- `GET /locations/service-areas`

---

## Running the Application

### Prerequisites

- .NET SDK 10+
- Node.js 18+
- Azure Maps key

### Backend

```bash
dotnet run --project backend/LocationDemo.Api
```

Default:

```
http://localhost:5206
```

Set environment variables before running:

```
AZURE_STORAGE_CONNECTION_STRING=YOUR_STORAGE_CONNECTION_STRING
```

You can also place it in `backend/LocationDemo.Api/appsettings.Local.json`:

```json
{
  "AzureStorage": {
    "ConnectionString": "YOUR_STORAGE_CONNECTION_STRING"
  }
}
```


### Frontend

```bash
cd frontend
npm install
cp .env.example .env
```

Set:

```
VITE_AZURE_MAPS_KEY=YOUR_AZURE_MAPS_KEY
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

---

## Configuration Highlights

`backend/LocationDemo.Api/appsettings.json`

```json
"AzureMaps": {
  "SubscriptionKey": "YOUR_AZURE_MAPS_KEY",
  "BaseUrl": "https://atlas.microsoft.com",
  "Language": "he-IL",
  "CountrySet": "IL"
},
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

For local secrets, use:

- `backend/LocationDemo.Api/appsettings.Local.json` (ignored in git)
