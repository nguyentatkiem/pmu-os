"use client";
// Sơ đồ hình khối chạy ở đầu mỗi menu: cho người dùng thấy bước nào con người làm, bước nào AI làm.
import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  BookOpen,
  Bot,
  Brain,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  ClipboardList,
  FileChartColumn,
  FileText,
  Heart,
  Inbox,
  KeyRound,
  Link2,
  ListChecks,
  MessageCircle,
  PenLine,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  UserPlus,
  UserRound,
  Users,
  Workflow,
  Lightbulb,
  Clapperboard,
  Film,
  Funnel,
  Megaphone,
} from "lucide-react";

type Step = { icon: React.ElementType; label: string; sub: string; ai?: boolean };
type Flow = { title: string; steps: Step[] };

export const FLOWS: Record<string, Flow> = {
  "/agents": {
    title: "Giao việc cho AI Agent",
    steps: [
      { icon: MessageCircle, label: "Giao việc qua chat", sub: "Một câu tiếng Việt" },
      { icon: Bot, label: "Agent Điều phối", sub: "Hiểu lệnh, kiểm quyền", ai: true },
      { icon: Workflow, label: "Agent chuyên trách", sub: "Nhân sự · CSKH · SOP · Báo cáo", ai: true },
      { icon: Brain, label: "Tra Bộ não thứ 2", sub: "Quy tắc, bài học, FAQ", ai: true },
      { icon: ShieldCheck, label: "Đề xuất chờ duyệt", sub: "Chưa thay đổi dữ liệu", ai: true },
      { icon: BadgeCheck, label: "Quản lý duyệt", sub: "Thực thi đúng 1 lần" },
    ],
  },
  "/people": {
    title: "Vòng đời nhân sự",
    steps: [
      { icon: UserPlus, label: "Hồ sơ nhân sự", sub: "Vị trí, chi nhánh" },
      { icon: KeyRound, label: "Cấp quyền", sub: "Theo vai trò" },
      { icon: CalendarDays, label: "Xếp ca", sub: "Sáng / Chiều" },
      { icon: ClipboardList, label: "Giao việc", sub: "Người hoặc AI đề xuất" },
      { icon: ChartColumn, label: "Đo KPI", sub: "Tự tính từ dữ liệu" },
      { icon: Bot, label: "Agent Nhân sự", sub: "Theo dõi quá hạn, thiếu ca", ai: true },
    ],
  },
  "/shifts": {
    title: "Lập lịch làm việc",
    steps: [
      { icon: CalendarDays, label: "Mẫu ca", sub: "08–12 · 13–17" },
      { icon: PenLine, label: "Xếp ca tuần", sub: "Quản lý chi nhánh" },
      { icon: Bot, label: "Agent Nhân sự kiểm", sub: "Thiếu người, trùng ca", ai: true },
      { icon: ShieldCheck, label: "Đề xuất đổi / bổ sung", sub: "Chờ duyệt", ai: true },
      { icon: BadgeCheck, label: "Duyệt ca", sub: "Người có thẩm quyền" },
      { icon: CalendarCheck, label: "Lịch chốt", sub: "Nhân sự nhận lịch" },
    ],
  },
  "/tasks": {
    title: "Luồng công việc",
    steps: [
      { icon: ClipboardList, label: "Tạo / giao việc", sub: "Người hoặc AI đề xuất" },
      { icon: UserRound, label: "Nhận việc", sub: "Nhân sự phụ trách" },
      { icon: ListChecks, label: "Làm checklist", sub: "Đánh dấu từng bước" },
      { icon: Send, label: "Nộp kết quả", sub: "Kèm ghi chú" },
      { icon: BadgeCheck, label: "Quản lý duyệt", sub: "Hoặc yêu cầu làm lại" },
      { icon: Bot, label: "Agent nhắc quá hạn", sub: "Tự nhắc nội bộ (L2)", ai: true },
    ],
  },
  "/performance": {
    title: "Đo hiệu suất",
    steps: [
      { icon: ClipboardCheck, label: "Dữ liệu thật", sub: "Việc, lịch, phản hồi" },
      { icon: Sparkles, label: "Tính chỉ số", sub: "Theo vai trò", ai: true },
      { icon: Target, label: "So mục tiêu", sub: "Theo kỳ" },
      { icon: Search, label: "Phát hiện cần hỗ trợ", sub: "Không chấm điểm người", ai: true },
      { icon: Users, label: "Quản lý trao đổi", sub: "Con người quyết định" },
    ],
  },
  "/knowledge": {
    title: "Từ SOP đến năng lực đội ngũ",
    steps: [
      { icon: PenLine, label: "Soạn SOP nháp", sub: "Quản lý / chuyên viên" },
      { icon: ShieldCheck, label: "Gửi duyệt", sub: "Người có thẩm quyền" },
      { icon: BookOpen, label: "Xuất bản", sub: "Có phiên bản" },
      { icon: Brain, label: "Vào Bộ não thứ 2", sub: "Agent trích dẫn", ai: true },
      { icon: ClipboardList, label: "Giao bài học", sub: "Theo vị trí" },
      { icon: Bot, label: "Agent Đào tạo", sub: "Nhắc bài sắp hạn", ai: true },
    ],
  },
  "/customers": {
    title: "Hành trình khách hàng",
    steps: [
      { icon: MessageCircle, label: "Khách liên hệ", sub: "Zalo / tại quầy" },
      { icon: UserPlus, label: "Hồ sơ & đồng ý", sub: "Mục đích liên hệ" },
      { icon: Users, label: "Tư vấn", sub: "Chuyên viên" },
      { icon: CalendarClock, label: "Đặt lịch", sub: "Kiểm trùng giờ" },
      { icon: Sparkles, label: "Dịch vụ", sub: "Mày · môi · mí" },
      { icon: Heart, label: "Chăm sóc sau", sub: "Agent CSKH theo dõi", ai: true },
    ],
  },
  "/inbox": {
    title: "Tin Zalo đến → trả lời có duyệt",
    steps: [
      { icon: MessageCircle, label: "Khách nhắn Zalo", sub: "Tin đến hộp thư" },
      { icon: Bot, label: "Agent CSKH đọc tin", sub: "Nhận ý định", ai: true },
      { icon: Brain, label: "Tra Bộ não", sub: "FAQ, quy tắc đã duyệt", ai: true },
      { icon: PenLine, label: "Soạn trả lời sẵn", sub: "Câu chuyên môn → chuyên viên", ai: true },
      { icon: BadgeCheck, label: "Quản lý duyệt", sub: "Sửa nếu cần" },
      { icon: Send, label: "Gửi / ghi nhận", sub: "Zalo chưa nối: gửi tay" },
    ],
  },
  "/appointments": {
    title: "Lịch hẹn không bỏ sót",
    steps: [
      { icon: CalendarClock, label: "Khách chọn giờ", sub: "Theo ca làm việc" },
      { icon: Search, label: "Kiểm trùng lịch", sub: "Gợi ý giờ trống" },
      { icon: CalendarDays, label: "Lịch chờ xác nhận", sub: "Trạng thái rõ ràng" },
      { icon: Bot, label: "Agent giao gọi xác nhận", sub: "Đề xuất cho CSKH", ai: true },
      { icon: Inbox, label: "Nhắc 24h / 2h", sub: "Chặn khi Zalo chưa nối" },
      { icon: CalendarCheck, label: "Check-in", sub: "Khách đến" },
    ],
  },
  "/care": {
    title: "Chăm sóc sau dịch vụ",
    steps: [
      { icon: Sparkles, label: "Dịch vụ xong", sub: "Tạo kế hoạch" },
      { icon: CalendarDays, label: "Điểm chạm đến hạn", sub: "Theo mẫu đã duyệt" },
      { icon: Bot, label: "Agent CSKH soạn", sub: "Chỉ khách đã đồng ý", ai: true },
      { icon: BadgeCheck, label: "Duyệt nội dung", sub: "Không hứa kết quả" },
      { icon: MessageCircle, label: "Liên hệ khách", sub: "Ghi kết quả" },
      { icon: Heart, label: "Phản hồi", sub: "Cần chuyên viên → quản lý" },
    ],
  },
  "/reports": {
    title: "Báo cáo cuối ngày",
    steps: [
      { icon: Bot, label: "Agent Báo cáo gom số", sub: "Theo phạm vi quyền", ai: true },
      { icon: Brain, label: "Tra Bộ não", sub: "Quy định báo cáo", ai: true },
      { icon: FileText, label: "Báo cáo nháp", sub: "Có nguồn, mốc dữ liệu", ai: true },
      { icon: BadgeCheck, label: "Quản lý duyệt", sub: "Trước 18:00" },
      { icon: FileChartColumn, label: "Lưu & xuất", sub: "Lịch sử báo cáo" },
    ],
  },
  "/assistant": {
    title: "Hỏi AI trong phạm vi quyền",
    steps: [
      { icon: MessageCircle, label: "Đặt câu hỏi", sub: "Tiếng Việt" },
      { icon: KeyRound, label: "Kiểm quyền", sub: "Chỉ dữ liệu được xem", ai: true },
      { icon: Search, label: "Tra dữ liệu", sub: "Việc, lịch, khách, SOP", ai: true },
      { icon: FileText, label: "Trả lời có nguồn", sub: "Nêu điểm chưa chắc", ai: true },
      { icon: ShieldCheck, label: "Đề xuất hành động", sub: "Chờ duyệt" },
    ],
  },
  "/approvals": {
    title: "Con người duyệt, hệ thống thực thi",
    steps: [
      { icon: Bot, label: "Agent / nhân sự đề xuất", sub: "Kèm lý do, nguồn", ai: true },
      { icon: KeyRound, label: "Kiểm quyền & phiên bản", sub: "Chặn dữ liệu cũ", ai: true },
      { icon: BadgeCheck, label: "Người có thẩm quyền duyệt", sub: "Duyệt / trả lại / từ chối" },
      { icon: Workflow, label: "Thực thi đúng 1 lần", sub: "Chống lặp" },
      { icon: Brain, label: "Ghi nhật ký & Bộ não", sub: "Agent học từ quyết định", ai: true },
    ],
  },
  "/brain": {
    title: "Bộ não thứ 2 học như thế nào",
    steps: [
      { icon: ClipboardCheck, label: "Dữ liệu vận hành", sub: "Tin nhắn, ca, việc, duyệt" },
      { icon: Bot, label: "Agent rút bài học", sub: "Insight, bài học", ai: true },
      { icon: BadgeCheck, label: "Quản lý duyệt", sub: "Chỉ mục duyệt mới dùng" },
      { icon: Brain, label: "Bộ não thứ 2", sub: "Quy tắc, ghi nhớ, FAQ, SOP" },
      { icon: Sparkles, label: "Agent dùng khi làm", sub: "Trích dẫn nguồn", ai: true },
    ],
  },
  "/marketing": {
    title: "Dây chuyền video kênh Tiệm nói thật",
    steps: [
      { icon: Lightbulb, label: "Ý tưởng", sub: "Agent đề xuất theo vòng A, D, B, C", ai: true },
      { icon: PenLine, label: "Kịch bản", sub: "Máy kiểm luật kênh", ai: true },
      { icon: Film, label: "Quay & dựng", sub: "Google Flow + công cụ dựng", ai: true },
      { icon: BadgeCheck, label: "Kiểm duyệt", sub: "Nghe giọng, thợ duyệt câu chuyên môn" },
      { icon: CalendarCheck, label: "Xếp lịch đăng", sub: "06:00–07:00, riêng tư trước" },
      { icon: Funnel, label: "Đo vào phễu", sub: "Tin Zalo, khách nguồn TikTok" },
    ],
  },
  "/funnel": {
    title: "Phễu khách hàng",
    steps: [
      { icon: Clapperboard, label: "Xem nội dung", sub: "Dạng D kéo người mới" },
      { icon: MessageCircle, label: "Quan tâm, nhắn Zalo", sub: "Agent CSKH trả lời sẵn", ai: true },
      { icon: Users, label: "Tư vấn", sub: "Dạng A, B, C xây niềm tin" },
      { icon: CalendarClock, label: "Đặt lịch", sub: "Agent giao gọi xác nhận", ai: true },
      { icon: Sparkles, label: "Dịch vụ", sub: "Kết quả thật của tiệm" },
      { icon: Heart, label: "Chăm sóc, quay lại", sub: "Dặm màu, giới thiệu" },
    ],
  },
  "/channels": {
    title: "Xây một kênh nội dung",
    steps: [
      { icon: Search, label: "Quét kênh gốc", sub: "58 kênh, 31.679 video", ai: true },
      { icon: Bot, label: "Agent lập kế hoạch", sub: "Concept, dạng, tỷ trọng", ai: true },
      { icon: ShieldCheck, label: "Đề xuất chờ chốt", sub: "Giọng, tốc độ, nhân vật", ai: true },
      { icon: BadgeCheck, label: "Sếp duyệt", sub: "Cập nhật kế hoạch kênh" },
      { icon: Megaphone, label: "Chạy kênh", sub: "Lô video mỗi tuần" },
      { icon: Funnel, label: "Đo và chỉnh", sub: "Sau 20 video" },
    ],
  },
  "/settings": {
    title: "Thiết lập hệ thống",
    steps: [
      { icon: Settings, label: "Doanh nghiệp & chi nhánh", sub: "Dịch vụ, giờ làm" },
      { icon: Users, label: "Thành viên & quyền", sub: "Ma trận quyền" },
      { icon: Sparkles, label: "Chính sách AI", sub: "L0 · L1 · L2" },
      { icon: Link2, label: "Tích hợp Zalo", sub: "Chưa kết nối" },
      { icon: FileText, label: "Nhật ký", sub: "Mọi thao tác có vết" },
    ],
  },
};

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(m.matches);
    const h = () => setR(m.matches);
    m.addEventListener?.("change", h);
    return () => m.removeEventListener?.("change", h);
  }, []);
  return r;
}

export function FlowSteps({ steps, active, compact }: { steps: Step[]; active: number; compact?: boolean }) {
  return (
    <div className={`flow-steps ${compact ? "compact" : ""}`}>
      {steps.map((s, i) => {
        const Icon = s.icon;
        const state = i === active ? "on" : i < active ? "done" : "";
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <span className={`flow-link ${i === active ? "run" : i < active ? "done" : ""}`} aria-hidden>
                <i />
              </span>
            )}
            <div className={`flow-step ${s.ai ? "ai" : ""} ${state}`}>
              <span className="fs-ico">
                <Icon size={18} />
              </span>
              <span className="fs-txt">
                <b>{s.label}</b>
                <small>{s.sub}</small>
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function FlowStrip() {
  const pathname = usePathname();
  const key = Object.keys(FLOWS).find((k) => pathname === k || pathname.startsWith(k + "/"));
  const flow = key ? FLOWS[key] : null;
  const [hidden, setHidden] = useState(false);
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    try {
      setHidden(localStorage.getItem("pmu_flow_hidden") === "1");
    } catch {}
  }, []);
  useEffect(() => {
    setActive(0);
    if (!flow || hidden || reduced) return;
    const t = setInterval(() => setActive((a) => (a + 1) % flow.steps.length), 1500);
    return () => clearInterval(t);
  }, [flow, hidden, reduced]);
  if (!flow) return null;
  const toggle = () => {
    setHidden((h) => {
      try {
        localStorage.setItem("pmu_flow_hidden", h ? "0" : "1");
      } catch {}
      return !h;
    });
  };
  return (
    <section className={`flow-strip ${hidden ? "collapsed" : ""}`} aria-label={`Sơ đồ luồng: ${flow.title}`}>
      <div className="flow-head">
        <Workflow size={16} />
        <b>Luồng vận hành: {flow.title}</b>
        <span className="flow-legend desktop-only">
          <span className="lg-ai" /> AI làm <span className="lg-hu" /> Con người làm
        </span>
        <button className="btn btn-ghost btn-sm" onClick={toggle} aria-expanded={!hidden}>
          {hidden ? (
            <>
              <ChevronDown size={16} /> Hiện sơ đồ
            </>
          ) : (
            <>
              <ChevronUp size={16} /> Ẩn sơ đồ
            </>
          )}
        </button>
      </div>
      {!hidden && <FlowSteps steps={flow.steps} active={reduced ? -1 : active} />}
    </section>
  );
}
