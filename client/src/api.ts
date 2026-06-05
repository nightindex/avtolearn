import type { AppData, ProgressSummary, QuestionResponse, RecentProgressItem, TestTemplate } from "./types";

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
}): Promise<QuestionResponse> {
  const search = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.query) search.set("query", params.query);
  if (typeof params.hasVideo === "boolean") search.set("hasVideo", String(params.hasVideo));
  if (params.templateId) search.set("templateId", String(params.templateId));
  const response = await fetch(`/api/questions?${search}`);
  if (!response.ok) throw new Error("Failed to load questions");
  return response.json();
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
