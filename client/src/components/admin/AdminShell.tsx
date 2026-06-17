import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Activity,
  BarChart3,
  Bookmark,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Database,
  FileText,
  Flag,
  Gauge,
  GraduationCap,
  Layers3,
  Loader2,
  LogOut,
  Moon,
  PenTool,
  Plus,
  RefreshCcw,
  Search,
  Shield,
  Sparkles,
  Sun,
  TrafficCone,
  TrendingUp,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  adminCreateCatalog,
  adminCreateUser,
  adminDeleteCatalog,
  adminDeleteUser,
  adminGetReport,
  adminListCatalog,
  adminListRoles,
  adminListUsers,
  adminUpdateCatalog,
  adminUpdateUser,
  type AuthUser,
} from "../../api";
import type { AdminReport, AdminRole, AdminUser, CatalogItem, CatalogResource } from "../../types";
import { LanguageSelector } from "../LanguageSelector";
import { AppLanguage, translateUi } from "../../utils/i18n";

export type AdminSection = "overview" | "users" | "reports" | CatalogResource;
type LearnerTarget = "home" | "profile" | "saved-tests" | "ai";
type FieldType = "text" | "number" | "textarea" | "boolean" | "roles" | "answers" | "string-list";

type FieldConfig = {
  key: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  placeholder?: string;
};

type ResourceConfig = {
  section: CatalogResource;
  label: string;
  plural: string;
  icon: typeof BookOpen;
  fields: FieldConfig[];
  columns: string[];
  searchKeys: string[];
};

const adminPermissions = ["admin:users", "admin:catalog", "admin:reports", "admin:rbac"];
const AdminTranslateContext = React.createContext<(value: string) => string>((value) => value);

const adminTranslations: Record<AppLanguage, Record<string, string>> = {
  uz: {
    Overview: "Umumiy ko'rinish",
    Users: "Foydalanuvchilar",
    Reports: "Hisobotlar",
    Catalog: "Katalog",
    Sections: "Bo'limlar",
    "Management console": "Boshqaruv paneli",
    "Learner app": "O'quvchi kabineti",
    "Back to learner": "O'quvchi sahifasiga o'tish",
    Account: "Hisob",
    "Profile and settings": "Profil va sozlamalar",
    "Saved tests": "Saqlangan testlar",
    "Review saved questions and templates.": "Saqlangan savollar va shablonlarni qayta ko'ring.",
    "AI help": "AI yordam",
    "Analyze hard questions with AI tutor.": "AI tutor bilan qiyin savollarni tahlil qiling.",
    Logout: "Chiqish",
    "Return to login page": "Login sahifasiga qaytish",
    Lessons: "Darslar",
    Lesson: "Dars",
    Topics: "Mavzular",
    Topic: "Mavzu",
    "Topic contents": "Mavzu kontentlari",
    "Topic content": "Mavzu kontenti",
    Questions: "Savollar",
    Question: "Savol",
    Templates: "Shablonlar",
    Template: "Shablon",
    "Road sign categories": "Yo'l belgisi toifalari",
    "Road sign category": "Yo'l belgisi toifasi",
    "Road signs": "Yo'l belgilari",
    "Road sign": "Yo'l belgisi",
    Penalties: "Jarimalar",
    Penalty: "Jarima",
    "Production workspace": "Ishchi boshqaruv muhiti",
    "Manage content quality, learner access, and platform performance.": "Kontent sifati, o'quvchi kirishi va platforma ishlashini boshqaring.",
    "Use this console for day-to-day catalog updates, user operations, and learning analytics.": "Bu panel katalog yangilash, foydalanuvchi amallari va ta'lim tahlillari uchun.",
    "New question": "Yangi savol",
    Answered: "Javoblar",
    Accuracy: "Aniqlik",
    "AI usage": "AI ishlatilishi",
    "Accounts and role access": "Akkauntlar va rollar",
    "Catalog CMS": "Katalog boshqaruvi",
    "Lessons, tests, signs, penalties": "Darslar, testlar, belgilar, jarimalar",
    "Progress and usage analytics": "Progress va foydalanish tahlili",
    "Catalog shortcuts": "Katalog yorliqlari",
    "Most edited areas": "Ko'p tahrirlanadigan bo'limlar",
    "System pulse": "Tizim holati",
    "Operational health": "Ishlash holati",
    "Auth sessions": "Sessiyalar",
    "Catalog API": "Katalog API",
    Active: "Faol",
    Ready: "Tayyor",
    "In use": "Ishlatilmoqda",
    Standby: "Kutish rejimi",
    "Edit user": "Foydalanuvchini tahrirlash",
    "Create user": "Foydalanuvchi yaratish",
    Name: "Ism",
    Password: "Parol",
    "New password": "Yangi parol",
    "Active account": "Faol akkaunt",
    Roles: "Rollar",
    "All users": "Barcha foydalanuvchilar",
    "Progress, attempts, saved questions, and AI usage.": "Progress, urinishlar, saqlangan savollar va AI ishlatilishi.",
    Attempts: "Urinishlar",
    Saved: "Saqlangan",
    "AI messages": "AI xabarlar",
    Refresh: "Yangilash",
    records: "yozuv",
    "Search records": "Yozuvlardan qidirish",
    New: "Yangi",
    Edit: "Tahrirlash",
    Create: "Yaratish",
    Editor: "Tahrirlash oynasi",
    Delete: "O'chirish",
    Cancel: "Bekor qilish",
    Save: "Saqlash",
    Answer: "Javob",
    "Add answer": "Javob qo'shish",
    "Loading records": "Yozuvlar yuklanmoqda",
    "No records found": "Yozuv topilmadi",
    "Try a different search or create a new item.": "Boshqa qidiruvni sinab ko'ring yoki yangi yozuv yarating.",
    Title: "Sarlavha",
    "Short name": "Qisqa nom",
    "Source lesson ID": "Manba dars ID",
    "Topic count": "Mavzular soni",
    "Lesson ID": "Dars ID",
    Type: "Turi",
    "Question count": "Savollar soni",
    "Time limit": "Vaqt limiti",
    "Topic ID": "Mavzu ID",
    Content: "Kontent",
    "Question title": "Savol matni",
    "Image path": "Rasm yo'li",
    "Video path": "Video yo'li",
    Explanation: "Izoh",
    Answers: "Javoblar",
    "Duration minutes": "Davomiylik daqiqada",
    "Best percent": "Eng yaxshi foiz",
    Code: "Kod",
    Count: "Soni",
    "Category ID": "Toifa ID",
    Description: "Tavsif",
    "Preview images": "Ko'rinish rasmlari",
    "Audio path": "Audio yo'li",
    Article: "Modda",
    Amount: "Miqdor",
    Points: "Ballar",
  },
  "uz-cyrl": {},
  ru: {
    Overview: "Обзор",
    Users: "Пользователи",
    Reports: "Отчеты",
    Catalog: "Каталог",
    Sections: "Разделы",
    "Management console": "Панель управления",
    "Learner app": "Кабинет ученика",
    "Back to learner": "Перейти к ученику",
    Account: "Аккаунт",
    "Profile and settings": "Профиль и настройки",
    "Saved tests": "Сохраненные тесты",
    "Review saved questions and templates.": "Просмотрите сохраненные вопросы и шаблоны.",
    "AI help": "AI помощь",
    "Analyze hard questions with AI tutor.": "Разбирайте сложные вопросы с AI tutor.",
    Logout: "Выйти",
    "Return to login page": "Вернуться на страницу входа",
    Lessons: "Уроки",
    Lesson: "Урок",
    Topics: "Темы",
    Topic: "Тема",
    "Topic contents": "Контент тем",
    "Topic content": "Контент темы",
    Questions: "Вопросы",
    Question: "Вопрос",
    Templates: "Шаблоны",
    Template: "Шаблон",
    "Road sign categories": "Категории знаков",
    "Road sign category": "Категория знаков",
    "Road signs": "Дорожные знаки",
    "Road sign": "Дорожный знак",
    Penalties: "Штрафы",
    Penalty: "Штраф",
    "Production workspace": "Рабочая среда",
    "Manage content quality, learner access, and platform performance.": "Управляйте качеством контента, доступом учеников и производительностью платформы.",
    "Use this console for day-to-day catalog updates, user operations, and learning analytics.": "Используйте эту панель для обновления каталога, работы с пользователями и аналитики.",
    "New question": "Новый вопрос",
    Answered: "Ответы",
    Accuracy: "Точность",
    "AI usage": "Использование AI",
    "Accounts and role access": "Аккаунты и роли",
    "Catalog CMS": "Управление каталогом",
    "Lessons, tests, signs, penalties": "Уроки, тесты, знаки, штрафы",
    "Progress and usage analytics": "Аналитика прогресса и использования",
    "Catalog shortcuts": "Быстрый каталог",
    "Most edited areas": "Часто редактируемые разделы",
    "System pulse": "Состояние системы",
    "Operational health": "Рабочий статус",
    "Auth sessions": "Сессии",
    "Catalog API": "API каталога",
    Active: "Активно",
    Ready: "Готово",
    "In use": "Используется",
    Standby: "Ожидание",
    "Edit user": "Редактировать пользователя",
    "Create user": "Создать пользователя",
    Name: "Имя",
    Password: "Пароль",
    "New password": "Новый пароль",
    "Active account": "Активный аккаунт",
    Roles: "Роли",
    "All users": "Все пользователи",
    "Progress, attempts, saved questions, and AI usage.": "Прогресс, попытки, сохраненные вопросы и использование AI.",
    Attempts: "Попытки",
    Saved: "Сохранено",
    "AI messages": "AI сообщения",
    Refresh: "Обновить",
    records: "записей",
    "Search records": "Поиск записей",
    New: "Новый",
    Edit: "Редактировать",
    Create: "Создать",
    Editor: "Редактор",
    Delete: "Удалить",
    Cancel: "Отмена",
    Save: "Сохранить",
    Answer: "Ответ",
    "Add answer": "Добавить ответ",
    "Loading records": "Загрузка записей",
    "No records found": "Записи не найдены",
    "Try a different search or create a new item.": "Попробуйте другой поиск или создайте новую запись.",
  },
};

adminTranslations["uz-cyrl"] = Object.fromEntries(
  Object.entries(adminTranslations.uz).map(([key, value]) => [key, translateUi(value, "uz-cyrl")]),
);

function useAdminT() {
  return React.useContext(AdminTranslateContext);
}

export function canUseAdmin(user: AuthUser | null) {
  return Boolean(user?.permissions?.some((permission) => adminPermissions.includes(permission)));
}

const resources: ResourceConfig[] = [
  {
    section: "lessons",
    label: "Lesson",
    plural: "Lessons",
    icon: BookOpen,
    fields: [
      { key: "title", label: "Title", required: true },
      { key: "shortName", label: "Short name", required: true },
      { key: "sourceLessonId", label: "Source lesson ID", type: "number" },
      { key: "topicCount", label: "Topic count", type: "number" },
    ],
    columns: ["id", "title", "shortName", "topicCount"],
    searchKeys: ["title", "shortName"],
  },
  {
    section: "topics",
    label: "Topic",
    plural: "Topics",
    icon: Layers3,
    fields: [
      { key: "lessonId", label: "Lesson ID", type: "number" },
      { key: "title", label: "Title", required: true },
      { key: "type", label: "Type", type: "number" },
      { key: "questionCount", label: "Question count", type: "number" },
      { key: "timeLimit", label: "Time limit", type: "number" },
    ],
    columns: ["id", "lessonId", "title", "type", "questionCount"],
    searchKeys: ["title", "lessonId"],
  },
  {
    section: "topic-contents",
    label: "Topic content",
    plural: "Topic contents",
    icon: FileText,
    fields: [
      { key: "topicId", label: "Topic ID", type: "number", required: true },
      { key: "type", label: "Type", type: "number" },
      { key: "content", label: "Content", type: "textarea", required: true },
    ],
    columns: ["id", "topicId", "type", "content"],
    searchKeys: ["content", "topicId"],
  },
  {
    section: "questions",
    label: "Question",
    plural: "Questions",
    icon: ClipboardList,
    fields: [
      { key: "title", label: "Question title", type: "textarea", required: true },
      { key: "image", label: "Image path" },
      { key: "video", label: "Video path" },
      { key: "explanation", label: "Explanation", type: "textarea" },
      { key: "answers", label: "Answers", type: "answers", required: true },
    ],
    columns: ["id", "title", "image", "video"],
    searchKeys: ["title", "explanation"],
  },
  {
    section: "templates",
    label: "Template",
    plural: "Templates",
    icon: Gauge,
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "questions", label: "Question count", type: "number" },
      { key: "durationMinutes", label: "Duration minutes", type: "number" },
      { key: "bestPercent", label: "Best percent", type: "number" },
    ],
    columns: ["id", "name", "questions", "durationMinutes", "bestPercent"],
    searchKeys: ["name"],
  },
  {
    section: "road-sign-categories",
    label: "Road sign category",
    plural: "Road sign categories",
    icon: Flag,
    fields: [
      { key: "title", label: "Title", required: true },
      { key: "code", label: "Code", required: true },
      { key: "count", label: "Count", type: "number" },
      { key: "image", label: "Image path" },
    ],
    columns: ["id", "code", "title", "count"],
    searchKeys: ["title", "code"],
  },
  {
    section: "road-signs",
    label: "Road sign",
    plural: "Road signs",
    icon: TrafficCone,
    fields: [
      { key: "typeId", label: "Category ID", type: "number", required: true },
      { key: "code", label: "Code", required: true },
      { key: "title", label: "Title", required: true },
      { key: "image", label: "Image path" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "previewImages", label: "Preview images", type: "string-list", placeholder: "One path per line" },
      { key: "video", label: "Video path" },
      { key: "audio", label: "Audio path" },
    ],
    columns: ["id", "typeId", "code", "title"],
    searchKeys: ["title", "code", "description"],
  },
  {
    section: "penalties",
    label: "Penalty",
    plural: "Penalties",
    icon: PenTool,
    fields: [
      { key: "title", label: "Title", required: true },
      { key: "description", label: "Description", type: "textarea", required: true },
      { key: "article", label: "Article" },
      { key: "amount", label: "Amount" },
      { key: "bcv", label: "BCV" },
      { key: "points", label: "Points" },
    ],
    columns: ["id", "title", "article", "amount", "points"],
    searchKeys: ["title", "description", "article"],
  },
];

const resourceMap = new Map(resources.map((resource) => [resource.section, resource]));

const emptyQuestionAnswers = [
  { text: "", correct: true },
  { text: "", correct: false },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "A";
}

function formatValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function normalizeActive(value: AdminUser["active"]) {
  return value === true || value === 1;
}

function defaultCatalogItem(config: ResourceConfig): CatalogItem {
  const item: CatalogItem = {};
  for (const field of config.fields) {
    if (field.type === "number") item[field.key] = "";
    else if (field.type === "answers") item[field.key] = emptyQuestionAnswers;
    else if (field.type === "string-list") item[field.key] = [];
    else item[field.key] = "";
  }
  return item;
}

function sanitizeCatalogPayload(config: ResourceConfig, item: CatalogItem) {
  const payload: CatalogItem = {};
  for (const field of config.fields) {
    const value = item[field.key];
    if (field.type === "number") {
      payload[field.key] = value === "" || value === null || value === undefined ? undefined : Number(value);
    } else if (field.type === "string-list") {
      payload[field.key] = Array.isArray(value) ? value.filter(Boolean) : String(value || "").split("\n").map((part) => part.trim()).filter(Boolean);
    } else if (field.type === "answers") {
      payload[field.key] = Array.isArray(value) ? value : emptyQuestionAnswers;
    } else {
      payload[field.key] = value ?? "";
    }
  }
  return payload;
}

function validateCatalog(config: ResourceConfig, item: CatalogItem) {
  for (const field of config.fields) {
    if (!field.required) continue;
    const value = item[field.key];
    if (field.type === "answers") continue;
    if (value === undefined || value === null || String(value).trim() === "") {
      return `${field.label} is required.`;
    }
  }
  if (config.section === "questions") {
    const answers = Array.isArray(item.answers) ? item.answers as { text?: string; correct?: boolean }[] : [];
    if (answers.filter((answer) => String(answer.text || "").trim()).length < 2) return "Question needs at least two answers.";
    if (!answers.some((answer) => answer.correct && String(answer.text || "").trim())) return "Select at least one correct answer.";
  }
  return "";
}

export function AdminShell({
  user,
  onBack,
  onCatalogChanged,
  initialSection = "overview",
  onSectionChange,
  darkMode,
  language,
  setLanguage,
  toggleTheme,
  onNavigateLearner,
  onLogout,
}: {
  user: AuthUser;
  onBack: () => void;
  onCatalogChanged: () => void;
  initialSection?: AdminSection;
  onSectionChange?: (section: AdminSection) => void;
  darkMode: boolean;
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  toggleTheme: () => void;
  onNavigateLearner: (target: LearnerTarget) => void;
  onLogout: () => void;
}) {
  const [section, setSection] = useState<AdminSection>(initialSection);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [adminSearch, setAdminSearch] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const profileMenuRef = React.useRef<HTMLDivElement | null>(null);
  const canUsers = user.permissions.includes("admin:users");
  const canCatalog = user.permissions.includes("admin:catalog");
  const canReports = user.permissions.includes("admin:reports");

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (!profileOpen) return;
    const onClick = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [profileOpen]);

  if (!canUseAdmin(user)) {
    return (
      <div className="admin-forbidden">
        <Shield size={36} />
        <h1>Admin access required</h1>
        <p>This account does not have admin permissions.</p>
        <button className="primary-button" onClick={onBack} type="button">
          <ArrowLeft size={16} /> Back to learner
        </button>
      </div>
    );
  }

  const openSection = (next: AdminSection) => {
    setSection(next);
    onSectionChange?.(next);
    setMobileNavOpen(false);
  };
  const t = (value: string) => adminTranslations[language]?.[value] ?? translateUi(value, language);
  const goLearner = (target: LearnerTarget) => {
    setProfileOpen(false);
    onNavigateLearner(target);
  };

  return (
    <AdminTranslateContext.Provider value={t}>
    <div className="admin-shell">
      <aside className={`admin-sidebar ${mobileNavOpen ? "open" : ""}`}>
        <div className="admin-brand">
          <img src="/assets/static/Logo AvtoLearn.svg" alt="AvtoLearn" />
          <div>
            <strong>AVTOLEARN</strong>
            <small>ADMIN PANEL</small>
          </div>
        </div>
        <nav className="admin-nav">
          <button className={section === "overview" ? "active" : ""} onClick={() => openSection("overview")} type="button">
            <Gauge size={16} /> {t("Overview")}
          </button>
          {canUsers && (
            <button className={section === "users" ? "active" : ""} onClick={() => openSection("users")} type="button">
              <Users size={16} /> {t("Users")}
            </button>
          )}
          {canReports && (
            <button className={section === "reports" ? "active" : ""} onClick={() => openSection("reports")} type="button">
              <BarChart3 size={16} /> {t("Reports")}
            </button>
          )}
          {canCatalog && (
            <div className="admin-nav-group">
              <span>{t("Catalog")}</span>
              {resources.map((resource) => {
                const Icon = resource.icon;
                return (
                  <button
                    className={section === resource.section ? "active" : ""}
                    key={resource.section}
                    onClick={() => openSection(resource.section)}
                    type="button"
                  >
                    <Icon size={16} /> {t(resource.plural)}
                  </button>
                );
              })}
            </div>
          )}
        </nav>
      </aside>
      {mobileNavOpen && <button className="admin-mobile-scrim" onClick={() => setMobileNavOpen(false)} type="button" aria-label="Close menu" />}
      <main className="admin-main">
        <header className="admin-header">
          <div className="admin-header-search-row">
            <button className="admin-menu-button" onClick={() => setMobileNavOpen(true)} type="button">
              <ChevronRight size={18} /> {t("Sections")}
            </button>
            <label className="admin-global-search">
              <Search size={18} />
              <input
                value={adminSearch}
                onChange={(event) => setAdminSearch(event.target.value)}
                placeholder={t("Qidiruv...")}
              />
              <kbd>Ctrl K</kbd>
            </label>
          </div>
          <div className="admin-header-actions">
            <LanguageSelector language={language} setLanguage={setLanguage} variant="topbar" />
            <button
              aria-pressed={darkMode}
              className={`icon-button admin-theme-toggle ${darkMode ? "active" : ""}`}
              onClick={toggleTheme}
              title={t(darkMode ? "Kunduzgi rejim" : "Tungi rejim")}
              type="button"
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="workspace-switcher admin-learner-switcher" onClick={() => goLearner("home")} type="button">
              <GraduationCap size={16} />
              <span>{t("Learner app")}</span>
            </button>
            <div className="admin-profile-menu" ref={profileMenuRef}>
              <button
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                className={`profile admin-profile-trigger ${profileOpen ? "active" : ""}`}
                onClick={() => setProfileOpen((open) => !open)}
                type="button"
              >
                <span className="avatar">{initials(user.name)}</span>
                <span className="profile-trigger-name">{user.name}</span>
                <ChevronDown className="profile-trigger-chevron" size={15} />
              </button>
              {profileOpen && (
                <div className="topbar-dropdown profile-dropdown admin-profile-dropdown" role="menu">
                  <div className="profile-dropdown-summary">
                    <span className="profile-dropdown-avatar">{initials(user.name)}</span>
                    <div>
                      <strong>{user.name}</strong>
                      <span>{user.email}</span>
                      <small>{user.roles.join(", ")}</small>
                    </div>
                  </div>
                  <div className="profile-dropdown-actions">
                    <button className="profile-menu-button" onClick={() => goLearner("profile")} role="menuitem" type="button">
                      <UserRound size={16} />
                      <span className="profile-menu-copy">
                        <strong>{t("Account")}</strong>
                        <small>{t("Profile and settings")}</small>
                      </span>
                    </button>
                    <button className="profile-menu-button" onClick={() => goLearner("saved-tests")} role="menuitem" type="button">
                      <Bookmark size={16} />
                      <span className="profile-menu-copy">
                        <strong>{t("Saved tests")}</strong>
                        <small>{t("Review saved questions and templates.")}</small>
                      </span>
                    </button>
                    <button className="profile-menu-button" onClick={() => goLearner("ai")} role="menuitem" type="button">
                      <Bot size={16} />
                      <span className="profile-menu-copy">
                        <strong>{t("AI help")}</strong>
                        <small>{t("Analyze hard questions with AI tutor.")}</small>
                      </span>
                    </button>
                  </div>
                  <div className="profile-dropdown-footer">
                    <button className="profile-menu-button logout" onClick={() => { setProfileOpen(false); onLogout(); }} role="menuitem" type="button">
                      <LogOut size={16} />
                      <span className="profile-menu-copy">
                        <strong>{t("Logout")}</strong>
                        <small>{t("Return to login page")}</small>
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        <section className="admin-page-heading">
          <span>{t("Management console")}</span>
          <h1>{t(sectionTitle(section))}</h1>
        </section>
        {section === "overview" && <AdminOverview user={user} onOpen={openSection} />}
        {section === "users" && canUsers && <UsersSection />}
        {section === "reports" && canReports && <ReportsSection />}
        {resourceMap.has(section as CatalogResource) && canCatalog && (
          <CatalogSection
            config={resourceMap.get(section as CatalogResource)!}
            onCatalogChanged={onCatalogChanged}
          />
        )}
      </main>
    </div>
    </AdminTranslateContext.Provider>
  );
}

function sectionTitle(section: AdminSection) {
  if (section === "overview") return "Overview";
  if (section === "users") return "Users";
  if (section === "reports") return "Reports";
  return resourceMap.get(section)?.plural || "Catalog";
}

function AdminOverview({ user, onOpen }: { user: AuthUser; onOpen: (section: AdminSection) => void }) {
  const t = useAdminT();
  const [report, setReport] = useState<AdminReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminGetReport()
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, []);

  const accuracy = report?.progress?.answered ? Math.round(((report.progress.correct || 0) / report.progress.answered) * 100) : 0;
  const kpis = [
    { label: "Users", value: report?.users ?? 0, icon: Users, tone: "blue" },
    { label: "Answered", value: report?.progress?.answered ?? 0, icon: ClipboardList, tone: "cyan" },
    { label: "Accuracy", value: `${accuracy}%`, icon: TrendingUp, tone: "green" },
    { label: "AI usage", value: report?.aiMessages ?? 0, icon: Sparkles, tone: "violet" },
  ];
  const tiles = [
    { label: "Users", detail: "Accounts and role access", section: "users" as AdminSection, icon: Users, disabled: !user.permissions.includes("admin:users") },
    { label: "Catalog CMS", detail: "Lessons, tests, signs, penalties", section: "lessons" as AdminSection, icon: BookOpen, disabled: !user.permissions.includes("admin:catalog") },
    { label: "Reports", detail: "Progress and usage analytics", section: "reports" as AdminSection, icon: BarChart3, disabled: !user.permissions.includes("admin:reports") },
  ];
  const catalogShortcuts = resources.slice(0, 6);
  return (
    <section className="admin-overview">
      <div className="admin-overview-hero">
        <div>
          <span>{t("Production workspace")}</span>
          <h2>{t("Manage content quality, learner access, and platform performance.")}</h2>
          <p>{t("Use this console for day-to-day catalog updates, user operations, and learning analytics.")}</p>
        </div>
        <button disabled={!user.permissions.includes("admin:catalog")} onClick={() => onOpen("questions")} type="button">
          <Plus size={16} /> {t("New question")}
        </button>
      </div>

      <div className="admin-overview-kpis">
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <article className={`admin-overview-kpi ${item.tone}`} key={item.label}>
              <span><Icon size={17} /></span>
              <div>
                <strong>{loading ? "-" : item.value}</strong>
                <small>{t(item.label)}</small>
              </div>
            </article>
          );
        })}
      </div>

      <div className="admin-overview-grid">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <button disabled={tile.disabled} key={tile.label} onClick={() => onOpen(tile.section)} type="button">
              <Icon size={22} />
              <strong>{t(tile.label)}</strong>
              <span>{t(tile.detail)}</span>
              <ChevronRight size={16} />
            </button>
          );
        })}
      </div>

      <div className="admin-overview-bottom">
        <article className="admin-work-panel">
          <header>
            <div>
              <span>{t("Catalog shortcuts")}</span>
              <h3>{t("Most edited areas")}</h3>
            </div>
            <Database size={18} />
          </header>
          <div className="admin-shortcut-grid">
            {catalogShortcuts.map((resource) => {
              const Icon = resource.icon;
              return (
                <button key={resource.section} onClick={() => onOpen(resource.section)} type="button">
                  <Icon size={16} />
                  <span>{t(resource.plural)}</span>
                  <ChevronRight size={14} />
                </button>
              );
            })}
          </div>
        </article>
        <article className="admin-work-panel">
          <header>
            <div>
              <span>{t("System pulse")}</span>
              <h3>{t("Operational health")}</h3>
            </div>
            <Activity size={18} />
          </header>
          <div className="admin-pulse-list">
            <div><span>{t("Auth sessions")}</span><strong>{t("Active")}</strong></div>
            <div><span>{t("Catalog API")}</span><strong>{t("Ready")}</strong></div>
            <div><span>{t("AI tutor")}</span><strong>{t(report?.aiMessages ? "In use" : "Standby")}</strong></div>
          </div>
        </article>
      </div>
    </section>
  );
}

function UsersSection() {
  const t = useAdminT();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<(Partial<AdminUser> & { password?: string }) | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([adminListUsers(), adminListRoles()])
      .then(([nextUsers, nextRoles]) => {
        setUsers(nextUsers);
        setRoles(nextRoles);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Failed to load users"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((item) => [item.name, item.email, ...(item.roles || [])].join(" ").toLowerCase().includes(q));
  }, [query, users]);

  const save = async () => {
    if (!draft?.name || !draft.email) {
      setError("Name and email are required.");
      return;
    }
    if (!draft.id && !draft.password) {
      setError("Password is required for new users.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (draft.id) await adminUpdateUser(draft.id, draft);
      else await adminCreateUser({ ...draft, password: draft.password || "", roles: draft.roles || ["student"] });
      setDraft(null);
      load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save user");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft?.id) return;
    setSaving(true);
    setError("");
    try {
      await adminDeleteUser(draft.id);
      setDraft(null);
      load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admin-panel">
      <AdminTableToolbar
        title="Users"
        count={filtered.length}
        query={query}
        setQuery={setQuery}
        onCreate={() => setDraft({ name: "", email: "", password: "", active: true, roles: ["student"] })}
        onRefresh={load}
      />
      {error && <div className="admin-alert">{error}</div>}
      {loading ? <AdminLoading /> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>ID</th><th>Name</th><th>Email</th><th>Roles</th><th>Status</th></tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} onClick={() => setDraft({ ...item, active: normalizeActive(item.active), password: "" })}>
                  <td>{item.id}</td>
                  <td>{item.name}</td>
                  <td>{item.email}</td>
                  <td>{item.roles.join(", ")}</td>
                  <td><span className={`admin-status ${normalizeActive(item.active) ? "active" : "muted"}`}>{normalizeActive(item.active) ? "Active" : "Inactive"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <AdminEmpty />}
        </div>
      )}
      {draft && (
        <AdminDrawer
          title={draft.id ? t("Edit user") : t("Create user")}
          saving={saving}
          onClose={() => setDraft(null)}
          onDelete={draft.id ? remove : undefined}
          onSave={save}
        >
          <AdminInput label={t("Name")} value={draft.name || ""} onChange={(value) => setDraft({ ...draft, name: value })} required />
          <AdminInput label="Email" value={draft.email || ""} onChange={(value) => setDraft({ ...draft, email: value })} required />
          <AdminInput label={draft.id ? t("New password") : t("Password")} value={draft.password || ""} onChange={(value) => setDraft({ ...draft, password: value })} required={!draft.id} />
          <label className="admin-check-row">
            <input checked={normalizeActive(draft.active ?? true)} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} type="checkbox" />
            {t("Active account")}
          </label>
          <div className="admin-field">
            <span>{t("Roles")}</span>
            <div className="admin-role-grid">
              {roles.map((role) => (
                <label key={role.key}>
                  <input
                    checked={(draft.roles || []).includes(role.key)}
                    onChange={(event) => {
                      const current = draft.roles || [];
                      setDraft({
                        ...draft,
                        roles: event.target.checked ? [...current, role.key] : current.filter((item) => item !== role.key),
                      });
                    }}
                    type="checkbox"
                  />
                  {role.key}
                </label>
              ))}
            </div>
          </div>
        </AdminDrawer>
      )}
    </section>
  );
}

function ReportsSection() {
  const t = useAdminT();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [report, setReport] = useState<AdminReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([
      adminGetReport(selectedUser ? { userId: Number(selectedUser) } : undefined),
      adminListUsers().catch(() => [] as AdminUser[]),
    ])
      .then(([nextReport, nextUsers]) => {
        setReport(nextReport);
        setUsers(nextUsers);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Failed to load reports"))
      .finally(() => setLoading(false));
  }, [selectedUser]);

  useEffect(load, [load]);

  const accuracy = report?.progress?.answered ? Math.round(((report.progress.correct || 0) / report.progress.answered) * 100) : 0;
  const kpis = [
    { label: "Users", value: report?.users ?? 0 },
    { label: "Answered", value: report?.progress?.answered ?? 0 },
    { label: "Accuracy", value: `${accuracy}%` },
    { label: "Attempts", value: report?.attempts?.count ?? 0 },
    { label: "Saved", value: report?.savedQuestions ?? 0 },
    { label: "AI messages", value: report?.aiMessages ?? 0 },
  ];

  return (
    <section className="admin-panel">
      <div className="admin-report-toolbar">
        <div>
          <h2>Reports</h2>
          <p>{t("Progress, attempts, saved questions, and AI usage.")}</p>
        </div>
        <div>
          <select value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)}>
            <option value="">{t("All users")}</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name} - {user.email}</option>)}
          </select>
          <button className="ghost-button" onClick={load} type="button"><RefreshCcw size={16} /> {t("Refresh")}</button>
        </div>
      </div>
      {error && <div className="admin-alert">{error}</div>}
      {loading ? <AdminLoading /> : (
        <>
          <div className="admin-kpi-grid">
            {kpis.map((item) => (
              <article className="admin-kpi" key={item.label}>
                <span>{t(item.label)}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Mode / template</th><th>Attempts</th><th>Best percent</th></tr></thead>
              <tbody>
                {(report?.byTemplate || []).map((item) => (
                  <tr key={item.mode}>
                    <td>{item.mode}</td>
                    <td>{item.attempts}</td>
                    <td>{Math.round(item.bestPercent || 0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!report?.byTemplate?.length && <AdminEmpty />}
          </div>
        </>
      )}
    </section>
  );
}

function CatalogSection({ config, onCatalogChanged }: { config: ResourceConfig; onCatalogChanged: () => void }) {
  const t = useAdminT();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<CatalogItem | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    adminListCatalog(config.section)
      .then(setItems)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : `Failed to load ${config.plural}`))
      .finally(() => setLoading(false));
  }, [config]);

  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => config.searchKeys.some((key) => formatValue(item[key]).toLowerCase().includes(q)));
  }, [config.searchKeys, items, query]);

  const save = async () => {
    if (!draft) return;
    const validation = validateCatalog(config, draft);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = sanitizeCatalogPayload(config, draft);
      if (draft.id) await adminUpdateCatalog(config.section, draft.id, payload);
      else await adminCreateCatalog(config.section, payload);
      setDraft(null);
      onCatalogChanged();
      load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : `Failed to save ${config.label}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft?.id) return;
    setSaving(true);
    setError("");
    try {
      await adminDeleteCatalog(config.section, draft.id);
      setDraft(null);
      onCatalogChanged();
      load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : `Failed to delete ${config.label}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admin-panel">
      <AdminTableToolbar
        title={config.plural}
        count={filtered.length}
        query={query}
        setQuery={setQuery}
        onCreate={() => setDraft(defaultCatalogItem(config))}
        onRefresh={load}
      />
      {error && <div className="admin-alert">{error}</div>}
      {loading ? <AdminLoading /> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>{config.columns.map((column) => <th key={column}>{column}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={String(item.id)} onClick={() => setDraft({ ...defaultCatalogItem(config), ...item })}>
                  {config.columns.map((column) => <td key={column}>{formatValue(item[column])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <AdminEmpty />}
        </div>
      )}
      {draft && (
        <AdminDrawer
          title={draft.id ? `${t("Edit")} ${t(config.label)}` : `${t("Create")} ${t(config.label)}`}
          saving={saving}
          onClose={() => setDraft(null)}
          onDelete={draft.id ? remove : undefined}
          onSave={save}
        >
          {config.fields.map((field) => (
            <CatalogField
              field={field}
              item={draft}
              key={field.key}
              setItem={setDraft}
            />
          ))}
        </AdminDrawer>
      )}
    </section>
  );
}

function AdminTableToolbar({
  title,
  count,
  query,
  setQuery,
  onCreate,
  onRefresh,
}: {
  title: string;
  count: number;
  query: string;
  setQuery: (value: string) => void;
  onCreate: () => void;
  onRefresh: () => void;
}) {
  const t = useAdminT();
  return (
    <div className="admin-table-toolbar">
      <div>
        <h2>{t(title)}</h2>
        <span>{count} {t("records")}</span>
      </div>
      <label className="admin-search">
        <Search size={16} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search records")} />
      </label>
      <button className="ghost-button" onClick={onRefresh} type="button"><RefreshCcw size={16} /> {t("Refresh")}</button>
      <button className="primary-button" onClick={onCreate} type="button"><Plus size={16} /> {t("New")}</button>
    </div>
  );
}

function AdminDrawer({
  title,
  saving,
  children,
  onClose,
  onDelete,
  onSave,
}: {
  title: string;
  saving: boolean;
  children: React.ReactNode;
  onClose: () => void;
  onDelete?: () => void;
  onSave: () => void;
}) {
  const t = useAdminT();
  return (
    <div className="admin-drawer-backdrop" onMouseDown={onClose} role="presentation">
      <aside className="admin-drawer" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span>{t("Editor")}</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
        </header>
        <div className="admin-drawer-body">{children}</div>
        <footer>
          {onDelete && <button className="danger-button" disabled={saving} onClick={onDelete} type="button"><Trash2 size={16} /> {t("Delete")}</button>}
          <button className="ghost-button" disabled={saving} onClick={onClose} type="button">{t("Cancel")}</button>
          <button className="primary-button" disabled={saving} onClick={onSave} type="button">
            {saving ? <Loader2 className="spin" size={16} /> : <Check size={16} />} {t("Save")}
          </button>
        </footer>
      </aside>
    </div>
  );
}

function CatalogField({
  field,
  item,
  setItem,
}: {
  field: FieldConfig;
  item: CatalogItem;
  setItem: (item: CatalogItem) => void;
}) {
  const t = useAdminT();
  const value = item[field.key];
  if (field.type === "answers") {
    const answers = Array.isArray(value) ? value as { text: string; correct: boolean }[] : emptyQuestionAnswers;
    return (
      <div className="admin-field">
        <span>{t(field.label)}</span>
        <div className="admin-answer-list">
          {answers.map((answer, index) => (
            <div className="admin-answer-row" key={index}>
              <input
                checked={Boolean(answer.correct)}
                onChange={(event) => {
                  const next = answers.map((item, itemIndex) => itemIndex === index ? { ...item, correct: event.target.checked } : item);
                  setItem({ ...item, [field.key]: next });
                }}
                type="checkbox"
              />
              <input
                value={answer.text || ""}
                onChange={(event) => {
                  const next = answers.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item);
                  setItem({ ...item, [field.key]: next });
                }}
                placeholder={`${t("Answer")} ${index + 1}`}
              />
              <button
                className="icon-button"
                disabled={answers.length <= 2}
                onClick={() => setItem({ ...item, [field.key]: answers.filter((_, itemIndex) => itemIndex !== index) })}
                type="button"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button
            className="ghost-button"
            onClick={() => setItem({ ...item, [field.key]: [...answers, { text: "", correct: false }] })}
            type="button"
          >
            <Plus size={16} /> {t("Add answer")}
          </button>
        </div>
      </div>
    );
  }
  if (field.type === "boolean") {
    return (
      <label className="admin-check-row">
        <input checked={Boolean(value)} onChange={(event) => setItem({ ...item, [field.key]: event.target.checked })} type="checkbox" />
        {t(field.label)}
      </label>
    );
  }
  if (field.type === "textarea" || field.type === "string-list") {
    return (
      <label className="admin-field">
        <span>{t(field.label)}{field.required ? " *" : ""}</span>
        <textarea
          value={field.type === "string-list" && Array.isArray(value) ? value.join("\n") : String(value || "")}
          onChange={(event) => setItem({ ...item, [field.key]: event.target.value })}
          placeholder={field.placeholder}
        />
      </label>
    );
  }
  return (
    <AdminInput
      label={field.label}
      required={field.required}
      type={field.type === "number" ? "number" : "text"}
      value={String(value ?? "")}
      onChange={(next) => setItem({ ...item, [field.key]: next })}
      placeholder={field.placeholder}
    />
  );
}

function AdminInput({
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: "text" | "number";
  placeholder?: string;
}) {
  const t = useAdminT();
  return (
    <label className="admin-field">
      <span>{t(label)}{required ? " *" : ""}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} />
    </label>
  );
}

function AdminLoading() {
  const t = useAdminT();
  return (
    <div className="admin-loading">
      <Loader2 className="spin" size={20} /> {t("Loading records")}
    </div>
  );
}

function AdminEmpty() {
  const t = useAdminT();
  return (
    <div className="admin-empty">
      <FileText size={24} />
      <strong>{t("No records found")}</strong>
      <span>{t("Try a different search or create a new item.")}</span>
    </div>
  );
}
