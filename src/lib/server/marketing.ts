// Hệ thống Marketing: kênh "Tiệm nói thật" do Agent Xây kênh dựng (skill flow-phun-xam-tiem-noi-that),
// lô video, kiểm duyệt trước khi đăng, phễu khách hàng.
// Video thật nằm trên máy chạy phần mềm (thư mục media), chỉ phát cho người đã đăng nhập; không đưa lên mã nguồn.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { q, one, uid, j, type Q } from "./db";
import type { Ctx } from "./auth";
import { norm } from "./ai";
import { STAGES } from "../shared/labels";

export const VIDEO_STATUS_LABEL: Record<string, string> = {
  IDEA: "Ý tưởng",
  SCRIPTED: "Có kịch bản",
  PRODUCED: "Đã quay & dựng",
  IN_REVIEW: "Chờ kiểm duyệt",
  REVISE: "Cần sửa",
  APPROVED: "Đã duyệt",
  SCHEDULED: "Đã xếp lịch đăng",
  PUBLISHED: "Đã đăng",
  REJECTED: "Loại",
};
export const FORMAT_LABEL: Record<string, string> = {
  A: "A · Khách đòi, thợ từ chối",
  B: "B · Ca khó, nói thật",
  C: "C · Giải nghề",
  D: "D · Chuyện tiệm",
};

// ---------------- Thư mục media trên máy ----------------
export function mediaDir(): string | null {
  const d = process.env.MARKETING_MEDIA_DIR || (process.env.VERCEL ? "" : path.join(homedir(), "Documents/TIEM-NOI-THAT"));
  return d && existsSync(d) ? d : null;
}
export function resolveMedia(ref: string | null | undefined): string | null {
  const base = mediaDir();
  if (!base || !ref) return null;
  const full = path.resolve(base, ref);
  if (!full.startsWith(path.resolve(base) + path.sep)) return null; // chặn đi ra ngoài thư mục media
  return existsSync(full) && statSync(full).isFile() ? full : null;
}

// ---------------- Kiểm luật kịch bản ----------------
export interface ScriptLine {
  speaker: string;
  text: string;
  expert?: boolean;
}
export interface ScriptClip {
  name: string;
  lines: ScriptLine[];
}
export interface Check {
  level: "block" | "warn" | "ok";
  text: string;
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const BANNED: [RegExp, string][] = [
  [/(tốt|đẹp|rẻ|uy tín|chuẩn|xịn)\s*nhất|số\s*một|hàng\s*đầu/i, "Dùng từ tuyệt đối (“nhất”, “số một”, “hàng đầu”)"],
  [/100\s*%|cam\s*kết|bảo\s*hành\s*trọn\s*đời|vĩnh\s*viễn|không\s*đau|bền\s*\d+\s*năm/i, "Hứa kết quả (100%, cam kết, không đau, bền N năm)"],
  [/\d[\d.,]*\s*(k|nghìn|ngàn|triệu|tr|đ|đồng|vnđ)\b/i, "Nêu giá khi chưa có bảng giá thật"],
  [/ưu\s*đãi|giảm\s*giá|khuyến\s*mãi|tặng\s*kèm/i, "Nêu ưu đãi chưa có thật"],
  [/trước\s*(và|-|\/)\s*sau|before\s*after/i, "Nội dung trước và sau (cấm dựng bằng AI)"],
  [/tiêm\s*tê|gây\s*tê/i, "Nhắc tiêm tê (cấm ngoài cơ sở y tế)"],
];
const EXPERT_HINT = /mực|bong|bền|kiêng|lành|sưng|thâm|hồng cánh sen|ngả xanh|xanh|màu|mấy năm|bao lâu|mấy ngày|dặm|ổn định|hồi phục|phục hồi|đau|rát/i;

export function checkScript(input: { headline?: string | null; clips: ScriptClip[]; caption?: string | null; ai_label?: boolean }): Check[] {
  const out: Check[] = [];
  if (input.headline && input.headline.length > 40) out.push({ level: "warn", text: `Tiêu đề đỏ dài ${input.headline.length} ký tự (tối đa 40).` });
  input.clips.forEach((c, i) => {
    const n = c.lines.reduce((s, l) => s + words(l.text), 0);
    const turns = c.lines.length;
    const max = turns >= 5 ? 30 : 38;
    if (n > max) out.push({ level: "warn", text: `Clip ${c.name || i + 1}: ${n} từ, ${turns} lượt lời (tối đa ${max} từ cho clip 15 giây).` });
    c.lines.forEach((l) => {
      for (const sent of l.text.split(/[.!?…]+/).map((x) => x.trim()).filter(Boolean))
        if (words(sent) > 12) out.push({ level: "warn", text: `Câu dài hơn 12 từ: “${sent}”.` });
    });
  });
  const all = [input.headline ?? "", ...input.clips.flatMap((c) => c.lines.map((l) => l.text)), input.caption ?? ""].join(" \n ");
  for (const [re, label] of BANNED) if (re.test(all)) out.push({ level: "block", text: `${label}.` });
  const lastLines = input.clips.flatMap((c) => c.lines).filter((l) => l.expert || EXPERT_HINT.test(l.text));
  if (lastLines.length) out.push({ level: "warn", text: `${lastLines.length} câu có nội dung chuyên môn cần thợ thật duyệt: ${lastLines.map((l) => `“${l.text}”`).join(", ")}.` });
  if (!/tạo bằng AI|do AI tạo/i.test(input.caption ?? "")) out.push({ level: "block", text: "Caption thiếu dòng “Tình huống minh hoạ, video tạo bằng AI.”" });
  if (!out.some((c) => c.level !== "ok")) out.push({ level: "ok", text: "Không phát hiện vi phạm theo bộ luật kênh." });
  return out;
}
export const markExpert = (clips: ScriptClip[]): ScriptClip[] => clips.map((c) => ({ ...c, lines: c.lines.map((l) => (l.expert || EXPERT_HINT.test(l.text) ? { ...l, expert: true } : l)) }));
export const needsExpert = (clips: ScriptClip[]) => clips.some((c) => c.lines.some((l) => l.expert || EXPERT_HINT.test(l.text)));

export const REVIEW_CHECKLIST: { key: string; label: string; required: boolean }[] = [
  { key: "listened", label: "Đã nghe lại toàn bộ lời và chất giọng", required: true },
  { key: "lipsync", label: "Khớp miệng đúng người nói", required: true },
  { key: "ai_label", label: "Có nhãn “Tình huống minh hoạ · Nhân vật do AI tạo” trên hình và caption", required: true },
  { key: "no_before_after", label: "Không có ảnh trước/sau, cảnh kim trên da, kết quả trên da do AI tạo", required: true },
  { key: "no_promise", label: "Không hứa kết quả, không nêu giá/ưu đãi chưa có thật, không dùng “nhất”", required: true },
  { key: "no_body_shaming", label: "Không chê ngoại hình khách để gây cười", required: true },
  { key: "funny", label: "Có buồn cười ở nửa đầu, câu nói thật ở cuối", required: false },
];

// ---------------- Nội dung kênh do Agent Xây kênh dựng ----------------
const CH = {
  key: "tiem-noi-that",
  name: "Tiệm nói thật",
  platform: "TikTok · Facebook Reels",
  concept:
    "Phim tình huống 20 đến 35 giây tại một tiệm phun xăm cố định. Toàn bộ nhân vật là người AI tả thực tạo trên Google Flow (thợ chính, phụ tá, các khách mẫu). Luật “hài trước, thật sau”: nửa đầu gây cười bằng một đòi hỏi trái khoáy, câu cuối là một câu nói thật của thợ. AI kể tình huống, người thật đưa bằng chứng.",
  formats: [
    { key: "A", name: "Khách đòi, thợ từ chối", weight: 40, stage: "Giữa phễu: xây niềm tin", desc: "Khách đòi một điều thợ có tay nghề sẽ không làm; thợ từ chối theo đúng khuôn mặt, lịch của khách." },
    { key: "D", name: "Chuyện tiệm", weight: 30, stage: "Đầu phễu: kéo người xem mới", desc: "Hài thuần giữa thợ, phụ tá và khách, không nói chuyên môn." },
    { key: "B", name: "Ca khó, nói thật", weight: 20, stage: "Giữa phễu: xây niềm tin", desc: "Khách mang hậu quả cũ hoặc hiểu lầm phổ biến; thợ nói điều khách không muốn nghe." },
    { key: "C", name: "Giải nghề", weight: 10, stage: "Giữa phễu: giải đáp trước khi đặt lịch", desc: "Phụ tá hỏi thay khán giả, thợ trả lời bằng một ví dụ. Mỗi tập đúng một ý." },
  ],
  rules: [
    "Không tạo ảnh hay video trước và sau, kết quả trên da, quy trình đi kim bằng AI.",
    "Luôn giữ nhãn “Tình huống minh hoạ · Nhân vật do AI tạo” trên hình và bật nhãn AI của nền tảng.",
    "Không dùng khuôn mặt, tên, lời thoại của tiệm, thợ, khách có thật; không chép kịch bản kênh khác.",
    "Không hứa kết quả, không nêu giá hay ưu đãi khi chưa có thật, không dùng “nhất”, “số một”, “cam kết 100%”.",
    "Mọi câu chuyên môn (màu mực, thời gian bong, độ bền, kiêng gì) phải được thợ thật duyệt trước khi đăng.",
    "Không chê ngoại hình khách để gây cười; cười vào tình huống, không cười vào khuôn mặt.",
    "Không tạo nhân vật dưới 18 tuổi, không dựng cảnh hay mời dịch vụ có tiêm tê.",
    "Không đăng công khai khi chưa có người nghe lại lời, giọng và chưa có thợ thật duyệt câu chuyên môn.",
  ],
  legal: [
    "Luật Quảng cáo 2012 Điều 8 khoản 9 và Luật 75/2025: cấm quảng cáo gây nhầm lẫn về chất lượng, công dụng.",
    "Nghị định 87/2026: phạt 80 đến 100 triệu đồng với quảng cáo gây nhầm lẫn.",
    "Luật Trí tuệ nhân tạo 134/2025 Điều 11 và Nghị định 142/2026 Điều 18: nội dung do AI tạo phải gắn nhãn.",
    "Nghị định 96/2023: không phun xăm có tiêm tê ngoài bệnh viện, phòng khám.",
  ],
  legal_note: "Tóm tắt từ bản sao văn bản, chưa đối chiếu Công báo. Cần người có chuyên môn pháp lý xác nhận trước khi dùng làm căn cứ.",
  evidence: {
    channels: 58,
    videos: 31679,
    scanned_on: "15/11/2026",
    insights: [
      "Kênh phun xăm có view cao nhất trong mẫu thắng bằng tiểu phẩm hài, không bằng kiến thức: trung vị 389,6 nghìn view trên 158 video 12 tháng qua; trong 27 video top chỉ 1 video nói về phun xăm.",
      "Chủ đề trong mô tả gần như không quyết định view: video gắn chữ “tư vấn, nên hay không” bùng 18,9%, thấp hơn mức nền 20,7%.",
      "Câu nói thật vẫn có người xem khi kể hay: có video “sự thật là…” đạt trên 2 triệu view.",
      "Hình thức đo được: dài trung vị 32 giây, trung vị 2 lần cắt, một bối cảnh hai người, tiêu đề đỏ viền trắng, phụ đề chữ thường, 30/30 video top không ghép nhạc, đăng 6h đến 7h sáng.",
      "Giới hạn: chưa có số liệu nối view với khách đặt lịch. Đo lại sau 20 video đầu của chính kênh.",
    ],
  },
  settings: { giong: "Miền Bắc (chưa chốt)", toc_do: "x1,0 (chưa chốt)", gio_dang: "06:00–07:00", che_do_dang: "Riêng tư trước, Sếp xem rồi mới công khai", flow_project: "TIỆM NÓI THẬT" },
  plan: {
    cadence: "1 video mỗi ngày, đăng 06:00–07:00, mặc định riêng tư để Sếp xem trước.",
    ratio: "Vòng A, D, A, B, A, D, C (A 40%, D 30%, B 20%, C 10%); chỉnh lại theo số thật sau 20 video.",
    cost: "Khoảng 60 tín dụng Flow cho mỗi clip 15 giây; một video 2 clip ≈ 120 tín dụng (đo 13–16/11/2026).",
    kpi: [
      "Đo lại công thức sau 20 video đầu của chính kênh (view trung vị, tỷ lệ xem hết, lượt lưu).",
      "Theo dõi tin nhắn Zalo và khách mới có nguồn TikTok trong hồ sơ khách để nối kênh với phễu.",
      "Chưa đặt mục tiêu số: chưa có dữ liệu nối view với khách đặt lịch.",
    ],
    phases: [
      { name: "Tuần 0 · Bản thử", items: ["Quay và dựng 3 video thử A1, D1, D2 (đã xong, 420 tín dụng)", "Sếp nghe giọng, khớp miệng, độ buồn cười", "Thợ thật duyệt câu chuyên môn của A1"] },
      { name: "Tuần 1 · Ra mắt", items: ["Lô 02: 7 video theo vòng A, D, A, B, A, D, C", "Tạo 4 nhân vật còn lại trên Flow (0 tín dụng)", "Ghim 3 video kết quả thật của tiệm lên đầu kênh"] },
      { name: "Tuần 2–4 · Đo và chỉnh", items: ["Đăng đều 06:00–07:00", "Đo view, lượt lưu, tin nhắn Zalo theo từng dạng video", "Sau 20 video: chỉnh tỷ trọng các dạng theo số thật"] },
    ],
    prerequisites: [
      { text: "Tên tiệm thật (chữ góc video, hashtag riêng)", done: false },
      { text: "Thợ thật nhận duyệt mọi câu chuyên môn", done: false },
      { text: "3 video kết quả thật của tiệm để ghim đầu kênh, album ảnh thật ở hồ sơ", done: false },
      { text: "Chốt giọng vùng miền của nhân vật", done: false },
      { text: "Chốt tốc độ dựng", done: false },
      { text: "Quy trình gắn nhãn AI trên hình và trên nền tảng", done: true },
    ],
  },
};

const CHARACTERS: [string, string, string, string, string, string, string | null][] = [
  // tên, vai, dạng, giọng, mô tả, trạng thái, ngày tạo
  ["Thợ Chính", "Chủ tiệm, 36 tuổi, điềm tĩnh, nói thẳng, hài khô", "Mọi dạng", "Sulafat (ấm)", "Tóc đen búi thấp, khuyên ngọc trai nhỏ, áo cổ tàu màu ngà, tạp dề xanh rêu", "CREATED", "15/11/2026"],
  ["Khách Mê Ảnh Mạng", "Nhân viên văn phòng 24 tuổi, mê ảnh trên mạng, hay nài", "A", "Leda (trẻ)", "Tóc nâu ngang vai mái rẽ, mày thưa nhạt, sơ mi xanh nhạt", "CREATED", "15/11/2026"],
  ["Phụ Tá", "Nhân viên tiệm 22 tuổi, lanh, hay đùa, hay hỏi thay khán giả", "C, D", "Achernar (cao)", "Tóc đen ngang vai có kẹp nhỏ, áo cổ tàu màu ngà", "CREATED", "16/11/2026"],
  ["Cô Dâu Vội", "27 tuổi, sắp cưới, cái gì cũng muốn xong ngay", "A", "Laomedeia (tươi vui)", "Tóc đen dài gợn sóng, áo len trắng, nhẫn đính hôn nhỏ", "PLANNED", null],
  ["Chị Mày Hỏng", "41 tuổi, từng làm hỏng mày nơi khác, đề phòng, hỏi vặn", "B", "Kore (dứt khoát)", "Mày phun cũ ngả xanh xám, tóc bob ngắn, blazer lanh màu be", "PLANNED", null],
  ["Anh Văn Phòng", "31 tuổi, lần đầu vào tiệm phun xăm, ngại, hay nói nhỏ", "A, B", "Puck (nam)", "Tóc ngắn gọn, mày thưa không đều, sơ mi xám xắn tay", "PLANNED", null],
  ["Cô U58", "58 tuổi, hiền, sợ đau, hay kể chuyện con cháu", "A, B", "Aoede (nhẹ nhàng)", "Tóc muối tiêu buộc thấp, mày rất mỏng nhạt, áo hoa tím", "PLANNED", null],
];

type SeedVideo = {
  code: string;
  format: "A" | "B" | "C" | "D";
  title: string;
  headline?: string;
  situation: string;
  characters: string[];
  clips?: ScriptClip[];
  caption?: string;
  hashtags?: string;
  status: string;
  duration_s?: number;
  credits?: number;
  production?: Record<string, unknown>;
  media_ref?: string;
};

const L = (speaker: string, text: string, expert = false): ScriptLine => ({ speaker, text, ...(expert ? { expert: true } : {}) });

const BATCH1: SeedVideo[] = [
  {
    code: "A1",
    format: "A",
    title: "Mẫu mày trên mạng",
    headline: "Có tiền mà chị cũng từ chối à?",
    situation: "Khách mang ảnh mày trang điểm trên mạng, đòi phun đậm y hệt; thợ từ chối.",
    characters: ["Thợ Chính", "Khách Mê Ảnh Mạng"],
    clips: [
      { name: "T1 · A1-T1 doi may", lines: [L("Khách", "Chị ơi, em muốn đôi mày y hệt ảnh này."), L("Thợ", "Ảnh này là trang điểm để chụp hình thôi em."), L("Khách", "Thì chị cứ phun đậm y vậy đi."), L("Thợ", "Đậm vậy, ngủ dậy em trông như đang giận cả nhà.")] },
      { name: "T2 · A1-T2 tu choi", lines: [L("Khách", "Nhưng em thích sắc nét, khỏi phải kẻ."), L("Thợ", "Chị làm được. Nhưng chị không làm cho em."), L("Khách", "Ơ, có tiền mà chị cũng từ chối à?"), L("Thợ", "Mày ở trên mặt em mấy năm, đâu phải một tấm ảnh.", true)] },
    ],
    caption: "Bạn chọn dáng mày theo ảnh mạng hay theo mặt mình?\nTình huống minh hoạ, video tạo bằng AI.",
    hashtags: "#phunxamthammy #phunmay",
    status: "IN_REVIEW",
    duration_s: 22.0,
    credits: 120,
    production: { loi: "ĐẠT (đã cắt cụm lặp “Đậm vậy” ở clip T1)", giong: "TÁCH BẠCH (thợ 190–207 Hz, khách 225–329 Hz)", mieng: "Chưa có người nghe bằng tai", ngay_dung: "16/11/2026" },
    media_ref: "2026-11-15-A-mau-may-tren-mang-THU/tiem-noi-that-A1-mau-may-THU.mp4",
  },
  {
    code: "D1",
    format: "D",
    title: "Phun mày trả góp theo sợi",
    headline: "Phun mày trả góp theo sợi",
    situation: "Khách xin phun một bên mày vì tháng này mới đủ tiền; thợ nhận lời theo cách còn trái khoáy hơn.",
    characters: ["Thợ Chính", "Khách Mê Ảnh Mạng"],
    clips: [
      { name: "T1 · D1-T1 mot ben", lines: [L("Khách", "Chị ơi, phun một bên mày được không?"), L("Thợ", "Một bên? Bên kia em để dành à?"), L("Khách", "Tháng này em mới đủ tiền một bên."), L("Thợ", "Thế cả tháng em đi nghiêng một bên à?")] },
      { name: "T2 · D1-T2 ba soi", lines: [L("Khách", "Em thả tóc mái che bên kia là xong."), L("Thợ", "Gió thổi một cái là lộ ngay em ạ."), L("Khách", "Hay chị cho em trả góp theo từng sợi?"), L("Thợ", "Được. Mỗi tháng chị vẽ cho em ba sợi.")] },
    ],
    caption: "Mày thì phải đủ đôi, còn trả góp thì... để chị tính.\nTình huống minh hoạ, video tạo bằng AI. Tiệm không có gói phun một bên hay trả góp theo sợi.",
    hashtags: "#phunxamthammy #phunmay",
    status: "IN_REVIEW",
    duration_s: 19.7,
    credits: 120,
    production: { loi: "ĐẠT ngay lần đầu", giong: "Đã soát miệng: đúng người nói", mieng: "Chưa có người nghe bằng tai", ngay_dung: "16/11/2026" },
    media_ref: "2026-11-16-D-tra-gop-theo-soi-THU/tiem-noi-that-D1-tra-gop-theo-soi-THU.mp4",
  },
  {
    code: "D2",
    format: "D",
    title: "Dáng mày người yêu cũ, nhìn là tiếc",
    headline: "Dáng mày người yêu cũ, nhìn là tiếc",
    situation: "Phụ tá đặt tên ba dáng mày tăng dần; thợ hỏi dáng thứ tư để lật lại chính phụ tá.",
    characters: ["Thợ Chính", "Phụ Tá"],
    clips: [
      { name: "T1 · D2-T1 dat ten", lines: [L("Phụ tá", "Chị ơi, em đặt tên cho mấy dáng mày rồi."), L("Thợ", "Tên gì, đọc chị nghe."), L("Phụ tá", "Dáng một, mày thứ Hai, nhìn là mệt."), L("Thợ", "Dáng hai?"), L("Phụ tá", "Mày người yêu cũ, nhìn là tiếc.")] },
      { name: "T2 · D2-T2b loi ngan", lines: [L("Thợ", "Dáng ba?"), L("Phụ tá", "Mày mẹ chồng, nhìn là khép nép."), L("Thợ", "Thế có dáng mày chăm chỉ không?"), L("Phụ tá", "Dạ, dáng đó em chưa nghĩ ra."), L("Thợ", "Vì em đã làm bao giờ đâu.")] },
    ],
    caption: "Tiệm bạn có đứa em nào giống vậy không?\nTình huống minh hoạ, video tạo bằng AI.",
    hashtags: "#phunxamthammy #phunmay",
    status: "IN_REVIEW",
    duration_s: 20.9,
    credits: 180,
    production: { loi: "ĐẠT sau khi quay lại clip T2 (bản đầu 38 từ hụt chữ cuối)", giong: "Cặp giọng không tách được bằng cao độ; đã soát miệng: đúng người nói", mieng: "Chưa có người nghe bằng tai", ngay_dung: "16/11/2026" },
    media_ref: "2026-11-16-D-dat-ten-dang-may-THU/tiem-noi-that-D2-dat-ten-dang-may-THU.mp4",
  },
];

const BATCH2: SeedVideo[] = [
  { code: "A2", format: "A", title: "Cô dâu cưới sau ba ngày đòi phun môi", situation: "Cô dâu cưới sau ba ngày đòi phun môi cho kịp chụp ảnh cưới.", characters: ["Thợ Chính", "Cô Dâu Vội"], status: "IDEA" },
  { code: "D3", format: "D", title: "Phụ tá lần đầu nghe máy đặt lịch", situation: "Phụ tá lần đầu nghe điện thoại đặt lịch, trả lời lạc đề.", characters: ["Thợ Chính", "Phụ Tá"], status: "IDEA" },
  { code: "A3", format: "A", title: "Anh văn phòng đòi mày đậm như diễn viên", situation: "Anh văn phòng lần đầu vào tiệm, đòi mày đậm như diễn viên.", characters: ["Thợ Chính", "Anh Văn Phòng"], status: "IDEA" },
  { code: "B1", format: "B", title: "Mày cũ ngả xanh xin phun đè cho nhanh", situation: "Khách có mày cũ ngả xanh, xin phun đè cho nhanh; thợ nói thật vì sao không làm vậy.", characters: ["Thợ Chính", "Chị Mày Hỏng"], status: "IDEA" },
  { code: "A4", format: "A", title: "Cô U58 đòi môi đỏ như hồi con gái", situation: "Cô 58 tuổi đòi môi đỏ như hồi con gái.", characters: ["Thợ Chính", "Cô U58"], status: "IDEA" },
  { code: "D4", format: "D", title: "Khách dắt chồng theo để chồng quyết dáng mày", situation: "Khách dắt chồng theo để chồng quyết dáng mày.", characters: ["Thợ Chính", "Khách Mê Ảnh Mạng"], status: "IDEA" },
  { code: "C1", format: "C", title: "Phun môi có hết thâm không?", situation: "Phụ tá hỏi thay khán giả: phun môi có hết thâm không; thợ trả lời bằng một ví dụ (cần thợ thật duyệt).", characters: ["Thợ Chính", "Phụ Tá"], status: "IDEA" },
];

const BRAIN_LESSONS: [string, string, string, string[], string][] = [
  ["INSIGHT", "Kênh phun xăm thắng bằng tiểu phẩm hài", "Quét 58 kênh, 31.679 video (15/11/2026): kênh view cao nhất thắng bằng tiểu phẩm hài; chủ đề “tư vấn” không làm tăng view. Mỗi tập: hài trước, nói thật sau.", ["kênh", "video", "tiktok", "phun xăm", "hài"], "skill:tiem:hai-truoc"],
  ["LESSON", "Clip 15 giây: 33–38 từ, 5 lượt lời tối đa 30 từ", "Flow nói 2,7–2,9 từ mỗi giây. Mỗi lần đổi người nói tốn khoảng 1 giây nghỉ; 38 từ với 5 lượt lời là tràn 15 giây và hụt chữ cuối.", ["kịch bản", "clip", "flow", "số từ"], "skill:tiem:so-tu"],
  ["LESSON", "Cặp giọng Sulafat và Achernar phải soát miệng", "Hai giọng chồng cao độ, công cụ kiểm giọng báo LẪN dù không lẫn. Với cặp Thợ Chính và Phụ Tá phải cắt khung cận gương mặt để xem ai mở miệng.", ["giọng", "kiểm duyệt", "khớp miệng", "flow"], "skill:tiem:giong"],
  ["LESSON", "Không thêm câu dặn phát âm vào prompt video", "Câu dặn cách phát âm hay tốc độ đọc từng làm Flow từ chối theo chính sách. Flow hay nói lặp một cụm: cắt ở khâu dựng, không quay lại.", ["prompt", "flow", "video"], "skill:tiem:prompt"],
  ["RULE", "Video AI không dựng kết quả trên da", "Không tạo ảnh/video trước và sau, cảnh kim trên da, phản hồi khách bằng AI. Kết quả thật phải là ảnh, clip thật của tiệm thật.", ["video", "ai", "trước sau", "kiểm duyệt", "kênh"], "skill:tiem:truoc-sau"],
];

const insRow = async (qq: Q, table: string, row: Record<string, unknown>, arrays: string[] = []) => {
  const keys = Object.keys(row);
  const vals = keys.map((k) => {
    const v = row[k];
    if (v instanceof Date || v === null || v === undefined) return v ?? null;
    if (Array.isArray(v) && arrays.includes(k)) return v;
    if (typeof v === "object") return JSON.stringify(v);
    return v;
  });
  await qq(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")})`, vals);
};

/** Dựng kênh “Tiệm nói thật” cho một doanh nghiệp (chạy một lần, an toàn khi gọi lại). */
export async function seedMarketing(qq: Q, tenantId: string, now: Date) {
  const exists = await qq<any>("SELECT id FROM mkt_channels WHERE tenant_id=$1 AND key=$2", [tenantId, CH.key]);
  if (exists[0]) return exists[0].id as string;
  const chId = uid();
  const day = (d: number) => new Date(now.getTime() + d * 86400000);
  await insRow(qq, "mkt_channels", {
    id: chId,
    tenant_id: tenantId,
    key: CH.key,
    name: CH.name,
    platform: CH.platform,
    concept: CH.concept,
    status: "TRIAL",
    formats: CH.formats,
    rules: { content: CH.rules, legal: CH.legal, legal_note: CH.legal_note },
    evidence: CH.evidence,
    settings: CH.settings,
    plan: CH.plan,
    agent: "channel",
    biz_created_at: day(-1),
  });
  for (const [name, role, formats, voice, description, status, on] of CHARACTERS)
    await insRow(qq, "mkt_characters", { id: uid(), tenant_id: tenantId, channel_id: chId, name, role, formats, voice, description, status, created_on: on });
  const b1 = uid();
  const b2 = uid();
  await insRow(qq, "mkt_batches", { id: b1, tenant_id: tenantId, channel_id: chId, code: "LO-01", title: "Lô 01 · Bản thử", status: "REVIEW", note: "3 video thử (420 tín dụng Flow). Chờ Sếp nghe giọng, khớp miệng, độ buồn cười; chưa đăng.", biz_created_at: day(-1) });
  await insRow(qq, "mkt_batches", { id: b2, tenant_id: tenantId, channel_id: chId, code: "LO-02", title: "Lô 02 · Tuần ra mắt", status: "PLANNING", note: "7 video theo vòng A, D, A, B, A, D, C. Dự kiến khoảng 840 tín dụng (7 video × 2 clip × 60).", biz_created_at: now });
  for (const [batch, list] of [
    [b1, BATCH1],
    [b2, BATCH2],
  ] as [string, SeedVideo[]][])
    for (const v of list)
      await insRow(
        qq,
        "mkt_videos",
        {
          id: uid(),
          tenant_id: tenantId,
          channel_id: chId,
          batch_id: batch,
          code: v.code,
          format: v.format,
          title: v.title,
          headline: v.headline ?? null,
          situation: v.situation,
          characters: v.characters,
          script: v.clips ?? [],
          caption: v.caption ?? null,
          hashtags: v.hashtags ?? null,
          status: v.status,
          duration_s: v.duration_s ?? null,
          credits: v.credits ?? 0,
          production: v.production ?? {},
          media_ref: v.media_ref ?? null,
          biz_created_at: v.status === "IDEA" ? now : day(-0.5),
        },
        ["characters"],
      );
  // Ghi nhận các lượt gửi kiểm duyệt của lô 01
  const vids = await qq<any>("SELECT id FROM mkt_videos WHERE tenant_id=$1 AND batch_id=$2", [tenantId, b1]);
  for (const v of vids)
    await insRow(qq, "mkt_reviews", { id: uid(), tenant_id: tenantId, video_id: v.id, reviewer_label: "Agent Xây kênh", decision: "SUBMIT", reason: "Dựng xong, lời máy kiểm ĐẠT. Gửi người nghe bằng tai.", biz_at: day(-0.4) });

  // Bài học của agent vào Bộ não thứ 2
  for (const [kind, title, body, tags, key] of BRAIN_LESSONS)
    await qq(
      `INSERT INTO brain_notes (id, tenant_id, kind, title, body, tags, source_label, author_label, agent, confidence, status, dedupe_key, reviewed_by_label, biz_created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'Skill Tiệm nói thật','Agent Xây kênh','channel','HIGH','ACTIVE',$7,'Chủ doanh nghiệp',$8) ON CONFLICT DO NOTHING`,
      [uid(), tenantId, kind, title, body, tags, key, day(-1)],
    );

  // Việc chờ Sếp chốt (đề xuất của Agent Xây kênh)
  const dcode = vnDay(now);
  const mk = async (n: number, p: Record<string, unknown>) =>
    insRow(qq, "ai_proposals", {
      id: uid(),
      tenant_id: tenantId,
      branch_id: null,
      code: `DX-${dcode}-K${String(n).padStart(2, "0")}`,
      requested_label: "Agent Xây kênh",
      agent: "channel",
      policy_version: "policy-v1",
      status: "PENDING",
      expires_at: new Date(now.getTime() + 72 * 3600000),
      biz_created_at: new Date(now.getTime() - (6 - n) * 600000),
      affected: [],
      ...p,
    });
  await mk(1, {
    action_type: "CHANNEL_DECISION",
    title: "Quyết định kênh",
    summary: "Chốt giọng vùng miền cho kênh Tiệm nói thật: giữ giọng miền Bắc",
    proposed_payload: { channel_id: chId, key: "giong", value: "Miền Bắc", label: "Giọng vùng miền" },
    before_snapshot: { giong: "Miền Bắc (chưa chốt)" },
    after_snapshot: { giong: "Miền Bắc" },
    source_refs: [{ type: "channel", id: chId, label: "Kế hoạch kênh Tiệm nói thật", href: "/channels" }],
    reason: "Nhân vật đang nói giọng miền Bắc, còn kênh tham chiếu dùng giọng miền Nam. Đổi giọng thì phải quay lại các tập đã có. Nếu Sếp muốn giọng miền Nam, bấm trả lại kèm ghi chú.",
    required_permission: "marketing.manage",
    dedupe_key: "agent:channel:decision:giong",
  });
  await mk(2, {
    action_type: "CHANNEL_DECISION",
    title: "Quyết định kênh",
    summary: "Chốt tốc độ dựng video kênh Tiệm nói thật: x1,0",
    proposed_payload: { channel_id: chId, key: "toc_do", value: "x1,0", label: "Tốc độ dựng" },
    before_snapshot: { toc_do: "x1,0 (chưa chốt)" },
    after_snapshot: { toc_do: "x1,0" },
    source_refs: [{ type: "channel", id: chId, label: "Kế hoạch kênh Tiệm nói thật", href: "/channels" }],
    reason: "Kênh tham chiếu quay một lèo tốc độ thường. Sếp đã chốt x1,2 cho video giảng giải bằng avatar, kênh này chưa chốt. Muốn x1,2 thì bấm trả lại kèm ghi chú.",
    required_permission: "marketing.manage",
    dedupe_key: "agent:channel:decision:toc_do",
  });
  await mk(3, {
    action_type: "CHANNEL_DECISION",
    title: "Quyết định kênh",
    summary: "Duyệt tạo 4 nhân vật còn lại trên Flow cho Lô 02 (0 tín dụng)",
    proposed_payload: { channel_id: chId, key: "characters_create", value: "Cô Dâu Vội, Chị Mày Hỏng, Anh Văn Phòng, Cô U58", label: "Tạo nhân vật" },
    before_snapshot: { nhan_vat: "3 đã tạo, 4 dự kiến" },
    after_snapshot: { nhan_vat: "Duyệt tạo Cô Dâu Vội, Chị Mày Hỏng, Anh Văn Phòng, Cô U58" },
    source_refs: [{ type: "channel", id: chId, label: "Nhân vật kênh", href: "/marketing?tab=characters" }],
    reason: "Lô 02 có 5 video cần nhân vật chưa tạo (A2, A3, B1, A4). Tạo nhân vật trên Flow không tốn tín dụng.",
    required_permission: "marketing.manage",
    dedupe_key: "agent:channel:decision:characters_create",
  });
  const tech = (await qq<any>("SELECT id, display_name, branch_id FROM employees WHERE tenant_id=$1 AND position='TECHNICIAN' AND active ORDER BY code LIMIT 1", [tenantId]))[0];
  const a1 = (await qq<any>("SELECT id FROM mkt_videos WHERE tenant_id=$1 AND code='A1'", [tenantId]))[0];
  if (tech && a1) {
    const due = new Date(now.getTime() + 24 * 3600000);
    await mk(4, {
      branch_id: tech.branch_id,
      action_type: "TASK_ASSIGN",
      title: "Giao việc",
      summary: `Giao ${tech.display_name} duyệt câu chuyên môn của video A1 kênh Tiệm nói thật`,
      proposed_payload: { title: "Duyệt câu chuyên môn video A1 (kênh Tiệm nói thật)", owner_id: tech.id, due_at: due.toISOString(), priority: "MEDIUM", checklist: ["Đọc câu: “Mày ở trên mặt em mấy năm, đâu phải một tấm ảnh.”", "Xác nhận đúng chuyên môn hoặc đề xuất câu thay", "Báo lại quản lý kênh"] },
      before_snapshot: { note: "Câu chuyên môn đang CHỜ THỢ DUYỆT" },
      after_snapshot: { owner: tech.display_name },
      affected: [{ type: "employee", id: tech.id, label: tech.display_name }],
      source_refs: [{ type: "video", id: a1.id, label: "Video A1 · Mẫu mày trên mạng", href: `/marketing?video=${a1.id}` }],
      reason: "Luật kênh: mọi câu nói về độ bền, màu mực, thời gian bong phải được thợ thật duyệt trước khi đăng.",
      required_permission: "tasks.create",
      owner_employee_id: tech.id,
      dedupe_key: `agent:channel:expert:${a1.id}`,
    });
  }
  return chId;
}

function vnDay(d: Date) {
  return new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10).replace(/-/g, "");
}

export async function ensureMarketing(ctx: Ctx) {
  const r = await one<any>("SELECT id FROM mkt_channels WHERE tenant_id=$1 ORDER BY biz_created_at LIMIT 1", [ctx.tenantId]);
  if (r) return r.id as string;
  if (!(ctx.mode === "DEMO" || ctx.settings.simulated_data)) return null;
  return seedMarketing(q, ctx.tenantId, ctx.now());
}

// ---------------- Nhập lô video mới từ thư mục máy (đầu ra của skill) ----------------
export function parseEpisodeText(txt: string) {
  const first = txt.split("\n")[0] ?? "";
  const code = /(?:TẬP THỬ|TIỂU PHẨM|TẬP)\s+([A-D]\d+)/i.exec(first)?.[1]?.toUpperCase() ?? null;
  const title = /[“"]([^”"]+)[”"]/.exec(first)?.[1] ?? null;
  const format = (/dạng\s+([A-D])/i.exec(first)?.[1] ?? code?.[0] ?? "A").toUpperCase();
  const headline = /Tiêu đề đỏ:\s*(.+)/.exec(txt)?.[1]?.trim() ?? null;
  const clips: ScriptClip[] = [];
  let cur: ScriptClip | null = null;
  for (const raw of txt.split("\n")) {
    const h = /^CLIP\s+(T\d+)(.*)$/.exec(raw.trim());
    if (h) {
      cur = { name: `${h[1]}${(/tên trên Flow:\s*"([^"]+)"/.exec(h[2])?.[1] ?? "") ? ` · ${/tên trên Flow:\s*"([^"]+)"/.exec(h[2])![1]}` : ""}`, lines: [] };
      clips.push(cur);
      continue;
    }
    const m = /^\s{2,}([^:()]{2,20}):\s+(.+?)\s*(<--.*)?$/.exec(raw);
    if (cur && m && !/^(Caption|Hashtag)/i.test(m[1].trim())) cur.lines.push({ speaker: m[1].trim(), text: m[2].trim(), ...(m[3] && /THỢ DUYỆT/i.test(m[3]) ? { expert: true } : {}) });
    if (/^(Caption|Hashtag):/i.test(raw.trim())) cur = null;
  }
  const capLines: string[] = [];
  const lines = txt.split("\n");
  const ci = lines.findIndex((l) => /^Caption:/i.test(l.trim()));
  if (ci >= 0) {
    capLines.push(lines[ci].replace(/^\s*Caption:\s*/i, "").trim());
    for (let k = ci + 1; k < lines.length && /^\s{4,}\S/.test(lines[k]); k++) capLines.push(lines[k].trim());
  }
  const hashtags = /Hashtag:\s*(.+)/.exec(txt)?.[1]?.trim() ?? null;
  return { code, title, format, headline, clips, caption: capLines.join("\n") || null, hashtags };
}

export function scanMediaFolder() {
  const base = mediaDir();
  if (!base) return [];
  const out: { dir: string; video: string; loi: string | null }[] = [];
  for (const d of readdirSync(base)) {
    const full = path.join(base, d);
    if (d.startsWith(".") || !statSync(full).isDirectory()) continue;
    const files = readdirSync(full);
    const final = files.find((f) => /^tiem-noi-that-.*\.mp4$/.test(f));
    if (!final) continue;
    out.push({ dir: d, video: `${d}/${final}`, loi: files.includes("loi.txt") ? readFileSync(path.join(full, "loi.txt"), "utf8") : null });
  }
  return out;
}

export async function syncFromDisk(ctx: Ctx) {
  const chId = await ensureMarketing(ctx);
  if (!chId) return { added: [] as string[], skipped: 0, available: false };
  const found = scanMediaFolder();
  const known = new Set((await q<any>("SELECT media_ref FROM mkt_videos WHERE tenant_id=$1 AND media_ref IS NOT NULL", [ctx.tenantId])).map((r) => r.media_ref));
  const added: string[] = [];
  let batchId: string | null = null;
  for (const f of found) {
    if (known.has(f.video)) continue;
    const p = f.loi ? parseEpisodeText(f.loi) : null;
    if (!batchId) {
      const code = `LO-NHAP-${vnDay(ctx.now())}`;
      const b = await one<any>("SELECT id FROM mkt_batches WHERE tenant_id=$1 AND channel_id=$2 AND code=$3", [ctx.tenantId, chId, code]);
      batchId = b?.id ?? uid();
      if (!b) await q("INSERT INTO mkt_batches (id, tenant_id, channel_id, code, title, status, note, biz_created_at) VALUES ($1,$2,$3,$4,$5,'REVIEW',$6,$7)", [batchId, ctx.tenantId, chId, code, `Lô nhập từ máy ${vnDay(ctx.now()).slice(6, 8)}/${vnDay(ctx.now()).slice(4, 6)}`, "Video mới do skill dựng, nhập từ thư mục máy.", ctx.now()]);
    }
    let code = p?.code ?? `X${added.length + 1}`;
    const dup = await one<any>("SELECT id FROM mkt_videos WHERE tenant_id=$1 AND channel_id=$2 AND code=$3", [ctx.tenantId, chId, code]);
    if (dup) code = `${code}-${f.dir.slice(0, 10)}`;
    await q(
      `INSERT INTO mkt_videos (id, tenant_id, channel_id, batch_id, code, format, title, headline, situation, characters, script, caption, hashtags, status, production, media_ref, biz_created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,'PRODUCED',$14::jsonb,$15,$16)`,
      [uid(), ctx.tenantId, chId, batchId, code, ["A", "B", "C", "D"].includes(p?.format ?? "") ? p!.format : "A", p?.title ?? f.dir, p?.headline ?? null, null, [], j(p?.clips ?? []), p?.caption ?? null, p?.hashtags ?? null, j({ nguon: `Thư mục máy: ${f.dir}` }), f.video, ctx.now()],
    );
    added.push(code);
  }
  return { added, skipped: found.length - added.length, available: true };
}

// ---------------- Phễu ----------------
export async function funnel(ctx: Ctx) {
  const rows = await q<any>(
    "SELECT lifecycle_stage AS s, coalesce(source,'Chưa rõ') AS src, count(*)::int AS n FROM customers WHERE tenant_id=$1 AND branch_id = ANY($2) GROUP BY 1,2",
    [ctx.tenantId, ctx.branchFilter],
  );
  const total = rows.reduce((s, r) => s + r.n, 0);
  const reached = (k: number, src?: string) => rows.filter((r) => r.s >= k && (!src || r.src === src)).reduce((s, r) => s + r.n, 0);
  const stages = STAGES.map((label, i) => ({ stage: i + 1, label, count: reached(i + 1) }));
  const conv = stages.slice(1).map((s, i) => ({ from: stages[i].label, to: s.label, rate: stages[i].count ? s.count / stages[i].count : null }));
  const pre = conv.slice(0, 4).filter((c) => c.rate !== null);
  const bottleneck = pre.length ? pre.reduce((a, b) => ((b.rate as number) < (a.rate as number) ? b : a)) : null;
  const sources = [...new Set(rows.map((r) => r.src))].map((src) => ({
    source: src,
    total: reached(1, src),
    booked: reached(3, src),
    served: reached(5, src),
    returned: reached(8, src),
  })).sort((a, b) => b.total - a.total);
  const since = new Date(ctx.now().getTime() - 30 * 86400000);
  const [z] = await q<any>(
    `SELECT (SELECT count(DISTINCT m.conversation_id)::int FROM messages m JOIN conversations cv ON cv.id=m.conversation_id
              WHERE m.tenant_id=$1 AND cv.branch_id = ANY($2) AND m.direction='IN' AND m.sent_at >= $3 AND m.sent_at <= $4) AS zalo_30d,
            (SELECT count(*)::int FROM appointments a JOIN services s ON s.id=a.service_id
              WHERE a.tenant_id=$1 AND a.branch_id = ANY($2) AND s.name ILIKE 'Tư vấn%' AND a.start_at >= $3 AND a.start_at <= $4) AS consult_30d,
            (SELECT count(*)::int FROM appointments a JOIN services s ON s.id=a.service_id
              WHERE a.tenant_id=$1 AND a.branch_id = ANY($2) AND s.name ILIKE 'Dịch vụ%' AND a.status='COMPLETED' AND a.start_at >= $3 AND a.start_at <= $4) AS service_30d`,
    [ctx.tenantId, ctx.branchFilter, since, ctx.now()],
  );
  const vids = await q<any>("SELECT status, count(*)::int AS n FROM mkt_videos WHERE tenant_id=$1 GROUP BY status", [ctx.tenantId]);
  const vcount = (s: string[]) => vids.filter((v) => s.includes(v.status)).reduce((a, v) => a + v.n, 0);
  return {
    total,
    stages,
    conv,
    bottleneck,
    sources,
    last30: z,
    content: {
      published: vcount(["PUBLISHED"]),
      scheduled: vcount(["SCHEDULED"]),
      in_review: vcount(["IN_REVIEW", "REVISE"]),
      producing: vcount(["IDEA", "SCRIPTED", "PRODUCED"]),
      views: null as number | null,
    },
    mapping: [
      { stage: "Đầu phễu · Tiếp cận", formats: "D · Chuyện tiệm", goal: "Kéo người xem mới bằng tiểu phẩm hài", metric: "View, người xem mới (chưa nối nền tảng)" },
      { stage: "Giữa phễu · Quan tâm, tư vấn", formats: "A · Khách đòi, thợ từ chối · B · Ca khó · C · Giải nghề", goal: "Xây niềm tin, trả lời trước câu hỏi hay gặp", metric: "Tin nhắn Zalo, khách mới nguồn TikTok/Facebook" },
      { stage: "Cuối phễu · Đặt lịch, dịch vụ", formats: "Video kết quả thật của tiệm (không dùng AI)", goal: "Bằng chứng thật, ghim đầu kênh", metric: "Lịch tư vấn, lịch dịch vụ" },
      { stage: "Sau dịch vụ · Quay lại, giới thiệu", formats: "Chăm sóc theo kế hoạch đã duyệt", goal: "Dặm màu, kiểm tra, giới thiệu", metric: "Điểm chạm chăm sóc, khách quay lại" },
    ],
    note: "Số khách theo giai đoạn tính trên toàn bộ khách trong phạm vi chi nhánh đang chọn. Kênh video chưa nối TikTok/Reels nên chưa có số view thật.",
  };
}

export const _n = norm;
