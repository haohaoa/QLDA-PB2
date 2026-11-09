import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  PlaceSearchResult,
  searchPlaces as searchPlaceLocations,
} from '../utils/appDataStorage';
import { RouteCoordinatePoint } from '../types/undergrounding';
import { Flag, LoaderCircle, MapPin, Milestone, Search } from 'lucide-react';

type PlacementMode = 'start' | 'turn' | 'end';

interface RouteCoordinatePickerProps {
  startPoint: Pick<RouteCoordinatePoint, 'lat' | 'lng'>;
  endPoint: Pick<RouteCoordinatePoint, 'lat' | 'lng'>;
  turnPoints: Array<Pick<RouteCoordinatePoint, 'id' | 'name' | 'lat' | 'lng'>>;
  onPlacePoint: (mode: PlacementMode, lat: number, lng: number, placeName?: string) => void;
}

const modeLabels: Record<PlacementMode, string> = {
  start: 'Điểm đầu',
  turn: 'Điểm cua',
  end: 'Điểm cuối',
};

export const RouteCoordinatePicker: React.FC<RouteCoordinatePickerProps> = ({
  startPoint,
  endPoint,
  turnPoints,
  onPlacePoint,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const routeLayersRef = useRef<L.LayerGroup | null>(null);
  const searchLayersRef = useRef<L.LayerGroup | null>(null);
  const placementModeRef = useRef<PlacementMode>('start');
  const onPlacePointRef = useRef(onPlacePoint);
  const [placementMode, setPlacementMode] = useState<PlacementMode>('start');
  const [placeQuery, setPlaceQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [selectedSearchResult, setSelectedSearchResult] = useState<PlaceSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchRequestRef = useRef<AbortController | null>(null);
  const lastSearchAtRef = useRef(0);

  placementModeRef.current = placementMode;
  onPlacePointRef.current = onPlacePoint;

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current, { zoomControl: false }).setView(
      [startPoint.lat, startPoint.lng],
      14
    );
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      {
        attribution:
          'Tiles &copy; Esri, TomTom, Garmin, FAO, NOAA, USGS, &copy; OpenStreetMap contributors, and the GIS User Community',
        maxZoom: 19,
      }
    ).addTo(map);

    const layers = L.layerGroup().addTo(map);
    const searchLayers = L.layerGroup().addTo(map);
    map.on('click', (event: L.LeafletMouseEvent) => {
      onPlacePointRef.current(
        placementModeRef.current,
        Number(event.latlng.lat.toFixed(6)),
        Number(event.latlng.lng.toFixed(6))
      );
    });

    mapInstanceRef.current = map;
    routeLayersRef.current = layers;
    searchLayersRef.current = searchLayers;

    return () => {
      searchRequestRef.current?.abort();
      map.remove();
      mapInstanceRef.current = null;
      routeLayersRef.current = null;
      searchLayersRef.current = null;
    };
  }, []);

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
    map.flyTo([lat, lng], 17, { duration: 0.8 });
  };

  const useSearchResult = () => {
    if (!selectedSearchResult) return;
    onPlacePointRef.current(
      placementModeRef.current,
      Number(Number(selectedSearchResult.lat).toFixed(6)),
      Number(Number(selectedSearchResult.lon).toFixed(6)),
      selectedSearchResult.display_name
    );
    searchLayersRef.current?.clearLayers();
    setSelectedSearchResult(null);
    setSearchResults([]);
  };

  useEffect(() => {
    const map = mapInstanceRef.current;
    const layers = routeLayersRef.current;
    if (!map || !layers) return;

    layers.clearLayers();
    const points = [
      { id: 'start', label: 'Điểm đầu', type: 'start' as const, ...startPoint },
      ...turnPoints.map((point, index) => ({
        ...point,
        label: point.name || `Điểm cua ${index + 1}`,
        type: 'turn' as const,
      })),
      { id: 'end', label: 'Điểm cuối', type: 'end' as const, ...endPoint },
    ].filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
    const coordinates = points.map((point) => [point.lat, point.lng] as [number, number]);

    if (coordinates.length > 1) {
      L.polyline(coordinates, {
        color: '#087e8b',
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(layers);
    }

    points.forEach((point, index) => {
      const color = point.type === 'start' ? '#176b55' : point.type === 'end' ? '#c44536' : '#e09f3e';
      const marker = L.circleMarker([point.lat, point.lng], {
        radius: point.type === 'turn' ? 7 : 9,
        color: '#ffffff',
        weight: 3,
        fillColor: color,
        fillOpacity: 1,
      });
      marker.bindTooltip(`${index + 1}. ${point.label}<br/>${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`);
      marker.addTo(layers);
    });

    if (coordinates.length > 1) {
      map.fitBounds(L.latLngBounds(coordinates), { padding: [32, 32], maxZoom: 16 });
    } else if (coordinates.length === 1) {
      map.setView(coordinates[0], 16);
    }
    map.invalidateSize();
  }, [startPoint.lat, startPoint.lng, endPoint.lat, endPoint.lng, turnPoints]);

  const modes: Array<{ value: PlacementMode; icon: typeof Flag }> = [
    { value: 'start', icon: Flag },
    { value: 'turn', icon: Milestone },
    { value: 'end', icon: MapPin },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-300 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-2.5">
        <div className="flex items-center gap-1.5" role="group" aria-label="Chọn loại mốc cần đặt">
          {modes.map(({ value, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setPlacementMode(value)}
              aria-pressed={placementMode === value}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                placementMode === value
                  ? 'border-teal-700 bg-teal-700 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {modeLabels[value]}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-slate-500">Chọn loại mốc, sau đó nhấp vị trí trên bản đồ</span>
      </div>
      <div className="space-y-2 border-b border-slate-200 bg-slate-50 p-2.5">
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Tìm vị trí điểm đầu, điểm cua hoặc điểm cuối</span>
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
              placeholder="Tìm tên đường, địa chỉ hoặc địa điểm..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-2.5 text-xs text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <button
            type="button"
            onClick={() => void searchPlaces()}
            disabled={isSearching}
            className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-3 text-[11px] font-bold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {isSearching ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Tìm
          </button>
        </div>
        <p className="text-[10px] leading-relaxed text-slate-500">
          Tìm địa điểm tại Việt Nam qua OpenStreetMap. Chọn kết quả để đưa bản đồ đến vị trí, sau đó xác nhận mốc cần đặt.
        </p>
        {searchError && <p role="alert" className="text-[11px] font-semibold text-red-700">{searchError}</p>}
        {searchResults.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white">
            {searchResults.map((result) => (
              <button
                key={result.place_id}
                type="button"
                onClick={() => focusSearchResult(result)}
                className={`flex w-full items-start gap-2 border-b border-slate-100 px-2.5 py-2 text-left text-[11px] last:border-b-0 hover:bg-teal-50 ${
                  selectedSearchResult?.place_id === result.place_id ? 'bg-teal-50 text-teal-900' : 'text-slate-700'
                }`}
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-700" />
                <span className="min-w-0 flex-1">{result.display_name}</span>
              </button>
            ))}
          </div>
        )}
        {selectedSearchResult && (
          <div className="flex flex-col gap-2 rounded-lg border border-violet-200 bg-violet-50 p-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 text-[10px] text-violet-900">
              Đã chọn vị trí ({Number(selectedSearchResult.lat).toFixed(6)}, {Number(selectedSearchResult.lon).toFixed(6)}).
            </p>
            <button
              type="button"
              onClick={useSearchResult}
              className="min-h-8 shrink-0 rounded-lg bg-violet-700 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-violet-800"
            >
              Dùng làm {modeLabels[placementMode].toLocaleLowerCase('vi')}
            </button>
          </div>
        )}
      </div>
      <div className="relative h-[320px] w-full bg-slate-100 sm:h-[380px]">
        <div ref={mapContainerRef} className="absolute inset-0 w-full" />
      </div>
    </div>
  );
};