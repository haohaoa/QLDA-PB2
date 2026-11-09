export type SegmentStatus = 'in_excavation' | 'conduit_installed' | 'surface_restored' | 'obstacle';

export interface RouteCoordinatePoint {
  id: string;
  name: string; // VD: "Điểm bắt đầu", "Điểm cua ngã tư Phạm Kiệt", "Điểm kết thúc"
  type: 'start' | 'turn' | 'end';
  lat: number;
  lng: number;
}

export interface CableChamber {
  id: string;
  code: string;
  type: 'Bể cáp kéo tiêu chuẩn (B1)' | 'Bể phân phối trung gian (B2)' | 'Hầm cáp kỹ thuật lớn (H1)' | 'Hố ga đấu nối khách hàng';
  dimensions: string; // e.g. "1.8m x 1.2m x 1.4m"
  position: [number, number]; // [lat, lng]
  locationDescription: string;
  status: 'completed' | 'pouring' | 'planned';
  completionDate?: string;
  depthMeters: number;
  manholeCoverType: 'Gang cầu tải trọng 25T' | 'Composite 12.5T' | 'Bê tông cốt thép';
}

export interface RouteInspectionPhoto {
  id: string;
  url: string;
  title: string;
  location: string;
  date: string;
  stage: 'trenching' | 'conduit_laid' | 'chamber_vault' | 'surface_restored';
  stageLabel: string;
  supervisor: string;
  notes: string;
  gpsCoords?: string;
}

export interface PlanType {
  id: string;
  name: string;
}

export type ProjectStatus = 'in_progress' | 'paused' | 'completed';

export interface ProjectContractor {
  id: string;
  name: string;
  color: string;
  startPointId: string;
  endPointId: string;
  routePoints: RouteCoordinatePoint[];
  totalLengthM: number;
  totalChambers: number;
  contractValueVND: number;
}

// Concrete Undergrounding Project (Dự án ngầm hóa)
export interface UndergroundProject {
  id: string;
  status?: ProjectStatus;
  name: string; // Tên dự án ngầm
  code: string; // Mã dự án
  planTypeId?: string;
  investor: string; // Chủ đầu tư
  contractor: string; // Nhà thầu nhận thi công
  contractValueVND: number; // Giá trị HĐ (VNĐ)
  startDate: string; // Ngày bắt đầu thi công
  finishDate: string; // Ngày hoàn tất thi công
  totalLengthM: number; // Chiều dài toàn tuyến (mét)
  totalChambers: number; // Bao nhiêu hố ga (mục tiêu)
  startPointName: string; // Điểm bắt đầu (VD: Nút giao Võ Nguyên Giáp)
  endPointName: string; // Điểm kết thúc (VD: Giao lộ Tố Hữu)
  currentWorkLocation: string; // Đang thi công đến đâu
  points: RouteCoordinatePoint[]; // Điểm đầu, các điểm cua, điểm cuối
  chambers: CableChamber[];
  photos: RouteInspectionPhoto[];
  contractors?: ProjectContractor[];
  // Progress caches
  completedLengthM: number;
  completedChambers: number;
}

export interface DailyLogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  stt: number;
  contractorName: string; // Tên nhà thầu
  projectId: string; // ID dự án ngầm
  projectName: string; // Tên dự án ngầm
  resources: string; // e.g. "1 đội đào + 1 đội khoan", "Nghỉ do mưa lớn"
  excavationTodayM: number; // KL Đào Phui/Ngày (Mét)
  chambersPouredToday: number; // Khối Lượng Đổ Hố Ga/Ngày
  pipeLaidTodayM?: number; // Mét lắp ống ngày
  restoredTodayM?: number; // Hoàn trả mặt bằng ngày
  cumulativeTrenchM: number; // Khối lượng Mương Cáp - Lũy Kế (m)
  contractTrenchM: number; // Khối lượng Mương Cáp - KLHĐ (m)
  cumulativeChambers: number; // Khối Lượng Bể Cáp (Lũy kế)
  contractChambers: number; // Khối Lượng Bể Cáp - KLHĐ (hầm)
  stoppageReason?: string;
  supervisorName?: string;
  photoUrls?: string[];
  photoUrl?: string;
  notes?: string;
  violationReport?: ViolationReport; // Biên bản xử lý làm sai hoặc không đúng bản vẽ thiết kế
}

export type DailyLogDraft = Omit<DailyLogEntry, 'id' | 'cumulativeTrenchM' | 'cumulativeChambers'>;

export interface ViolationReport {
  id: string;
  hasViolation: boolean;
  code: string; // e.g. "BB-XL/2026/014"
  violationType: 'sai_ban_ve_thiet_ke' | 'sai_do_sau_ranh' | 'sai_tim_tuyen' | 'sai_quy_cach_ho_ga' | 'chua_hoan_tra_mat_bang' | 'mat_an_toan_gt';
  violationTypeLabel: string;
  description: string; // Note chi tiết vi phạm
  correctiveAction: string; // Biện pháp xử lý & khắc phục
  photoUrls?: string[]; // Ảnh hiện trường vi phạm; photoUrl giữ tương thích dữ liệu cũ
  photoUrl?: string; // Chụp ảnh hiện trường sai phạm
  deadlineHours: number; // Hạn khắc phục (giờ)
  status: 'pending_fix' | 'fixed' | 'rejected_acceptance';
  supervisorSign: string;
}

export interface SiteBulletin {
  id: string;
  title: string;
  category: 'weather' | 'permit_legal' | 'temporary_stop' | 'infrastructure_obstacle' | 'urgent';
  projectId: string; // 'all' or specific project id
  projectName: string;
  author: string;
  date: string;
  content: string;
  documentRefNumber?: string; // e.g. "Hồ sơ số 782/2026/SGTVT-QLĐT"
  severity: 'critical' | 'warning' | 'info';
  isActive: boolean;
}

export interface SCurveDataPoint {
  date: string;
  plannedCumulativeM: number;
  actualCumulativeM: number;
  plannedChambers: number;
  actualChambers: number;
}
