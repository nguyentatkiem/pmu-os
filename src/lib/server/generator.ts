// Bộ sinh DỮ LIỆU MÔ PHỎNG "dày" cho DOANH NGHIỆP PMU: 2 chi nhánh, 22 nhân sự, ~380 khách, ~3 tháng hoạt động.
// Mọi tên người là hư cấu (ghép ngẫu nhiên), số điện thoại dùng đầu số 0123 đã ngừng sử dụng. Không có dữ liệu người thật.
import { uid, type Q } from "./db";
import { hashPassword } from "./auth";
import { addDays, vnDayKey, vnParts, vnToDate, dowOfDay, weekStart } from "../shared/format";

// ---------- Tiện ích ngẫu nhiên có hạt giống (chạy lại cho cùng kết quả) ----------
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const JSONB_COLS = new Set(["answers", "affected", "source_refs", "proposed_payload", "before_snapshot", "after_snapshot", "result", "payload", "output", "availability", "settings", "content", "detail"]);

class Bulk {
  rows = new Map<string, Record<string, unknown>[]>();
  add(table: string, row: Record<string, unknown>) {
    if (!this.rows.has(table)) this.rows.set(table, []);
    this.rows.get(table)!.push(row);
    return row;
  }
  async flush(qq: Q, order: string[]) {
    for (const table of order) {
      const rows = this.rows.get(table);
      if (!rows?.length) continue;
      const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      const per = Math.max(1, Math.floor(30000 / cols.length));
      for (let i = 0; i < rows.length; i += per) {
        const chunk = rows.slice(i, i + per);
        const params: unknown[] = [];
        const tuples = chunk.map((r) => {
          const ph = cols.map((c) => {
            if (!(c in r) || r[c] === undefined) return "DEFAULT";
            let v = r[c];
            if (v !== null && !(v instanceof Date) && typeof v === "object" && (!Array.isArray(v) || JSONB_COLS.has(c))) v = JSON.stringify(v);
            params.push(v);
            return `$${params.length}`;
          });
          return `(${ph.join(",")})`;
        });
        await qq(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${tuples.join(",")}`, params);
      }
    }
  }
}

const ORDER = [
  "branches",
  "users",
  "memberships",
  "employees",
  "services",
  "knowledge_items",
  "care_templates",
  "customers",
  "customer_notes",
  "consents",
  "shifts",
  "leaves",
  "appointments",
  "tasks",
  "checklist_items",
  "task_events",
  "conversations",
  "messages",
  "feedback",
  "care_plans",
  "care_touchpoints",
  "jobs",
  "customer_events",
  "sop_documents",
  "sop_versions",
  "learning_assignments",
  "ai_proposals",
  "approvals",
  "executions",
  "ai_threads",
  "ai_messages",
  "agent_runs",
  "integrations",
];

// ---------- Danh mục tên hư cấu ----------
const HO = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý", "Đinh", "Trịnh", "Mai", "Lương", "Tạ", "Cao", "Kiều", "Chu", "Lâm"];
const DEM_NU = ["Thị", "Thu", "Ngọc", "Phương", "Minh", "Thanh", "Bảo", "Khánh", "Hoài", "Diệu", "Kim", "Hồng", "Thùy", "Mỹ", "Quỳnh", "Hải"];
const TEN_NU = ["Anh", "Hà", "Linh", "Trang", "Hương", "Ngọc", "Thảo", "Vy", "Nhung", "Yến", "Giang", "Hạnh", "Huyền", "Phương", "Quyên", "Trâm", "My", "Uyên", "Tâm", "Hiền", "Loan", "Thư", "Diệp", "Chi", "Nga", "Oanh", "Dung", "Hằng", "Duyên", "Nhi", "Lan", "Mai", "Vân", "Ánh", "Hoa"];
const DEM_NAM = ["Văn", "Minh", "Đức", "Quốc", "Hoàng", "Thành", "Gia", "Hữu"];
const TEN_NAM = ["Nam", "Hùng", "Dũng", "Tuấn", "Long", "Khoa", "Phúc", "Huy", "Đạt", "Bảo", "Sơn", "Khang", "Trung", "Việt"];

const STAFF: { name: string; pos: string; branch: 0 | 1; avatar?: string; skills: string[] }[] = [
  { name: "Phạm Quốc Hưng", pos: "MANAGER", branch: 0, avatar: "/avatars/nhan-su-4.png", skills: ["Điều phối ca", "Xử lý tình huống", "Đào tạo nội bộ"] },
  { name: "Trần Văn Minh", pos: "CONSULTANT", branch: 0, avatar: "/avatars/nhan-su-2.png", skills: ["Tư vấn dịch vụ", "Ghi nhận nhu cầu", "Đặt lịch"] },
  { name: "Đỗ Minh Quân", pos: "CONSULTANT", branch: 0, avatar: "/avatars/nhan-su-6.png", skills: ["Tư vấn dịch vụ", "Chăm sóc hội thoại"] },
  { name: "Hoàng Bảo Ngọc", pos: "CONSULTANT", branch: 0, skills: ["Tư vấn dịch vụ", "Đặt lịch"] },
  { name: "Vũ Phương Thảo", pos: "TECHNICIAN", branch: 0, avatar: "/avatars/nhan-su-5.png", skills: ["Kỹ thuật PMU mày", "Kỹ thuật PMU môi", "Tuân thủ quy trình"] },
  { name: "Lê Thu Hà", pos: "TECHNICIAN", branch: 0, avatar: "/avatars/nhan-su-3.png", skills: ["Kỹ thuật PMU mày", "Kỹ thuật PMU mí", "Xử lý tình huống"] },
  { name: "Bùi Khánh Linh", pos: "TECHNICIAN", branch: 0, skills: ["Kỹ thuật PMU môi", "Tuân thủ quy trình"] },
  { name: "Đặng Mai Anh", pos: "TECHNICIAN", branch: 0, skills: ["Kỹ thuật PMU mày", "Kiểm tra sau dịch vụ"] },
  { name: "Ngô Thanh Trúc", pos: "TECHNICIAN", branch: 0, skills: ["Kỹ thuật PMU mí", "Kiểm tra sau dịch vụ"] },
  { name: "Đinh Kim Yến", pos: "TECHNICIAN", branch: 0, skills: ["Kiểm tra sau dịch vụ", "Chuẩn bị phòng"] },
  { name: "Nguyễn Thị Lan", pos: "CUSTOMER_CARE", branch: 0, avatar: "/avatars/nhan-su-1.png", skills: ["Chăm sóc sau dịch vụ", "Xác nhận lịch", "Ghi nhận phản hồi"] },
  { name: "Phan Hoài Thương", pos: "CUSTOMER_CARE", branch: 0, skills: ["Chăm sóc sau dịch vụ", "Xác nhận lịch"] },
  { name: "Mai Thùy Dương", pos: "RECEPTION", branch: 0, skills: ["Đón tiếp", "Check-in", "Xác nhận lịch"] },
  { name: "Lý Ngọc Hân", pos: "RECEPTION", branch: 0, skills: ["Đón tiếp", "Check-in"] },
  { name: "Trịnh Hoàng Nam", pos: "MANAGER", branch: 1, skills: ["Điều phối ca", "Đào tạo nội bộ"] },
  { name: "Dương Thanh Huyền", pos: "CONSULTANT", branch: 1, skills: ["Tư vấn dịch vụ", "Đặt lịch"] },
  { name: "Cao Minh Châu", pos: "CONSULTANT", branch: 1, skills: ["Tư vấn dịch vụ", "Ghi nhận nhu cầu"] },
  { name: "Hồ Thị Nhung", pos: "TECHNICIAN", branch: 1, skills: ["Kỹ thuật PMU mày", "Kỹ thuật PMU môi"] },
  { name: "Kiều Phương Vy", pos: "TECHNICIAN", branch: 1, skills: ["Kỹ thuật PMU mí", "Kiểm tra sau dịch vụ"] },
  { name: "Tạ Ngọc Diệp", pos: "TECHNICIAN", branch: 1, skills: ["Kỹ thuật PMU môi", "Kiểm tra sau dịch vụ"] },
  { name: "Lương Thu Trang", pos: "CUSTOMER_CARE", branch: 1, skills: ["Chăm sóc sau dịch vụ", "Xác nhận lịch"] },
  { name: "Võ Bích Ngân", pos: "RECEPTION", branch: 1, skills: ["Đón tiếp", "Check-in", "Xác nhận lịch"] },
];

const POS_ROLE: Record<string, string> = { MANAGER: "BRANCH_MANAGER", CONSULTANT: "CONSULTANT", TECHNICIAN: "TECHNICIAN", CUSTOMER_CARE: "CUSTOMER_CARE", RECEPTION: "RECEPTION" };

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");

const INQUIRIES = [
  "Cho mình hỏi về dịch vụ phun mày bên mình với ạ.",
  "Mình muốn tìm hiểu phun môi, bên mình tư vấn giúp mình nhé.",
  "Chị muốn đặt lịch tư vấn tuần này được không em?",
  "Phun mí mất khoảng bao lâu vậy ạ?",
  "Bên mình làm việc đến mấy giờ ạ?",
  "Mình đang phân vân giữa phun mày và điêu khắc, tư vấn giúp mình.",
  "Cho chị hỏi chi phí dịch vụ phun môi.",
  "Mình được bạn giới thiệu, muốn qua tư vấn ạ.",
  "Cuối tuần bên mình có lịch trống không em?",
  "Chị muốn hỏi quy trình làm như thế nào ạ?",
];
const REPLIES = [
  "Dạ chào chị, em xin phép tư vấn ạ. Chị quan tâm dịch vụ nào và muốn qua vào thời gian nào ạ?",
  "Dạ em gửi chị thông tin dịch vụ đã được duyệt, chị có thể đặt lịch tư vấn để chuyên viên trao đổi chi tiết ạ.",
  "Dạ thời gian thực hiện tùy dịch vụ, chuyên viên sẽ tư vấn cụ thể khi chị qua ạ.",
  "Dạ chi phí phụ thuộc dịch vụ cụ thể, chuyên viên sẽ tư vấn trực tiếp cho chị ạ.",
  "Dạ em kiểm tra lịch trống rồi xác nhận lại với chị ngay ạ.",
];
const CARE_MSG_OUT = [
  "Dạ em là nhân viên chăm sóc của DOANH NGHIỆP PMU, chị có phản hồi nào cần doanh nghiệp hỗ trợ không ạ?",
  "Dạ em hỏi thăm chị sau buổi dịch vụ, chị cần hỗ trợ gì cứ nhắn em ạ.",
];
const CARE_MSG_IN = ["Mình ổn, cảm ơn em.", "Cảm ơn shop đã hỏi thăm.", "Mình hài lòng, hẹn gặp lại lịch kiểm tra.", "Ok em, có gì mình nhắn nhé.", "Cảm ơn bạn, mọi thứ ổn."];
const OPEN_INQ = [
  "Tôi muốn đặt lịch tư vấn.",
  "Mai chị qua được không em?",
  "Giá tư vấn hiện tại là bao nhiêu?",
  "Tôi muốn đổi lịch hẹn.",
  "Tôi cần gặp người phụ trách.",
  "Cho mình xin lịch trống chiều mai.",
  "Mình muốn hủy lịch tuần này.",
  "Bên mình có làm phun mí không ạ?",
];

export interface GenResult {
  ownerUserId: string;
  branchIds: string[];
}

export async function generateBusiness(
  qq: Q,
  o: { tenantId: string; now: Date; mode: "DEMO" | "REAL"; ownerUserId?: string; existingBranchId?: string; seed?: number },
): Promise<GenResult> {
  const R = rng(o.seed ?? 20261115);
  const pick = <T,>(arr: T[]) => arr[Math.floor(R() * arr.length)];
  const chance = (p: number) => R() < p;
  const between = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  const B = new Bulk();
  const tid = o.tenantId;
  const now = o.now;
  const today = vnDayKey(now);
  const at = (off: number, time: string) => vnToDate(addDays(today, off), time);
  const short = tid.slice(0, 8);
  const persona = o.mode === "DEMO";

  // ---------- Chi nhánh ----------
  const BR = [o.existingBranchId ?? uid(), uid()];
  if (!o.existingBranchId) B.add("branches", { id: BR[0], tenant_id: tid, name: "Chi nhánh Cầu Giấy", created_at: at(-120, "08:00") });
  B.add("branches", { id: BR[1], tenant_id: tid, name: "Chi nhánh Hà Đông", created_at: o.existingBranchId ? new Date() : at(-119, "08:00") });

  // ---------- Người dùng & nhân sự ----------
  let ownerId = o.ownerUserId;
  if (!ownerId) {
    ownerId = uid();
    B.add("users", { id: ownerId, tenant_id: tid, email: `chu-doanh-nghiep@${short}.demo.pmu-os`, display_name: "Chủ doanh nghiệp (demo)", is_demo_persona: persona });
    B.add("memberships", { id: uid(), tenant_id: tid, user_id: ownerId, role: "OWNER" });
  }
  if (persona) {
    const adminId = uid();
    B.add("users", { id: adminId, tenant_id: tid, email: `quan-tri@${short}.demo.pmu-os`, display_name: "Quản trị hệ thống (demo)", is_demo_persona: true });
    B.add("memberships", { id: uid(), tenant_id: tid, user_id: adminId, role: "SYSTEM_ADMIN" });
  }
  const emps = STAFF.map((s, i) => {
    const id = uid();
    const userId = uid();
    B.add("users", { id: userId, tenant_id: tid, email: `${slug(s.name)}@${short}.${persona ? "demo." : ""}pmu-os.local`, display_name: s.name, is_demo_persona: persona });
    B.add("employees", {
      id,
      tenant_id: tid,
      branch_id: BR[s.branch],
      user_id: userId,
      code: `NS${String(i + 1).padStart(2, "0")}`,
      display_name: s.name,
      position: s.pos,
      skills: s.skills,
      availability: { days: [0, 1, 2, 3, 4, 5, 6], slots: ["S", "C"] },
      work_status: "WORKING",
      contact_phone: `0123${String(500000 + i * 137).padStart(6, "0")}`,
      avatar: s.avatar ?? null,
      created_at: at(-110, "08:00"),
    });
    B.add("memberships", { id: uid(), tenant_id: tid, user_id: userId, role: POS_ROLE[s.pos], branch_ids: [BR[s.branch]], employee_id: id });
    return { ...s, id, userId, idx: i };
  });
  const byPos = (b: number, pos: string) => emps.filter((e) => e.branch === b && e.pos === pos);
  const manager = (b: number) => byPos(b, "MANAGER")[0];

  // ---------- Dịch vụ, FAQ, mẫu chăm sóc ----------
  const SV = {
    consult: { id: uid(), name: "Tư vấn PMU", min: 30 },
    brow: { id: uid(), name: "Dịch vụ PMU mày", min: 120 },
    lip: { id: uid(), name: "Dịch vụ PMU môi", min: 120 },
    eye: { id: uid(), name: "Dịch vụ PMU mí", min: 90 },
    check: { id: uid(), name: "Kiểm tra sau dịch vụ", min: 30 },
    touch: { id: uid(), name: "Dặm màu theo chỉ định", min: 60 },
  };
  for (const s of Object.values(SV)) B.add("services", { id: s.id, tenant_id: tid, name: s.name, duration_min: s.min, faq_version: "FAQ v1.3" });
  const faqs: [string, string, string, string, string[]][] = [
    ["FAQ", "FAQ-01", "Đặt lịch tư vấn", "Chào anh/chị, anh/chị muốn tư vấn vào thời gian nào? DOANH NGHIỆP PMU sẽ kiểm tra lịch trống và xác nhận lại với anh/chị.", ["đặt lịch", "lịch tư vấn", "hẹn", "qua tư vấn", "lịch trống"]],
    ["FAQ", "FAQ-02", "Đổi hoặc hủy lịch hẹn", "Anh/chị vui lòng cho biết thời gian mong muốn. Nhân sự phụ trách sẽ kiểm tra lịch trống và xác nhận lịch mới hoặc ghi nhận hủy lịch.", ["đổi lịch", "dời lịch", "hủy lịch", "hủy"]],
    ["FAQ", "FAQ-03", "Chi phí dịch vụ", "Chi phí phụ thuộc dịch vụ cụ thể và sẽ được chuyên viên tư vấn trực tiếp. Hệ thống chưa có bảng giá đã duyệt để báo giá tự động.", ["giá", "bao nhiêu", "chi phí", "phí"]],
    ["FAQ", "FAQ-04", "Tìm hiểu dịch vụ", "DOANH NGHIỆP PMU có dịch vụ PMU mày, môi, mí theo quy trình đã duyệt. Anh/chị có thể đặt lịch tư vấn để được giới thiệu chi tiết.", ["tìm hiểu", "dịch vụ", "phun", "pmu", "có làm"]],
    ["FAQ", "FAQ-05", "Thời gian thực hiện", "Thời gian thực hiện khoảng 90–120 phút tùy dịch vụ; chuyên viên sẽ thông báo cụ thể khi tư vấn.", ["bao lâu", "mất bao", "thời gian thực hiện"]],
    ["FAQ", "FAQ-06", "Giờ làm việc", "Doanh nghiệp làm việc theo ca sáng 08:00–12:00 và ca chiều 13:00–17:00, tại Chi nhánh Cầu Giấy và Chi nhánh Hà Đông.", ["mấy giờ", "giờ làm", "làm việc đến", "chi nhánh", "ở đâu"]],
    ["FAQ", "FAQ-07", "Chăm sóc sau dịch vụ", "Nhân sự chăm sóc sẽ hỏi thăm theo kế hoạch đã duyệt; câu hỏi chuyên môn được chuyển chuyên viên phụ trách.", ["sau dịch vụ", "chăm sóc", "hỏi thăm"]],
    ["POLICY", "CS-01", "Chính sách liên hệ khách", "Chỉ liên hệ chăm sóc khi khách đã đồng ý; không gửi tin trong khung giờ yên tĩnh đã cấu hình.", ["liên hệ", "đồng ý", "giờ yên tĩnh"]],
    ["POLICY", "CS-02", "Yêu cầu gặp người phụ trách", "Khi khách yêu cầu gặp người phụ trách, chuyển hội thoại cho quản lý chi nhánh hoặc chuyên viên và phản hồi trong ngày.", ["người phụ trách", "quản lý", "gặp", "khiếu nại"]],
  ];
  for (const [kind, code, title, body, kw] of faqs)
    B.add("knowledge_items", { id: uid(), tenant_id: tid, kind, code, title, body, keywords: kw, version_label: kind === "FAQ" ? "FAQ v1.3" : "Chính sách v1.0", approved_at: at(-30, "09:00") });
  const TPL = uid();
  B.add("care_templates", {
    id: TPL,
    tenant_id: tid,
    name: "Mẫu chăm sóc",
    version_label: "v1.1",
    body: "Chào {ten_khach}, DOANH NGHIỆP PMU xin hỏi thăm sau buổi dịch vụ. Anh/chị có phản hồi nào cần doanh nghiệp hỗ trợ không?",
    approved_at: at(-60, "10:00"),
  });

  // ---------- Ca làm: 12 tuần trước đến 2 tuần sau ----------
  const startDay = weekStart(addDays(today, -84));
  const endDay = addDays(weekStart(today), 13);
  const shiftMap = new Map<string, { id: string; start: Date; end: Date; status: string }[]>(); // key empId:day
  const days: string[] = [];
  for (let d = startDay; d <= endDay; d = addDays(d, 1)) days.push(d);
  const nextWeek = addDays(weekStart(today), 7);
  for (const day of days) {
    const dayIdx = days.indexOf(day);
    for (const b of [0, 1]) {
      const list = emps.filter((e) => e.branch === b);
      const working = list.filter((e) => (e.idx + Math.floor(dayIdx / 7)) % 7 !== dowOfDay(day) % 7);
      // xen kẽ kỹ thuật viên để mỗi ca có KTV
      const techs = working.filter((e) => e.pos === "TECHNICIAN");
      const others = working.filter((e) => e.pos !== "TECHNICIAN");
      const ordered: typeof working = [];
      while (techs.length || others.length) {
        if (techs.length) ordered.push(techs.shift()!);
        if (others.length) ordered.push(others.shift()!);
      }
      ordered.forEach((e, k) => {
        const slot = (k + dayIdx) % 2 === 0 ? "S" : "C";
        const [a, z] = slot === "S" ? ["08:00", "12:00"] : ["13:00", "17:00"];
        const id = uid();
        const start = vnToDate(day, a);
        const end = vnToDate(day, z);
        B.add("shifts", { id, tenant_id: tid, branch_id: BR[b], employee_id: e.id, start_at: start, end_at: end, status: "APPROVED", approved_by: manager(b).userId, created_at: vnToDate(addDays(day, -7), "10:00") });
        shiftMap.set(`${e.id}:${day}`, [{ id, start, end, status: "APPROVED" }]);
      });
    }
  }
  // Bất thường tuần sau (chi nhánh 1): một ca bổ sung chưa duyệt bị trùng, một ca chiều thiếu người
  const wed = addDays(nextWeek, 2);
  const minh = emps[1];
  const minhShift = shiftMap.get(`${minh.id}:${wed}`);
  if (minhShift && vnParts(minhShift[0].start).hh === 8) {
    const id = uid();
    B.add("shifts", { id, tenant_id: tid, branch_id: BR[0], employee_id: minh.id, start_at: vnToDate(wed, "11:00"), end_at: vnToDate(wed, "14:00"), status: "DRAFT", note: "Ca bổ sung do nhân sự đăng ký, chưa duyệt", created_at: at(-1, "16:00") });
  } else if (minhShift) {
    const id = uid();
    B.add("shifts", { id, tenant_id: tid, branch_id: BR[0], employee_id: minh.id, start_at: vnToDate(wed, "15:00"), end_at: vnToDate(wed, "19:00"), status: "DRAFT", note: "Ca bổ sung do nhân sự đăng ký, chưa duyệt", created_at: at(-1, "16:00") });
  }
  const fri = addDays(nextWeek, 4);
  const friC = B.rows.get("shifts")!.filter((s: any) => s.branch_id === BR[0] && vnDayKey(s.start_at) === fri && vnParts(s.start_at as Date).hh === 13);
  friC.slice(2).forEach((s: any) => {
    s.start_at = vnToDate(fri, "08:00");
    s.end_at = vnToDate(fri, "12:00");
    const m = shiftMap.get(`${s.employee_id}:${fri}`);
    if (m) (m[0].start = s.start_at), (m[0].end = s.end_at);
  });
  const leaveEmp = emps[8];
  const leaveDay = addDays(nextWeek, 1);
  B.add("leaves", { id: uid(), tenant_id: tid, employee_id: leaveEmp.id, start_at: vnToDate(leaveDay, "00:00"), end_at: vnToDate(addDays(leaveDay, 1), "00:00"), reason: "Nghỉ phép đã duyệt" });
  const lv = shiftMap.get(`${leaveEmp.id}:${leaveDay}`);
  if (lv) {
    const row = B.rows.get("shifts")!.find((s: any) => s.id === lv[0].id)!;
    row.status = "CANCELLED";
    shiftMap.delete(`${leaveEmp.id}:${leaveDay}`);
  }

  // ---------- Đặt lịch theo ca ----------
  const busy = new Map<string, [number, number][]>(); // empId:day -> intervals
  function book(b: number, pos: string, day: string, min: number, prefer?: string): { emp: (typeof emps)[number]; start: Date; end: Date } | null {
    const cands = byPos(b, pos).sort(() => R() - 0.5);
    if (prefer) cands.sort((x) => (x.id === prefer ? -1 : 1));
    for (const e of cands) {
      const sh = shiftMap.get(`${e.id}:${day}`);
      if (!sh) continue;
      const s0 = sh[0].start.getTime();
      const s1 = sh[0].end.getTime();
      const used = busy.get(`${e.id}:${day}`) ?? [];
      const offs = [0, 30, 60, 90, 120, 150, 180].map((m) => s0 + m * 60000).sort(() => R() - 0.5);
      for (const st of offs) {
        const en = st + min * 60000;
        if (en > s1) continue;
        if (used.some(([a, z]) => st < z && a < en)) continue;
        used.push([st, en]);
        busy.set(`${e.id}:${day}`, used);
        return { emp: e, start: new Date(st), end: new Date(en) };
      }
    }
    return null;
  }

  // ---------- Khách hàng & hành trình ----------
  const N = 560;
  const usedPhones = new Set<string>();
  let apptN = 0;
  const custs: any[] = [];
  const nowMs = now.getTime();
  const tomorrow = addDays(today, 1);
  const faceSet = [
    { avatar: "/avatars/khach-a.png", male: false },
    { avatar: "/avatars/khach-b.png", male: true },
    { avatar: "/avatars/khach-c.png", male: false },
    { avatar: "/avatars/khach-d.png", male: true },
    { avatar: "/avatars/khach-e.png", male: false },
    { avatar: "/avatars/khach-f.png", male: true },
  ];
  const cevent = (c: any, type: string, title: string, body: string, when: Date, empId: string | null, status: string | null = null, refId: string | null = null) =>
    B.add("customer_events", { id: uid(), tenant_id: tid, customer_id: c.id, type, title, body, employee_id: empId, status_label: status, ref_type: refId ? "appointment" : null, ref_id: refId, occurred_at: when });

  const makeAppt = (c: any, sv: { id: string; name: string; min: number }, day: string, pos: string, createdAt: Date, prefer?: string) => {
    for (let k = 0; k < 4; k++) {
      const d = addDays(day, k);
      if (d > addDays(today, 13)) return null;
      const slot = book(c.b, pos, d, sv.min, prefer);
      if (!slot) continue;
      const start = slot.start;
      const past = start.getTime() + sv.min * 60000 <= nowMs;
      let status = "CONFIRMED";
      let cancel: string | null = null;
      if (past) {
        const r = R();
        status = r < 0.86 ? "COMPLETED" : r < 0.94 ? "CANCELLED" : "NO_SHOW";
        if (status === "CANCELLED") cancel = pick(["Khách báo bận", "Khách đổi kế hoạch", "Khách xin dời sang tháng sau"]);
      } else status = vnDayKey(start) === tomorrow ? (chance(0.35) ? "PENDING" : "CONFIRMED") : chance(0.3) ? "PENDING" : "CONFIRMED";
      apptN++;
      const id = uid();
      const created = new Date(Math.min(createdAt.getTime(), start.getTime() - 3600000));
      B.add("appointments", {
        id,
        tenant_id: tid,
        branch_id: BR[c.b],
        code: `LH${String(apptN).padStart(4, "0")}`,
        customer_id: c.id,
        service_id: sv.id,
        employee_id: slot.emp.id,
        start_at: start,
        end_at: slot.end,
        status,
        cancel_reason: cancel,
        created_by: pick(byPos(c.b, "RECEPTION")).userId,
        confirmed_at: ["CONFIRMED", "COMPLETED"].includes(status) ? new Date(created.getTime() + 3600000) : null,
        created_at: created,
      });
      cevent(c, "BOOKING", "Đặt lịch", `${sv.name} ${vnParts(start).hh.toString().padStart(2, "0")}:${vnParts(start).mm.toString().padStart(2, "0")} ngày ${d.split("-").reverse().join("/")} với ${slot.emp.name}.`, created, c.assigned, status === "PENDING" ? "Chờ xác nhận" : status === "CANCELLED" ? "Đã hủy" : "Đã xác nhận", id);
      return { id, start, end: slot.end, status, emp: slot.emp, sv };
    }
    return null;
  };

  for (let i = 0; i < N; i++) {
    const face = i < 6 ? faceSet[i] : null;
    const male = face ? face.male : chance(0.14);
    const name = male ? `${pick(HO)} ${pick(DEM_NAM)} ${pick(TEN_NAM)}` : `${pick(HO)} ${pick(DEM_NU)} ${pick(TEN_NU)}`;
    let phone = "";
    do phone = `0123${String(between(100000, 999999))}`;
    while (usedPhones.has(phone));
    usedPhones.add(phone);
    const b = i < 6 ? 0 : chance(0.64) ? 0 : 1;
    const first = i < 6 ? between(-20, -2) : chance(0.12) ? between(-3, 0) : between(-95, -1);
    const firstAt = at(first, `${String(between(8, 20)).padStart(2, "0")}:${pick(["05", "12", "24", "37", "46", "58"])}`);
    const consultant = pick(byPos(b, "CONSULTANT"));
    const care = pick(byPos(b, "CUSTOMER_CARE"));
    const c: any = { id: uid(), b, name, phone, first, firstAt, consultant, care, assigned: consultant.id, appts: [] as any[], stage: 1, events: 0 };
    custs.push(c);
    // Tin nhắn đầu tiên + phản hồi
    const conv = { id: uid(), msgs: [] as any[] };
    c.conv = conv;
    conv.msgs.push({ dir: "IN", body: pick(INQUIRIES), at: firstAt });
    const replyAt = new Date(firstAt.getTime() + between(4, 55) * 60000);
    if (replyAt.getTime() < nowMs) conv.msgs.push({ dir: "OUT", body: pick(REPLIES), at: replyAt, by: consultant });
    cevent(c, "MESSAGE", "Khách nhắn tin", conv.msgs[0].body, firstAt, null);
    if (replyAt.getTime() < nowMs) cevent(c, "CONSULT", "Tư vấn qua tin nhắn", `${consultant.name} trả lời và giới thiệu dịch vụ phù hợp.`, replyAt, consultant.id, "Tư vấn dịch vụ");
    // Hành trình
    const wantConsult = i < 6 || chance(0.72);
    if (!wantConsult) continue;
    const cDay = addDays(today, first + between(1, 5));
    const consult = makeAppt(c, SV.consult, cDay, "CONSULTANT", replyAt, consultant.id);
    if (!consult) continue;
    c.appts.push(consult);
    c.stage = 3;
    if (consult.status !== "COMPLETED") {
      if (["CANCELLED", "NO_SHOW"].includes(consult.status)) c.stage = 2;
      continue;
    }
    c.stage = 2;
    cevent(c, "CONSULT", "Tư vấn tại chi nhánh", `${consult.emp.name} tư vấn chi tiết, khách ${chance(0.6) ? "quan tâm và muốn đặt lịch dịch vụ" : "cần thêm thời gian cân nhắc"}.`, consult.end, consult.emp.id, "Tư vấn dịch vụ");
    if (!chance(0.62)) continue;
    const svc = pick([SV.brow, SV.brow, SV.lip, SV.lip, SV.eye]);
    const sDay = addDays(vnDayKey(consult.start), between(0, 10));
    const service = makeAppt(c, svc, sDay, "TECHNICIAN", consult.end);
    if (!service) continue;
    c.appts.push(service);
    c.stage = 3;
    if (service.status !== "COMPLETED") {
      if (["CANCELLED", "NO_SHOW"].includes(service.status)) c.stage = 2;
      continue;
    }
    c.stage = nowMs - service.end.getTime() < 3 * 86400000 ? 5 : 6;
    c.assigned = care.id;
    c.service = service;
    cevent(c, "SERVICE", "Sử dụng dịch vụ", `${svc.name}, ${service.emp.name} thực hiện theo quy trình đã duyệt.`, service.end, service.emp.id, "Hoàn thành");
    // Kiểm tra / dặm theo chỉ định
    const chkDay = addDays(vnDayKey(service.start), between(28, 35));
    if (chkDay <= addDays(today, 10) && chance(0.7)) {
      const chk = makeAppt(c, chance(0.6) ? SV.check : SV.touch, chkDay, "TECHNICIAN", new Date(service.end.getTime() + 86400000 * 3), service.emp.id);
      if (chk) {
        c.appts.push(chk);
        c.stage = 7;
        if (chk.status === "COMPLETED") cevent(c, "VISIT", "Kiểm tra theo chỉ định", `${chk.emp.name} thực hiện ${chk.sv.name.toLowerCase()} theo chỉ định đã xác nhận.`, chk.end, chk.emp.id, "Hoàn thành");
        if (chk.status === "COMPLETED" && chance(0.25)) c.stage = 8;
      }
    }
  }

  // ---------- Ghi khách hàng, đồng ý, hội thoại, phản hồi, chăm sóc ----------
  const care_owner_rr: Record<number, number> = { 0: 0, 1: 0 };
  let custN = 0;
  let openConvs = 0;
  let forcedOpen = 0;
  for (const c of custs) {
    custN++;
    const future = c.appts.filter((a: any) => a.start.getTime() > nowMs && ["PENDING", "CONFIRMED"].includes(a.status));
    const lastIn = c.conv.msgs[c.conv.msgs.length - 1];
    let readiness = "COLD";
    let reason = "Mới hỏi thông tin, chưa nêu nhu cầu cụ thể.";
    if (future.length) {
      readiness = "WARM";
      reason = `Đã có lịch ${future[0].sv.name.toLowerCase()} sắp tới (${future[0].status === "PENDING" ? "chờ xác nhận" : "đã xác nhận"}).`;
    }
    if (c.stage === 2) {
      readiness = chance(0.5) ? "HOT" : "WARM";
      reason = readiness === "HOT" ? "Đã tư vấn tại chi nhánh, khách muốn đặt lịch dịch vụ sớm." : "Đã tư vấn, đang cân nhắc dịch vụ.";
    }
    if (c.stage >= 6) {
      readiness = c.stage === 8 ? "HOT" : "WARM";
      reason = c.stage === 8 ? "Đã quay lại sau kiểm tra, phản hồi tích cực." : "Đã sử dụng dịch vụ, đang trong kế hoạch chăm sóc.";
    }
    const aiPending = c.first >= -2 && c.stage <= 2;
    if (aiPending) {
      readiness = "HOT";
      reason = `Khách chủ động nhắn gần đây: “${lastIn.body}”.`;
    }
    const i = custN - 1;
    B.add("customers", {
      id: c.id,
      tenant_id: tid,
      branch_id: BR[c.b],
      code: `KH${String(custN).padStart(4, "0")}`,
      display_name: c.name,
      contact_phone: c.phone,
      contact_norm: c.phone,
      source: pick(["Facebook", "Zalo", "TikTok", "Giới thiệu", "Khách vãng lai", "Facebook", "Zalo"]),
      segment: c.stage >= 6 ? "Khách đã sử dụng dịch vụ" : c.stage >= 2 ? "Đang tư vấn" : "Khách tiềm năng",
      avatar: i < 6 ? faceSet[i].avatar : null,
      assigned_to: c.assigned,
      readiness,
      readiness_reason: reason,
      readiness_by: aiPending ? "AI" : c.consultant.userId,
      readiness_at: aiPending ? new Date(nowMs - 3600000) : c.firstAt,
      readiness_confirmed: !aiPending,
      lifecycle_stage: c.stage,
      next_followup_at: future[0]?.start ?? at(between(1, 10), "09:00"),
      created_at: c.firstAt,
    });
    if (chance(0.3))
      B.add("customer_notes", {
        id: uid(),
        tenant_id: tid,
        customer_id: c.id,
        author_id: c.consultant.userId,
        author_label: c.consultant.name,
        body: pick(["Khách thích lịch buổi sáng.", "Khách muốn được nhắc lịch qua Zalo.", "Khách quan tâm dịch vụ mày, cần tư vấn kỹ quy trình.", "Khách được bạn giới thiệu.", "Khách hỏi kỹ về thời gian thực hiện."]),
        created_at: new Date(c.firstAt.getTime() + 7200000),
      });
    // Đồng ý liên hệ
    const hasVisit = c.appts.some((a: any) => a.status === "COMPLETED");
    if (hasVisit || chance(0.5)) {
      const st = chance(0.94) ? "GRANTED" : "DENIED";
      B.add("consents", { id: uid(), tenant_id: tid, customer_id: c.id, channel: "ZALO", purpose: "CARE", status: st, source: hasVisit ? "Phiếu đồng ý tại quầy" : "Khách xác nhận qua tin nhắn", recorded_by: c.consultant.userId, recorded_at: c.firstAt });
      if (chance(0.4)) B.add("consents", { id: uid(), tenant_id: tid, customer_id: c.id, channel: "ZALO", purpose: "MARKETING", status: chance(0.6) ? "GRANTED" : "DENIED", source: "Phiếu đồng ý tại quầy", recorded_by: c.consultant.userId, recorded_at: c.firstAt });
      c.consent = st === "GRANTED";
    }
    // Chăm sóc sau dịch vụ
    if (c.service) {
      const sv = c.service;
      const owner = byPos(c.b, "CUSTOMER_CARE")[care_owner_rr[c.b]++ % byPos(c.b, "CUSTOMER_CARE").length];
      const pid = uid();
      B.add("care_plans", { id: pid, tenant_id: tid, customer_id: c.id, appointment_id: sv.id, template_id: TPL, owner_id: owner.id, status: "ACTIVE", created_at: sv.end });
      const steps: [string, number][] = [
        ["Hỏi thăm sau 1 ngày", 1],
        ["Theo dõi phản hồi sau 3 ngày", 3],
        ["Hỏi thăm sau 7 ngày", 7],
      ];
      if (c.appts.length > 2) steps.push(["Nhắc lịch kiểm tra theo chỉ định", 25]);
      for (const [title, d] of steps) {
        const due = vnToDate(addDays(vnDayKey(sv.start), d), "10:00");
        const past = due.getTime() < nowMs;
        const age = (nowMs - due.getTime()) / 86400000;
        let status = "PLANNED";
        let contacted: Date | null = null;
        if (past) {
          if (age > 2 || chance(0.6)) {
            status = chance(0.9) ? "DONE" : "WAITING_REPLY";
            contacted = new Date(due.getTime() + between(-60, 240) * 60000);
          } else status = "TO_CONTACT";
        }
        const tpid = uid();
        B.add("care_touchpoints", {
          id: tpid,
          tenant_id: tid,
          plan_id: pid,
          customer_id: c.id,
          title,
          due_at: due,
          owner_id: owner.id,
          status,
          template_id: TPL,
          template_version: "v1.1",
          note: status === "DONE" ? pick(["Khách phản hồi ổn", "Đã gọi hỏi thăm", "Khách hài lòng", "Khách hẹn liên hệ lại nếu cần"]) : null,
          contacted_at: contacted,
          created_at: sv.end,
        });
        if (status === "PLANNED")
          B.add("jobs", { id: uid(), tenant_id: tid, type: "CARE_TOUCHPOINT", ref_type: "care_touchpoint", ref_id: tpid, run_at: due, status: "SCHEDULED", dedupe_key: `care:${tpid}` });
        if (status === "TO_CONTACT")
          B.add("jobs", { id: uid(), tenant_id: tid, type: "CARE_TOUCHPOINT", ref_type: "care_touchpoint", ref_id: tpid, run_at: due, status: "BLOCKED", result: "Chưa gửi: Zalo chưa kết nối. Cần liên hệ thủ công hoặc gửi phê duyệt.", attempts: 1, dedupe_key: `care:${tpid}` });
        if (status === "DONE" && contacted) {
          cevent(c, "CARE", "Chăm sóc", `${title}: đã liên hệ.`, contacted, owner.id, "Đã hoàn thành");
          if (chance(0.5)) {
            c.conv.msgs.push({ dir: "OUT", body: pick(CARE_MSG_OUT), at: contacted, by: owner });
            c.conv.msgs.push({ dir: "IN", body: pick(CARE_MSG_IN), at: new Date(contacted.getTime() + between(10, 300) * 60000) });
          }
        }
      }
      // Phản hồi khách
      if (chance(0.72)) {
        const r = R();
        const rating = r < 0.55 ? "VERY_GOOD" : r < 0.9 ? "GOOD" : r < 0.98 ? "NEUTRAL" : "BAD";
        const recent = (nowMs - sv.end.getTime()) / 86400000 < 6;
        let needs = rating === "BAD" || (rating === "NEUTRAL" && chance(0.5));
        if (recent && forcedOpen < 2) {
          needs = true;
          forcedOpen++;
        }
        B.add("feedback", {
          id: uid(),
          tenant_id: tid,
          customer_id: c.id,
          appointment_id: sv.id,
          category: needs ? "Yêu cầu trao đổi" : "Trải nghiệm dịch vụ",
          severity: needs ? "MEDIUM" : "LOW",
          rating: needs && rating !== "BAD" ? "NEUTRAL" : rating,
          body: needs ? pick(["Tôi cần gặp người phụ trách để trao đổi thêm.", "Mình muốn được tư vấn lại về màu sau dịch vụ.", "Mình chưa hài lòng về thời gian chờ."]) : pick(["Nhân viên hướng dẫn rõ ràng.", "Hài lòng với cách đón tiếp.", "Đúng giờ, quy trình gọn.", "Không gian sạch sẽ."]),
          needs_specialist: needs,
          status: needs && recent ? "OPEN" : "RESOLVED",
          biz_created_at: new Date(sv.end.getTime() + between(1, 3) * 86400000),
        });
      }
    }
    // Tin mở trong 2 ngày gần đây
    let status = "DONE";
    if (c.first >= -1 || (chance(0.04) && openConvs < 18)) {
      const t = new Date(nowMs - between(20, 1500) * 60000);
      c.conv.msgs.push({ dir: "IN", body: pick(OPEN_INQ), at: t });
      status = chance(0.55) ? "NEW" : "OPEN";
      openConvs++;
    } else if (future.length) status = "OPEN";
    c.convStatus = status;
    c.conv.msgs.sort((x: any, y: any) => x.at - y.at);
    const msgs = c.conv.msgs.filter((m: any) => m.at.getTime() <= nowMs);
    B.add("conversations", {
      id: c.conv.id,
      tenant_id: tid,
      branch_id: BR[c.b],
      channel: "ZALO",
      external_id: `demo-${c.id.slice(0, 8)}`,
      customer_id: c.id,
      assigned_to: c.assigned,
      status,
      follow_up: status !== "DONE" && chance(0.3),
      last_message_at: msgs[msgs.length - 1]?.at ?? c.firstAt,
      created_at: c.firstAt,
    });
    msgs.forEach((m: any, k: number) =>
      B.add("messages", {
        id: uid(),
        tenant_id: tid,
        conversation_id: c.conv.id,
        direction: m.dir,
        body: m.body,
        delivery_status: m.dir === "IN" ? "received" : "recorded",
        author_id: m.by?.userId ?? null,
        author_label: m.dir === "IN" ? c.name : m.by?.name,
        external_event_id: m.dir === "IN" ? `demo-${c.conv.id.slice(0, 8)}-${k}` : null,
        sent_at: m.at,
      }),
    );
  }

  // Nhắc lịch cho lịch hẹn sắp tới (24h & 2h)
  for (const a of B.rows.get("appointments")! as any[]) {
    if (!["PENDING", "CONFIRMED"].includes(a.status) || a.start_at.getTime() < nowMs || a.start_at.getTime() > nowMs + 8 * 86400000) continue;
    for (const h of [24, 2]) {
      const runAt = new Date(a.start_at.getTime() - h * 3600000);
      const past = runAt.getTime() <= nowMs;
      B.add("jobs", {
        id: uid(),
        tenant_id: tid,
        type: "APPT_REMINDER",
        ref_type: "appointment",
        ref_id: a.id,
        run_at: runAt,
        status: past ? "BLOCKED" : "SCHEDULED",
        result: past ? "Chưa gửi: Zalo chưa kết nối. Cần nhắc thủ công." : null,
        attempts: past ? 1 : 0,
        dedupe_key: `appt:${a.id}:${a.start_at.toISOString()}:${h}h`,
      });
    }
  }

  // ---------- Công việc hằng ngày ----------
  let taskN = 0;
  const addTask = (t: { title: string; owner: (typeof emps)[number]; created: Date; due: Date; status: string; done?: Date | null; cust?: string | null; checklist: string[]; priority?: string; desc?: string; partial?: number }) => {
    taskN++;
    const id = uid();
    const mgr = manager(t.owner.branch);
    B.add("tasks", {
      id,
      tenant_id: tid,
      branch_id: BR[t.owner.branch],
      code: `CV${String(taskN).padStart(4, "0")}`,
      title: t.title,
      description: t.desc ?? null,
      owner_id: t.owner.id,
      created_by: mgr.userId,
      customer_id: t.cust ?? null,
      due_at: t.due,
      priority: t.priority ?? "MEDIUM",
      status: t.status,
      accepted_at: t.status === "TODO" ? null : new Date(t.created.getTime() + 15 * 60000),
      submitted_at: t.done ? new Date(t.done.getTime() - 5 * 60000) : t.status === "SUBMITTED" ? new Date(nowMs - 3600000) : null,
      completed_at: t.done ?? null,
      approved_by: t.done ? mgr.userId : null,
      biz_created_at: t.created,
      created_at: t.created,
    });
    t.checklist.forEach((title, k) => {
      const isDone = t.status === "DONE" || t.status === "SUBMITTED" || (t.partial !== undefined && k < t.partial);
      B.add("checklist_items", { id: uid(), tenant_id: tid, task_id: id, title, required: true, position: k, done_at: isDone ? (t.done ?? new Date(t.created.getTime() + (k + 1) * 40 * 60000)) : null, done_by: isDone ? t.owner.userId : null });
    });
    B.add("task_events", { id: uid(), tenant_id: tid, task_id: id, actor_id: mgr.userId, actor_label: mgr.name, type: "CREATED", payload: {}, occurred_at: t.created });
    if (t.done) B.add("task_events", { id: uid(), tenant_id: tid, task_id: id, actor_id: mgr.userId, actor_label: mgr.name, type: "APPROVED", payload: {}, occurred_at: t.done });
    return id;
  };
  for (let off = -84; off <= 1; off++) {
    const day = addDays(today, off);
    for (const b of [0, 1]) {
      const templates: [string, string, string[], string, string][] = [
        ["TECHNICIAN", "Chuẩn bị phòng dịch vụ ca sáng", ["Vệ sinh khu vực", "Kiểm tra dụng cụ", "Ghi nhận checklist"], "07:40", "08:30"],
        ["CUSTOMER_CARE", "Xác nhận lịch hẹn ngày mai", ["Xem lịch", "Liên hệ khách", "Cập nhật xác nhận"], "08:00", "17:00"],
        ["RECEPTION", "Kiểm tra checklist đón khách", ["Quầy lễ tân", "Sổ hẹn", "Khu chờ"], "08:00", "09:00"],
      ];
      if (off % 2 === 0) templates.push(["CONSULTANT", "Tổng hợp nhu cầu khách mới", ["Đọc hội thoại mới", "Ghi nhận nhu cầu", "Cập nhật hồ sơ"], "09:00", "16:00"]);
      if (dowOfDay(day) === 5) templates.push(["MANAGER", "Rà soát phản hồi khách trong tuần", ["Đọc phản hồi", "Phân công xử lý"], "09:00", "17:00"]);
      if (dowOfDay(day) === 1) templates.push(["TECHNICIAN", "Kiểm tra khu làm việc đầu tuần", ["Vệ sinh", "Kiểm tra thiết bị", "Báo thiếu hụt"], "08:00", "11:00"]);
      for (const [pos, title, checklist, cAt, dAt] of templates) {
        const owner = pick(byPos(b, pos));
        const created = vnToDate(addDays(day, -1), "16:00");
        const due = vnToDate(day, dAt);
        let status = "DONE";
        let done: Date | null = new Date(due.getTime() - between(-50, 120) * 60000);
        if (done.getTime() < created.getTime()) done = new Date(created.getTime() + 3600000);
        if (due.getTime() > nowMs || done.getTime() > nowMs) {
          status = due.getTime() > nowMs ? (chance(0.5) ? "TODO" : "IN_PROGRESS") : "IN_PROGRESS";
          done = null;
        }
        if (status === "DONE" && chance(0.02)) {
          status = "CANCELLED";
          done = null;
        }
        addTask({ title: `${title}${b === 1 ? " (Hà Đông)" : ""}`, owner, created, due, status, done, checklist, partial: status === "IN_PROGRESS" ? 1 : undefined, desc: cAt ? undefined : undefined });
      }
    }
  }
  // Việc nổi bật hôm nay
  const lan = emps[10];
  const pendingTomorrow = (B.rows.get("appointments")! as any[]).filter((a) => vnDayKey(a.start_at) === tomorrow && a.status === "PENDING" && a.branch_id === BR[0]);
  addTask({ title: "Gọi xác nhận lịch khách chưa phản hồi ngày mai", owner: lan, created: at(0, "08:00"), due: new Date(Math.min(nowMs - 30 * 60000, at(0, "17:00").getTime())), status: "IN_PROGRESS", checklist: ["Xem danh sách lịch chờ", "Gọi từng khách", "Cập nhật xác nhận"], partial: 2, priority: "HIGH", desc: `Có ${pendingTomorrow.length} lịch ngày mai còn chờ xác nhận; nhắc tự động bị chặn vì Zalo chưa kết nối.` });
  addTask({ title: "Học và thực hành SOP tiếp nhận khách mới", owner: emps[13], created: at(-1, "08:30"), due: at(1, "17:00"), status: "IN_PROGRESS", checklist: ["Đọc SOP v1.2", "Làm bài kiểm tra", "Thực hành cùng quản lý"], partial: 1 });
  addTask({ title: "Liên hệ lại khách hủy lịch tuần trước", owner: emps[2], created: at(-1, "09:00"), due: at(1, "12:00"), status: "SUBMITTED", checklist: ["Lọc khách hủy lịch", "Liên hệ khách", "Ghi nhận lý do"] });
  addTask({ title: "Bổ sung ảnh checklist phòng dịch vụ", owner: emps[6], created: at(-2, "09:00"), due: at(-1, "17:00"), status: "IN_PROGRESS", checklist: ["Chụp checklist", "Tải lên hồ sơ"], partial: 1, priority: "HIGH" });
  addTask({ title: "Chuẩn bị tài liệu đào tạo tư vấn mới", owner: emps[14], created: at(-1, "10:00"), due: at(2, "17:00"), status: "TODO", checklist: ["Rà SOP tư vấn", "Soạn câu hỏi kiểm tra"] });

  // ---------- SOP & đào tạo ----------
  const sop = (title: string, cat: string, owner: (typeof emps)[number], versions: { label: string; status: string; sections: any[]; quiz: any[]; eff?: number }[]) => {
    const did = uid();
    B.add("sop_documents", { id: did, tenant_id: tid, title, category: cat, owner_id: owner.id, created_at: at(-100, "09:00") });
    return versions.map((v, k) => {
      const vid = uid();
      B.add("sop_versions", { id: vid, tenant_id: tid, document_id: did, version_label: v.label, content: { sections: v.sections, quiz: v.quiz }, status: v.status, approved_by: ["PUBLISHED", "ARCHIVED"].includes(v.status) ? ownerId : null, effective_at: v.eff !== undefined ? at(v.eff, "10:00") : null, created_by: owner.userId, created_at: at(-100 + k * 30, "09:00") });
      return { vid, did, ...v };
    });
  };
  const tiepNhan = (ver: string) => ({
    sections: [
      { id: "1", heading: "Mục đích", body: "Hướng dẫn nhân sự thực hiện thống nhất quy trình tiếp nhận khách mới tại chi nhánh, đảm bảo trải nghiệm chuyên nghiệp và thông tin đầy đủ." },
      {
        id: "2",
        heading: "Quy trình thực hiện",
        body: "Quy trình tiếp nhận khách mới gồm 3 bước.",
        steps: [
          { title: "Chào đón và giới thiệu", body: "Chào đón khách, giới thiệu ngắn gọn về chi nhánh và người hỗ trợ ban đầu." },
          { title: "Ghi nhận nhu cầu", body: "Lắng nghe và ghi nhận nhu cầu, mong muốn của khách một cách đầy đủ, rõ ràng vào hồ sơ." },
          { title: "Xác nhận lịch hẹn", body: "Trao đổi thời gian phù hợp, xác nhận lịch hẹn và thông tin nhắc hẹn cho khách." },
        ],
      },
      { id: "3", heading: "Lưu ý", body: "Không tư vấn chuyên môn ngoài phạm vi được duyệt. Câu hỏi chuyên môn chuyển cho chuyên viên phụ trách. Chỉ liên hệ lại khi khách đã đồng ý." },
    ],
    quiz: [
      { q: "Quy trình tiếp nhận khách mới gồm mấy bước?", options: ["2 bước", "3 bước", "5 bước"], answer: 1 },
      { q: "Bước nào ghi nhận mong muốn của khách vào hồ sơ?", options: ["Chào đón và giới thiệu", "Ghi nhận nhu cầu", "Xác nhận lịch hẹn"], answer: 1 },
      { q: "Khi khách hỏi câu hỏi chuyên môn ngoài phạm vi, nhân sự cần làm gì?", options: ["Tự trả lời theo kinh nghiệm", "Chuyển cho chuyên viên phụ trách", "Bỏ qua câu hỏi"], answer: 1 },
    ],
    v: ver,
  });
  const tn = sop("Tiếp nhận khách mới", "Lễ tân & tư vấn", manager(0), [
    { label: "1.1", status: "ARCHIVED", ...tiepNhan("1.1"), eff: -90 },
    { label: "1.2", status: "PUBLISHED", ...tiepNhan("1.2"), eff: -1 },
  ]);
  const xn = sop("Xác nhận và nhắc lịch hẹn", "Chăm sóc", lan, [
    {
      label: "1.1",
      status: "PUBLISHED",
      eff: -40,
      sections: [
        { id: "1", heading: "Mục đích", body: "Đảm bảo lịch hẹn được xác nhận trước ngày hẹn và khách nhận đủ thông tin." },
        {
          id: "2",
          heading: "Các bước xác nhận lịch",
          body: "Xác nhận lịch hẹn gồm 3 bước.",
          steps: [
            { title: "Lọc lịch ngày mai", body: "Lọc danh sách lịch hẹn ngày mai đang chờ xác nhận." },
            { title: "Liên hệ khách", body: "Liên hệ khách theo kênh khách đã đồng ý, ngoài giờ yên tĩnh." },
            { title: "Cập nhật trạng thái", body: "Cập nhật Đã xác nhận, đổi lịch hoặc hủy kèm lý do trên hệ thống." },
          ],
        },
      ],
      quiz: [
        { q: "Khi nào được liên hệ nhắc lịch?", options: ["Bất kỳ lúc nào", "Khi khách đã đồng ý và ngoài giờ yên tĩnh", "Chỉ buổi tối"], answer: 1 },
        { q: "Khách hủy lịch thì cần làm gì?", options: ["Xóa lịch", "Cập nhật hủy kèm lý do", "Không cần làm gì"], answer: 1 },
      ],
    },
  ]);
  sop("Chuẩn bị phòng dịch vụ", "Kỹ thuật", emps[4], [
    {
      label: "2.0",
      status: "PUBLISHED",
      eff: -55,
      sections: [
        { id: "1", heading: "Mục đích", body: "Chuẩn hóa việc chuẩn bị khu làm việc trước mỗi ca." },
        {
          id: "2",
          heading: "Checklist đầu ca",
          body: "Chuẩn bị phòng gồm 3 bước.",
          steps: [
            { title: "Vệ sinh khu vực", body: "Vệ sinh bề mặt làm việc và khu chờ theo checklist." },
            { title: "Kiểm tra dụng cụ", body: "Kiểm tra dụng cụ theo danh mục đã duyệt, báo quản lý khi thiếu." },
            { title: "Ghi nhận checklist", body: "Đánh dấu checklist trên hệ thống trước giờ đón khách đầu tiên." },
          ],
        },
      ],
      quiz: [{ q: "Thiếu dụng cụ đầu ca thì làm gì?", options: ["Tự mua", "Báo quản lý", "Bỏ qua"], answer: 1 }],
    },
  ]);
  sop("Tiếp nhận phản hồi khách hàng", "Chăm sóc", manager(1), [
    {
      label: "1.0",
      status: "PUBLISHED",
      eff: -20,
      sections: [
        { id: "1", heading: "Mục đích", body: "Ghi nhận và chuyển phản hồi đúng người có thẩm quyền." },
        { id: "2", heading: "Quy tắc xử lý", body: "Phản hồi cần chuyên môn hoặc khiếu nại phải chuyển quản lý chi nhánh hoặc chuyên viên trong ngày. Nhân sự không cam kết kết quả thay chuyên viên." },
      ],
      quiz: [{ q: "Phản hồi cần chuyên môn chuyển cho ai?", options: ["Lễ tân", "Quản lý chi nhánh hoặc chuyên viên", "Không cần chuyển"], answer: 1 }],
    },
  ]);
  const tv = sop("Quy trình tư vấn khách", "Tư vấn", emps[1], [
    {
      label: "1.0",
      status: "PENDING_APPROVAL",
      sections: [
        { id: "1", heading: "Mục đích", body: "Thống nhất cách tư vấn khách để khách hiểu đúng dịch vụ và tự quyết định." },
        {
          id: "2",
          heading: "Các bước tư vấn",
          body: "Tư vấn gồm 3 bước.",
          steps: [
            { title: "Lắng nghe nhu cầu", body: "Đặt câu hỏi mở, ghi nhận mong muốn của khách." },
            { title: "Giới thiệu dịch vụ đã duyệt", body: "Chỉ dùng thông tin dịch vụ, FAQ và chính sách đã được duyệt." },
            { title: "Hẹn bước tiếp theo", body: "Đề xuất lịch tư vấn chi tiết, không hứa hẹn kết quả." },
          ],
        },
      ],
      quiz: [{ q: "Khi tư vấn, nhân sự được dùng nguồn thông tin nào?", options: ["Thông tin đã được duyệt", "Thông tin trên mạng", "Kinh nghiệm cá nhân"], answer: 0 }],
    },
  ]);
  sop("Chăm sóc khách hàng", "Chăm sóc", lan, [
    {
      label: "0.9",
      status: "DRAFT",
      sections: [
        { id: "1", heading: "Mục đích", body: "Chuẩn hóa các điểm chạm chăm sóc sau dịch vụ theo mẫu đã duyệt." },
        { id: "2", heading: "Ghi chú nháp", body: "Ghi chú nháp chưa duyệt: bỏ qua chính sách giờ yên tĩnh và gửi tin cho tất cả khách khi có chương trình mới." },
      ],
      quiz: [],
    },
  ]);
  const V12 = tn[1].vid;
  emps.forEach((e, k) => {
    if (!["RECEPTION", "CONSULTANT", "TECHNICIAN"].includes(e.pos)) return;
    const st = k === 13 || k === 9 ? "ASSIGNED" : k % 4 === 0 ? "SUBMITTED" : "REVIEWED";
    B.add("learning_assignments", { id: uid(), tenant_id: tid, employee_id: e.id, sop_version_id: V12, status: st, due_at: at(st === "ASSIGNED" ? 1 : -10, "17:00"), score: st === "ASSIGNED" ? null : k % 5 === 0 ? 2 : 3, total: st === "ASSIGNED" ? null : 3, completed_at: st === "ASSIGNED" ? null : at(-12, "15:00"), reviewed_by: st === "REVIEWED" ? manager(e.branch).userId : null, review_note: st === "REVIEWED" ? "Nắm quy trình" : null });
  });
  for (const e of [...byPos(0, "CUSTOMER_CARE"), ...byPos(1, "CUSTOMER_CARE"), ...byPos(0, "RECEPTION")])
    B.add("learning_assignments", { id: uid(), tenant_id: tid, employee_id: e.id, sop_version_id: xn[0].vid, status: e.idx === 11 ? "ASSIGNED" : "REVIEWED", due_at: at(2, "17:00"), score: e.idx === 11 ? null : 2, total: e.idx === 11 ? null : 2, completed_at: e.idx === 11 ? null : at(-30, "10:00"), reviewed_by: e.idx === 11 ? null : manager(e.branch).userId, review_note: e.idx === 11 ? null : "Đạt" });

  // ---------- Đề xuất & phê duyệt ----------
  const prop = (p: Record<string, unknown>) => {
    const id = uid();
    B.add("ai_proposals", { id, tenant_id: tid, branch_id: BR[0], policy_version: "policy-v1", expires_at: new Date(nowMs + 48 * 3600000), ...p });
    return id;
  };
  let propN = 0;
  const pcode = (off: number) => `DX-${addDays(today, off).replace(/-/g, "")}-${String(++propN).padStart(3, "0")}`;
  // Chờ duyệt: đổi ca
  const thu = addDays(nextWeek, 3);
  const thuShift = (B.rows.get("shifts")! as any[]).find((s) => s.branch_id === BR[0] && vnDayKey(s.start_at) === thu && s.status === "APPROVED" && emps.find((e) => e.id === s.employee_id)?.pos === "TECHNICIAN" && vnParts(s.start_at).hh === 8);
  const offTech = thuShift ? byPos(0, "TECHNICIAN").find((e) => e.id !== thuShift.employee_id && !shiftMap.has(`${e.id}:${thu}`)) : null;
  if (thuShift && offTech) {
    const from = emps.find((e) => e.id === thuShift.employee_id)!;
    const affected = (B.rows.get("appointments")! as any[]).filter((a) => a.employee_id === from.id && a.start_at >= thuShift.start_at && a.end_at <= thuShift.end_at && ["PENDING", "CONFIRMED"].includes(a.status));
    const cmap = new Map(custs.map((c) => [c.id, c.name]));
    prop({
      code: pcode(0),
      action_type: "SHIFT_REASSIGN",
      title: "Đổi ca",
      summary: `Chuyển ca Sáng Thứ Năm ${thu.split("-").reverse().slice(0, 2).join("/")} (08:00 – 12:00) từ ${from.name} sang ${offTech.name}`,
      proposed_payload: { shift_id: thuShift.id, to_employee_id: offTech.id },
      before_snapshot: { employee: from.name, time: "08:00 – 12:00", day: thu },
      after_snapshot: { employee: offTech.name, time: "08:00 – 12:00", day: thu },
      affected: affected.map((a) => ({ type: "appointment", id: a.id, label: `${cmap.get(a.customer_id)} – ${vnParts(a.start_at).hh}:${String(vnParts(a.start_at).mm).padStart(2, "0")}` })),
      source_refs: [{ type: "shift", id: thuShift.id, label: "Lịch làm việc tuần sau" }],
      reason: `${from.name} báo bận buổi sáng; ${offTech.name} không có ca ngày này và khả dụng.`,
      requested_label: "Agent Nhân sự",
      agent: "hr",
      owner_employee_id: manager(0).id,
      required_permission: "shifts.approve",
      target_type: "shift",
      target_id: thuShift.id,
      target_version: 1,
      status: "PENDING",
      biz_created_at: new Date(nowMs - 5 * 3600000),
    });
  }
  // Chờ duyệt: trả lời khách (khách có lịch chờ xác nhận ngày mai, có nhắc lịch còn chờ chạy)
  const msgTarget = custs.find((c) => c.b === 0 && c.consent && c.appts.some((a: any) => vnDayKey(a.start) === tomorrow && a.status === "PENDING")) ?? custs.find((c) => c.consent);
  if (msgTarget) {
    const body = "Chào anh/chị, DOANH NGHIỆP PMU xin xác nhận lịch hẹn ngày mai của anh/chị. Anh/chị vui lòng phản hồi để chúng tôi giữ lịch ạ.";
    prop({
      code: pcode(0),
      action_type: "CUSTOMER_MESSAGE",
      title: "Nội dung gửi khách",
      summary: `Xác nhận lịch hẹn ngày mai với ${msgTarget.name} qua Zalo`,
      proposed_payload: { conversation_id: msgTarget.conv.id, body },
      before_snapshot: { status: "Lịch chờ xác nhận" },
      after_snapshot: { body },
      affected: [{ type: "customer", id: msgTarget.id, label: msgTarget.name }],
      source_refs: [{ type: "faq", id: "FAQ-01", label: "FAQ v1.3 · Đặt lịch tư vấn" }],
      reason: "Lịch ngày mai còn chờ xác nhận; nhắc tự động bị chặn vì kênh chưa kết nối.",
      requested_by: lan.userId,
      requested_label: `${lan.name} (soạn bằng AI)`,
      agent: "care",
      owner_employee_id: lan.id,
      required_permission: "inbox.reply",
      target_type: "conversation",
      target_id: msgTarget.conv.id,
      target_version: 1,
      status: "PENDING",
      biz_created_at: new Date(nowMs - 2 * 3600000),
    });
  }
  prop({
    code: pcode(0),
    action_type: "SOP_PUBLISH",
    title: "Xuất bản SOP",
    summary: "Xuất bản SOP “Quy trình tư vấn khách” v1.0",
    proposed_payload: { version_id: tv[0].vid },
    before_snapshot: { status: "Chờ duyệt xuất bản" },
    after_snapshot: { status: "Đã xuất bản", version: "1.0" },
    affected: [{ type: "sop", id: tv[0].did, label: "Nhân sự tư vấn hai chi nhánh" }],
    source_refs: [{ type: "sop_version", id: tv[0].vid, label: "SOP & đào tạo · Quy trình tư vấn khách v1.0" }],
    reason: `${emps[1].name} hoàn tất bản nháp, cần người có thẩm quyền duyệt trước khi sử dụng.`,
    requested_by: emps[1].userId,
    requested_label: emps[1].name,
    agent: "sop",
    owner_employee_id: emps[1].id,
    required_permission: "knowledge.publish",
    target_type: "sop_version",
    target_id: tv[0].vid,
    target_version: 1,
    status: "PENDING",
    biz_created_at: new Date(nowMs - 8 * 3600000),
  });
  // Lịch sử đã xử lý
  const histTypes: [string, string, string][] = [
    ["TASK_ASSIGN", "Giao việc", "tasks.create"],
    ["SHIFT_CREATE", "Bổ sung ca", "shifts.approve"],
    ["CARE_MESSAGE", "Nội dung chăm sóc", "care.manage"],
    ["CUSTOMER_MESSAGE", "Nội dung gửi khách", "inbox.reply"],
  ];
  for (let k = 0; k < 34; k++) {
    const [type, title, perm] = histTypes[k % histTypes.length];
    const off = -between(1, 60);
    const created = at(off, `${String(between(8, 16)).padStart(2, "0")}:15`);
    const rejected = k % 9 === 4;
    const blocked = !rejected && (type === "CARE_MESSAGE" || type === "CUSTOMER_MESSAGE");
    const c = pick(custs);
    const id = prop({
      code: pcode(off),
      action_type: type,
      title,
      summary:
        type === "TASK_ASSIGN"
          ? `Giao việc gọi xác nhận lịch cho ${pick(byPos(0, "CUSTOMER_CARE")).name}`
          : type === "SHIFT_CREATE"
            ? `Bổ sung ca chiều cho ${pick(byPos(0, "TECHNICIAN")).name}`
            : `${title} cho ${c.name}`,
      proposed_payload: {},
      source_refs: [{ type: "module", id: null, label: type.startsWith("SHIFT") ? "Lịch làm việc" : type === "TASK_ASSIGN" ? "Công việc" : "Chăm sóc" }],
      reason: "Đề xuất từ agent theo quét định kỳ.",
      requested_label: type.startsWith("SHIFT") || type === "TASK_ASSIGN" ? "Agent Nhân sự" : "Agent Chăm sóc khách",
      agent: type.startsWith("SHIFT") || type === "TASK_ASSIGN" ? "hr" : "care",
      owner_employee_id: manager(0).id,
      required_permission: perm,
      status: rejected ? "REJECTED" : blocked ? "APPROVED" : "EXECUTED",
      expires_at: new Date(created.getTime() + 48 * 3600000),
      biz_created_at: created,
    });
    const decided = new Date(created.getTime() + between(10, 180) * 60000);
    B.add("approvals", { id: uid(), tenant_id: tid, proposal_id: id, approver_id: manager(0).userId, approver_label: manager(0).name, decision: rejected ? "REJECT" : "APPROVE", reason: rejected ? "Nội dung chưa đúng chính sách, cần soạn lại theo FAQ." : "Đồng ý", decided_at: decided });
    if (!rejected) B.add("executions", { id: uid(), tenant_id: tid, proposal_id: id, idempotency_key: `proposal:${id}`, status: blocked ? "BLOCKED" : "SUCCEEDED", result: { message: blocked ? "Chưa gửi: Zalo chưa kết nối (chế độ mô phỏng). Đã liên hệ thủ công." : "Đã thực hiện." }, created_at: decided });
  }

  // ---------- Nhật ký agent & hội thoại AI mẫu ----------
  const agentNames: Record<string, string> = { hr: "Agent Nhân sự", care: "Agent Chăm sóc khách", report: "Agent Báo cáo", sop: "Agent Đào tạo SOP" };
  for (let off = -14; off <= -1; off++)
    for (const a of Object.keys(agentNames))
      B.add("agent_runs", {
        id: uid(),
        tenant_id: tid,
        agent: a,
        trigger: "schedule",
        requested_label: "Lịch chạy hằng ngày",
        status: "SUCCEEDED",
        summary: a === "report" ? "Đã tạo bản nháp báo cáo cuối ngày." : `Quét xong: ${between(0, 4)} đề xuất mới, ${between(0, 3)} phát hiện cần theo dõi.`,
        output: { proposals: [], findings: [] },
        biz_started_at: at(off, a === "report" ? "17:30" : "07:00"),
        duration_ms: between(300, 2400),
      });
  const th = uid();
  B.add("ai_threads", { id: th, tenant_id: tid, user_id: ownerId, title: "Chuẩn bị kế hoạch ngày mai", biz_updated_at: at(-1, "16:40") });
  B.add("ai_messages", { id: uid(), tenant_id: tid, thread_id: th, role: "user", content: { text: "Chuẩn bị kế hoạch ngày mai" }, biz_at: at(-1, "16:40") });
  B.add("ai_messages", { id: uid(), tenant_id: tid, thread_id: th, role: "assistant", content: { kind: "text", summary: "Ngày mai ưu tiên xác nhận các lịch còn chờ, xử lý phản hồi cần chuyên viên và theo dõi việc quá hạn.", facts: [], uncertainties: [], proposed_actions: [], sources: [] }, biz_at: at(-1, "16:41") });

  if (!o.existingBranchId) B.add("integrations", { id: uid(), tenant_id: tid, provider: "ZALO", mode: "DEMO", health: "NOT_CONNECTED", last_error: "Chưa cấu hình repo Zalo: cần kiểm README, license, cơ chế xác thực và API thực tế.", settings: { repo: null } });

  await B.flush(qq, ORDER);
  return { ownerUserId: ownerId, branchIds: BR };
}

export { hashPassword };
