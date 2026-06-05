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
  previewImages?: string[];
  video?: string;
  audio?: string;
};

export type AppData = {
  brand: Brand;
  lessons: Lesson[];
  topics: Topic[];
  tests: TestTemplate[];
  signs: Sign[];
  roadSigns: RoadSignItem[];
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
