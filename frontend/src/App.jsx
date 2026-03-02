import { useEffect, useRef, useState } from "react";

const apiBase = import.meta.env.VITE_API_BASE || "http://localhost:5206";

export default function App() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerGroupRef = useRef(null);
  const polygonGroupRef = useRef(null);
  const isolineGroupRef = useRef(null);
  const poiGroupRef = useRef(null);
  const uiRef = useRef(null);
  const clickHandlerRef = useRef(null);
  const selectedPointRef = useRef(null);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("קיסריה");
  const [status, setStatus] = useState("Ready");
  const [badgeText, setBadgeText] = useState("");
  const [showPolygon, setShowPolygon] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const debounceRef = useRef(null);
  const bubbleTimerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const poiIconRef = useRef(null);
  const selectedIconRef = useRef(null);

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
      uiRef.current = window.H.ui?.UI.createDefault(map, defaultLayers) || null;

      mapInstance.current = map;
      const pinSvg = (fill, stroke) =>
        `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="36" viewBox="0 0 30 36">
          <path d="M15 0C8.4 0 3 5.2 3 11.7c0 7.9 10 22.2 11.3 23.9.4.6 1.2.6 1.6 0C17 33.9 27 19.6 27 11.7 27 5.2 21.6 0 15 0z" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
          <circle cx="15" cy="12" r="4.5" fill="#fff"/>
        </svg>`;
      const iconOptions = { size: { w: 30, h: 36 }, anchor: { x: 15, y: 36 } };
      poiIconRef.current = new window.H.map.Icon(pinSvg("#3f72ff", "#1f3ea8"), iconOptions);
      selectedIconRef.current = new window.H.map.Icon(pinSvg("#06b6b3", "#0f4c4a"), iconOptions);
      markerGroupRef.current = new window.H.map.Group();
      map.addObject(markerGroupRef.current);
      polygonGroupRef.current = new window.H.map.Group();
      map.addObject(polygonGroupRef.current);
      isolineGroupRef.current = new window.H.map.Group();
      map.addObject(isolineGroupRef.current);
      poiGroupRef.current = new window.H.map.Group();
      map.addObject(poiGroupRef.current);

      clickHandlerRef.current = async (evt) => {
        const pointer = evt.currentPointer;
        const coord = map.screenToGeo(pointer.viewportX, pointer.viewportY);
        if (!coord) {
          return;
        }

        setStatus("Reverse geocoding...");
        try {
          const response = await fetch(`${apiBase}/locations/reverse-geocode`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              coordinate: { latitude: coord.lat, longitude: coord.lng }
            })
          });
          const payload = await response.json();
          if (!payload.success) {
            setStatus(payload.message || payload.errorCode || "Reverse geocode failed.");
            return;
          }

          const result = payload.data.geocode;
          const validation = payload.data.validation;
          setAddress(result.formattedAddress || "");
          setCity(result.city || "");
          setBadgeText(result.formattedAddress || "");

          markerGroupRef.current?.removeAll();
          const point = { lat: result.latitude, lng: result.longitude };
          selectedPointRef.current = point;
          const marker = new window.H.map.Marker(point, {
            icon: selectedIconRef.current || undefined
          });
          markerGroupRef.current?.addObject(marker);

          if (uiRef.current) {
            const bubble = new window.H.ui.InfoBubble(point, {
              content: `<div style="font-size:12px">${result.formattedAddress}</div>`
            });
            uiRef.current.getBubbles().forEach((existing) => uiRef.current.removeBubble(existing));
            uiRef.current.addBubble(bubble);

            if (bubbleTimerRef.current) {
              clearTimeout(bubbleTimerRef.current);
            }
            bubbleTimerRef.current = setTimeout(() => {
              uiRef.current?.removeBubble(bubble);
            }, 3500);
          }

          if (validation?.isInside) {
            setStatus(`OK: ${result.formattedAddress}`);
          } else {
            setStatus(
              validation?.reason
                ? `Outside service area: ${validation.reason}`
                : "Outside service area."
            );
          }
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Reverse geocode failed.");
        }
      };
      map.addEventListener("tap", clickHandlerRef.current);

      const resize = () => map.getViewPort().resize();
      window.addEventListener("resize", resize);

      cleanup = () => {
        window.removeEventListener("resize", resize);
        if (clickHandlerRef.current) {
          map.removeEventListener("tap", clickHandlerRef.current);
        }
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

  const handleSubmit = async (event, overrides = null) => {
    event?.preventDefault?.();
    const nextAddress = overrides?.address ?? address;
    const nextCity = overrides?.city ?? city;
    setStatus("Geocoding...");
    setShowSuggestions(false);

    try {
      const response = await fetch(`${apiBase}/locations/geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: nextAddress, city: nextCity })
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
      selectedPointRef.current = point;
      mapInstance.current.getViewModel().setLookAtData({
        position: point,
        zoom: 16
      });

      markerGroupRef.current?.removeAll();
      const marker = new window.H.map.Marker(point, {
        icon: selectedIconRef.current || undefined
      });
      markerGroupRef.current?.addObject(marker);

      if (uiRef.current) {
        const bubble = new window.H.ui.InfoBubble(point, {
          content: `<div style="font-size:12px">${formattedAddress}</div>`
        });
        uiRef.current.getBubbles().forEach((existing) => uiRef.current.removeBubble(existing));
        uiRef.current.addBubble(bubble);

        if (bubbleTimerRef.current) {
          clearTimeout(bubbleTimerRef.current);
        }
        bubbleTimerRef.current = setTimeout(() => {
          uiRef.current?.removeBubble(bubble);
        }, 3500);
      }

      setBadgeText(formattedAddress);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request failed.");
    }
  };

  const getMapBias = () => {
    if (!mapInstance.current) {
      return { latitude: 32.505, longitude: 34.905 };
    }
    const center = mapInstance.current.getCenter();
    return { latitude: center.lat, longitude: center.lng };
  };

  const fetchSuggestions = async (query) => {
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      setActiveIndex(-1);
      setNoResults(false);
      return;
    }

    setIsSuggesting(true);
    try {
      const bias = getMapBias();
      const response = await fetch(`${apiBase}/locations/autosuggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          at: bias,
          limit: 6
        })
      });
      const payload = await response.json();
      if (!payload.success) {
        setSuggestions([]);
        setShowSuggestions(false);
        setActiveIndex(-1);
        setNoResults(false);
        setStatus(payload.message || payload.errorCode || "Autosuggest failed.");
        return;
      }

      const items = payload.data.items || [];
      setSuggestions(items);
      setShowSuggestions(items.length > 0);
      setNoResults(items.length === 0);
      setActiveIndex(-1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Autosuggest failed.");
    } finally {
      setIsSuggesting(false);
    }
  };

  const onAddressChange = (value) => {
    setAddress(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, 350);
  };

  const sanitizeCity = (value) => value.replace(/[0-9]/g, "").trim();

  const handleSuggestionSelect = (item) => {
    const label = item.addressLabel || item.title || "";
    const nextCity = item.city
      ? sanitizeCity(item.city)
      : sanitizeCity(
          item.addressLabel?.split(",")?.[1]?.trim() ||
            item.title?.split(",")?.[1]?.trim() ||
            ""
        );
    setAddress(label);
    if (nextCity) {
      setCity(nextCity);
    }
    setShowSuggestions(false);
    setSuggestions([]);
    setNoResults(false);
    setActiveIndex(-1);
    handleSubmit(null, { address: label, city: nextCity || city });
  };

  const onAddressKeyDown = (event) => {
    if (!showSuggestions || suggestions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex >= 0) {
        handleSuggestionSelect(suggestions[activeIndex]);
      } else if (suggestions.length > 0) {
        handleSuggestionSelect(suggestions[0]);
      }
    } else if (event.key === "Escape") {
      setShowSuggestions(false);
      setActiveIndex(-1);
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

  const [isolineVisible, setIsolineVisible] = useState(false);

  const toggleIsoline = async () => {
    if (!mapInstance.current || !window.H?.geo?.LineString) {
      return;
    }

    const origin = selectedPointRef.current;
    if (!origin) {
      setStatus("Select a location first.");
      return;
    }

    if (isolineVisible) {
      isolineGroupRef.current?.removeAll();
      setIsolineVisible(false);
      setStatus("Isoline cleared.");
      return;
    }

    setStatus("Fetching isoline...");
    try {
      const response = await fetch(`${apiBase}/locations/isoline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { latitude: origin.lat, longitude: origin.lng },
          rangeType: "time",
          rangeValue: 600,
          transportMode: "car",
          routingMode: "fast"
        })
      });
      const payload = await response.json();
      if (!payload.success) {
        setStatus(payload.message || payload.errorCode || "Isoline failed.");
        return;
      }

      isolineGroupRef.current?.removeAll();
      const isolines = payload.data.isolines || [];
      isolines.forEach((isoline) => {
        isoline.polygons?.forEach((polygon) => {
          if (!polygon.outer) return;
          const lineString = window.H.geo.LineString.fromFlexiblePolyline(
            polygon.outer
          );
          const shape = new window.H.map.Polygon(lineString, {
            style: {
              fillColor: "rgba(66, 135, 245, 0.2)",
              strokeColor: "#4287f5",
              lineWidth: 2
            }
          });
          isolineGroupRef.current?.addObject(shape);
        });
      });

      if (isolineGroupRef.current) {
        mapInstance.current.getViewModel().setLookAtData({
          bounds: isolineGroupRef.current.getBoundingBox()
        });
      }

      setIsolineVisible(true);
      setStatus("Isoline ready.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Isoline failed.");
    }
  };

  const [poiQuery, setPoiQuery] = useState("coffee");
  const [poiVisible, setPoiVisible] = useState(false);
  const [poiResults, setPoiResults] = useState([]);

  const togglePoi = async () => {
    if (!mapInstance.current) {
      return;
    }

    const origin = selectedPointRef.current;
    if (!origin) {
      setStatus("Select a location first.");
      return;
    }

    if (poiVisible) {
      poiGroupRef.current?.removeAll();
      setPoiVisible(false);
      setPoiResults([]);
      setStatus("POI cleared.");
      return;
    }

    setStatus("Searching POIs...");
    try {
      const response = await fetch(`${apiBase}/locations/poi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: poiQuery,
          at: { latitude: origin.lat, longitude: origin.lng },
          limit: 10
        })
      });
      const payload = await response.json();
      if (!payload.success) {
        setStatus(payload.message || payload.errorCode || "POI search failed.");
        return;
      }

      poiGroupRef.current?.removeAll();
      const items = payload.data.items || [];
      items.forEach((item) => {
        if (!item.position) return;
        const point = { lat: item.position.latitude, lng: item.position.longitude };
        const marker = new window.H.map.Marker(point, {
          icon: poiIconRef.current || undefined
        });
        marker.setData(item.title);
        poiGroupRef.current?.addObject(marker);
      });

      if (poiGroupRef.current) {
        mapInstance.current.getViewModel().setLookAtData({
          bounds: poiGroupRef.current.getBoundingBox()
        });
      }

      setPoiVisible(true);
      setPoiResults(items);
      setStatus(`POI found: ${items.length}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "POI search failed.");
    }
  };

  return (
    <div className="page">
      <header className="header">
        <div>
          <p className="eyebrow">Location Demo</p>
          <h1>HERE Geocoding</h1>
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
            <div className="input-wrap">
              <input
                value={address}
                onChange={(event) => onAddressChange(event.target.value)}
                placeholder="Street, City"
                onKeyDown={onAddressKeyDown}
                onFocus={() => {
                  if (suggestions.length > 0) setShowSuggestions(true);
                }}
                onBlur={() => {
                  setTimeout(() => setShowSuggestions(false), 150);
                }}
              />
              {isSuggesting && <span className="spinner" />}
            </div>
            {showSuggestions && suggestions.length > 0 && (
              <ul className="suggestions">
                {suggestions.map((item, index) => (
                  <li
                    key={item.id || item.title}
                    className={index === activeIndex ? "active" : ""}
                    onMouseDown={() => handleSuggestionSelect(item)}
                  >
                    <span className="suggestion-title">{item.title}</span>
                    {item.addressLabel && (
                      <span className="suggestion-sub">{item.addressLabel}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {noResults && !isSuggesting && (
              <div className="no-results">No suggestions found.</div>
            )}
          </label>
          <label>
            City (for match validation)
            <input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="City"
            />
          </label>
          <button type="button" onClick={togglePolygon}>
            {showPolygon ? "Hide Service Area" : "Show Service Area"}
          </button>
          <button type="button" onClick={toggleIsoline}>
            {isolineVisible ? "Hide Isoline" : "Show 10 min Isoline"}
          </button>
          <label>
            POI search
            <input
              value={poiQuery}
              onChange={(event) => setPoiQuery(event.target.value)}
              placeholder="coffee, pharmacy, bank"
            />
          </label>
          <button type="button" onClick={togglePoi}>
            {poiVisible ? "Hide POI" : "Show POI"}
          </button>
          {poiResults.length > 0 && (
            <ul className="poi-list">
              {poiResults.map((item) => (
                <li
                  key={item.id || item.title}
                  onClick={() => {
                    if (!item.position || !mapInstance.current) return;
                    const point = {
                      lat: item.position.latitude,
                      lng: item.position.longitude
                    };
                    mapInstance.current.getViewModel().setLookAtData({
                      position: point,
                      zoom: 16
                    });
                    if (uiRef.current) {
                      const bubble = new window.H.ui.InfoBubble(point, {
                        content: `<div style="font-size:12px">${item.title}</div>`
                      });
                      uiRef.current
                        .getBubbles()
                        .forEach((existing) => uiRef.current.removeBubble(existing));
                      uiRef.current.addBubble(bubble);
                      if (bubbleTimerRef.current) {
                        clearTimeout(bubbleTimerRef.current);
                      }
                      bubbleTimerRef.current = setTimeout(() => {
                        uiRef.current?.removeBubble(bubble);
                      }, 3500);
                    }
                  }}
                >
                  <span className="poi-title">{item.title}</span>
                  {item.category && <span className="poi-meta">{item.category}</span>}
                  {typeof item.distanceMeters === "number" && (
                    <span className="poi-meta">
                      {Math.round(item.distanceMeters)} m
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </form>

        <section className="map-card">
          {badgeText && (
            <button
              type="button"
              className="address-badge"
              title="Copy address"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(badgeText);
                  setStatus("Address copied.");
                } catch {
                  setStatus("Failed to copy address.");
                }
              }}
            >
              {badgeText}
            </button>
          )}
          <div className="map-hint">Click map to reverse‑geocode</div>
          <div ref={mapRef} className="map" />
        </section>
      </main>
    </div>
  );
}
