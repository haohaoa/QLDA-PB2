import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Layers,
  MapPin,
  Maximize2,
  Search,
  X,
} from 'lucide-react';
import { PlanType, UndergroundProject } from '../types/undergrounding';
import { formatNumber } from '../utils/numberFormat';

interface GisMapProps {
  projects: UndergroundProject[];
  planTypes: PlanType[];
  selectedProjectId?: string;
  onSelectProject?: (projectId: string) => void;
}

const BASE_ROUTE_COLOR = '#2563eb';
const HOVER_ROUTE_COLOR = '#f59700';
const HIGHLIGHT_ROUTE_COLOR = '#059669';

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch] || ch);

export const GisMap: React.FC<GisMapProps> = ({
  projects,
  planTypes,
  selectedProjectId,
  onSelectProject,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);

  const [projectSearch, setProjectSearch] = useState('');
  const [projectTypeFilter, setProjectTypeFilter] = useState('all');
  const [focusedProjectId, setFocusedProjectId] = useState<string | null>(
    selectedProjectId && selectedProjectId !== 'all' ? selectedProjectId : null
  );

  useEffect(() => {
    if (selectedProjectId && selectedProjectId !== 'all') {
      setFocusedProjectId(selectedProjectId);
    } else if (selectedProjectId === 'all') {
      setFocusedProjectId(null);
    }
  }, [selectedProjectId]);

  const visibleProjects = useMemo(() => {
    const q = projectSearch.trim().toLocaleLowerCase('vi');
    return projects.filter((project) => {
      const matchesType =
        projectTypeFilter === 'all' ||
        project.planTypeId === projectTypeFilter ||
        (!project.planTypeId && projectTypeFilter === 'plan-type-unclassified');
      if (!matchesType) return false;
      if (!q) return true;
      const searchText = `${project.name} ${project.code} ${project.contractor} ${project.investor} ${(
        project.contractors || []
      )
        .map((c) => c.name)
        .join(' ')}`.toLocaleLowerCase('vi');
      return searchText.includes(q);
    });
  }, [projects, projectTypeFilter, projectSearch]);

  const focusedProject = useMemo(
    () =>
      focusedProjectId
        ? projects.find((p) => p.id === focusedProjectId) || null
        : null,
    [projects, focusedProjectId]
  );

  const handleSelectRoute = (projectId: string | null) => {
    setFocusedProjectId(projectId);
    onSelectProject?.(projectId || 'all');
  };

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const firstValidPoint = projects
      .flatMap((p) => p.points || [])
      .find((pt) => Number.isFinite(pt.lat) && Number.isFinite(pt.lng));

    const initialCenter: [number, number] = firstValidPoint
      ? [firstValidPoint.lat, firstValidPoint.lng]
      : [16.0528, 108.2384];

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 13,
      zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      {
        attribution:
          'Tiles &copy; Esri, TomTom, Garmin, FAO, NOAA, USGS, &copy; OpenStreetMap contributors',
        maxZoom: 19,
      }
    ).addTo(map);

    const layersGroup = L.layerGroup().addTo(map);
    layersGroupRef.current = layersGroup;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      layersGroupRef.current = null;
    };
  }, []);

  // Render ALL visible routes, highlight focused route, and support hover tooltip with route name
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layersGroup = layersGroupRef.current;
    if (!map || !layersGroup) return;

    layersGroup.clearLayers();

    const allBoundsCoords: [number, number][] = [];
    const focusedBoundsCoords: [number, number][] = [];
    const hasFocus = Boolean(focusedProjectId);

    visibleProjects.forEach((project) => {
      const routePoints = (project.points || []).filter(
        (pt) => Number.isFinite(pt.lat) && Number.isFinite(pt.lng)
      );
      if (routePoints.length === 0) return;

      const coords = routePoints.map((pt) => [pt.lat, pt.lng] as [number, number]);
      allBoundsCoords.push(...coords);

      const isFocused = focusedProjectId === project.id;
      if (isFocused) {
        focusedBoundsCoords.push(...coords);
      }

      const routeColor = isFocused ? HIGHLIGHT_ROUTE_COLOR : BASE_ROUTE_COLOR;
      const pct =
        project.totalLengthM > 0
          ? Math.min(100, Math.round((project.completedLengthM / project.totalLengthM) * 100))
          : 0;
      const tooltipHtml = `<div style="font-weight:800;font-size:12px;color:#0f172a;">${escapeHtml(
        project.name
      )}</div><div style="font-size:11px;color:#475569;margin-top:1px;">${escapeHtml(
        project.code || ''
      )} · <strong>${pct}%</strong> (${formatNumber(project.completedLengthM)}/${formatNumber(
        project.totalLengthM
      )} m)</div>`;

      if (coords.length === 1) {
        const marker = L.circleMarker(coords[0], {
          radius: isFocused ? 9 : 6,
          color: '#ffffff',
          weight: 2,
          fillColor: routeColor,
          fillOpacity: hasFocus && !isFocused ? 0.35 : 0.95,
        }).addTo(layersGroup);
        marker.bindTooltip(tooltipHtml, { sticky: true, direction: 'top' });
        marker.on('click', () => handleSelectRoute(project.id));
        return;
      }

      if (isFocused) {
        // White halo underneath focused route so it stands out sharply
        L.polyline(coords, {
          color: '#ffffff',
          weight: 14,
          opacity: 0.92,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
        }).addTo(layersGroup);

        const contractors = project.contractors || [];
        const pointIndex = new Map(routePoints.map((pt, idx) => [pt.id, idx]));
        const assignedRoutes = contractors
          .map((contractor) => ({
            contractor,
            start: pointIndex.get(contractor.startPointId),
            end: pointIndex.get(contractor.endPointId),
            coordinates: contractor.routePoints
              .filter((pt) => Number.isFinite(pt.lat) && Number.isFinite(pt.lng))
              .map((pt) => [pt.lat, pt.lng] as [number, number]),
          }))
          .filter(
            (r) =>
              r.start !== undefined &&
              r.end !== undefined &&
              r.end > r.start &&
              r.coordinates.length > 1
          )
          .sort((a, b) => a.start! - b.start!);

        if (assignedRoutes.length > 0) {
          let nextIdx = 0;
          const addUnassigned = (s: number, e: number) => {
            const seg = coords.slice(s, e + 1);
            if (seg.length < 2) return;
            L.polyline(seg, {
              color: '#64748b',
              weight: 6,
              opacity: 0.75,
              dashArray: '8 10',
              lineCap: 'round',
              lineJoin: 'round',
            })
              .bindTooltip(tooltipHtml, { sticky: true, direction: 'top' })
              .addTo(layersGroup);
          };

          assignedRoutes.forEach(({ contractor, start, end, coordinates }) => {
            if ((start as number) > nextIdx) {
              addUnassigned(nextIdx, start as number);
            }
            const cColor = /^#[\da-f]{6}$/i.test(contractor.color)
              ? contractor.color
              : routeColor;
            const segLine = L.polyline(coordinates, {
              color: cColor,
              weight: 9,
              opacity: 1,
              lineCap: 'round',
              lineJoin: 'round',
            }).addTo(layersGroup);
            segLine.bindTooltip(
              `<strong>${escapeHtml(project.name)}</strong><br/>Nhà thầu: ${escapeHtml(
                contractor.name
              )}`,
              { sticky: true, direction: 'top' }
            );

            // Direction arrow
            const arrowIdx = Math.max(
              0,
              Math.min(coordinates.length - 2, Math.floor((coordinates.length - 1) / 2))
            );
            const from = coordinates[arrowIdx];
            const to = coordinates[arrowIdx + 1];
            const angle = Math.atan2(-(to[0] - from[0]), to[1] - from[1]) * (180 / Math.PI);
            L.marker([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], {
              icon: L.divIcon({
                className: 'contractor-route-arrow',
                html: `<span style="display:block;color:${cColor};font-size:24px;font-weight:900;line-height:22px;text-shadow:0 1px 3px white,1px 0 3px white,-1px 0 3px white;transform:rotate(${angle}deg)">➤</span>`,
                iconSize: [22, 22],
                iconAnchor: [11, 11],
              }),
              interactive: false,
            }).addTo(layersGroup);

            nextIdx = Math.max(nextIdx, end as number);
          });

          if (nextIdx < coords.length - 1) {
            addUnassigned(nextIdx, coords.length - 1);
          }
        } else {
          const line = L.polyline(coords, {
            color: routeColor,
            weight: 9,
            opacity: 1,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(layersGroup);
          line.bindTooltip(tooltipHtml, { sticky: true, direction: 'top' });
        }

        // Start & End markers for focused route
        L.circleMarker(coords[0], {
          radius: 7,
          color: '#ffffff',
          weight: 2.5,
          fillColor: '#16a34a',
          fillOpacity: 1,
        })
          .bindTooltip(`Điểm đầu: ${escapeHtml(project.startPointName || project.name)}`, {
            direction: 'top',
          })
          .addTo(layersGroup);

        L.circleMarker(coords[coords.length - 1], {
          radius: 7,
          color: '#ffffff',
          weight: 2.5,
          fillColor: '#dc2626',
          fillOpacity: 1,
        })
          .bindTooltip(`Điểm cuối: ${escapeHtml(project.endPointName || project.name)}`, {
            direction: 'top',
          })
          .addTo(layersGroup);
      } else {
        // Non-focused route (either overview mode or dimmed background route)
        const baseWeight = hasFocus ? 4 : 6;
        const baseOpacity = hasFocus ? 0.3 : 0.88;

        if (!hasFocus) {
          L.polyline(coords, {
            color: '#ffffff',
            weight: 9,
            opacity: 0.7,
            lineCap: 'round',
            lineJoin: 'round',
            interactive: false,
          }).addTo(layersGroup);
        }

        const line = L.polyline(coords, {
          color: routeColor,
          weight: baseWeight,
          opacity: baseOpacity,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(layersGroup);

        line.bindTooltip(tooltipHtml, {
          sticky: true,
          direction: 'top',
          opacity: 0.96,
        });

        line.on('mouseover', () => {
          line.setStyle({ color: HOVER_ROUTE_COLOR, weight: 9, opacity: 1 });
          line.bringToFront();
        });
        line.on('mouseout', () => {
          line.setStyle({ color: BASE_ROUTE_COLOR, weight: baseWeight, opacity: baseOpacity });
        });
        line.on('click', () => {
          handleSelectRoute(project.id);
        });
      }
    });

    const targetCoords =
      focusedBoundsCoords.length > 0 ? focusedBoundsCoords : allBoundsCoords;

    const frameId = window.requestAnimationFrame(() => {
      map.invalidateSize({ pan: false });
      if (targetCoords.length > 1) {
        const padding = map.getSize().x < 640 ? 24 : 42;
        map.fitBounds(L.latLngBounds(targetCoords), {
          padding: [padding, padding],
          maxZoom: focusedBoundsCoords.length > 0 ? 16 : 15,
          animate: false,
        });
      } else if (targetCoords.length === 1) {
        map.setView(targetCoords[0], 15, { animate: false });
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [visibleProjects, focusedProjectId]);

  const fitAllRoutes = () => {
    handleSelectRoute(null);
  };

  return (
    <div className="space-y-3">
      {/* Top Filter & Summary Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <Layers className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                Bản Đồ Toàn Bộ Tuyến ({visibleProjects.length}/{projects.length} tuyến)
              </h3>
              <p className="text-[11px] text-slate-500">
                Rê chuột vào tuyến để xem tên · Chạm/click vào tuyến để làm nổi bật
              </p>
            </div>
          </div>
          {focusedProject && (
            <button
              type="button"
              onClick={fitAllRoutes}
              className="inline-flex items-center gap-1.5 rounded-xl border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-100"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Xem tất cả tuyến
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              placeholder="Tìm tên tuyến, mã HĐ, nhà thầu..."
              className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-xs font-medium text-slate-900 outline-none focus:border-teal-600 focus:bg-white"
            />
          </div>
          <select
            value={projectTypeFilter}
            onChange={(e) => setProjectTypeFilter(e.target.value)}
            aria-label="Lọc bản đồ theo loại kế hoạch"
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-teal-600 focus:bg-white"
          >
            <option value="all">Tất cả loại kế hoạch</option>
            {planTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Responsive Layout: On Mobile -> Map first, then Selected Detail, then Route List. On Desktop -> Route List left, Map right */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Map Column (appears first on mobile with order-1, right on desktop with lg:order-2) */}
        <div className="order-1 lg:order-2 lg:col-span-8 space-y-2.5">
          <div className="relative h-[46vh] min-h-[300px] sm:h-[540px] lg:h-[600px] overflow-hidden rounded-2xl border border-slate-300 bg-slate-100 shadow-xs">
            <div ref={mapContainerRef} className="h-full w-full" />

            {/* Floating Map Pill */}
            <div className="pointer-events-none absolute left-2.5 top-2.5 right-2.5 z-[400] flex flex-wrap items-center justify-between gap-2">
              <div className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white/95 px-2.5 py-1.5 text-[11px] font-bold text-slate-800 shadow-sm backdrop-blur-xs">
                <MapPin className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                <span className="max-w-[200px] sm:max-w-[340px] truncate">
                  {focusedProject
                    ? `Đang chọn: ${focusedProject.name}`
                    : `Đang hiện ${visibleProjects.length} tuyến`}
                </span>
                {focusedProject && (
                  <button
                    type="button"
                    onClick={fitAllRoutes}
                    title="Bỏ chọn để xem toàn bộ tuyến"
                    className="ml-1 rounded-md bg-slate-100 p-0.5 text-slate-600 hover:bg-slate-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Focused Project Detail Strip (shows when a route is selected) */}
          {focusedProject && (
            <div className="rounded-2xl border border-teal-200 bg-white p-3.5 shadow-2xs space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-teal-50 border border-teal-200 px-2 py-0.5 font-mono text-[10px] font-bold text-teal-800">
                      {focusedProject.code}
                    </span>
                    <span className="rounded bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-800">
                      Mương: {formatNumber(focusedProject.completedLengthM)}/
                      {formatNumber(focusedProject.totalLengthM)} m
                    </span>
                    <span className="rounded bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-800">
                      Hố ga: {formatNumber(focusedProject.completedChambers)}/
                      {formatNumber(focusedProject.totalChambers)}
                    </span>
                  </div>
                  <h4 className="mt-1 text-sm sm:text-base font-extrabold text-slate-900">
                    {focusedProject.name}
                  </h4>
                  {focusedProject.currentWorkLocation && (
                    <p className="mt-0.5 text-xs text-teal-800">
                      📍 {focusedProject.currentWorkLocation}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={fitAllRoutes}
                  className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                >
                  Đóng chọn
                </button>
              </div>

              {(focusedProject.contractors || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
                  {(focusedProject.contractors || []).map((contractor) => (
                    <span
                      key={contractor.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-800"
                    >
                      <i
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: contractor.color }}
                      />
                      <span>{contractor.name}</span>
                      <span className="font-mono text-slate-500">
                        ({formatNumber(contractor.totalLengthM)}m)
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Route List Column (appears below map on mobile with order-2, left on desktop with lg:order-1) */}
        <aside className="order-2 lg:order-1 lg:col-span-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs space-y-2 h-fit">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-700">
              Chọn Tuyến Làm Nổi Bật
            </h4>
            {focusedProject && (
              <button
                type="button"
                onClick={fitAllRoutes}
                className="text-[11px] font-bold text-teal-700 hover:underline"
              >
                Tất cả tuyến
              </button>
            )}
          </div>

          <div className="max-h-[340px] lg:max-h-[540px] space-y-1.5 overflow-y-auto pr-1">
            {visibleProjects.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">
                Không có tuyến phù hợp.
              </p>
            ) : (
              visibleProjects.map((project) => {
                const isSelected = focusedProjectId === project.id;
                const routeColor = isSelected ? HIGHLIGHT_ROUTE_COLOR : BASE_ROUTE_COLOR;
                const coordCount = (project.points || []).filter(
                  (pt) => Number.isFinite(pt.lat) && Number.isFinite(pt.lng)
                ).length;
                const pct =
                  project.totalLengthM > 0
                    ? Math.min(
                        100,
                        Math.round((project.completedLengthM / project.totalLengthM) * 100)
                      )
                    : 0;

                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() =>
                      handleSelectRoute(isSelected ? null : project.id)
                    }
                    className={`w-full rounded-xl border p-2.5 text-left transition-all ${
                      isSelected
                        ? 'border-teal-500 bg-teal-50/70 ring-2 ring-teal-200'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full border border-white shadow-2xs"
                          style={{ backgroundColor: routeColor }}
                        />
                        <span className="truncate font-mono text-[10px] font-bold text-slate-600">
                          {project.code}
                        </span>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                        {pct}% · {coordCount} mốc
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-extrabold text-slate-900 leading-snug">
                      {project.name}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      {formatNumber(project.completedLengthM)}/{formatNumber(project.totalLengthM)} m
                      {coordCount < 2 ? ' · Chưa đủ tọa độ' : ''}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
