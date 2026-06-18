import type {
  AdminPermission,
  AdminReport,
  AdminRole,
  AdminUser,
  AppData,
  CatalogItem,
  CatalogResource,
  ProgressSummary,
  QuestionResponse,
  RecentProgressItem,
  TestTemplate,
} from "./types";

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  avatarUrl?: string;
  avatarColor?: string;
  avatarSize?: number;
  roles: string[];
  permissions: string[];
};

export async function login(input: { email: string; password: string }): Promise<AuthUser> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("Email yoki parol noto'g'ri.");
  const payload = await response.json() as { user: AuthUser };
  return payload.user;
}

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const response = await fetch("/api/auth/me");
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Failed to load current user");
  const payload = await response.json() as { user: AuthUser };
  return payload.user;
}

export async function updateProfile(input: {
  name: string;
  email: string;
  password?: string;
  avatarUrl?: string;
  avatarColor?: string;
  avatarSize?: number;
}): Promise<AuthUser> {
  const response = await fetch("/api/auth/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "Profilni yangilab bo'lmadi.");
  }
  const payload = await response.json() as { user: AuthUser };
  return payload.user;
}

export async function getData(): Promise<AppData> {
  const response = await fetch("/api/data");
  if (!response.ok) throw new Error("Failed to load dashboard data");
  return response.json();
}

export async function getQuestions(params: {
  page: number;
  pageSize: number;
  query?: string;
  hasVideo?: boolean;
  templateId?: number;
  random?: boolean;
  seed?: string;
}): Promise<QuestionResponse> {
  const search = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.query) search.set("query", params.query);
  if (typeof params.hasVideo === "boolean") search.set("hasVideo", String(params.hasVideo));
  if (params.templateId) search.set("templateId", String(params.templateId));
  if (params.random) search.set("random", "true");
  if (params.seed) search.set("seed", params.seed);
  const response = await fetch(`/api/questions?${search}`);
  if (!response.ok) throw new Error("Failed to load questions");
  return response.json();
}

export async function getSavedQuestions(): Promise<QuestionResponse> {
  const response = await fetch("/api/questions/saved");
  if (!response.ok) throw new Error("Failed to load saved questions");
  return response.json();
}

export async function saveQuestion(input: { questionId: number; saved: boolean }) {
  const response = await fetch("/api/questions/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("Failed to save question");
}

export async function saveQuestionProgress(input: {
  questionId: number;
  answerId: number;
  correct: boolean;
}) {
  await fetch("/api/progress/question", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function saveTestAttempt(input: { mode: string; score: number; total: number }) {
  await fetch("/api/tests/attempt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function askTutor(input: { message: string; questionId?: number; mode?: string }) {
  const response = await fetch("/api/ai/tutor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("Tutor failed");
  return response.json() as Promise<{ answer: string; sources: { type: string; id: number }[] }>;
}

export async function getProgressSummary(): Promise<ProgressSummary> {
  const response = await fetch("/api/progress/summary");
  if (!response.ok) throw new Error("Failed to load progress summary");
  return response.json();
}

export async function getRecentProgress(): Promise<RecentProgressItem[]> {
  const response = await fetch("/api/progress/recent");
  if (!response.ok) throw new Error("Failed to load recent progress");
  return response.json();
}

export async function getTemplates(): Promise<TestTemplate[]> {
  const response = await fetch("/api/templates");
  if (!response.ok) throw new Error("Failed to load templates");
  return response.json();
}

export async function saveTemplate(input: { templateId: number; saved: boolean }) {
  const response = await fetch("/api/templates/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("Failed to save template");
}

async function adminJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "Admin request failed");
  }
  return response.json() as Promise<T>;
}

export async function adminListUsers(): Promise<AdminUser[]> {
  return adminJson<AdminUser[]>("/api/admin/users");
}

export async function adminCreateUser(input: Partial<AdminUser> & { password: string }): Promise<AdminUser> {
  return adminJson<AdminUser>("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function adminUpdateUser(id: number, input: Partial<AdminUser> & { password?: string }): Promise<AdminUser> {
  return adminJson<AdminUser>(`/api/admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function adminDeleteUser(id: number): Promise<void> {
  await adminJson<{ ok: boolean }>(`/api/admin/users/${id}`, { method: "DELETE" });
}

export async function adminListRoles(): Promise<AdminRole[]> {
  return adminJson<AdminRole[]>("/api/admin/roles");
}

export async function adminListPermissions(): Promise<AdminPermission[]> {
  return adminJson<AdminPermission[]>("/api/admin/permissions");
}

export async function adminGetReport(params?: { userId?: number }): Promise<AdminReport> {
  const search = new URLSearchParams();
  if (params?.userId) search.set("userId", String(params.userId));
  return adminJson<AdminReport>(`/api/admin/reports${search.size ? `?${search}` : ""}`);
}

export async function adminListCatalog(resource: CatalogResource): Promise<CatalogItem[]> {
  return adminJson<CatalogItem[]>(`/api/admin/catalog/${resource}`);
}

export async function adminCreateCatalog(resource: CatalogResource, input: CatalogItem): Promise<CatalogItem> {
  return adminJson<CatalogItem>(`/api/admin/catalog/${resource}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function adminUpdateCatalog(resource: CatalogResource, id: number, input: CatalogItem): Promise<CatalogItem> {
  return adminJson<CatalogItem>(`/api/admin/catalog/${resource}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function adminDeleteCatalog(resource: CatalogResource, id: number): Promise<void> {
  await adminJson<{ ok: boolean }>(`/api/admin/catalog/${resource}/${id}`, { method: "DELETE" });
}
