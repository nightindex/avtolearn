import React, { useMemo, useState } from "react";
import {
  Activity,
  Award,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle,
  ChevronDown,
  ClipboardList,
  FileText,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import type { AppData, ProgressSummary, RecentProgressItem } from "../types";

type View =
  | "home"
  | "lessons"
  | "road-signs"
  | "penalties"
  | "appeals"
  | "autodrome"
  | "group"
  | "template-tests"
  | "random-tests"
  | "all-tests"
  | "saved-tests"
  | "final-exam"
  | "ai";

interface DashboardProps {
  data: AppData;
  summary: ProgressSummary | null;
  recent: RecentProgressItem[];
  setView: (view: View) => void;
}

export function Dashboard({ data, summary, recent, setView }: DashboardProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [range, setRange] = useState(() => getRangeByPreset("30"));
  const accuracy = summary?.accuracy ?? 0;
  const answerTotal = summary?.answered ?? 0;
  const correctTotal = summary?.correct ?? 0;
  const wrongTotal = Math.max(0, answerTotal - correctTotal);
  const attempts = summary?.attempts ?? 0;
  const totalQuestions = data.counts.questions || 0;
  const remainingQuestions = Math.max(0, totalQuestions - answerTotal);
  const answerPercent = totalQuestions ? Math.min(100, Math.round((answerTotal / totalQuestions) * 100)) : 0;
  const completedTemplates = data.tests.filter((test) => test.completed).length;
  const bestTemplatePercent = data.tests.reduce((best, test) => Math.max(best, test.bestPercent || 0), 0);
  const savedTemplates = data.tests.filter((test) => test.saved).length;
  const filteredRecent = useMemo(
    () =>
      recent.filter((item) => {
        const createdAt = new Date(item.createdAt);
        if (Number.isNaN(createdAt.getTime())) return true;
        return createdAt >= range.start && createdAt <= range.end;
      }),
    [range.end, range.start, recent],
  );
  const filteredQuestions = filteredRecent.filter((item) => item.type === "question");
  const filteredAttempts = filteredRecent.filter((item) => item.type === "attempt");
  const filteredCorrect = filteredQuestions.filter((item) => item.correct).length;
  const filteredAccuracy = filteredQuestions.length
    ? Math.round((filteredCorrect / filteredQuestions.length) * 100)
    : 0;
  const latestAttemptPercent = summary?.latestAttempt?.total
    ? Math.round((summary.latestAttempt.score / summary.latestAttempt.total) * 100)
    : 0;
  const weakQuestionCount = filteredQuestions.filter((item) => item.correct === false).length;
  const shouldStudyLessons = answerPercent < 70;
  const nextStepTitle = shouldStudyLessons ? "Savollar qamrovini oshiring" : "Natijani testlar bilan mustahkamlang";
  const nextStepText = shouldStudyLessons
    ? `${Math.max(totalQuestions - answerTotal, 0)} ta savol hali ishlanmagan. Darslarni davom ettirib, keyin aralash mashq bilan tekshiring.`
    : "Qamrov yaxshi. Endi shablon testlar va yakuniy imtihon orqali barqaror natijani ushlab turing.";
  const primaryActionLabel = shouldStudyLessons ? "Darslarni davom ettirish" : "Shablon testga o'tish";
  const primaryActionView: View = shouldStudyLessons ? "lessons" : "template-tests";

  const kpiCards = [
    {
      label: "Savol qamrovi",
      value: `${answerPercent}%`,
      detail: `${answerTotal}/${totalQuestions} savol qamrab olingan`,
      icon: Zap,
      tone: "blue",
    },
    {
      label: "O'rtacha aniqlik",
      value: `${accuracy}%`,
      detail: `${correctTotal}/${answerTotal || 0} to'g'ri javob`,
      icon: Target,
      tone: "green",
    },
    {
      label: "Test urinishlari",
      value: String(attempts),
      detail: `${filteredAttempts.length} tasi tanlangan davrda`,
      icon: ClipboardList,
      tone: "amber",
    },
    {
      label: "Eng yaxshi natija",
      value: `${bestTemplatePercent}%`,
      detail: `${completedTemplates}/${data.tests.length} shablon yakunlangan`,
      icon: Award,
      tone: "cyan",
    },
  ];

  const moduleRows = [
    ["Darslar", data.lessons.length, answerPercent],
    ["Shablon testlar", data.tests.length, bestTemplatePercent],
    ["Aralash testlar", totalQuestions, latestAttemptPercent],
    ["Takrorlash kerak", weakQuestionCount, filteredQuestions.length ? Math.round((weakQuestionCount / filteredQuestions.length) * 100) : 0],
  ] as const;

  const formatTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("uz-UZ", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const applyPreset = (preset: RangePreset) => {
    const next = getRangeByPreset(preset);
    setRange(next);
    setDraftStart(toInputDate(next.start));
    setDraftEnd(toInputDate(next.end));
  };

  const applyExactRange = () => {
    if (!draftStart || !draftEnd) return;
    const start = startOfDay(new Date(`${draftStart}T00:00:00`));
    const end = endOfDay(new Date(`${draftEnd}T00:00:00`));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
    setRange(start <= end ? { label: "Aniq davr", start, end } : { label: "Aniq davr", start: end, end: start });
    setFilterOpen(false);
  };

  return (
    <div className="dashboard-shell">
      <section className="dashboard-header">
        <div className="dashboard-heading">
          <span>Bosh sahifa</span>
          <h1>O'qishni davom ettiring</h1>
          <p>Bugungi eng muhim qadamni tanlang, progressni kuzating va testlarga tayyorlaning.</p>
        </div>
      </section>

      <section className="dashboard-continue-panel">
        <div className="dashboard-continue-copy">
          <span>Keyingi qadam</span>
          <h2>{nextStepTitle}</h2>
          <p>{nextStepText}</p>
          <div className="progress-actions">
            <button onClick={() => setView(primaryActionView)}>{primaryActionLabel}</button>
            <button className="secondary" onClick={() => setView("random-tests")}>Aralash mashq</button>
          </div>
        </div>
        <div className="dashboard-continue-stats" aria-label="O'quv holati">
          <div className="dashboard-ring" style={{ "--score": answerPercent } as React.CSSProperties}>
            <div>
              <strong>{answerPercent}%</strong>
              <span>qamrov</span>
            </div>
          </div>
          <div className="continue-mini-stats">
            <div>
              <span>Aniqlik</span>
              <strong>{accuracy}%</strong>
            </div>
            <div>
              <span>Javoblar</span>
              <strong>{answerTotal}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-kpi-grid">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <article className={`dashboard-kpi ${card.tone}`} key={card.label}>
              <span className="dashboard-kpi-icon"><Icon size={20} /></span>
              <span className="dashboard-kpi-label">{card.label}</span>
              <strong>{card.value}</strong>
              <p>{card.detail}</p>
            </article>
          );
        })}
      </section>

      <section className="dashboard-insight-grid">
        <article className="dashboard-panel progress-overview-card">
          <div className="dashboard-panel-head">
            <div>
              <h2>Qamrov holati</h2>
              <p>Bugungi o'qish balansi va baza bo'yicha umumiy vaziyat.</p>
            </div>
            <span className="dashboard-pill">{answerTotal}/{totalQuestions}</span>
          </div>

          <div className="progress-overview-body">
            <div className="dashboard-ring" style={{ "--score": answerPercent } as React.CSSProperties}>
              <div>
                <strong>{answerPercent}%</strong>
                <span>qamrov</span>
              </div>
            </div>
            <div className="progress-summary">
              <span>O'qish balansi</span>
              <h3>{answerPercent}% savollar ko'rilgan</h3>
              <p>{wrongTotal > 0 ? `${wrongTotal} ta xato savol qayta ko'rishga tayyor.` : "Hozircha xatolar yo'q. Qamrovni oshirishga e'tibor bering."}</p>
              <div className="dashboard-mini-bars" aria-label="Progress taqsimoti">
                <div>
                  <span>To'g'ri</span>
                  <strong>{correctTotal}</strong>
                </div>
                <div>
                  <span>Xato</span>
                  <strong>{wrongTotal}</strong>
                </div>
                <div>
                  <span>Qolgan</span>
                  <strong>{remainingQuestions}</strong>
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="dashboard-panel score-status-card">
          <div className="dashboard-panel-head">
            <div>
              <h2>Baholash holati</h2>
              <p>{range.label} davridagi aniqlik va xato ulushi.</p>
            </div>
          </div>
          <div className="score-status-body">
            <div className="dashboard-ring compact" style={{ "--score": filteredAccuracy } as React.CSSProperties}>
              <div>
                <strong>{filteredAccuracy}%</strong>
                <span>davr aniqligi</span>
              </div>
            </div>
            <div className="score-status-split">
              <div className="accepted">
                <CheckCircle size={17} />
                <span>To'g'ri</span>
                <strong>{filteredCorrect}</strong>
              </div>
              <div className="rejected">
                <Target size={17} />
                <span>Xato</span>
                <strong>{weakQuestionCount}</strong>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="dashboard-bottom-grid">
        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <h2><BarChart3 size={18} /> Modul samaradorligi</h2>
              <p>Darslar va test kategoriyalari bo'yicha qamrov.</p>
            </div>
          </div>
          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Modul</th>
                  <th>Hajm</th>
                  <th>Ko'rsatkich</th>
                </tr>
              </thead>
              <tbody>
                {moduleRows.map(([label, value, percent]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>{value}</td>
                    <td>
                      <div className="dashboard-table-progress"><span style={{ width: `${percent}%` }} /></div>
                      <strong>{percent}%</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="dashboard-panel activity-panel">
          <div className="dashboard-panel-head">
            <div>
              <h2><Activity size={18} /> So'nggi faollik</h2>
              <p>Tanlangan davrdagi oxirgi harakatlar.</p>
            </div>
            <div className="activity-header-actions">
              <span className="dashboard-pill">{filteredRecent.length} yozuv</span>
              <div className="date-range-picker">
                <button className={`date-range-trigger ${filterOpen ? "active" : ""}`} onClick={() => setFilterOpen((open) => !open)}>
                  <CalendarDays size={17} />
                  <span>
                    <small>{range.label}</small>
                    <strong>{formatRangeLabel(range.start, range.end)}</strong>
                  </span>
                  <ChevronDown size={16} />
                </button>
                {filterOpen && (
                  <div className="date-range-popover">
                    <section>
                      <h3>Tez tanlash</h3>
                      <div className="quick-date-grid">
                        <button onClick={() => applyPreset("today")}>Bugun</button>
                        <button onClick={() => applyPreset("7")}>7 kun</button>
                        <button className={range.label === "30 kun" ? "active" : ""} onClick={() => applyPreset("30")}>30 kun</button>
                        <button onClick={() => applyPreset("month")}>Bu oy</button>
                        <button onClick={() => applyPreset("year")}>Bu yil</button>
                      </div>
                    </section>
                    <section className="exact-date-section">
                      <h3>Aniq davr</h3>
                      <div className="exact-date-grid">
                        <label>
                          <span>Dan</span>
                          <input type="date" value={draftStart || toInputDate(range.start)} onChange={(event) => setDraftStart(event.target.value)} />
                        </label>
                        <label>
                          <span>Gacha</span>
                          <input type="date" value={draftEnd || toInputDate(range.end)} onChange={(event) => setDraftEnd(event.target.value)} />
                        </label>
                      </div>
                      <button className="apply-date-button" onClick={applyExactRange}>Qo'llash</button>
                    </section>
                  </div>
                )}
              </div>
            </div>
          </div>
          {filteredRecent.length > 0 ? (
            <div className="activity-items-list">
              {filteredRecent.slice(0, 7).map((item) => (
                <div key={`${item.type}-${item.id}`} className="activity-list-item">
                  <div className={`activity-status-dot ${item.correct ? "correct" : item.correct === false ? "wrong" : ""}`}>
                    {item.type === "question" ? <FileText size={14} /> : <Activity size={14} />}
                  </div>
                  <div className="activity-content">
                    <div className="activity-header-line">
                      <strong className="activity-title">{item.title}</strong>
                      <span className="activity-time">{formatTime(item.createdAt)}</span>
                    </div>
                    <p className="activity-detail">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="table-no-data-widget">
              <FileText size={30} className="no-data-icon" />
              <p>Bu davrda progress yozilmagan</p>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

type RangePreset = "today" | "7" | "30" | "month" | "year";

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function getRangeByPreset(preset: RangePreset) {
  const now = new Date();
  const end = endOfDay(now);
  if (preset === "today") return { label: "Bugun", start: startOfDay(now), end };
  if (preset === "7") {
    const start = startOfDay(now);
    start.setDate(start.getDate() - 6);
    return { label: "7 kun", start, end };
  }
  if (preset === "month") return { label: "Bu oy", start: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), end };
  if (preset === "year") return { label: "Bu yil", start: startOfDay(new Date(now.getFullYear(), 0, 1)), end };
  const start = startOfDay(now);
  start.setDate(start.getDate() - 29);
  return { label: "30 kun", start, end };
}

function toInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatRangeLabel(start: Date, end: Date) {
  return `${formatShortDate(start)} - ${formatShortDate(end)}`;
}

function formatShortDate(date: Date) {
  const months = ["YAN", "FEV", "MAR", "APR", "MAY", "IYUN", "IYUL", "AVG", "SEN", "OKT", "NOY", "DEK"];
  return `${date.getDate()} ${months[date.getMonth()]}`;
}
