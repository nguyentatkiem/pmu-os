import { tx, uid, j, type Q } from "./db";
import { hashPassword, type TenantSettings } from "./auth";
import { vnToDate } from "../shared/format";
import { buildReportContent } from "./ai";

export const DEMO_NOW_ISO = "2026-11-15T10:30:00Z"; // 17:30 ngày 15/11/2026 giờ Việt Nam

export const DEFAULT_SETTINGS: TenantSettings = {
  quiet_hours: { enabled: true, from: "21:00", to: "08:00" },
  reminder_offsets_hours: [24, 2],
  shift_templates: {
    S: { label: "Sáng", start: "08:00", end: "12:00" },
    C: { label: "Chiều", start: "13:00", end: "17:00" },
  },
  shift_min_staff: { S: 3, C: 3 },
  ai_policy: {
    default_level: "L1",
    levels: {
      INTERNAL_REMINDER: "L2",
      TASK_ASSIGN: "L1",
      SHIFT_CHANGE: "L1",
      CUSTOMER_MESSAGE: "L1",
      CARE_MESSAGE: "L1",
      SOP_PUBLISH: "L1",
    },
    budget_per_day: 200,
  },
  permission_overrides: {},
  notifications: { overdue_tasks: true, pending_approvals: true, new_conversations: true, blocked_jobs: true },
  booking_window_days: 7,
};

const T = (day: number, time: string) => vnToDate(`2026-11-${String(day).padStart(2, "0")}`, time);

async function ins(qq: Q, table: string, row: Record<string, unknown>) {
  const keys = Object.keys(row);
  const vals = keys.map((k) => {
    const v = row[k];
    if (v instanceof Date || v === null || v === undefined) return v ?? null;
    if (typeof v === "object" && !Array.isArray(v)) return JSON.stringify(v);
    if (Array.isArray(v) && v.length && typeof v[0] === "object") return JSON.stringify(v);
    return v;
  });
  const ph = keys.map((_, i) => `$${i + 1}`).join(",");
  await qq(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${ph})`, vals);
}

export async function createRealTenant(ownerEmail: string, ownerPassword: string) {
  return tx(async (qq) => {
    const tenantId = uid();
    const branchId = uid();
    const userId = uid();
    await ins(qq, "tenants", { id: tenantId, name: "DOANH NGHIỆP PMU", mode: "REAL", settings: DEFAULT_SETTINGS });
    await ins(qq, "branches", { id: branchId, tenant_id: tenantId, name: "Chi nhánh chính" });
    await ins(qq, "users", {
      id: userId,
      tenant_id: tenantId,
      email: ownerEmail.toLowerCase(),
      display_name: "Chủ doanh nghiệp",
      password_hash: hashPassword(ownerPassword),
    });
    await ins(qq, "memberships", { id: uid(), tenant_id: tenantId, user_id: userId, role: "OWNER" });
    await ins(qq, "integrations", { id: uid(), tenant_id: tenantId, provider: "ZALO", mode: "DEMO", health: "NOT_CONNECTED" });
    return { tenantId, userId };
  });
}

export async function seedDemoTenant() {
  return tx(async (qq) => {
    const tenantId = uid();
    const short = tenantId.slice(0, 8);
    const demoNow = new Date(DEMO_NOW_ISO);
    await ins(qq, "tenants", {
      id: tenantId,
      name: "DOANH NGHIỆP PMU",
      mode: "DEMO",
      demo_now: demoNow,
      clock_anchor: new Date(),
      settings: DEFAULT_SETTINGS,
    });
    const BR = uid();
    const BR2 = uid();
    await ins(qq, "branches", { id: BR, tenant_id: tenantId, name: "Chi nhánh mẫu", created_at: T(1, "08:00") });
    await ins(qq, "branches", { id: BR2, tenant_id: tenantId, name: "Chi nhánh mẫu 2", created_at: T(1, "08:01") });

    // ---------- Nhân sự A–H ----------
    const staffDef: [string, string, string[], string, string][] = [
      ["A", "MANAGER", ["Điều phối ca", "Xử lý tình huống", "Đào tạo nội bộ"], "WORKING", "0900000101"],
      ["B", "CONSULTANT", ["Tư vấn dịch vụ", "Ghi nhận nhu cầu", "Đặt lịch"], "WORKING", "0900000102"],
      ["C", "CONSULTANT", ["Tư vấn dịch vụ", "Chăm sóc hội thoại"], "WORKING", "0900000103"],
      ["D", "TECHNICIAN", ["Kỹ thuật cơ bản", "Kỹ thuật nâng cao", "Xử lý tình huống", "Tuân thủ quy trình"], "WORKING", "0900000104"],
      ["E", "TECHNICIAN", ["Kỹ thuật cơ bản", "Tuân thủ quy trình"], "WORKING", "0900000105"],
      ["F", "TECHNICIAN", ["Kỹ thuật cơ bản", "Kỹ thuật nâng cao"], "AVAILABLE", "0900000106"],
      ["G", "CUSTOMER_CARE", ["Chăm sóc sau dịch vụ", "Xác nhận lịch", "Ghi nhận phản hồi"], "WORKING", "0900000107"],
      ["H", "RECEPTION", ["Đón tiếp", "Check-in", "Xác nhận lịch"], "WORKING", "0900000108"],
    ];
    const E: Record<string, string> = {};
    const U: Record<string, string> = {};
    const posRole: Record<string, string> = {
      MANAGER: "BRANCH_MANAGER",
      CONSULTANT: "CONSULTANT",
      TECHNICIAN: "TECHNICIAN",
      CUSTOMER_CARE: "CUSTOMER_CARE",
      RECEPTION: "RECEPTION",
    };
    const ownerId = uid();
    const adminId = uid();
    await ins(qq, "users", {
      id: ownerId,
      tenant_id: tenantId,
      email: `chu-doanh-nghiep@${short}.demo.pmu-os`,
      display_name: "Chủ doanh nghiệp (demo)",
      is_demo_persona: true,
    });
    await ins(qq, "memberships", { id: uid(), tenant_id: tenantId, user_id: ownerId, role: "OWNER" });
    await ins(qq, "users", {
      id: adminId,
      tenant_id: tenantId,
      email: `quan-tri@${short}.demo.pmu-os`,
      display_name: "Quản trị hệ thống (demo)",
      is_demo_persona: true,
    });
    await ins(qq, "memberships", { id: uid(), tenant_id: tenantId, user_id: adminId, role: "SYSTEM_ADMIN" });
    for (const [code, pos, skills, ws, phone] of staffDef) {
      E[code] = uid();
      U[code] = uid();
      await ins(qq, "users", {
        id: U[code],
        tenant_id: tenantId,
        email: `nhan-su-${code.toLowerCase()}@${short}.demo.pmu-os`,
        display_name: `Nhân sự ${code}`,
        is_demo_persona: true,
      });
      await ins(qq, "employees", {
        id: E[code],
        tenant_id: tenantId,
        branch_id: BR,
        user_id: U[code],
        code,
        display_name: `Nhân sự ${code}`,
        position: pos,
        skills,
        availability: {
          days: code === "E" ? [1, 2, 3, 4, 6, 0] : [1, 2, 3, 4, 5, 6, 0],
          slots: ["S", "C"],
          note: code === "F" ? "Ưu tiên ca chiều cuối tuần" : "",
        },
        work_status: ws,
        contact_phone: phone,
        created_at: T(1, "08:00"),
      });
      await ins(qq, "memberships", {
        id: uid(),
        tenant_id: tenantId,
        user_id: U[code],
        role: posRole[pos],
        branch_ids: [BR],
        employee_id: E[code],
      });
    }

    // ---------- Dịch vụ, FAQ, mẫu chăm sóc ----------
    const SV = { consult: uid(), brow: uid(), lip: uid(), check: uid() };
    await ins(qq, "services", { id: SV.consult, tenant_id: tenantId, name: "Tư vấn PMU", duration_min: 30, faq_version: "FAQ v1.2" });
    await ins(qq, "services", { id: SV.brow, tenant_id: tenantId, name: "Dịch vụ PMU mày", duration_min: 120, faq_version: "FAQ v1.2" });
    await ins(qq, "services", { id: SV.lip, tenant_id: tenantId, name: "Dịch vụ PMU môi", duration_min: 120, faq_version: "FAQ v1.2" });
    await ins(qq, "services", { id: SV.check, tenant_id: tenantId, name: "Kiểm tra sau dịch vụ", duration_min: 30, faq_version: "FAQ v1.2" });

    const faqs: [string, string, string, string, string[]][] = [
      ["FAQ", "FAQ-01", "Đặt lịch tư vấn", "Chào anh/chị, anh/chị muốn tư vấn vào thời gian nào? DOANH NGHIỆP PMU sẽ kiểm tra lịch trống và xác nhận lại với anh/chị.", ["đặt lịch", "lịch tư vấn", "hẹn", "tư vấn"]],
      ["FAQ", "FAQ-02", "Đổi lịch hẹn", "Anh/chị vui lòng cho biết thời gian mong muốn. Nhân sự phụ trách sẽ kiểm tra lịch trống và xác nhận lịch mới.", ["đổi lịch", "dời lịch", "hủy lịch", "đổi"]],
      ["FAQ", "FAQ-03", "Chi phí dịch vụ", "Chi phí phụ thuộc dịch vụ cụ thể và sẽ được chuyên viên tư vấn trực tiếp. Hệ thống chưa có bảng giá đã duyệt để báo giá tự động.", ["giá", "bao nhiêu", "chi phí", "phí"]],
      ["FAQ", "FAQ-04", "Tìm hiểu dịch vụ", "DOANH NGHIỆP PMU có dịch vụ tư vấn và thực hiện PMU theo quy trình đã duyệt. Anh/chị có thể đặt lịch tư vấn để được giới thiệu chi tiết.", ["tìm hiểu", "dịch vụ", "pmu", "thông tin"]],
      ["POLICY", "CS-01", "Chính sách liên hệ khách", "Chỉ liên hệ chăm sóc khi khách đã đồng ý; không gửi tin trong khung giờ yên tĩnh đã cấu hình.", ["liên hệ", "đồng ý", "giờ yên tĩnh"]],
      ["POLICY", "CS-02", "Yêu cầu gặp người phụ trách", "Khi khách yêu cầu gặp người phụ trách, chuyển hội thoại cho quản lý chi nhánh hoặc chuyên viên và phản hồi trong ngày.", ["người phụ trách", "quản lý", "gặp", "khiếu nại"]],
    ];
    for (const [kind, code, title, body, kw] of faqs) {
      await ins(qq, "knowledge_items", {
        id: uid(),
        tenant_id: tenantId,
        kind,
        code,
        title,
        body,
        keywords: kw,
        version_label: kind === "FAQ" ? "FAQ v1.2" : "Chính sách v1.0",
        approved_at: T(10, "09:00"),
      });
    }
    const TPL = uid();
    await ins(qq, "care_templates", {
      id: TPL,
      tenant_id: tenantId,
      name: "Mẫu chăm sóc",
      version_label: "v1.1",
      body: "Chào {ten_khach}, DOANH NGHIỆP PMU xin hỏi thăm sau buổi dịch vụ. Anh/chị có phản hồi nào cần doanh nghiệp hỗ trợ không?",
      approved_at: T(5, "10:00"),
    });

    // ---------- Khách mẫu A–F ----------
    const C: Record<string, string> = {};
    const custDef: [string, string, number, string, string, string, string, number][] = [
      // code, assigned, stage, readiness, source, phone, segment, followup day
      ["A", "G", 2, "HOT", "Facebook", "0900000012", "Tư vấn dịch vụ", 16],
      ["B", "B", 3, "WARM", "Zalo", "0900000023", "Tư vấn dịch vụ", 16],
      ["C", "C", 2, "COLD", "Zalo", "0900000034", "Hỏi thông tin", 18],
      ["D", "B", 6, "WARM", "Giới thiệu", "0900000045", "Khách đã sử dụng dịch vụ", 16],
      ["E", "G", 6, "COLD", "Facebook", "0900000056", "Khách đã sử dụng dịch vụ", 15],
      ["F", "G", 7, "WARM", "Zalo", "0900000067", "Khách đã sử dụng dịch vụ", 17],
    ];
    const readinessReason: Record<string, string> = {
      A: "Khách chủ động nhắn muốn đặt lịch tư vấn, đã trao đổi nhu cầu ở buổi tư vấn đầu.",
      B: "Đã có lịch tư vấn, đang cân nhắc dịch vụ cụ thể.",
      C: "Mới hỏi chi phí, chưa nêu nhu cầu cụ thể.",
      D: "Đã dùng dịch vụ, đang có lịch kiểm tra theo chỉ định.",
      E: "Đang có phản hồi cần chuyên viên xử lý, chưa phù hợp mời đặt lịch.",
      F: "Đã kiểm tra sau dịch vụ, phản hồi tích cực.",
    };
    for (const [code, assigned, stage, rd, source, phone, segment, fu] of custDef) {
      C[code] = uid();
      await ins(qq, "customers", {
        id: C[code],
        tenant_id: tenantId,
        branch_id: BR,
        code: `KM-${code}00${"ABCDEF".indexOf(code) + 1}`,
        display_name: `Khách mẫu ${code}`,
        contact_phone: phone,
        contact_norm: phone,
        source,
        segment,
        avatar: `/avatars/khach-${code.toLowerCase()}.png`,
        assigned_to: E[assigned],
        readiness: rd,
        readiness_reason: readinessReason[code],
        readiness_by: code === "A" ? "AI" : U[assigned],
        readiness_at: code === "A" ? T(15, "10:26") : T(14, "09:00"),
        readiness_confirmed: code !== "A",
        lifecycle_stage: stage,
        next_followup_at: T(fu, "09:00"),
        created_at: T(9, "09:00"),
      });
    }
    await ins(qq, "customer_notes", {
      id: uid(),
      tenant_id: tenantId,
      customer_id: C.A,
      author_id: U.G,
      author_label: "Nhân sự G",
      body: "Quan tâm dịch vụ PMU, đã tư vấn lần đầu, dự kiến đặt lịch trong tuần.",
      created_at: T(9, "09:40"),
    });

    // Đồng ý liên hệ
    const consent = async (cust: string, purpose: string, status: string, day: number, source: string) =>
      ins(qq, "consents", {
        id: uid(),
        tenant_id: tenantId,
        customer_id: C[cust],
        channel: "ZALO",
        purpose,
        status,
        source,
        recorded_by: U.G,
        recorded_at: T(day, "09:30"),
      });
    await consent("A", "CARE", "GRANTED", 9, "Khách xác nhận trong buổi tư vấn (mẫu)");
    await consent("A", "MARKETING", "DENIED", 9, "Khách chưa đồng ý nhận tiếp thị");
    await consent("B", "CARE", "GRANTED", 10, "Khách xác nhận qua Zalo (mẫu)");
    await consent("D", "CARE", "GRANTED", 2, "Phiếu đồng ý tại quầy (mẫu)");
    await consent("E", "CARE", "GRANTED", 12, "Phiếu đồng ý tại quầy (mẫu)");
    await consent("F", "CARE", "GRANTED", 8, "Phiếu đồng ý tại quầy (mẫu)");
    await consent("F", "MARKETING", "GRANTED", 8, "Phiếu đồng ý tại quầy (mẫu)");

    // ---------- Ca làm: hôm nay 15/11 + tuần 16–22/11 ----------
    const tpl = { S: ["08:00", "12:00"], C: ["13:00", "17:00"] } as const;
    const shift = async (emp: string, day: number, a: string, b: string, status = "APPROVED", note: string | null = null) => {
      const id = uid();
      await ins(qq, "shifts", {
        id,
        tenant_id: tenantId,
        branch_id: BR,
        employee_id: E[emp],
        start_at: T(day, a),
        end_at: T(day, b),
        status,
        note,
        approved_by: status === "APPROVED" ? U.A : null,
        created_at: T(13, "10:00"),
      });
      return id;
    };
    const today: Record<string, "S" | "C"> = { A: "S", B: "S", C: "C", D: "C", E: "S", F: "C", G: "S", H: "S" };
    for (const [emp, slot] of Object.entries(today)) await shift(emp, 15, tpl[slot][0], tpl[slot][1]);
    const grid: Record<string, string[]> = {
      //     16   17   18   19   20   21   22
      A: ["S", "C", "S", "S", "C", "S", "C"],
      B: ["C", "S", "X", "C", "S", "-", "S"],
      C: ["C", "S", "C", "C", "S", "S", "-"],
      D: ["S", "-", "S", "C", "S", "C", "S"],
      E: ["S", "C", "L", "S", "-", "S", "C"],
      F: ["S", "S", "C", "S", "-", "C", "S"],
      G: ["C", "S", "C", "-", "C", "S", "C"],
      H: ["C", "C", "S", "S", "-", "C", "S"],
    };
    const shiftIds: Record<string, string> = {};
    for (const [emp, row] of Object.entries(grid)) {
      for (let i = 0; i < 7; i++) {
        const day = 16 + i;
        const v = row[i];
        if (v === "S" || v === "C") shiftIds[`${emp}${day}`] = await shift(emp, day, tpl[v][0], tpl[v][1]);
        if (v === "X") {
          shiftIds[`${emp}${day}`] = await shift(emp, day, "09:00", "12:00");
          shiftIds[`${emp}${day}b`] = await shift(emp, day, "11:00", "14:00", "DRAFT", "Ca bổ sung do nhân sự đăng ký, chưa duyệt");
        }
      }
    }
    await ins(qq, "leaves", {
      id: uid(),
      tenant_id: tenantId,
      employee_id: E.E,
      start_at: T(18, "00:00"),
      end_at: T(19, "00:00"),
      reason: "Nghỉ phép đã duyệt (mẫu)",
    });

    // ---------- Lịch hẹn ----------
    const A: Record<string, string> = {};
    const appt = async (
      code: string,
      key: string,
      cust: string,
      sv: string,
      emp: string,
      day: number,
      start: string,
      min: number,
      status: string,
      extra: Record<string, unknown> = {},
    ) => {
      A[key] = uid();
      const s = T(day, start);
      await ins(qq, "appointments", {
        id: A[key],
        tenant_id: tenantId,
        branch_id: BR,
        code,
        customer_id: C[cust],
        service_id: sv,
        employee_id: E[emp],
        start_at: s,
        end_at: new Date(s.getTime() + min * 60000),
        status,
        created_by: U.H,
        created_at: T(Math.max(1, day - 3), "10:00"),
        ...extra,
      });
    };
    await appt("LH009", "Dsvc", "D", SV.lip, "E", 2, "09:00", 120, "COMPLETED");
    await appt("LH011", "Fsvc", "F", SV.brow, "D", 8, "09:00", 120, "COMPLETED");
    await appt("LH013", "Esvc", "E", SV.lip, "D", 12, "13:30", 120, "COMPLETED");
    await appt("LH014", "Ccancel", "C", SV.consult, "B", 13, "15:00", 30, "CANCELLED", { cancel_reason: "Khách báo bận, chưa hẹn lại" });
    await appt("LH015", "Fcheck", "F", SV.check, "D", 15, "14:00", 30, "COMPLETED", { note: "Kiểm tra theo chỉ định đã xác nhận" });
    await appt("LH017", "A16", "A", SV.consult, "F", 16, "09:00", 30, "PENDING", { note: "Tư vấn chi tiết dịch vụ" });
    await appt("LH018", "B16", "B", SV.consult, "D", 16, "10:00", 30, "CONFIRMED", { confirmed_at: T(15, "11:00") });
    await appt("LH019", "D16", "D", SV.check, "E", 16, "11:00", 30, "CONFIRMED", {
      confirmed_at: T(14, "16:30"),
      note: "Kiểm tra theo chỉ định đã xác nhận của kỹ thuật viên",
    });
    await appt("LH020", "F19", "F", SV.check, "E", 19, "09:30", 30, "CONFIRMED", { confirmed_at: T(15, "15:10") });

    // Nhắc lịch: mốc 24h đã đến hạn nhưng bị chặn vì chưa kết nối; mốc 2h còn chờ chạy
    for (const key of ["A16", "B16", "D16", "F19"]) {
      const map: Record<string, [number, string]> = { A16: [16, "09:00"], B16: [16, "10:00"], D16: [16, "11:00"], F19: [19, "09:30"] };
      const [d, t] = map[key];
      const start = T(d, t);
      for (const h of [24, 2]) {
        const runAt = new Date(start.getTime() - h * 3600000);
        const past = runAt.getTime() <= demoNow.getTime();
        await ins(qq, "jobs", {
          id: uid(),
          tenant_id: tenantId,
          type: "APPT_REMINDER",
          ref_type: "appointment",
          ref_id: A[key],
          run_at: runAt,
          status: past ? "BLOCKED" : "SCHEDULED",
          result: past ? "Chưa gửi: Zalo chưa kết nối. Cần nhắc thủ công." : null,
          attempts: past ? 1 : 0,
          dedupe_key: `appt:${A[key]}:${start.toISOString()}:${h}h`,
        });
      }
    }

    // ---------- Công việc (24) ----------
    type TaskDef = {
      code: string;
      title: string;
      owner: string;
      created: [number, string];
      due: [number, string];
      done?: [number, string];
      status: string;
      priority?: string;
      cust?: string;
      checklist: [string, boolean][];
      desc?: string;
    };
    const tasks: TaskDef[] = [
      { code: "CV001", title: "Chuẩn bị phòng dịch vụ đầu tuần", owner: "D", created: [9, "08:00"], due: [9, "12:00"], done: [9, "10:40"], status: "DONE", checklist: [["Vệ sinh khu vực", true], ["Kiểm tra dụng cụ", true]] },
      { code: "CV002", title: "Kiểm tra checklist đón khách", owner: "H", created: [9, "08:10"], due: [9, "17:00"], done: [9, "16:20"], status: "DONE", checklist: [["Quầy lễ tân", true], ["Sổ hẹn", true], ["Khu chờ", true]] },
      { code: "CV003", title: "Hỏi thăm Khách mẫu F sau dịch vụ", owner: "G", created: [9, "08:30"], due: [9, "17:00"], done: [10, "09:15"], status: "DONE", cust: "F", checklist: [["Gọi hỏi thăm", true], ["Ghi nhận phản hồi", true]] },
      { code: "CV004", title: "Tổng hợp nhu cầu Khách mẫu B", owner: "B", created: [9, "09:00"], due: [10, "12:00"], done: [10, "11:00"], status: "DONE", cust: "B", checklist: [["Ghi nhận nhu cầu", true], ["Cập nhật hồ sơ", true]] },
      { code: "CV005", title: "Cập nhật hồ sơ Khách mẫu D", owner: "B", created: [10, "08:30"], due: [10, "17:00"], done: [10, "15:30"], status: "DONE", cust: "D", checklist: [["Cập nhật lịch sử", true], ["Kiểm tra đồng ý liên hệ", true]] },
      { code: "CV006", title: "Xác nhận lịch hẹn trong tuần với khách", owner: "G", created: [10, "08:40"], due: [10, "17:00"], done: [10, "16:00"], status: "DONE", checklist: [["Xem lịch", true], ["Liên hệ khách", true], ["Cập nhật xác nhận", true]] },
      { code: "CV007", title: "Đọc SOP tiếp nhận khách mới v1.1", owner: "C", created: [10, "09:00"], due: [11, "17:00"], done: [11, "10:00"], status: "DONE", checklist: [["Đọc SOP", true], ["Ghi chú câu hỏi", false]] },
      { code: "CV008", title: "Chuẩn bị dụng cụ cho ca chiều", owner: "D", created: [10, "09:30"], due: [10, "13:00"], done: [10, "12:50"], status: "DONE", checklist: [["Kiểm tra dụng cụ", true], ["Sắp xếp khu làm việc", true]] },
      { code: "CV009", title: "Sắp xếp lịch trực lễ tân", owner: "A", created: [10, "10:00"], due: [11, "12:00"], done: [11, "09:30"], status: "DONE", checklist: [["Rà soát khả dụng", true], ["Chốt lịch trực", true]] },
      { code: "CV010", title: "Theo dõi và cập nhật tình hình Khách mẫu F", owner: "C", created: [11, "08:30"], due: [12, "12:00"], done: [12, "10:00"], status: "DONE", cust: "F", checklist: [["Đọc lịch sử", true], ["Cập nhật ghi chú", true]] },
      { code: "CV011", title: "Kiểm tra khu làm việc đầu ca", owner: "E", created: [11, "08:00"], due: [11, "12:00"], done: [11, "11:00"], status: "DONE", checklist: [["Vệ sinh", true], ["Kiểm tra dụng cụ", true]] },
      { code: "CV012", title: "Gọi xác nhận lịch Khách mẫu E", owner: "G", created: [11, "09:00"], due: [11, "17:00"], done: [11, "16:30"], status: "DONE", cust: "E", checklist: [["Liên hệ khách", true], ["Cập nhật xác nhận", true]] },
      { code: "CV013", title: "Đọc SOP đón tiếp khách", owner: "B", created: [11, "10:00"], due: [12, "17:00"], done: [12, "15:00"], status: "DONE", checklist: [["Đọc SOP", true], ["Làm bài kiểm tra", true]] },
      { code: "CV014", title: "Thực hiện dịch vụ cho Khách mẫu E", owner: "D", created: [12, "08:00"], due: [12, "16:00"], done: [12, "15:40"], status: "DONE", cust: "E", checklist: [["Chuẩn bị theo checklist", true], ["Hoàn tất ghi nhận", true]] },
      { code: "CV015", title: "Chuẩn bị phòng cho ca chiều", owner: "E", created: [12, "09:00"], due: [12, "13:00"], done: [12, "12:45"], status: "DONE", checklist: [["Vệ sinh", true], ["Sắp xếp dụng cụ", true]] },
      { code: "CV016", title: "Rà soát phản hồi khách trong tuần", owner: "A", created: [12, "10:00"], due: [13, "17:00"], done: [13, "16:00"], status: "DONE", checklist: [["Đọc phản hồi", true], ["Phân công xử lý", true]] },
      { code: "CV017", title: "Hỏi thăm Khách mẫu E sau dịch vụ", owner: "G", created: [13, "08:30"], due: [13, "17:00"], done: [13, "11:00"], status: "DONE", cust: "E", checklist: [["Liên hệ khách", true], ["Ghi nhận phản hồi", true]] },
      { code: "CV018", title: "Kiểm tra checklist đón khách", owner: "H", created: [13, "08:10"], due: [13, "17:00"], done: [14, "08:40"], status: "DONE", checklist: [["Quầy lễ tân", true], ["Sổ hẹn", true]] },
      { code: "CV019", title: "Ghi nhận phản hồi Khách mẫu D", owner: "B", created: [14, "08:30"], due: [14, "17:00"], done: [14, "16:00"], status: "DONE", cust: "D", checklist: [["Liên hệ khách", true], ["Ghi nhận phản hồi", true]] },
      { code: "CV020", title: "Chuẩn bị dụng cụ cho ca sáng", owner: "F", created: [14, "16:00"], due: [15, "09:00"], done: [15, "08:30"], status: "DONE", checklist: [["Kiểm tra dụng cụ", true], ["Sắp xếp khu làm việc", true]] },
      { code: "CV021", title: "Liên hệ nhắc lịch với Khách mẫu B", owner: "B", created: [14, "15:00"], due: [16, "09:00"], status: "IN_PROGRESS", cust: "B", checklist: [["Gọi hoặc nhắn khách", true], ["Ghi nhận phản hồi", false]] },
      { code: "CV022", title: "Liên hệ xác nhận lại với Khách mẫu D", owner: "C", created: [15, "08:20"], due: [16, "12:00"], status: "SUBMITTED", cust: "D", checklist: [["Liên hệ khách", true], ["Ghi nhận thời gian mong muốn", true]], desc: "Khách mẫu D nhắn muốn đổi lịch kiểm tra." },
      { code: "CV023", title: "Học và thực hành SOP tiếp nhận khách", owner: "H", created: [15, "08:30"], due: [16, "17:00"], status: "IN_PROGRESS", checklist: [["Đọc SOP v1.2", true], ["Làm bài kiểm tra", false], ["Thực hành cùng quản lý", false]] },
      { code: "CV024", title: "Kiểm tra và xác nhận lịch ngày mai", owner: "G", created: [15, "08:00"], due: [15, "17:00"], status: "IN_PROGRESS", priority: "HIGH", checklist: [["Xem lịch", true], ["Liên hệ khách", true], ["Cập nhật xác nhận", false]], desc: "Nhắc lịch tự động bị chặn vì Zalo chưa kết nối: cần xác nhận thủ công các lịch ngày 16/11." },
    ];
    const TK: Record<string, string> = {};
    for (const t of tasks) {
      const id = uid();
      TK[t.code] = id;
      const created = T(...t.created);
      const done = t.done ? T(...t.done) : null;
      await ins(qq, "tasks", {
        id,
        tenant_id: tenantId,
        branch_id: BR,
        code: t.code,
        title: t.title,
        description: t.desc ?? null,
        owner_id: E[t.owner],
        created_by: U.A,
        customer_id: t.cust ? C[t.cust] : null,
        due_at: T(...t.due),
        priority: t.priority ?? "MEDIUM",
        status: t.status,
        accepted_at: new Date(created.getTime() + 20 * 60000),
        submitted_at: done ? new Date(done.getTime() - 5 * 60000) : t.status === "SUBMITTED" ? T(15, "16:30") : null,
        completed_at: done,
        approved_by: done ? U.A : null,
        biz_created_at: created,
        created_at: created,
      });
      let pos = 0;
      for (const [title, isDone] of t.checklist) {
        await ins(qq, "checklist_items", {
          id: uid(),
          tenant_id: tenantId,
          task_id: id,
          title,
          required: !(t.code === "CV007" && title === "Ghi chú câu hỏi"),
          position: pos++,
          done_at: isDone ? (done ?? new Date(created.getTime() + (pos + 1) * 45 * 60000)) : null,
          done_by: isDone ? U[t.owner] : null,
          evidence_ref: isDone && t.code === "CV022" && title === "Ghi nhận thời gian mong muốn" ? "Khách mong muốn đổi sang sáng 18/11 (ghi nhận qua điện thoại)" : null,
        });
      }
      const ev = async (type: string, at: Date, actor: string, payload: Record<string, unknown> = {}) =>
        ins(qq, "task_events", {
          id: uid(),
          tenant_id: tenantId,
          task_id: id,
          actor_id: actor === "AI" ? null : U[actor] ?? actor,
          actor_label: actor === "AI" ? "Hệ thống nhắc việc" : actor.length === 1 ? `Nhân sự ${actor}` : "Chủ doanh nghiệp (demo)",
          type,
          payload,
          occurred_at: at,
        });
      await ev("CREATED", created, "A");
      await ev("ACCEPTED", new Date(created.getTime() + 20 * 60000), t.owner);
      if (done) {
        await ev("SUBMITTED", new Date(done.getTime() - 5 * 60000), t.owner);
        await ev("APPROVED", done, "A");
      }
      if (t.code === "CV022") await ev("SUBMITTED", T(15, "16:30"), "C", { note: "Đã liên hệ, khách mong muốn đổi sang sáng 18/11." });
      if (t.code === "CV024") {
        await ev("REMINDER", T(15, "15:00"), "AI", { message: "Nhắc nhở: “Kiểm tra và xác nhận lịch ngày mai”" });
        await ev("COMMENT", T(15, "15:20"), "G", { body: "Đã gọi Khách mẫu B và D, còn Khách mẫu A chưa nghe máy." });
      }
      if (t.code === "CV023") await ev("COMMENT", T(15, "11:00"), "A", { body: "Đọc kỹ mục 2, chiều mai thực hành cùng tôi." });
    }

    // ---------- Hội thoại ----------
    const conv = async (cust: string, assigned: string, status: string, follow: boolean, msgs: [string, number, string, string, string?][]) => {
      const id = uid();
      const last = msgs[msgs.length - 1];
      await ins(qq, "conversations", {
        id,
        tenant_id: tenantId,
        branch_id: BR,
        channel: "ZALO",
        external_id: `demo-${cust}`,
        customer_id: C[cust],
        assigned_to: E[assigned],
        status,
        follow_up: follow,
        last_message_at: T(last[1], last[2]),
      });
      for (const [dir, day, time, body, who] of msgs) {
        await ins(qq, "messages", {
          id: uid(),
          tenant_id: tenantId,
          conversation_id: id,
          direction: dir,
          body,
          delivery_status: dir === "IN" ? "received" : "recorded",
          author_id: dir === "OUT" && who ? U[who] : null,
          author_label: dir === "OUT" && who ? `Nhân sự ${who}` : `Khách mẫu ${cust}`,
          external_event_id: dir === "IN" ? `demo-evt-${cust}-${day}-${time}` : null,
          sent_at: T(day, time),
        });
      }
      return id;
    };
    const CONV_A = await conv("A", "G", "NEW", false, [
      ["IN", 9, "09:05", "Chào doanh nghiệp, tôi muốn tìm hiểu dịch vụ PMU."],
      ["OUT", 9, "09:14", "Dạ chào anh/chị, Nhân sự G xin được tư vấn ạ. Anh/chị quan tâm dịch vụ nào ạ?", "G"],
      ["IN", 15, "10:24", "Tôi muốn đặt lịch tư vấn."],
    ]);
    await conv("B", "B", "OPEN", false, [
      ["IN", 10, "09:00", "Cho tôi hỏi lịch tư vấn tuần này."],
      ["OUT", 10, "09:12", "Dạ anh/chị muốn tư vấn vào thời gian nào ạ?", "B"],
      ["IN", 15, "09:50", "Chào doanh nghiệp."],
      ["OUT", 15, "09:55", "Dạ chào anh/chị, Nhân sự B hỗ trợ ạ.", "B"],
      ["IN", 15, "09:57", "Tôi muốn tìm hiểu dịch vụ PMU."],
    ]);
    await conv("C", "C", "NEW", false, [
      ["IN", 12, "10:00", "Doanh nghiệp làm việc đến mấy giờ?"],
      ["OUT", 12, "10:08", "Dạ doanh nghiệp làm việc theo ca sáng và chiều ạ.", "C"],
      ["IN", 15, "09:46", "Giá tư vấn hiện tại là bao nhiêu?"],
    ]);
    await conv("D", "B", "OPEN", true, [
      ["IN", 11, "14:00", "Tôi cần hỏi về lịch kiểm tra."],
      ["OUT", 11, "14:20", "Dạ lịch kiểm tra của anh/chị là 11:00 ngày 16/11 ạ.", "B"],
      ["IN", 14, "16:10", "Tôi muốn đổi lịch hẹn."],
      ["OUT", 14, "16:25", "Dạ anh/chị muốn đổi sang thời gian nào ạ?", "B"],
    ]);
    const CONV_E = await conv("E", "G", "OPEN", true, [["IN", 14, "18:05", "Tôi cần gặp người phụ trách."]]);
    await conv("F", "G", "DONE", false, [
      ["IN", 13, "10:00", "Cảm ơn doanh nghiệp, tôi sẽ đến kiểm tra đúng hẹn."],
      ["OUT", 13, "10:12", "Dạ cảm ơn anh/chị, hẹn gặp anh/chị ạ.", "G"],
    ]);

    // ---------- Phản hồi khách ----------
    const FB_E = uid();
    await ins(qq, "feedback", { id: uid(), tenant_id: tenantId, customer_id: C.D, appointment_id: A.Dsvc, category: "Trải nghiệm dịch vụ", severity: "LOW", rating: "GOOD", body: "Hài lòng với cách đón tiếp.", status: "RESOLVED", biz_created_at: T(10, "10:00") });
    await ins(qq, "feedback", { id: uid(), tenant_id: tenantId, customer_id: C.F, appointment_id: A.Fsvc, category: "Trải nghiệm dịch vụ", severity: "LOW", rating: "VERY_GOOD", body: "Nhân viên hướng dẫn rõ ràng.", status: "RESOLVED", biz_created_at: T(9, "10:00") });
    await ins(qq, "feedback", { id: uid(), tenant_id: tenantId, customer_id: C.F, appointment_id: A.Fcheck, category: "Kiểm tra sau dịch vụ", severity: "LOW", rating: "GOOD", body: "Buổi kiểm tra nhanh, đúng giờ.", status: "RESOLVED", biz_created_at: T(15, "15:00") });
    await ins(qq, "feedback", { id: FB_E, tenant_id: tenantId, customer_id: C.E, appointment_id: A.Esvc, category: "Yêu cầu trao đổi", severity: "MEDIUM", rating: "NEUTRAL", body: "Tôi cần gặp người phụ trách để trao đổi thêm.", needs_specialist: true, status: "OPEN", biz_created_at: T(14, "18:05") });

    // ---------- Kế hoạch chăm sóc ----------
    const plan = async (cust: string, ap: string, tps: [string, number, string, string, string?][]) => {
      const pid = uid();
      await ins(qq, "care_plans", { id: pid, tenant_id: tenantId, customer_id: C[cust], appointment_id: A[ap], template_id: TPL, owner_id: E.G, status: "ACTIVE" });
      for (const [title, day, time, status, note] of tps) {
        const tid = uid();
        await ins(qq, "care_touchpoints", {
          id: tid,
          tenant_id: tenantId,
          plan_id: pid,
          customer_id: C[cust],
          title,
          due_at: T(day, time),
          owner_id: E.G,
          status,
          template_id: TPL,
          template_version: "v1.1",
          note: note ?? null,
          contacted_at: status === "DONE" || status === "WAITING_REPLY" ? T(day, "10:00") : null,
        });
        await ins(qq, "jobs", {
          id: uid(),
          tenant_id: tenantId,
          type: "CARE_TOUCHPOINT",
          ref_type: "care_touchpoint",
          ref_id: tid,
          run_at: T(day, time),
          status: status === "PLANNED" ? "SCHEDULED" : status === "TO_CONTACT" ? "BLOCKED" : "DONE",
          result: status === "TO_CONTACT" ? "Chưa gửi: Zalo chưa kết nối. Cần liên hệ thủ công hoặc gửi phê duyệt." : status === "PLANNED" ? null : "Đã ghi nhận liên hệ thủ công",
          dedupe_key: `care:${tid}`,
        });
      }
    };
    await plan("D", "Dsvc", [
      ["Hỏi thăm sau 1 ngày", 3, "10:00", "DONE", "Khách phản hồi ổn"],
      ["Nhắc lịch kiểm tra theo chỉ định", 15, "09:00", "TO_CONTACT"],
    ]);
    await plan("E", "Esvc", [
      ["Hỏi thăm sau 1 ngày", 13, "10:00", "DONE", "Đã gọi hỏi thăm (CV017)"],
      ["Theo dõi phản hồi sau 3 ngày", 15, "10:00", "WAITING_REPLY", "Khách yêu cầu gặp người phụ trách"],
    ]);
    await plan("F", "Fsvc", [
      ["Hỏi thăm sau 1 ngày", 9, "10:00", "DONE", "Khách hài lòng"],
      ["Hỏi thăm sau kiểm tra", 15, "16:00", "TO_CONTACT"],
      ["Mời phản hồi trải nghiệm", 22, "10:00", "PLANNED"],
    ]);

    // ---------- Dòng thời gian khách ----------
    const cev = async (cust: string, type: string, title: string, body: string, day: number, time: string, emp: string | null, status_label: string | null = null) =>
      ins(qq, "customer_events", { id: uid(), tenant_id: tenantId, customer_id: C[cust], type, title, body, employee_id: emp ? E[emp] : null, status_label, occurred_at: T(day, time) });
    await cev("A", "CONSULT", "Tư vấn", "Nhân sự G đã tư vấn và giới thiệu dịch vụ phù hợp với nhu cầu. Khách quan tâm, cần thêm thông tin để quyết định.", 9, "09:20", "G", "Tư vấn dịch vụ");
    await cev("A", "MESSAGE", "Khách nhắn tin", "Tôi muốn đặt lịch tư vấn.", 15, "10:24", null);
    await cev("A", "BOOKING", "Đặt lịch", "Tạo lịch tư vấn chi tiết 09:00 – 09:30, Thứ Hai 16/11/2026 với Nhân sự F.", 15, "10:40", "H", "Chờ xác nhận");
    await cev("B", "CONSULT", "Tư vấn", "Trao đổi nhu cầu qua Zalo.", 10, "09:12", "B", "Tư vấn dịch vụ");
    await cev("B", "BOOKING", "Đặt lịch", "Lịch tư vấn 10:00 – 10:30, Thứ Hai 16/11/2026.", 13, "10:00", "B", "Đã xác nhận");
    await cev("C", "CONSULT", "Hỏi thông tin", "Khách hỏi giờ làm việc.", 12, "10:08", "C");
    await cev("C", "BOOKING", "Hủy lịch", "Lịch tư vấn 15:00 13/11 đã hủy: khách báo bận.", 13, "14:00", "C", "Đã hủy");
    await cev("D", "SERVICE", "Sử dụng dịch vụ", "Dịch vụ PMU môi, Nhân sự E thực hiện.", 2, "11:00", "E", "Hoàn thành");
    await cev("D", "CARE", "Chăm sóc", "Hỏi thăm sau 1 ngày, khách phản hồi ổn.", 3, "10:00", "G", "Đã hoàn thành");
    await cev("D", "MESSAGE", "Khách nhắn tin", "Tôi muốn đổi lịch hẹn.", 14, "16:10", null);
    await cev("E", "SERVICE", "Sử dụng dịch vụ", "Dịch vụ PMU môi, Nhân sự D thực hiện.", 12, "15:30", "D", "Hoàn thành");
    await cev("E", "CARE", "Chăm sóc", "Gọi hỏi thăm sau 1 ngày.", 13, "11:00", "G", "Đã hoàn thành");
    await cev("E", "FEEDBACK", "Phản hồi", "Tôi cần gặp người phụ trách để trao đổi thêm.", 14, "18:05", null, "Cần chuyên viên");
    await cev("F", "SERVICE", "Sử dụng dịch vụ", "Dịch vụ PMU mày, Nhân sự D thực hiện.", 8, "11:00", "D", "Hoàn thành");
    await cev("F", "CARE", "Chăm sóc", "Hỏi thăm sau 1 ngày, khách hài lòng.", 9, "10:00", "G", "Đã hoàn thành");
    await cev("F", "VISIT", "Kiểm tra sau dịch vụ", "Kiểm tra theo chỉ định đã xác nhận, Nhân sự D thực hiện.", 15, "14:30", "D", "Hoàn thành");

    // ---------- SOP & đào tạo ----------
    const SOP1 = uid();
    const SOP2 = uid();
    const SOP3 = uid();
    await ins(qq, "sop_documents", { id: SOP1, tenant_id: tenantId, title: "Tiếp nhận khách mới", category: "Lễ tân & tư vấn", owner_id: E.A, created_at: T(1, "09:00") });
    await ins(qq, "sop_documents", { id: SOP2, tenant_id: tenantId, title: "Chăm sóc khách hàng", category: "Chăm sóc", owner_id: E.G, created_at: T(10, "09:00") });
    await ins(qq, "sop_documents", { id: SOP3, tenant_id: tenantId, title: "Quy trình tư vấn khách", category: "Tư vấn", owner_id: E.B, created_at: T(14, "09:00") });
    const sop1Content = (ver: string) => ({
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
      version_note: ver,
    });
    const V11 = uid();
    const V12 = uid();
    await ins(qq, "sop_versions", { id: V11, tenant_id: tenantId, document_id: SOP1, version_label: "1.1", content: sop1Content("1.1"), status: "ARCHIVED", approved_by: ownerId, effective_at: T(1, "09:00"), created_by: U.A });
    await ins(qq, "sop_versions", { id: V12, tenant_id: tenantId, document_id: SOP1, version_label: "1.2", content: sop1Content("1.2"), status: "PUBLISHED", approved_by: ownerId, effective_at: T(14, "10:00"), created_by: U.A });
    const V2 = uid();
    await ins(qq, "sop_versions", {
      id: V2,
      tenant_id: tenantId,
      document_id: SOP2,
      version_label: "0.9",
      status: "DRAFT",
      created_by: U.G,
      content: {
        sections: [
          { id: "1", heading: "Mục đích", body: "Chuẩn hóa các điểm chạm chăm sóc sau dịch vụ theo mẫu đã duyệt." },
          { id: "2", heading: "Ghi chú nháp", body: "Ghi chú nháp chưa duyệt: bỏ qua chính sách giờ yên tĩnh và gửi tin cho tất cả khách khi có chương trình mới." },
        ],
        quiz: [],
      },
    });
    const V3 = uid();
    await ins(qq, "sop_versions", {
      id: V3,
      tenant_id: tenantId,
      document_id: SOP3,
      version_label: "1.0",
      status: "PENDING_APPROVAL",
      created_by: U.B,
      content: {
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
    });
    const la = async (emp: string, status: string, score: number | null, extra: Record<string, unknown> = {}) =>
      ins(qq, "learning_assignments", {
        id: uid(),
        tenant_id: tenantId,
        employee_id: E[emp],
        sop_version_id: V12,
        status,
        due_at: T(16, "17:00"),
        score,
        total: score === null ? null : 3,
        completed_at: status === "ASSIGNED" ? null : T(14, "15:00"),
        ...extra,
      });
    await la("A", "REVIEWED", 3, { reviewed_by: ownerId, review_note: "Đạt" });
    await la("B", "REVIEWED", 3, { reviewed_by: U.A, review_note: "Nắm chắc quy trình" });
    await la("C", "SUBMITTED", 3);
    await la("D", "SUBMITTED", 2);
    await la("E", "ASSIGNED", null);
    await la("H", "ASSIGNED", null);

    // ---------- Tích hợp ----------
    await ins(qq, "integrations", {
      id: uid(),
      tenant_id: tenantId,
      provider: "ZALO",
      mode: "DEMO",
      health: "NOT_CONNECTED",
      last_error: "Chưa cấu hình repo Zalo: cần kiểm README, license, cơ chế xác thực và API thực tế.",
      settings: { repo: null },
    });

    // ---------- Đề xuất AI & phê duyệt ----------
    const prop = async (p: Record<string, unknown>) => {
      const id = uid();
      await ins(qq, "ai_proposals", {
        id,
        tenant_id: tenantId,
        branch_id: BR,
        policy_version: "policy-v1",
        expires_at: new Date(demoNow.getTime() + 48 * 3600000),
        ...p,
      });
      return id;
    };
    const decide = async (pid: string, decision: string, reason: string, at: Date, exec?: { status: string; result: unknown }) => {
      await ins(qq, "approvals", { id: uid(), tenant_id: tenantId, proposal_id: pid, approver_id: U.A, approver_label: "Nhân sự A", decision, reason, decided_at: at });
      if (exec) await ins(qq, "executions", { id: uid(), tenant_id: tenantId, proposal_id: pid, idempotency_key: `proposal:${pid}`, status: exec.status, result: exec.result, created_at: at });
    };
    // Chờ duyệt (3)
    const shiftE19 = shiftIds["E19"];
    await prop({
      code: "DXC-20261115-001",
      action_type: "SHIFT_REASSIGN",
      title: "Đổi ca",
      summary: "Chuyển ca Sáng Thứ Năm 19/11 (08:00 – 12:00) từ Nhân sự E sang Nhân sự D",
      proposed_payload: { shift_id: shiftE19, to_employee_id: E.D },
      before_snapshot: { employee: "Nhân sự E", time: "08:00 – 12:00", day: "2026-11-19" },
      after_snapshot: { employee: "Nhân sự D", time: "08:00 – 12:00", day: "2026-11-19" },
      affected: [{ type: "appointment", id: A.F19, label: "Khách mẫu F – 09:30, 19/11/2026" }],
      source_refs: [{ type: "shift", id: shiftE19, label: "Lịch làm việc tuần 16–22/11" }],
      reason: "Nhân sự E báo không sắp xếp được khung 08:00 – 12:00 ngày 19/11; Nhân sự D đang có ca chiều và khả dụng buổi sáng.",
      requested_label: "AI Assistant",
      owner_employee_id: E.A,
      required_permission: "shifts.approve",
      target_type: "shift",
      target_id: shiftE19,
      target_version: 1,
      status: "PENDING",
      biz_created_at: T(15, "09:18"),
    });
    await prop({
      code: "DXC-20261115-002",
      action_type: "CUSTOMER_MESSAGE",
      title: "Nội dung gửi khách",
      summary: "Trả lời Khách mẫu A qua Zalo theo FAQ đã duyệt",
      proposed_payload: { conversation_id: CONV_A, body: "Chào anh/chị, anh/chị muốn tư vấn vào thời gian nào? DOANH NGHIỆP PMU sẽ kiểm tra lịch trống và xác nhận lại với anh/chị." },
      before_snapshot: { status: "Chưa trả lời" },
      after_snapshot: { body: "Chào anh/chị, anh/chị muốn tư vấn vào thời gian nào? DOANH NGHIỆP PMU sẽ kiểm tra lịch trống và xác nhận lại với anh/chị." },
      affected: [{ type: "customer", id: C.A, label: "Khách mẫu A" }],
      source_refs: [{ type: "faq", id: "FAQ-01", label: "FAQ v1.2 · Đặt lịch tư vấn" }],
      reason: "Khách nhắn muốn đặt lịch tư vấn lúc 10:24; nội dung lấy từ FAQ đã duyệt.",
      requested_by: U.G,
      requested_label: "Nhân sự G (soạn bằng AI)",
      owner_employee_id: E.G,
      required_permission: "inbox.reply",
      target_type: "conversation",
      target_id: CONV_A,
      target_version: 1,
      status: "PENDING",
      biz_created_at: T(15, "10:31"),
    });
    await prop({
      code: "DXC-20261115-003",
      action_type: "SOP_PUBLISH",
      title: "Xuất bản SOP",
      summary: "Xuất bản SOP “Quy trình tư vấn khách” v1.0",
      proposed_payload: { version_id: V3 },
      before_snapshot: { status: "Chờ duyệt xuất bản" },
      after_snapshot: { status: "Đã xuất bản", version: "1.0" },
      affected: [{ type: "sop", id: SOP3, label: "Nhân sự tư vấn B, C" }],
      source_refs: [{ type: "sop_version", id: V3, label: "SOP & đào tạo · Quy trình tư vấn khách v1.0" }],
      reason: "Nhân sự B hoàn tất bản nháp, cần người có thẩm quyền duyệt trước khi nhân viên sử dụng.",
      requested_by: U.B,
      requested_label: "Nhân sự B",
      owner_employee_id: E.B,
      required_permission: "knowledge.publish",
      target_type: "sop_version",
      target_id: V3,
      target_version: 1,
      status: "PENDING",
      biz_created_at: T(15, "09:25"),
    });
    // Đã xử lý
    const h1 = await prop({ code: "DXC-20261114-004", action_type: "SOP_PUBLISH", title: "Xuất bản SOP", summary: "Xuất bản SOP “Tiếp nhận khách mới” v1.2", proposed_payload: { version_id: V12 }, source_refs: [{ type: "sop_version", id: V12, label: "Tiếp nhận khách mới v1.2" }], reason: "Cập nhật bước xác nhận lịch hẹn.", requested_by: U.A, requested_label: "Nhân sự A", owner_employee_id: E.A, required_permission: "knowledge.publish", target_type: "sop_version", target_id: V12, target_version: 1, status: "EXECUTED", biz_created_at: T(14, "09:00") });
    await decide(h1, "APPROVE", "Nội dung đúng thực tế vận hành", T(14, "10:00"), { status: "SUCCEEDED", result: { message: "Đã xuất bản v1.2, lưu trữ v1.1" } });
    const h2 = await prop({ code: "DXC-20261115-005", action_type: "TASK_ASSIGN", title: "Giao việc", summary: "Giao nhiệm vụ xác nhận lịch ngày mai cho Nhân sự G", proposed_payload: { title: "Kiểm tra và xác nhận lịch ngày mai", owner_id: E.G }, source_refs: [{ type: "job", id: null, label: "Nhắc lịch tự động bị chặn (Zalo chưa kết nối)" }], reason: "Nhắc lịch 24 giờ không gửi được do kênh chưa kết nối.", requested_label: "AI Assistant", owner_employee_id: E.A, required_permission: "tasks.create", status: "EXECUTED", biz_created_at: T(15, "07:55") });
    await decide(h2, "APPROVE", "Đồng ý", T(15, "08:00"), { status: "SUCCEEDED", result: { task_code: "CV024" } });
    const h3 = await prop({ code: "DXC-20261114-006", action_type: "TASK_ASSIGN", title: "Giao việc", summary: "Giao nhiệm vụ nhắc lịch Khách mẫu B cho Nhân sự B", proposed_payload: { title: "Liên hệ nhắc lịch với Khách mẫu B", owner_id: E.B }, source_refs: [{ type: "appointment", id: A.B16, label: "Lịch hẹn #LH018" }], reason: "Khách có lịch tư vấn sáng 16/11.", requested_label: "AI Assistant", owner_employee_id: E.A, required_permission: "tasks.create", status: "EXECUTED", biz_created_at: T(14, "14:50") });
    await decide(h3, "APPROVE", "Đồng ý", T(14, "15:00"), { status: "SUCCEEDED", result: { task_code: "CV021" } });
    const h4 = await prop({ code: "DXC-20261113-007", action_type: "SHIFT_CREATE", title: "Bổ sung ca", summary: "Phân ca tuần 16–22/11 cho Chi nhánh mẫu", proposed_payload: { batch: true }, source_refs: [{ type: "shift", id: null, label: "Khả dụng nhân sự tuần 16–22/11" }], reason: "Lập lịch tuần theo khả dụng đã khai báo.", requested_label: "AI Assistant", owner_employee_id: E.A, required_permission: "shifts.approve", status: "EXECUTED", biz_created_at: T(13, "09:30") });
    await decide(h4, "APPROVE", "Đã kiểm tra khả dụng", T(13, "10:00"), { status: "SUCCEEDED", result: { message: "Đã tạo ca tuần" } });
    const h5 = await prop({ code: "DXC-20261113-008", action_type: "CARE_MESSAGE", title: "Nội dung chăm sóc", summary: "Hỏi thăm Khách mẫu E sau dịch vụ (Mẫu chăm sóc v1.1)", proposed_payload: { customer_id: C.E }, source_refs: [{ type: "care_template", id: TPL, label: "Mẫu chăm sóc v1.1" }], reason: "Điểm chạm sau 1 ngày theo kế hoạch đã duyệt.", requested_by: U.G, requested_label: "Nhân sự G", owner_employee_id: E.G, required_permission: "care.manage", status: "APPROVED", biz_created_at: T(13, "09:40") });
    await decide(h5, "APPROVE", "Nội dung đúng mẫu", T(13, "09:50"), { status: "BLOCKED", result: { message: "Chưa gửi: Zalo chưa kết nối. Nhân sự G đã gọi điện thủ công (CV017)." } });
    const h6 = await prop({ code: "DXC-20261115-009", action_type: "TASK_ASSIGN", title: "Giao việc", summary: "Giao bài học SOP tiếp nhận khách cho Nhân sự H", proposed_payload: { title: "Học và thực hành SOP tiếp nhận khách", owner_id: E.H }, source_refs: [{ type: "sop_version", id: V12, label: "Tiếp nhận khách mới v1.2" }], reason: "Nhân sự H chưa hoàn thành bài học SOP v1.2.", requested_label: "AI Assistant", owner_employee_id: E.A, required_permission: "tasks.create", status: "EXECUTED", biz_created_at: T(15, "08:25") });
    await decide(h6, "APPROVE", "Đồng ý", T(15, "08:30"), { status: "SUCCEEDED", result: { task_code: "CV023" } });
    const r1 = await prop({ code: "DXC-20261112-010", action_type: "SHIFT_REASSIGN", title: "Đổi ca", summary: "Chuyển ca CSKH chiều 12/11 của Nhân sự G sang Nhân sự H", proposed_payload: {}, source_refs: [{ type: "shift", id: null, label: "Lịch làm việc 12/11" }], reason: "Nhân sự G xin đổi ca.", requested_label: "AI Assistant", owner_employee_id: E.A, required_permission: "shifts.approve", status: "REJECTED", biz_created_at: T(12, "08:00") });
    await decide(r1, "REJECT", "Nhân sự H chưa được đào tạo chăm sóc khách hàng.", T(12, "08:30"));
    const r2 = await prop({ code: "DXC-20261113-011", action_type: "CUSTOMER_MESSAGE", title: "Nội dung gửi khách", summary: "Tin nhắn mời Khách mẫu C đặt lịch", proposed_payload: {}, source_refs: [{ type: "faq", id: "FAQ-04", label: "FAQ v1.2" }], reason: "Khách đã hỏi thông tin.", requested_by: U.C, requested_label: "Nhân sự C", owner_employee_id: E.C, required_permission: "inbox.reply", status: "REJECTED", biz_created_at: T(13, "15:10") });
    await decide(r2, "REJECT", "Nội dung có câu cam kết kết quả, không đúng chính sách. Cần soạn lại theo FAQ.", T(13, "15:30"));

    // ---------- Hội thoại AI mẫu ----------
    const th1 = uid();
    await ins(qq, "ai_threads", { id: th1, tenant_id: tenantId, user_id: ownerId, title: "Chuẩn bị kế hoạch ngày mai", biz_updated_at: T(14, "16:40") });
    await ins(qq, "ai_messages", { id: uid(), tenant_id: tenantId, thread_id: th1, role: "user", content: { text: "Chuẩn bị kế hoạch ngày mai" }, biz_at: T(14, "16:40") });
    await ins(qq, "ai_messages", { id: uid(), tenant_id: tenantId, thread_id: th1, role: "assistant", content: { kind: "text", summary: "Ngày 15/11 có 1 việc hạn 17:00 (CV024) và 3 lịch hẹn ngày 16/11 cần xác nhận trước 17:00.", facts: [], uncertainties: ["Kế hoạch dựa trên dữ liệu đến 16:40 ngày 14/11."], proposed_actions: [] }, biz_at: T(14, "16:40") });

    // ---------- Báo cáo nháp ngày 15/11 ----------
    const content = await buildReportContent(qq, { tenantId, branchIds: [BR], day: "2026-11-15", now: demoNow });
    await ins(qq, "reports", { id: uid(), tenant_id: tenantId, branch_id: BR, period_date: "2026-11-15", scope: "Chi nhánh mẫu", source_cutoff: demoNow, content, status: "DRAFT", created_by: ownerId });

    return { tenantId, ownerUserId: ownerId };
  });
}

/** Xoá các doanh nghiệp demo không hoạt động quá 3 ngày */
export async function cleanupDemoTenants(qq: Q) {
  await qq("DELETE FROM tenants WHERE mode = 'DEMO' AND last_active_at < now() - interval '3 days'");
}

export { hashPassword };
export const _unused = j;
