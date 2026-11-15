"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, CheckCircle2, ClipboardList, Download, FileText, GraduationCap, Pencil, Plus, Search, Send, Sparkles, ThumbsDown, ThumbsUp, UserRound, Users, Clock } from "lucide-react";
import { api, download, useApi } from "@/lib/client/api";
import { Badge, DesignRefButton, Empty, Field, Modal, PageHead, PageState, ReasonDialog, Skeleton, SourceChip, Stat, useAction, useApp } from "@/components/ui";
import { SOP_STATUS_LABEL } from "@/lib/shared/labels";
import { fmtDate, fmtDateTime } from "@/lib/shared/format";

const STATUS_TONE: Record<string, string> = { PUBLISHED: "green", DRAFT: "gold", PENDING_APPROVAL: "blue", ARCHIVED: "gray" };

export default function KnowledgePage() {
  const sp = useSearchParams();
  const q = useApi<any>("/knowledge");
  const [doc, setDoc] = useState<string | null>(sp.get("doc"));
  const [tab, setTab] = useState<"all" | "pub" | "draft">("all");
  const [term, setTerm] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (!doc && q.data?.docs?.length) setDoc(q.data.docs.find((x: any) => x.versions.some((v: any) => v.status === "PUBLISHED"))?.id ?? q.data.docs[0].id);
  }, [q.data, doc]);
  return (
    <>
      <PageHead
        title="SOP & đào tạo"
        sub="Quản lý quy trình, tài liệu hướng dẫn và đào tạo nhân sự PMU"
        actions={
          <>
            <DesignRefButton refKey="knowledge" />
            {q.data?.can_draft && (
              <button className="btn btn-dark" onClick={() => setCreating(true)}>
                <Plus /> Tạo bản nháp
              </button>
            )}
          </>
        }
      />
      <PageState q={q}>
        {(d) => {
          const docs = d.docs.filter((x: any) => {
            const pub = x.versions.some((v: any) => v.status === "PUBLISHED");
            return (tab === "all" || (tab === "pub" ? pub : !pub)) && (!term || x.title.toLowerCase().includes(term.toLowerCase()));
          });
          const current = d.docs.find((x: any) => x.id === doc);
          return (
            <div className="stack">
              <div className="grid g-4">
                <Stat tone="teal" icon={<FileText />} num={d.stats.total} label="Tài liệu" />
                <Stat tone="gold" icon={<CheckCircle2 />} num={d.stats.published} label="Đã xuất bản" />
                <Stat tone="green" icon={<Pencil />} num={d.stats.drafts} label="Bản nháp / chờ duyệt" />
                <Stat tone="red" icon={<GraduationCap />} num={d.stats.courses} label="Khóa đào tạo" />
              </div>
              <div className="three-col">
                <section className="card">
                  <div className="card-head">
                    <h2>
                      <BookOpen /> Thư viện tài liệu
                    </h2>
                  </div>
                  <div className="card-body stack" style={{ gap: 12 }}>
                    <div className="input-icon">
                      <Search />
                      <input className="input" placeholder="Tìm tài liệu..." value={term} onChange={(e) => setTerm(e.target.value)} />
                    </div>
                    <div className="seg">
                      <button className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>
                        Tất cả ({d.docs.length})
                      </button>
                      <button className={tab === "pub" ? "on" : ""} onClick={() => setTab("pub")}>
                        Đã xuất bản ({d.stats.published})
                      </button>
                      <button className={tab === "draft" ? "on" : ""} onClick={() => setTab("draft")}>
                        Bản nháp ({d.stats.drafts})
                      </button>
                    </div>
                    {docs.length === 0 && <div className="muted small">Không có tài liệu phù hợp.</div>}
                    {docs.map((x: any) => {
                      const pub = x.versions.find((vv: any) => vv.status === "PUBLISHED");
                      const v = x.versions.find((vv: any) => ["DRAFT", "PENDING_APPROVAL"].includes(vv.status)) ?? pub ?? x.versions[0];
                      return (
                        <button key={x.id} className={`kcard ${doc === x.id ? "selected" : ""}`} style={{ background: doc === x.id ? "#fffaf0" : undefined }} onClick={() => setDoc(x.id)}>
                          <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                            <span className="avatar" style={{ background: "var(--primary-50)", color: "var(--primary)", borderRadius: 12 }}>
                              <FileText size={20} />
                            </span>
                            <div>
                              <div className="title">
                                {x.title} {pub ? `v${pub.version_label}` : ""}
                              </div>
                              <div className="row mt-8">
                                <Badge tone={STATUS_TONE[v.status]}>{SOP_STATUS_LABEL[v.status]}</Badge>
                                {v.status !== "PUBLISHED" && pub && <Badge tone="green">Đang dùng v{pub.version_label}</Badge>}
                              </div>
                              {pub?.effective_at && <div className="tiny muted mt-8">Lần phê duyệt cuối: {fmtDate(pub.effective_at)}</div>}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
                {current ? <Reader key={current.id} docRow={current} d={d} onChanged={q.reload} /> : <Empty title="Chọn một tài liệu" />}
                <div className="stack">
                  <AskAi />
                  <Training d={d} docRow={current} onChanged={q.reload} />
                </div>
              </div>
            </div>
          );
        }}
      </PageState>
      {creating && <CreateDoc onClose={() => setCreating(false)} onDone={(id) => (setCreating(false), q.reload(), setDoc(id))} />}
    </>
  );
}

function Reader({ docRow, d, onChanged }: { docRow: any; d: any; onChanged: () => void }) {
  const versions = docRow.versions;
  const [vid, setVid] = useState<string>((versions.find((v: any) => v.status === "PUBLISHED") ?? versions[0]).id);
  const q = useApi<any>(`/knowledge/versions/${vid}`, [vid]);
  const [full, setFull] = useState(false);
  const [editing, setEditing] = useState(false);
  const [submit, setSubmit] = useState(false);
  const { run, busy } = useAction();
  if (!q.data) return <Skeleton h={560} />;
  const v = q.data.version;
  const sec = v.content.sections ?? [];
  return (
    <section className="card">
      <div className="card-head">
        <h2>
          <FileText /> SOP: {v.title} v{v.version_label}
        </h2>
      </div>
      <div className="card-body stack" style={{ gap: 12 }}>
        <div className="banner ok" style={{ alignItems: "center", background: v.status === "PUBLISHED" ? undefined : "var(--warn-50)", color: v.status === "PUBLISHED" ? undefined : "#6e4c0c" }}>
          <Badge tone={STATUS_TONE[v.status]} icon={<CheckCircle2 />}>
            {SOP_STATUS_LABEL[v.status]}
          </Badge>
          <span>
            {v.status === "PUBLISHED" ? `Lần phê duyệt cuối: ${fmtDate(v.effective_at)}${q.data.approver ? ` · ${q.data.approver}` : ""}` : v.status === "PENDING_APPROVAL" ? `Đang chờ duyệt ${q.data.pending_proposal?.code ?? ""}` : "Bản nháp — AI không dùng bản này để trả lời"}
          </span>
        </div>
        {versions.length > 1 && (
          <label className="row small" style={{ gap: 8 }}>
            Phiên bản:
            <select className="select" style={{ width: 240, height: 36 }} value={vid} onChange={(e) => setVid(e.target.value)}>
              {versions.map((x: any) => (
                <option key={x.id} value={x.id}>
                  v{x.version_label} · {SOP_STATUS_LABEL[x.status]}
                </option>
              ))}
            </select>
          </label>
        )}
        {sec.slice(0, full ? sec.length : 2).map((s: any) => (
          <div key={s.id}>
            <h3 style={{ fontSize: 17 }}>
              {s.id}. {s.heading}
            </h3>
            <p className="small" style={{ margin: "6px 0 0" }}>
              {s.body}
            </p>
            {s.steps?.map((st: any, i: number) => (
              <div key={i} className="row mt-12" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                <span className="avatar sm" style={{ background: "var(--gold-50)", color: "var(--gold-600)", border: "1px solid #ecd09a" }}>
                  {i + 1}
                </span>
                <div className="card" style={{ boxShadow: "none", padding: "10px 14px", flex: 1, background: "#fffcf6" }}>
                  <b>{st.title}</b>
                  <div className="small muted">{st.body}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
        <div className="row-between" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <button className="link" onClick={() => setFull((x) => !x)}>
            <FileText size={16} /> {full ? "Thu gọn" : "Xem toàn bộ SOP"}
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => run(() => download(`/knowledge/versions/${v.id}/export`), "Đã tải tài liệu.")}>
            <Download /> Tải tài liệu
          </button>
        </div>
        {d.can_draft && (
          <div className="row">
            {v.status === "DRAFT" && (
              <>
                <button className="btn btn-outline btn-sm" onClick={() => setEditing(true)}>
                  <Pencil /> Sửa bản nháp
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => setSubmit(true)}>
                  <Send /> Gửi duyệt xuất bản
                </button>
              </>
            )}
            {v.status === "PUBLISHED" && !versions.some((x: any) => ["DRAFT", "PENDING_APPROVAL"].includes(x.status)) && (
              <button
                className="btn btn-outline btn-sm"
                disabled={busy}
                onClick={async () => {
                  const r: any = await run(() => api(`/knowledge/${docRow.id}/versions`, { body: {} }), (x: any) => `Đã tạo bản nháp v${x.version_label}.`);
                  if (r) (onChanged(), setVid(r.id));
                }}
              >
                <Plus /> Tạo phiên bản mới
              </button>
            )}
          </div>
        )}
      </div>
      {editing && <DraftEditor v={v} onClose={() => setEditing(false)} onDone={() => (setEditing(false), q.reload())} />}
      {submit && (
        <ReasonDialog
          title="Gửi duyệt xuất bản"
          label="Lý do / thay đổi chính"
          confirmText="Gửi phê duyệt"
          required={false}
          onClose={() => setSubmit(false)}
          onSubmit={async (reason) => {
            const r = await run(() => api(`/knowledge/versions/${v.id}/submit`, { body: { reason } }), (x: any) => x.message);
            if (r) (setSubmit(false), q.reload(), onChanged());
          }}
        />
      )}
    </section>
  );
}

function AskAi() {
  const [question, setQuestion] = useState("Quy trình tiếp nhận khách mới gồm những bước nào?");
  const [items, setItems] = useState<{ q: string; a: any }[]>([]);
  const { run, busy } = useAction();
  const [vote, setVote] = useState<Record<number, string>>({});
  const ask = async () => {
    if (!question.trim()) return;
    const a = await run(() => api("/knowledge/ask", { body: { question } }));
    if (a) setItems((x) => [...x, { q: question, a }]);
  };
  return (
    <section className="card">
      <div className="card-head">
        <h2>
          <Sparkles color="var(--gold)" /> Hỏi đáp AI
        </h2>
        <div className="sub">Chỉ trả lời từ SOP đã xuất bản mà bạn được xem, có dẫn nguồn.</div>
      </div>
      <div className="card-body stack" style={{ gap: 10 }}>
        {items.map((it, i) => (
          <div key={i} className="stack" style={{ gap: 8 }}>
            <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
              <span className="avatar sm" style={{ background: "var(--primary-50)", color: "var(--primary)" }}>
                <UserRound size={16} />
              </span>
              <div className="bubble out" style={{ maxWidth: "100%", background: "#e2f1f8" }}>
                {it.q}
              </div>
            </div>
            <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
              <Sparkles size={22} color="var(--gold)" style={{ flex: "none" }} />
              <div className="card" style={{ boxShadow: "none", padding: "10px 12px", background: "#fffaf0", borderColor: "#f1e3c5" }}>
                <div className="small">{it.a.summary}</div>
                {it.a.facts.length > 0 && (
                  <ol className="small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {it.a.facts.map((f: any, k: number) => (
                      <li key={k}>{f.text.replace(/^\d+\.\s*/, "")}</li>
                    ))}
                  </ol>
                )}
                <div className="row-between mt-8">
                  <div className="row">{it.a.sources.map((s: any, k: number) => <SourceChip key={k} label={s.label} href={s.href} />)}</div>
                  <span className="row" style={{ gap: 4 }}>
                    <button className="icon-btn" style={{ width: 30, height: 30, color: vote[i] === "up" ? "var(--ok)" : undefined }} aria-label="Hữu ích" onClick={() => setVote({ ...vote, [i]: "up" })}>
                      <ThumbsUp size={16} />
                    </button>
                    <button className="icon-btn" style={{ width: 30, height: 30, color: vote[i] === "down" ? "var(--danger)" : undefined }} aria-label="Chưa đúng" onClick={() => setVote({ ...vote, [i]: "down" })}>
                      <ThumbsDown size={16} />
                    </button>
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
        <textarea className="textarea" style={{ minHeight: 64 }} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Hỏi về quy trình đã xuất bản..." />
        <button className="btn btn-primary" disabled={busy} onClick={ask}>
          <Sparkles /> {busy ? "Đang tra cứu..." : "Hỏi AI"}
        </button>
      </div>
    </section>
  );
}

function Training({ d, docRow, onChanged }: { d: any; docRow: any; onChanged: () => void }) {
  const { me } = useApp();
  const [quiz, setQuiz] = useState<any>(null);
  const [assign, setAssign] = useState(false);
  const [review, setReview] = useState<any>(null);
  const { run } = useAction();
  const pub = docRow?.versions.find((v: any) => v.status === "PUBLISHED");
  const list = d.assignments.filter((a: any) => a.doc_id === docRow?.id);
  const mine = list.find((a: any) => a.employee_id === d.my_employee_id);
  return (
    <section className="card gold-head">
      <div className="card-head">
        <h2>
          <GraduationCap /> Nhiệm vụ đào tạo
        </h2>
      </div>
      <div className="card-body stack" style={{ gap: 10 }}>
        {!pub ? (
          <div className="muted small">Tài liệu chưa xuất bản nên chưa giao bài học được.</div>
        ) : (
          <>
            <b>Đào tạo: {docRow.title}</b>
            <dl className="kv" style={{ gridTemplateColumns: "92px 1fr", fontSize: 14 }}>
              <dt>
                <Users size={15} /> Đối tượng
              </dt>
              <dd style={{ fontWeight: 500 }}>{list.map((a: any) => a.display_name).join(", ") || "Chưa giao"}</dd>
              <dt>
                <BookOpen size={15} /> Tài liệu
              </dt>
              <dd style={{ fontWeight: 500 }}>
                {docRow.title} v{pub.version_label}
              </dd>
            </dl>
            {list.map((a: any) => (
              <div key={a.id} className="row small" style={{ justifyContent: "space-between" }}>
                <span>{a.display_name}</span>
                <span className="row" style={{ gap: 6 }}>
                  {a.status === "ASSIGNED" ? <Badge tone="red" icon={<Clock />}>Chưa hoàn thành</Badge> : a.status === "SUBMITTED" ? <Badge tone="gold">Đã nộp {a.score}/{a.total} · chờ đánh giá</Badge> : <Badge tone="green">Đã đánh giá {a.score}/{a.total}</Badge>}
                  {d.can_assign && a.status === "SUBMITTED" && (
                    <button className="btn btn-outline btn-sm" onClick={() => setReview(a)}>
                      Đánh giá
                    </button>
                  )}
                </span>
              </div>
            ))}
            {mine && mine.status === "ASSIGNED" ? (
              <button className="btn btn-dark btn-lg btn-block" onClick={() => setQuiz(mine)}>
                <Pencil /> Làm bài kiểm tra
              </button>
            ) : mine ? (
              <div className="banner ok small">Bạn đã nộp bài ({mine.score}/{mine.total}).</div>
            ) : (
              <div className="tiny muted">{me?.user.employee_id ? "Bạn chưa được giao bài học này." : "Đổi vai trò sang nhân sự được giao (ví dụ Nhân sự H) để làm bài kiểm tra."}</div>
            )}
            {d.can_assign && (
              <button className="btn btn-outline" onClick={() => setAssign(true)}>
                <ClipboardList /> Giao bài học
              </button>
            )}
          </>
        )}
      </div>
      {quiz && <QuizModal a={quiz} onClose={() => setQuiz(null)} onDone={() => (setQuiz(null), onChanged())} />}
      {assign && pub && <AssignModal versionId={pub.id} onClose={() => setAssign(false)} onDone={() => (setAssign(false), onChanged())} />}
      {review && (
        <ReasonDialog
          title={`Đánh giá bài của ${review.display_name}`}
          label={`Nhận xét (điểm ${review.score}/${review.total})`}
          confirmText="Lưu đánh giá"
          onClose={() => setReview(null)}
          onSubmit={async (note) => {
            const r = await run(() => api(`/knowledge/assignments/${review.id}/review`, { body: { note } }), "Đã lưu đánh giá.");
            if (r) (setReview(null), onChanged());
          }}
        />
      )}
    </section>
  );
}

function QuizModal({ a, onClose, onDone }: { a: any; onClose: () => void; onDone: () => void }) {
  const q = useApi<any>(`/knowledge/versions/${a.version_id}`, [a.version_id]);
  const [ans, setAns] = useState<Record<number, number>>({});
  const { run, busy } = useAction();
  const quiz = q.data?.version.content.quiz ?? [];
  return (
    <Modal
      title={`Bài kiểm tra: ${a.title} v${a.version_label}`}
      onClose={onClose}
      dirty={Object.keys(ans).length > 0}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>
            Đóng
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || Object.keys(ans).length !== quiz.length}
            onClick={async () => {
              const r = await run(() => api(`/knowledge/assignments/${a.id}/attempt`, { body: { answers: quiz.map((_: any, i: number) => ans[i]) } }), (x: any) => x.message);
              if (r) onDone();
            }}
          >
            Nộp bài
          </button>
        </>
      }
    >
      {!q.data ? (
        <Skeleton h={200} />
      ) : (
        quiz.map((x: any, i: number) => (
          <fieldset key={i} className="card mb-16" style={{ boxShadow: "none", padding: 14 }}>
            <legend className="strong">
              Câu {i + 1}. {x.q}
            </legend>
            {x.options.map((o: string, k: number) => (
              <label key={k} className="check" style={{ display: "flex", marginTop: 8 }}>
                <input type="radio" name={`q${i}`} checked={ans[i] === k} onChange={() => setAns({ ...ans, [i]: k })} style={{ accentColor: "var(--primary)" }} /> {o}
              </label>
            ))}
          </fieldset>
        ))
      )}
    </Modal>
  );
}

function AssignModal({ versionId, onClose, onDone }: { versionId: string; onClose: () => void; onDone: () => void }) {
  const q = useApi<any>("/people");
  const [ids, setIds] = useState<string[]>([]);
  const { now } = useApp();
  const [due, setDue] = useState(new Date(now().getTime() + 3 * 86400000).toISOString().slice(0, 10));
  const { run, busy } = useAction();
  return (
    <Modal
      title="Giao bài học"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button className="btn btn-primary" disabled={busy || !ids.length} onClick={async () => (await run(() => api("/knowledge/assign", { body: { version_id: versionId, employee_ids: ids, due_at: `${due}T10:00:00Z` } }), (r: any) => r.message)) && onDone()}>
            Giao bài
          </button>
        </>
      }
    >
      <Field label="Hạn hoàn thành">
        <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>
      <div className="mt-12">
        {(q.data?.items ?? [])
          .filter((e: any) => e.active)
          .map((e: any) => (
            <label key={e.id} className="check" style={{ display: "flex", padding: "6px 0" }}>
              <input type="checkbox" checked={ids.includes(e.id)} onChange={() => setIds(ids.includes(e.id) ? ids.filter((x) => x !== e.id) : [...ids, e.id])} /> {e.display_name}
            </label>
          ))}
      </div>
    </Modal>
  );
}

function CreateDoc({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const [f, setF] = useState({ title: "", category: "", purpose: "" });
  const [err, setErr] = useState<any>(null);
  return (
    <Modal
      title="Tạo bản nháp SOP"
      onClose={onClose}
      dirty={!!f.title}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button
            className="btn btn-primary"
            onClick={async () => {
              try {
                const r = await api("/knowledge", { body: f });
                onDone(r.id);
              } catch (e) {
                setErr(e);
              }
            }}
          >
            Tạo bản nháp
          </button>
        </>
      }
    >
      {err && <div className="banner danger mb-16">{err.message}</div>}
      <div className="form-grid">
        <Field label="Tên tài liệu" req error={err?.field_errors?.title} className="full">
          <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <Field label="Nhóm" className="full">
          <input className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Ví dụ: Lễ tân & tư vấn" />
        </Field>
        <Field label="Mục đích" className="full">
          <textarea className="textarea" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} />
        </Field>
      </div>
      <div className="banner info mt-12 small">Bản nháp chỉ người có quyền soạn thảo xem được. AI không dùng bản nháp để trả lời nhân viên.</div>
    </Modal>
  );
}

function DraftEditor({ v, onClose, onDone }: { v: any; onClose: () => void; onDone: () => void }) {
  const [sections, setSections] = useState<any[]>(
    (v.content.sections ?? []).map((s: any) => ({ heading: s.heading, body: s.body, steps: (s.steps ?? []).map((x: any) => `${x.title} | ${x.body}`).join("\n") })),
  );
  const [quiz, setQuiz] = useState<any[]>((v.content.quiz ?? []).map((x: any) => ({ q: x.q, options: x.options.join("\n"), answer: x.answer ?? 0 })));
  const { run, busy } = useAction();
  const content = useMemo(
    () => ({
      sections: sections.map((s) => ({
        heading: s.heading,
        body: s.body,
        steps: s.steps
          .split("\n")
          .map((l: string) => l.trim())
          .filter(Boolean)
          .map((l: string) => ({ title: l.split("|")[0].trim(), body: (l.split("|")[1] ?? "").trim() })),
      })),
      quiz: quiz.map((x) => ({ q: x.q, options: x.options.split("\n").map((o: string) => o.trim()).filter(Boolean), answer: Number(x.answer) })),
    }),
    [sections, quiz],
  );
  return (
    <Modal
      title={`Sửa bản nháp v${v.version_label}`}
      onClose={onClose}
      size="wide"
      dirty
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={async () => (await run(() => api(`/knowledge/versions/${v.id}`, { method: "PATCH", body: { content, expected_version: v.version } }), "Đã lưu bản nháp.")) && onDone()}>
            Lưu bản nháp
          </button>
        </>
      }
    >
      {sections.map((s, i) => (
        <div key={i} className="card mb-16" style={{ boxShadow: "none", padding: 14 }}>
          <div className="form-grid">
            <Field label={`Mục ${i + 1} — tiêu đề`} className="full">
              <input className="input" value={s.heading} onChange={(e) => setSections(sections.map((x, k) => (k === i ? { ...x, heading: e.target.value } : x)))} />
            </Field>
            <Field label="Nội dung" className="full">
              <textarea className="textarea" value={s.body} onChange={(e) => setSections(sections.map((x, k) => (k === i ? { ...x, body: e.target.value } : x)))} />
            </Field>
            <Field label="Các bước (mỗi dòng: Tiêu đề | mô tả)" className="full">
              <textarea className="textarea" value={s.steps} onChange={(e) => setSections(sections.map((x, k) => (k === i ? { ...x, steps: e.target.value } : x)))} />
            </Field>
          </div>
        </div>
      ))}
      <button className="btn btn-outline btn-sm" onClick={() => setSections([...sections, { heading: "", body: "", steps: "" }])}>
        <Plus /> Thêm mục
      </button>
      <h3 className="mt-24 mb-16" style={{ fontSize: 17 }}>
        Bài kiểm tra
      </h3>
      {quiz.map((x, i) => (
        <div key={i} className="card mb-16" style={{ boxShadow: "none", padding: 14 }}>
          <div className="form-grid">
            <Field label={`Câu ${i + 1}`} className="full">
              <input className="input" value={x.q} onChange={(e) => setQuiz(quiz.map((y, k) => (k === i ? { ...y, q: e.target.value } : y)))} />
            </Field>
            <Field label="Phương án (mỗi dòng một phương án)">
              <textarea className="textarea" value={x.options} onChange={(e) => setQuiz(quiz.map((y, k) => (k === i ? { ...y, options: e.target.value } : y)))} />
            </Field>
            <Field label="Đáp án đúng (số thứ tự, bắt đầu từ 1)">
              <input className="input" type="number" min={1} value={Number(x.answer) + 1} onChange={(e) => setQuiz(quiz.map((y, k) => (k === i ? { ...y, answer: Number(e.target.value) - 1 } : y)))} />
            </Field>
          </div>
        </div>
      ))}
      <button className="btn btn-outline btn-sm" onClick={() => setQuiz([...quiz, { q: "", options: "", answer: 0 }])}>
        <Plus /> Thêm câu hỏi
      </button>
    </Modal>
  );
}

