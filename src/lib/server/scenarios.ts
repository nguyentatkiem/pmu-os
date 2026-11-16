// DỮ LIỆU MÔ PHỎNG: 20 hội thoại Zalo có Agent Chăm sóc khách trả lời sẵn + nội dung khởi tạo Bộ não thứ 2.
// Tên khách lấy từ bộ khách hư cấu; trả lời chỉ dùng FAQ/chính sách đã duyệt, không báo giá, không tư vấn chuyên môn.
import { uid, j, type Q } from "./db";
import { addDays, vnDayKey } from "../shared/format";

type Outcome = "approved" | "pending" | "escalated";
export interface ZaloScenario {
  key: string;
  intent: string;
  ask: string[];
  reply: string | null;
  refs: string[];
  outcome: Outcome;
  thanks?: string;
  hoursAgo: number;
}

export const ZALO_SCENARIOS: ZaloScenario[] = [
  { key: "Z01", intent: "Đặt lịch tư vấn", ask: ["Chào em, chị muốn đặt lịch tư vấn phun mày cuối tuần này được không?"], reply: "Dạ chào chị, DOANH NGHIỆP PMU làm việc ca sáng 08:00–12:00 và ca chiều 13:00–17:00. Chị muốn tư vấn vào khung giờ nào để bên em kiểm tra lịch trống và xác nhận lại với chị ạ?", refs: ["FAQ-01", "FAQ-06"], outcome: "approved", thanks: "Ok em, chị chọn sáng thứ bảy nhé.", hoursAgo: 70 },
  { key: "Z02", intent: "Hỏi chi phí", ask: ["Phun môi bên mình giá bao nhiêu vậy em?"], reply: "Dạ chi phí phụ thuộc dịch vụ cụ thể và sẽ được chuyên viên tư vấn trực tiếp ạ. Chị có muốn bên em đặt lịch tư vấn để chuyên viên trao đổi chi tiết với chị không ạ?", refs: ["FAQ-03", "FAQ-01"], outcome: "approved", hoursAgo: 66 },
  { key: "Z03", intent: "Đổi lịch hẹn", ask: ["Em ơi chị bận đột xuất, đổi lịch hẹn thứ năm sang tuần sau giúp chị được không?"], reply: "Dạ chị vui lòng cho em biết ngày giờ mong muốn tuần sau ạ. Nhân sự phụ trách sẽ kiểm tra lịch trống và xác nhận lịch mới với chị.", refs: ["FAQ-02"], outcome: "approved", thanks: "Thứ ba tuần sau buổi chiều nhé em.", hoursAgo: 62 },
  { key: "Z04", intent: "Hủy lịch hẹn", ask: ["Cho mình hủy lịch tư vấn chiều nay nhé, mình có việc gấp."], reply: "Dạ em đã ghi nhận yêu cầu hủy lịch chiều nay của chị. Khi chị cần đặt lại, chị nhắn bên em thời gian mong muốn để nhân sự kiểm tra lịch trống ạ.", refs: ["FAQ-02"], outcome: "approved", thanks: "Cảm ơn em.", hoursAgo: 58 },
  { key: "Z05", intent: "Thời gian thực hiện", ask: ["Làm mày mất khoảng bao lâu em, chị muốn sắp xếp thời gian."], reply: "Dạ thời gian thực hiện khoảng 90–120 phút tùy dịch vụ; chuyên viên sẽ thông báo cụ thể khi tư vấn cho chị ạ.", refs: ["FAQ-05"], outcome: "approved", hoursAgo: 54 },
  { key: "Z06", intent: "Hỏi chi nhánh", ask: ["Bên mình có chi nhánh nào gần Hà Đông không?"], reply: "Dạ bên em có Chi nhánh Cầu Giấy và Chi nhánh Hà Đông, làm việc ca sáng 08:00–12:00 và ca chiều 13:00–17:00. Chị muốn đặt lịch ở chi nhánh Hà Đông vào thời gian nào ạ?", refs: ["FAQ-06", "FAQ-01"], outcome: "approved", thanks: "Chi nhánh Hà Đông nhé, để chị xem lịch rồi báo em.", hoursAgo: 50 },
  { key: "Z07", intent: "Tìm hiểu dịch vụ", ask: ["Bên em có làm phun mí không?"], reply: "Dạ DOANH NGHIỆP PMU có dịch vụ PMU mày, môi, mí theo quy trình đã duyệt ạ. Chị có thể đặt lịch tư vấn để chuyên viên giới thiệu chi tiết cho chị.", refs: ["FAQ-04", "FAQ-01"], outcome: "approved", hoursAgo: 46 },
  { key: "Z08", intent: "Câu hỏi chuyên môn sau dịch vụ", ask: ["Chị làm mày được 3 hôm, thấy hơi khô và ngứa, có sao không em?"], reply: null, refs: ["FAQ-07", "CS-02"], outcome: "escalated", hoursAgo: 30 },
  { key: "Z09", intent: "Yêu cầu gặp người phụ trách", ask: ["Mình muốn gặp quản lý để trao đổi về buổi làm hôm trước.", "Mình chờ hơi lâu nên chưa hài lòng."], reply: null, refs: ["CS-02"], outcome: "escalated", hoursAgo: 20 },
  { key: "Z10", intent: "Hỏi lịch trống", ask: ["Cho mình xin lịch trống chiều mai nhé."], reply: "Dạ chào chị, chiều mai bên em làm việc ca 13:00–17:00. Chị muốn tư vấn khoảng mấy giờ để bên em kiểm tra lịch trống và xác nhận lại với chị ạ?", refs: ["FAQ-01", "FAQ-06"], outcome: "pending", hoursAgo: 3.5 },
  { key: "Z11", intent: "Hỏi qua ngay", ask: ["Mai chị qua được không em?"], reply: "Dạ chị muốn qua vào buổi sáng (08:00–12:00) hay buổi chiều (13:00–17:00) ạ? Bên em sẽ kiểm tra lịch trống và xác nhận lại với chị.", refs: ["FAQ-01", "FAQ-06"], outcome: "pending", hoursAgo: 2.8 },
  { key: "Z12", intent: "Hỏi chuẩn bị trước khi đến", ask: ["Lần đầu đi làm mày thì chị cần chuẩn bị gì không em?"], reply: "Dạ nhân sự phụ trách sẽ liên hệ chị khi xác nhận lịch để hướng dẫn các thông tin cần chuẩn bị theo quy trình của bên em ạ. Chị đã có thời gian dự kiến chưa ạ?", refs: ["FAQ-01", "SOP Tiếp nhận khách mới"], outcome: "pending", hoursAgo: 2.2 },
  { key: "Z13", intent: "Đặt lịch hai người", ask: ["Chị đi cùng bạn, đặt 2 người cùng giờ được không?"], reply: "Dạ được chị ạ. Chị cho em xin thời gian mong muốn và dịch vụ mỗi người quan tâm để bên em kiểm tra lịch trống cho hai người và xác nhận lại ạ.", refs: ["FAQ-01"], outcome: "pending", hoursAgo: 1.6 },
  { key: "Z14", intent: "Giờ làm việc", ask: ["Thứ bảy bên mình có làm không em?"], reply: "Dạ bên em làm việc theo ca sáng 08:00–12:00 và ca chiều 13:00–17:00. Chị cho em xin ngày giờ mong muốn để kiểm tra lịch trống cho chị ạ.", refs: ["FAQ-06"], outcome: "approved", thanks: "Ok để chị sắp xếp.", hoursAgo: 40 },
  { key: "Z15", intent: "Cảm ơn sau dịch vụ", ask: ["Cảm ơn em, hôm qua chị làm xong rất ưng."], reply: "Dạ cảm ơn chị đã tin tưởng DOANH NGHIỆP PMU ạ. Nhân sự chăm sóc sẽ hỏi thăm chị theo kế hoạch; nếu có câu hỏi chuyên môn, chuyên viên phụ trách sẽ trao đổi trực tiếp với chị.", refs: ["FAQ-07"], outcome: "approved", hoursAgo: 36 },
  { key: "Z16", intent: "Dặm màu", ask: ["Chị làm mày được hơn 1 tháng, muốn dặm lại thì đặt lịch thế nào em?"], reply: "Dạ dặm màu được thực hiện theo chỉ định của chuyên viên ạ. Chị cho em xin thời gian mong muốn, bên em sẽ kiểm tra lịch của chuyên viên phụ trách và xác nhận lại với chị.", refs: ["FAQ-01", "FAQ-07"], outcome: "pending", hoursAgo: 1.1 },
  { key: "Z17", intent: "Hỏi ưu đãi", ask: ["Dạo này bên mình có chương trình ưu đãi gì không?"], reply: "Dạ thông tin chương trình ưu đãi sẽ do chuyên viên tư vấn trực tiếp ạ. Chị có muốn bên em đặt lịch tư vấn để chuyên viên trao đổi với chị không ạ?", refs: ["FAQ-03", "FAQ-01"], outcome: "approved", hoursAgo: 28 },
  { key: "Z18", intent: "Báo đến muộn", ask: ["Em ơi chị kẹt xe, chắc đến muộn khoảng 15 phút."], reply: "Dạ em đã ghi nhận. Nhân sự phụ trách sẽ kiểm tra lịch và báo lại chị nếu cần điều chỉnh giờ ạ.", refs: ["FAQ-02"], outcome: "approved", thanks: "Cảm ơn em nhiều.", hoursAgo: 26 },
  { key: "Z19", intent: "Hỏi lịch kiểm tra sau dịch vụ", ask: ["Lịch kiểm tra sau dịch vụ của chị là hôm nào em nhỉ?"], reply: "Dạ nhân sự phụ trách sẽ kiểm tra hồ sơ và xác nhận lại thời gian kiểm tra sau dịch vụ với chị trong hôm nay ạ.", refs: ["FAQ-07"], outcome: "pending", hoursAgo: 0.8 },
  { key: "Z20", intent: "Tư vấn dáng mày", ask: ["Mặt chị tròn thì nên làm dáng mày nào hợp em?"], reply: "Dạ dáng mày phù hợp sẽ được chuyên viên tư vấn trực tiếp khi gặp chị ạ. Chị có muốn bên em đặt lịch tư vấn không ạ?", refs: ["FAQ-04", "FAQ-01"], outcome: "pending", hoursAgo: 0.5 },
];

const ins = async (qq: Q, table: string, row: Record<string, unknown>) => {
  const keys = Object.keys(row);
  const vals = keys.map((k) => {
    const v = row[k];
    if (v instanceof Date || v === null || v === undefined) return v ?? null;
    if (typeof v === "object" && !Array.isArray(v)) return JSON.stringify(v);
    if (Array.isArray(v) && (table !== "brain_notes" || k !== "tags")) return JSON.stringify(v);
    return v;
  });
  await qq(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")})`, vals);
};

/** Gắn 20 kịch bản Zalo vào khách hư cấu đã có hội thoại. Trả về số hội thoại đã gắn. */
export async function seedZaloScenarios(qq: Q, tenantId: string, now: Date) {
  const rows = await qq<any>(
    `SELECT c.id AS customer_id, c.display_name, c.branch_id, c.assigned_to, cv.id AS conv_id
       FROM customers c JOIN conversations cv ON cv.customer_id=c.id
      WHERE c.tenant_id=$1 AND cv.status='DONE'
        AND EXISTS (SELECT 1 FROM consents k WHERE k.customer_id=c.id AND k.purpose='CARE' AND k.status='GRANTED')
      ORDER BY c.code OFFSET 12 LIMIT 60`,
    [tenantId],
  );
  if (rows.length < ZALO_SCENARIOS.length) return 0;
  const step = Math.floor(rows.length / ZALO_SCENARIOS.length);
  const mgr = await qq<any>(
    `SELECT e.id, e.display_name, e.branch_id, e.user_id FROM employees e WHERE e.tenant_id=$1 AND e.position='MANAGER' AND e.active`,
    [tenantId],
  );
  const cskh = await qq<any>(`SELECT id, display_name, branch_id FROM employees WHERE tenant_id=$1 AND position='CUSTOMER_CARE' AND active`, [tenantId]);
  const day = vnDayKey(now).replace(/-/g, "");
  let n = 0;
  for (let i = 0; i < ZALO_SCENARIOS.length; i++) {
    const s = ZALO_SCENARIOS[i];
    const c = rows[i * step];
    const m = mgr.find((x) => x.branch_id === c.branch_id) ?? mgr[0];
    const care = cskh.find((x) => x.branch_id === c.branch_id) ?? cskh[0];
    const t0 = now.getTime() - s.hoursAgo * 3600000;
    let t = t0;
    let k = 0;
    const addMsg = async (dir: "IN" | "OUT", body: string, extra: Record<string, unknown> = {}) => {
      await ins(qq, "messages", {
        id: uid(),
        tenant_id: tenantId,
        conversation_id: c.conv_id,
        direction: dir,
        body,
        delivery_status: dir === "IN" ? "received" : "recorded",
        author_label: dir === "IN" ? c.display_name : extra.author_label,
        author_id: dir === "IN" ? null : (extra.author_id ?? null),
        source_ref: extra.source_ref ?? null,
        external_event_id: dir === "IN" ? `sim-${s.key}-${c.conv_id.slice(0, 8)}-${k++}` : null,
        sent_at: new Date(t),
      });
    };
    for (const a of s.ask) {
      await addMsg("IN", a);
      t += 60000;
    }
    const refsLabel = s.refs.join(", ");
    let status = "NEW";
    let draft: string | null = null;
    let lastAt = new Date(t - 60000);
    if (s.outcome === "approved" && s.reply) {
      // Agent soạn → quản lý duyệt → nhân sự gửi ngoài hệ thống (Zalo chưa kết nối) và ghi nhận
      const propId = uid();
      const created = new Date(t + 2 * 60000);
      const decided = new Date(t + 9 * 60000);
      t += 10 * 60000;
      await addMsg("OUT", s.reply, { author_label: `Agent Chăm sóc khách · ${m.display_name} duyệt`, author_id: m.user_id, source_ref: `agent:care:${refsLabel}` });
      lastAt = new Date(t);
      if (s.thanks) {
        t += 4 * 60000;
        await addMsg("IN", s.thanks);
        lastAt = new Date(t);
      }
      status = s.thanks ? "OPEN" : "DONE";
      await ins(qq, "ai_proposals", {
        id: propId,
        tenant_id: tenantId,
        branch_id: c.branch_id,
        code: `DX-${day}-Z${s.key.slice(1)}`,
        action_type: "CUSTOMER_MESSAGE",
        title: "Nội dung gửi khách",
        summary: `Trả lời ${c.display_name} (${s.intent}) theo ${refsLabel}`,
        proposed_payload: { conversation_id: c.conv_id, body: s.reply },
        before_snapshot: { status: "Chưa trả lời" },
        after_snapshot: { body: s.reply },
        affected: [{ type: "customer", id: c.customer_id, label: c.display_name }],
        source_refs: s.refs.map((r) => ({ type: "knowledge", id: null, label: r, href: "/knowledge" })),
        reason: `Khách hỏi “${s.intent}”; nội dung lấy từ ${refsLabel} đã duyệt.`,
        requested_label: "Agent Chăm sóc khách",
        agent: "care",
        owner_employee_id: care?.id ?? null,
        required_permission: "inbox.reply",
        target_type: "conversation",
        target_id: c.conv_id,
        target_version: 1,
        status: "EXECUTED",
        expires_at: new Date(created.getTime() + 48 * 3600000),
        biz_created_at: created,
      });
      await ins(qq, "approvals", { id: uid(), tenant_id: tenantId, proposal_id: propId, approver_id: m.user_id, approver_label: m.display_name, decision: "APPROVE", reason: "Nội dung đúng FAQ đã duyệt.", decided_at: decided });
      await ins(qq, "executions", {
        id: uid(),
        tenant_id: tenantId,
        proposal_id: propId,
        idempotency_key: `exec:${propId}`,
        status: "SUCCEEDED",
        result: { note: "Zalo chưa kết nối: nhân sự gửi thủ công và ghi nhận vào hội thoại (mô phỏng)." },
      });
    } else if (s.outcome === "pending" && s.reply) {
      draft = s.reply;
      const created = new Date(t + 60000);
      await ins(qq, "ai_proposals", {
        id: uid(),
        tenant_id: tenantId,
        branch_id: c.branch_id,
        code: `DX-${day}-Z${s.key.slice(1)}`,
        action_type: "CUSTOMER_MESSAGE",
        title: "Nội dung gửi khách",
        summary: `Trả lời ${c.display_name} (${s.intent}) theo ${refsLabel}`,
        proposed_payload: { conversation_id: c.conv_id, body: s.reply },
        before_snapshot: { status: "Chưa trả lời" },
        after_snapshot: { body: s.reply },
        affected: [{ type: "customer", id: c.customer_id, label: c.display_name }],
        source_refs: s.refs.map((r) => ({ type: "knowledge", id: null, label: r, href: "/knowledge" })),
        reason: `Khách hỏi “${s.intent}”; Agent Chăm sóc khách soạn sẵn từ ${refsLabel} đã duyệt. Chưa gửi.`,
        requested_label: "Agent Chăm sóc khách",
        agent: "care",
        dedupe_key: `agent:care:msg:${c.conv_id}`,
        owner_employee_id: care?.id ?? null,
        required_permission: "inbox.reply",
        target_type: "conversation",
        target_id: c.conv_id,
        target_version: 1,
        status: "PENDING",
        expires_at: new Date(created.getTime() + 48 * 3600000),
        biz_created_at: created,
      });
      status = "NEW";
    } else {
      // Chuyển chuyên viên: agent không trả lời câu hỏi chuyên môn / khiếu nại
      status = "OPEN";
      await qq("UPDATE conversations SET specialist_id=$2, follow_up=true WHERE id=$1", [c.conv_id, m.id]);
    }
    await qq("UPDATE conversations SET status=$2, draft=$3, last_message_at=$4, assigned_to=coalesce($5, assigned_to), updated_at=now() WHERE id=$1", [
      c.conv_id,
      status,
      draft,
      lastAt,
      care?.id ?? null,
    ]);
    n++;
  }
  return n;
}

/** Nội dung khởi tạo của Bộ não thứ 2 (mô phỏng): quy tắc, bài học, insight, ghi nhớ, quyết định. */
export async function seedBrain(qq: Q, tenantId: string, now: Date) {
  const at = (d: number, h = 0) => new Date(now.getTime() + d * 86400000 - h * 3600000);
  const mgr = (await qq<any>("SELECT display_name FROM employees WHERE tenant_id=$1 AND position='MANAGER' AND active ORDER BY created_at LIMIT 1", [tenantId]))[0];
  const mgrName = mgr?.display_name ?? "Quản lý chi nhánh";
  const notes: [string, string, string, string[], string, string | null, string, string, number, number, string?][] = [
    // kind, title, body, tags, author, agent, confidence, status, uses, daysAgo, source
    ["RULE", "Không báo giá tự động", "Khi khách hỏi giá/chi phí: trả lời theo FAQ-03, mời đặt lịch tư vấn. Không nêu con số vì chưa có bảng giá đã duyệt.", ["giá", "chi phí", "báo giá"], "Chủ doanh nghiệp", null, "HIGH", "ACTIVE", 41, -30, "FAQ-03"],
    ["RULE", "Câu hỏi chuyên môn chuyển chuyên viên", "Mọi câu hỏi về da, màu, phản ứng sau dịch vụ: không trả lời thay chuyên viên. Chuyển quản lý chi nhánh và đánh dấu cần theo dõi.", ["chuyên môn", "sau dịch vụ", "khô", "ngứa", "màu"], "Chủ doanh nghiệp", null, "HIGH", "ACTIVE", 17, -30, "CS-02"],
    ["RULE", "Giờ yên tĩnh 21:00–08:00", "Không gửi tin cho khách trong giờ yên tĩnh. Bản trả lời soạn trong khung này chờ duyệt và gửi sau 08:00.", ["giờ yên tĩnh", "gửi tin"], "Chủ doanh nghiệp", null, "HIGH", "ACTIVE", 23, -28, "CS-01"],
    ["RULE", "Chỉ liên hệ khách đã đồng ý", "Chỉ soạn tin chăm sóc cho khách có đồng ý liên hệ mục đích Chăm sóc còn hiệu lực.", ["đồng ý", "liên hệ"], "Chủ doanh nghiệp", null, "HIGH", "ACTIVE", 35, -28, "CS-01"],
    ["LESSON", "Khách hỏi “mai qua được không” cần hỏi lại buổi", "Quản lý góp ý: khi khách hỏi chung chung về ngày, nêu hai ca 08:00–12:00 / 13:00–17:00 và hỏi khách chọn buổi trước khi kiểm tra lịch trống.", ["đặt lịch", "lịch trống", "mai"], "Agent Chăm sóc khách", "care", "HIGH", "ACTIVE", 12, -9, "Góp ý của quản lý"],
    ["LESSON", "Ưu tiên gọi xác nhận lịch trước 10:00", "Giả thuyết đang theo dõi: gọi xác nhận sớm trong ngày có thể giảm lịch vắng mặt. Chưa đủ dữ liệu để kết luận; agent dùng làm gợi ý hạn giao việc, không dùng làm số liệu.", ["xác nhận", "vắng mặt"], "Agent Chăm sóc khách", "care", "LOW", "ACTIVE", 6, -6, "Giả thuyết vận hành"],
    ["LESSON", "Kiểm tra ca chiều Thứ Sáu trước thứ Tư", "Agent Nhân sự từng phát hiện ca chiều Thứ Sáu tại Chi nhánh Cầu Giấy thấp hơn mức tối thiểu 3 người. Nên rà lịch tuần trước thứ Tư.", ["ca chiều", "thứ sáu", "thiếu người"], "Agent Nhân sự", "hr", "MEDIUM", "ACTIVE", 4, -5, "Lịch làm việc"],
    ["LESSON", "Giả thuyết: việc checklist dài dễ trễ hạn", "Đề xuất theo dõi: việc có từ 6 mục checklist trở lên có thể dễ trễ hạn hơn. Cần quản lý xác nhận trước khi agent dùng để tách việc.", ["checklist", "quá hạn"], "Agent Nhân sự", "hr", "LOW", "PENDING", 0, -1, "Công việc 4 tuần"],
    ["INSIGHT", "Nhóm ý định khách nhắn Zalo", "Các nhóm thường gặp: đặt lịch / hỏi lịch trống, đổi hoặc hủy lịch, hỏi chi phí, tìm hiểu dịch vụ, câu hỏi sau dịch vụ. Số đếm trực tiếp xem ở thẻ “Ý định khách 7 ngày”.", ["zalo", "ý định", "faq"], "Agent Chăm sóc khách", "care", "MEDIUM", "ACTIVE", 3, -1, "Hội thoại 7 ngày"],
    ["INSIGHT", "Đề xuất mốc hỏi thăm dặm màu", "Có khách nhắn hỏi dặm màu sau khoảng một tháng. Đề xuất cân nhắc thêm mốc hỏi thăm dặm màu vào kế hoạch chăm sóc; cần quản lý duyệt.", ["dặm màu", "chăm sóc"], "Agent Chăm sóc khách", "care", "LOW", "PENDING", 0, 0, "Hội thoại Z16"],
    ["INSIGHT", "Thiếu FAQ “Chuẩn bị trước khi đến”", "Có câu hỏi lặp lại về việc cần chuẩn bị gì trước buổi làm nhưng chưa có FAQ đã duyệt; agent đang trả lời chung chung.", ["chuẩn bị", "faq"], "Agent Chăm sóc khách", "care", "HIGH", "PENDING", 0, 0, "Hội thoại Z12"],
    ["MEMORY", "Khách VIP ưu tiên khung chiều", "Nhóm khách được đánh dấu theo dõi thường chọn ca chiều; khi đổi lịch nên đề xuất ca chiều trước.", ["vip", "đổi lịch"], mgrName, null, "MEDIUM", "ACTIVE", 5, -12, "Ghi chú quản lý"],
    ["MEMORY", "Chi nhánh Hà Đông chỉ có 1 phòng mí", "Không xếp hai lịch PMU mí trùng giờ tại Chi nhánh Hà Đông.", ["mí", "hà đông", "phòng"], mgrName, null, "HIGH", "ACTIVE", 8, -20, "Ghi chú quản lý"],
    ["DECISION", "Agent được tự nhắc việc nội bộ (L2)", "Chủ doanh nghiệp cho phép agent tự nhắc việc nội bộ khi quá hạn, tối đa 1 lần/giờ/việc. Gửi khách, đổi ca, xuất bản SOP vẫn cần duyệt.", ["l2", "nhắc việc", "chính sách"], "Chủ doanh nghiệp", null, "HIGH", "ACTIVE", 14, -15, "Cài đặt › Chính sách AI"],
    ["DECISION", "Báo cáo cuối ngày do Agent Báo cáo soạn", "Agent Báo cáo soạn bản nháp lúc cuối ngày; quản lý chi nhánh duyệt trước 18:00.", ["báo cáo", "cuối ngày"], "Chủ doanh nghiệp", null, "HIGH", "ACTIVE", 9, -14, "Báo cáo"],
  ];
  for (const [kind, title, body, tags, author, agent, confidence, status, uses, d, src] of notes)
    await ins(qq, "brain_notes", {
      id: uid(),
      tenant_id: tenantId,
      kind,
      title,
      body,
      tags,
      source_label: src ?? null,
      author_label: author,
      agent,
      confidence,
      status,
      uses,
      last_used_at: uses ? at(Math.max(d, -1), 2) : null,
      reviewed_by_label: status === "ACTIVE" && agent ? mgrName : null,
      biz_created_at: at(d, 8),
    });
  // Nhật ký tra cứu gần đây
  const lookups: [string, string, string[], number][] = [
    ["care", "Khách hỏi giá phun môi", ["Không báo giá tự động", "FAQ-03"], -0.2],
    ["care", "Khách hỏi lịch trống chiều mai", ["FAQ-01", "FAQ-06", "Khách hỏi “mai qua được không” cần hỏi lại buổi"], -0.15],
    ["care", "Khách thấy khô, ngứa sau 3 ngày", ["Câu hỏi chuyên môn chuyển chuyên viên", "CS-02"], -1.2],
    ["hr", "Ca chiều Thứ Sáu thiếu người", ["Thứ Sáu ca chiều Cầu Giấy hay thiếu người"], -0.3],
    ["coordinator", "Giao việc gọi xác nhận lịch ngày mai", ["Gọi xác nhận trước 10:00 giảm lịch vắng mặt"], -0.1],
    ["report", "Soạn báo cáo cuối ngày", ["Báo cáo cuối ngày do Agent Báo cáo soạn"], -1],
  ];
  for (const [agent, query, hits, d] of lookups)
    await ins(qq, "brain_lookups", { id: uid(), tenant_id: tenantId, agent, query, hits: hits.map((h) => ({ label: h })), biz_at: new Date(now.getTime() + d * 86400000) });
}

export const _keep = addDays;
