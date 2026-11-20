import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  PlaceSearchResult,
  searchPlaces as searchPlaceLocations,
} from '../utils/appDataStorage';
import { ProjectRouteSegment } from '../types/undergrounding';
import {
  Check,
  LoaderCircle,
  LocateFixed,
  Pencil,
  Plus,
  Search,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';

interface RouteCoordinatePickerProps {
  segments: ProjectRouteSegment[];
  activeSegmentId: string;
  onSelectSegment: (segmentId: string) => void;
  onAddSegment: () => void;
  onDeleteSegment: (segmentId: string) => void;
  onRenameSegment: (segmentId: string, name: string) => void;
  onAddPointToActiveSegment: (lat: number, lng: number, placeName?: string) => void;
  onRemovePointFromActiveSegment?: (pointId: string) => void;
  onUndoPointInActiveSegment: () => void;
  onClearActiveSegment: () => void;
  isFullScreen?: boolean;
}

const DEFAULT_MAP_CENTER: [number, number] = [16.0544, 108.2022]; // Đà Nẵng
const DEFAULT_MAP_ZOOM = 14;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[char] || char;
  });

export const RouteCoordinatePicker: React.FC<RouteCoordinatePickerProps> = ({
  segments,
  activeSegmentId,
  onSelectSegment,
  onAddSegment,
  onDeleteSegment,
  onRenameSegment,
  onAddPointToActiveSegment,
  onRemovePointFromActiveSegment,
  onUndoPointInActiveSegment,
  onClearActiveSegment,
  isFullScreen = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const routeLayersRef = useRef<L.LayerGroup | null>(null);
  const searchLayersRef = useRef<L.LayerGroup | null>(null);
  const hasFittedInitialBoundsRef = useRef(false);

  const onAddPointRef = useRef(onAddPointToActiveSegment);
  const onRemovePointRef = useRef(onRemovePointFromActiveSegment);
  const onSelectSegmentRef = useRef(onSelectSegment);

  const [placeQuery, setPlaceQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [selectedSearchResult, setSelectedSearchResult] = useState<PlaceSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editingSegmentName, setEditingSegmentName] = useState('');
  const searchRequestRef = useRef<AbortController | null>(null);
  const lastSearchAtRef = useRef(0);

  onAddPointRef.current = onAddPointToActiveSegment;
  onRemovePointRef.current = onRemovePointFromActiveSegment;
  onSelectSegmentRef.current = onSelectSegment;

  const activeSegment =
    segments.find((s) => s.id === activeSegmentId) || segments[0] || null;

  // Initialize Map ONCE
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const firstValidPt = segments
      .flatMap((s) => s.points)
      .find((pt) => Number.isFinite(pt.lat) && Number.isFinite(pt.lng));

    const initialCenter: [number, number] = firstValidPt
      ? [firstValidPt.lat, firstValidPt.lng]
      : DEFAULT_MAP_CENTER;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      doubleClickZoom: false,
    }).setView(initialCenter, DEFAULT_MAP_ZOOM);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      {
        attribution:
          'Tiles &copy; Esri, TomTom, Garmin, FAO, NOAA, USGS, &copy; OpenStreetMap contributors',
        maxZoom: 19,
      }
    ).addTo(map);

    const layers = L.layerGroup().addTo(map);
    const searchLayers = L.layerGroup().addTo(map);

    map.on('click', (event: L.LeafletMouseEvent) => {
      const originTarget = event.originalEvent?.target as HTMLElement | null;
      if (originTarget?.closest('[data-marker-interactive="true"]')) {
        return;
      }
      onAddPointRef.current(
        Number(event.latlng.lat.toFixed(6)),
        Number(event.latlng.lng.toFixed(6))
      );
    });

    mapInstanceRef.current = map;
    routeLayersRef.current = layers;
    searchLayersRef.current = searchLayers;

    const rafId = window.requestAnimationFrame(() => {
      map.invalidateSize({ pan: false });
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      searchRequestRef.current?.abort();
      map.remove();
      mapInstanceRef.current = null;
      routeLayersRef.current = null;
      searchLayersRef.current = null;
    };
  }, []);

  // Render all segments on map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layers = routeLayersRef.current;
    if (!map || !layers) return;

    layers.clearLayers();
    const allCoords: [number, number][] = [];

    segments.forEach((seg) => {
      const isActive = seg.id === activeSegment?.id;
      const validPts = seg.points.filter(
        (pt) => Number.isFinite(pt.lat) && Number.isFinite(pt.lng)
      );
      if (validPts.length === 0) return;

      const coords = validPts.map((pt) => [pt.lat, pt.lng] as [number, number]);
      allCoords.push(...coords);

      const segColor = isActive ? '#2563eb' : '#0d9488';

      if (coords.length >= 2) {
        if (isActive) {
          L.polyline(coords, {
            color: '#ffffff',
            weight: 10,
            opacity: 0.9,
            interactive: false,
          }).addTo(layers);
        }

        const line = L.polyline(coords, {
          color: segColor,
          weight: isActive ? 6 : 4,
          opacity: isActive ? 1 : 0.75,
          dashArray: isActive ? undefined : '6 6',
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(layers);

        line.bindTooltip(
          `${escapeHtml(seg.name)} (${validPts.length} điểm)`,
          { sticky: true, direction: 'top' }
        );
        if (!isActive) {
          line.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            onSelectSegmentRef.current(seg.id);
          });
        }
      }

      // Draw point markers
      validPts.forEach((pt, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === validPts.length - 1 && validPts.length > 1;
        const bg = isFirst ? '#16a34a' : isLast ? '#dc2626' : segColor;
        const size = isActive ? 22 : 16;

        const marker = L.marker([pt.lat, pt.lng], {
          icon: L.divIcon({
            className: 'route-picker-point-marker',
            html: `<div data-marker-interactive="true" title="${
              isActive ? 'Bấm để xóa điểm này' : escapeHtml(seg.name)
            }" style="cursor:pointer;width:${size}px;height:${size}px;border-radius:9999px;background:${bg};color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:${
              isActive ? 10 : 9
            }px;font-weight:800;">${idx + 1}</div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          }),
          interactive: true,
        }).addTo(layers);

        if (isActive) {
          marker.bindTooltip(`Điểm ${idx + 1} (bấm để xóa)`, { direction: 'top' });
          marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            onRemovePointRef.current?.(pt.id);
          });
        } else {
          marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            onSelectSegmentRef.current(seg.id);
          });
        }
      });
    });

    if (!hasFittedInitialBoundsRef.current && allCoords.length > 0) {
      hasFittedInitialBoundsRef.current = true;
      if (allCoords.length > 1) {
        map.fitBounds(L.latLngBounds(allCoords), { padding: [36, 36], maxZoom: 16 });
      } else {
        map.setView(allCoords[0], 16);
      }
    }
  }, [segments, activeSegment?.id]);

  // Search places handler
  const handleSearchPlace = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = placeQuery.trim();
    if (!query) return;

    const now = Date.now();
    if (now - lastSearchAtRef.current < 800) return;
    lastSearchAtRef.current = now;

    searchRequestRef.current?.abort();
    const controller = new AbortController();
    searchRequestRef.current = controller;

    setIsSearching(true);
    setSearchError(null);
    try {
      const results = await searchPlaceLocations(query, controller.signal);
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError('Không tìm thấy địa điểm phù hợp.');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setSearchError('Không thể tìm kiếm địa điểm lúc này.');
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (res: PlaceSearchResult) => {
    const lat = Number(res.lat);
    const lng = Number(res.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    setSelectedSearchResult(res);
    setSearchResults([]);
    mapInstanceRef.current?.flyTo([lat, lng], 17, { duration: 0.5 });

    const searchLayers = searchLayersRef.current;
    if (searchLayers) {
      searchLayers.clearLayers();
      L.circleMarker([lat, lng], {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: '#f59e0b',
        fillOpacity: 0.95,
      })
        .bindTooltip(escapeHtml(res.display_name), { permanent: false })
        .addTo(searchLayers);
    }
  };

  const handleCenterOnGps = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapInstanceRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 17, {
          duration: 0.5,
        });
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  const totalPointsAllSegments = segments.reduce((sum, s) => sum + s.points.length, 0);

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-2">
      {/* Top Toolbar: Segment Pills + Add Segment + Undo/Clear + Search */}
      <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-2xs space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {segments.map((seg) => {
              const isActive = seg.id === activeSegment?.id;
              return (
                <div
                  key={seg.id}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold transition-all ${
                    isActive
                      ? 'border-blue-600 bg-blue-600 text-white shadow-2xs'
                      : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {editingSegmentId === seg.id ? (
                    <span className="inline-flex items-center gap-1">
                      <input
                        type="text"
                        value={editingSegmentName}
                        onChange={(e) => setEditingSegmentName(e.target.value)}
                        className="w-24 rounded bg-white px-1.5 py-0.5 text-[11px] font-bold text-slate-900 outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (editingSegmentName.trim()) {
                            onRenameSegment(seg.id, editingSegmentName.trim());
                          }
                          setEditingSegmentId(null);
                        }}
                        className="rounded p-0.5 hover:bg-white/20"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onSelectSegment(seg.id)}
                        className="inline-flex items-center gap-1 text-left"
                      >
                        <span>{seg.name}</span>
                        <span
                          className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] ${
                            isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {seg.points.length}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSegmentId(seg.id);
                          setEditingSegmentName(seg.name);
                        }}
                        title="Đổi tên tuyến"
                        className={`rounded p-0.5 ${
                          isActive ? 'hover:bg-white/20' : 'hover:bg-slate-200'
                        }`}
                      >
                        <Pencil className="h-2.5 w-2.5" />
                      </button>
                      {segments.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onDeleteSegment(seg.id)}
                          title="Xóa tuyến này"
                          className={`rounded p-0.5 ${
                            isActive
                              ? 'hover:bg-red-500'
                              : 'text-red-600 hover:bg-red-100'
                          }`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={onAddSegment}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm tuyến mới
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={!activeSegment || activeSegment.points.length === 0}
              onClick={onUndoPointInActiveSegment}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Hoàn tác
            </button>
            <button
              type="button"
              disabled={!activeSegment || activeSegment.points.length === 0}
              onClick={onClearActiveSegment}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Xóa điểm
            </button>
          </div>
        </div>

        {/* Search Place + Hint Row */}
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={placeQuery}
                  onChange={(e) => setPlaceQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleSearchPlace();
                    }
                  }}
                  placeholder="Tìm tên đường để di chuyển bản đồ tới nhanh..."
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 py-1.5 pl-8 pr-2.5 text-xs outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleSearchPlace()}
                disabled={isSearching || !placeQuery.trim()}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {isSearching && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                Tìm
              </button>
              <button
                type="button"
                onClick={handleCenterOnGps}
                title="Vị trí hiện tại"
                className="shrink-0 rounded-lg border border-slate-300 bg-white p-1.5 text-slate-700 hover:bg-slate-100"
              >
                <LocateFixed className="h-3.5 w-3.5" />
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-[1200] mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg divide-y divide-slate-100">
                {searchResults.map((res) => (
                  <button
                    key={res.place_id}
                    type="button"
                    onClick={() => handleSelectSearchResult(res)}
                    className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-blue-50"
                  >
                    {res.display_name}
                  </button>
                ))}
              </div>
            )}
            {searchError && (
              <p className="mt-1 text-[11px] font-semibold text-red-600">{searchError}</p>
            )}
            {selectedSearchResult && (
              <p className="mt-1 truncate text-[11px] text-amber-700">
                Đã định vị: {selectedSearchResult.display_name}
              </p>
            )}
          </div>

          <p className="text-[11px] font-semibold text-slate-600 shrink-0">
            Chạm lên bản đồ để chấm nối điểm vào{' '}
            <strong className="text-blue-700">{activeSegment?.name}</strong> · Tổng:{' '}
            <strong>{segments.length}</strong> tuyến ({totalPointsAllSegments} điểm)
          </p>
        </div>
      </div>

      {/* Map Container */}
      <div
        className={`relative w-full overflow-hidden rounded-xl border border-slate-300 bg-slate-200 ${
          isFullScreen ? 'flex-1 min-h-[300px]' : 'h-[360px] sm:h-[440px]'
        }`}
      >
        <div ref={mapContainerRef} className="h-full w-full" />
      </div>
    </div>
  );
};
