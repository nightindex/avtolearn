export type Brand = {
  name: string;
  subtitle: string;
  logo: string;
  hero: string;
};

export type Lesson = {
  id: number;
  sourceLessonId?: number;
  title: string;
  shortName: string;
  topicCount?: number;
};

export type Topic = {
  id: number;
  lessonId?: number;
  title: string;
  type: number;
  questionCount: number;
  timeLimit?: number;
  contents?: TopicContent[];
};

export type TopicContent = {
  id: number;
  type: number;
  content: string;
};

export type Answer = {
  id: number;
  text: string;
  correct: boolean;
};

export type Question = {
  id: number;
  title: string;
  image: string;
  video: string;
  answers: Answer[];
  explanation: string;
};

export type TestTemplate = {
  id: number;
  name: string;
  questions: number;
  durationMinutes?: number;
  bestPercent: number;
  completed?: boolean;
  saved?: boolean;
  lastAttemptAt?: string | null;
};

export type Sign = {
  id: number;
  title: string;
  code: string;
  count: number;
  image: string;
};

export type RoadSignItem = {
  id: number;
  typeId: number;
  code: string;
  title: string;
  image: string;
  description?: string;
  previewImages?: string[];
  video?: string;
  audio?: string;
};

export type Penalty = {
  id: number;
  title: string;
  description: string;
  article: string;
  amount: string;
  bcv: string;
  points: string;
};

export type PenaltyInfo = {
  sourceUrl: string;
  updatedLabel: string;
  bcvLabel: string;
  summary: string;
  pointsSummary: string;
  pointsRules: string[];
};

export type AppData = {
  brand: Brand;
  lessons: Lesson[];
  topics: Topic[];
  tests: TestTemplate[];
  signs: Sign[];
  roadSigns: RoadSignItem[];
  penalties?: Penalty[];
  penaltyInfo?: PenaltyInfo;
  counts: {
    questions: number;
    images: number;
    videos: number;
  };
};

export type QuestionResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  data: Question[];
};

export type ProgressSummary = {
  answered: number;
  correct: number;
  accuracy: number;
  attempts: number;
  saved: number;
  aiMessages: number;
  latestAttempt: {
    mode: string;
    score: number;
    total: number;
    createdAt: string;
  } | null;
};

export type RecentProgressItem = {
  type: "question" | "attempt";
  id: number;
  title: string;
  detail: string;
  createdAt: string;
  correct?: boolean;
};

export type AdminRole = {
  id: number;
  key: string;
  name: string;
};

export type AdminPermission = {
  id: number;
  key: string;
  description: string;
};

export type AdminUser = {
  id: number;
  email: string;
  name: string;
  active: number | boolean;
  roles: string[];
  permissions?: string[];
  created_at?: string;
  updated_at?: string;
};

export type AdminReport = {
  users: number;
  progress: {
    answered: number;
    correct: number;
  };
  attempts: {
    count: number;
    averagePercent: number | null;
  };
  savedQuestions: number;
  aiMessages: number;
  byTemplate: {
    mode: string;
    attempts: number;
    bestPercent: number | null;
  }[];
};

export type CatalogResource =
  | "lessons"
  | "topics"
  | "topic-contents"
  | "questions"
  | "templates"
  | "road-sign-categories"
  | "road-signs"
  | "penalties";

export type CatalogItem = Record<string, unknown> & {
  id?: number;
};
