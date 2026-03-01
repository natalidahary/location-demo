import { useEffect, useRef, useState } from "react";

const apiBase = import.meta.env.VITE_API_BASE || "http://localhost:5206";

export default function App() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const [address, setAddress] = useState("התעשייה 1, קיסריה");
  const [city, setCity] = useState("קיסריה");
  const [status, setStatus] = useState("Ready");

  useEffect(() => {
    if (!window.H) {
      setStatus("HERE Maps script not loaded.");
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

    const behavior = new window.H.mapevents.Behavior(
      new window.H.mapevents.MapEvents(map)
    );
    window.H.ui.UI.createDefault(map, defaultLayers);

    mapInstance.current = map;

    const resize = () => map.getViewPort().resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      behavior.dispose();
      map.dispose();
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

      const point = { lat: latitude, lng: longitude };
      mapInstance.current.setCenter(point, true);
      mapInstance.current.setZoom(15, true);

      if (markerRef.current) {
        mapInstance.current.removeObject(markerRef.current);
      }

      const marker = new window.H.map.Marker(point);
      mapInstance.current.addObject(marker);
      markerRef.current = marker;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request failed.");
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
        </form>

        <section className="map-card">
          <div ref={mapRef} className="map" />
        </section>
      </main>
    </div>
  );
}
