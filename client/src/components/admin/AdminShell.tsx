import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Activity,
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  ClipboardList,
  Database,
  FileText,
  Flag,
  Gauge,
  Layers3,
  Loader2,
  PenTool,
  Plus,
  RefreshCcw,
  Search,
  Shield,
  Sparkles,
  TrafficCone,
  TrendingUp,
  Trash2,
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

type AdminSection = "overview" | "users" | "reports" | CatalogResource;
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
}: {
  user: AuthUser;
  onBack: () => void;
  onCatalogChanged: () => void;
}) {
  const [section, setSection] = useState<AdminSection>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const canUsers = user.permissions.includes("admin:users");
  const canCatalog = user.permissions.includes("admin:catalog");
  const canReports = user.permissions.includes("admin:reports");

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
    setMobileNavOpen(false);
  };

  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar ${mobileNavOpen ? "open" : ""}`}>
        <div className="admin-brand">
          <span><Shield size={18} /></span>
          <div>
            <strong>AvtoLearn Admin</strong>
            <small>{user.roles.join(", ")}</small>
          </div>
        </div>
        <nav className="admin-nav">
          <button className={section === "overview" ? "active" : ""} onClick={() => openSection("overview")} type="button">
            <Gauge size={16} /> Overview
          </button>
          {canUsers && (
            <button className={section === "users" ? "active" : ""} onClick={() => openSection("users")} type="button">
              <Users size={16} /> Users
            </button>
          )}
          {canReports && (
            <button className={section === "reports" ? "active" : ""} onClick={() => openSection("reports")} type="button">
              <BarChart3 size={16} /> Reports
            </button>
          )}
          {canCatalog && (
            <div className="admin-nav-group">
              <span>Catalog</span>
              {resources.map((resource) => {
                const Icon = resource.icon;
                return (
                  <button
                    className={section === resource.section ? "active" : ""}
                    key={resource.section}
                    onClick={() => openSection(resource.section)}
                    type="button"
                  >
                    <Icon size={16} /> {resource.plural}
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
          <button className="admin-menu-button" onClick={() => setMobileNavOpen(true)} type="button">
            <ChevronRight size={18} /> Sections
          </button>
          <div>
            <span>Management console</span>
            <h1>{sectionTitle(section)}</h1>
          </div>
          <div className="admin-header-actions">
            <div className="admin-user-chip">
              <span>{initials(user.name)}</span>
              <div>
                <strong>{user.name}</strong>
                <small>{user.email}</small>
              </div>
            </div>
            <button className="ghost-button" onClick={onBack} type="button">
              <ArrowLeft size={16} /> Learner app
            </button>
          </div>
        </header>
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
  );
}

function sectionTitle(section: AdminSection) {
  if (section === "overview") return "Overview";
  if (section === "users") return "Users";
  if (section === "reports") return "Reports";
  return resourceMap.get(section)?.plural || "Catalog";
}

function AdminOverview({ user, onOpen }: { user: AuthUser; onOpen: (section: AdminSection) => void }) {
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
          <span>Production workspace</span>
          <h2>Manage content quality, learner access, and platform performance.</h2>
          <p>Use this console for day-to-day catalog updates, user operations, and learning analytics.</p>
        </div>
        <button disabled={!user.permissions.includes("admin:catalog")} onClick={() => onOpen("questions")} type="button">
          <Plus size={16} /> New question
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
                <small>{item.label}</small>
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
              <strong>{tile.label}</strong>
              <span>{tile.detail}</span>
              <ChevronRight size={16} />
            </button>
          );
        })}
      </div>

      <div className="admin-overview-bottom">
        <article className="admin-work-panel">
          <header>
            <div>
              <span>Catalog shortcuts</span>
              <h3>Most edited areas</h3>
            </div>
            <Database size={18} />
          </header>
          <div className="admin-shortcut-grid">
            {catalogShortcuts.map((resource) => {
              const Icon = resource.icon;
              return (
                <button key={resource.section} onClick={() => onOpen(resource.section)} type="button">
                  <Icon size={16} />
                  <span>{resource.plural}</span>
                  <ChevronRight size={14} />
                </button>
              );
            })}
          </div>
        </article>
        <article className="admin-work-panel">
          <header>
            <div>
              <span>System pulse</span>
              <h3>Operational health</h3>
            </div>
            <Activity size={18} />
          </header>
          <div className="admin-pulse-list">
            <div><span>Auth sessions</span><strong>Active</strong></div>
            <div><span>Catalog API</span><strong>Ready</strong></div>
            <div><span>AI tutor</span><strong>{report?.aiMessages ? "In use" : "Standby"}</strong></div>
          </div>
        </article>
      </div>
    </section>
  );
}

function UsersSection() {
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
          title={draft.id ? "Edit user" : "Create user"}
          saving={saving}
          onClose={() => setDraft(null)}
          onDelete={draft.id ? remove : undefined}
          onSave={save}
        >
          <AdminInput label="Name" value={draft.name || ""} onChange={(value) => setDraft({ ...draft, name: value })} required />
          <AdminInput label="Email" value={draft.email || ""} onChange={(value) => setDraft({ ...draft, email: value })} required />
          <AdminInput label={draft.id ? "New password" : "Password"} value={draft.password || ""} onChange={(value) => setDraft({ ...draft, password: value })} required={!draft.id} />
          <label className="admin-check-row">
            <input checked={normalizeActive(draft.active ?? true)} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} type="checkbox" />
            Active account
          </label>
          <div className="admin-field">
            <span>Roles</span>
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
          <p>Progress, attempts, saved questions, and AI usage.</p>
        </div>
        <div>
          <select value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)}>
            <option value="">All users</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name} - {user.email}</option>)}
          </select>
          <button className="ghost-button" onClick={load} type="button"><RefreshCcw size={16} /> Refresh</button>
        </div>
      </div>
      {error && <div className="admin-alert">{error}</div>}
      {loading ? <AdminLoading /> : (
        <>
          <div className="admin-kpi-grid">
            {kpis.map((item) => (
              <article className="admin-kpi" key={item.label}>
                <span>{item.label}</span>
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
          title={draft.id ? `Edit ${config.label}` : `Create ${config.label}`}
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
  return (
    <div className="admin-table-toolbar">
      <div>
        <h2>{title}</h2>
        <span>{count} records</span>
      </div>
      <label className="admin-search">
        <Search size={16} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search records" />
      </label>
      <button className="ghost-button" onClick={onRefresh} type="button"><RefreshCcw size={16} /> Refresh</button>
      <button className="primary-button" onClick={onCreate} type="button"><Plus size={16} /> New</button>
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
  return (
    <div className="admin-drawer-backdrop">
      <aside className="admin-drawer">
        <header>
          <div>
            <span>Editor</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
        </header>
        <div className="admin-drawer-body">{children}</div>
        <footer>
          {onDelete && <button className="danger-button" disabled={saving} onClick={onDelete} type="button"><Trash2 size={16} /> Delete</button>}
          <button className="ghost-button" disabled={saving} onClick={onClose} type="button">Cancel</button>
          <button className="primary-button" disabled={saving} onClick={onSave} type="button">
            {saving ? <Loader2 className="spin" size={16} /> : <Check size={16} />} Save
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
  const value = item[field.key];
  if (field.type === "answers") {
    const answers = Array.isArray(value) ? value as { text: string; correct: boolean }[] : emptyQuestionAnswers;
    return (
      <div className="admin-field">
        <span>{field.label}</span>
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
                placeholder={`Answer ${index + 1}`}
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
            <Plus size={16} /> Add answer
          </button>
        </div>
      </div>
    );
  }
  if (field.type === "boolean") {
    return (
      <label className="admin-check-row">
        <input checked={Boolean(value)} onChange={(event) => setItem({ ...item, [field.key]: event.target.checked })} type="checkbox" />
        {field.label}
      </label>
    );
  }
  if (field.type === "textarea" || field.type === "string-list") {
    return (
      <label className="admin-field">
        <span>{field.label}{field.required ? " *" : ""}</span>
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
  return (
    <label className="admin-field">
      <span>{label}{required ? " *" : ""}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} />
    </label>
  );
}

function AdminLoading() {
  return (
    <div className="admin-loading">
      <Loader2 className="spin" size={20} /> Loading records
    </div>
  );
}

function AdminEmpty() {
  return (
    <div className="admin-empty">
      <FileText size={24} />
      <strong>No records found</strong>
      <span>Try a different search or create a new item.</span>
    </div>
  );
}
