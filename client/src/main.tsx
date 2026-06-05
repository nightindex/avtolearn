import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  Award,
  Bell,
  Bookmark,
  BookOpen,
  Bot,
  Car,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  Expand,
  FileText,
  Flag,
  Gauge,
  GraduationCap,
  Hand,
  Home,
  Languages,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  Menu,
  MessageCircle,
  Moon,
  Plus,
  PlayCircle,
  RefreshCcw,
  Save,
  Search,
  ShieldAlert,
  Sparkles,
  Timer,
  Trophy,
  UserRound,
  Video,
  WalletCards,
  X,
} from "lucide-react";
import { askTutor, getData, getProgressSummary, getQuestions, getRecentProgress, getTemplates, saveQuestionProgress, saveTemplate, saveTestAttempt } from "./api";
import type { AppData, ProgressSummary, Question, QuestionResponse, RecentProgressItem, TestTemplate } from "./types";
import "./styles.css";
import { Dashboard } from "./components/Dashboard";

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
  | "media"
  | "ai";

const navGroups = [
  {
    title: "Learning",
    items: [
      { id: "home", label: "Bosh sahifa", icon: Home },
      { id: "lessons", label: "Darslar", icon: BookOpen },
      { id: "road-signs", label: "Yo'l belgilari", icon: Hand },
      { id: "autodrome", label: "Avtodrom", icon: Flag },
      { id: "media", label: "Media", icon: Video },
    ],
  },
  {
    title: "Tests",
    items: [
      { id: "template-tests", label: "Shablon testlar", icon: ClipboardList },
      { id: "random-tests", label: "Aralash testlar", icon: Sparkles },
      { id: "all-tests", label: "Barcha testlar", icon: ListChecks },
      { id: "saved-tests", label: "Saqlangan", icon: Save },
      { id: "final-exam", label: "Yakuniy imtihon", icon: Car },
    ],
  },
  {
    title: "Progress",
    items: [
      { id: "group", label: "Guruh", icon: UserRound },
      { id: "penalties", label: "Jarimalar", icon: ShieldAlert },
      { id: "appeals", label: "Murojaat", icon: FileText },
    ],
  },
  {
    title: "AI",
    items: [{ id: "ai", label: "AI Tutor", icon: Bot }],
  },
] as const;

type NavItem = (typeof navGroups)[number]["items"][number];

const viewTitles: Record<View, string> = {
  home: "Bosh sahifa",
  lessons: "Darslar",
  "road-signs": "Yo'l belgilari",
  penalties: "Jarimalar",
  appeals: "Murojaatlar",
  autodrome: "Avtodrom qo'llanmasi",
  group: "Guruh tafsilotlari",
  "template-tests": "Shablon testlar",
  "random-tests": "Aralash testlar",
  "all-tests": "Barcha testlar",
  "saved-tests": "Saqlangan testlar",
  "final-exam": "Yakuniy imtihon",
  media: "Media kutubxona",
  ai: "AI Tutor",
};

function asset(path: string) {
  return path ? `/${path}`.replaceAll("//", "/") : "";
}

function clean(value: string) {
  return value
    .replaceAll("вЂ", "'")
    .replaceAll("вЂ™", "'")
    .replaceAll("вЂ“", "-")
    .replaceAll("вЂ”", "-");
}

function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [recent, setRecent] = useState<RecentProgressItem[]>([]);
  const [view, setView] = useState<View>("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [questionForTutor, setQuestionForTutor] = useState<Question | null>(null);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<TestTemplate | null>(null);

  useEffect(() => {
    getData().then(setData).catch(console.error);
    refreshProgress();
  }, []);

  function refreshProgress() {
    getProgressSummary().then(setSummary).catch(console.error);
    getRecentProgress().then(setRecent).catch(console.error);
  }

  if (!data) {
    return <div className="loading">Avtolearn AI Studio yuklanmoqda...</div>;
  }

  const renderView = () => {
    if (view === "home") return <Dashboard data={data} summary={summary} recent={recent} setView={setView} />;
    if (view === "lessons") return <Lessons data={data} />;
    if (view === "road-signs") return <RoadSigns data={data} />;
    if (view === "template-tests") {
      if (!activeTemplate) {
        return <TemplateTestsPage onStart={(template) => setActiveTemplate(template)} />;
      }
      return (
        <QuestionStudio
          mode={view}
          activeTemplate={activeTemplate}
          onBack={() => setActiveTemplate(null)}
          onProgress={refreshProgress}
          onAskTutor={(q) => { setQuestionForTutor(q); setTutorOpen(true); }}
        />
      );
    }
    if (["random-tests", "all-tests", "saved-tests", "final-exam"].includes(view)) {
      return <QuestionStudio mode={view} onProgress={refreshProgress} onAskTutor={(q) => { setQuestionForTutor(q); setTutorOpen(true); }} />;
    }
    if (view === "autodrome") return <AutodromePage />;
    if (view === "media") return <MediaLibrary />;
    if (view === "ai") return <AiPanel question={questionForTutor} embedded />;
    return <OperationalPage view={view} data={data} />;
  };

  return (
    <div className="app">
      <Sidebar
        view={view}
        setView={(next) => {
          setView(next);
          if (next !== "template-tests") setActiveTemplate(null);
          setSidebarOpen(false);
        }}
        open={sidebarOpen}
        logo={data.brand.logo}
      />
      <main className="main">
        <Topbar
          search={globalSearch}
          setSearch={setGlobalSearch}
          toggleSidebar={() => setSidebarOpen(true)}
          openTutor={() => setTutorOpen(true)}
        />
        <section className="content">{renderView()}</section>
      </main>
      <button className="chat-fab" onClick={() => setTutorOpen(true)} aria-label="AI tutor">
        <MessageCircle size={22} />
      </button>
      {tutorOpen && (
        <div className="drawer">
          <AiPanel question={questionForTutor} onClose={() => setTutorOpen(false)} />
        </div>
      )}
    </div>
  );
}

function Sidebar({
  view,
  setView,
  open,
  logo,
}: {
  view: View;
  setView: (view: View) => void;
  open: boolean;
  logo: string;
}) {
  const navButton = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        className={`nav-item ${view === item.id ? "active" : ""}`}
        onClick={() => setView(item.id as View)}
      >
        <span className="nav-icon">
          <Icon size={18} />
        </span>
        <span>{item.label}</span>
      </button>
    );
  };

  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="brand">
        <img src={asset(logo)} alt="" />
        <div>
          <strong>Avtolearn</strong>
          <small>AI Studio</small>
        </div>
      </div>
      {navGroups.map((group) => (
        <div className="nav-group" key={group.title}>
          <div className="nav-title">
            <span>{group.title}</span>
            <ChevronDown size={13} />
          </div>
          <nav>{group.items.map(navButton)}</nav>
        </div>
      ))}
    </aside>
  );
}

function Topbar({
  search,
  setSearch,
  toggleSidebar,
  openTutor,
}: {
  search: string;
  setSearch: (value: string) => void;
  toggleSidebar: () => void;
  openTutor: () => void;
}) {
  return (
    <header className="topbar">
      <button className="icon-button mobile-only" onClick={toggleSidebar}>
        <Menu size={20} />
      </button>
      <label className="search-box global-search">
        <Search size={18} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Savollar, darslar, testlar..." />
        <kbd>Ctrl K</kbd>
      </label>
      <div className="topbar-actions">
        <button className="chip status-chip">Online</button>
        <button className="icon-button" title="Tungi rejim">
          <Moon size={18} />
        </button>
        <button className="language">
          <Languages size={17} /> UZ
        </button>
        <button className="icon-button" title="Fullscreen">
          <Expand size={18} />
        </button>
        <button className="icon-button" title="Bildirishnoma">
          <Bell size={18} />
        </button>
        <button className="profile">
          <span className="avatar">I</span>
          <span>I.MUXTOROV</span>
          <ChevronDown size={15} />
        </button>
        <button className="ai-button" onClick={openTutor}>
          <Bot size={18} /> AI
        </button>
      </div>
    </header>
  );
}

function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </div>
  );
}




function Lessons({ data }: { data: AppData }) {
  const [activeLesson, setActiveLesson] = useState<number | null>(null);

  const topicCountFor = (lessonId: number) =>
    data.topics.filter((topic) => topic.lessonId === lessonId).length;

  const selectedLesson = activeLesson !== null
    ? data.lessons.find((l) => l.id === activeLesson) ?? null
    : null;

  const lessonTopics = selectedLesson
    ? data.topics.filter((t) => t.lessonId === selectedLesson.id)
    : [];

  const formatTime = (seconds?: number) => {
    if (!seconds) return "";
    const m = Math.floor(seconds / 60);
    return m > 0 ? `${m} daqiqa` : `${seconds} soniya`;
  };

  const topicTypeLabel = (type: number) => {
    if (type === 1) return "Nazariy";
    if (type === 2) return "Amaliy";
    if (type === 3) return "Test";
    return "Dars";
  };

  if (selectedLesson) {
    return (
      <div className="page-shell">
        <PageHeader
          title={clean(selectedLesson.title)}
          subtitle={`${selectedLesson.shortName} — ${lessonTopics.length} ta mavzu`}
          eyebrow="Dars tafsilotlari"
          actions={
            <button className="link-button" onClick={() => setActiveLesson(null)}>
              ← Ortga qaytish
            </button>
          }
        />
        {lessonTopics.length === 0 ? (
          <div className="empty-state-card">
            <BookOpen size={36} />
            <p>Bu dars uchun mavzular hali yuklanmagan.</p>
          </div>
        ) : (
          <div className="topic-list">
            {lessonTopics.map((topic, index) => (
              <article className="topic-card" key={topic.id}>
                <div className="topic-index">{index + 1}</div>
                <div className="topic-body">
                  <h4 className="topic-title">{clean(topic.title)}</h4>
                  <div className="topic-meta">
                    <span className={`topic-type-badge type-${topic.type}`}>
                      {topicTypeLabel(topic.type)}
                    </span>
                    {topic.questionCount > 0 && (
                      <span className="topic-question-count">
                        {topic.questionCount} ta savol
                      </span>
                    )}
                    {topic.timeLimit ? (
                      <span className="topic-time-limit">
                        <Timer size={13} /> {formatTime(topic.timeLimit)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="topic-status">
                  <span className="topic-status-dot pending"></span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHeader title="Darslar" subtitle="Nazariy modullar, mavzular va lokal o'quv materiallari." />
      <div className="section-grid">
        {data.lessons.map((lesson) => {
          const lessonTopicCount = lesson.topicCount ?? topicCountFor(lesson.id);
          return (
            <article className="card lesson-card" key={lesson.id}>
              <span>{lesson.shortName}</span>
              <h3>{clean(lesson.title)}</h3>
              <p>{lessonTopicCount} ta mavzu va lokal materiallar</p>
              <button className="link-button" onClick={() => setActiveLesson(lesson.id)}>
                Boshlash <ArrowRight size={16} />
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function RoadSigns({ data }: { data: AppData }) {
  return (
    <div className="page-shell">
      <PageHeader title="Yo'l belgilari" subtitle="Belgilar katalogi va imtihonlarda uchraydigan vizual holatlar." />
      <div className="section-grid">
        {data.signs.map((sign) => (
          <article className="card sign-card" key={sign.id}>
            <img src={asset(sign.image)} alt="" />
            <h3>{clean(sign.title)}</h3>
            <p>{sign.count} ta belgi</p>
          </article>
        ))}
      </div>
    </div>
  );
}

const autodromeTabs = [
  {
    id: "be-ce-de",
    label: "BE, CE, DE toifalar",
    title: "BE, CE, DE toifalari avtodrom",
    description: "Tirkamali transport vositalari uchun asosiy amaliy mashqlar ketma-ketligi.",
    images: [{ src: "/assets/autodrome/be-ce-de.png", label: "BE, CE, DE toifalari uchun avtodrom sxemasi" }],
    tasks: [
      "Harakatni boshlash (START)",
      "Orqa bortni platformaga qo'yish",
      "Platformadan yo'lga chiqish",
      "Gabaritli koridorda orqa tomonga to'g'ri chiziqda harakatlanish",
      "Harakatni yakunlash (FINISH)",
    ],
  },
  {
    id: "b-c-d",
    label: "B, C, D toifalar",
    title: "B, C, D toifalari avtodrom",
    description: "Yengil, yuk va yo'lovchi tashuvchi transport vositalari uchun yopiq maydon mashqlari.",
    images: [
      { src: "/assets/autodrome/b-c-d-main.jpg", label: "B, C, D toifalari uchun avtodrom sxemasi" },
      { src: "/assets/autodrome/b-c-d-extra.png", label: "B, C, D toifalari uchun qo'shimcha sxema" },
    ],
    tasks: [
      "Harakatni boshlash (START)",
      "Piyodalar o'tish joyi",
      "To'xtash va tik balandlikka ko'tarilish (Estakada)",
      "90 gradus burchak ostida burilishlar",
      "Tor joyda qayrilib olish uchun boksga kirish",
      "Harakat tartibga solingan chorraha",
      "Ilon izi",
      "Orqaga harakatlanib parallel to'xtash (Parkovka)",
      "Temir yo'l kesishmasi (Tartibga solinmagan)",
      "Tezlashish bo'lagi",
      "Avariya holatda to'xtash",
      "Harakatni yakunlash (FINISH)",
    ],
  },
  {
    id: "a",
    label: "A toifa",
    title: "A toifa avtodrom",
    description: "Mototsikl boshqaruvi uchun muvozanat, burilish va to'xtash mashqlari.",
    images: [{ src: "/assets/autodrome/a-category.png", label: "A toifasi uchun avtodrom sxemasi" }],
    tasks: [
      "Harakatni boshlash (START)",
      "Ilon izi",
      "Tor yo'lak",
      "Tezlashish-sekinlashish",
      "Gabaritli yarim aylana",
      "Gabaritli koridor",
      "Past tezlikda harakatlanish",
      "Gabaritli sakkiz",
      "Harakatni yakunlash (FINISH)",
    ],
  },
] as const;

function AutodromePage() {
  const [activeTab, setActiveTab] = useState<(typeof autodromeTabs)[number]["id"]>("be-ce-de");
  const active = autodromeTabs.find((tab) => tab.id === activeTab) ?? autodromeTabs[0];

  return (
    <div className="autodrome-page page-shell">
      <PageHeader
        eyebrow="Amaliy maydon"
        title="Avtodrom qo'llanmasi"
        subtitle="Toifalar bo'yicha avtodrom mashqlari, bajarish tartibi va sxemasi."
      />

      <section className="autodrome-tabs" aria-label="Avtodrom toifalari">
        {autodromeTabs.map((tab) => (
          <button
            key={tab.id}
            className={active.id === tab.id ? "active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </section>

      <section className="autodrome-layout">
        <article className="autodrome-card autodrome-task-card">
          <span className="autodrome-kicker">{active.title}</span>
          <h2>{active.label} uchun bajariladigan amaliy mashqlar</h2>
          <p>{active.description}</p>
          <ol>
            {active.tasks.map((task) => (
              <li key={task}>{task}</li>
            ))}
          </ol>
        </article>

        <article className="autodrome-card autodrome-checklist-card">
          <h2>Baholashda e'tibor beriladi</h2>
          <div className="autodrome-check-list">
            {[
              "Chiziq va belgilardan chiqmaslik",
              "Ortiqcha to'xtashsiz ravon boshqarish",
              "Mashq ketma-ketligini buzmaslik",
              "START va FINISH talablariga rioya qilish",
            ].map((item) => (
              <div key={item}>
                <CheckCircle2 size={17} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="autodrome-card autodrome-scheme-card">
        <div className="autodrome-section-title">
          <span>Sxema</span>
          <h2>{active.label} avtodrom sxemasi</h2>
        </div>
        <div className="autodrome-scheme-gallery">
          {active.images.map((image) => (
            <figure className="autodrome-scheme-figure" key={image.src}>
              <img className="autodrome-scheme-image" src={image.src} alt={image.label} />
              <figcaption>{image.label}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </div>
  );
}

type TemplateFilter = "all" | "completed" | "not-started" | "saved" | "weak";
type TemplateSort = "number" | "best" | "not-started";

function TemplateTestsPage({ onStart }: { onStart: (template: TestTemplate) => void }) {
  const [templates, setTemplates] = useState<TestTemplate[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TemplateFilter>("all");
  const [sort, setSort] = useState<TemplateSort>("number");
  const [visible, setVisible] = useState(24);

  useEffect(() => {
    getTemplates().then(setTemplates).catch(console.error);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates
      .filter((template) => {
        const haystack = `${template.id} ${template.name}`.toLowerCase();
        if (q && !haystack.includes(q)) return false;
        if (filter === "completed") return Boolean(template.completed);
        if (filter === "not-started") return !template.completed;
        if (filter === "saved") return Boolean(template.saved);
        if (filter === "weak") return Boolean(template.completed) && Number(template.bestPercent || 0) < 70;
        return true;
      })
      .sort((a, b) => {
        if (sort === "best") return Number(b.bestPercent || 0) - Number(a.bestPercent || 0);
        if (sort === "not-started") return Number(a.completed) - Number(b.completed) || a.id - b.id;
        return a.id - b.id;
      });
  }, [templates, query, filter, sort]);

  const visibleTemplates = filtered.slice(0, visible);
  const completedCount = templates.filter((template) => template.completed).length;
  const bestScore = templates.reduce((best, template) => Math.max(best, Number(template.bestPercent || 0)), 0);

  async function toggleSaved(event: React.MouseEvent, template: TestTemplate) {
    event.stopPropagation();
    await saveTemplate({ templateId: template.id, saved: !template.saved });
    setTemplates((items) =>
      items.map((item) => (item.id === template.id ? { ...item, saved: !item.saved } : item)),
    );
  }

  return (
    <div className="template-page page-shell">
      <PageHeader
        eyebrow="Imtihon katalogi"
        title="Shablon testlar"
        subtitle="62 ta imtihon varianti, lokal savollar va real progress bilan."
      />

      <section className="template-summary">
        <div><strong>{templates.length || 62}</strong><span>shablon</span></div>
        <div><strong>25</strong><span>daqiqa</span></div>
        <div><strong>20</strong><span>savol</span></div>
        <div><strong>{bestScore}%</strong><span>eng yaxshi</span></div>
        <div><strong>{completedCount}</strong><span>yakunlangan</span></div>
      </section>

      <section className="card template-controls">
        <label className="search-box wide">
          <Search size={17} />
          <input value={query} onChange={(event) => { setVisible(24); setQuery(event.target.value); }} placeholder="Shablon raqami yoki nomi" />
        </label>
        <div className="template-filters">
          {[
            ["all", "All"],
            ["completed", "Completed"],
            ["not-started", "Not started"],
            ["saved", "Saved"],
            ["weak", "Weak result"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={`pill ${filter === id ? "active" : ""}`}
              onClick={() => { setVisible(24); setFilter(id as TemplateFilter); }}
            >
              {label}
            </button>
          ))}
        </div>
        <select value={sort} onChange={(event) => setSort(event.target.value as TemplateSort)}>
          <option value="number">Template number</option>
          <option value="best">Best score</option>
          <option value="not-started">Not started</option>
        </select>
      </section>

      <section className="template-grid">
        {visibleTemplates.map((template) => {
          const percent = Number(template.bestPercent || 0);
          const completed = Boolean(template.completed);
          const weak = completed && percent < 70;
          return (
            <article className={`template-card card ${completed ? "completed" : ""} ${weak ? "weak" : ""}`} key={template.id} onClick={() => onStart(template)}>
              <button className={`bookmark-button ${template.saved ? "saved" : ""}`} onClick={(event) => toggleSaved(event, template)} aria-label="Save template">
                <Bookmark size={18} />
              </button>
              <h2>{template.id} SHABLON</h2>
              <div className="template-card-body">
                <span className="template-status-ring">
                  {completed ? <CheckCircle2 size={24} /> : <PlayCircle size={24} />}
                </span>
                <div className="template-card-meta">
                  <p>To'g'ri javoblar: <strong>{Math.round((percent / 100) * Number(template.questions || 20))}</strong></p>
                  <p>Savol: <strong>{template.questions || 20}</strong></p>
                  <p>Vaqt: <strong>{template.durationMinutes || 25} daqiqa</strong></p>
                </div>
              </div>
              <span className={`template-status ${weak ? "weak" : completed ? "completed" : "idle"}`}>
                {weak ? "Weak" : completed ? "Completed" : "Not started"}
              </span>
            </article>
          );
        })}
      </section>

      {visible < filtered.length && (
        <button className="template-load-more" onClick={() => setVisible((count) => count + 24)}>
          Load more ({filtered.length - visible} left)
        </button>
      )}
    </div>
  );
}

function QuestionStudio({
  mode,
  activeTemplate,
  onBack,
  onProgress,
  onAskTutor,
}: {
  mode: View;
  activeTemplate?: TestTemplate | null;
  onBack?: () => void;
  onProgress: () => void;
  onAskTutor: (question: Question) => void;
}) {
  const [query, setQuery] = useState("");
  const [hasVideo, setHasVideo] = useState(false);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<QuestionResponse | null>(null);
  const [selected, setSelected] = useState<Record<number, number>>({});

  useEffect(() => {
    getQuestions({ page, pageSize: 1, query, hasVideo: hasVideo || undefined, templateId: activeTemplate?.id }).then(setResult).catch(console.error);
  }, [page, query, hasVideo, activeTemplate?.id]);

  const modeLabel = activeTemplate ? `${activeTemplate.id} Shablon` : viewTitles[mode];
  const score = useMemo(() => {
    if (!result) return 0;
    return result.data.filter((q) => {
      const picked = selected[q.id];
      return q.answers.find((answer) => answer.id === picked)?.correct;
    }).length;
  }, [result, selected]);

  async function answerQuestion(question: Question, answerId: number) {
    const answer = question.answers.find((item) => item.id === answerId);
    setSelected((current) => ({ ...current, [question.id]: answerId }));
    await saveQuestionProgress({ questionId: question.id, answerId, correct: Boolean(answer?.correct) });
    onProgress();
  }

  async function finishAttempt() {
    if (!result) return;
    await saveTestAttempt({ mode: activeTemplate ? `template-tests:${activeTemplate.id}` : mode, score, total: result.data.length });
    onProgress();
  }

  const currentQuestion = result?.data[0];
  const picked = currentQuestion ? selected[currentQuestion.id] : undefined;
  const pickedAnswer = currentQuestion?.answers.find((answer) => answer.id === picked);

  return (
    <div className="page-shell questions-page">
      <PageHeader
        title={modeLabel}
        subtitle={activeTemplate ? `${activeTemplate.questions || 20} savol • ${activeTemplate.durationMinutes || 25} daqiqa • shablon imtihon` : "Lokal savollar, rasm/video va izohlar bilan amaliy mashq."}
        actions={
          <>
            {onBack && <button className="ghost-button" onClick={onBack}><ArrowRight size={16} /> Katalogga qaytish</button>}
            <button className="primary-button" onClick={finishAttempt}>Natijani saqlash</button>
          </>
        }
      />
      <section className="card question-toolbar">
        <label className="search-box wide">
          <Search size={17} />
          <input value={query} onChange={(e) => { setPage(1); setQuery(e.target.value); }} placeholder="Savol yoki javobdan qidirish" />
        </label>
        <button className={`pill ${hasVideo ? "active" : ""}`} onClick={() => { setPage(1); setHasVideo(!hasVideo); }}>
          Faqat video
        </button>
      </section>

      {currentQuestion && (
        <section className="trainer-shell">
          <article className="card question-card trainer-media">
            <div className="question-head">
              <span className="tag">#{currentQuestion.id}</span>
              <span className="activity-badge">{result?.page ?? 1}/{result?.totalPages ?? 1}</span>
            </div>
            <h2>{clean(currentQuestion.title)}</h2>
            {currentQuestion.image && <img className="question-media" src={asset(currentQuestion.image)} alt="" loading="lazy" />}
            {currentQuestion.video && <video className="question-video" src={asset(currentQuestion.video)} controls preload="metadata" />}
            {picked && <p className="explanation">{clean(currentQuestion.explanation)}</p>}
          </article>

          <aside className="card trainer-panel">
            <div className="trainer-progress">
              <span>Jami: {result?.total ?? 0}</span>
              <span>Natija: {score}/{result?.data.length ?? 0}</span>
            </div>
            <div className="answers">
              {currentQuestion.answers.map((answer, index) => {
                const chosen = picked === answer.id;
                const revealed = Boolean(picked);
                return (
                  <button
                    key={answer.id}
                    className={`answer ${revealed && answer.correct ? "correct" : ""} ${chosen && !answer.correct ? "wrong" : ""}`}
                    onClick={() => answerQuestion(currentQuestion, answer.id)}
                  >
                    <span>{index + 1}. {clean(answer.text)}</span>
                  </button>
                );
              })}
            </div>
            <div className="ai-context-card">
              <Bot size={18} />
              <div>
                <strong>AI yordamchi</strong>
                <p>{pickedAnswer && !pickedAnswer.correct ? "Nega xato bo'lganini tushuntirib beradi." : "Savolni lokal materiallar asosida tushuntiradi."}</p>
              </div>
              <button className="ghost-button" onClick={() => onAskTutor(currentQuestion)}>
                {pickedAnswer && !pickedAnswer.correct ? "Explain why" : "Ask AI"}
              </button>
            </div>
            <div className="trainer-actions">
              <button disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Oldingi</button>
              <button className="primary-button" onClick={finishAttempt}>Saqlash</button>
              <button disabled={!result || page >= result.totalPages} onClick={() => setPage((current) => current + 1)}>Keyingi</button>
            </div>
          </aside>
        </section>
      )}

      <div className="pager">
        <button disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Oldingi</button>
        <button disabled={!result || page >= result.totalPages} onClick={() => setPage((current) => current + 1)}>Keyingi</button>
      </div>
    </div>
  );
}

function MediaLibrary() {
  const [result, setResult] = useState<QuestionResponse | null>(null);
  useEffect(() => {
    getQuestions({ page: 1, pageSize: 50, hasVideo: true }).then(setResult).catch(console.error);
  }, []);
  return (
    <div className="page-shell">
      <PageHeader title="Media kutubxona" subtitle="Offline video va rasmli savollar galereyasi." />
      <div className="media-tabs">
        <button className="pill active"><Video size={16} /> Videolar</button>
        <button className="pill"><FileText size={16} /> Rasmlar</button>
      </div>
      <div className="media-grid">
        {result?.data.map((question) => (
          <article className="card media-card" key={question.id}>
            {question.video ? <video src={asset(question.video)} controls preload="metadata" /> : <img src={asset(question.image)} alt="" />}
            <h3>{clean(question.title)}</h3>
            <span className="tag">#{question.id}</span>
          </article>
        ))}
      </div>
    </div>
  );
}

function OperationalPage({ view, data }: { view: View; data: AppData }) {
  const rows = [
    ["Darslar", data.lessons.length],
    ["Savollar", data.counts.questions],
    ["Rasmlar", data.counts.images],
    ["Videolar", data.counts.videos],
  ];
  return (
    <div className="page-shell">
      <PageHeader title={viewTitles[view]} subtitle="Bo'lim lokal platforma dizayniga mos tayyorlandi va real oqimlarni ulashga tayyor." />
      <section className="placeholder-grid">
        <article className="card placeholder-page">
          <span className="metric-icon"><LayoutDashboard size={22} /></span>
          <h2>Operatsion holat</h2>
          <p>Ma'lumotlar offline bazadan olinadi. Keyingi bosqichda forma va bildirishnomalar ulanadi.</p>
          <div className="stat-list">
            {rows.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="card placeholder-page">
          <span className="metric-icon amber"><Gauge size={22} /></span>
          <h2>Tezkor harakatlar</h2>
          <p>Dashboard uslubidagi boshqaruv kartalari ushbu bo'lim uchun ham tayyor.</p>
          <button className="primary-button">Yangi yozuv</button>
        </article>
      </section>
    </div>
  );
}

function AiPanel({ question, onClose, embedded }: { question: Question | null; onClose?: () => void; embedded?: boolean }) {
  const [message, setMessage] = useState(question ? "Bu savolni tushuntirib bering" : "");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!message.trim()) return;
    const current = message;
    setMessages((items) => [...items, { role: "user", text: current }]);
    setMessage("");
    setLoading(true);
    try {
      const reply = await askTutor({ message: current, questionId: question?.id, mode: "tutor" });
      setMessages((items) => [...items, { role: "assistant", text: reply.answer }]);
    } catch {
      setMessages((items) => [...items, { role: "assistant", text: "AI tutor hozircha javob bera olmadi." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className={`ai-panel ${embedded ? "embedded" : ""}`}>
      <div className="ai-header">
        <div>
          <span className="tag"><Sparkles size={13} /> AI Tutor</span>
          <h2>Mahalliy materiallar bo'yicha yordamchi</h2>
        </div>
        {onClose && <button className="icon-button" onClick={onClose}><X size={18} /></button>}
      </div>
      {question && <div className="ai-context">Kontekst: #{question.id} {clean(question.title)}</div>}
      <div className="ai-messages">
        {messages.length === 0 && <p className="muted">Savol, javob yoki YHQ qoidasi haqida so'rang.</p>}
        {messages.map((item, index) => (
          <div key={`${item.role}-${index}`} className={`bubble ${item.role}`}>{item.text}</div>
        ))}
        {loading && <div className="bubble assistant">O'ylayapman...</div>}
      </div>
      <div className="ai-input">
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="AI tutordan so'rang" />
        <button className="primary-button" onClick={send}>Yuborish</button>
      </div>
    </aside>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
