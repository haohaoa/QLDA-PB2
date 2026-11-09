import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { LocateFixed, Search } from 'lucide-react';
import { ProjectContractor, RouteCoordinatePoint } from '../types/undergrounding';

type EndpointMode = 'start' | 'end';

interface ProjectContractorRoutePickerProps {
  points: RouteCoordinatePoint[];
  contractors: ProjectContractor[];
  startPointId: string;
  endPointId: string;
  endpointMode: EndpointMode;
  lockedStartPointId?: string;
  onSelectPoint: (pointId: string) => void;
  onInsertPoint: (afterIndex: number, lat: number, lng: number) => void;
}

export const ProjectContractorRoutePicker: React.FC<ProjectContractorRoutePickerProps> = ({
  points,
  contractors,
  startPointId,
  endPointId,
  endpointMode,
  lockedStartPointId,
  onSelectPoint,
  onInsertPoint,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const focusedPointIdRef = useRef<string | null>(null);
  const pointsRef = useRef(points);
  const [pointQuery, setPointQuery] = useState('');
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
    ? points.filter((point) =>
        (point.name || '').toLocaleLowerCase('vi').includes(pointQuery.trim().toLocaleLowerCase('vi'))
      ).slice(0, 8)
    : [];

  const focusPoint = (point: RouteCoordinatePoint) => {
    focusedPointIdRef.current = point.id;
    mapRef.current?.flyTo([point.lat, point.lng], 17, { duration: 0.6 });
  };

  const focusAndSelectPoint = (point: RouteCoordinatePoint) => {
    focusPoint(point);
    onSelectPoint(point.id);
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
        attribution: 'Tiles &copy; Esri, TomTom, Garmin, FAO, NOAA, USGS, &copy; OpenStreetMap contributors',
        maxZoom: 19,
      }
    ).addTo(map);
    const layers = L.layerGroup().addTo(map);

    map.on('click', (event: L.LeafletMouseEvent) => {
      const routePoints = pointsRef.current;
      if (routePoints.length < 2) return;
      const { endpointMode: currentMode, lockedStartPointId: lockedStart, startPointId: selectedStart } =
        selectionRef.current;
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
      if (nearestVertexDistance <= 18 && nearestVertexIndex >= 0) {
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
          Math.min(1, ((clickPoint.x - from.x) * dx + (clickPoint.y - from.y) * dy) / lengthSquared)
        );
        const snappedPoint = L.point(from.x + ratio * dx, from.y + ratio * dy);
        const distance = snappedPoint.distanceTo(clickPoint);
        if (distance < nearestSegmentDistance) {
          nearestSegmentDistance = distance;
          nearestSegmentIndex = index;
          nearestSegmentPoint = snappedPoint;
        }
      }

      if (
        nearestSegmentIndex < 0 ||
        nearestSegmentDistance > 28 ||
        !nearestSegmentPoint
      ) return;

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
      const safeName = contractor.name.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] || character);
      const line = L.polyline(contractorCoordinates, {
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
        radius: isStart || isEnd ? 8 : 5,
        color: '#ffffff',
        weight: 2,
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

    const focusedPoint = validPoints.find((point) => point.id === focusedPointIdRef.current);
    if (focusedPoint) {
      map.setView([focusedPoint.lat, focusedPoint.lng], 17);
      focusedPointIdRef.current = null;
    } else if (coordinates.length > 1) {
      map.fitBounds(L.latLngBounds(coordinates), { padding: [24, 24], maxZoom: 16 });
    } else if (coordinates.length === 1) {
      map.setView(coordinates[0], 16);
    }
    map.invalidateSize();
  }, [points, contractors, startPointId, endPointId]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="space-y-2 border-b border-slate-200 bg-white p-2.5">
        <label className="relative block">
          <span className="sr-only">Tìm mốc tuyến theo tên</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={pointQuery}
            onChange={(event) => setPointQuery(event.target.value)}
            placeholder="Tìm điểm đầu, điểm cuối hoặc mốc trên tuyến..."
            className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-8 pr-2.5 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        {pointQuery.trim() && (
          <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200">
            {matchingPoints.length > 0 ? matchingPoints.map((point, index) => (
              <div
                key={point.id}
                className="flex items-center gap-2 border-b border-slate-100 px-2.5 py-2 last:border-b-0"
              >
                <span className="min-w-0 flex-1 text-[11px] text-slate-700">
                  {index + 1}. {point.name}
                </span>
                <button
                  type="button"
                  onClick={() => focusPoint(point)}
                  className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <LocateFixed className="h-3 w-3" />
                  Tới mốc
                </button>
                <button
                  type="button"
                  onClick={() => focusAndSelectPoint(point)}
                  className="min-h-7 shrink-0 rounded-md bg-blue-700 px-2 text-[10px] font-bold text-white hover:bg-blue-800"
                >
                  Chọn
                </button>
              </div>
            )) : (
              <p className="px-2.5 py-2 text-[11px] text-slate-500">Không tìm thấy mốc tuyến phù hợp.</p>
            )}
          </div>
        )}
      </div>
      <div className="h-52 w-full bg-slate-100 sm:h-60">
        <div ref={containerRef} className="h-full w-full" />
      </div>
      <p className="border-t border-slate-200 bg-white px-2.5 py-2 text-[10px] leading-relaxed text-slate-500">
        Chạm mốc hoặc tuyến tổng để chọn điểm đầu, sau đó chọn điểm cuối. Đoạn màu xanh bám theo các điểm và khúc cua của tuyến tổng.
      </p>
      <span className="sr-only" aria-live="polite">
        {startPointId && endPointId
          ? 'Đã chọn đủ hai điểm. Chạm lại để chọn một đoạn tuyến khác.'
          : `Đang chọn ${endpointMode === 'start' ? 'điểm đầu' : 'điểm cuối'} đoạn tuyến`}
      </span>
    </div>
  );
};
