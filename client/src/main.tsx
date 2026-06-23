import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
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
  Eye,
  EyeOff,
  Expand,
  FileText,
  Flag,
  Gauge,
  Globe,
  GraduationCap,
  Hand,
  Home,
  Lightbulb,
  ListChecks,
  Lock,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  PanelLeft,
  Paperclip,
  Moon,
  Plus,
  PlayCircle,
  ShieldCheck,
  RefreshCcw,
  Save,
  Search,
  SendHorizontal,
  ShieldAlert,
  Scale,
  Sparkles,
  Sun,
  Timer,
  Trophy,
  Trash2,
  UserRound,
  Video,
  Volume2,
  WalletCards,
  X,
} from "lucide-react";
import { askTutor, createAiSession, deleteAiSession, getCurrentUser, getData, getProgressSummary, getQuestions, getRecentProgress, getSavedQuestions, getTemplates, listAiSessions, login, logout as logoutApi, saveQuestion, saveQuestionProgress, saveTemplate, saveTestAttempt, updateProfile, type AiChatSession, type AuthUser } from "./api";
import type { AppData, Penalty, ProgressSummary, Question, QuestionResponse, RecentProgressItem, RoadSignItem, TestTemplate, Topic } from "./types";
import "./styles.css";
import { Dashboard } from "./components/Dashboard";
import { AppLanguage, languages, languageDescriptions, translateUi } from "./utils/i18n";
import { sanitizeTopicHtml } from "./utils/sanitize";
import { LoginPage } from "./components/LoginPage";
import { LanguageSelector } from "./components/LanguageSelector";
import { AdminShell, canUseAdmin, type AdminSection } from "./components/admin/AdminShell";

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
  | "ai"
  | "profile"
  | "admin";

const navGroups = [
  {
    title: "O'qish",
    items: [
      { id: "home", label: "Bosh sahifa", icon: Home },
      { id: "lessons", label: "Darslar", icon: BookOpen },
      { id: "road-signs", label: "Yo'l belgilari", icon: Hand },
      { id: "penalties", label: "Jarimalar", icon: Scale },
      { id: "autodrome", label: "Avtodrom", icon: Flag },
    ],
  },
  {
    title: "Testlar",
    items: [
      { id: "template-tests", label: "Shablon testlar", icon: ClipboardList },
      { id: "random-tests", label: "Aralash testlar", icon: Sparkles },
      { id: "all-tests", label: "Barcha testlar", icon: ListChecks },
      { id: "saved-tests", label: "Saqlangan", icon: Save },
      { id: "final-exam", label: "Yakuniy imtihon", icon: Car },
    ],
  },
  {
    title: "Natijalar",
    items: [
      { id: "group", label: "Rayting", icon: Trophy },
      { id: "appeals", label: "Murojaat", icon: FileText },
    ],
  },
  {
    title: "AI",
    items: [{ id: "ai", label: "AI Tutor", icon: Bot }],
  },
] as const;

type NavItem = (typeof navGroups)[number]["items"][number];

type RandomTestConfig = {
  count: number;
  seed: string;
  durationMinutes: number;
  startedAt: string;
  label?: string;
};

const viewTitles: Record<View, string> = {
  home: "Bosh sahifa",
  lessons: "Darslar",
  "road-signs": "Yo'l belgilari",
  penalties: "Jarimalar",
  appeals: "Murojaatlar",
  autodrome: "Avtodrom qo'llanmasi",
  group: "Rayting",
  "template-tests": "Shablon testlar",
  "random-tests": "Aralash testlar",
  "all-tests": "Barcha testlar",
  "saved-tests": "Saqlangan testlar",
  "final-exam": "Yakuniy imtihon",
  ai: "AI Tutor",
  profile: "Profil",
  admin: "Admin",
};

// AppLanguage, languages, and languageDescriptions are now imported from ./utils/i18n

const learnerPathByView: Record<Exclude<View, "admin">, string> = {
  home: "/learner/dashboard",
  lessons: "/learner/lessons",
  "road-signs": "/learner/road-signs",
  penalties: "/learner/penalties",
  appeals: "/learner/appeals",
  autodrome: "/learner/autodrome",
  group: "/learner/rating",
  "template-tests": "/learner/tests/templates",
  "random-tests": "/learner/tests/random",
  "all-tests": "/learner/tests/all",
  "saved-tests": "/learner/tests/saved",
  "final-exam": "/learner/tests/final-exam",
  ai: "/learner/ai-tutor",
  profile: "/learner/profile",
};

const viewByLearnerPath = new Map<string, Exclude<View, "admin">>(
  Object.entries(learnerPathByView).map(([view, path]) => [path, view as Exclude<View, "admin">]),
);

const adminPathBySection: Record<AdminSection, string> = {
  overview: "/admin/dashboard",
  users: "/admin/users",
  reports: "/admin/reports",
  lessons: "/admin/catalog/lessons",
  topics: "/admin/catalog/topics",
  "topic-contents": "/admin/catalog/topic-contents",
  questions: "/admin/catalog/questions",
  templates: "/admin/catalog/templates",
  "road-sign-categories": "/admin/catalog/road-sign-categories",
  "road-signs": "/admin/catalog/road-signs",
  penalties: "/admin/catalog/penalties",
};

const adminSectionByPath = new Map<string, AdminSection>(
  Object.entries(adminPathBySection).map(([section, path]) => [path, section as AdminSection]),
);

const profileUser = {
  name: "I.MUXTOROV",
  initials: "I",
  role: "Administrator",
  email: "i.muxtorov@avtolearn.uz",
};

const AUTH_STORAGE_KEY = "avtolearn-authenticated";
// Translation utility functions and dictionaries are imported from ./utils/i18n

function roleLabel(user: AuthUser | null) {
  if (!user) return profileUser.role;
  if (user.roles.includes("super_admin")) return "Super admin";
  if (user.roles.includes("admin")) return "Administrator";
  return "Student";
}

function userInitials(user: AuthUser | null) {
  if (!user) return profileUser.initials;
  return user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

function avatarColor(user: AuthUser | null) {
  return user?.avatarColor || "#1477d4";
}

function avatarSize(user: AuthUser | null, fallback = 52) {
  return Math.min(96, Math.max(32, Number(user?.avatarSize || fallback)));
}

function UserAvatar({ user, className = "", size }: { user: AuthUser | null; className?: string; size?: number }) {
  const resolvedSize = size ?? avatarSize(user);
  const hasImage = Boolean(user?.avatarUrl?.trim());
  const style = {
    "--avatar-color": avatarColor(user),
    "--avatar-size": `${resolvedSize}px`,
  } as React.CSSProperties;
  return (
    <span className={`user-avatar ${hasImage ? "has-image" : "no-image"} ${className}`} style={style}>
      <span>{userInitials(user)}</span>
      {hasImage && <img alt="" src={user?.avatarUrl} onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.closest(".user-avatar")?.classList.add("no-image"); }} />}
    </span>
  );
}

function routeFromPath(pathname = window.location.pathname): { workspace: "admin"; section: AdminSection } | { workspace: "learner"; view: Exclude<View, "admin"> } {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/admin") return { workspace: "admin", section: "overview" };
  if (path.startsWith("/admin/")) return { workspace: "admin", section: adminSectionByPath.get(path) || "overview" };
  if (path === "/" || path === "/login" || path === "/learner") return { workspace: "learner", view: "home" };
  if (path.startsWith("/learner/")) return { workspace: "learner", view: viewByLearnerPath.get(path) || "home" };
  return { workspace: "learner", view: "home" };
}

function setLoginPath(mode: "push" | "replace" = "replace") {
  if (window.location.pathname === "/login") return;
  const method = mode === "replace" ? "replaceState" : "pushState";
  window.history[method]({ view: "login" }, "", "/login");
}

function setAppPath(next: View, mode: "push" | "replace" = "push", adminSection: AdminSection = "overview") {
  const nextPath = next === "admin" ? adminPathBySection[adminSection] : learnerPathByView[next];
  if (window.location.pathname === nextPath) return;
  const method = mode === "replace" ? "replaceState" : "pushState";
  window.history[method]({ view: next, adminSection }, "", nextPath);
}

function permittedAdminSection(user: AuthUser, section: AdminSection): AdminSection {
  if (section === "overview") return section;
  if (section === "users") return user.permissions.includes("admin:users") ? section : "overview";
  if (section === "reports") return user.permissions.includes("admin:reports") ? section : "overview";
  return user.permissions.includes("admin:catalog") ? section : "overview";
}


function getStoredLanguage(): AppLanguage {
  const stored = localStorage.getItem("language");
  return languages.some((item) => item.id === stored) ? (stored as AppLanguage) : "uz";
}

function shouldTranslateNode(node: Node) {
  const parent = node.parentElement;
  if (!parent) return false;
  return !parent.closest("script, style, svg, kbd, code, pre, .brand, .profile, [data-no-translate]");
}

function useUiLanguageEffect(language: AppLanguage) {
  const originalsRef = useRef(new WeakMap<Text, string>());

  useEffect(() => {
    const root = document.querySelector(".app");
    if (!root) return;

    const translateRoot = () => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

      for (const node of textNodes) {
        if (!shouldTranslateNode(node)) continue;
        if (!originalsRef.current.has(node)) originalsRef.current.set(node, node.nodeValue ?? "");
        const original = originalsRef.current.get(node) ?? "";
        const next = translateUi(original, language);
        if (node.nodeValue !== next) node.nodeValue = next;
      }

      root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[placeholder]").forEach((element) => {
        if (!element.dataset.originalPlaceholder) {
          element.dataset.originalPlaceholder = element.getAttribute("placeholder") ?? "";
        }
        element.setAttribute("placeholder", translateUi(element.dataset.originalPlaceholder, language));
      });

      root.querySelectorAll<HTMLElement>("[title]").forEach((element) => {
        if (!element.dataset.originalTitle) {
          element.dataset.originalTitle = element.getAttribute("title") ?? "";
        }
        element.setAttribute("title", translateUi(element.dataset.originalTitle, language));
      });
    };

    translateRoot();
    const observer = new MutationObserver(() => window.requestAnimationFrame(translateRoot));
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [language]);
}

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

function backendAsset(path: string) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  if (path.startsWith("/files/")) return `https://back.eavtotalim.uz${path}`;
  return asset(path);
}

function isImageContent(value: string) {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(value.split("?")[0]);
}

function compareCode(a: string, b: string) {
  const left = a.split(".").map((part) => Number(part.replace(/\D/g, "")) || 0);
  const right = b.split(".").map((part) => Number(part.replace(/\D/g, "")) || 0);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return a.localeCompare(b, "uz");
}

function effectiveSignCode(sign: RoadSignItem) {
  const titleCode = sign.title.match(/^\s*(\d+(?:\.\d+)*)/)?.[1];
  if (titleCode && !sign.code.includes(".")) {
    return `${sign.typeId}.${titleCode}`;
  }
  return sign.code;
}

function displaySignCode(sign: RoadSignItem) {
  const effective = effectiveSignCode(sign);
  return effective === sign.code ? sign.code : effective;
}

function uniquePreviewImages(sign: RoadSignItem) {
  const previews = sign.previewImages?.length ? sign.previewImages : [sign.image];
  const unique = Array.from(new Set(previews.filter(Boolean)));
  const codeSlug = `${sign.typeId}-${sign.code}`;
  const duplicateSignArt =
    unique.length === 2 &&
    unique.some((image) => image.includes(`/items/${codeSlug}`)) &&
    unique.some((image) => image.includes(`/content/${codeSlug}`));
  return duplicateSignArt ? [sign.image] : unique;
}

function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [data, setData] = useState<AppData | null>(null);
  const [dataError, setDataError] = useState("");
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [recent, setRecent] = useState<RecentProgressItem[]>([]);
  const [view, setView] = useState<View>("home");
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark");
  const [language, setLanguage] = useState<AppLanguage>(getStoredLanguage);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [questionForTutor, setQuestionForTutor] = useState<Question | null>(null);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<TestTemplate | null>(null);
  const [activeRandomTest, setActiveRandomTest] = useState<RandomTestConfig | null>(null);
  const [activeFinalExam, setActiveFinalExam] = useState<RandomTestConfig | null>(null);
  const [adminSection, setAdminSection] = useState<AdminSection>("overview");

  useEffect(() => {
    getCurrentUser()
      .then((user) => {
        setCurrentUser(user);
        setIsAuthenticated(Boolean(user));
        if (!user) {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          setLoginPath("replace");
          return;
        }
        const route = routeFromPath();
        if (route.workspace === "admin" && canUseAdmin(user)) {
          const nextSection = permittedAdminSection(user, route.section);
          setAdminSection(nextSection);
          setView("admin");
          setAppPath("admin", "replace", nextSection);
          return;
        }
        const nextView = route.workspace === "learner" ? route.view : "home";
        setView(nextView);
        setAppPath(nextView, "replace");
      })
      .catch(() => {
        setCurrentUser(null);
        setIsAuthenticated(false);
        localStorage.removeItem(AUTH_STORAGE_KEY);
        setLoginPath("replace");
      })
      .finally(() => setAuthChecked(true));
  }, []);

  const loadAppData = useCallback(() => {
    setDataError("");
    getData()
      .then((nextData) => {
        setData(nextData);
        setDataError("");
      })
      .catch((error) => {
        console.error(error);
        setData(null);
        setDataError("Ma'lumotlar serveriga ulanib bo'lmadi. Backend 5180-portda ishlayotganini tekshiring.");
      });
    refreshProgress();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadAppData();
  }, [isAuthenticated]);

  useEffect(() => {
    localStorage.setItem("theme", darkMode ? "dark" : "light");
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem("language", language);
    document.documentElement.lang = language === "ru" ? "ru" : language === "uz-cyrl" ? "uz-Cyrl" : "uz-Latn";
  }, [language]);

  useUiLanguageEffect(language);

  const navigateTo = useCallback((next: View) => {
    if (next === "admin" && !canUseAdmin(currentUser)) {
      setView("home");
      setAppPath("home", "replace");
      return;
    }
    if (next === "admin") {
      setAdminSection("overview");
      setAppPath("admin", "push", "overview");
    } else {
      setAppPath(next);
    }
    setView(next);
    if (next !== "template-tests") setActiveTemplate(null);
    if (next !== "random-tests") setActiveRandomTest(null);
    if (next !== "final-exam") setActiveFinalExam(null);
    setSidebarOpen(false);
    setGlobalSearch("");
  }, [currentUser]);

  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    const onPopState = () => {
      const route = routeFromPath();
      if (route.workspace === "admin") {
        if (currentUser && canUseAdmin(currentUser)) {
          const nextSection = permittedAdminSection(currentUser, route.section);
          setAdminSection(nextSection);
          setView("admin");
          if (nextSection !== route.section) setAppPath("admin", "replace", nextSection);
          return;
        }
        setView("home");
        setAppPath("home", "replace");
        return;
      }
      setView(route.view);
      if (route.view !== "template-tests") setActiveTemplate(null);
      if (route.view !== "random-tests") setActiveRandomTest(null);
      if (route.view !== "final-exam") setActiveFinalExam(null);
      setSidebarOpen(false);
      setGlobalSearch("");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [authChecked, currentUser, isAuthenticated]);

  function refreshProgress() {
    getProgressSummary().then(setSummary).catch(console.error);
    getRecentProgress().then(setRecent).catch(console.error);
  }

  const completeLogin = async (email: string, password: string) => {
    const user = await login({ email, password });
    setCurrentUser(user);
    localStorage.setItem(AUTH_STORAGE_KEY, "true");
    setIsAuthenticated(true);
    setAppPath("home", "replace");
    setView("home");
  };

  const saveCurrentProfile = async (input: {
    name: string;
    email: string;
    password?: string;
    avatarUrl?: string;
    avatarDataUrl?: string;
    avatarColor?: string;
    avatarSize?: number;
  }) => {
    const user = await updateProfile(input);
    setCurrentUser(user);
    return user;
  };

  const logout = () => {
    logoutApi().catch(console.error);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setCurrentUser(null);
    setIsAuthenticated(false);
    setData(null);
    setSummary(null);
    setRecent([]);
    setTutorOpen(false);
    setQuestionForTutor(null);
    setActiveTemplate(null);
    setActiveRandomTest(null);
    setActiveFinalExam(null);
    setSidebarOpen(false);
    setGlobalSearch("");
    setLoginPath("replace");
    setView("home");
  };

  if (!authChecked) {
    return <div className="loading">Avtolearn AI Studio yuklanmoqda...</div>;
  }

  if (!isAuthenticated) {
    return (
      <LoginPage
        darkMode={darkMode}
        language={language}
        onLogin={completeLogin}
        setLanguage={setLanguage}
        toggleTheme={() => setDarkMode((value) => !value)}
      />
    );
  }

  if (!data) {
    if (dataError) {
      return (
        <div className="loading loading-error">
          <ShieldAlert size={34} />
          <strong>Avtolearn AI Studio yuklanmadi</strong>
          <p>{dataError}</p>
          <div>
            <button className="primary-button" onClick={loadAppData} type="button">
              <RefreshCcw size={16} /> Qayta urinish
            </button>
            <button className="ghost-button" onClick={logout} type="button">
              <LogOut size={16} /> Chiqish
            </button>
          </div>
        </div>
      );
    }
    return <div className="loading">Avtolearn AI Studio yuklanmoqda...</div>;
  }

  const isExamFocus =
    (view === "template-tests" && Boolean(activeTemplate)) ||
    (view === "random-tests" && Boolean(activeRandomTest)) ||
    (view === "final-exam" && Boolean(activeFinalExam));
  const isAdminView = view === "admin";

  const renderView = () => {
    if (view === "admin") {
      if (!currentUser || !canUseAdmin(currentUser)) return null;
      return (
        <AdminShell
          user={currentUser}
          onBack={() => {
            loadAppData();
            navigateTo("home");
          }}
          onCatalogChanged={loadAppData}
          initialSection={adminSection}
          onSectionChange={(section) => {
            setAdminSection(section);
            setAppPath("admin", "push", section);
          }}
          darkMode={darkMode}
          language={language}
          setLanguage={setLanguage}
          toggleTheme={() => setDarkMode((value) => !value)}
          onNavigateLearner={(target) => {
            loadAppData();
            navigateTo(target);
          }}
          onLogout={logout}
        />
      );
    }
    if (view === "home") return <Dashboard data={data} summary={summary} recent={recent} setView={navigateTo} />;
    if (view === "profile") {
      return (
        <ProfilePage
          data={data}
          summary={summary}
          recent={recent}
          darkMode={darkMode}
          language={language}
          currentUser={currentUser}
          onProfileUpdate={saveCurrentProfile}
          openTutor={() => setTutorOpen(true)}
          setView={navigateTo}
        />
      );
    }
    if (view === "lessons") return <Lessons data={data} />;
    if (view === "road-signs") return <RoadSigns data={data} />;
    if (view === "penalties") return <PenaltiesPage data={data} />;
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
    if (view === "random-tests") {
      if (!activeRandomTest) {
        return <RandomTestsPage data={data} summary={summary} onStart={setActiveRandomTest} />;
      }
      return (
        <QuestionStudio
          mode={view}
          randomConfig={activeRandomTest}
          onBack={() => setActiveRandomTest(null)}
          onProgress={refreshProgress}
          onAskTutor={(q) => { setQuestionForTutor(q); setTutorOpen(true); }}
        />
      );
    }
    if (view === "saved-tests") {
      return <SavedTestsPage onProgress={refreshProgress} onAskTutor={(q) => { setQuestionForTutor(q); setTutorOpen(true); }} />;
    }
    if (view === "final-exam") {
      if (activeFinalExam) {
        return (
          <QuestionStudio
            mode={view}
            randomConfig={activeFinalExam}
            onBack={() => setActiveFinalExam(null)}
            onProgress={refreshProgress}
            onAskTutor={(q) => { setQuestionForTutor(q); setTutorOpen(true); }}
          />
        );
      }
      return <FinalExamPage data={data} summary={summary} onStart={setActiveFinalExam} />;
    }
    if (["all-tests"].includes(view)) {
      return <QuestionStudio mode={view} onProgress={refreshProgress} onAskTutor={(q) => { setQuestionForTutor(q); setTutorOpen(true); }} />;
    }
    if (view === "group") return <RatingPage data={data} summary={summary} recent={recent} />;
    if (view === "appeals") return <AppealsPage summary={summary} recent={recent} />;
    if (view === "autodrome") return <AutodromePage />;
    if (view === "ai") return <AiPanel question={questionForTutor} embedded />;
    return <OperationalPage view={view} data={data} />;
  };

  return (
    <div className={`app ${darkMode ? "theme-dark" : "theme-light"} ${isExamFocus ? "exam-focus-app" : ""} ${isAdminView ? "admin-app" : ""}`}>
      {!isExamFocus && !isAdminView && <Sidebar view={view} setView={navigateTo} open={sidebarOpen} language={language} />}
      <main className="main">
        {!isExamFocus && !isAdminView && (
          <Topbar
            search={globalSearch}
            setSearch={setGlobalSearch}
            toggleSidebar={() => setSidebarOpen(true)}
            openTutor={() => setTutorOpen(true)}
            setView={navigateTo}
            darkMode={darkMode}
            toggleTheme={() => setDarkMode((value) => !value)}
            language={language}
            setLanguage={setLanguage}
            onLogout={logout}
            currentUser={currentUser}
            hideTutorShortcut={view === "ai"}
          />
        )}
        <section className="content">{renderView()}</section>
      </main>
      {!isExamFocus && !isAdminView && view !== "ai" && <button className={`chat-fab ${tutorOpen ? "active" : ""}`} onClick={() => setTutorOpen((open) => !open)} aria-label="AI tutor" aria-expanded={tutorOpen}>
        {tutorOpen ? <X size={22} /> : <MessageCircle size={22} />}
      </button>}
      {tutorOpen && !isAdminView && view !== "ai" && (
        <div className="drawer widget-drawer">
          <AiPanel question={questionForTutor} onClose={() => setTutorOpen(false)} />
        </div>
      )}
    </div>
  );
}

const LOGO_PATH = "/assets/static/Logo AvtoLearn.svg";

function Sidebar({
  view,
  setView,
  open,
  language,
}: {
  view: View;
  setView: (view: View) => void;
  open: boolean;
  language: AppLanguage;
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (title: string) => {
    setCollapsedGroups((groups) => ({ ...groups, [title]: !groups[title] }));
  };

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
        <span>{translateUi(item.label, language)}</span>
      </button>
    );
  };

  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="brand">
        <img src={LOGO_PATH} alt="AvtoLearn" />
        <div>
          <strong>AVTOLEARN</strong>
          <small>ONLINE TA'LIM</small>
        </div>
      </div>
      {navGroups.map((group) => (
        <div className={`nav-group ${collapsedGroups[group.title] ? "collapsed" : ""}`} key={group.title}>
          <button
            className="nav-title"
            type="button"
            onClick={() => toggleGroup(group.title)}
            aria-expanded={!collapsedGroups[group.title]}
          >
            <span>{translateUi(group.title, language)}</span>
            <ChevronDown size={13} />
          </button>
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
  setView,
  darkMode,
  toggleTheme,
  language,
  setLanguage,
  onLogout,
  currentUser,
  hideTutorShortcut = false,
}: {
  search: string;
  setSearch: (value: string) => void;
  toggleSidebar: () => void;
  openTutor: () => void;
  setView: (view: View) => void;
  darkMode: boolean;
  toggleTheme: () => void;
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  onLogout: () => void;
  currentUser: AuthUser | null;
  hideTutorShortcut?: boolean;
}) {
  const searchRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const notifications = [
    { title: "Yangi testlar tayyor", detail: "Aralash testlar bo'limida yangi savollar mavjud." },
    { title: "Progress yangilandi", detail: "Oxirgi urinish natijalari statistikaga qo'shildi." },
    { title: "AI tutor faol", detail: "Qiyin savollar uchun izohlarni ochib ko'rishingiz mumkin." },
  ];

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const matches: { id: string; label: string; group: string; icon: typeof Home }[] = [];
    for (const group of navGroups) {
      for (const item of group.items) {
        const label = translateUi(item.label, language);
        const groupLabel = translateUi(group.title, language);
        if (item.label.toLowerCase().includes(q) || label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)) {
          matches.push({ id: item.id, label, group: groupLabel, icon: item.icon });
        }
      }
    }
    return matches;
  }, [language, search]);

  const showDropdown = focused && search.trim().length > 0;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        const input = searchRef.current?.querySelector("input");
        input?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!showDropdown) return;
    const onClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showDropdown]);



  useEffect(() => {
    if (!notificationOpen) return;
    const onClick = (e: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setNotificationOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [notificationOpen]);

  useEffect(() => {
    if (!profileOpen) return;
    const onClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [profileOpen]);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen();
  };

  const openProfileView = () => {
    setProfileOpen(false);
    setView("profile");
  };
  const displayUser = currentUser
    ? {
      name: currentUser.name,
      email: currentUser.email,
      role: roleLabel(currentUser),
      initials: userInitials(currentUser),
      avatarUrl: currentUser.avatarUrl,
      avatarColor: currentUser.avatarColor,
      avatarSize: currentUser.avatarSize,
    }
    : profileUser;
  const hasAdminAccess = canUseAdmin(currentUser);

  return (
    <header className="topbar">
      <button className="icon-button mobile-only" onClick={toggleSidebar}>
        <Menu size={20} />
      </button>
      <div className="search-wrapper" ref={searchRef}>
        <label className="search-box global-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setFocused(true)}
            placeholder={translateUi("Qidiruv...", language)}
          />
          <kbd>Ctrl K</kbd>
        </label>
        {showDropdown && (
          <div className="search-dropdown">
            {searchResults.length > 0 ? (
              searchResults.map((r) => {
                const Icon = r.icon;
                return (
                  <button
                    key={r.id}
                    className="search-result-item"
                    onMouseDown={() => {
                      setView(r.id as View);
                      setFocused(false);
                    }}
                  >
                    <span className="search-result-icon"><Icon size={16} /></span>
                    <span className="search-result-label">{r.label}</span>
                    <span className="search-result-group">{r.group}</span>
                  </button>
                );
              })
            ) : (
              <div className="search-no-results">{translateUi("Natija topilmadi", language)}</div>
            )}
          </div>
        )}
      </div>
      <div className="topbar-actions">
        {hasAdminAccess && (
          <button className="workspace-switcher" onClick={() => setView("admin")} type="button">
            <ShieldCheck size={17} />
            <span>{translateUi("Admin", language)}</span>
          </button>
        )}
        <button
          className={`icon-button theme-toggle ${darkMode ? "active" : ""}`}
          onClick={toggleTheme}
          title={translateUi(darkMode ? "Kunduzgi rejim" : "Tungi rejim", language)}
          type="button"
          aria-pressed={darkMode}
        >
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <LanguageSelector
          language={language}
          setLanguage={setLanguage}
          variant="topbar"
        />
        <button
          aria-pressed={isFullscreen}
          className={`icon-button topbar-tool ${isFullscreen ? "active" : ""}`}
          onClick={() => void toggleFullscreen()}
          title="Fullscreen"
          type="button"
        >
          <Expand size={18} />
        </button>
        <div className="topbar-menu" ref={notificationRef}>
          <button
            aria-expanded={notificationOpen}
            aria-haspopup="menu"
            className={`icon-button topbar-tool ${notificationOpen ? "active" : ""}`}
            onClick={() => setNotificationOpen((open) => !open)}
            title={translateUi("Bildirishnoma", language)}
            type="button"
          >
            <Bell size={18} />
          </button>
          {notificationOpen && (
            <div className="topbar-dropdown notification-dropdown" role="menu">
              <div className="topbar-dropdown-head">
                <strong>{translateUi("Bildirishnoma", language)}</strong>
                <small>{notifications.length}</small>
              </div>
              <div className="notification-list">
                {notifications.map((item) => (
                  <button className="notification-item" key={item.title} type="button">
                    <strong>{translateUi(item.title, language)}</strong>
                    <span>{translateUi(item.detail, language)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="topbar-menu" ref={profileRef}>
          <button
            aria-expanded={profileOpen}
            aria-haspopup="menu"
            className={`profile ${profileOpen ? "active" : ""}`}
            onClick={() => setProfileOpen((open) => !open)}
            type="button"
          >
            <UserAvatar user={currentUser} className="avatar" size={34} />
            <span className="profile-trigger-name">{displayUser.name}</span>
            <ChevronDown className="profile-trigger-chevron" size={15} />
          </button>
          {profileOpen && (
            <div className="topbar-dropdown profile-dropdown" role="menu">
              <div className="profile-dropdown-summary">
                <UserAvatar user={currentUser} className="profile-dropdown-avatar" />
                <div>
                  <strong>{displayUser.name}</strong>
                  <span>{translateUi(displayUser.role, language)}</span>
                  <small>{displayUser.email}</small>
                </div>
              </div>
              <div className="profile-dropdown-actions">
                <button className="profile-menu-button" onClick={openProfileView} type="button">
                  <span className="profile-menu-icon"><UserRound size={16} /></span>
                  <span className="profile-menu-copy">
                    <strong>{translateUi("Hisob", language)}</strong>
                    <small>{translateUi("Profil va sozlamalar", language)}</small>
                  </span>
                  <ArrowRight size={14} />
                </button>
                <button className="profile-menu-button" onClick={() => { setProfileOpen(false); setView("saved-tests"); }} type="button">
                  <span className="profile-menu-icon"><Bookmark size={16} /></span>
                  <span className="profile-menu-copy">
                    <strong>{translateUi("Saqlangan testlar", language)}</strong>
                    <small>{translateUi("Saqlangan savollar va shablonlarni qayta ko'ring.", language)}</small>
                  </span>
                  <ArrowRight size={14} />
                </button>
                <button className="profile-menu-button" onClick={() => { setProfileOpen(false); openTutor(); }} type="button">
                  <span className="profile-menu-icon"><Bot size={16} /></span>
                  <span className="profile-menu-copy">
                    <strong>{translateUi("AI yordam", language)}</strong>
                    <small>{translateUi("AI tutor bilan qiyin savollarni tahlil qiling.", language)}</small>
                  </span>
                  <ArrowRight size={14} />
                </button>
              </div>
              <div className="profile-dropdown-footer">
                <button className="profile-menu-button logout" onClick={() => { setProfileOpen(false); onLogout(); }} type="button">
                  <span className="profile-menu-icon"><LogOut size={16} /></span>
                  <span className="profile-menu-copy">
                    <strong>{translateUi("Chiqish", language)}</strong>
                    <small>{translateUi("Login sahifasiga qaytish", language)}</small>
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
        {!hideTutorShortcut && <button className="ai-button" onClick={openTutor}>
          <Bot size={18} /> AI
        </button>}
      </div>
    </header>
  );
}

// LoginPage is now imported from "./components/LoginPage"

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

const paginationPageSizes = [10, 20, 50, 100];

function paginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  if (currentPage <= 4) [2, 3, 4, 5].forEach((pageNumber) => pages.add(pageNumber));
  if (currentPage >= totalPages - 3) [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1].forEach((pageNumber) => pages.add(pageNumber));
  const sorted = Array.from(pages).filter((pageNumber) => pageNumber >= 1 && pageNumber <= totalPages).sort((a, b) => a - b);
  return sorted.reduce<Array<number | "ellipsis">>((items, pageNumber, index) => {
    if (index > 0 && pageNumber - sorted[index - 1] > 1) items.push("ellipsis");
    items.push(pageNumber);
    return items;
  }, []);
}

function PaginationControl({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = totalItems ? (currentPage - 1) * pageSize + 1 : 0;
  const end = totalItems ? Math.min(currentPage * pageSize, totalItems) : 0;
  const items = paginationItems(currentPage, totalPages);

  return (
    <nav className="modern-pagination" aria-label="Sahifalash">
      <div className="pagination-summary">
        <strong>{start}-{end}</strong>
        <span>/ {totalItems}</span>
      </div>
      <div className="pagination-pages">
        <button className="pagination-arrow" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} type="button" aria-label="Oldingi sahifa">
          <ArrowLeft size={17} />
        </button>
        {items.map((item, index) => item === "ellipsis" ? (
          <span className="pagination-ellipsis" key={`ellipsis-${index}`}>...</span>
        ) : (
          <button className={item === currentPage ? "active" : ""} key={item} onClick={() => onPageChange(item)} type="button">
            {item}
          </button>
        ))}
        <button className="pagination-arrow" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)} type="button" aria-label="Keyingi sahifa">
          <ArrowRight size={17} />
        </button>
      </div>
      <label className="pagination-size">
        <span>Ko'rsatish</span>
        <select
          value={pageSize}
          onChange={(event) => {
            onPageSizeChange(Number(event.target.value));
            onPageChange(1);
          }}
        >
          {paginationPageSizes.map((size) => (
            <option key={size} value={size}>{size} / page</option>
          ))}
        </select>
      </label>
    </nav>
  );
}

function ProfilePage({
  data,
  summary,
  recent,
  darkMode,
  language,
  currentUser,
  onProfileUpdate,
  openTutor,
  setView,
}: {
  data: AppData;
  summary: ProgressSummary | null;
  recent: RecentProgressItem[];
  darkMode: boolean;
  language: AppLanguage;
  currentUser: AuthUser | null;
  onProfileUpdate: (input: { name: string; email: string; password?: string; avatarUrl?: string; avatarDataUrl?: string; avatarColor?: string; avatarSize?: number }) => Promise<AuthUser>;
  openTutor: () => void;
  setView: (view: View) => void;
}) {
  const accuracy = summary?.accuracy ?? 0;
  const answered = summary?.answered ?? 0;
  const attempts = summary?.attempts ?? 0;
  const saved = summary?.saved ?? 0;
  const latestItems = recent.slice(0, 4);
  const displayName = currentUser?.name || profileUser.name;
  const displayEmail = currentUser?.email || profileUser.email;
  const displayRole = roleLabel(currentUser);
  const displayInitials = userInitials(currentUser);
  const [profileDraft, setProfileDraft] = useState({
    name: displayName,
    email: displayEmail,
    password: "",
    avatarUrl: currentUser?.avatarUrl || "",
    avatarDataUrl: "",
    avatarColor: avatarColor(currentUser),
    avatarSize: avatarSize(currentUser),
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");

  useEffect(() => {
    setProfileDraft({
      name: displayName,
      email: displayEmail,
      password: "",
      avatarUrl: currentUser?.avatarUrl || "",
      avatarDataUrl: "",
      avatarColor: avatarColor(currentUser),
      avatarSize: avatarSize(currentUser),
    });
  }, [currentUser?.id, currentUser?.name, currentUser?.email, currentUser?.avatarUrl, currentUser?.avatarColor, currentUser?.avatarSize]);

  const previewUser: AuthUser | null = currentUser
    ? { ...currentUser, name: profileDraft.name, email: profileDraft.email, avatarUrl: profileDraft.avatarDataUrl || profileDraft.avatarUrl, avatarColor: profileDraft.avatarColor, avatarSize: profileDraft.avatarSize }
    : null;

  function chooseAvatarFile(file: File | null) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setProfileMessage("Avatar PNG, JPG yoki WebP formatida bo'lishi kerak.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileMessage("Avatar hajmi 2MB dan oshmasligi kerak.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setProfileDraft((draft) => ({ ...draft, avatarDataUrl: String(reader.result || ""), avatarUrl: "" }));
      setProfileMessage("");
    };
    reader.onerror = () => setProfileMessage("Avatar rasmini o'qib bo'lmadi.");
    reader.readAsDataURL(file);
  }

  async function submitProfile(event: React.FormEvent) {
    event.preventDefault();
    setProfileSaving(true);
    setProfileMessage("");
    try {
      await onProfileUpdate({
        name: profileDraft.name.trim(),
        email: profileDraft.email.trim(),
        password: profileDraft.password.trim() || undefined,
        avatarUrl: profileDraft.avatarUrl.trim(),
        avatarDataUrl: profileDraft.avatarDataUrl,
        avatarColor: profileDraft.avatarColor,
        avatarSize: profileDraft.avatarSize,
      });
      setProfileDraft((draft) => ({ ...draft, password: "", avatarDataUrl: "" }));
      setProfileMessage(translateUi("Profil yangilandi", language));
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : translateUi("Profilni yangilab bo'lmadi", language));
    } finally {
      setProfileSaving(false);
    }
  }

  const metrics = [
    { label: "Javoblar", value: String(answered), tone: "blue" },
    { label: "Aniqlik", value: `${accuracy}%`, tone: "cyan" },
    { label: "Test urinishlari", value: String(attempts), tone: "gold" },
    { label: "Saqlangan", value: String(saved), tone: "rose" },
  ] as const;

  const sections = [
    {
      title: "Bosh sahifa",
      detail: "Mavzular, testlar va progress bo'yicha umumiy markaz.",
      action: () => setView("home"),
    },
    {
      title: "Saqlangan testlar",
      detail: "Saqlangan savollar va shablonlarni qayta ko'ring.",
      action: () => setView("saved-tests"),
    },
    {
      title: "AI yordam",
      detail: "AI tutor bilan qiyin savollarni tahlil qiling.",
      action: openTutor,
    },
  ];

  return (
    <div className="page-shell profile-page">
      <PageHeader
        eyebrow={translateUi("Profil", language)}
        title={translateUi("Profil va sozlamalar", language)}
        subtitle={translateUi("Shaxsiy kabinet, o'quv natijalari va asosiy sozlamalar bir joyda.", language)}
        actions={<button className="primary-button" onClick={() => setView("saved-tests")}>{translateUi("Saqlangan testlar", language)}</button>}
      />

      <section className="profile-overview">
        <article className="card profile-identity-card">
          <UserAvatar user={currentUser} className="profile-identity-avatar" size={avatarSize(currentUser, 72)} />
          <div className="profile-identity-copy">
            <span>{translateUi("Profil", language)}</span>
            <h2>{displayName}</h2>
            <p>{displayEmail}</p>
            <div className="profile-chip-row">
              <span>{translateUi(displayRole, language)}</span>
            </div>
          </div>
        </article>

        <article className="profile-score-card">
          <span>{translateUi("O'quv ko'rsatkichlari", language)}</span>
          <strong>{accuracy}%</strong>
          <p>{translateUi(darkMode ? "Tungi mavzu yoqilgan" : "Kunduzgi mavzu yoqilgan", language)}</p>
          <div className="profile-progress-meta">
            <div><span>{translateUi("Javoblar", language)}</span><strong>{answered}</strong></div>
            <div><span>{translateUi("Saqlangan", language)}</span><strong>{saved}</strong></div>
          </div>
        </article>
      </section>

      <section className="profile-metrics-grid">
        {metrics.map((item) => (
          <article className={`profile-metric-card ${item.tone}`} key={item.label}>
            <strong>{item.value}</strong>
            <span>{translateUi(item.label, language)}</span>
          </article>
        ))}
      </section>

      <section className="profile-layout">
        <article className="card profile-section">
          <div className="profile-section-head">
            <h2>{translateUi("Hisob ma'lumotlari", language)}</h2>
          </div>
          <dl className="profile-details">
            <div><dt>{translateUi("F.I.Sh.", language)}</dt><dd>{displayName}</dd></div>
            <div><dt>{translateUi("Rol", language)}</dt><dd>{translateUi(displayRole, language)}</dd></div>
            <div><dt>Email</dt><dd>{displayEmail}</dd></div>
          </dl>
        </article>

        <article className="card profile-section profile-editor-card">
          <div className="profile-section-head">
            <h2>{translateUi("Profilni tahrirlash", language)}</h2>
            <span className="dashboard-pill">{profileDraft.avatarSize}px</span>
          </div>
          <form className="profile-editor-form" onSubmit={submitProfile}>
            <div className="profile-avatar-editor">
              <UserAvatar user={previewUser} className="profile-editor-avatar" size={profileDraft.avatarSize} />
              <div>
                <strong>{profileDraft.name || displayName}</strong>
                <span>{translateUi("Avatar rangi va o'lchamini sozlang", language)}</span>
              </div>
            </div>
            <label>
              <span>{translateUi("F.I.Sh.", language)}</span>
              <input value={profileDraft.name} onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })} required />
            </label>
            <label>
              <span>Email</span>
              <input type="email" value={profileDraft.email} onChange={(event) => setProfileDraft({ ...profileDraft, email: event.target.value })} required />
            </label>
            <label className="profile-avatar-upload">
              <span>{translateUi("Avatar rasmini yuklash", language)}</span>
              <span className="profile-upload-control">
                <input accept="image/png,image/jpeg,image/webp" type="file" onChange={(event) => chooseAvatarFile(event.target.files?.[0] || null)} />
                <span className="profile-upload-button">{translateUi("Rasm tanlash", language)}</span>
                <small>{profileDraft.avatarDataUrl ? translateUi("Yangi avatar tanlandi", language) : translateUi("PNG, JPG yoki WebP. Maksimal hajm 2MB.", language)}</small>
              </span>
            </label>
            <div className="profile-editor-row">
              <label>
                <span>{translateUi("Avatar rangi", language)}</span>
                <input type="color" value={profileDraft.avatarColor} onChange={(event) => setProfileDraft({ ...profileDraft, avatarColor: event.target.value })} />
              </label>
              <label>
                <span>{translateUi("Avatar o'lchami", language)}</span>
                <input min="36" max="96" type="range" value={profileDraft.avatarSize} onChange={(event) => setProfileDraft({ ...profileDraft, avatarSize: Number(event.target.value) })} />
              </label>
            </div>
            <label>
              <span>{translateUi("Yangi parol", language)}</span>
              <input type="password" value={profileDraft.password} onChange={(event) => setProfileDraft({ ...profileDraft, password: event.target.value })} placeholder={translateUi("O'zgartirmaslik uchun bo'sh qoldiring", language)} />
            </label>
            {profileMessage && <p className="profile-editor-message">{profileMessage}</p>}
            <div className="profile-editor-actions">
              <button className="ghost-button" type="button" onClick={() => setProfileDraft({ name: displayName, email: displayEmail, password: "", avatarUrl: currentUser?.avatarUrl || "", avatarDataUrl: "", avatarColor: avatarColor(currentUser), avatarSize: avatarSize(currentUser) })}>
                {translateUi("Bekor qilish", language)}
              </button>
              <button className="ghost-button" type="button" onClick={() => setProfileDraft((draft) => ({ ...draft, avatarUrl: "", avatarDataUrl: "" }))}>
                {translateUi("Avatarni olib tashlash", language)}
              </button>
              <button className="primary-button" disabled={profileSaving} type="submit">
                <Save size={16} /> {profileSaving ? translateUi("Saqlanmoqda", language) : translateUi("Saqlash", language)}
              </button>
            </div>
          </form>
        </article>

        <article className="card profile-section">
          <div className="profile-section-head">
            <h2>{translateUi("Oxirgi faollik", language)}</h2>
            <span className="dashboard-pill">{latestItems.length}</span>
          </div>
          <div className="profile-activity-list">
            {latestItems.length ? latestItems.map((item) => (
              <div className="profile-activity-item" key={`${item.type}-${item.id}-${item.createdAt}`}>
                <strong>{translateUi(item.title, language)}</strong>
                <span>{translateUi(item.detail, language)}</span>
              </div>
            )) : (
              <p className="profile-empty">{translateUi("Hozircha faollik qayd etilmagan.", language)}</p>
            )}
          </div>
        </article>

        <article className="card profile-section profile-section-wide">
          <div className="profile-section-head">
            <h2>{translateUi("Asosiy bo'limlar", language)}</h2>
          </div>
          <div className="profile-link-grid">
            {sections.map((section) => (
              <button className="profile-link-card" key={section.title} onClick={section.action} type="button">
                <strong>{translateUi(section.title, language)}</strong>
                <span>{translateUi(section.detail, language)}</span>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}




function Lessons({ data }: { data: AppData }) {
  const [activeLesson, setActiveLesson] = useState<number | null>(null);
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null);
  const [lessonFontSize, setLessonFontSize] = useState(() => {
    const stored = Number(localStorage.getItem("lessonFontSize"));
    return Number.isFinite(stored) && stored >= 15 && stored <= 22 ? stored : 17;
  });

  const hasTopicContent = (topic: Topic) =>
    topic.questionCount > 0 || Boolean(topic.contents?.some((content) => content.content.trim()));

  const isSinovLabel = (value: string) => {
    const label = clean(value).toLowerCase().trim();
    return label.includes("sinov") || label === "test";
  };

  const shouldShowTopic = (topic: Topic) => hasTopicContent(topic) || !isSinovLabel(topic.title);

  const topicsForLesson = (lessonId: number) =>
    data.topics.filter((topic) => topic.lessonId === lessonId && shouldShowTopic(topic));

  const visibleLessons = data.lessons.filter((lesson) => {
    const lessonTopics = topicsForLesson(lesson.id);
    const isSinovLesson = isSinovLabel(lesson.title) || isSinovLabel(lesson.shortName);
    return !isSinovLesson || lessonTopics.length > 0;
  });

  const topicCountFor = (lessonId: number) =>
    topicsForLesson(lessonId).length;

  const selectedLesson = activeLesson !== null
    ? data.lessons.find((l) => l.id === activeLesson) ?? null
    : null;

  const lessonTopics = selectedLesson
    ? topicsForLesson(selectedLesson.id)
    : [];
  const activeTopicIndex = activeTopic
    ? lessonTopics.findIndex((topic) => topic.id === activeTopic.id)
    : -1;
  const previousTopic = activeTopicIndex > 0 ? lessonTopics[activeTopicIndex - 1] : null;
  const nextTopic = activeTopicIndex >= 0 && activeTopicIndex < lessonTopics.length - 1
    ? lessonTopics[activeTopicIndex + 1]
    : null;
  const activeTopicNumber = activeTopicIndex >= 0 ? activeTopicIndex + 1 : 0;

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

  const openLesson = (lessonId: number) => {
    setActiveLesson(lessonId);
    setActiveTopic(null);
  };

  const changeLessonFontSize = (next: number) => {
    const value = Math.min(22, Math.max(15, next));
    setLessonFontSize(value);
    localStorage.setItem("lessonFontSize", String(value));
  };

  if (selectedLesson) {
    return (
      <div className="page-shell">
        <PageHeader
          title={clean(selectedLesson.title)}
          subtitle={`${selectedLesson.shortName} — ${lessonTopics.length} ta mavzu`}
          eyebrow="Dars tafsilotlari"
          actions={
            <button className="link-button" onClick={() => { setActiveTopic(null); setActiveLesson(null); }}>
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
          <section className="lesson-study-layout">
            <aside className="topic-sidebar card">
              <div className="topic-sidebar-head">
                <span>Mavzular</span>
                <strong>{lessonTopics.length}</strong>
              </div>
              <div className="topic-list">
                {lessonTopics.map((topic, index) => (
                  <article
                    className={`topic-card ${activeTopic?.id === topic.id ? "active" : ""}`}
                    key={topic.id}
                    onClick={() => setActiveTopic(topic)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setActiveTopic(topic);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
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
                  </article>
                ))}
              </div>
            </aside>

            <section className="topic-detail-panel card" style={{ "--lesson-font-size": `${lessonFontSize}px` } as React.CSSProperties}>
              {activeTopic ? (
                <div>
                  <div className="topic-reading-toolbar">
                    <div>
                      <div className="topic-reading-meta">
                        <span className={`topic-type-badge type-${activeTopic.type}`}>
                          {topicTypeLabel(activeTopic.type)}
                        </span>
                        <span>{activeTopicNumber}/{lessonTopics.length} mavzu</span>
                      </div>
                      <h2>{clean(activeTopic.title)}</h2>
                    </div>
                    <div className="font-size-control" aria-label="Dars matni o'lchami">
                      <button
                        disabled={lessonFontSize <= 15}
                        onClick={() => changeLessonFontSize(lessonFontSize - 1)}
                        type="button"
                      >
                        -
                      </button>
                      <span><strong>A</strong> {lessonFontSize}px</span>
                      <button
                        disabled={lessonFontSize >= 22}
                        onClick={() => changeLessonFontSize(lessonFontSize + 1)}
                        type="button"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="topic-progress-track" aria-label="Mavzu progressi">
                    <span style={{ width: `${(activeTopicNumber / lessonTopics.length) * 100}%` }} />
                  </div>
                  {activeTopic.contents?.length ? (
                    <div className="topic-content-blocks">
                      {activeTopic.contents.map((block) => (
                        <div className="topic-content-block" key={block.id}>
                          {isImageContent(block.content) ? (
                            <img src={backendAsset(block.content)} alt={clean(activeTopic.title)} loading="lazy" />
                          ) : (
                            <div
                              className="topic-html-content"
                              dangerouslySetInnerHTML={{ __html: sanitizeTopicHtml(block.content) }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>Ushbu mavzu lokal o'quv bazasidan yuklangan, lekin matnli kontent hali saqlanmagan.</p>
                  )}
                  <div className="topic-navigation-footer">
                    <button
                      className="topic-nav-button"
                      disabled={!previousTopic}
                      onClick={() => previousTopic && setActiveTopic(previousTopic)}
                      type="button"
                    >
                      <ArrowLeft size={16} />
                      <span>Oldingi mavzu</span>
                    </button>
                    <button
                      className="topic-nav-button primary"
                      disabled={!nextTopic}
                      onClick={() => nextTopic && setActiveTopic(nextTopic)}
                      type="button"
                    >
                      <span>Keyingi mavzu</span>
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="topic-empty-detail">
                  <BookOpen size={34} />
                  <h2>Mavzuni tanlang</h2>
                  <p>Chap tarafdagi ro'yxatdan mavzu tanlang, kontent shu yerda ochiladi.</p>
                </div>
              )}
            </section>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHeader title="Darslar" subtitle="Nazariy modullar, mavzular va lokal o'quv materiallari." />
      <div className="section-grid">
        {visibleLessons.map((lesson) => {
          const lessonTopicCount = lesson.topicCount ?? topicCountFor(lesson.id);
          return (
            <article
              className="card lesson-card clickable"
              key={lesson.id}
              onClick={() => openLesson(lesson.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openLesson(lesson.id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <span>{lesson.shortName}</span>
              <h3>{clean(lesson.title)}</h3>
              <p>{lessonTopicCount} ta mavzu va lokal materiallar</p>
              <button className="link-button" onClick={(event) => { event.stopPropagation(); openLesson(lesson.id); }}>
                Boshlash <ArrowRight size={16} />
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function roadSignDescription(sign: RoadSignItem, typeTitle: string) {
  if (sign.description?.trim()) return clean(sign.description);

  if (sign.code === "1.1") {
    return (
      "Bu belgi aholi punktlarida yo'lning temir yo'l kesib o'tgan qismidan 50 - 100 metr oldin masofada o'rnatiladi. " +
      "Bunday temir yo'l kesishmalari shlagbaum harakatni tartibga soluvchi svetofor va tovush moslamasi bilan jihozlangan bo'lib, " +
      "kesishma orqali harakatlanishni temir yo'l navbatchisi nazorat qiladi. \"Shlagbaumli temir yo'l kesishmasi\" belgisi haydovchini " +
      "yo'lning o'ta xavfli qismlari borligi haqida ogohlantirib, aholi punktlaridan tashqarida 150 - 300 metr oldin, shuningdek, xavf-xatarga " +
      "50 metrdan kam bo'lmagan masofa qolganda takror o'rnatiladi. Yo'lning temir yo'l kesishmasi o'tgan qismidan, ehtiyot choralarini " +
      "ko'rgan holda, ruxsat berilgandan keyin o'tishi kerak."
    );
  }

  return `${clean(typeTitle)} bo'limidagi ushbu belgi haydovchini yo'l sharoiti haqida oldindan xabardor qiladi. Belgini ko'rgan haydovchi tezlikni, masofani va harakat yo'nalishini vaziyatga mos tanlashi kerak.`;
}

const svetoforInfo = {
  transport: {
    title: "Transport svetaforlari",
    summary:
      "Transport svetoforlari chorrahalar, piyodalar o'tish joylari va tartibga solinadigan yo'l qismlarida transport vositalari harakatini boshqaradi.",
    points: [
      "Yashil chiroq harakatlanishga ruxsat beradi, lekin haydovchi chorrahadagi piyoda va boshqa transport vositalari xavfsizligini tekshirishi shart.",
      "Sariq chiroq odatda harakatni taqiqlaydi va signal almashayotganini bildiradi. To'xtash xavfli bo'lgan holatlar bundan mustasno.",
      "Qizil chiroq harakatlanishni taqiqlaydi. Haydovchi stop-chiziq, 5.33 belgisi yoki qatnov qismi chetida to'xtashi kerak.",
      "Qo'shimcha seksiyadagi yashil strelka faqat ko'rsatilgan yo'nalishda harakatlanishga ruxsat beradi va ustuvor yo'ldagi qatnashchilarga yo'l berish talab qilinadi.",
    ],
  },
  pedestrian: {
    title: "Piyodalar svetaforlari",
    summary:
      "Piyodalar svetoforlari piyodalar o'tish joylarida odamlarning yo'lni xavfsiz kesib o'tishini tartibga soladi.",
    points: [
      "Yashil piyoda belgisi yo'lni kesib o'tishga ruxsat beradi. Piyoda baribir yaqinlashayotgan transportni kuzatishi kerak.",
      "Qizil piyoda belgisi o'tishni taqiqlaydi. Piyodalar yo'l chetida yoki xavfsizlik orolchasida kutishi kerak.",
      "Miltillovchi yashil signal ruxsat vaqti tugayotganini bildiradi; o'tishni boshlamagan piyoda kutishi maqsadga muvofiq.",
      "Piyoda yo'lni kesib o'tayotganida haydovchilar burilishda ham piyodalarga yo'l berishi shart.",
    ],
  },
};

function SvetoforInfoPanel({ typeId }: { typeId: number }) {
  const info = typeId === 8 ? svetoforInfo.transport : typeId === 9 ? svetoforInfo.pedestrian : null;
  if (!info) return null;

  return (
    <section className="svetofor-info-grid">
      <article className="svetofor-info-main card">
        <span>O'quv ma'lumot</span>
        <h3>{info.title}</h3>
        <p>{info.summary}</p>
      </article>
      {info.points.map((point, index) => (
        <article className="svetofor-rule-card card" key={point}>
          <strong>{index + 1}</strong>
          <p>{point}</p>
        </article>
      ))}
    </section>
  );
}

function RoadSigns({ data }: { data: AppData }) {
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [selectedSign, setSelectedSign] = useState<RoadSignItem | null>(null);
  const [selectedPreviewIndex, setSelectedPreviewIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const roadSignModalBodyRef = useRef<HTMLDivElement | null>(null);
  const sortedTypes = useMemo(
    () => data.signs.slice().sort((a, b) => a.id - b.id || compareCode(a.code, b.code)),
    [data.signs],
  );
  const selectedType = selectedTypeId ? data.signs.find((sign) => sign.id === selectedTypeId) : null;
  const selectedSigns = useMemo(
    () =>
      selectedTypeId
        ? data.roadSigns
            .filter((sign) => sign.typeId === selectedTypeId)
            .slice()
            .sort((a, b) => compareCode(effectiveSignCode(a), effectiveSignCode(b)) || a.id - b.id)
        : [],
    [data.roadSigns, selectedTypeId],
  );
  const totalPages = Math.max(1, Math.ceil(selectedSigns.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleSigns = selectedSigns.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedSignIndex = selectedSign
    ? selectedSigns.findIndex((sign) => sign.id === selectedSign.id)
    : -1;
  const previousSign = selectedSignIndex > 0 ? selectedSigns[selectedSignIndex - 1] : null;
  const nextSign = selectedSignIndex >= 0 && selectedSignIndex < selectedSigns.length - 1
    ? selectedSigns[selectedSignIndex + 1]
    : null;
  const openType = (id: number) => {
    setSelectedTypeId(id);
    setPage(1);
  };
  const openSign = (sign: RoadSignItem) => {
    setSelectedSign(sign);
    setSelectedPreviewIndex(0);
    window.requestAnimationFrame(() => {
      roadSignModalBodyRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
  };
  const startSignStudy = () => {
    setPage(1);
    const firstSign = selectedSigns[0];
    if (firstSign) openSign(firstSign);
  };

  useEffect(() => {
    if (!selectedSign) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedSign(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedSign]);

  if (selectedType) {
    return (
      <div className="page-shell road-sign-detail-page">
        <section className="road-sign-detail-header card">
          <button className="ghost-button road-sign-back" onClick={() => setSelectedTypeId(null)}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2>{clean(selectedType.title).toUpperCase()}</h2>
            <p>{selectedSigns.length || selectedType.count} ta belgi • {currentPage}/{totalPages} sahifa</p>
          </div>
          <button className="primary-button road-sign-study-button" onClick={startSignStudy}>
            O'rganishni boshlash
          </button>
        </section>

        <section className="road-sign-detail-card card">
          <SvetoforInfoPanel typeId={selectedType.id} />
          {visibleSigns.length ? (
            <div className="road-sign-detail-grid">
              {visibleSigns.map((sign) => (
                <article className="road-sign-detail-item" key={sign.id}>
                  <div className="road-sign-detail-image">
                    <img src={asset(sign.image)} alt={clean(sign.title)} />
                  </div>
                  <h3>
                    {displaySignCode(sign)}. {clean(sign.title)}
                  </h3>
                  <button onClick={() => openSign(sign)}>To'liq ko'rish</button>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Search size={24} />
              <p>Bu bo'lim uchun belgilar hali lokal bazaga qo'shilmagan.</p>
            </div>
          )}

          <PaginationControl
            page={currentPage}
            pageSize={pageSize}
            totalItems={selectedSigns.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </section>

        {selectedSign && (() => {
          const previewImages = uniquePreviewImages(selectedSign);
          const activePreview = previewImages[Math.min(selectedPreviewIndex, previewImages.length - 1)] ?? selectedSign.image;
          return (
            <div className="road-sign-modal-backdrop" onClick={() => setSelectedSign(null)} role="presentation">
              <section
                aria-labelledby="road-sign-modal-title"
                aria-modal="true"
                className="road-sign-modal"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
              >
                <header className="road-sign-modal-header">
                  <h2 id="road-sign-modal-title">
                    {displaySignCode(selectedSign)}. {clean(selectedSign.title)}
                  </h2>
                  <button className="road-sign-modal-close" onClick={() => setSelectedSign(null)} aria-label="Yopish">
                    <X size={22} />
                  </button>
                </header>
                <div className="road-sign-modal-body" ref={roadSignModalBodyRef}>
                  <div className="road-sign-modal-preview">
                    <img src={asset(activePreview)} alt={clean(selectedSign.title)} />
                  </div>
                  {previewImages.length > 1 && (
                    <div className="road-sign-modal-thumbs" aria-label="Rasm variantlari">
                      {previewImages.map((image, index) => (
                        <button
                          className={index === selectedPreviewIndex ? "active" : ""}
                          key={`${selectedSign.id}-${image}`}
                          onClick={() => setSelectedPreviewIndex(index)}
                          type="button"
                        >
                          <img src={asset(image)} alt={`${clean(selectedSign.title)} ${index + 1}`} />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="road-sign-modal-content">
                    <h3>
                      {displaySignCode(selectedSign)}. "{clean(selectedSign.title)}"
                    </h3>
                    <p>{roadSignDescription(selectedSign, selectedType.title)}</p>
                  </div>
                  {(selectedSign.video || selectedSign.audio) && (
                    <div className="road-sign-modal-media">
                      {selectedSign.video && (
                        <div className="road-sign-media-block">
                          <span><Video size={16} /> Video izoh</span>
                          <video src={asset(selectedSign.video)} controls preload="metadata" />
                        </div>
                      )}
                      {selectedSign.audio && (
                        <div className="road-sign-media-block">
                          <span><Volume2 size={16} /> Audio izoh</span>
                          <audio src={asset(selectedSign.audio)} controls preload="metadata" />
                        </div>
                      )}
                    </div>
                  )}
                  <div className="road-sign-modal-actions">
                    <button
                      className="road-sign-modal-nav"
                      disabled={!previousSign}
                      onClick={() => previousSign && openSign(previousSign)}
                      type="button"
                    >
                      <ArrowLeft size={16} /> Oldingi belgi
                    </button>
                    <button
                      className="road-sign-test-cta"
                      onClick={() => {
                        setSelectedSign(null);
                        setSelectedTypeId(null);
                      }}
                      type="button"
                    >
                      Barcha belgilar
                    </button>
                    <button
                      className="road-sign-modal-nav primary"
                      disabled={!nextSign}
                      onClick={() => nextSign && openSign(nextSign)}
                      type="button"
                    >
                      Keyingi belgi <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </section>
            </div>
          );
        })()}
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHeader title="Yo'l belgilari" subtitle="Belgilar katalogi va imtihonlarda uchraydigan vizual holatlar." />
      <div className="section-grid">
        {sortedTypes.map((sign) => (
          <article
            className="card sign-card clickable"
            key={sign.id}
            onClick={() => openType(sign.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") openType(sign.id);
            }}
            role="button"
            tabIndex={0}
          >
            <div className="sign-card-image">
              <img src={asset(sign.image)} alt="" />
            </div>
            <h3>{clean(sign.title)}</h3>
            <p><span>{sign.count}</span> ta belgi</p>
          </article>
        ))}
      </div>
    </div>
  );
}

type PenaltySection = "landing" | "fines" | "points";
type PenaltyCategory = "all" | "speed" | "safety" | "actions" | "docs" | "heavy";

function getPenaltyPoints(penalty: Penalty): number {
  const art = (penalty.article || "").toLowerCase().trim();
  if (art.includes("125-modda, 1-qism")) return 1;
  if (art.includes("128-modda")) return 1;
  if (art.includes("128-1 -modda, 1-qism") || art.includes("128-1-modda, 1-qism") || art.includes("128-1")) return 3;
  if (art.includes("128-3 -modda, 1-qism") || art.includes("128-3-modda, 1-qism")) return 1;
  if (art.includes("128-3 -modda, 2-qism") || art.includes("128-3-modda, 2-qism")) return 3;
  if (art.includes("128-3 -modda, 3-qism") || art.includes("128-3-modda, 3-qism")) return 6;
  if (art.includes("128-3 -modda, 4-qism") || art.includes("128-3-modda, 4-qism")) return 6;
  if (art.includes("128-4 -modda, 1-qism") || art.includes("128-4-modda, 1-qism")) return 1;
  if (art.includes("128-4 -modda, 2-qism") || art.includes("128-4-modda, 2-qism")) return 3;
  if (art.includes("128-5 -modda, 1-qism") || art.includes("128-5-modda, 1-qism")) return 3;
  if (art.includes("128-5 -modda, 2-qism") || art.includes("128-5-modda, 2-qism")) return 4;
  if (art.includes("128-6")) return 1;
  if (art.includes("128-8 -modda, 1-qism")) return 1;
  if (art.includes("128-8 -modda, 2-qism")) return 3;
  if (art.includes("128-9")) return 2;
  if (art.includes("129")) return 3;
  if (art.includes("130")) return 4;
  if (art.includes("135-modda, 1-qism")) return 1;
  if (art.includes("135-modda, 2-qism")) return 3;

  // fallback to db value
  const pVal = parseFloat((penalty.points || "").replace(",", "."));
  return isNaN(pVal) ? 0 : pVal;
}

const categorizePenalty = (penalty: Penalty): PenaltyCategory[] => {
  const categories: PenaltyCategory[] = ["all"];
  const title = (penalty.title || "").toLowerCase();
  const desc = (penalty.description || "").toLowerCase();
  const art = (penalty.article || "").toLowerCase();
  
  // Tezlik
  if (title.includes("tezlik") || desc.includes("tezlik") || art.includes("128-3")) {
    categories.push("speed");
  }
  
  // Xavfsizlik
  if (
    title.includes("kamar") || desc.includes("kamar") ||
    title.includes("shlem") || desc.includes("shlem") ||
    title.includes("tormoz") || desc.includes("tormoz") ||
    title.includes("rul") || desc.includes("rul") ||
    title.includes("nosozlik") || desc.includes("nosozlik") ||
    title.includes("tibbiy") || desc.includes("tibbiy") ||
    title.includes("aptechka") || desc.includes("aptechka") ||
    title.includes("jilet") || desc.includes("jilet") ||
    title.includes("oyna") || desc.includes("oyna") ||
    title.includes("tonlash") || desc.includes("tonlash") ||
    title.includes("tonirovka") || desc.includes("tonirovka") ||
    title.includes("qoplamalar") || desc.includes("qoplamalar")
  ) {
    categories.push("safety");
  }
  
  // Harakatlar
  if (
    title.includes("svetofor") || desc.includes("svetofor") ||
    title.includes("qizil") || desc.includes("qizil") ||
    title.includes("chiziq") || desc.includes("chiziq") ||
    title.includes("qarshi") || desc.includes("qarshi") ||
    title.includes("quvib") || desc.includes("quvib") ||
    title.includes("shatak") || desc.includes("shatak") ||
    title.includes("yo'nalishli") || desc.includes("yo'nalishli") ||
    title.includes("tasmasi") || desc.includes("tasmasi") ||
    title.includes("temir yo'l") || desc.includes("temir yo'l") ||
    title.includes("guruh") || desc.includes("guruh") ||
    title.includes("to'xtash") || desc.includes("to'xtash") ||
    title.includes("piyoda") || desc.includes("piyoda") ||
    title.includes("loy sachratish") || desc.includes("loy sachratish") ||
    title.includes("tashish") || desc.includes("tashish")
  ) {
    categories.push("actions");
  }
  
  // Hujjatlar
  if (
    title.includes("hujjat") || desc.includes("hujjat") ||
    title.includes("guvohnoma") || desc.includes("guvohnoma") ||
    title.includes("sug'urta") || desc.includes("sug'urta") ||
    title.includes("polis") || desc.includes("polis") ||
    title.includes("ishonchnoma") || desc.includes("ishonchnoma") ||
    title.includes("pasport") || desc.includes("pasport")
  ) {
    categories.push("docs");
  }
  
  // Og'ir
  const bcvVal = parseFloat((penalty.bcv || "").replace(",", "."));
  if (
    bcvVal >= 10 ||
    title.includes("mast") || desc.includes("mast") ||
    title.includes("giyohvand") || desc.includes("giyohvand") ||
    title.includes("huquqdan mahrum") || desc.includes("huquqdan mahrum") ||
    title.includes("soxta") || desc.includes("soxta") ||
    title.includes("radar") || desc.includes("radar")
  ) {
    categories.push("heavy");
  }
  
  return categories;
};

function formatBcv(bcvStr: string) {
  if (!bcvStr) return "-";
  return `${bcvStr} x BHM`;
}

function calculateAmount(bcvStr: string) {
  const BHM = 375000;
  if (!bcvStr) return "-";
  
  const rangeMatch = bcvStr.replace(/\s+/g, "").match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1]) * BHM;
    const max = parseFloat(rangeMatch[2]) * BHM;
    return `${min.toLocaleString("uz-UZ")} - ${max.toLocaleString("uz-UZ")} UZS`;
  }
  
  const val = parseFloat(bcvStr.replace(",", "."));
  if (!isNaN(val)) {
    return `${(val * BHM).toLocaleString("uz-UZ")} UZS`;
  }
  return bcvStr;
}

function PenaltiesPage({ data }: { data: AppData }) {
  const [mode, setMode] = useState<PenaltySection>("landing");
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<PenaltyCategory>("all");
  const [simulatedFines, setSimulatedFines] = useState<Penalty[]>([]);
  const [selectedPenalty, setSelectedPenalty] = useState<Penalty | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const penalties = data.penalties || [];

  const handleAddSimulated = (penalty: Penalty) => {
    setSimulatedFines((prev) => [...prev, penalty]);
  };

  const handleRemoveSimulated = (indexToRemove: number) => {
    setSimulatedFines((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const simulatedPoints = simulatedFines.reduce(
    (total, penalty) => total + getPenaltyPoints(penalty),
    0
  );

  const categoriesList = [
    { id: "all", label: "BARCHASI" },
    { id: "speed", label: "TEZLIK" },
    { id: "safety", label: "XAVFSIZLIK" },
    { id: "actions", label: "HARAKATLAR" },
    { id: "docs", label: "HUJJATLAR" },
    { id: "heavy", label: "OG'IR" },
  ] as const;

  const displayPenalties = penalties.filter((penalty) => {
    const categories = categorizePenalty(penalty);
    const matchesCat = categories.includes(selectedCategory);
    const text = `${penalty.title} ${penalty.description} ${penalty.article}`.toLowerCase();
    const matchesSearch = text.includes(query.toLowerCase().trim());
    return matchesCat && matchesSearch;
  });
  const totalPenaltyPages = Math.max(1, Math.ceil(displayPenalties.length / pageSize));
  const currentPenaltyPage = Math.min(page, totalPenaltyPages);
  const visiblePenalties = displayPenalties.slice((currentPenaltyPage - 1) * pageSize, currentPenaltyPage * pageSize);

  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as PenaltySection;
    setMode(val);
    setQuery("");
    setPage(1);
    setSelectedPenalty(null);
  };

  useEffect(() => {
    setPage(1);
  }, [query, selectedCategory, pageSize]);

  useEffect(() => {
    if (!selectedPenalty) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedPenalty(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedPenalty]);

  // 1. Landing View
  if (mode === "landing") {
    return (
      <div className="penalties-page page-shell">
        <div className="penalty-main-header">
          <h1>YO'L HARAKATI QOIDALARINI BUZGANLIK UCHUN JARIMALAR</h1>
          <p>O'ZBEKISTON RESPUBLIKASI MA'MURIY JAVOBGARLIK TO'G'RISIDAGI KODEKS DARSLIGI</p>
        </div>

        <div className="penalty-alert-card">
          <div className="penalty-alert-icon">
            <ShieldAlert size={24} />
          </div>
          <div className="penalty-alert-content">
            <h3>HAYDOVCHI BALLAR TIZIMI ESLATMASI</h3>
            <p>
              O'zbekistonda eng so'nggi ma'muriy kodeksga muvofiq jami qoidabuzarliklarning davlat balli 12 ballik limitsiz ko'rsatkich deb olingan.
              Ushbu kurs doirasida siz nazariya biletlarini o'rganishda jarimalarni yod olishingiz kerak bo'ladi,
              chunki davlat imtihonida bunga oid 1-2 ta savol har gal tushadi!
            </p>
          </div>
        </div>

        <div className="penalty-options-grid">
          <div className="penalty-option-card">
            <div className="penalty-option-icon-wrapper blue">
              <ShieldAlert size={28} />
            </div>
            <h2>UMUMIY JARIMALAR</h2>
            <p>
              Eng faol yo'l qoidalari buzilishlari, teleradarlar, rasm-ko'rik ko'rsatkichlari, tonirovka, BHM hisobi va ma'muriy jarimalar katalogi darsligi.
            </p>
            <button className="penalty-option-button" onClick={() => setMode("fines")}>
              KIRITISH / KO'RISH →
            </button>
          </div>

          <div className="penalty-option-card">
            <div className="penalty-option-icon-wrapper blue">
              <Scale size={28} />
            </div>
            <h2>JARIMA BALLARI</h2>
            <p>
              12-ballik tizim bo'yicha ruxsat etilgan limit ko'rsatkichlari, litsenziyani to'xtatish mezonlari va qoidabuzarlik buni qanday o'zgartirishi tahlilnomasi.
            </p>
            <button className="penalty-option-button" onClick={() => setMode("points")}>
              SIMULYATOR VA MA'LUMOT →
            </button>
          </div>
        </div>

        <div className="penalty-bhm-section">
          <h3>JORIY BHM HISOBLASH STANDARTI (UZBEKISTAN)</h3>
          <div className="penalty-bhm-grid">
            <div className="penalty-bhm-card">
              <span className="bhm-card-label">BHM (1 BAROBARI)</span>
              <strong className="bhm-card-value">375 000 UZS</strong>
            </div>
            <div className="penalty-bhm-card">
              <span className="bhm-card-label">O'Z VAQTIDA TO'LOV CHEGIRMASI</span>
              <strong className="bhm-card-value negative">-50%</strong>
              <span className="bhm-card-desc">15 kun ichida kvitansiya</span>
            </div>
            <div className="penalty-bhm-card">
              <span className="bhm-card-label">REYTING BALLAR TIZIMI HOLATI</span>
              <strong className="bhm-card-value active">Aktiv</strong>
              <span className="bhm-card-desc">Litsenziya 12-ballik limitda</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Fines Directory View (Umumiy jarimalar)
  if (mode === "fines") {
    return (
      <div className="penalties-page page-shell">
        <div className="penalty-sub-header">
          <div className="penalty-sub-title-wrap">
            <button className="penalty-back-btn" onClick={() => setMode("landing")} aria-label="Ortga">
              <ArrowLeft size={18} />
            </button>
            <div className="penalty-title-meta">
              <h1>JARIMALAR (UMUMIY JARIMALAR)</h1>
              <p>O'ZBEKISTON RESPUBLIKASI MA'MURIY JAVOBGARLIK TO'G'RISIDAGI KODEKS DARSLIGI</p>
            </div>
          </div>
          <div className="penalty-mode-selector">
            <span>REJIM:</span>
            <select value={mode} onChange={handleModeChange}>
              <option value="fines">Umumiy jarimalar</option>
              <option value="points">Jarima ballari</option>
            </select>
          </div>
        </div>

        <div className="penalty-search-filter-card">
          <div className="penalty-search-box">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Jarima turi, moddani qidirish..."
            />
          </div>
          <div className="penalty-categories">
            {categoriesList.map((cat) => (
              <button
                key={cat.id}
                className={`penalty-category-pill ${selectedCategory === cat.id ? "active" : ""}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div className="penalty-card-grid">
          {visiblePenalties.map((penalty) => {
            const points = getPenaltyPoints(penalty);
            const pointsText = points > 0 ? `+${points} BALL` : null;
            const isHeavy = categorizePenalty(penalty).includes("heavy");
            const isRedBadge = isHeavy || points >= 3;

            return (
              <article
                className="penalty-detail-card clickable"
                key={penalty.id}
                onClick={() => setSelectedPenalty(penalty)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedPenalty(penalty);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="penalty-detail-card-header">
                  <span className="penalty-article-badge" title={penalty.article}>
                    MJTK {penalty.article.toUpperCase()}
                  </span>
                  {pointsText && (
                    <span className={`penalty-point-badge ${isRedBadge ? "red" : ""}`}>
                      {pointsText}
                    </span>
                  )}
                </div>
                <h3 className="penalty-detail-title">{clean(penalty.title)}</h3>
                <p className="penalty-detail-desc">{clean(penalty.description)}</p>
                <div className="penalty-detail-footer">
                  <div className="penalty-footer-left">
                    <span className="penalty-footer-label">JARIMA SUMMASI</span>
                    <span className="penalty-footer-value">{formatBcv(penalty.bcv)}</span>
                  </div>
                  <div className="penalty-footer-right">
                    <strong className="penalty-amount-uzs">{calculateAmount(penalty.bcv)}</strong>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <PaginationControl
          page={currentPenaltyPage}
          pageSize={pageSize}
          totalItems={displayPenalties.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
        {selectedPenalty && (() => {
          const points = getPenaltyPoints(selectedPenalty);
          const pointsText = points > 0 ? `+${points} BALL` : "Ball belgilanmagan";
          return (
            <div className="penalty-modal-backdrop" onClick={() => setSelectedPenalty(null)} role="presentation">
              <section
                aria-labelledby="penalty-modal-title"
                aria-modal="true"
                className="penalty-modal"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
              >
                <header className="penalty-modal-header">
                  <div>
                    <span className="penalty-article-badge">MJTK {selectedPenalty.article.toUpperCase()}</span>
                    <h2 id="penalty-modal-title">{clean(selectedPenalty.title)}</h2>
                  </div>
                  <button className="penalty-modal-close" onClick={() => setSelectedPenalty(null)} aria-label="Yopish">
                    <X size={20} />
                  </button>
                </header>
                <div className="penalty-modal-body">
                  <p>{clean(selectedPenalty.description)}</p>
                  <div className="penalty-modal-facts">
                    <div>
                      <span>Jarima summasi</span>
                      <strong>{formatBcv(selectedPenalty.bcv)}</strong>
                    </div>
                    <div>
                      <span>UZS hisobida</span>
                      <strong>{calculateAmount(selectedPenalty.bcv)}</strong>
                    </div>
                    <div>
                      <span>Jarima balli</span>
                      <strong>{pointsText}</strong>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          );
        })()}
      </div>
    );
  }

  // 3. Points Simulator View (Jarima ballari)
  const maxPoints = 12;
  const strokeWidth = 8;
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(simulatedPoints, maxPoints);
  const strokeDashoffset = circumference - (progress / maxPoints) * circumference;

  let statusText = "O'TA XAVFSIZ";
  let statusColor = "#12a877"; // emerald
  if (simulatedPoints > 0 && simulatedPoints <= 4) {
    statusText = "YAXSHI";
    statusColor = "#12a877";
  } else if (simulatedPoints >= 5 && simulatedPoints <= 8) {
    statusText = "DIQQAT";
    statusColor = "#d9a441"; // amber
  } else if (simulatedPoints >= 9 && simulatedPoints <= 11) {
    statusText = "XAVFLI";
    statusColor = "#f0526f"; // rose
  } else if (simulatedPoints >= 12) {
    statusText = "MAHRUM QILINISH";
    statusColor = "#b91c1c"; // dark red
  }

  return (
    <div className="penalties-page page-shell">
      <div className="penalty-sub-header">
        <div className="penalty-sub-title-wrap">
          <button className="penalty-back-btn" onClick={() => setMode("landing")} aria-label="Ortga">
            <ArrowLeft size={18} />
          </button>
          <div className="penalty-title-meta">
            <h1>JARIMALAR (JARIMA BALLARI)</h1>
            <p>O'ZBEKISTON RESPUBLIKASI MA'MURIY JAVOBGARLIK TO'G'RISIDAGI KODEKS DARSLIGI</p>
          </div>
        </div>
        <div className="penalty-mode-selector">
          <span>REJIM:</span>
          <select value={mode} onChange={handleModeChange}>
            <option value="fines">Umumiy jarimalar</option>
            <option value="points">Jarima ballari</option>
          </select>
        </div>
      </div>

      <div className="penalty-points-layout">
        <div className="penalty-simulator-left">
          <h2>SIZNING IMTIHON LIMIT HOLATINGIZ</h2>

          <div className="penalty-sim-meter-box">
            <svg className="penalty-sim-svg" viewBox="0 0 140 140" width="140" height="140">
              <circle
                cx="70"
                cy="70"
                r={radius}
                fill="transparent"
                stroke="#e6edf5"
                strokeWidth={strokeWidth}
              />
              <circle
                cx="70"
                cy="70"
                r={radius}
                fill="transparent"
                stroke={statusColor}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform="rotate(-90 70 70)"
                style={{ transition: "stroke-dashoffset 0.3s ease, stroke 0.3s ease" }}
              />
            </svg>
            <div className="penalty-sim-meter-text">
              <strong className="sim-meter-score">{simulatedPoints}</strong>
              <span className="sim-meter-total">/ {maxPoints} BALL</span>
            </div>
          </div>

          <div className="penalty-sim-status-label" style={{ color: statusColor }}>
            {statusText} • {simulatedPoints} BALL
          </div>

          <p className="penalty-sim-desc">
            Quyidagi o'ng bo'limda joylashgan har qaysi qoidabuzarliklarni qo'shib joriy ballingiz nimalarga va qanday to'lovlarga qodirligini sinab ko'rishingiz mumkin.
          </p>

          <div className="penalty-sim-history-card">
            <h3>TARIXIY JARIMALAR ({simulatedFines.length})</h3>
            <div className="simulated-list">
              {simulatedFines.length === 0 ? (
                <div className="simulated-list-empty">Simulyatsiyada hech qanday qarzlar yo'q</div>
              ) : (
                simulatedFines.map((item, index) => (
                  <div className="simulated-list-item" key={`${item.id}-${index}`}>
                    <div className="simulated-item-info">
                      <strong>{clean(item.title)}</strong>
                      <span>
                        MJTK {item.article.toUpperCase()} • +{getPenaltyPoints(item)} Ball
                      </span>
                    </div>
                    <button
                      className="simulated-item-remove-btn"
                      onClick={() => handleRemoveSimulated(index)}
                      aria-label="O'chirish"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="penalty-simulator-right">
          <h2>HAYDOVCHILIK BALLARI SIMULYATSIYASI (QOIDABUZARLIK QO'SHISH)</h2>
          <p>Balga sabab bo'luvchi qoidabuzarliklar ustiga + Belgi bosish orqali ballarni tekshirib boring:</p>

          <div className="sim-penalties-list">
            {penalties
              .filter((p) => getPenaltyPoints(p) > 0)
              .map((penalty) => {
                const pts = getPenaltyPoints(penalty);
                return (
                  <div
                    className="sim-penalty-row-card clickable"
                    key={penalty.id}
                    onClick={() => handleAddSimulated(penalty)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleAddSimulated(penalty);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="sim-penalty-row-body">
                      <span className="sim-penalty-row-article">
                        MJTK {penalty.article.toUpperCase()}
                      </span>
                      <h4 className="sim-penalty-row-title">{clean(penalty.title)}</h4>
                      <p className="sim-penalty-row-desc">{clean(penalty.description)}</p>
                    </div>
                    <div className="sim-penalty-row-actions">
                      <span className="sim-penalty-row-points">+{pts} Ball</span>
                      <button
                        className="sim-penalty-row-add-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleAddSimulated(penalty);
                        }}
                        aria-label="Qo'shish"
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
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
  const [selectedImage, setSelectedImage] = useState<(typeof autodromeTabs)[number]["images"][number] | null>(null);
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
            onClick={() => {
              setActiveTab(tab.id);
              setSelectedImage(null);
            }}
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
        <div className={`autodrome-scheme-gallery ${active.id === "b-c-d" ? "bcd-gallery" : ""}`}>
          {active.images.map((image) => (
            <figure className="autodrome-scheme-figure" key={image.src}>
              <button
                className="autodrome-scheme-preview"
                onClick={() => setSelectedImage(image)}
                type="button"
              >
                <img className="autodrome-scheme-image" src={image.src} alt={image.label} />
              </button>
              <figcaption>{image.label}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {selectedImage && (
        <div className="autodrome-image-modal-backdrop" onClick={() => setSelectedImage(null)} role="presentation">
          <section
            aria-label={selectedImage.label}
            aria-modal="true"
            className="autodrome-image-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header>
              <h2>{selectedImage.label}</h2>
              <button onClick={() => setSelectedImage(null)} type="button" aria-label="Yopish">
                <X size={20} />
              </button>
            </header>
            <div className="autodrome-image-modal-body">
              <img src={selectedImage.src} alt={selectedImage.label} />
            </div>
          </section>
        </div>
      )}
      
    </div>
  );
}

type TemplateFilter = "all" | "completed" | "not-started" | "saved" | "weak";
type TemplateSort = "recommended" | "number" | "best" | "not-started";

function RandomTestsPage({
  data,
  summary,
  onStart,
}: {
  data: AppData;
  summary: ProgressSummary | null;
  onStart: (config: RandomTestConfig) => void;
}) {
  const [questionCount, setQuestionCount] = useState(20);
  const totalQuestions = data.counts.questions || 0;
  const answered = summary?.answered ?? 0;
  const correct = summary?.correct ?? 0;
  const wrong = Math.max(0, answered - correct);
  const attempts = summary?.attempts ?? 0;
  const accuracy = answered ? Math.round((correct / answered) * 100) : 0;
  const progressPercent = totalQuestions ? Math.min(100, Math.round((answered / totalQuestions) * 100)) : 0;
  const latestAttempt = summary?.latestAttempt;
  const updatedAt = latestAttempt?.createdAt ? new Date(latestAttempt.createdAt) : new Date();
  const createdLabel = latestAttempt?.createdAt ? new Date(latestAttempt.createdAt).toLocaleString("uz-Latn-UZ") : "Hali boshlanmagan";
  const updatedLabel = updatedAt.toLocaleString("uz-Latn-UZ");
  const durationMinutes = questionCount <= 20 ? 25 : questionCount <= 50 ? 60 : 120;
  const selectedMode = questionCount === 20 ? "Tezkor mashq" : questionCount === 50 ? "Chuqur mashq" : "Marafon";

  function startRandomTest() {
    onStart({
      count: questionCount,
      durationMinutes,
      seed: `${Date.now()}-${questionCount}-${attempts}`,
      startedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="page-shell random-tests-page">
      <section className="random-title-card card">
        <div>
          <span>Test markazi</span>
          <h1>Aralash testlar</h1>
        </div>
        <p>Savollar bazadan har safar yangi tartibda olinadi. Maqsad: tez fikrlash, real imtihonga yaqin ritm va aniq progress.</p>
      </section>

      <section className="card random-console">
        <div className="random-hero">
          <div className="random-hero-copy">
            <span className="tag">Adaptive practice</span>
            <h2>{selectedMode}</h2>
            <p>{questionCount} ta savol, {durationMinutes} daqiqa. Javoblar yakunda tekshiriladi va urinish progressga qo'shiladi.</p>
          </div>
          <div className="random-hero-score">
            <span>Tayyorlik</span>
            <strong>{accuracy}%</strong>
            <div><span style={{ width: `${accuracy}%` }} /></div>
          </div>
        </div>

        <div className="random-console-grid">
          <div className="random-metrics">
            <div className="random-metric success">
              <CheckCircle2 size={18} />
              <span>To'g'ri javoblar</span>
              <strong>{correct}</strong>
            </div>
            <div className="random-metric danger">
              <X size={18} />
              <span>Noto'g'ri javoblar</span>
              <strong>{wrong}</strong>
            </div>
            <div className="random-metric warning">
              <ListChecks size={18} />
              <span>Jami ishlangan testlar</span>
              <strong>{attempts}</strong>
            </div>
            <div className="random-metric info">
              <ClipboardList size={18} />
              <span>Jami savollar</span>
              <strong>{totalQuestions}</strong>
            </div>

            <div className="random-metric neutral">
              <Timer size={18} />
              <span>Tanlangan vaqt</span>
              <strong>{durationMinutes}m</strong>
            </div>
            <div className="random-metric neutral">
              <Gauge size={18} />
              <span>Aniqlik</span>
              <strong>{accuracy}%</strong>
            </div>
            <div className="random-date-card">
              <span>Yaratilgan vaqt</span>
              <strong>{createdLabel}</strong>
            </div>
            <div className="random-date-card">
              <span>Yangilangan vaqt</span>
              <strong>{updatedLabel}</strong>
            </div>
          </div>

          <aside className="random-start-panel">
            <div className="random-start-head">
              <span>Test sozlamasi</span>
              <strong>{selectedMode}</strong>
            </div>
            <div className="random-count-tabs" aria-label="Savollar soni">
              {[
                [20, "Tezkor"],
                [50, "Standart"],
                [100, "Marafon"],
              ].map(([count, label]) => {
                const minutes = Number(count) <= 20 ? 25 : Number(count) <= 50 ? 60 : 120;
                return (
                  <button
                    className={questionCount === count ? "active" : ""}
                    key={count}
                    onClick={() => setQuestionCount(Number(count))}
                    type="button"
                  >
                    <strong>{count}</strong>
                    <span>{label}</span>
                    <small>{minutes} daqiqa</small>
                  </button>
                );
              })}
            </div>
            <div className="random-progress-row">
              <div><span style={{ width: `${progressPercent}%` }} /></div>
              <strong>{progressPercent}%</strong>
            </div>
            <button className="random-start-button" onClick={startRandomTest} type="button">
              <PlayCircle size={18} />
              Yangi test boshlash
            </button>
            <div className="random-start-foot">
              <span>{progressPercent}% baza qamrab olingan</span>
              <span>{attempts} urinish</span>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

function TemplateTestsPage({ onStart }: { onStart: (template: TestTemplate) => void }) {
  const [templates, setTemplates] = useState<TestTemplate[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TemplateFilter>("all");
  const [sort, setSort] = useState<TemplateSort>("recommended");
  const [sortOpen, setSortOpen] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<TestTemplate | null>(null);
  const [examLanguage, setExamLanguage] = useState<"uz" | "cyrl" | "ru">("uz");
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
        if (sort === "recommended") {
          const score = (template: TestTemplate) => {
            const completed = Boolean(template.completed);
            const weak = completed && Number(template.bestPercent || 0) < 70;
            const saved = Boolean(template.saved);
            if (weak) return 0;
            if (!completed) return 1;
            if (saved) return 2;
            return 3;
          };
          return score(a) - score(b) || a.id - b.id;
        }
        if (sort === "best") return Number(b.bestPercent || 0) - Number(a.bestPercent || 0);
        if (sort === "not-started") return Number(a.completed) - Number(b.completed) || a.id - b.id;
        return a.id - b.id;
      });
  }, [templates, query, filter, sort]);

  const visibleTemplates = filtered.slice(0, visible);
  const completedCount = templates.filter((template) => template.completed).length;
  const weakCount = templates.filter((template) => template.completed && Number(template.bestPercent || 0) < 70).length;
  const savedCount = templates.filter((template) => template.saved).length;
  const bestScore = templates.reduce((best, template) => Math.max(best, Number(template.bestPercent || 0)), 0);
  const progressPercent = templates.length ? Math.round((completedCount / templates.length) * 100) : 0;
  const nextTemplate = filtered.find((template) => !template.completed || (template.completed && Number(template.bestPercent || 0) < 70)) ?? templates.find((template) => !template.completed) ?? templates[0];
  const sortOptions: { id: TemplateSort; label: string }[] = [
    { id: "recommended", label: "Tavsiya etilgan" },
    { id: "number", label: "Shablon raqami" },
    { id: "best", label: "Eng yaxshi natija" },
    { id: "not-started", label: "Boshlanmagan" },
  ];
  const activeSortLabel = sortOptions.find((option) => option.id === sort)?.label ?? "Tavsiya etilgan";

  async function toggleSaved(event: React.MouseEvent, template: TestTemplate) {
    event.stopPropagation();
    await saveTemplate({ templateId: template.id, saved: !template.saved });
    setTemplates((items) =>
      items.map((item) => (item.id === template.id ? { ...item, saved: !item.saved } : item)),
    );
  }

  function openStartModal(template: TestTemplate) {
    setPendingTemplate(template);
  }

  function confirmStart() {
    if (!pendingTemplate) return;
    onStart(pendingTemplate);
    setPendingTemplate(null);
  }

  return (
    <div className="template-page page-shell">
      <PageHeader
        eyebrow="Exam center"
        title="Shablon testlar"
        subtitle="Real imtihon tartibida 20 ta savol, 25 daqiqa va aniq natija."
      />

      <section className="card template-hero">
        <div>
          <span className="tag">Imtihon rejimi</span>
          <h2>{nextTemplate ? "Davom ettirish" : "Boshlash uchun shablon tanlang"}</h2>
          <p>
            {nextTemplate
              ? `${nextTemplate.id}-shablondan boshlang. Javoblar imtihon yakuniga qadar tekshirilmaydi, natija esa alohida ko'rinadi.`
              : "Katalogdan istalgan shablonni tanlab, imtihon oqimini boshlang."}
          </p>
          <div className="template-hero-progress" aria-label="Shablon progressi">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
        <div className="template-hero-actions">
          <button className="primary-button" disabled={!nextTemplate} onClick={() => nextTemplate && openStartModal(nextTemplate)}>
            {nextTemplate ? `${nextTemplate.id}-shablonni boshlash` : "Shablon yo'q"}
          </button>
          <span>{progressPercent}% bajarildi</span>
        </div>
      </section>

      <section className="template-summary">
        <div><strong>{templates.length || 62}</strong><span>shablon</span></div>
        <div><strong>25</strong><span>daqiqa</span></div>
        <div><strong>20</strong><span>savol</span></div>
        <div><strong>{bestScore}%</strong><span>eng yaxshi</span></div>
        <div><strong>{completedCount}</strong><span>yakunlangan</span></div>
        <div><strong>{weakCount}</strong><span>takrorlash</span></div>
        <div><strong>{savedCount}</strong><span>saqlangan</span></div>
      </section>

      <section className="card template-controls">
        <div className="template-search-panel">
          <span>Qidirish</span>
          <label className="search-box wide">
            <Search size={17} />
            <input value={query} onChange={(event) => { setVisible(24); setQuery(event.target.value); }} placeholder="Shablon raqami yoki nomi" />
          </label>
        </div>
        <div className="template-filter-panel">
          <span>Holat</span>
          <div className="template-filters">
            {[
              ["all", "Barchasi"],
              ["completed", "Yakunlangan"],
              ["not-started", "Boshlanmagan"],
              ["saved", "Saqlangan"],
              ["weak", "Zaif natija"],
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
        </div>
        <div className="template-sort-panel">
          <span>Saralash</span>
          <div className="template-sort-menu">
            <button
              aria-expanded={sortOpen}
              aria-haspopup="listbox"
              className="template-sort-trigger"
              onBlur={() => window.setTimeout(() => setSortOpen(false), 120)}
              onClick={() => setSortOpen((open) => !open)}
              type="button"
            >
              <span>{activeSortLabel}</span>
              <ChevronDown size={16} />
            </button>
            {sortOpen && (
              <div className="template-sort-options" role="listbox">
                {sortOptions.map((option) => (
                  <button
                    aria-selected={sort === option.id}
                    className={sort === option.id ? "active" : ""}
                    key={option.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setSort(option.id);
                      setSortOpen(false);
                    }}
                    role="option"
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="template-grid">
        {visibleTemplates.map((template) => {
          const percent = Number(template.bestPercent || 0);
          const completed = Boolean(template.completed);
          const weak = completed && percent < 70;
          const cardProgress = completed ? Math.max(6, percent) : 0;
          return (
            <article className={`template-card card ${completed ? "completed" : ""} ${weak ? "weak" : ""}`} key={template.id} onClick={() => openStartModal(template)}>
              <button className={`bookmark-button ${template.saved ? "saved" : ""}`} onClick={(event) => toggleSaved(event, template)} aria-label="Save template">
                <Bookmark size={18} />
              </button>
              <div className="template-card-head">
                <h2>{template.id} SHABLON</h2>
                <span className={`template-status ${weak ? "weak" : completed ? "completed" : "idle"}`}>
                  {weak ? "Zaif" : completed ? "Yakunlangan" : "Yangi"}
                </span>
              </div>
              <div className="template-card-body">
                <span className="template-status-ring">
                  {completed ? <CheckCircle2 size={24} /> : <PlayCircle size={24} />}
                </span>
                <div className="template-card-meta">
                  <p>Eng yaxshi: <strong>{percent}%</strong></p>
                  <p>To'g'ri javoblar: <strong>{Math.round((percent / 100) * Number(template.questions || 20))}</strong></p>
                  <p>Savol: <strong>{template.questions || 20}</strong></p>
                </div>
              </div>
              <div className="template-card-progress" aria-label="Shablon natijasi">
                <span style={{ width: `${cardProgress}%` }} />
              </div>
              <div className="template-card-foot">
                <span>{weak ? "Qayta ishlash kerak" : completed ? "Natija saqlangan" : "Boshlashga tayyor"}</span>
                <strong>{completed ? `${percent}%` : "0%"}</strong>
              </div>
              <button className="template-start-button" onClick={(event) => { event.stopPropagation(); openStartModal(template); }}>
                Boshlash
              </button>
            </article>
          );
        })}
      </section>

      {visible < filtered.length && (
        <button className="template-load-more" onClick={() => setVisible((count) => count + 24)}>
          Yana ko'rsatish ({filtered.length - visible})
        </button>
      )}

      {pendingTemplate && (
        <div className="exam-start-backdrop" onMouseDown={() => setPendingTemplate(null)} role="presentation">
          <section
            aria-label={`${pendingTemplate.id}-shablon imtihon sozlamalari`}
            aria-modal="true"
            className="exam-start-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="exam-start-header">
              <div>
                <span className="tag">Imtihonga tayyorlanish</span>
                <h2>{pendingTemplate.id}-shablon</h2>
                <p>Test boshlangandan keyin savollar alohida, chalg'itmaydigan imtihon ekranida ochiladi.</p>
              </div>
              <button className="icon-button" onClick={() => setPendingTemplate(null)} type="button" aria-label="Yopish">
                <X size={18} />
              </button>
            </header>

            <div className="exam-start-stats">
              <div><strong>{pendingTemplate.questions || 20}</strong><span>savol</span></div>
              <div><strong>{pendingTemplate.durationMinutes || 25}</strong><span>daqiqa</span></div>
              <div><strong>{Number(pendingTemplate.bestPercent || 0)}%</strong><span>eng yaxshi</span></div>
            </div>

            <div className="exam-start-section">
              <span>Til</span>
              <div className="exam-language-options">
                {[
                  ["uz", "O'zbek"],
                  ["cyrl", "Кирилл"],
                  ["ru", "Рус"],
                ].map(([id, label]) => (
                  <button
                    className={examLanguage === id ? "active" : ""}
                    key={id}
                    onClick={() => setExamLanguage(id as typeof examLanguage)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="exam-start-rules">
              <div>
                <CheckCircle2 size={17} />
                <span>Javoblar imtihon yakunida tekshiriladi.</span>
              </div>
              <div>
                <Timer size={17} />
                <span>V1 uchun vaqt ko'rsatkichi statik, keyingi bosqichda haqiqiy timer ulanadi.</span>
              </div>
              <div>
                <ShieldAlert size={17} />
                <span>3 tadan ortiq xato real imtihonga tayyorgarlikda xavfli signal hisoblanadi.</span>
              </div>
            </div>

            <footer className="exam-start-actions">
              <button className="ghost-button" onClick={() => setPendingTemplate(null)} type="button">Bekor qilish</button>
              <button className="primary-button" onClick={confirmStart} type="button">Imtihonni boshlash</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function QuestionStudio({
  mode,
  activeTemplate,
  randomConfig,
  onBack,
  onProgress,
  onAskTutor,
}: {
  mode: View;
  activeTemplate?: TestTemplate | null;
  randomConfig?: RandomTestConfig | null;
  onBack?: () => void;
  onProgress: () => void;
  onAskTutor: (question: Question) => void;
}) {
  const [query, setQuery] = useState("");
  const [hasVideo, setHasVideo] = useState(false);
  const [page, setPage] = useState(1);
  const [allTestsPageSize, setAllTestsPageSize] = useState(10);
  const [result, setResult] = useState<QuestionResponse | null>(null);
  const [examResult, setExamResult] = useState<QuestionResponse | null>(null);
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [draftSelected, setDraftSelected] = useState<Record<number, number>>({});
  const [markedQuestions, setMarkedQuestions] = useState<Set<number>>(new Set());
  const [fontScale, setFontScale] = useState(1);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const [focusImage, setFocusImage] = useState<Question | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [mediaTabs, setMediaTabs] = useState<Record<number, "image" | "video">>({});
  const [savedQuestionIds, setSavedQuestionIds] = useState<Set<number>>(new Set());
  const [focusedAllQuestionId, setFocusedAllQuestionId] = useState<number | null>(null);

  useEffect(() => {
    const pageSize = mode === "all-tests" && !activeTemplate ? allTestsPageSize : 1;
    getQuestions({ page, pageSize, query, hasVideo: hasVideo || undefined, templateId: activeTemplate?.id }).then(setResult).catch(console.error);
  }, [page, query, hasVideo, activeTemplate?.id, mode, allTestsPageSize]);

  useEffect(() => {
    if (mode !== "all-tests") return;
    getSavedQuestions()
      .then((response) => setSavedQuestionIds(new Set(response.data.map((question) => question.id))))
      .catch(console.error);
  }, [mode]);

  useEffect(() => {
    setPage(1);
    setSelected({});
    setDraftSelected({});
    setMarkedQuestions(new Set());
    setMediaTabs({});
    setShowResult(false);
    setFinishConfirmOpen(false);
    setExamResult(null);
    setTimeRemaining((activeTemplate?.durationMinutes || randomConfig?.durationMinutes || 25) * 60);
    if (activeTemplate?.id) {
      getQuestions({ page: 1, pageSize: activeTemplate.questions || 20, templateId: activeTemplate.id }).then(setExamResult).catch(console.error);
      return;
    }
    if (randomConfig) {
      getQuestions({ page: 1, pageSize: randomConfig.count, random: true, seed: randomConfig.seed }).then(setExamResult).catch(console.error);
    }
  }, [activeTemplate?.id, activeTemplate?.questions, randomConfig?.count, randomConfig?.seed, randomConfig?.durationMinutes]);

  const modeLabel = activeTemplate ? `${activeTemplate.id} Shablon` : randomConfig ? randomConfig.label || "Aralash testlar" : viewTitles[mode];
  const isExam = Boolean(activeTemplate || randomConfig);
  const isAllTests = mode === "all-tests" && !isExam;
  const examQuestions = isExam ? examResult?.data ?? [] : result?.data ?? [];
  const examTotal = activeTemplate ? activeTemplate.questions || examResult?.data.length || 20 : randomConfig ? randomConfig.count : result?.data.length ?? 0;
  const answeredCount = examQuestions.filter((question) => selected[question.id]).length;
  const score = useMemo(() => {
    return examQuestions.filter((q) => {
      const picked = selected[q.id];
      return q.answers.find((answer) => answer.id === picked)?.correct;
    }).length;
  }, [examQuestions, selected]);
  const wrongCount = Math.max(0, answeredCount - score);
  const scorePercent = examTotal ? Math.round((score / examTotal) * 100) : 0;
  const formatExamTime = (seconds: number) => {
    const safeSeconds = Math.max(0, seconds);
    const minutes = Math.floor(safeSeconds / 60);
    const rest = safeSeconds % 60;
    return `${minutes}:${String(rest).padStart(2, "0")}`;
  };

  async function answerQuestion(question: Question, answerId: number) {
    if (isExam) {
      setDraftSelected((current) => ({ ...current, [question.id]: answerId }));
      return;
    }
    const answer = question.answers.find((item) => item.id === answerId);
    setSelected((current) => ({ ...current, [question.id]: answerId }));
    if (mode === "all-tests" && question.video) {
      setMediaTabs((current) => ({ ...current, [question.id]: "video" }));
    }
    await saveQuestionProgress({ questionId: question.id, answerId, correct: Boolean(answer?.correct) });
    onProgress();
  }

  async function toggleSavedQuestion(question: Question) {
    const saved = savedQuestionIds.has(question.id);
    setSavedQuestionIds((current) => {
      const next = new Set(current);
      if (saved) next.delete(question.id);
      else next.add(question.id);
      return next;
    });
    await saveQuestion({ questionId: question.id, saved: !saved });
    onProgress();
  }

  async function confirmAnswer(question: Question) {
    const answerId = draftSelected[question.id] ?? selected[question.id];
    if (!answerId) return;
    const answer = question.answers.find((item) => item.id === answerId);
    setSelected((current) => ({ ...current, [question.id]: answerId }));
    setDraftSelected((current) => {
      const next = { ...current };
      delete next[question.id];
      return next;
    });
    await saveQuestionProgress({ questionId: question.id, answerId, correct: Boolean(answer?.correct) });
    onProgress();
  }

  async function finishAttempt(force = false) {
    if (!result && !examResult) return;
    if (isExam && !force && unansweredCount > 0) {
      setFinishConfirmOpen(true);
      return;
    }
    setFinishConfirmOpen(false);
    await saveTestAttempt({ mode: activeTemplate ? `template-tests:${activeTemplate.id}` : randomConfig ? randomConfig.label === "Yakuniy imtihon" ? "final-exam" : `random-tests:${randomConfig.count}` : mode, score, total: examTotal || result?.data.length || examQuestions.length });
    onProgress();
    if (isExam) setShowResult(true);
  }

  function restartExam() {
    setSelected({});
    setDraftSelected({});
    setMarkedQuestions(new Set());
    setShowResult(false);
    setFinishConfirmOpen(false);
    setPage(1);
    setTimeRemaining((activeTemplate?.durationMinutes || randomConfig?.durationMinutes || 25) * 60);
  }

  function reviewMistakes() {
    const firstWrongIndex = examQuestions.findIndex((question) => {
      const picked = selected[question.id];
      return picked && !question.answers.find((answer) => answer.id === picked)?.correct;
    });
    setShowResult(true);
    setPage(firstWrongIndex >= 0 ? firstWrongIndex + 1 : 1);
  }

  const currentQuestion = isExam ? examQuestions[page - 1] : result?.data[0];
  const allTestsQuestions = isAllTests ? result?.data ?? [] : [];
  const focusedAllQuestion = isAllTests
    ? allTestsQuestions.find((question) => question.id === focusedAllQuestionId) ?? allTestsQuestions[0]
    : null;
  const picked = currentQuestion ? draftSelected[currentQuestion.id] ?? selected[currentQuestion.id] : undefined;
  const confirmedPicked = currentQuestion ? selected[currentQuestion.id] : undefined;
  const pickedAnswer = currentQuestion?.answers.find((answer) => answer.id === picked);
  const examProgressPercent = examTotal ? Math.round((answeredCount / examTotal) * 100) : 0;
  const unansweredCount = Math.max(0, examTotal - answeredCount);
  const currentMarked = currentQuestion ? markedQuestions.has(currentQuestion.id) : false;
  const studentName = "AVTOLEARN TALABA";
  const questionTotal = result?.total ?? 0;
  const totalPages = result?.totalPages ?? 1;
  const libraryProgress = totalPages ? Math.round((page / totalPages) * 100) : 0;
  const visibleStart = result && questionTotal ? (page - 1) * result.pageSize + 1 : 0;
  const visibleEnd = result && questionTotal ? Math.min(page * result.pageSize, questionTotal) : 0;

  useEffect(() => {
    if (!isAllTests) return;
    const firstId = result?.data[0]?.id ?? null;
    if (!firstId) {
      setFocusedAllQuestionId(null);
      return;
    }
    setFocusedAllQuestionId((current) =>
      current && result?.data.some((question) => question.id === current) ? current : firstId,
    );
  }, [isAllTests, result?.data]);

  useEffect(() => {
    if (!isExam || showResult || timeRemaining <= 0) return;
    const timerId = window.setInterval(() => {
      setTimeRemaining((seconds) => {
        if (seconds <= 1) {
          window.clearInterval(timerId);
          setShowResult(true);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [isExam, showResult, timeRemaining]);

  useEffect(() => {
    if (!isExam || !currentQuestion) return;
    const question = currentQuestion;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onBack?.();
        return;
      }
      if (event.key.toLowerCase() === "f" && question.image) {
        setFocusImage(question);
        return;
      }
      if (event.key === "Enter") {
        void confirmAnswer(question);
        return;
      }
      const functionMatch = event.key.match(/^F([1-4])$/);
      const numberMatch = event.key.match(/^[1-4]$/);
      const index = functionMatch ? Number(functionMatch[1]) - 1 : numberMatch ? Number(event.key) - 1 : -1;
      const answer = question.answers[index];
      if (answer) {
        event.preventDefault();
        void answerQuestion(question, answer.id);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentQuestion, isExam, onBack, draftSelected, selected]);

  return (
    <div className={`page-shell questions-page ${isExam ? "exam-page" : ""} ${isAllTests ? "all-tests-page" : ""} ${isExam && showResult ? "exam-result-mode" : ""}`}>
      {isExam && (
        <section className="card exam-cockpit-header">
          <div className="exam-brand">
            <img src={LOGO_PATH} alt="AvtoLearn" />
          </div>
          <div className="exam-title-block">
            <span>Imtihon rejimi</span>
            <h1>{modeLabel}</h1>
            <div className="exam-header-progress">
              <span style={{ width: `${examProgressPercent}%` }} />
            </div>
            <p>{answeredCount}/{examTotal} javob berildi</p>
          </div>
          <div className="exam-candidate">
            <span>Topshiruvchi</span>
            <strong>{studentName}</strong>
            <em>Imtihonda - faol</em>
          </div>
          <div className="exam-kpis">
            <span className={`exam-timer-chip ${timeRemaining <= 300 ? "urgent" : ""}`}><Timer size={16} /> {formatExamTime(timeRemaining)}</span>
            <span><ClipboardList size={16} /> {unansweredCount} ta qolgan</span>
            <button className="ghost-button compact" onClick={() => setFontScale((value) => Math.min(1.18, Number((value + 0.06).toFixed(2))))}>A+</button>
            <button className="ghost-button compact" onClick={() => setFontScale((value) => Math.max(.92, Number((value - 0.06).toFixed(2))))}>A-</button>
            <button className="ghost-button" onClick={onBack}><ArrowLeft size={16} /> Chiqish</button>
          </div>
        </section>
      )}

      {isExam && showResult && (
        <section className="card exam-result-card">
          <span className="tag">Natija</span>
          <h2>{score}/{examTotal} to'g'ri javob</h2>
          <div className="exam-result-meter"><span style={{ width: `${scorePercent}%` }} /></div>
          <div className="exam-result-stats">
            <div><strong>{scorePercent}%</strong><span>foiz</span></div>
            <div><strong>{score}</strong><span>to'g'ri</span></div>
            <div><strong>{wrongCount}</strong><span>xato</span></div>
          </div>
          <div className="exam-result-actions">
            <button className="primary-button" onClick={restartExam}>Qayta ishlash</button>
            <button className="ghost-button" onClick={onBack}>{activeTemplate ? "Shablonlarga qaytish" : "Aralash testlarga qaytish"}</button>
            <button className="ghost-button" disabled={wrongCount === 0} onClick={reviewMistakes}>Xatolarni ko'rish</button>
          </div>
        </section>
      )}

      {isExam && <div className="exam-bottom-timer">{activeTemplate?.durationMinutes || randomConfig?.durationMinutes || 25}:00</div>}
      {!isExam && isAllTests && (
        <section className="card all-tests-header">
          <h1>{modeLabel}</h1>
          <label className="search-box wide">
            <Search size={17} />
            <input value={query} onChange={(e) => { setPage(1); setQuery(e.target.value); }} placeholder="Qidiruv..." />
          </label>
        </section>
      )}
      {!isExam && !isAllTests && <>
      <PageHeader
        title={modeLabel}
        subtitle={activeTemplate ? `${activeTemplate.questions || 20} savol • ${activeTemplate.durationMinutes || 25} daqiqa • shablon imtihon` : "Lokal savollar, rasm/video va izohlar bilan amaliy mashq."}
        actions={
          <>
            {onBack && <button className="ghost-button" onClick={onBack}><ArrowRight size={16} /> Katalogga qaytish</button>}
            <button className="primary-button" onClick={() => finishAttempt()}>Natijani saqlash</button>
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
      </>}

      {!isExam && isAllTests && (
        <section className="card question-toolbar">
          <span>{questionTotal} ta savol</span>
          <span>{visibleStart}-{visibleEnd} ko'rsatilmoqda</span>
          <span>{page}/{totalPages} sahifa</span>
          <span>{libraryProgress}% ko'rildi</span>
          <button className={`pill ${hasVideo ? "active" : ""}`} onClick={() => { setPage(1); setHasVideo(!hasVideo); }}>
            <Video size={15} />
            Faqat video
          </button>
          <button className="ghost-button" onClick={() => focusedAllQuestion && onAskTutor(focusedAllQuestion)} disabled={!focusedAllQuestion}>
            <Bot size={16} />
            AI izoh
          </button>
        </section>
      )}

      {isAllTests && result?.data.length ? (
        <section className="all-tests-review-layout">
          <aside className="card all-tests-compact-list" aria-label="Savollar ro'yxati">
            <div className="all-tests-list-head">
              <strong>Savollar</strong>
              <span>{visibleStart}-{visibleEnd}</span>
            </div>
            {result.data.map((question, questionIndex) => {
              const pickedForQuestion = selected[question.id];
              const pickedAnswerForQuestion = question.answers.find((answer) => answer.id === pickedForQuestion);
              const absoluteNumber = (page - 1) * result.pageSize + questionIndex + 1;
              const status = pickedForQuestion ? (pickedAnswerForQuestion?.correct ? "correct" : "wrong") : "idle";
              return (
                <button
                  className={`all-test-row ${focusedAllQuestion?.id === question.id ? "active" : ""} ${status}`}
                  key={question.id}
                  onClick={() => setFocusedAllQuestionId(question.id)}
                  type="button"
                >
                  <span className="all-test-row-number">{absoluteNumber}</span>
                  <span className="all-test-row-copy">
                    <strong>{clean(question.title)}</strong>
                    <small>
                      {question.image ? "Rasm" : "Rasmsiz"}
                      {question.video ? " / Video" : ""}
                      {savedQuestionIds.has(question.id) ? " / Saqlangan" : ""}
                    </small>
                  </span>
                  <span className="all-test-row-status">
                    {status === "correct" ? <CheckCircle2 size={16} /> : status === "wrong" ? <X size={16} /> : <FileText size={16} />}
                  </span>
                </button>
              );
            })}
          </aside>

          {focusedAllQuestion && (() => {
            const question = focusedAllQuestion;
            const pickedForQuestion = selected[question.id];
            const pickedAnswerForQuestion = question.answers.find((answer) => answer.id === pickedForQuestion);
            const absoluteNumber = (page - 1) * result.pageSize + result.data.findIndex((item) => item.id === question.id) + 1;
            const activeMediaTab = mediaTabs[question.id] ?? "image";
            return (
              <article className="card all-test-card all-tests-focused-card" key={question.id}>
                <header className="all-test-card-head">
                  <span>{absoluteNumber}</span>
                  <h2>{clean(question.title)}</h2>
                  <div className="all-test-card-actions">
                    <button className={`ghost-button ${savedQuestionIds.has(question.id) ? "saved" : ""}`} onClick={() => void toggleSavedQuestion(question)} type="button">
                      <Bookmark size={16} />
                      {savedQuestionIds.has(question.id) ? "Saqlangan" : "Saqlash"}
                    </button>
                    <button className="ghost-button" onClick={() => onAskTutor(question)} type="button">
                      <Bot size={16} />
                      AI izoh
                    </button>
                  </div>
                </header>
                <div className="all-test-card-body">
                  <section className="all-test-media">
                    <div className="all-test-section-title">
                      <FileText size={15} />
                      Vizual materiallar
                    </div>
                    <div className="all-test-tabs">
                      <button className={activeMediaTab === "image" ? "active" : ""} onClick={() => setMediaTabs((current) => ({ ...current, [question.id]: "image" }))} type="button">
                        <FileText size={13} /> Rasm
                      </button>
                      <button
                        className={activeMediaTab === "video" ? "active" : ""}
                        onClick={() => setMediaTabs((current) => ({ ...current, [question.id]: "video" }))}
                        type="button"
                      >
                        <PlayCircle size={13} /> Video
                      </button>
                    </div>
                    {activeMediaTab === "image" && (
                      question.image ? <img className="question-media" src={asset(question.image)} alt={clean(question.title)} loading="lazy" /> : <div className="empty-state">Rasm biriktirilmagan</div>
                    )}
                    {activeMediaTab === "video" && (
                      pickedForQuestion && question.video ? (
                        <video className="question-video" src={asset(question.video)} controls preload="metadata" />
                      ) : (
                        <div className="video-answer-lock">
                          <PlayCircle size={24} />
                          <strong>Video javob</strong>
                          <span>Avval javobni tanlang, keyin video izoh ochiladi.</span>
                        </div>
                      )
                    )}
                  </section>
                  <section className="all-test-answers">
                    <div className="all-test-section-title">
                      <CheckCircle2 size={15} />
                      Javob variantlari
                    </div>
                    <div className="answers">
                      {question.answers.map((answer, index) => {
                        const chosen = pickedForQuestion === answer.id;
                        const revealed = Boolean(pickedForQuestion);
                        return (
                          <button
                            key={answer.id}
                            className={`answer ${chosen ? "chosen" : ""} ${revealed && answer.correct ? "correct" : ""} ${revealed && chosen && !answer.correct ? "wrong" : ""}`}
                            onClick={() => void answerQuestion(question, answer.id)}
                            type="button"
                          >
                            <strong>{String.fromCharCode(65 + index)}<small>F{index + 1}</small></strong>
                            <span>{clean(answer.text)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </div>
                {pickedForQuestion && (
                  <footer className="all-test-explanation">
                    <strong>{pickedAnswerForQuestion?.correct ? "To'g'ri javob" : "Izoh"}</strong>
                    <p>{clean(question.explanation)}</p>
                  </footer>
                )}
              </article>
            );
          })()}
        </section>
      ) : null}

      {currentQuestion && !isAllTests && (
        <>
        {isExam && (
          <section className="exam-question-strip">
            <div>
              <span>Savol</span>
              <strong>{page}/{examTotal}</strong>
            </div>
            <p>{clean(currentQuestion.title)}</p>
            <button
              className={`exam-mark-button ${currentMarked ? "marked" : ""}`}
              onClick={() => setMarkedQuestions((current) => {
                const next = new Set(current);
                if (next.has(currentQuestion.id)) next.delete(currentQuestion.id);
                else next.add(currentQuestion.id);
                return next;
              })}
              type="button"
            >
              <Bookmark size={16} />
              {currentMarked ? "Belgilangan" : "Belgilash"}
            </button>
          </section>
        )}
        <section className="trainer-shell">
          <article className="card question-card trainer-media">
            <div className="question-head">
              <span className="tag">{isAllTests ? "Savol" : `#${currentQuestion.id}`}</span>
              <span className="activity-badge">{result?.page ?? 1}/{result?.totalPages ?? 1}</span>
            </div>
            <h2>{clean(currentQuestion.title)}</h2>
            {currentQuestion.image && <img className="question-media" src={asset(currentQuestion.image)} alt={clean(currentQuestion.title)} loading="lazy" />}
            {isExam && currentQuestion.image && (
              <button className="exam-image-focus" onClick={() => setFocusImage(currentQuestion)} type="button">
                <Expand size={16} />
                F
              </button>
            )}
            {!isExam && currentQuestion.video && <video className="question-video" src={asset(currentQuestion.video)} controls preload="metadata" />}
            {(!isExam || showResult) && picked && <p className="explanation">{clean(currentQuestion.explanation)}</p>}
          </article>

          <aside className="card trainer-panel">
            <div className="trainer-progress">
              <span>Jami: {isExam ? examTotal : result?.total ?? 0}</span>
              <span>{isExam ? `Javob: ${answeredCount}/${examTotal}` : picked ? pickedAnswer?.correct ? "To'g'ri javob" : "Qayta ko'rib chiqing" : "Javob tanlanmagan"}</span>
            </div>
            <div className="answers">
              {currentQuestion.answers.map((answer, index) => {
                const chosen = picked === answer.id;
                const confirmed = confirmedPicked === answer.id;
                const revealed = isExam ? showResult : Boolean(picked);
                return (
                  <button
                    key={answer.id}
                    className={`answer ${chosen ? "chosen" : ""} ${chosen && !confirmed ? "pending" : ""} ${confirmed ? "confirmed" : ""} ${revealed && answer.correct ? "correct" : ""} ${revealed && chosen && !answer.correct ? "wrong" : ""}`}
                    onClick={() => answerQuestion(currentQuestion, answer.id)}
                    style={isExam ? { fontSize: `${fontScale}em` } : undefined}
                  >
                    {isExam && <strong>{String.fromCharCode(65 + index)}<small>F{index + 1}</small></strong>}
                    <span>{isExam ? clean(answer.text) : `${index + 1}. ${clean(answer.text)}`}</span>
                  </button>
                );
              })}
            </div>
            {isExam && (
              <button
                className="exam-confirm-button"
                disabled={!currentQuestion || !picked || confirmedPicked === picked}
                onClick={() => currentQuestion && confirmAnswer(currentQuestion)}
                type="button"
              >
                Javobni tasdiqlash
                <span>Enter</span>
              </button>
            )}
            {isExam && (
              <section className="question-navigator" aria-label="Savollar navigatsiyasi">
                <div className="question-navigator-head">
                  <strong>Savollar</strong>
                  <span>{examProgressPercent}% bajarildi - {markedQuestions.size} belgilangan</span>
                </div>
                <div className="question-navigator-grid">
                  {Array.from({ length: examTotal }, (_, index) => {
                    const question = examQuestions[index];
                    const answered = question ? Boolean(selected[question.id]) : false;
                    const marked = question ? markedQuestions.has(question.id) : false;
                    return (
                      <button
                        key={question?.id ?? index}
                        className={`${page === index + 1 ? "current" : ""} ${answered ? "answered" : ""} ${marked ? "marked" : ""}`}
                        onClick={() => setPage(index + 1)}
                        type="button"
                      >
                        {index + 1}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
            {(!isExam || showResult) && <div className="ai-context-card">
              <Bot size={18} />
              <div>
                <strong>AI yordamchi</strong>
                <p>{pickedAnswer && !pickedAnswer.correct ? "Nega xato bo'lganini tushuntirib beradi." : "Savolni lokal materiallar asosida tushuntiradi."}</p>
              </div>
              <button className="ghost-button" onClick={() => onAskTutor(currentQuestion)}>
                {pickedAnswer && !pickedAnswer.correct ? "Explain why" : "Ask AI"}
              </button>
            </div>}
            <div className={`trainer-actions ${isExam ? "exam-footer" : ""}`}>
              <button disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Oldingi</button>
              <button className="primary-button" onClick={() => finishAttempt()}>{isExam ? "Yakunlash" : "Natijani saqlash"}</button>
              <button disabled={isExam ? page >= examTotal : !result || page >= result.totalPages} onClick={() => setPage((current) => current + 1)}>Keyingi</button>
            </div>
          </aside>
        </section>
        </>
      )}

      {finishConfirmOpen && (
        <div className="exam-dialog-backdrop" role="presentation" onMouseDown={() => setFinishConfirmOpen(false)}>
          <section className="exam-dialog" role="dialog" aria-modal="true" aria-label="Imtihonni yakunlash" onMouseDown={(event) => event.stopPropagation()}>
            <span className="tag">Yakunlash</span>
            <h2>{unansweredCount} ta savol javobsiz</h2>
            <p>Natija shu holatda hisoblanadi. Belgilangan yoki javobsiz savollarni tekshirib chiqishingiz mumkin.</p>
            <div className="exam-dialog-actions">
              <button className="ghost-button" onClick={() => setFinishConfirmOpen(false)}>Davom etish</button>
              <button className="primary-button" onClick={() => finishAttempt(true)}>Baribir yakunlash</button>
            </div>
          </section>
        </div>
      )}

      {focusImage?.image && (
        <div className="exam-image-modal" role="presentation" onMouseDown={() => setFocusImage(null)}>
          <button className="icon-button" onClick={() => setFocusImage(null)} type="button" aria-label="Yopish">
            <X size={18} />
          </button>
          <img src={asset(focusImage.image)} alt={clean(focusImage.title)} onMouseDown={(event) => event.stopPropagation()} />
        </div>
      )}

      {!isExam && isAllTests && result && (
        <PaginationControl
          page={page}
          pageSize={result.pageSize || allTestsPageSize}
          totalItems={questionTotal}
          onPageChange={setPage}
          onPageSizeChange={setAllTestsPageSize}
        />
      )}

      {!isExam && !isAllTests && <div className="pager">
        <button disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Oldingi</button>
        <button disabled={!result || page >= result.totalPages} onClick={() => setPage((current) => current + 1)}>Keyingi</button>
      </div>}
    </div>
  );
}

function SavedTestsPage({
  onProgress,
  onAskTutor,
}: {
  onProgress: () => void;
  onAskTutor: (question: Question) => void;
}) {
  const [saved, setSaved] = useState<Question[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [mediaTabs, setMediaTabs] = useState<Record<number, "image" | "video">>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadSaved = useCallback(() => {
    setLoading(true);
    getSavedQuestions()
      .then((response) => setSaved(response.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  const filtered = saved.filter((question) => {
    const haystack = `${question.title} ${question.explanation} ${question.answers.map((answer) => answer.text).join(" ")}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });
  const totalSavedPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentSavedPage = Math.min(page, totalSavedPages);
  const visibleSaved = filtered.slice((currentSavedPage - 1) * pageSize, currentSavedPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [query, pageSize]);

  async function answerSavedQuestion(question: Question, answerId: number) {
    const answer = question.answers.find((item) => item.id === answerId);
    setSelected((current) => ({ ...current, [question.id]: answerId }));
    if (question.video) setMediaTabs((current) => ({ ...current, [question.id]: "video" }));
    await saveQuestionProgress({ questionId: question.id, answerId, correct: Boolean(answer?.correct) });
    onProgress();
  }

  async function removeSavedQuestion(question: Question) {
    await saveQuestion({ questionId: question.id, saved: false });
    setSaved((current) => current.filter((item) => item.id !== question.id));
    onProgress();
  }

  return (
    <div className="page-shell saved-tests-page">
      <section className="card saved-tests-header">
        <div>
          <span>Shaxsiy ro'yxat</span>
          <h1>Saqlangan testlar</h1>
          <p>Keyinroq qaytish, murakkab savollarni takrorlash va video izohlarni ko'rish uchun saqlangan testlar.</p>
        </div>
        <div className="saved-tests-kpis">
          <article><strong>{saved.length}</strong><span>saqlangan</span></article>
          <article><strong>{filtered.length}</strong><span>ko'rinmoqda</span></article>
        </div>
      </section>

      <section className="card saved-tests-toolbar">
        <label className="search-box wide">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Saqlangan testlardan qidirish..." />
        </label>
        <button className="ghost-button" onClick={loadSaved}>
          <RefreshCcw size={16} />
          Yangilash
        </button>
      </section>

      {loading && <section className="card saved-empty"><strong>Yuklanmoqda...</strong></section>}

      {!loading && filtered.length === 0 && (
        <section className="card saved-empty">
          <Bookmark size={34} />
          <strong>{saved.length ? "Mos test topilmadi" : "Hali saqlangan test yo'q"}</strong>
          <p>Barcha testlar sahifasida kerakli savolni “Saqlash” orqali shu yerga qo'shing.</p>
        </section>
      )}

      {!loading && filtered.length > 0 && (
        <section className="all-tests-list saved-tests-list">
          {visibleSaved.map((question, index) => {
            const pickedForQuestion = selected[question.id];
            const pickedAnswerForQuestion = question.answers.find((answer) => answer.id === pickedForQuestion);
            const activeMediaTab = mediaTabs[question.id] ?? "image";
            const absoluteNumber = (currentSavedPage - 1) * pageSize + index + 1;
            return (
              <article className="card all-test-card saved-test-card" key={question.id}>
                <header className="all-test-card-head">
                  <span>{absoluteNumber}</span>
                  <h2>{clean(question.title)}</h2>
                  <div className="all-test-card-actions">
                    <button className="ghost-button danger" onClick={() => removeSavedQuestion(question)} type="button">
                      <X size={16} />
                      O'chirish
                    </button>
                    <button className="ghost-button" onClick={() => onAskTutor(question)} type="button">
                      <Bot size={16} />
                      AI izoh
                    </button>
                  </div>
                </header>
                <div className="all-test-card-body">
                  <section className="all-test-media">
                    <div className="all-test-section-title">
                      <FileText size={15} />
                      Vizual materiallar
                    </div>
                    <div className="all-test-tabs">
                      <button className={activeMediaTab === "image" ? "active" : ""} onClick={() => setMediaTabs((current) => ({ ...current, [question.id]: "image" }))} type="button">
                        <FileText size={13} /> Rasm
                      </button>
                      <button className={activeMediaTab === "video" ? "active" : ""} onClick={() => setMediaTabs((current) => ({ ...current, [question.id]: "video" }))} type="button">
                        <PlayCircle size={13} /> Video
                      </button>
                    </div>
                    {activeMediaTab === "image" && (
                      question.image ? <img className="question-media" src={asset(question.image)} alt={clean(question.title)} loading="lazy" /> : <div className="empty-state">Rasm biriktirilmagan</div>
                    )}
                    {activeMediaTab === "video" && (
                      pickedForQuestion && question.video ? (
                        <video className="question-video" src={asset(question.video)} controls preload="metadata" />
                      ) : (
                        <div className="video-answer-lock">
                          <PlayCircle size={24} />
                          <strong>Video javob</strong>
                          <span>Avval javobni tanlang, keyin video izoh ochiladi.</span>
                        </div>
                      )
                    )}
                  </section>
                  <section className="all-test-answers">
                    <div className="all-test-section-title">
                      <CheckCircle2 size={15} />
                      Javob variantlari
                    </div>
                    <div className="answers">
                      {question.answers.map((answer, answerIndex) => {
                        const chosen = pickedForQuestion === answer.id;
                        const revealed = Boolean(pickedForQuestion);
                        return (
                          <button
                            key={answer.id}
                            className={`answer ${chosen ? "chosen" : ""} ${revealed && answer.correct ? "correct" : ""} ${revealed && chosen && !answer.correct ? "wrong" : ""}`}
                            onClick={() => answerSavedQuestion(question, answer.id)}
                            type="button"
                          >
                            <strong>{String.fromCharCode(65 + answerIndex)}<small>F{answerIndex + 1}</small></strong>
                            <span>{clean(answer.text)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </div>
                {pickedForQuestion && (
                  <footer className="all-test-explanation">
                    <strong>{pickedAnswerForQuestion?.correct ? "To'g'ri javob" : "Izoh"}</strong>
                    <p>{clean(question.explanation)}</p>
                  </footer>
                )}
              </article>
            );
          })}
        </section>
      )}
      {!loading && filtered.length > 0 && (
        <PaginationControl
          page={currentSavedPage}
          pageSize={pageSize}
          totalItems={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}
    </div>
  );
}

function FinalExamPage({
  data,
  summary,
  onStart,
}: {
  data: AppData;
  summary: ProgressSummary | null;
  onStart: (config: RandomTestConfig) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [faceVerified, setFaceVerified] = useState(false);
  const [faceInFrame, setFaceInFrame] = useState<boolean | null>(null);
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  const answered = summary?.answered ?? 0;
  const attempts = summary?.attempts ?? 0;
  const accuracy = summary?.accuracy ?? 0;
  const passed = accuracy >= 70 && answered > 0;
  const examTotal = 20;
  const correctPreview = Math.min(examTotal, Math.max(0, Math.round((accuracy / 100) * examTotal)));
  const wrongPreview = answered ? Math.max(0, examTotal - correctPreview) : 0;
  const solvedAt = summary?.latestAttempt?.createdAt ? new Date(summary.latestAttempt.createdAt) : null;
  const startDate = solvedAt ? new Date(solvedAt.getTime() - 25 * 60 * 1000) : null;
  const endDate = solvedAt ? new Date(solvedAt.getTime() + 24 * 60 * 60 * 1000) : null;
  const formatDate = (date: Date | null) => date ? date.toLocaleString("uz-UZ", { hour12: false }) : "Hali boshlanmagan";

  async function startCamera() {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Brauzer kamera ruxsatini qo'llab-quvvatlamaydi.");
      return;
    }
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      setCameraActive(true);
      setFaceVerified(false);
      setFaceInFrame(null);
      setCapturedAt(null);
    } catch {
      setCameraError("Kameraga ruxsat berilmadi yoki kamera topilmadi.");
    }
  }

  function captureFace() {
    if (!cameraActive || faceInFrame === false) return;
    setCapturedAt(new Date().toLocaleString("uz-UZ", { hour12: false }));
    setFaceVerified(true);
    setCameraError("");
  }

  function analyzeFacePositionFallback(video: HTMLVideoElement) {
    const canvas = detectionCanvasRef.current ?? document.createElement("canvas");
    detectionCanvasRef.current = canvas;
    const width = 160;
    const height = 100;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(video, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    let totalMass = 0;
    let ovalMass = 0;
    let weightedX = 0;
    let weightedY = 0;

    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const index = (y * width + x) * 4;
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
        const maxChannel = Math.max(red, green, blue);
        const minChannel = Math.min(red, green, blue);
        const isSkinLike = red > 62 && green > 34 && blue > 18 && red > blue * 1.08 && maxChannel - minChannel > 14;
        const isHairOrFaceShadow = luminance < 92 && maxChannel - minChannel > 8;
        if (!isSkinLike && !isHairOrFaceShadow) continue;

        const nx = x / width;
        const ny = y / height;
        const inOval = (((nx - 0.5) / 0.2) ** 2) + (((ny - 0.47) / 0.36) ** 2) <= 1;
        const weight = isSkinLike ? 1.25 : 1;
        totalMass += weight;
        weightedX += nx * weight;
        weightedY += ny * weight;
        if (inOval) ovalMass += weight;
      }
    }

    if (totalMass < 85) return null;
    const centerX = weightedX / totalMass;
    const centerY = weightedY / totalMass;
    const ovalShare = ovalMass / totalMass;
    const centered = centerX > 0.36 && centerX < 0.64 && centerY > 0.18 && centerY < 0.76;
    if (centered && ovalShare > 0.38) return true;
    if (ovalShare < 0.25 || centerX < 0.28 || centerX > 0.72 || centerY < 0.1 || centerY > 0.86) return false;
    return null;
  }

  function startFinalExam() {
    if (!faceVerified) return;
    onStart({
      count: 20,
      durationMinutes: 25,
      label: "Yakuniy imtihon",
      seed: `final-exam-${Date.now()}`,
      startedAt: new Date().toISOString(),
    });
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!cameraActive || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => {
      setCameraError("Kamera tasvirini ko'rsatib bo'lmadi. Brauzer ruxsatlarini tekshiring.");
    });
  }, [cameraActive]);

  useEffect(() => {
    if (!cameraActive || faceVerified || !videoRef.current) {
      setFaceInFrame(null);
      return;
    }

    let cancelled = false;
    const FaceDetectorCtor = (window as typeof window & { FaceDetector?: new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ boundingBox: DOMRectReadOnly }>> } }).FaceDetector;
    const detector = FaceDetectorCtor ? new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 1 }) : null;
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

      if (!detector) {
        setFaceInFrame(analyzeFacePositionFallback(video));
        return;
      }

      detector.detect(video)
        .then((faces) => {
          if (cancelled) return;
          const face = faces[0]?.boundingBox;
          if (!face) {
            setFaceInFrame(analyzeFacePositionFallback(video));
            return;
          }

          const centerX = (face.x + face.width / 2) / video.videoWidth;
          const centerY = (face.y + face.height / 2) / video.videoHeight;
          const widthRatio = face.width / video.videoWidth;
          const heightRatio = face.height / video.videoHeight;
          const centeredInOval = centerX > 0.34 && centerX < 0.66 && centerY > 0.18 && centerY < 0.76;
          const usefulSize = widthRatio > 0.08 && widthRatio < 0.62 && heightRatio > 0.12 && heightRatio < 0.86;
          setFaceInFrame(centeredInOval && usefulSize);
        })
        .catch(() => {
          if (!cancelled) setFaceInFrame(analyzeFacePositionFallback(video));
        });
    }, 650);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [cameraActive, faceVerified]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter" && cameraActive && !faceVerified) {
        event.preventDefault();
        captureFace();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cameraActive, faceVerified, faceInFrame]);

  return (
    <div className="page-shell final-exam-page">
      <section className="final-rules-banner">
        <ShieldAlert size={22} />
        <div>
          <h1>Tizim qoidalari va akkreditatsiya ma'lumoti</h1>
          <p>Yakuniy imtihonga shaxsiy kabinet egasi kirishi mumkin. Kamera orqali yuz tekshiruvi tasdiqlanmaguncha testni boshlash tugmasi ochilmaydi.</p>
        </div>
      </section>

      <section className="final-exam-grid">
        <article className="final-summary-card">
          <header className="final-score-hero">
            <div>
              <span>Oxirgi urinish statistikasi</span>
              <h2>Yakuniy imtihon</h2>
            </div>
            <strong>{accuracy || 0}%</strong>
            <small>{correctPreview}/{examTotal} to'g'ri javob</small>
          </header>

          <div className="final-score-stats">
            <article>
              <CheckCircle2 size={22} />
              <strong>{correctPreview}</strong>
              <span>To'g'ri javoblar</span>
            </article>
            <article>
              <X size={22} />
              <strong>{wrongPreview}</strong>
              <span>Noto'g'ri javoblar</span>
            </article>
            <article>
              <ListChecks size={22} />
              <strong>{examTotal}</strong>
              <span>Jami testlar</span>
            </article>
          </div>

          <div className="final-info-grid">
            <section>
              <h3>Vaqt ma'lumotlari</h3>
              <dl>
                <div><dt>Reja boshlanishi:</dt><dd>{formatDate(startDate)}</dd></div>
                <div><dt>Reja tugashi:</dt><dd>{formatDate(endDate)}</dd></div>
                <div><dt>Urinish boshlangan:</dt><dd>{formatDate(startDate)}</dd></div>
                <div><dt>Urinish tugagan:</dt><dd>{formatDate(solvedAt)}</dd></div>
              </dl>
            </section>
            <section>
              <h3>Sinxron holatlar</h3>
              <dl>
                <div><dt>Imtihon holati:</dt><dd><span className="final-status success">Faollashtirilgan</span></dd></div>
                <div><dt>Imtihon natijasi:</dt><dd><span className={`final-status ${passed ? "success" : "warning"}`}>{passed ? "O'tgan" : "Kutilmoqda"}</span></dd></div>
              </dl>
              <p>Ma'lumotlar avtomatik sinxronlashtiriladi. Batafsil ko'rish uchun savollar ustiga bosing.</p>
            </section>
          </div>

          <section className="final-question-results">
            <div>
              <h3>Savollar bo'yicha batafsil natijalar</h3>
              <span>Sinash uchun raqamga bosing</span>
            </div>
            <div className="final-question-grid">
              {Array.from({ length: examTotal }, (_, index) => {
                const isCorrect = index < correctPreview;
                const isWrong = answered > 0 && !isCorrect;
                return (
                  <button
                    aria-pressed={selectedResultIndex === index}
                    className={`${isWrong ? "wrong" : "correct"} ${selectedResultIndex === index ? "selected" : ""}`}
                    key={index}
                    onClick={() => setSelectedResultIndex(index)}
                    type="button"
                  >
                    <span>S-{index + 1}</span>
                    {isWrong ? <X size={17} /> : <CheckCircle2 size={17} />}
                  </button>
                );
              })}
            </div>
            <p className="final-question-detail">
              S-{selectedResultIndex + 1}: {answered > 0 && selectedResultIndex >= correctPreview
                ? "oldingi urinishda noto'g'ri deb belgilangan."
                : answered > 0
                  ? "oldingi urinishda to'g'ri deb belgilangan."
                  : "hali yakuniy urinish natijasi saqlanmagan."}
            </p>
          </section>
        </article>

        <aside className="final-camera-column">
          <section className="final-camera-card">
            <h2><Video size={18} /> Yuzni tekshirish paneli</h2>
            <div className={`final-camera-preview ${cameraActive ? "active" : ""} ${faceInFrame ? "face-in-frame" : ""} ${faceInFrame === false ? "face-out-frame" : ""} ${faceVerified ? "verified" : ""}`}>
              {cameraActive ? (
                <video ref={videoRef} muted playsInline />
              ) : (
                <div className="face-outline">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              )}
              <strong>{faceVerified ? "Yuz tasdiqlandi" : cameraActive ? "Kamera faol" : "Kamera nazorati so'ralmoqda"}</strong>
              <p>
                {faceVerified
                  ? `Tasdiqlash vaqti: ${capturedAt}`
                  : faceInFrame === false
                    ? "Yuzingizni oval markaziga yaqinroq joylashtiring."
                  : cameraActive
                    ? "Yuzingizni ramka ichida tuting va rasmga olish tugmasini bosing."
                    : "Davlat terminali xavfsizlik talablariga mos tarzda ishlash uchun real kamerangizni yoqing."}
              </p>
              {(cameraError || (faceInFrame === false ? "Yuzingizni oval markaziga yaqinroq joylashtiring." : "")) && (
                <em>{cameraError || "Yuzingizni oval markaziga yaqinroq joylashtiring."}</em>
              )}
              {!cameraActive && <button onClick={startCamera} type="button">Kamerani ishga tushirish</button>}
            </div>
          </section>

          <section className="final-guidance-card">
            <h2><Lightbulb size={18} /> Yo'riqnoma va maslahatlar</h2>
            <ul>
              <li>Yuzingizni belgilangan qolip doirasida tuting.</li>
              <li>Ko'zoynak yoki yuzni to'suvchi jismlarni yeching.</li>
              <li>Veb-kamerangizga to'g'rima-to'g'ri qarang.</li>
              <li>Rasmga olish uchun pastdagi tugma yoki Enter tugmasini bosing.</li>
            </ul>
          </section>

          <button className={`final-disabled-action ${cameraActive && !faceVerified && faceInFrame !== false ? "ready" : ""}`} disabled={!cameraActive || faceVerified || faceInFrame === false} onClick={captureFace} type="button">
            <Download size={18} />
            {faceVerified ? "Rasm olindi" : "Rasmga olish"}
            <span>Enter</span>
          </button>
          <button className={`final-disabled-action ${faceVerified ? "verified" : ""}`} disabled type="button">
            {faceVerified ? <CheckCircle2 size={18} /> : <ShieldAlert size={18} />}
            {faceVerified ? "Yuz tasdiqlandi" : "Yuz tasdiqlanmagan"}
          </button>
          <button className="final-start-button" disabled={!faceVerified} onClick={startFinalExam} type="button">
            <PlayCircle size={18} />
            Yakuniy imtihonni boshlash
          </button>
        </aside>
      </section>
    </div>
  );
}

function RatingPage({
  data,
  summary,
  recent,
}: {
  data: AppData;
  summary: ProgressSummary | null;
  recent: RecentProgressItem[];
}) {
  const answered = summary?.answered ?? 0;
  const accuracy = summary?.accuracy ?? 0;
  const attempts = summary?.attempts ?? 0;
  const latestScore = summary?.latestAttempt?.total
    ? Math.round((summary.latestAttempt.score / summary.latestAttempt.total) * 100)
    : 0;
  const learnerScore = Math.min(1000, Math.round(accuracy * 5 + attempts * 18 + Math.min(answered, data.counts.questions) * 0.7 + latestScore * 2));
  const leaderboard = [
    { name: "I. Muxtorov", score: learnerScore, accuracy, tests: attempts, trend: "+12", current: true },
    { name: "M. Karimov", score: 912, accuracy: 94, tests: 31, trend: "+8" },
    { name: "S. Akramova", score: 884, accuracy: 91, tests: 28, trend: "+6" },
    { name: "A. Jo'rayev", score: 846, accuracy: 88, tests: 25, trend: "+4" },
    { name: "D. Rasulova", score: 802, accuracy: 84, tests: 21, trend: "+3" },
  ].sort((left, right) => right.score - left.score);
  const currentRank = leaderboard.findIndex((item) => item.current) + 1;
  const recentAttempts = recent.filter((item) => item.type === "attempt").slice(0, 4);

  return (
    <div className="page-shell rating-page">
      <PageHeader
        eyebrow="Natijalar"
        title="Rayting"
        subtitle="Eng faol o'quvchilar, test natijalari va shaxsiy o'sish ko'rsatkichlari."
        actions={<button className="primary-button"><RefreshCcw size={16} /> Yangilash</button>}
      />

      <section className="rating-hero">
        <div>
          <span>Joriy o'rin</span>
          <h2>{currentRank || leaderboard.length}-o'rin</h2>
          <p>Rayting aniqlik, test urinishlari, savol qamrovi va oxirgi imtihon natijasidan hisoblanadi.</p>
        </div>
        <div className="rating-score-card">
          <Trophy size={28} />
          <strong>{learnerScore}</strong>
          <span>umumiy ball</span>
        </div>
      </section>

      <section className="rating-grid">
        <article className="rating-board">
          <div className="rating-section-head">
            <div>
              <h2>Top o'quvchilar</h2>
              <p>Bugungi umumiy jadval</p>
            </div>
            <span>{leaderboard.length} foydalanuvchi</span>
          </div>
          <div className="rating-list">
            {leaderboard.map((user, index) => (
              <div className={`rating-row ${user.current ? "current" : ""}`} key={user.name}>
                <strong className="rating-rank">{index + 1}</strong>
                <span className="rating-avatar">{user.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
                <div>
                  <h3>{user.name}</h3>
                  <p>{user.accuracy}% aniqlik · {user.tests} ta test</p>
                </div>
                <span className="rating-trend">{user.trend}</span>
                <strong className="rating-points">{user.score}</strong>
              </div>
            ))}
          </div>
        </article>

        <aside className="rating-side">
          <article>
            <span><Award size={18} /> Shaxsiy rekord</span>
            <strong>{latestScore}%</strong>
            <p>Oxirgi test natijasi</p>
          </article>
          <article>
            <span><CheckCircle2 size={18} /> Aniqlik</span>
            <strong>{accuracy}%</strong>
            <p>{summary?.correct ?? 0}/{answered || 0} to'g'ri javob</p>
          </article>
          <article>
            <span><ClipboardList size={18} /> Faollik</span>
            <strong>{attempts}</strong>
            <p>Jami test urinishlari</p>
          </article>
        </aside>
      </section>

      <section className="rating-history">
        <div className="rating-section-head">
          <div>
            <h2>Oxirgi natijalar</h2>
            <p>Raytingga ta'sir qilgan so'nggi testlar</p>
          </div>
        </div>
        {recentAttempts.length ? recentAttempts.map((item) => (
          <article key={`${item.type}-${item.id}`}>
            <span>{new Date(item.createdAt).toLocaleString("uz-UZ", { hour12: false })}</span>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
          </article>
        )) : (
          <div className="empty-state">Hali test urinishlari yo'q.</div>
        )}
      </section>
    </div>
  );
}

function AppealsPage({
  summary,
  recent,
}: {
  summary: ProgressSummary | null;
  recent: RecentProgressItem[];
}) {
  const [appealType, setAppealType] = useState("Savol bo'yicha");
  const [appealTypeOpen, setAppealTypeOpen] = useState(false);
  const appealTypeRef = useRef<HTMLDivElement | null>(null);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const latestAttempt = summary?.latestAttempt;
  const appealTypes = ["Savol bo'yicha", "Test natijasi", "Texnik muammo", "Taklif"];
  const appealRows = [
    { id: "A-1042", title: "Savol izohi tekshirildi", status: "Yopilgan", date: "2026-06-12" },
    { id: "A-1041", title: "Video material qayta yuklandi", status: "Jarayonda", date: "2026-06-10" },
    { id: "A-1038", title: "Yakuniy imtihon natijasi", status: "Ko'rib chiqildi", date: "2026-06-07" },
  ];

  function submitAppeal(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setSubmitted(true);
    setMessage("");
  }

  useEffect(() => {
    if (!appealTypeOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (appealTypeRef.current && !appealTypeRef.current.contains(event.target as Node)) {
        setAppealTypeOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAppealTypeOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [appealTypeOpen]);

  return (
    <div className="page-shell appeals-page">
      <PageHeader
        eyebrow="Yordam"
        title="Murojaat"
        subtitle="Savol, test natijasi yoki texnik holat bo'yicha murojaat yuboring va holatini kuzating."
      />

      <section className="appeals-grid">
        <form className="appeal-form" onSubmit={submitAppeal}>
          <div className="rating-section-head">
            <div>
              <h2>Yangi murojaat</h2>
              <p>Ma'lumotni aniq yozing, javob tezroq qaytadi.</p>
            </div>
            <MessageCircle size={20} />
          </div>
          <label>
            <span>Murojaat turi</span>
            <div className="appeal-select" ref={appealTypeRef}>
              <button
                aria-expanded={appealTypeOpen}
                className="appeal-select-trigger"
                onClick={() => setAppealTypeOpen((open) => !open)}
                type="button"
              >
                <span>{appealType}</span>
                <ChevronDown size={17} />
              </button>
              {appealTypeOpen && (
                <div className="appeal-select-menu" role="listbox">
                  {appealTypes.map((type) => (
                    <button
                      aria-selected={appealType === type}
                      className={appealType === type ? "active" : ""}
                      key={type}
                      onClick={() => {
                        setAppealType(type);
                        setAppealTypeOpen(false);
                      }}
                      role="option"
                      type="button"
                    >
                      {type}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </label>
          <label>
            <span>Murojaat matni</span>
            <textarea
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                setSubmitted(false);
              }}
              placeholder="Masalan: 12-savolda javob izohi tushunarsiz ko'rinyapti..."
              rows={7}
            />
          </label>
          <div className="appeal-context">
            <span>Oxirgi test: {latestAttempt ? `${latestAttempt.score}/${latestAttempt.total}` : "yo'q"}</span>
            <span>Faollik: {recent.length} yozuv</span>
          </div>
          {submitted && <p className="appeal-success">Murojaat qabul qilindi. Operator javobi shu sahifada ko'rinadi.</p>}
          <button className="primary-button" disabled={!message.trim()} type="submit">
            <FileText size={16} />
            Yuborish
          </button>
        </form>

        <aside className="appeal-status-panel">
          <article>
            <span><Bell size={18} /> Javob muddati</span>
            <strong>24 soat</strong>
            <p>O'quv savollari odatda bir ish kuni ichida ko'rib chiqiladi.</p>
          </article>
          <article>
            <span><ShieldAlert size={18} /> Imtihon murojaati</span>
            <strong>Ustuvor</strong>
            <p>Yakuniy imtihon natijasi bo'yicha murojaatlar alohida belgilanadi.</p>
          </article>
        </aside>
      </section>

      <section className="appeal-history">
        <div className="rating-section-head">
          <div>
            <h2>Murojaatlar tarixi</h2>
            <p>So'nggi holatlar va operator javoblari</p>
          </div>
        </div>
        {appealRows.map((row) => (
          <article key={row.id}>
            <span>{row.id}</span>
            <div>
              <strong>{row.title}</strong>
              <p>{row.date}</p>
            </div>
            <em>{row.status}</em>
          </article>
        ))}
      </section>
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
          <span className="metric-icon"><Gauge size={22} /></span>
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
  const initialMessage = question ? "Bu savolni tushuntirib bering" : "";
  const [message, setMessage] = useState(initialMessage);
  const [sessions, setSessions] = useState<AiChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? sessions[0];
  const messages = activeSession?.messages ?? [];
  const activeSessionLoading = loadingSessionId === activeSession?.id;
  const suggestions = [
    "Oxirgi xatolarimni tushuntir",
    "Yakuniy imtihonga reja tuz",
    "Yo'l belgilaridan mini test ber",
  ];

  useEffect(() => {
    let cancelled = false;
    setSessionsLoading(true);
    listAiSessions()
      .then((items) => {
        if (cancelled) return;
        setSessions(items);
        setActiveSessionId((current) => (items.some((session) => session.id === current) ? current : items[0]?.id || ""));
      })
      .catch(() => {
        if (cancelled) return;
        setSessions([]);
        setActiveSessionId("");
      })
      .finally(() => {
        if (!cancelled) setSessionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateSessionById(sessionId: string, updater: (session: AiChatSession) => AiChatSession) {
    setSessions((items) => items.map((session) => (session.id === sessionId ? updater(session) : session)));
  }

  async function startNewChat() {
    setMessage("");
    const session = await createAiSession({ title: question ? `Savol #${question.id}` : "Yangi suhbat", questionId: question?.id });
    setSessions((items) => [session, ...items.filter((item) => item.id !== session.id)]);
    setActiveSessionId(session.id);
  }

  async function deleteActiveChat() {
    if (!activeSession) return;
    const targetSessionId = activeSession.id;
    const previousSessions = sessions;
    const remainingSessions = sessions.filter((session) => session.id !== targetSessionId);
    setSessions(remainingSessions);
    setActiveSessionId(remainingSessions[0]?.id || "");
    setMessage("");
    try {
      await deleteAiSession(targetSessionId);
      if (remainingSessions.length === 0) {
        const nextSession = await createAiSession({ title: question ? `Savol #${question.id}` : "Yangi suhbat", questionId: question?.id });
        setSessions([nextSession]);
        setActiveSessionId(nextSession.id);
      }
    } catch {
      setSessions(previousSessions);
      setActiveSessionId(targetSessionId);
    }
  }

  async function send() {
    if (!message.trim() || activeSessionLoading || sessionsLoading) return;
    const current = message;
    let targetSession = activeSession;
    if (!targetSession) {
      targetSession = await createAiSession({ title: current.slice(0, 44) || "Yangi suhbat", questionId: question?.id });
      setSessions((items) => [targetSession!, ...items]);
      setActiveSessionId(targetSession.id);
    }
    const targetSessionId = targetSession.id;
    updateSessionById(targetSessionId, (session) => ({
      ...session,
      title: session.messages.length ? session.title : current.slice(0, 34),
      meta: "hozir",
      messages: [...session.messages, { role: "user", text: current }],
    }));
    setMessage("");
    setLoadingSessionId(targetSessionId);
    try {
      const reply = await askTutor({ message: current, questionId: question?.id ?? targetSession.questionId, mode: "tutor", sessionId: targetSessionId });
      if (reply.session) {
        updateSessionById(targetSessionId, () => reply.session!);
      } else {
        updateSessionById(targetSessionId, (session) => ({ ...session, messages: [...session.messages, { role: "assistant", text: reply.answer }] }));
      }
    } catch {
      updateSessionById(targetSessionId, (session) => ({ ...session, messages: [...session.messages, { role: "assistant", text: "AI tutor hozircha javob bera olmadi." }] }));
    } finally {
      setLoadingSessionId((sessionId) => (sessionId === targetSessionId ? null : sessionId));
    }
  }

  return (
    <aside className={`ai-panel ${embedded ? "embedded" : ""}`}>
      <div className="ai-shell">
        <aside className="ai-history-panel">
          <div className="ai-history-top">
            <span className="ai-brand-mark"><Bot size={18} /></span>
            <button className="ai-new-chat" onClick={() => void startNewChat()} type="button">
              <Plus size={16} />
              Yangi suhbat
            </button>
          </div>
          <div className="ai-history-list">
            {sessionsLoading && <div className="ai-history-empty">Chatlar yuklanmoqda...</div>}
            {!sessionsLoading && sessions.length === 0 && <div className="ai-history-empty">Hali suhbat yo'q.</div>}
            {sessions.map((session) => (
              <button
                className={session.id === activeSessionId ? "active" : ""}
                key={session.id}
                onClick={() => setActiveSessionId(session.id)}
                type="button"
              >
                <MessageCircle size={15} />
                <span>{session.title}</span>
                <small>{session.meta}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="ai-chat-area">
          <header className="ai-header">
            <div>
              <span className="tag"><Sparkles size={13} /> AI Tutor</span>
              <h2>AvtoLearn Copilot</h2>
            </div>
            <div className="ai-header-actions">
              <button className="icon-button" onClick={() => void startNewChat()} title="Yangi suhbat" type="button"><Plus size={18} /></button>
              <button className="icon-button" onClick={() => void deleteActiveChat()} title="Chatni o'chirish" type="button"><Trash2 size={18} /></button>
              {onClose && <button className="icon-button" onClick={onClose} type="button"><X size={18} /></button>}
            </div>
          </header>

          {question && <div className="ai-context"><PanelLeft size={16} /> #{question.id} {clean(question.title)}</div>}

          <div className="ai-messages">
            {messages.length === 0 && (
              <div className="ai-welcome">
                <span><Bot size={26} /></span>
                <h3>Bugun nimani aniqlashtiramiz?</h3>
                <div className="ai-suggestions">
                  {suggestions.map((suggestion) => (
                    <button key={suggestion} onClick={() => setMessage(suggestion)} type="button">{suggestion}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((item, index) => (
              <div key={`${item.role}-${index}`} className={`ai-message-row ${item.role}`}>
                <span className="ai-message-avatar">{item.role === "assistant" ? <Bot size={16} /> : "I"}</span>
                <div className={`bubble ${item.role}`}>
                  <p>{item.text}</p>
                </div>
              </div>
            ))}
            {activeSessionLoading && (
              <div className="ai-message-row assistant">
                <span className="ai-message-avatar"><Bot size={16} /></span>
                <div className="bubble assistant typing"><span /><span /><span /></div>
              </div>
            )}
          </div>

          <footer className="ai-composer">
            <div className="ai-input">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder="AI tutordan so'rang"
              />
              <div className="ai-compose-actions">
                <button className="icon-button" title="Biriktirish" type="button"><Paperclip size={17} /></button>
                <button className="ai-send-button" disabled={!message.trim() || activeSessionLoading || sessionsLoading} onClick={() => void send()} type="button">
                  <SendHorizontal size={18} />
                </button>
              </div>
            </div>
          </footer>
        </section>
      </div>
    </aside>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
