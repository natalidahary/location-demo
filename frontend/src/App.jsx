import { useEffect, useRef, useState } from "react";

const apiBase = import.meta.env.VITE_API_BASE || "http://localhost:5206";

export default function App() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerGroupRef = useRef(null);
  const polygonGroupRef = useRef(null);
  const [address, setAddress] = useState("האשל 2, קיסריה");
  const [city, setCity] = useState("קיסריה");
  const [status, setStatus] = useState("Ready");
  const [showPolygon, setShowPolygon] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    const initMap = () => {
      if (disposed) {
        return;
      }

      const platform = new window.H.service.Platform({
        apikey: import.meta.env.VITE_HERE_API_KEY
      });
      const defaultLayers = platform.createDefaultLayers();

      const map = new window.H.Map(
        mapRef.current,
        defaultLayers.vector.normal.map,
        {
          zoom: 12,
          center: { lat: 32.5, lng: 34.9 },
          pixelRatio: window.devicePixelRatio || 1
        }
      );

      let behavior;
      if (window.H.mapevents) {
        behavior = new window.H.mapevents.Behavior(
          new window.H.mapevents.MapEvents(map)
        );
      }
      window.H.ui?.UI.createDefault(map, defaultLayers);

      mapInstance.current = map;
      markerGroupRef.current = new window.H.map.Group();
      map.addObject(markerGroupRef.current);
      polygonGroupRef.current = new window.H.map.Group();
      map.addObject(polygonGroupRef.current);

      const resize = () => map.getViewPort().resize();
      window.addEventListener("resize", resize);

      cleanup = () => {
        window.removeEventListener("resize", resize);
        behavior?.dispose();
        map.dispose();
      };
    };

    let attempts = 0;
    const tryInit = () => {
      if (disposed) {
        return;
      }

      if (!window.H || !window.H.service || !window.H.Map) {
        attempts += 1;
        if (attempts > 50) {
          setStatus("HERE Maps script not loaded.");
          return;
        }
        setTimeout(tryInit, 100);
        return;
      }

      initMap();
    };

    const timer = setTimeout(tryInit, 0);

    return () => {
      disposed = true;
      clearTimeout(timer);
      cleanup();
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus("Geocoding...");

    try {
      const response = await fetch(`${apiBase}/locations/geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, city })
      });
      const payload = await response.json();

      if (!payload.success) {
        setStatus(payload.message || payload.errorCode || "Geocode failed.");
        return;
      }

      const { latitude, longitude, formattedAddress } = payload.data.geocode;
      setStatus(`OK: ${formattedAddress}`);

      if (!mapInstance.current) {
        return;
      }

      const lat = Number(latitude);
      const lng = Number(longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setStatus("Invalid coordinates returned from API.");
        return;
      }

      const point = { lat, lng };
      mapInstance.current.getViewModel().setLookAtData({
        position: point,
        zoom: 16
      });

      markerGroupRef.current?.removeAll();
      const marker = new window.H.map.Marker(point);
      markerGroupRef.current?.addObject(marker);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request failed.");
    }
  };

  const togglePolygon = async () => {
    const next = !showPolygon;
    setShowPolygon(next);

    if (!polygonGroupRef.current) {
      return;
    }

    polygonGroupRef.current.removeAll();

    if (!next) {
      return;
    }

    try {
      const response = await fetch(`${apiBase}/locations/service-areas`);
      if (!response.ok) {
        setStatus("Failed to load service area polygon.");
        return;
      }

      const geojson = await response.json();
      const feature = geojson.features?.[0];
      const geometry = feature?.geometry;
      if (!geometry) {
        setStatus("Service area polygon missing.");
        return;
      }

      const polygons = geometry.type === "Polygon"
        ? [geometry.coordinates]
        : geometry.type === "MultiPolygon"
          ? geometry.coordinates
          : [];

      if (polygons.length === 0) {
        setStatus("Unsupported polygon type.");
        return;
      }

      polygons.forEach((polygonCoords) => {
        const ring = polygonCoords[0];
        const lineString = new window.H.geo.LineString();
        ring.forEach(([lng, lat]) => {
          lineString.pushLatLngAlt(lat, lng, 0);
        });

        const polygon = new window.H.map.Polygon(lineString, {
          style: {
            fillColor: "rgba(226, 109, 61, 0.18)",
            strokeColor: "#e26d3d",
            lineWidth: 2
          }
        });
        polygonGroupRef.current?.addObject(polygon);
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Polygon load failed.");
    }
  };

  return (
    <div className="page">
      <header className="header">
        <div>
          <p className="eyebrow">Location Demo</p>
          <h1>HERE Geocoding QA</h1>
          <p className="subtitle">
            Validate addresses through your backend and visualize the result on
            a HERE map.
          </p>
        </div>
        <div className="status">{status}</div>
      </header>

      <main className="content">
        <form className="card" onSubmit={handleSubmit}>
          <label>
            Address
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Street, City"
            />
          </label>
          <label>
            City (for match validation)
            <input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="City"
            />
          </label>
          <button type="submit">Geocode + Validate</button>
          <button type="button" onClick={togglePolygon}>
            {showPolygon ? "Hide Service Area" : "Show Service Area"}
          </button>
        </form>

        <section className="map-card">
          <div ref={mapRef} className="map" />
        </section>
      </main>
    </div>
  );
}
