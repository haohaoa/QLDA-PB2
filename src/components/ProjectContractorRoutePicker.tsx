import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { LocateFixed, Maximize2, Minimize2, Search } from 'lucide-react';
import { ProjectContractor, RouteCoordinatePoint } from '../types/undergrounding';

type EndpointMode = 'start' | 'end';

interface ProjectContractorRoutePickerProps {
  points: RouteCoordinatePoint[];
  contractors: ProjectContractor[];
  startPointId: string;
  endPointId: string;
  endpointMode: EndpointMode;
  onEndpointModeChange?: (mode: EndpointMode) => void;
  lockedStartPointId?: string;
  onSelectPoint: (pointId: string) => void;
  onInsertPoint: (afterIndex: number, lat: number, lng: number) => void;
  isFullHeight?: boolean;
}

export const ProjectContractorRoutePicker: React.FC<ProjectContractorRoutePickerProps> = ({
  points,
  contractors,
  startPointId,
  endPointId,
  endpointMode,
  onEndpointModeChange,
  lockedStartPointId,
  onSelectPoint,
  onInsertPoint,
  isFullHeight = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const focusedPointIdRef = useRef<string | null>(null);
  const hasFittedBoundsRef = useRef(false);
  const pointsRef = useRef(points);
  const [pointQuery, setPointQuery] = useState('');
  const [isMaximized, setIsMaximized] = useState(false);

  const selectionRef = useRef({
    onSelectPoint,
    onInsertPoint,
    endpointMode,
    lockedStartPointId,
    startPointId,
  });
  pointsRef.current = points;
  selectionRef.current = {
    onSelectPoint,
    onInsertPoint,
    endpointMode,
    lockedStartPointId,
    startPointId,
  };

  const matchingPoints = pointQuery.trim()
    ? points
        .filter((point) =>
          (point.name || '')
            .toLocaleLowerCase('vi')
            .includes(pointQuery.trim().toLocaleLowerCase('vi'))
        )
        .slice(0, 6)
    : [];

  const focusPoint = (point: RouteCoordinatePoint) => {
    focusedPointIdRef.current = point.id;
    mapRef.current?.flyTo([point.lat, point.lng], 17, { duration: 0.5 });
  };

  const focusAndSelectPoint = (point: RouteCoordinatePoint) => {
    focusPoint(point);
    onSelectPoint(point.id);
    setPointQuery('');
  };

  const fitFullRoute = () => {
    const map = mapRef.current;
    if (!map) return;
    const validCoords = points
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
      .map((point) => [point.lat, point.lng] as [number, number]);
    if (validCoords.length > 1) {
      map.fitBounds(L.latLngBounds(validCoords), { padding: [28, 28], maxZoom: 17 });
    } else if (validCoords.length === 1) {
      map.setView(validCoords[0], 16);
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;
    const firstPoint = points[0];
    const map = L.map(containerRef.current, {
      zoomControl: false,
      scrollWheelZoom: true,
      doubleClickZoom: false,
    }).setView(firstPoint ? [firstPoint.lat, firstPoint.lng] : [16.0528, 108.2384], 15);
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

    map.on('click', (event: L.LeafletMouseEvent) => {
      const routePoints = pointsRef.current;
      if (routePoints.length < 2) return;
      const {
        endpointMode: currentMode,
        lockedStartPointId: lockedStart,
        startPointId: selectedStart,
      } = selectionRef.current;
      if (currentMode === 'start' && lockedStart) return;
      if (currentMode === 'end' && !selectedStart) return;

      const clickPoint = map.latLngToLayerPoint(event.latlng);
      const selectedStartIndex = routePoints.findIndex((point) => point.id === selectedStart);
      const projected = routePoints.map((point) =>
        Number.isFinite(point.lat) && Number.isFinite(point.lng)
          ? map.latLngToLayerPoint([point.lat, point.lng])
          : null
      );
      let nearestVertexIndex = -1;
      let nearestVertexDistance = Number.POSITIVE_INFINITY;
      projected.forEach((point, index) => {
        if (!point) return;
        if (currentMode === 'end' && index <= selectedStartIndex) return;
        const distance = point.distanceTo(clickPoint);
        if (distance < nearestVertexDistance) {
          nearestVertexDistance = distance;
          nearestVertexIndex = index;
        }
      });
      if (nearestVertexDistance <= 20 && nearestVertexIndex >= 0) {
        selectionRef.current.onSelectPoint(routePoints[nearestVertexIndex].id);
        return;
      }

      const minimumSegmentIndex = currentMode === 'end' ? selectedStartIndex : 0;
      let nearestSegmentIndex = -1;
      let nearestSegmentPoint: L.Point | null = null;
      let nearestSegmentDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < routePoints.length - 1; index += 1) {
        if (index < minimumSegmentIndex) continue;
        const from = projected[index];
        const to = projected[index + 1];
        if (!from || !to) continue;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const lengthSquared = dx * dx + dy * dy;
        if (lengthSquared === 0) continue;
        const ratio = Math.max(
          0,
          Math.min(
            1,
            ((clickPoint.x - from.x) * dx + (clickPoint.y - from.y) * dy) / lengthSquared
          )
        );
        const snappedPoint = L.point(from.x + ratio * dx, from.y + ratio * dy);
        const distance = snappedPoint.distanceTo(clickPoint);
        if (distance < nearestSegmentDistance) {
          nearestSegmentDistance = distance;
          nearestSegmentIndex = index;
          nearestSegmentPoint = snappedPoint;
        }
      }

      if (nearestSegmentIndex < 0 || nearestSegmentDistance > 30 || !nearestSegmentPoint)
        return;

      const snappedLatLng = map.layerPointToLatLng(nearestSegmentPoint);
      selectionRef.current.onInsertPoint(
        nearestSegmentIndex,
        Number(snappedLatLng.lat.toFixed(6)),
        Number(snappedLatLng.lng.toFixed(6))
      );
    });

    mapRef.current = map;
    layerRef.current = layers;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      mapRef.current?.invalidateSize({ pan: false });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [isMaximized]);

  useEffect(() => {
    const map = mapRef.current;
    const layers = layerRef.current;
    if (!map || !layers) return;
    layers.clearLayers();
    const validPoints = points.filter(
      (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)
    );
    const coordinates = validPoints.map(
      (point) => [point.lat, point.lng] as [number, number]
    );
    const startIndex = validPoints.findIndex((point) => point.id === startPointId);
    const endIndex = validPoints.findIndex((point) => point.id === endPointId);

    if (coordinates.length > 1) {
      L.polyline(coordinates, {
        color: '#475569',
        weight: 5,
        opacity: 0.55,
        dashArray: '8 9',
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(layers);
    }

    contractors.forEach((contractor) => {
      const contractorStartIndex = validPoints.findIndex(
        (point) => point.id === contractor.startPointId
      );
      const contractorEndIndex = validPoints.findIndex(
        (point) => point.id === contractor.endPointId
      );
      if (contractorStartIndex < 0 || contractorEndIndex <= contractorStartIndex) return;
      const contractorCoordinates = validPoints
        .slice(contractorStartIndex, contractorEndIndex + 1)
        .map((point) => [point.lat, point.lng] as [number, number]);
      const safeName = contractor.name.replace(
        /[&<>"']/g,
        (character) =>
          ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
          })[character] || character
      );
      L.polyline(contractorCoordinates, {
        color: contractor.color,
        weight: 7,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      })
        .bindTooltip(safeName, {
          permanent: true,
          direction: 'top',
          className: 'contractor-route-label',
          opacity: 0.95,
        })
        .addTo(layers);
    });

    if (startIndex >= 0 && endIndex > startIndex) {
      const selectedCoordinates = validPoints
        .slice(startIndex, endIndex + 1)
        .map((point) => [point.lat, point.lng] as [number, number]);
      L.polyline(selectedCoordinates, {
        color: '#2563eb',
        weight: 8,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
      }).addTo(layers);
    }

    validPoints.forEach((point, index) => {
      const isStart = point.id === startPointId;
      const isEnd = point.id === endPointId;
      const marker = L.circleMarker([point.lat, point.lng], {
        radius: isStart || isEnd ? 9 : 6,
        color: '#ffffff',
        weight: 2.5,
        fillColor: isStart ? '#16a34a' : isEnd ? '#e11d48' : '#475569',
        fillOpacity: 1,
      });
      marker.bindTooltip(`${index + 1}. ${point.name}`);
      marker.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        selectionRef.current.onSelectPoint(point.id);
      });
      marker.addTo(layers);
    });

    const focusedPoint = validPoints.find(
      (point) => point.id === focusedPointIdRef.current
    );
    if (focusedPoint) {
      map.setView([focusedPoint.lat, focusedPoint.lng], 17);
      focusedPointIdRef.current = null;
    } else if (!hasFittedBoundsRef.current) {
      hasFittedBoundsRef.current = true;
      if (coordinates.length > 1) {
        map.fitBounds(L.latLngBounds(coordinates), { padding: [28, 28], maxZoom: 16 });
      } else if (coordinates.length === 1) {
        map.setView(coordinates[0], 16);
      }
    }
    map.invalidateSize({ pan: false });
  }, [points, contractors, startPointId, endPointId]);

  return (
    <div
      className={`flex flex-col overflow-hidden bg-white ${
        isMaximized
          ? 'fixed inset-0 z-[120] h-dvh w-screen'
          : isFullHeight
          ? 'h-full flex-1 min-h-0 rounded-xl border border-slate-200'
          : 'rounded-xl border border-slate-200'
      }`}
    >
      {/* Compact Single-Header Toolbar */}
      <div className="flex flex-col gap-1.5 border-b border-slate-200 bg-slate-50 px-2.5 py-1.5">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          {onEndpointModeChange && (
            <div className="flex items-center gap-1" role="group" aria-label="Chọn loại mốc tuyến">
              {(
                [
                  ['start', '1. Điểm đầu', !!startPointId],
                  ['end', '2. Điểm cuối', !!endPointId],
                ] as const
              ).map(([mode, label, hasValue]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onEndpointModeChange(mode)}
                  aria-pressed={endpointMode === mode}
                  disabled={
                    (mode === 'start' && !!lockedStartPointId) ||
                    (mode === 'end' && !startPointId)
                  }
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    endpointMode === mode
                      ? mode === 'start'
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-rose-600 bg-rose-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>{label}</span>
                  <span
                    className={`rounded-full px-1 text-[9px] ${
                      endpointMode === mode ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {hasValue ? '✓' : '—'}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex min-w-0 flex-1 items-center gap-1 sm:max-w-xs">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Tìm mốc tuyến theo tên</span>
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={pointQuery}
                onChange={(event) => setPointQuery(event.target.value)}
                placeholder="Tìm mốc trên tuyến..."
                className="w-full rounded-lg border border-slate-300 bg-white py-1 pl-7 pr-2 text-xs text-slate-800 outline-none focus:border-blue-500"
              />
            </label>
            <button
              type="button"
              onClick={fitFullRoute}
              title="Thu phóng vừa toàn tuyến"
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
            >
              <LocateFixed className="h-3.5 w-3.5 text-blue-600" />
              <span className="hidden sm:inline">Toàn tuyến</span>
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized((prev) => !prev)}
              title={isMaximized ? 'Thu nhỏ bản đồ' : 'Mở rộng bản đồ toàn màn hình'}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 text-[10px] font-bold text-blue-700 hover:bg-blue-100"
            >
              {isMaximized ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" />
                  <span>Thu gọn</span>
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Phóng to</span>
                </>
              )}
            </button>
          </div>
        </div>

        {pointQuery.trim() && (
          <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-200 bg-white">
            {matchingPoints.length > 0 ? (
              matchingPoints.map((point, index) => (
                <div
                  key={point.id}
                  className="flex items-center gap-2 border-b border-slate-100 px-2.5 py-1.5 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-[11px] text-slate-700">
                    {index + 1}. {point.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => focusPoint(point)}
                    className="inline-flex h-6 shrink-0 items-center gap-1 rounded border border-slate-200 px-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <LocateFixed className="h-3 w-3" />
                    Tới mốc
                  </button>
                  <button
                    type="button"
                    onClick={() => focusAndSelectPoint(point)}
                    className="h-6 shrink-0 rounded bg-blue-700 px-2 text-[10px] font-bold text-white hover:bg-blue-800"
                  >
                    Chọn
                  </button>
                </div>
              ))
            ) : (
              <p className="px-2.5 py-1.5 text-[11px] text-slate-500">
                Không tìm thấy mốc tuyến phù hợp.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Large Map Canvas */}
      <div
        className={`relative w-full bg-slate-100 ${
          isMaximized || isFullHeight
            ? 'flex-1 min-h-[340px]'
            : 'h-[360px] sm:h-[460px]'
        }`}
      >
        <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      </div>

      <span className="sr-only" aria-live="polite">
        {startPointId && endPointId
          ? 'Đã chọn đủ hai điểm.'
          : `Đang chọn ${endpointMode === 'start' ? 'điểm đầu' : 'điểm cuối'} đoạn tuyến`}
      </span>
    </div>
  );
};
