import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import * as atlas from "azure-maps-control";

type Coord = { lat: number; lng: number };

type OverlayManagerArgs = {
  mapRef: RefObject<HTMLDivElement | null>;
  mapInstance: RefObject<atlas.Map | null>;
  setStatus: (text: string) => void;
  mapReady: boolean;
};

export function useOverlayManager({
  mapRef,
  mapInstance,
  setStatus,
  mapReady
}: OverlayManagerArgs) {
  const overlayLayerRef = useRef<atlas.layer.ImageLayer | null>(null);
  const overlayUrlRef = useRef<string | null>(null);
  const overlayFileRef = useRef<File | null>(null);
  const overlayCornersRef = useRef<Coord[] | null>(null);
  const geoStartRef = useRef<Coord | null>(null);
  const menuHandlesRef = useRef<{ x: number; y: number }[]>([]);
  const userInteractionRef = useRef<atlas.UserInteractionOptions | null>(null);

  const [overlayMode, setOverlayMode] = useState<"none" | "manual" | "geo">("none");
  const [overlayActive, setOverlayActive] = useState(false);
  const [overlaySelected, setOverlaySelected] = useState(false);
  const [overlayLocked, setOverlayLocked] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(0.8);
  const [overlaySaved, setOverlaySaved] = useState(false);
  const [overlayId, setOverlayId] = useState<string | null>(null);
  const [overlayHandles, setOverlayHandles] = useState<{ x: number; y: number }[]>(
    []
  );
  const [geoInstruction, setGeoInstruction] = useState<string | null>(null);
  const [geoPendingCorners, setGeoPendingCorners] = useState<Coord[] | null>(null);

  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;
    const map = mapInstance.current;

    const updateHandles = () => {
      if (!overlayCornersRef.current || !mapInstance.current) return;
      if (
        overlayCornersRef.current.length !== 4 ||
        !overlayCornersRef.current.every((c) =>
          Number.isFinite(c.lng) && Number.isFinite(c.lat)
        )
      ) {
        return;
      }
      const pixels = mapInstance.current.positionsToPixels(
        overlayCornersRef.current.map((c) => [c.lng, c.lat])
      ) as atlas.Pixel[];
      const handles = pixels.map((p) => ({ x: p[0], y: p[1] }));
      menuHandlesRef.current = handles;
      setOverlayHandles(handles);
    };

    map.events.add("move", updateHandles);
    map.events.add("zoom", updateHandles);
    map.events.add("resize", updateHandles);

    return () => {
      map.events.remove("move", updateHandles);
      map.events.remove("zoom", updateHandles);
      map.events.remove("resize", updateHandles);
    };
  }, [mapReady, mapInstance]);

  useEffect(() => {
    if (!mapInstance.current) return;
    const map = mapInstance.current;
    const isEditing =
      overlayMode === "manual" && overlayActive && overlaySelected && !overlayLocked;
    if (isEditing) {
      if (!userInteractionRef.current) {
        userInteractionRef.current = map.getUserInteraction();
      }
      map.setUserInteraction({ interactive: false });
      return;
    }
    if (userInteractionRef.current) {
      map.setUserInteraction(userInteractionRef.current);
      userInteractionRef.current = null;
    }
  }, [overlayMode, overlayActive, overlayLocked, mapInstance]);

  const updateHandlesNow = () => {
    if (!overlayCornersRef.current || !mapInstance.current) return;
    if (
      overlayCornersRef.current.length !== 4 ||
      !overlayCornersRef.current.every((c) =>
        Number.isFinite(c.lng) && Number.isFinite(c.lat)
      )
    ) {
      return;
    }
    const pixels = mapInstance.current.positionsToPixels(
      overlayCornersRef.current.map((c) => [c.lng, c.lat])
    ) as atlas.Pixel[];
    const handles = pixels.map((p) => ({ x: p[0], y: p[1] }));
    menuHandlesRef.current = handles;
    setOverlayHandles(handles);
  };

  const applyImageOverlay = (corners: Coord[]) => {
    if (!mapInstance.current || !overlayUrlRef.current) return;
    if (
      corners.length !== 4 ||
      !corners.every((c) => Number.isFinite(c.lng) && Number.isFinite(c.lat))
    ) {
      return;
    }
    const coords = corners.map((c) => [c.lng, c.lat]);
    if (!overlayLayerRef.current) {
      overlayLayerRef.current = new atlas.layer.ImageLayer({
        url: overlayUrlRef.current,
        coordinates: coords as any,
        opacity: overlayOpacity
      });
      mapInstance.current.layers.add(overlayLayerRef.current, "labels");
    } else {
      overlayLayerRef.current.setOptions({
        url: overlayUrlRef.current,
        coordinates: coords as any,
        opacity: overlayOpacity
      });
    }
    overlayCornersRef.current = corners;
    updateHandlesNow();
    setOverlayActive(true);
    setOverlaySelected(true);
    requestAnimationFrame(() => updateHandlesNow());
  };

  const confirmReplace = () => {
    if (!overlayActive) return true;
    return window.confirm("Replace the existing overlay?");
  };

  const startManualOverlay = (file: File) => {
    if (!mapInstance.current) return;
    if (!confirmReplace()) return;
    removeOverlay();
    const url = URL.createObjectURL(file);
    overlayUrlRef.current = url;
    overlayFileRef.current = file;
    setOverlaySaved(false);
    setOverlayId(null);
    setOverlayMode("manual");
    const rect = mapRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      const map = mapInstance.current;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const size = Math.min(rect.width, rect.height) * 0.18;
      const pixels = [
        [cx - size, cy - size],
        [cx + size, cy - size],
        [cx + size, cy + size],
        [cx - size, cy + size]
      ];
      const positions = map.pixelsToPositions(pixels as any) as atlas.data.Position[];
      if (positions?.length === 4) {
        applyImageOverlay(positions.map((p) => ({ lng: p[0], lat: p[1] })));
        return;
      }
    }
    const camera = mapInstance.current.getCamera();
    const center = camera.center as atlas.data.Position;
    const zoom = camera.zoom ?? 12;
    const delta = 0.002 * Math.pow(2, 12 - zoom);
    applyImageOverlay([
      { lng: center[0] - delta, lat: center[1] + delta },
      { lng: center[0] + delta, lat: center[1] + delta },
      { lng: center[0] + delta, lat: center[1] - delta },
      { lng: center[0] - delta, lat: center[1] - delta }
    ]);
  };

  const parseWorldFile = (text: string) => {
    const values = text
      .trim()
      .split(/\s+/)
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v));
    if (values.length < 6) return null;
    const [A, D, B, E, C, F] = values;
    return { A, B, C, D, E, F };
  };

  const loadImageSize = (url: string) =>
    new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = reject;
      img.src = url;
    });

  const startGeoOverlayFromWorld = async (imageFile: File, worldText: string) => {
    try {
      if (!confirmReplace()) return;
      if (!mapInstance.current) return;
      removeOverlay();
      const parsed = parseWorldFile(worldText);
      if (!parsed) {
        setStatus("World file invalid. Expected 6 numeric lines.");
        return;
      }
      overlayUrlRef.current = URL.createObjectURL(imageFile);
      overlayFileRef.current = imageFile;
      setOverlaySaved(false);
      setOverlayId(null);
      const { width, height } = await loadImageSize(overlayUrlRef.current);
      const toCoord = (x: number, y: number) => {
        const lng = parsed.A * x + parsed.B * y + parsed.C;
        const lat = parsed.D * x + parsed.E * y + parsed.F;
        return { lng, lat };
      };
      const corners = [
        toCoord(0, 0),
        toCoord(width, 0),
        toCoord(width, height),
        toCoord(0, height)
      ];
      applyImageOverlay(corners);
      setOverlayMode("none");
      setGeoInstruction(null);
      setGeoPendingCorners(null);
      geoStartRef.current = null;
      setOverlayLocked(true);
      setStatus("Geo‑anchored image placed.");
    } catch (error) {
      console.error("[overlay] startGeoOverlay failed", error);
      setStatus("Failed to place geo‑anchored overlay.");
    }
  };

  const handleGeoClick = (coord: Coord) => {
    if (overlayMode !== "geo") return false;
    if (!Number.isFinite(coord.lat) || !Number.isFinite(coord.lng)) {
      console.warn("[overlay] invalid geo click coord", coord);
      return false;
    }
    if (!geoStartRef.current) {
      geoStartRef.current = coord;
      setGeoInstruction("Select bottom‑right corner");
      return true;
    }
    const start = geoStartRef.current;
    const minLat = Math.min(start.lat, coord.lat);
    const maxLat = Math.max(start.lat, coord.lat);
    const minLng = Math.min(start.lng, coord.lng);
    const maxLng = Math.max(start.lng, coord.lng);
    const corners: Coord[] = [
      { lat: maxLat, lng: minLng },
      { lat: maxLat, lng: maxLng },
      { lat: minLat, lng: maxLng },
      { lat: minLat, lng: minLng }
    ];
    setGeoPendingCorners(corners);
    setGeoInstruction("Apply placement?");
    return true;
  };

  const applyGeoPlacement = () => {
    if (!geoPendingCorners) return;
    applyImageOverlay(geoPendingCorners);
    setOverlayMode("none");
    setGeoInstruction(null);
    setGeoPendingCorners(null);
    geoStartRef.current = null;
    setStatus("Geo‑anchored image placed.");
  };

  const cancelGeoPlacement = () => {
    setOverlayMode("none");
    setGeoInstruction(null);
    setGeoPendingCorners(null);
    geoStartRef.current = null;
  };

  const removeOverlay = () => {
    if (overlayLayerRef.current && mapInstance.current) {
      mapInstance.current.layers.remove(overlayLayerRef.current);
      overlayLayerRef.current = null;
    }
    overlayCornersRef.current = null;
    overlayFileRef.current = null;
    setOverlayActive(false);
    setOverlaySelected(false);
    setOverlayHandles([]);
    setOverlaySaved(false);
    setOverlayId(null);
  };

  const markOverlaySaved = (id: string) => {
    setOverlaySaved(true);
    setOverlayId(id);
  };

  const getOverlaySavePayload = () => {
    if (!overlayFileRef.current || !overlayCornersRef.current) {
      return null;
    }
    return {
      imageFile: overlayFileRef.current,
      metadata: {
        mode: overlayMode,
        opacity: overlayOpacity,
        corners: overlayCornersRef.current.map((corner) => ({
          latitude: corner.lat,
          longitude: corner.lng
        }))
      }
    };
  };

  const handleOverlayClick = (coord: Coord) => {
    if (!overlayActive || !overlayCornersRef.current) {
      return false;
    }
    if (!Number.isFinite(coord.lat) || !Number.isFinite(coord.lng)) {
      return false;
    }
    const poly = overlayCornersRef.current.map((c) => [c.lng, c.lat]);
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0];
      const yi = poly[i][1];
      const xj = poly[j][0];
      const yj = poly[j][1];
      const intersect =
        yi > coord.lat !== yj > coord.lat &&
        coord.lng < ((xj - xi) * (coord.lat - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    if (inside) {
      setOverlaySelected(true);
      return true;
    }
    if (overlaySelected) {
      setOverlaySelected(false);
    }
    return false;
  };

  const clearOverlaySelection = () => {
    setOverlaySelected(false);
  };

  const resetManual = () => {
    if (!mapInstance.current || overlayMode !== "manual") return;
    const rect = mapRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      const map = mapInstance.current;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const size = Math.min(rect.width, rect.height) * 0.18;
      const pixels = [
        [cx - size, cy - size],
        [cx + size, cy - size],
        [cx + size, cy + size],
        [cx - size, cy + size]
      ];
      const positions = map.pixelsToPositions(pixels as any) as atlas.data.Position[];
      if (positions?.length === 4) {
        applyImageOverlay(positions.map((p) => ({ lng: p[0], lat: p[1] })));
        return;
      }
    }
    const camera = mapInstance.current.getCamera();
    const center = camera.center as atlas.data.Position;
    const zoom = camera.zoom ?? 12;
    const delta = 0.002 * Math.pow(2, 12 - zoom);
    applyImageOverlay([
      { lng: center[0] - delta, lat: center[1] + delta },
      { lng: center[0] + delta, lat: center[1] + delta },
      { lng: center[0] + delta, lat: center[1] - delta },
      { lng: center[0] - delta, lat: center[1] - delta }
    ]);
  };

  useEffect(() => {
    if (overlayMode !== "manual" || !overlayActive) return;
    requestAnimationFrame(() => updateHandlesNow());
    if (overlayHandles.length === 0 && overlayCornersRef.current) {
      updateHandlesNow();
    }
  }, [overlayMode, overlayActive, overlayHandles.length]);

  useEffect(() => {
    // Debug logs requested.
    console.log("[overlay] mode:", overlayMode);
  }, [overlayMode]);

  useEffect(() => {
    console.log("[overlay] active:", overlayActive);
  }, [overlayActive]);

  useEffect(() => {
    console.log("[overlay] handles:", overlayHandles.length);
  }, [overlayHandles.length]);

  const setOpacity = (value: number) => {
    setOverlayOpacity(value);
    if (overlayLayerRef.current) {
      overlayLayerRef.current.setOptions({ opacity: value });
    }
  };

  const updateOverlayFromPixels = (pixels: { x: number; y: number }[]) => {
    if (!mapInstance.current || pixels.length !== 4) return;
    const positions = mapInstance.current.pixelsToPositions(
      pixels.map((p) => [p.x, p.y])
    ) as atlas.data.Position[];
    const corners = positions.map((p) => ({ lng: p[0], lat: p[1] }));
    applyImageOverlay(corners);
  };

  const beginDragHandle = (index: number, startEvent: React.PointerEvent) => {
    if (!overlayCornersRef.current || !mapInstance.current) return;
    if (overlayLocked) return;
    startEvent.preventDefault();
    startEvent.stopPropagation();
    const target = startEvent.currentTarget as HTMLElement | null;
    target?.setPointerCapture?.(startEvent.pointerId);
    if (menuHandlesRef.current.length === 0) {
      updateHandlesNow();
      if (menuHandlesRef.current.length === 0) return;
    }
    const startPixels = menuHandlesRef.current.map((p) => ({ ...p }));
    const center = {
      x: startPixels.reduce((s, p) => s + p.x, 0) / 4,
      y: startPixels.reduce((s, p) => s + p.y, 0) / 4
    };
    const startVec = {
      x: startPixels[index].x - center.x,
      y: startPixels[index].y - center.y
    };
    const startAngle = Math.atan2(startVec.y, startVec.x);
    const startLen = Math.hypot(startVec.x, startVec.y);
    const onMove = (event: PointerEvent) => {
      const rect = mapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const vec = { x: x - center.x, y: y - center.y };
      const angle = Math.atan2(vec.y, vec.x);
      const len = Math.max(10, Math.hypot(vec.x, vec.y));
      const rot = angle - startAngle;
      const scale = len / startLen;
      const next = startPixels.map((p) => {
        const dx = p.x - center.x;
        const dy = p.y - center.y;
        const rx = dx * Math.cos(rot) - dy * Math.sin(rot);
        const ry = dx * Math.sin(rot) + dy * Math.cos(rot);
        return {
          x: center.x + rx * scale,
          y: center.y + ry * scale
        };
      });
      updateOverlayFromPixels(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      target?.releasePointerCapture?.(startEvent.pointerId);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const beginDragOverlay = (startEvent: React.PointerEvent) => {
    if (overlayLocked) return;
    startEvent.preventDefault();
    startEvent.stopPropagation();
    const target = startEvent.currentTarget as HTMLElement | null;
    target?.setPointerCapture?.(startEvent.pointerId);
    if (menuHandlesRef.current.length === 0) {
      updateHandlesNow();
      if (menuHandlesRef.current.length === 0) return;
    }
    const start = menuHandlesRef.current.map((p) => ({ ...p }));
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = startEvent.clientX - rect.left;
    const startY = startEvent.clientY - rect.top;
    const onMove = (event: PointerEvent) => {
      const dx = event.clientX - rect.left - startX;
      const dy = event.clientY - rect.top - startY;
      const next = start.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      updateOverlayFromPixels(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      target?.releasePointerCapture?.(startEvent.pointerId);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return {
    overlayMode,
    overlayActive,
    overlaySelected,
    overlayLocked,
    overlayOpacity,
    overlaySaved,
    overlayId,
    overlayHandles,
    geoInstruction,
    geoPendingCorners,
    startManualOverlay,
    startGeoOverlayFromWorld,
    handleGeoClick,
    handleOverlayClick,
    clearOverlaySelection,
    applyGeoPlacement,
    cancelGeoPlacement,
    beginDragHandle,
    beginDragOverlay,
    removeOverlay,
    resetManual,
    setOpacity,
    setOverlayLocked,
    getOverlaySavePayload,
    markOverlaySaved
  };
}
