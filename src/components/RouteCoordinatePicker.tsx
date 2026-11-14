import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  PlaceSearchResult,
  searchPlaces as searchPlaceLocations,
} from '../utils/appDataStorage';
import { RouteCoordinatePoint } from '../types/undergrounding';
import {
  Flag,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Milestone,
  Search,
  X,
} from 'lucide-react';

export type PlacementMode = 'start' | 'turn' | 'end';

interface RouteCoordinatePickerProps {
  startPoint: Pick<RouteCoordinatePoint, 'lat' | 'lng'> | null;
  endPoint: Pick<RouteCoordinatePoint, 'lat' | 'lng'> | null;
  startPointName?: string;
  endPointName?: string;
  onStartPointNameChange?: (name: string) => void;
  onEndPointNameChange?: (name: string) => void;
  turnPoints: Array<Pick<RouteCoordinatePoint, 'id' | 'name' | 'lat' | 'lng'>>;
  onPlacePoint: (mode: PlacementMode, lat: number, lng: number, placeName?: string) => void;
  onRemoveTurnPoint?: (id: string) => void;
  onUpdateTurnPointName?: (id: string, name: string) => void;
  onClearStartPoint?: () => void;
  onClearEndPoint?: () => void;
  isFullScreen?: boolean;
}

const DEFAULT_MAP_CENTER: [number, number] = [16.0544, 108.2022]; // Đà Nẵng
const DEFAULT_MAP_ZOOM = 14;

const modeLabels: Record<PlacementMode, string> = {
  start: 'Điểm đầu',
  turn: 'Điểm cua',
  end: 'Điểm cuối',
};

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
  startPoint,
  endPoint,
  startPointName = '',
  endPointName = '',
  turnPoints,
  onPlacePoint,
  onRemoveTurnPoint,
  onUpdateTurnPointName,
  onClearStartPoint,
  onClearEndPoint,
  isFullScreen = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const routeLayersRef = useRef<L.LayerGroup | null>(null);
  const searchLayersRef = useRef<L.LayerGroup | null>(null);
  const hasFittedInitialBoundsRef = useRef(false);

  const placementModeRef = useRef<PlacementMode>('start');
  const onPlacePointRef = useRef(onPlacePoint);
  const onRemoveTurnPointRef = useRef(onRemoveTurnPoint);
  const onClearStartPointRef = useRef(onClearStartPoint);
  const onClearEndPointRef = useRef(onClearEndPoint);

  const [placementMode, setPlacementMode] = useState<PlacementMode>('start');
  const [placeQuery, setPlaceQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [selectedSearchResult, setSelectedSearchResult] = useState<PlaceSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [editingTurnId, setEditingTurnId] = useState<string | null>(null);
  const searchRequestRef = useRef<AbortController | null>(null);
  const lastSearchAtRef = useRef(0);

  placementModeRef.current = placementMode;
  onPlacePointRef.current = onPlacePoint;
  onRemoveTurnPointRef.current = onRemoveTurnPoint;
  onClearStartPointRef.current = onClearStartPoint;
  onClearEndPointRef.current = onClearEndPoint;

  // Initialize Map ONCE - keep map position & zoom completely still when user clicks/places points
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialCenter: [number, number] =
      startPoint && Number.isFinite(startPoint.lat) && Number.isFinite(startPoint.lng)
        ? [startPoint.lat, startPoint.lng]
        : endPoint && Number.isFinite(endPoint.lat) && Number.isFinite(endPoint.lng)
        ? [endPoint.lat, endPoint.lng]
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
      const currentMode = placementModeRef.current;
      onPlacePointRef.current(
        currentMode,
        Number(event.latlng.lat.toFixed(6)),
        Number(event.latlng.lng.toFixed(6))
      );
      if (currentMode === 'start') {
        setPlacementMode('turn');
      }
    });

    mapInstanceRef.current = map;
    routeLayersRef.current = layers;
    searchLayersRef.current = searchLayers;

    // Fit bounds only ONCE on initial open if editing an existing route
    const existingCoords: [number, number][] = [
      ...(startPoint ? [[startPoint.lat, startPoint.lng] as [number, number]] : []),
      ...turnPoints.map((tp) => [tp.lat, tp.lng] as [number, number]),
      ...(endPoint ? [[endPoint.lat, endPoint.lng] as [number, number]] : []),
    ].filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

    if (!hasFittedInitialBoundsRef.current && existingCoords.length > 0) {
      hasFittedInitialBoundsRef.current = true;
      if (existingCoords.length > 1) {
        map.fitBounds(L.latLngBounds(existingCoords), { padding: [36, 36], maxZoom: 17 });
      } else {
        map.setView(existingCoords[0], 16);
      }
    }

    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize({ pan: false });
    }, 120);

    return () => {
      window.clearTimeout(resizeTimer);
      searchRequestRef.current?.abort();
      map.remove();
      mapInstanceRef.current = null;
      routeLayersRef.current = null;
      searchLayersRef.current = null;
    };
  }, []);

  const fitAllRoutePoints = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const coords: [number, number][] = [
      ...(startPoint ? [[startPoint.lat, startPoint.lng] as [number, number]] : []),
      ...turnPoints.map((tp) => [tp.lat, tp.lng] as [number, number]),
      ...(endPoint ? [[endPoint.lat, endPoint.lng] as [number, number]] : []),
    ].filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

    if (coords.length > 1) {
      map.fitBounds(L.latLngBounds(coords), { padding: [36, 36], maxZoom: 17 });
    } else if (coords.length === 1) {
      map.flyTo(coords[0], 17, { duration: 0.5 });
    }
  };

  const searchPlaces = async () => {
    const query = placeQuery.trim();
    if (!query) {
      setSearchError('Nhập tên đường, địa chỉ hoặc địa điểm cần tìm.');
      setSearchResults([]);
      setSelectedSearchResult(null);
      return;
    }
    const now = Date.now();
    if (now - lastSearchAtRef.current < 1000) {
      setSearchError('Vui lòng đợi một giây trước khi tìm địa điểm tiếp theo.');
      return;
    }

    searchRequestRef.current?.abort();
    lastSearchAtRef.current = now;
    const controller = new AbortController();
    searchRequestRef.current = controller;
    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);
    setSelectedSearchResult(null);
    try {
      const results = await searchPlaceLocations(query, controller.signal);
      const validResults = results.filter((result) => {
        const lat = Number(result.lat);
        const lng = Number(result.lon);
        return (
          typeof result.display_name === 'string' &&
          Number.isFinite(lat) &&
          Number.isFinite(lng) &&
          lat >= -90 &&
          lat <= 90 &&
          lng >= -180 &&
          lng <= 180
        );
      });
      setSearchResults(validResults);
      if (validResults.length === 0) setSearchError('Không tìm thấy địa điểm phù hợp.');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setSearchError(
        error instanceof Error ? error.message : 'Không thể tìm địa điểm lúc này.'
      );
    } finally {
      if (searchRequestRef.current === controller) {
        searchRequestRef.current = null;
        setIsSearching(false);
      }
    }
  };

  const focusSearchResult = (result: PlaceSearchResult) => {
    const lat = Number(result.lat);
    const lng = Number(result.lon);
    const map = mapInstanceRef.current;
    const searchLayers = searchLayersRef.current;
    if (!map || !searchLayers) return;
    setSelectedSearchResult(result);
    searchLayers.clearLayers();
    L.circleMarker([lat, lng], {
      radius: 10,
      color: '#ffffff',
      weight: 3,
      fillColor: '#7c3aed',
      fillOpacity: 1,
    })
      .bindTooltip(result.display_name, { direction: 'top' })
      .addTo(searchLayers);
    map.flyTo([lat, lng], 17, { duration: 0.7 });
  };

  const useSearchResult = () => {
    if (!selectedSearchResult) return;
    const currentMode = placementModeRef.current;
    onPlacePointRef.current(
      currentMode,
      Number(Number(selectedSearchResult.lat).toFixed(6)),
      Number(Number(selectedSearchResult.lon).toFixed(6)),
      selectedSearchResult.display_name
    );
    if (currentMode === 'start') {
      setPlacementMode('turn');
    }
    searchLayersRef.current?.clearLayers();
    setSelectedSearchResult(null);
    setSearchResults([]);
  };

  // Render route polyline & interactive markers WITHOUT resetting map zoom or position!
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layers = routeLayersRef.current;
    if (!map || !layers) return;

    layers.clearLayers();

    const orderedPoints: Array<{
      id: string;
      label: string;
      shortBadge: string;
      type: PlacementMode;
      lat: number;
      lng: number;
    }> = [];

    if (startPoint && Number.isFinite(startPoint.lat) && Number.isFinite(startPoint.lng)) {
      orderedPoints.push({
        id: 'start',
        label: startPointName.trim() || 'Điểm đầu',
        shortBadge: 'Đ',
        type: 'start',
        lat: startPoint.lat,
        lng: startPoint.lng,
      });
    }

    turnPoints.forEach((point, index) => {
      if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
        orderedPoints.push({
          id: point.id,
          label: point.name || `Điểm cua ${index + 1}`,
          shortBadge: `${index + 1}`,
          type: 'turn',
          lat: point.lat,
          lng: point.lng,
        });
      }
    });

    if (endPoint && Number.isFinite(endPoint.lat) && Number.isFinite(endPoint.lng)) {
      orderedPoints.push({
        id: 'end',
        label: endPointName.trim() || 'Điểm cuối',
        shortBadge: 'C',
        type: 'end',
        lat: endPoint.lat,
        lng: endPoint.lng,
      });
    }

    const coordinates = orderedPoints.map((point) => [point.lat, point.lng] as [number, number]);

    if (coordinates.length > 1) {
      L.polyline(coordinates, {
        color: '#087e8b',
        weight: 5,
        opacity: 0.92,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(layers);
    }

    orderedPoints.forEach((point) => {
      const bgColor =
        point.type === 'start'
          ? '#0f766e'
          : point.type === 'end'
          ? '#dc2626'
          : '#d97706';

      const canDelete =
        (point.type === 'turn' && !!onRemoveTurnPointRef.current) ||
        (point.type === 'start' && !!onClearStartPointRef.current) ||
        (point.type === 'end' && !!onClearEndPointRef.current);

      const safeLabel = escapeHtml(point.label);

      const html = `
        <div data-marker-interactive="true" class="group relative flex items-center justify-center" style="width:32px;height:32px;">
          <div
            class="flex items-center justify-center rounded-full text-white font-bold shadow-md transition-transform group-hover:scale-110"
            style="width:24px;height:24px;background:${bgColor};border:2.5px solid #ffffff;font-size:11px;line-height:1;"
            title="${safeLabel} (${point.lat.toFixed(6)}, ${point.lng.toFixed(6)})"
          >
            ${escapeHtml(point.shortBadge)}
          </div>
          ${
            canDelete
              ? `<button
                  type="button"
                  data-delete-point-type="${point.type}"
                  data-delete-point-id="${escapeHtml(point.id)}"
                  title="Xóa ${safeLabel}"
                  class="opacity-90 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity duration-150 absolute -top-2 -right-2 flex items-center justify-center rounded-full bg-red-600 text-white shadow-md hover:bg-red-700"
                  style="width:17px;height:17px;font-size:11px;line-height:1;border:1.5px solid #ffffff;cursor:pointer;z-index:20;"
                >✕</button>`
              : ''
          }
          <div class="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900/90 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm" style="z-index:15;">
            ${safeLabel}
          </div>
        </div>
      `;

      const marker = L.marker([point.lat, point.lng], {
        icon: L.divIcon({
          className: 'custom-route-point-marker',
          html,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        }),
      });

      marker.on('add', () => {
        const el = marker.getElement();
        if (!el) return;
        const deleteBtn = el.querySelector<HTMLButtonElement>('[data-delete-point-id]');
        if (deleteBtn) {
          L.DomEvent.disableClickPropagation(deleteBtn);
          deleteBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const ptType = deleteBtn.getAttribute('data-delete-point-type');
            const ptId = deleteBtn.getAttribute('data-delete-point-id');
            if (ptType === 'turn' && ptId && onRemoveTurnPointRef.current) {
              onRemoveTurnPointRef.current(ptId);
            } else if (ptType === 'start' && onClearStartPointRef.current) {
              onClearStartPointRef.current();
            } else if (ptType === 'end' && onClearEndPointRef.current) {
              onClearEndPointRef.current();
            }
          });
        }
      });

      marker.addTo(layers);
    });

    map.invalidateSize({ pan: false });
  }, [startPoint, endPoint, startPointName, endPointName, turnPoints]);

  const modes: Array<{
    value: PlacementMode;
    icon: typeof Flag;
    badge: string;
    activeClass: string;
  }> = [
    {
      value: 'start',
      icon: Flag,
      badge: startPoint ? '✓' : '—',
      activeClass: 'border-teal-700 bg-teal-700 text-white shadow-2xs',
    },
    {
      value: 'turn',
      icon: Milestone,
      badge: `${turnPoints.length}`,
      activeClass: 'border-amber-600 bg-amber-600 text-white shadow-2xs',
    },
    {
      value: 'end',
      icon: MapPin,
      badge: endPoint ? '✓' : '—',
      activeClass: 'border-red-600 bg-red-600 text-white shadow-2xs',
    },
  ];

  const totalPointsCount =
    (startPoint ? 1 : 0) + turnPoints.length + (endPoint ? 1 : 0);

  return (
    <div
      className={`flex flex-col overflow-hidden bg-white ${
        isFullScreen
          ? 'h-full flex-1 min-h-0 sm:rounded-xl sm:border sm:border-slate-300'
          : 'rounded-xl border border-slate-300'
      }`}
    >
      {/* Ultra-compact Control & Search Header */}
      <div className="flex flex-col gap-1.5 border-b border-slate-200 bg-slate-50/95 px-2 py-1.5 sm:px-3 sm:py-2">
        <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between">
          {/* 3 Mode Buttons in 1 single compact row */}
          <div
            className="grid grid-cols-3 gap-1 sm:flex sm:items-center sm:gap-1.5"
            role="group"
            aria-label="Chọn loại mốc cần đặt"
          >
            {modes.map(({ value, icon: Icon, badge, activeClass }) => (
              <button
                key={value}
                type="button"
                onClick={() => setPlacementMode(value)}
                aria-pressed={placementMode === value}
                className={`inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] sm:text-xs font-bold transition-all ${
                  placementMode === value
                    ? activeClass
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                <span className="truncate">{modeLabels[value]}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[9px] sm:text-[10px] font-bold ${
                    placementMode === value
                      ? 'bg-white/25 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {badge}
                </span>
              </button>
            ))}
          </div>

          {/* Compact Search Bar */}
          <div className="relative flex min-w-0 flex-1 items-center gap-1 md:max-w-sm">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Tìm vị trí đường hoặc địa điểm</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={placeQuery}
                onChange={(event) => {
                  setPlaceQuery(event.target.value);
                  setSearchError(null);
                  setSelectedSearchResult(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void searchPlaces();
                  }
                }}
                placeholder="Tìm tên đường, địa chỉ..."
                className="w-full rounded-lg border border-slate-300 bg-white py-1 pl-7 pr-2 text-xs text-slate-800 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-200 sm:py-1.5"
              />
            </label>
            <button
              type="button"
              onClick={() => void searchPlaces()}
              disabled={isSearching}
              className="inline-flex h-7 sm:h-8 shrink-0 items-center justify-center gap-1 rounded-lg bg-teal-700 px-2.5 text-[11px] sm:text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {isSearching ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              )}
              <span>Tìm</span>
            </button>
            {totalPointsCount > 0 && (
              <button
                type="button"
                onClick={fitAllRoutePoints}
                title="Thu phóng vừa toàn tuyến"
                className="inline-flex h-7 sm:h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
              >
                <LocateFixed className="h-3.5 w-3.5 text-teal-700" />
                <span className="hidden sm:inline">Toàn tuyến</span>
              </button>
            )}
          </div>
        </div>

        {/* Search Results Dropdown / Selected Result Confirmation */}
        {(searchError || searchResults.length > 0 || selectedSearchResult) && (
          <div className="space-y-1">
            {searchError && (
              <p role="alert" className="text-[11px] font-semibold text-red-700">
                {searchError}
              </p>
            )}
            {searchResults.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                {searchResults.map((result) => (
                  <button
                    key={result.place_id}
                    type="button"
                    onClick={() => focusSearchResult(result)}
                    className={`flex w-full items-start gap-1.5 border-b border-slate-100 px-2.5 py-1.5 text-left text-[11px] last:border-b-0 hover:bg-teal-50 ${
                      selectedSearchResult?.place_id === result.place_id
                        ? 'bg-teal-50 font-semibold text-teal-900'
                        : 'text-slate-700'
                    }`}
                  >
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-teal-700" />
                    <span className="min-w-0 flex-1 line-clamp-1">{result.display_name}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedSearchResult && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1">
                <p className="min-w-0 truncate text-[11px] text-violet-900">
                  <strong>{selectedSearchResult.display_name}</strong>
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={useSearchResult}
                    className="rounded-md bg-violet-700 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-violet-800"
                  >
                    Đặt {modeLabels[placementMode].toLocaleLowerCase('vi')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      searchLayersRef.current?.clearLayers();
                      setSelectedSearchResult(null);
                      setSearchResults([]);
                    }}
                    className="rounded p-0.5 text-slate-500 hover:bg-violet-100"
                    title="Đóng"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Single-line Horizontal Turn Point Chips (only when turn points exist) */}
        {turnPoints.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-0.5">
            {turnPoints.map((point, index) => (
              <div
                key={point.id}
                className="group inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-950"
              >
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-amber-600 font-mono text-[9px] font-bold text-white">
                  {index + 1}
                </span>
                {editingTurnId === point.id && onUpdateTurnPointName ? (
                  <input
                    type="text"
                    autoFocus
                    value={point.name}
                    onChange={(e) => onUpdateTurnPointName(point.id, e.target.value)}
                    onBlur={() => setEditingTurnId(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setEditingTurnId(null);
                      }
                    }}
                    className="w-24 rounded bg-white px-1 py-0.2 text-[10px] outline-none ring-1 ring-amber-500"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTurnId(point.id);
                      mapInstanceRef.current?.panTo([point.lat, point.lng]);
                    }}
                    className="max-w-[96px] truncate text-left"
                  >
                    {point.name || `Cua ${index + 1}`}
                  </button>
                )}
                {onRemoveTurnPoint && (
                  <button
                    type="button"
                    onClick={() => onRemoveTurnPoint(point.id)}
                    title={`Xóa ${point.name || `Điểm cua ${index + 1}`}`}
                    aria-label={`Xóa ${point.name || `Điểm cua ${index + 1}`}`}
                    className="opacity-90 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 -mr-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-600 text-white transition-opacity hover:bg-red-700"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Full-Height Interactive Map Canvas */}
      <div
        className={`relative w-full bg-slate-100 ${
          isFullScreen ? 'flex-1 min-h-[320px]' : 'h-[460px] sm:h-[540px]'
        }`}
      >
        <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />
      </div>
    </div>
  );
};
