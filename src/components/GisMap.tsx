import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { PlanType, UndergroundProject } from '../types/undergrounding';
import { formatNumber } from '../utils/numberFormat';
import { ArrowLeft, ArrowRight, MapPin, Search } from 'lucide-react';

interface GisMapProps {
  projects: UndergroundProject[];
  planTypes: PlanType[];
  selectedProjectId?: string;
  onSelectProject?: (projectId: string) => void;
  showProjectPicker: boolean;
  onChooseProject: (projectId: string) => void;
  onShowProjectPicker: () => void;
}

const PROJECT_PICKER_PAGE_SIZE = 20;

export const GisMap: React.FC<GisMapProps> = ({
  projects,
  planTypes,
  selectedProjectId,
  onSelectProject,
  showProjectPicker,
  onChooseProject,
  onShowProjectPicker,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectTypeFilter, setProjectTypeFilter] = useState('all');
  const [projectPickerPage, setProjectPickerPage] = useState(0);

  const [activeProjectId, setActiveProjectId] = useState<string>(
    selectedProjectId || projects[0]?.id || ''
  );
  const currentProject = projects.find((p) => p.id === activeProjectId) || projects[0];
  const routePoints = (currentProject?.points || [])
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    .map((point) => point);
  const routeCoordinates = routePoints.map((point) => [point.lat, point.lng] as [number, number]);
  const visibleProjects = projects.filter((project) => {
    const matchesType = projectTypeFilter === 'all' || project.planTypeId === projectTypeFilter ||
      (!project.planTypeId && projectTypeFilter === 'plan-type-unclassified');
    const searchText = `${project.name} ${project.code} ${project.contractor} ${(project.contractors || []).map((contractor) => contractor.name).join(' ')}`.toLocaleLowerCase();
    return matchesType && searchText.includes(projectSearch.trim().toLocaleLowerCase());
  });
  const projectPickerPageCount = Math.max(
    1,
    Math.ceil(visibleProjects.length / PROJECT_PICKER_PAGE_SIZE)
  );
  const currentProjectPickerPage = Math.min(projectPickerPage, projectPickerPageCount - 1);
  const pageProjects = visibleProjects.slice(
    currentProjectPickerPage * PROJECT_PICKER_PAGE_SIZE,
    (currentProjectPickerPage + 1) * PROJECT_PICKER_PAGE_SIZE
  );

  useEffect(() => {
    if (selectedProjectId) {
      setActiveProjectId(selectedProjectId);
    }
  }, [selectedProjectId]);

  // Initialize Map
  useEffect(() => {
    if (showProjectPicker || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialCenter: [number, number] = currentProject?.points[0]
        ? [currentProject.points[0].lat, currentProject.points[0].lng]
        : [16.0528, 108.2384];

      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: 15,
        zoomControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Esri street tiles are publicly accessible without an API key.
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        {
          attribution:
            'Tiles &copy; Esri, TomTom, Garmin, FAO, NOAA, USGS, &copy; OpenStreetMap contributors, and the GIS User Community',
          maxZoom: 19,
        }
      ).addTo(map);

      const layersGroup = L.layerGroup().addTo(map);
      layersGroupRef.current = layersGroup;
      mapInstanceRef.current = map;
    }

    return () => {
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      layersGroupRef.current = null;
    };
  }, [showProjectPicker]);

  // Render Routes, Turn points, and Chambers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layersGroup = layersGroupRef.current;
    if (!map || !layersGroup) return;

    layersGroup.clearLayers();

    if (currentProject && routeCoordinates.length > 1) {
      const contractors = currentProject.contractors || [];
      const pointIndex = new Map(routePoints.map((point, index) => [point.id, index]));
      const assignedRoutes = contractors
        .map((contractor) => ({
          contractor,
          start: pointIndex.get(contractor.startPointId),
          end: pointIndex.get(contractor.endPointId),
          coordinates: contractor.routePoints
            .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
            .map((point) => [point.lat, point.lng] as [number, number]),
        }))
        .filter((route) =>
          route.start !== undefined &&
          route.end !== undefined &&
          route.end > route.start &&
          route.coordinates.length > 1
        )
        .sort((left, right) => left.start! - right.start!);

      const addUnassignedRoute = (start: number, end: number) => {
        const coordinates = routeCoordinates.slice(start, end + 1);
        if (coordinates.length < 2) return;
        L.polyline(coordinates, {
          color: '#64748b',
          weight: 5,
          opacity: 0.65,
          dashArray: '9 10',
          lineCap: 'round',
          lineJoin: 'round',
        }).bindTooltip('Chưa phân công nhà thầu', { sticky: true }).addTo(layersGroup);
      };

      let nextUnassignedIndex = 0;
      assignedRoutes.forEach(({ contractor, start, end, coordinates }) => {
        const startIndex = start as number;
        const endIndex = end as number;
        const routeColor = /^#[\da-f]{6}$/i.test(contractor.color) ? contractor.color : '#2563eb';
        if (startIndex > nextUnassignedIndex) {
          addUnassignedRoute(nextUnassignedIndex, startIndex);
        }

        const line = L.polyline(coordinates, {
          color: routeColor,
          weight: 8,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(layersGroup);
        const safeName = contractor.name.replace(/[&<>"']/g, (character) => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[character] || character);
        line.bindTooltip(safeName, {
          permanent: true,
          direction: 'top',
          className: 'contractor-route-label',
          opacity: 0.95,
        }).addTo(layersGroup);

        const arrowIndex = Math.max(0, Math.min(coordinates.length - 2, Math.floor((coordinates.length - 1) / 2)));
        const from = coordinates[arrowIndex];
        const to = coordinates[arrowIndex + 1];
        const angle = Math.atan2(-(to[0] - from[0]), to[1] - from[1]) * (180 / Math.PI);
        const arrow = L.marker(
          [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2],
          {
            icon: L.divIcon({
              className: 'contractor-route-arrow',
              html: `<span style="display:block;color:${routeColor};font-size:26px;font-weight:900;line-height:24px;text-shadow:0 1px 3px white,1px 0 3px white,-1px 0 3px white;transform:rotate(${angle}deg)">➤</span>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            }),
            interactive: false,
          }
        );
        arrow.addTo(layersGroup);
        nextUnassignedIndex = Math.max(nextUnassignedIndex, endIndex);
      });

      if (nextUnassignedIndex < routeCoordinates.length - 1) {
        addUnassignedRoute(nextUnassignedIndex, routeCoordinates.length - 1);
      }
    }

    const focusFrame = window.requestAnimationFrame(() => {
      map.invalidateSize({ pan: false });
      if (routeCoordinates.length > 1) {
        const padding = map.getSize().x < 640 ? 24 : 48;
        map.fitBounds(L.latLngBounds(routeCoordinates), {
          padding: [padding, padding],
          maxZoom: 16,
          animate: false,
        });
      } else if (routeCoordinates.length === 1) {
        map.setView(routeCoordinates[0], 16, { animate: false });
      }
    });

    return () => window.cancelAnimationFrame(focusFrame);
  }, [projects, activeProjectId, showProjectPicker]);

  if (showProjectPicker) {
    return (
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-slate-950 via-cyan-950 to-teal-800 px-3.5 py-3 text-white sm:px-6 sm:py-5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.16em] text-teal-200">Bản đồ tuyến</p>
              <h2 className="text-base font-black tracking-tight sm:text-xl">Chọn dự án</h2>
            </div>
            <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[10px] sm:text-[11px] font-semibold text-teal-50">
              {visibleProjects.length}/{projects.length} dự án
            </span>
          </div>
        </div>

        <div className="grid gap-2 border-b border-slate-100 p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.6fr)] sm:p-5">
          <label className="relative block min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 sm:h-4 sm:w-4" />
            <input
              type="search"
              value={projectSearch}
              onChange={(event) => {
                setProjectSearch(event.target.value);
                setProjectPickerPage(0);
              }}
              placeholder="Tìm tên, mã hoặc nhà thầu..."
              aria-label="Tìm dự án trên bản đồ tuyến"
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-8.5 pr-3 text-xs sm:py-2.5 sm:pl-9 sm:text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <label className="block min-w-0">
            <span className="sr-only">Lọc theo loại kế hoạch</span>
            <select
              value={projectTypeFilter}
              onChange={(event) => {
                setProjectTypeFilter(event.target.value);
                setProjectPickerPage(0);
              }}
              aria-label="Lọc bản đồ theo loại kế hoạch"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:py-2.5 sm:text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            >
              <option value="all">Tất cả loại kế hoạch</option>
              {planTypes.map((type) => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
          </label>
        </div>

        {projects.length > 0 ? (
          <div className="p-2.5 sm:p-5">
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {pageProjects.map((project) => {
              const coordinateCount = project.points.filter(
                (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)
              ).length;
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onChooseProject(project.id)}
                  className="group flex w-full min-w-0 flex-col gap-1 px-3 py-2.5 text-left transition hover:bg-teal-50/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-500 sm:flex-row sm:items-center sm:gap-4 sm:px-4"
                >
                  <div className="flex w-full min-w-0 items-center justify-between gap-2 sm:hidden">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {project.code && (
                        <span className="rounded bg-teal-50 border border-teal-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-teal-800">
                          {project.code}
                        </span>
                      )}
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        {planTypes.find((type) => type.id === project.planTypeId)?.name || 'Chưa phân loại'}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 text-[10px] font-mono text-slate-500">
                      <span>{formatNumber(project.totalLengthM)}m</span>
                      <span>· {coordinateCount} mốc</span>
                      <ArrowRight className="h-3.5 w-3.5 text-teal-600" />
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-sm font-bold text-teal-800 sm:flex">
                      {project.code?.slice(0, 2) || <MapPin className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      {project.code && (
                        <p className="hidden sm:block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          {project.code}
                        </p>
                      )}
                      <h3 className="break-words text-[13px] font-extrabold leading-snug text-slate-900 sm:text-sm">
                        {project.name}
                      </h3>
                      <p className="mt-0.5 truncate text-[10px] text-slate-500 sm:text-xs">
                        {project.currentWorkLocation || project.startPointName || 'Chưa cập nhật vị trí'}
                      </p>
                    </div>
                  </div>
                  <div className="hidden shrink-0 items-center gap-3 text-[10px] text-slate-500 sm:flex">
                    <span className="max-w-32 truncate rounded-full bg-teal-50 px-2 py-1 font-semibold text-teal-800">
                      {planTypes.find((type) => type.id === project.planTypeId)?.name || 'Chưa phân loại'}
                    </span>
                    <span>{formatNumber(project.totalLengthM)} m</span>
                    <span>{coordinateCount} mốc</span>
                  </div>
                  <ArrowRight className="hidden sm:block h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-teal-600" />
                </button>
              );
            })}
            {visibleProjects.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-slate-500">
                Không tìm thấy dự án phù hợp.
              </div>
            )}
            </div>
            <div className="flex flex-col gap-2 pt-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {visibleProjects.length
                  ? `Hiển thị ${currentProjectPickerPage * PROJECT_PICKER_PAGE_SIZE + 1}–${Math.min(
                      (currentProjectPickerPage + 1) * PROJECT_PICKER_PAGE_SIZE,
                      visibleProjects.length
                    )} / ${visibleProjects.length} dự án`
                  : '0 dự án'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setProjectPickerPage((page) => Math.max(0, page - 1))}
                  disabled={currentProjectPickerPage === 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Trước
                </button>
                <span className="min-w-16 text-center font-semibold text-slate-600">
                  {currentProjectPickerPage + 1} / {projectPickerPageCount}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setProjectPickerPage((page) => Math.min(projectPickerPageCount - 1, page + 1))
                  }
                  disabled={currentProjectPickerPage >= projectPickerPageCount - 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Tiếp
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            Chưa có dự án
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-2.5 sm:space-y-3">
      {/* Map Control Bar */}
      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs sm:gap-3 sm:rounded-2xl sm:p-4">
        <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            {currentProject && (
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                {currentProject.code && (
                  <span className="rounded bg-teal-50 border border-teal-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-teal-800">
                    {currentProject.code}
                  </span>
                )}
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600">
                  {formatNumber(currentProject.completedLengthM)}/{formatNumber(currentProject.totalLengthM)} m
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={onShowProjectPicker}
              className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-2 text-left text-xs font-extrabold text-slate-900 transition hover:border-teal-400 sm:max-w-[min(65vw,32rem)] sm:px-3"
            >
              <span className="min-w-0 break-words leading-snug">{currentProject?.name || 'Chọn dự án'}</span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded bg-teal-600 px-2 py-0.5 text-[10px] font-bold text-white">
                <Search className="h-3 w-3" />
                <span>Đổi DA</span>
              </span>
            </button>
          </div>
        </div>
        {currentProject && currentProject.currentWorkLocation && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-1.5 text-[11px] sm:text-xs">
            <span className="min-w-0 break-words text-teal-800">📍 {currentProject.currentWorkLocation}</span>
          </div>
        )}
        {currentProject && (currentProject.contractors || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-1.5">
            {(currentProject.contractors || []).map((contractor) => (
              <span
                key={contractor.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700"
              >
                <i className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: contractor.color }} />
                <span className="break-words">{contractor.name}</span>
                <span className="font-normal text-slate-500">{formatNumber(contractor.totalLengthM)}m</span>
              </span>
            ))}
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
              <i className="h-0 w-3.5 border-t-2 border-dashed border-slate-500" />
              Chưa giao
            </span>
          </div>
        )}
      </div>

      <div className="relative h-[52vh] min-h-[300px] max-h-[560px] overflow-hidden rounded-xl border border-slate-300 bg-slate-100 shadow-xs sm:h-[560px] sm:rounded-2xl">
        <div ref={mapContainerRef} className="h-full w-full" />
        {currentProject && routeCoordinates.length === 0 && (
          <div className="absolute inset-x-2 top-2 rounded-lg border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs text-amber-900 shadow-sm sm:inset-x-4 sm:top-4 sm:px-4 sm:py-3 sm:text-sm">
            Chưa có tọa độ tuyến.
          </div>
        )}
      </div>
    </div>
  );
};
