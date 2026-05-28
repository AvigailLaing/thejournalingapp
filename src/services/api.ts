import { Entry, Task, ContentIdea } from "../services/ai";

export const fetchEntries = async (): Promise<{ date: string; word_count: number }[]> => {
  try {
    const res = await fetch("/api/entries");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("Failed to fetch entries:", e);
    return [];
  }
};

export const fetchEntry = async (date: string): Promise<Entry | null> => {
  try {
    const res = await fetch(`/api/entries/${date}`);
    const data = await res.json();
    if (data && !data.error) {
      if (typeof data.tasks === 'string') {
        data.tasks = JSON.parse(data.tasks);
      }
      if (typeof data.content_ideas === 'string') {
        data.content_ideas = JSON.parse(data.content_ideas);
      }
      return data;
    }
    return null;
  } catch (e) {
    console.error("Failed to fetch entry:", e);
    return null;
  }
};

export const saveEntry = async (entry: Partial<Entry>) => {
  const res = await fetch("/api/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  return res.json();
};

export const deleteEntry = async (date: string) => {
  const res = await fetch(`/api/entries/${date}`, { method: "DELETE" });
  return res.json();
};

export const updateTasks = async (date: string, tasks: Task[]) => {
  const res = await fetch(`/api/entries/${date}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tasks }),
  });
  return res.json();
};

export const updateIdeas = async (date: string, ideas: ContentIdea[]) => {
  const res = await fetch(`/api/entries/${date}/ideas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ideas }),
  });
  return res.json();
};

export const fetchBookmarkedIdeas = async (): Promise<ContentIdea[]> => {
  try {
    const res = await fetch("/api/ideas/bookmarked");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("Failed to fetch bookmarked ideas:", e);
    return [];
  }
};

export const updateIdea = async (entryDate: string, ideaId: string, updates: Partial<ContentIdea>) => {
  const res = await fetch(`/api/entries/${entryDate}/ideas/${ideaId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  return res.json();
};

// --- Task Context ---

export const uploadTaskContext = async (
  taskId: string,
  entryDate: string,
  contextText: string,
  pdfFile?: File
): Promise<{ success: boolean; context: string }> => {
  const formData = new FormData();
  formData.append("entry_date", entryDate);
  formData.append("context_text", contextText);
  if (pdfFile) {
    formData.append("pdf", pdfFile);
  }
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/context`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to upload context");
  }
  return res.json();
};

export const fetchTaskContext = async (taskId: string, entryDate: string) => {
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/context?entry_date=${encodeURIComponent(entryDate)}`);
  return res.json();
};

// --- Recurring Templates ---

export interface RecurringTemplate {
  id: number;
  name: string;
  instructions: string | null;
  pdf_text: string | null;
  pdf_filename: string | null;
  created_at: string;
  updated_at: string;
}

export const fetchTemplates = async (): Promise<RecurringTemplate[]> => {
  try {
    const res = await fetch("/api/templates");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("Failed to fetch templates:", e);
    return [];
  }
};

export const createTemplate = async (
  name: string,
  instructions: string,
  pdfFile?: File
): Promise<RecurringTemplate> => {
  const formData = new FormData();
  formData.append("name", name);
  formData.append("instructions", instructions);
  if (pdfFile) {
    formData.append("pdf", pdfFile);
  }
  const res = await fetch("/api/templates", { method: "POST", body: formData });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create template");
  }
  return res.json();
};

export const updateTemplate = async (
  id: number,
  name: string,
  instructions: string,
  pdfFile?: File,
  clearPdf?: boolean
): Promise<RecurringTemplate> => {
  const formData = new FormData();
  formData.append("name", name);
  formData.append("instructions", instructions);
  if (pdfFile) formData.append("pdf", pdfFile);
  if (clearPdf) formData.append("clear_pdf", "true");
  const res = await fetch(`/api/templates/${id}`, { method: "PUT", body: formData });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to update template");
  }
  return res.json();
};

export const deleteTemplate = async (id: number) => {
  const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
  return res.json();
};

// --- User Insights ---

export interface UserInsight {
  id: number;
  text: string;
  source: 'journal' | 'manual' | 'onboarding';
  created_at: string;
}

export const fetchInsights = async (): Promise<UserInsight[]> => {
  try {
    const res = await fetch("/api/insights");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("Failed to fetch insights:", e);
    return [];
  }
};

export const addInsight = async (text: string, source: string = 'manual'): Promise<UserInsight | null> => {
  const res = await fetch("/api/insights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, source }),
  });
  const data = await res.json();
  if (data.duplicate) return null;
  return data;
};

export const addInsightsBulk = async (insights: { text: string; source: string }[]): Promise<UserInsight[]> => {
  const res = await fetch("/api/insights/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ insights }),
  });
  const data = await res.json();
  return data.added || [];
};

export const deleteInsight = async (id: number) => {
  await fetch(`/api/insights/${id}`, { method: "DELETE" });
};

// --- Insight Candidates ---

export interface InsightCandidate {
  id: number;
  text: string;
  mention_count: number;
  first_seen: string;
  last_seen: string;
}

export const fetchInsightCandidates = async (): Promise<InsightCandidate[]> => {
  try {
    const res = await fetch("/api/insights/candidates");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("Failed to fetch candidates:", e);
    return [];
  }
};

export const addInsightCandidatesBulk = async (
  insights: { text: string }[]
): Promise<{ promoted: UserInsight[]; candidates: InsightCandidate[] }> => {
  const res = await fetch("/api/insights/candidates/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ insights }),
  });
  const data = await res.json();
  return { promoted: data.promoted || [], candidates: data.candidates || [] };
};

export const promoteInsightCandidate = async (id: number): Promise<UserInsight | null> => {
  const res = await fetch(`/api/insights/candidates/${id}/promote`, { method: "POST" });
  const data = await res.json();
  return data.insight || null;
};

export const deleteInsightCandidate = async (id: number) => {
  await fetch(`/api/insights/candidates/${id}`, { method: "DELETE" });
};

// --- Recent entries (for AI continuity) ---

export interface RecentEntry {
  date: string;
  content: string;
}

export const fetchRecentEntries = async (
  days: number = 7,
  excludeDate: string = ""
): Promise<RecentEntry[]> => {
  try {
    const params = new URLSearchParams({ days: String(days) });
    if (excludeDate) params.set("exclude", excludeDate);
    const res = await fetch(`/api/entries/recent/content?${params.toString()}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("Failed to fetch recent entries:", e);
    return [];
  }
};

export const fetchAcceptedTasks = async (): Promise<Task[]> => {
  try {
    const res = await fetch("/api/tasks/accepted");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("Failed to fetch accepted tasks:", e);
    return [];
  }
};
