import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import * as atlas from "azure-maps-control";
import { useOverlayManager } from "./useOverlayManager";

type Coord = { lat: number; lng: number };
type Position = { latitude: number; longitude: number };
type AutosuggestItem = {
  id?: string;
  title?: string;
  addressLabel?: string;
  city?: string;
};
type PoiItem = {
  id?: string;
  title?: string;
  category?: string;
  distanceMeters?: number;
  position?: Position;
};

const apiBase = import.meta.env.VITE_API_BASE || "http://localhost:5206";
const defaultAreaId = "caesarea";

export default function App() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<atlas.Map | null>(null);
  const polygonSourceRef = useRef<atlas.source.DataSource | null>(null);
  const isolineSourceRef = useRef<atlas.source.DataSource | null>(null);
  const routeSourceRef = useRef<atlas.source.DataSource | null>(null);
  const selectedPointSourceRef = useRef<atlas.source.DataSource | null>(null);
  const destinationPointSourceRef = useRef<atlas.source.DataSource | null>(null);
  const poiSourceRef = useRef<atlas.source.DataSource | null>(null);
  const poiLayerRef = useRef<atlas.layer.SymbolLayer | null>(null);
  const trafficLayerRef = useRef<atlas.layer.TileLayer | null>(null);
  const popupRef = useRef<atlas.Popup | null>(null);
  const selectedPointRef = useRef<Coord | null>(null);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("קיסריה");
  const [status, setStatus] = useState("Ready");
  const [badgeText, setBadgeText] = useState("");
  const [showPolygon, setShowPolygon] = useState(false);
  const [suggestions, setSuggestions] = useState<AutosuggestItem[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const bubbleTimerRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isolineVisible, setIsolineVisible] = useState(false);
  const [poiQuery, setPoiQuery] = useState("coffee");
  const [poiVisible, setPoiVisible] = useState(false);
  const [poiResults, setPoiResults] = useState<PoiItem[]>([]);
  const [manualOverlayName, setManualOverlayName] = useState("");
  const [geoOverlayName, setGeoOverlayName] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    coord: Coord;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const routePathRef = useRef<Coord[]>([]);
  const [mapReady, setMapReady] = useState(false);

  const runReverseGeocode = async (lng: number, lat: number) => {
    setStatus(`Clicked: ${lat.toFixed(5)}, ${lng.toFixed(5)} · Reverse geocoding...`);
    try {
      const response = await fetch(`${apiBase}/locations/reverse-geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coordinate: { latitude: lat, longitude: lng }
        })
      });
      let payload: any = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok && !payload?.data?.geocode) {
        setStatus(payload?.message || payload?.errorCode || "Reverse geocode failed.");
        return;
      }

      const result = payload?.data?.geocode;
      const validation = payload?.data?.validation;
      if (!result) {
        setStatus(payload?.message || payload?.errorCode || "Reverse geocode failed.");
        return;
      }
      const point = { lat: result.latitude, lng: result.longitude };
      selectedPointRef.current = point;
      setAddress(result.formattedAddress || "");
      setCity(result.city || "");
      setBadgeText(result.formattedAddress || "");

      setSelectedMarker(point);
      showPopup(point, result.formattedAddress || "");

      if (validation?.isInside) {
        setStatus(`OK: ${result.formattedAddress}`);
      } else if (!response.ok && (payload?.message || payload?.errorCode)) {
        setStatus(payload.message || payload.errorCode);
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

  const overlay = useOverlayManager({
    mapRef,
    mapInstance,
    setStatus,
    mapReady
  });
  const overlayRef = useRef(overlay);
  useEffect(() => {
    overlayRef.current = overlay;
  }, [overlay]);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = new atlas.Map(mapRef.current, {
      center: [34.9, 32.5],
      zoom: 12,
      renderWorldCopies: false,
      style: "road",
      styleDefinitionsVersion: "2023-01-01",
      styleOverrides: {
        countryRegion: { borderVisible: false },
        buildingFootprint: { visible: false },
        roadDetails: { visible: false }
      },
      serviceOptions: {
        transformRequest: (url: string, resourceType: string) => {
          // Example hook point for proxies or custom headers.
          // Return url unchanged by default.
          return { url };
        }
      },
      authOptions: {
        authType: atlas.AuthenticationType.subscriptionKey,
        subscriptionKey: import.meta.env.VITE_AZURE_MAPS_KEY
      }
    });

    map.events.add("ready", () => {
      mapInstance.current = map;
      map.setTraffic({ flow: "relative", incidents: true });
      setMapReady(true);
      // Default view on load.
      openCaesareaView();

      map.events.add("error", (event: any) => {
        const err = event?.error;
        if (err?.name === "AbortError") {
          return;
        }
        const status = err?.status || err?.statusCode;
        const url = err?.url || err?.request?.url || err?.requestUrl;
        if (err) {
          console.error("[map] error", err);
        }
        if (
          status === 429 &&
          typeof url === "string" &&
          url.includes("traffic")
        ) {
          map.setTraffic({ flow: "none", incidents: false });
          setStatus("Traffic rate limit hit. Traffic disabled.");
        }
        if (
          status === 401 &&
          typeof url === "string" &&
          url.includes("atlas.microsoft.com")
        ) {
          setStatus("Azure Maps key unauthorized. Check VITE_AZURE_MAPS_KEY and restart dev server.");
        }
      });

      map.controls.add(
        new atlas.control.StyleControl({
          mapStyles: [
            "road",
            "grayscale_light",
            "grayscale_dark",
            "night",
            "road_shaded_relief",
            "satellite",
            "satellite_road_labels"
          ],
          layout: "list",
          style: atlas.ControlStyle.dark
        }),
        { position: atlas.ControlPosition.TopRight }
      );

      map.controls.add(
        [
          new atlas.control.ZoomControl(),
          new atlas.control.PitchControl(),
          new atlas.control.CompassControl(),
          new atlas.control.FullscreenControl(),
          new atlas.control.TrafficControl()
        ],
        { position: atlas.ControlPosition.TopRight }
      );
      map.controls.add(new atlas.control.TrafficLegendControl(), {
        position: atlas.ControlPosition.BottomLeft
      });

      polygonSourceRef.current = new atlas.source.DataSource();
      isolineSourceRef.current = new atlas.source.DataSource();
      routeSourceRef.current = new atlas.source.DataSource(undefined, {
        lineMetrics: true
      });
      selectedPointSourceRef.current = new atlas.source.DataSource();
      destinationPointSourceRef.current = new atlas.source.DataSource();
      poiSourceRef.current = new atlas.source.DataSource();

      map.sources.add(polygonSourceRef.current);
      map.sources.add(isolineSourceRef.current);
      map.sources.add(routeSourceRef.current);
      map.sources.add(selectedPointSourceRef.current);
      map.sources.add(destinationPointSourceRef.current);
      map.sources.add(poiSourceRef.current);


      const areaHatchSvg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8">` +
        `<path d="M0 8 L8 0" stroke="rgba(226,109,61,0.35)" stroke-width="1"/>` +
        `</svg>`;

      Promise.all([
        map.imageSprite.createFromTemplate("selected-pin", "pin", "#06b6b3", "#ffffff", 1),
        map.imageSprite.createFromTemplate("destination-pin", "pin", "#ef4c4c", "#ffffff", 1),
        map.imageSprite.createFromTemplate("poi-pin", "pin", "#3f72ff", "#ffffff", 1),
        map.imageSprite.createFromTemplate("poi-food", "pin", "#8b5a2b", "#ffffff", 1),
        map.imageSprite.createFromTemplate("poi-bank", "pin", "#0ea5e9", "#ffffff", 1),
        map.imageSprite.createFromTemplate("poi-health", "pin", "#2563eb", "#ffffff", 1),
        map.imageSprite.createFromTemplate("poi-shop", "pin", "#7c3aed", "#ffffff", 1),
        map.imageSprite.createFromTemplate("route-arrow", "arrow-up", "#1f3ea8", "#ffffff", 1),
        map.imageSprite.add("area-hatch", areaHatchSvg)
      ]).then(() => {
        map.layers.add(
          new atlas.layer.SymbolLayer(selectedPointSourceRef.current!, undefined, {
            iconOptions: {
              image: "selected-pin",
              size: 1,
              anchor: "bottom"
            }
          })
        );
        map.layers.add(
          new atlas.layer.SymbolLayer(destinationPointSourceRef.current!, undefined, {
            iconOptions: {
              image: "destination-pin",
              size: 1,
              anchor: "bottom"
            }
          })
        );

        poiLayerRef.current = new atlas.layer.SymbolLayer(
          poiSourceRef.current!,
          undefined,
          {
            iconOptions: {
              image: [
                "match",
                ["get", "categoryGroup"],
                "food",
                "poi-food",
                "bank",
                "poi-bank",
                "health",
                "poi-health",
                "shop",
                "poi-shop",
                "poi-pin"
              ],
              size: 0.9,
              anchor: "bottom",
              allowOverlap: true
            }
          }
        );
        map.layers.add(poiLayerRef.current);

        map.layers.add(
          new atlas.layer.SymbolLayer(routeSourceRef.current!, undefined, {
            placement: "line",
            lineSpacing: 120,
            iconOptions: {
              image: "route-arrow",
              size: 0.6,
              allowOverlap: true,
              anchor: "center",
              rotationAlignment: "map"
            }
          })
        );

        map.layers.add(
          new atlas.layer.PolygonLayer(polygonSourceRef.current!, undefined, {
            fillColor: "rgba(226, 109, 61, 0.12)",
            fillPattern: "area-hatch",
            strokeColor: "#e26d3d",
            strokeWidth: 2
          })
        );

        map.layers.add(
          new atlas.layer.PolygonLayer(isolineSourceRef.current!, undefined, {
            fillColor: "rgba(66, 135, 245, 0.2)",
            strokeColor: "#4287f5",
            strokeWidth: 2
          })
        );

        map.layers.add(
          new atlas.layer.LineLayer(routeSourceRef.current!, undefined, {
            strokeColor: "#d7263d",
            strokeWidth: 12,
            strokeOpacity: 0.9,
            lineCap: "round",
            lineJoin: "round",
            strokeGradient: [
              "interpolate",
              ["linear"],
              ["line-progress"],
              0,
              "#2dd4bf",
              0.5,
              "#3f72ff",
              1,
              "#d7263d"
            ]
          })
        );



        const popup = new atlas.Popup({
          pixelOffset: [0, -22],
          closeButton: false
        });
        popupRef.current = popup;

        map.events.add("mousemove", poiLayerRef.current, (e: any) => {
          const shape = e.shapes?.[0];
          if (!shape) {
            return;
          }
          const properties = shape.getProperties?.() || {};
          const content = atlas.PopupTemplate.applyTemplate(properties, {
            content: [
              "<strong>{title}</strong>",
              "{category}",
              "Distance: {distanceMeters} m"
            ],
            numberFormat: {
              maximumFractionDigits: 0
            }
          });
          popup.setOptions({
            content,
            position: shape.getCoordinates()
          });
          popup.open(map);
        });

        map.events.add("mouseleave", poiLayerRef.current, () => {
          popup.close();
        });
      });


      const resolveMapCoord = (e: any) => {
        const mapRef = mapInstance.current;
        const candidates = [e?.position, e?.lngLat, e?.location, e?.coordinate, e?.pixel];
        for (const candidate of candidates) {
          if (!candidate) continue;
          if (Array.isArray(candidate) && candidate.length === 2) {
            const [a, b] = candidate;
            if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
            if (a >= -180 && a <= 180 && b >= -90 && b <= 90) {
              return { lng: a, lat: b };
            }
            if (mapRef) {
              const pos = mapRef.pixelsToPositions([[a, b]])?.[0] as
                | atlas.data.Position
                | undefined;
              if (pos && Number.isFinite(pos[0]) && Number.isFinite(pos[1])) {
                return { lng: pos[0], lat: pos[1] };
              }
            }
          } else if (typeof candidate === "object") {
            if (
              Number.isFinite(candidate.lng) &&
              Number.isFinite(candidate.lat)
            ) {
              return { lng: candidate.lng, lat: candidate.lat };
            }
            if (
              Number.isFinite(candidate.longitude) &&
              Number.isFinite(candidate.latitude)
            ) {
              return { lng: candidate.longitude, lat: candidate.latitude };
            }
            if (Number.isFinite(candidate.x) && Number.isFinite(candidate.y) && mapRef) {
              const pos = mapRef.pixelsToPositions([[candidate.x, candidate.y]])?.[0] as
                | atlas.data.Position
                | undefined;
              if (pos && Number.isFinite(pos[0]) && Number.isFinite(pos[1])) {
                return { lng: pos[0], lat: pos[1] };
              }
            }
          }
        }
        const rect = mapRef?.getCanvasContainer?.().getBoundingClientRect?.() ??
          mapRef?.getMapContainer?.().getBoundingClientRect?.() ??
          mapRef?.getMapContainer?.().getBoundingClientRect?.();
        const mapEl = mapRef?.getCanvasContainer?.() || mapRef?.getMapContainer?.();
        if (rect && mapEl && e?.originalEvent) {
          const evt = e.originalEvent as MouseEvent;
          const px = evt.clientX - rect.left;
          const py = evt.clientY - rect.top;
          if (Number.isFinite(px) && Number.isFinite(py) && mapRef) {
            const pos = mapRef.pixelsToPositions([[px, py]])?.[0] as
              | atlas.data.Position
              | undefined;
            if (pos && Number.isFinite(pos[0]) && Number.isFinite(pos[1])) {
              return { lng: pos[0], lat: pos[1] };
            }
          }
        }
        return null;
      };

      map.events.add("click", async (e: atlas.MapMouseEvent) => {
        setContextMenu(null);
        const coord = resolveMapCoord(e);
        if (!coord) {
          console.warn("[overlay] map click missing coordinates", {
            position: e.position,
            pixel: (e as any).pixel
          });
          return;
        }
        const overlayState = overlayRef.current;
        if (overlayState.overlayMode === "geo") {
          const handled = overlayState.handleGeoClick(coord);
          if (!handled) {
            setStatus("Click inside the map to choose a corner.");
          }
          return;
        }
        if (overlayState.handleOverlayClick(coord)) {
          return;
        }
        await runReverseGeocode(coord.lng, coord.lat);
      });

      map.events.add("contextmenu", (e: atlas.MapMouseEvent) => {
        e.originalEvent?.preventDefault?.();
        const position = e.position;
        if (!position || !mapRef.current) return;
        const rect = mapRef.current.getBoundingClientRect();
        const pixel = (e as any).pixel;
        const rawX =
          typeof pixel?.x === "number"
            ? pixel.x
            : Array.isArray(pixel)
              ? pixel[0]
              : (e.originalEvent as MouseEvent)?.clientX - rect.left;
        const rawY =
          typeof pixel?.y === "number"
            ? pixel.y
            : Array.isArray(pixel)
              ? pixel[1]
              : (e.originalEvent as MouseEvent)?.clientY - rect.top;
        openContextMenu(rawX ?? 0, rawY ?? 0, {
          lat: position[1],
          lng: position[0]
        });
      });
    });

    return () => {
      map.dispose();
    };
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    menuItemRefs.current[0]?.focus();
  }, [contextMenu]);

  const flyToDemo = () => {
    if (!mapInstance.current) return;
    const point = selectedPointRef.current;
    if (!point) {
      setStatus("Select a location first.");
      return;
    }
    mapInstance.current.setCamera({
      center: [point.lng, point.lat],
      zoom: 15,
      type: "fly",
      duration: 1000
    });
  };

  const fitDemoBounds = () => {
    if (!mapInstance.current) return;
    const point = selectedPointRef.current;
    if (!point) {
      setStatus("Select a location first.");
      return;
    }
    const bounds = atlas.data.BoundingBox.fromPositions([
      [point.lng - 0.03, point.lat - 0.02],
      [point.lng + 0.03, point.lat + 0.02]
    ]);
    mapInstance.current.setCamera({
      bounds,
      padding: 30
    });
  };

  const setSelectedMarker = (point: Coord) => {
    const source = selectedPointSourceRef.current;
    if (!source) return;
    const feature = new atlas.data.Feature(
      new atlas.data.Point([point.lng, point.lat])
    );
    source.setShapes([feature]);
  };

  const distanceMeters = (a: Coord, b: Coord) => {
    const R = 6371000;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  const validateInsideArea = async (coord: Coord) => {
    try {
      const response = await fetch(`${apiBase}/locations/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          areaId: defaultAreaId,
          coordinate: { latitude: coord.lat, longitude: coord.lng }
        })
      });
      const payload = (await response.json()) as any;
      if (!response.ok || !payload?.success) {
        setStatus(payload?.message || payload?.errorCode || "Validation failed.");
        return;
      }
      setStatus(payload.data?.isInside ? "Inside service area." : "Outside service area.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Validation failed.");
    }
  };

  const openContextMenu = (rawX: number, rawY: number, coord: Coord) => {
    if (!mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const menuWidth = 210;
    const menuHeight = 220;
    const x = Math.max(8, Math.min(rawX, width - menuWidth - 8));
    const y = Math.max(8, Math.min(rawY, height - menuHeight - 8));
    setContextMenu({ x, y, coord });
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent) => {
    if (!contextMenu) return;
    const items = menuItemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      setContextMenu(null);
      mapRef.current?.focus();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    }
  };


  const openCaesareaView = () => {
    if (!mapInstance.current) return;
    const bounds = atlas.data.BoundingBox.fromPositions([
      [34.87, 32.46],
      [35.0, 32.56]
    ]);
    mapInstance.current.setCamera({ bounds, padding: 40 });
  };

  const resetMapState = () => {
    routeSourceRef.current?.clear();
    destinationPointSourceRef.current?.clear();
    selectedPointSourceRef.current?.clear();
    isolineSourceRef.current?.clear();
    polygonSourceRef.current?.clear();
    poiSourceRef.current?.clear();
    selectedPointRef.current = null;
    setPoiResults([]);
    setPoiVisible(false);
    setIsolineVisible(false);
    setShowPolygon(false);
    setAddress("");
    setBadgeText("");
    setStatus("Ready");
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setStatus("Geolocation is not supported.");
      return;
    }
    setStatus("Getting your location...");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        selectedPointRef.current = point;
        centerMap(point, 16);
        setSelectedMarker(point);
        await runReverseGeocode(point.lng, point.lat);
      },
      (error) => {
        setStatus(error.message || "Failed to get location.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const showPopup = (point: Coord, text: string) => {
    if (!mapInstance.current) return;
    if (popupRef.current) {
      popupRef.current.close();
    }
    popupRef.current = new atlas.Popup({
      position: [point.lng, point.lat],
      content: `<div style="font-size:12px">${text}</div>`
    });
    popupRef.current.open(mapInstance.current);
    if (bubbleTimerRef.current) {
      window.clearTimeout(bubbleTimerRef.current);
    }
    bubbleTimerRef.current = window.setTimeout(() => {
      popupRef.current?.close();
    }, 3500);
  };

  const centerMap = (point: Coord, zoom?: number) => {
    if (!mapInstance.current) return;
    mapInstance.current.setCamera({
      center: [point.lng, point.lat],
      zoom: zoom ?? mapInstance.current.getCamera().zoom
    });
  };

  const handleSubmit = async (
    event?: { preventDefault?: () => void } | null,
    overrides: { address?: string; city?: string } | null = null
  ) => {
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
      const payload = (await response.json()) as any;

      if (!payload.success) {
        setStatus(payload.message || payload.errorCode || "Geocode failed.");
        return;
      }

      const { latitude, longitude, formattedAddress } = payload.data.geocode;
      setStatus(`OK: ${formattedAddress}`);

      const lat = Number(latitude);
      const lng = Number(longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setStatus("Invalid coordinates returned from API.");
        return;
      }

      const point = { lat, lng };
      selectedPointRef.current = point;
      centerMap(point, 16);
      setSelectedMarker(point);
      showPopup(point, formattedAddress);
      setBadgeText(formattedAddress);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request failed.");
    }
  };

  const getMapBias = () => {
    if (!mapInstance.current) {
      return { latitude: 32.505, longitude: 34.905 };
    }
    const center = mapInstance.current.getCamera().center as atlas.data.Position;
    return { latitude: center[1], longitude: center[0] };
  };

  const fetchSuggestions = async (query: string) => {
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
      const payload = (await response.json()) as any;
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

  const onAddressChange = (value: string) => {
    setAddress(value);
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      fetchSuggestions(value);
    }, 350);
  };

  const sanitizeCity = (value: string) => value.replace(/[0-9]/g, "").trim();

  const handleSuggestionSelect = (item: AutosuggestItem) => {
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

  const onAddressKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
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

    if (!polygonSourceRef.current) {
      return;
    }

    polygonSourceRef.current.clear();

    if (!next) {
      return;
    }

    try {
      const response = await fetch(`${apiBase}/locations/service-areas`);
      if (!response.ok) {
        setStatus("Failed to load service area polygon.");
        return;
      }

      const geojson = (await response.json()) as any;
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

      polygons.forEach((polygonCoords: any) => {
        const ring = polygonCoords[0];
        const coords = ring.map(([lng, lat]: [number, number]) => [lng, lat]);
        const polygon = new atlas.data.Polygon([coords]);
        polygonSourceRef.current?.add(polygon);
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Polygon load failed.");
    }
  };

  const toggleIsoline = async () => {
    if (!mapInstance.current || !isolineSourceRef.current) {
      return;
    }

    const origin = selectedPointRef.current;
    if (!origin) {
      setStatus("Select a location first.");
      return;
    }

    if (isolineVisible) {
      isolineSourceRef.current.clear();
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
      const payload = (await response.json()) as any;
      if (!payload.success) {
        setStatus(payload.message || payload.errorCode || "Isoline failed.");
        return;
      }

      isolineSourceRef.current.clear();
      const isolines = payload.data.isolines || [];
      const positions: atlas.data.Position[] = [];
      isolines.forEach((isoline: any) => {
        isoline.polygons?.forEach((polygon: any) => {
          const coords = (polygon.coordinates || []).map((c: any) => [
            c.longitude,
            c.latitude
          ]);
          if (coords.length === 0) return;
          const shape = new atlas.data.Polygon([coords]);
          isolineSourceRef.current?.add(shape);
          coords.forEach((c: atlas.data.Position) => positions.push(c));
        });
      });

      if (positions.length > 0) {
        const bounds = atlas.data.BoundingBox.fromPositions(positions);
        mapInstance.current?.setCamera({ bounds });
      }

      setIsolineVisible(true);
      setStatus("Isoline ready.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Isoline failed.");
    }
  };

  const togglePoi = async () => {
    const origin = selectedPointRef.current;
    if (!origin) {
      setStatus("Select a location first.");
      return;
    }

    if (poiVisible) {
      poiSourceRef.current?.clear();
      routeSourceRef.current?.clear();
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
      const payload = (await response.json()) as any;
      if (!payload.success) {
        setStatus(payload.message || payload.errorCode || "POI search failed.");
        return;
      }

      const items = (payload.data.items || []) as PoiItem[];
      const positions: atlas.data.Position[] = [];
      const poiFeatures: atlas.data.Feature<atlas.data.Point, any>[] = [];
      items.forEach((item) => {
        if (!item.position) return;
        const point = { lat: item.position.latitude, lng: item.position.longitude };
        const categoryText = `${item.category || ""} ${item.title || ""}`.toLowerCase();
        let categoryGroup = "default";
        if (
          categoryText.includes("cafe") ||
          categoryText.includes("coffee") ||
          categoryText.includes("restaurant") ||
          categoryText.includes("food") ||
          categoryText.includes("קפה") ||
          categoryText.includes("בית קפה")
        ) {
          categoryGroup = "food";
        } else if (
          categoryText.includes("bank") ||
          categoryText.includes("atm") ||
          categoryText.includes("finance") ||
          categoryText.includes("בנק") ||
          categoryText.includes("כספומט")
        ) {
          categoryGroup = "bank";
        } else if (
          categoryText.includes("pharmacy") ||
          categoryText.includes("hospital") ||
          categoryText.includes("clinic") ||
          categoryText.includes("health") ||
          categoryText.includes("רוקחות") ||
          categoryText.includes("בית חולים") ||
          categoryText.includes("מרפאה")
        ) {
          categoryGroup = "health";
        }
        positions.push([point.lng, point.lat]);
        poiFeatures.push(
          new atlas.data.Feature(new atlas.data.Point([point.lng, point.lat]), {
            title: item.title || "POI",
            category: item.category || "POI",
            categoryGroup,
            distanceMeters:
              typeof item.distanceMeters === "number"
                ? Math.round(item.distanceMeters)
                : undefined
          })
        );
      });
      poiSourceRef.current?.setShapes(poiFeatures);

      if (positions.length > 0 && mapInstance.current) {
        const bounds = atlas.data.BoundingBox.fromPositions(positions);
        mapInstance.current.setCamera({ bounds });
      }

      setPoiVisible(true);
      setPoiResults(items);
      setStatus(`POI found: ${items.length}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "POI search failed.");
    }
  };

  const drawRouteTo = async (destination: Coord) => {
    if (!selectedPointRef.current) {
      setStatus("Select a location first.");
      return;
    }
    try {
      const response = await fetch(`${apiBase}/locations/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: {
            latitude: selectedPointRef.current.lat,
            longitude: selectedPointRef.current.lng
          },
          to: {
            latitude: destination.lat,
            longitude: destination.lng
          }
        })
      });
      const payload = (await response.json()) as any;
      if (!payload.success) {
        setStatus(payload.message || payload.errorCode || "Route failed.");
        return;
      }

      const data = payload.data;
      const path = data.path || [];
      if (!routeSourceRef.current || path.length === 0) {
        setStatus("Route path missing.");
        return;
      }

      const coords = path.map((p: any) => [p.longitude, p.latitude]);
      const line = new atlas.data.LineString(coords);
      routeSourceRef.current.clear();
      routeSourceRef.current.add(line);
      routePathRef.current = coords.map(([lng, lat]: [number, number]) => ({ lat, lng }));
      destinationPointSourceRef.current?.setShapes([
        new atlas.data.Feature(new atlas.data.Point([destination.lng, destination.lat]))
      ]);

      const bounds = atlas.data.BoundingBox.fromPositions(coords);
      mapInstance.current?.setCamera({ bounds });

      const km = (data.distanceMeters / 1000).toFixed(1);
      const min = Math.round(data.durationSeconds / 60);
      setStatus(`Route: ${km} km, ${min} min`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Route failed.");
    }
  };

  const exportStaticMap = async () => {
    if (!mapInstance.current || !mapRef.current) {
      setStatus("Map not ready.");
      return;
    }
    const camera = mapInstance.current.getCamera();
    const center = camera.center as atlas.data.Position;
    const zoom = camera.zoom ?? 12;
    const width = Math.min(1024, Math.max(320, Math.round(mapRef.current.clientWidth)));
    const height = Math.min(1024, Math.max(320, Math.round(mapRef.current.clientHeight)));

    try {
      const response = await fetch(`${apiBase}/locations/static-map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          center: { latitude: center[1], longitude: center[0] },
          zoom,
          width,
          height,
          path: routePathRef.current.map((p) => ({
            latitude: p.lat,
            longitude: p.lng
          }))
        })
      });

      if (!response.ok) {
        const message = await response.text();
        setStatus(message || "Static map failed.");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "map.png";
      link.click();
      URL.revokeObjectURL(url);
      setStatus("Static map downloaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Static map failed.");
    }
  };

  const saveOverlay = async () => {
    const payload = overlay.getOverlaySavePayload();
    if (!payload) {
      setStatus("No overlay to save.");
      return;
    }
    try {
      const form = new FormData();
      form.append("image", payload.imageFile);
      form.append("metadata", JSON.stringify(payload.metadata));
      const response = await fetch(`${apiBase}/overlays`, {
        method: "POST",
        body: form
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        setStatus(data?.message || "Failed to save overlay.");
        return;
      }
      const savedId =
        data?.data?.id || data?.data?.Id || data?.data?.ID || null;
      if (savedId) {
        overlay.markOverlaySaved(String(savedId));
      }
      setStatus("Overlay saved to Azure Storage.");
      overlay.clearOverlaySelection();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save overlay.");
    }
  };

  const removeOverlay = async () => {
    if (overlay.overlaySaved && overlay.overlayId) {
      try {
        const response = await fetch(`${apiBase}/overlays/${overlay.overlayId}`, {
          method: "DELETE"
        });
        if (!response.ok) {
          const message = await response.text();
          setStatus(message || "Failed to remove overlay from storage.");
          return;
        }
        setStatus("Overlay removed from Azure Storage.");
      } catch (error) {
        setStatus(
          error instanceof Error
            ? error.message
            : "Failed to remove overlay from storage."
        );
        return;
      }
    }
    overlay.removeOverlay();
  };

  return (
    <div className="page">
      <header className="header">
        <div>
          <p className="eyebrow">Location Demo</p>
          <h1>Azure Geo Platform</h1>
          <p className="subtitle">
            Provider-agnostic backend with geocoding, validation, routing,
            isolines, and POI search.
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
                  window.setTimeout(() => setShowSuggestions(false), 150);
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
          <button type="button" onClick={openCaesareaView}>
            Open Caesarea View
          </button>
          <label>
            Upload overlay (manual)
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setManualOverlayName(file.name);
                overlay.startManualOverlay(file);
                event.currentTarget.value = "";
              }}
            />
            {manualOverlayName && (
              <div className="file-name">{manualOverlayName}</div>
            )}
          </label>
          <label>
            Upload overlay (geo‑anchored)
            <input
              type="file"
              accept="image/png,image/jpeg,.pgw,.jgw,.wld,.tfw"
              multiple
              onChange={async (event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length === 0) return;
                const imageFile = files.find((file) =>
                  file.type === "image/png" || file.type === "image/jpeg"
                );
                const worldFile = files.find((file) =>
                  /\.(pgw|jgw|wld|tfw)$/i.test(file.name)
                );
                if (!imageFile || !worldFile) {
                  setStatus("Select an image and its world file (.pgw/.jgw/.wld/.tfw).");
                  event.currentTarget.value = "";
                  return;
                }
                try {
                  setGeoOverlayName(`${imageFile.name} + ${worldFile.name}`);
                  const worldText = await worldFile.text();
                  await overlay.startGeoOverlayFromWorld(imageFile, worldText);
                } catch (error) {
                  console.error("[overlay] startGeoOverlay failed", error);
                  setStatus("Failed to place geo‑anchored overlay.");
                }
                event.currentTarget.value = "";
              }}
            />
            {geoOverlayName && <div className="file-name">{geoOverlayName}</div>}
          </label>
          <button type="button" onClick={useMyLocation}>
            Use My Location
          </button>
          <button type="button" onClick={toggleIsoline}>
            {isolineVisible ? "Hide Isoline" : "Show 10 min Isoline"}
          </button>
          <button type="button" onClick={flyToDemo}>
            Fly Camera
          </button>
          <button type="button" onClick={fitDemoBounds}>
            Fit Bounds
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
          <button type="button" onClick={exportStaticMap}>
            Export Map Image
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
                    centerMap(point, 16);
                    showPopup(point, item.title || "");
                    drawRouteTo(point);
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

        <section className={`map-card${badgeText ? " has-badge" : ""}`}>
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
          <div className="map-hint map-hint-secondary">
            Right‑click for options
          </div>
          {overlay.geoInstruction && (
            <div className="map-hint map-hint-tertiary">
              {overlay.geoInstruction}
            </div>
          )}
          <div
            ref={mapRef}
            className="map"
            onContextMenu={(event) => event.preventDefault()}
            tabIndex={0}
            role="application"
            aria-label="Interactive map"
            onKeyDown={(event) => {
              if (event.key === "Escape" && overlay.overlayMode === "geo") {
                event.preventDefault();
                overlay.cancelGeoPlacement();
                return;
              }
              if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                event.preventDefault();
                const center = mapInstance.current?.getCamera()
                  .center as atlas.data.Position | undefined;
                if (!center) return;
                openContextMenu(
                  (mapRef.current?.clientWidth ?? 0) / 2,
                  (mapRef.current?.clientHeight ?? 0) / 2,
                  { lat: center[1], lng: center[0] }
                );
              }
            }}
          />
          {contextMenu && (
            <div
              className="context-menu"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              role="menu"
              aria-label="Map options"
              onKeyDown={handleMenuKeyDown}
              ref={menuRef}
            >
              <button
                type="button"
                role="menuitem"
                ref={(el) => (menuItemRefs.current[0] = el)}
                onClick={() => {
                  setContextMenu(null);
                  selectedPointRef.current = contextMenu.coord;
                  centerMap(contextMenu.coord, 16);
                  setSelectedMarker(contextMenu.coord);
                  setStatus("Start point set.");
                }}
              >
                הגדר כנקודת התחלה
              </button>
              <button
                type="button"
                role="menuitem"
                ref={(el) => (menuItemRefs.current[1] = el)}
                onClick={() => {
                  setContextMenu(null);
                  if (!selectedPointRef.current) {
                    setStatus("Select a start point first.");
                    return;
                  }
                  showPopup(contextMenu.coord, "Destination");
                  drawRouteTo(contextMenu.coord);
                }}
              >
                הגדר כיעד
              </button>
              <button
                type="button"
                role="menuitem"
                ref={(el) => (menuItemRefs.current[2] = el)}
                onClick={() => {
                  setContextMenu(null);
                  validateInsideArea(contextMenu.coord);
                }}
              >
                בדוק אם בתוך אזור שירות
              </button>
              <button
                type="button"
                role="menuitem"
                ref={(el) => (menuItemRefs.current[3] = el)}
                onClick={() => {
                  setContextMenu(null);
                  const start = selectedPointRef.current;
                  if (!start) {
                    setStatus("Select a start point first.");
                    return;
                  }
                  const meters = distanceMeters(start, contextMenu.coord);
                  const km = meters / 1000;
                  setStatus(`Distance: ${km.toFixed(2)} km`);
                }}
              >
                חשב מרחק מכאן
              </button>
              <button
                type="button"
                role="menuitem"
                ref={(el) => (menuItemRefs.current[4] = el)}
                onClick={() => {
                  setContextMenu(null);
                  resetMapState();
                }}
              >
                איפוס
              </button>
            </div>
          )}
          {overlay.overlaySelected && (
            <div className="overlay-panel">
              <div className="overlay-panel-row">
                <label>
                  Opacity
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={overlay.overlayOpacity}
                    onChange={(event) =>
                      overlay.setOpacity(Number(event.target.value))
                    }
                  />
                </label>
              </div>
              <div className="overlay-panel-row">
                {!overlay.overlaySaved && (
                  <button type="button" onClick={saveOverlay}>
                    Save
                  </button>
                )}
                {overlay.overlayMode === "manual" && (
                  <button type="button" onClick={overlay.resetManual}>
                    Reset
                  </button>
                )}
                <button type="button" onClick={removeOverlay}>
                  Remove
                </button>
              </div>
              {overlay.geoPendingCorners && (
                <div className="overlay-panel-row">
                  <button type="button" onClick={overlay.applyGeoPlacement}>
                    Apply placement
                  </button>
                  <button type="button" onClick={overlay.cancelGeoPlacement}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
          {overlay.overlayMode === "manual" &&
            overlay.overlayActive &&
            overlay.overlaySelected &&
            !overlay.overlayLocked && (
            <div className="overlay-editor">
              <div
                className="overlay-drag"
                onPointerDown={overlay.beginDragOverlay}
              />
              {overlay.overlayHandles.map((p, index) => (
                <button
                  type="button"
                  key={`handle-${index}`}
                  className="overlay-handle"
                  style={{ left: p.x, top: p.y }}
                  onPointerDown={(event) => overlay.beginDragHandle(index, event)}
                  aria-label={`Resize handle ${index + 1}`}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
