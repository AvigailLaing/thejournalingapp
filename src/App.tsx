import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, X, Flame, Home, Settings, Lightbulb, Check, Plus, Trash2, Edit2, Upload, FileText, Loader2 } from 'lucide-react';
import { Editor } from './components/Editor';
import { TodoList } from './components/TodoList';
import { Calendar } from './components/Calendar';
import { Dashboard } from './components/Dashboard';
import { IdeasBoard } from './components/IdeasBoard';
import { fetchEntries, fetchEntry, updateTasks, saveEntry, deleteEntry, fetchBookmarkedIdeas, updateIdea, updateIdeas, uploadTaskContext, fetchTemplates, createTemplate, updateTemplate, deleteTemplate, RecurringTemplate, fetchInsights, addInsight, addInsightsBulk, deleteInsight, UserInsight, fetchRecentEntries, fetchInsightCandidates, addInsightCandidatesBulk, promoteInsightCandidate, deleteInsightCandidate, InsightCandidate } from './services/api';
import { Entry, Task, ContentIdea, generateAllMicroTasks, regenerateImpactAnalysis, generateSubtasks, generateSubtasksWithContext, extractInsightsFromJournal, regenerateCoachingAdvice } from './services/ai';
import { formatDate, calculateStreak, cn } from './lib/utils';

const ACCENT_COLORS = [
  { color: '#E91E90', name: 'Hot Pink' },
  { color: '#C47A8E', name: 'Dusty Rose' },
  { color: '#B85C5C', name: 'Warm Clay' },
  { color: '#6B8CAE', name: 'Slate Blue' },
  { color: '#6A9B7E', name: 'Sage' },
  { color: '#C4965A', name: 'Amber' },
  { color: '#8B7BB5', name: 'Lavender' },
];

const FONT_SIZES = [
  { value: 'sm', label: 'S', size: '1rem', lineHeight: '2rem' },
  { value: 'md', label: 'M', size: '1.25rem', lineHeight: '2.5rem' },
  { value: 'lg', label: 'L', size: '1.5rem', lineHeight: '3rem' },
];

const AI_HARSHNESS = [
  { value: 'gentle', label: 'Gentle', description: 'Supportive and encouraging' },
  { value: 'balanced', label: 'Balanced', description: 'Honest but kind' },
  { value: 'hype', label: 'Hype', description: 'Delusionally motivational' },
  { value: 'tough', label: 'Tough Love', description: 'Blunt and direct' },
  { value: 'brutal', label: 'Brutal', description: 'No sugarcoating, wake-up calls' },
];

const WRITING_FONTS = [
  { value: '"Instrument Serif", serif', label: 'Instrument', preview: 'Instrument Serif' },
  { value: '"Playfair Display", serif', label: 'Playfair', preview: 'Playfair Display' },
  { value: '"Lora", serif', label: 'Lora', preview: 'Lora' },
  { value: '"DM Sans", sans-serif', label: 'Sans', preview: 'DM Sans' },
  { value: '"JetBrains Mono", monospace', label: 'Mono', preview: 'JetBrains Mono' },
];

// Fuzzy match template to task — checks exact substring, word overlap, and common abbreviations
function findMatchingTemplate(taskText: string, templates: RecurringTemplate[]): RecurringTemplate | undefined {
  const taskLower = taskText.toLowerCase();

  // Common abbreviations/expansions
  const aliases: Record<string, string[]> = {
    'os': ['operating systems', 'operating system'],
    'cs': ['computer science', 'comp sci'],
    'ds': ['data structures'],
    'db': ['database', 'databases'],
    'ml': ['machine learning'],
    'ai': ['artificial intelligence'],
    'hw': ['homework'],
    'calc': ['calculus'],
    'stats': ['statistics'],
    'bio': ['biology'],
    'chem': ['chemistry'],
    'phys': ['physics'],
    'eng': ['english'],
    'econ': ['economics'],
    'psych': ['psychology'],
  };

  // Expand task text with aliases
  let expandedTask = taskLower;
  for (const [abbr, expansions] of Object.entries(aliases)) {
    for (const expansion of expansions) {
      if (taskLower.includes(expansion)) expandedTask += ` ${abbr}`;
      if (taskLower.includes(abbr)) expandedTask += ` ${expansion}`;
    }
  }

  return templates.find(t => {
    const nameLower = t.name.toLowerCase();
    // Expand template name too
    let expandedName = nameLower;
    for (const [abbr, expansions] of Object.entries(aliases)) {
      for (const expansion of expansions) {
        if (nameLower.includes(expansion)) expandedName += ` ${abbr}`;
        if (nameLower.includes(abbr)) expandedName += ` ${expansion}`;
      }
    }

    // Exact substring match
    if (expandedTask.includes(nameLower) || nameLower.includes(taskLower)) return true;

    // All significant words from template name found in expanded task
    const templateWords = expandedName.split(/\s+/).filter(w => w.length > 1);
    if (templateWords.length > 0 && templateWords.every(word => expandedTask.includes(word))) return true;

    // All significant words from task found in expanded template name
    const taskWords = expandedTask.split(/\s+/).filter(w => w.length > 2);
    const matchCount = taskWords.filter(word => expandedName.includes(word)).length;
    if (taskWords.length > 0 && matchCount / taskWords.length > 0.5) return true;

    return false;
  });
}

export default function App() {
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [currentEntry, setCurrentEntry] = useState<Entry | null>(null);
  const [allEntries, setAllEntries] = useState<{ date: string; word_count: number }[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);
  const [activeTab, setActiveTab] = useState<'write' | 'tasks'>('write');
  const [view, setView] = useState<'journal' | 'dashboard' | 'settings' | 'ideas'>('journal');
  const [streak, setStreak] = useState(0);

  const [accentColor, setAccentColor] = useState(localStorage.getItem('accentColor') || '#E91E90');
  const [allBookmarkedIdeas, setAllBookmarkedIdeas] = useState<ContentIdea[]>([]);
  const [writingFontSize, setWritingFontSize] = useState(localStorage.getItem('writingFontSize') || 'sm');
  const [showWritingLines, setShowWritingLines] = useState(localStorage.getItem('showWritingLines') !== 'false');
  const [writingFont, setWritingFont] = useState(localStorage.getItem('writingFont') || '"Instrument Serif", serif');
  const [aiHarshness, setAiHarshness] = useState(localStorage.getItem('aiHarshness') || 'balanced');
  const [userProfile, setUserProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem('userProfile') || '{}'); }
    catch { return {}; }
  });
  const [profileSaved, setProfileSaved] = useState(false);
  const [generatedHarshness, setGeneratedHarshness] = useState(aiHarshness);
  const [coachingCache, setCoachingCache] = useState<Record<string, string>>({});
  const [isRegeneratingCoaching, setIsRegeneratingCoaching] = useState(false);
  const [isEditingPast, setIsEditingPast] = useState(false);
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<RecurringTemplate | null>(null);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateInstructions, setNewTemplateInstructions] = useState("");
  const [newTemplatePdf, setNewTemplatePdf] = useState<File | null>(null);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [insights, setInsights] = useState<UserInsight[]>([]);
  const [candidates, setCandidates] = useState<InsightCandidate[]>([]);
  const [newInsightText, setNewInsightText] = useState("");
  const [showAddInsight, setShowAddInsight] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent-color', accentColor);
    localStorage.setItem('accentColor', accentColor);
  }, [accentColor]);

  useEffect(() => {
    const fs = FONT_SIZES.find(f => f.value === writingFontSize);
    if (fs) {
      document.documentElement.style.setProperty('--writing-font-size', fs.size);
      document.documentElement.style.setProperty('--writing-line-height', fs.lineHeight);
    }
    localStorage.setItem('writingFontSize', writingFontSize);
  }, [writingFontSize]);

  useEffect(() => {
    localStorage.setItem('showWritingLines', String(showWritingLines));
  }, [showWritingLines]);

  useEffect(() => {
    document.documentElement.style.setProperty('--writing-font', writingFont);
    localStorage.setItem('writingFont', writingFont);
  }, [writingFont]);

  useEffect(() => {
    localStorage.setItem('aiHarshness', aiHarshness);

    // When harshness changes and we have coaching advice, swap or regenerate
    if (!currentEntry?.coaching_advice || !currentEntry.content) return;

    // Check cache first
    if (coachingCache[aiHarshness]) {
      setCurrentEntry(prev => prev ? { ...prev, coaching_advice: coachingCache[aiHarshness] } : prev);
      return;
    }

    // If switching back to the original generated harshness and it's not cached yet, it's already displayed
    if (aiHarshness === generatedHarshness) return;

    // Regenerate for the new harshness
    setIsRegeneratingCoaching(true);
    const entryDate = currentEntry.date;
    fetchRecentEntries(7, entryDate).then(recentEntries =>
      regenerateCoachingAdvice(
        currentEntry.content.replace(/<[^>]*>/g, ' '), // strip HTML
        aiHarshness,
        userProfile,
        insights.map(i => i.text),
        recentEntries
      )
    ).then(newAdvice => {
      setCoachingCache(prev => ({ ...prev, [aiHarshness]: newAdvice }));
      setCurrentEntry(prev => prev ? { ...prev, coaching_advice: newAdvice } : prev);
    }).catch(console.error)
      .finally(() => setIsRegeneratingCoaching(false));
  }, [aiHarshness]);

  useEffect(() => {
    localStorage.setItem('userProfile', JSON.stringify(userProfile));
  }, [userProfile]);

  useEffect(() => {
    loadEntries();
    loadCurrentEntry();
  }, [selectedDate]);

  useEffect(() => {
    loadBookmarkedIdeas();
    loadTemplates();
    loadInsights();
    loadCandidates();
  }, []);

  const loadBookmarkedIdeas = async () => {
    const data = await fetchBookmarkedIdeas();
    setAllBookmarkedIdeas(data);
  };

  const loadTemplates = async () => {
    const data = await fetchTemplates();
    setTemplates(data);
  };

  const loadInsights = async () => {
    const data = await fetchInsights();
    setInsights(data);
  };

  const loadCandidates = async () => {
    const data = await fetchInsightCandidates();
    setCandidates(data);
  };

  useEffect(() => {
    if (allEntries.length > 0) {
      const s = calculateStreak(allEntries);
      setStreak(s);

    }
  }, [allEntries]);


  const loadEntries = async () => {
    const data = await fetchEntries();
    setAllEntries(data);
  };

  const loadCurrentEntry = async () => {
    const data = await fetchEntry(selectedDate);
    let entry = data || {
      date: selectedDate,
      content: '',
      word_count: 0,
      tasks: null
    };

    const today = formatDate(new Date());
    if (selectedDate === today && (!entry.tasks || entry.tasks.length === 0)) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDate = formatDate(yesterday);
      const yesterdayEntry = await fetchEntry(yesterdayDate);

      if (yesterdayEntry && yesterdayEntry.tasks) {
        const incompleteTasks = yesterdayEntry.tasks
          .filter(t => !t.completed)
          .map(t => {
            const createdDate = t.created_at ? new Date(t.created_at) : new Date(yesterdayDate);
            const diffTime = Math.abs(new Date().getTime() - createdDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            return {
              ...t,
              isRollover: true,
              daysOld: diffDays
            };
          });

        if (incompleteTasks.length > 0) {
          entry = { ...entry, tasks: incompleteTasks };
          await updateTasks(selectedDate, incompleteTasks);
        }
      }
    }

    setCurrentEntry(entry);
  };

  const handleDeleteEntry = async (date: string) => {
    if (!confirm(`Delete the entry from ${date}? This cannot be undone.`)) return;
    await deleteEntry(date);
    await loadEntries();
    if (selectedDate === date) {
      setCurrentEntry(null);
      setSelectedDate(formatDate(new Date()));
    }
  };

  const handleEditEntry = (date: string) => {
    setSelectedDate(date);
    setIsEditingPast(true);
    setView('journal');
    setActiveTab('write');
    setIsSidebarOpen(false);
  };

  const handleEntrySave = (content: string, tasks?: Task[], spotifyUrl?: string | null, contentIdeas?: ContentIdea[], coachingAdvice?: string | null) => {
    setCurrentEntry(prev => {
      if (!prev) return null;

      let finalTasks = tasks || prev.tasks;
      if (tasks && prev.tasks && prev.tasks.some(t => t.isRollover)) {
        const rolloverTasks = prev.tasks.filter(t => t.isRollover && !tasks.some(nt => nt.text === t.text));
        finalTasks = [...rolloverTasks, ...tasks];
      }

      if (finalTasks) {
        finalTasks = finalTasks.map(t => ({ ...t, entryDate: selectedDate }));
      }

      return {
        ...prev,
        content,
        word_count: content.split(/\s+/).length,
        tasks: finalTasks,
        content_ideas: contentIdeas || prev.content_ideas,
        spotify_url: spotifyUrl !== undefined ? spotifyUrl : prev.spotify_url,
        coaching_advice: coachingAdvice || prev.coaching_advice
      };
    });
    loadEntries();
    if (tasks) {
      setGeneratedHarshness(aiHarshness);
      // Cache the original coaching advice under the harshness it was generated with
      if (coachingAdvice) {
        setCoachingCache({ [aiHarshness]: coachingAdvice });
      }
      setActiveTab('tasks');

      // Extract candidate insights from journal in background.
      // Candidates sit in a holding pool until mentioned a 2nd time, then promote to confirmed insights.
      // Known-confirmed insights are excluded at extraction time to avoid re-suggesting them.
      extractInsightsFromJournal(content, [...insights.map(i => i.text), ...candidates.map(c => c.text)])
        .then(async (newInsights) => {
          if (newInsights.length > 0) {
            await addInsightCandidatesBulk(newInsights.map(text => ({ text })));
            await Promise.all([loadInsights(), loadCandidates()]);
          }
        })
        .catch(console.error);
    }
  };

  const handleToggleTask = async (taskId: string, entryDate?: string) => {
    const targetDate = entryDate || selectedDate;
    const entry = targetDate === selectedDate ? currentEntry : await fetchEntry(targetDate);
    if (!entry || !entry.tasks) return;

    const toggleInList = (list: Task[]): Task[] => {
      return list.map(t => {
        if (t.id === taskId) {
          const completed = !t.completed;
          return { ...t, completed };
        }

        if (t.currentMicroTask && t.currentMicroTask.id === taskId) {
          const completed = !t.currentMicroTask.completed;
          const updatedMT = { ...t.currentMicroTask, completed, completedAt: completed ? new Date().toISOString() : undefined };
          const microTasks = (t.microTasks || []).map(m => m.id === updatedMT.id ? updatedMT : m);
          const total = microTasks.length;
          const done = microTasks.filter(m => m.completed).length;
          const progress = total > 0 ? Math.min(Math.round((done / total) * 100), 100) : 0;

          // Advance to next incomplete micro-task
          let nextMicroTask: typeof updatedMT | undefined = updatedMT;
          if (completed) {
            nextMicroTask = microTasks.find(m => !m.completed);
          }

          return { ...t, currentMicroTask: nextMicroTask || updatedMT, microTasks, progress };
        }

        if (t.subtasks?.some(st => st.id === taskId)) {
          return { ...t, subtasks: t.subtasks!.map(st => st.id === taskId ? { ...st, completed: !st.completed } : st) };
        }
        if (t.microTasks?.some(mt => mt.id === taskId)) {
          return { ...t, microTasks: t.microTasks!.map(mt => mt.id === taskId ? { ...mt, completed: !mt.completed, completedAt: !mt.completed ? new Date().toISOString() : undefined } : mt) };
        }

        return t;
      });
    };

    const newTasks = toggleInList(entry.tasks);
    if (targetDate === selectedDate) {
      setCurrentEntry({ ...entry, tasks: newTasks });
    }
    await updateTasks(targetDate, newTasks);
  };

  const handleDeleteTask = async (taskId: string, entryDate?: string) => {
    const date = entryDate || selectedDate;
    if (date === selectedDate && currentEntry?.tasks) {
      const newTasks = currentEntry.tasks.filter(t => t.id !== taskId);
      setCurrentEntry({ ...currentEntry, tasks: newTasks });
      await updateTasks(date, newTasks);
    } else if (entryDate) {
      const entry = await fetchEntry(entryDate);
      if (entry?.tasks) {
        const newTasks = entry.tasks.filter((t: Task) => t.id !== taskId);
        await updateTasks(entryDate, newTasks);
      }
    }
  };

  const handleClearAllAcceptedTasks = async () => {
    const allEntriesData = await fetchEntries();
    for (const e of allEntriesData) {
      const entry = await fetchEntry(e.date);
      if (entry?.tasks) {
        const newTasks = entry.tasks.map((t: Task) => ({ ...t, accepted: false }));
        await updateTasks(e.date, newTasks);
      }
    }
    if (currentEntry?.tasks) {
      const newTasks = currentEntry.tasks.map(t => ({ ...t, accepted: false }));
      setCurrentEntry({ ...currentEntry, tasks: newTasks });
    }
  };

  const handleUpdateTask = async (taskId: string, text: string) => {
    if (!currentEntry || !currentEntry.tasks) return;
    const newTasks = currentEntry.tasks.map(t =>
      t.id === taskId ? { ...t, text } : t
    );
    setCurrentEntry({ ...currentEntry, tasks: newTasks });
    await updateTasks(selectedDate, newTasks);
  };

  const handleAddTask = async (text: string, category: string = 'Personal') => {
    const taskId = `task-manual-${Date.now()}`;
    const newTask: Task = {
      id: taskId,
      text,
      category,
      completed: false,
      deadline: new Date().toISOString(),
      created_at: new Date().toISOString(),
      entryDate: selectedDate,
    };

    // Show task immediately
    const currentTasks = currentEntry?.tasks || [];
    const updatedTasks = [...currentTasks, newTask];
    setCurrentEntry(prev => prev ? { ...prev, tasks: updatedTasks } : prev);
    await updateTasks(selectedDate, updatedTasks);

    // Generate impact analysis, subtasks, and microtasks in background
    try {
      // Check if any recurring template matches this task
      const matchingTemplate = findMatchingTemplate(text, templates);
      const templateContext = matchingTemplate
        ? [matchingTemplate.instructions, matchingTemplate.pdf_text].filter(Boolean).join("\n\n")
        : "";

      const [impact, subtasksRaw, microTasks] = await Promise.all([
        regenerateImpactAnalysis(text, aiHarshness, userProfile, insights.map(i => i.text)),
        templateContext
          ? generateSubtasksWithContext(text, templateContext)
          : generateSubtasks(text),
        generateAllMicroTasks(newTask, 5, templateContext || undefined),
      ]);

      const subtasks = subtasksRaw.map((st, i) => ({
        id: `subtask-${Date.now()}-${i}`,
        text: st.text,
        completed: false,
        deadline: st.deadline,
      }));

      setCurrentEntry(prev => {
        if (!prev) return prev;
        const withExtras = prev.tasks!.map(t =>
          t.id === taskId
            ? { ...t, impactAnalysis: impact, subtasks, microTasks, currentMicroTask: microTasks[0], accepted: true, progress: 0 }
            : t
        );
        updateTasks(selectedDate, withExtras);
        return { ...prev, tasks: withExtras };
      });
    } catch (error) {
      console.error("Failed to generate task extras:", error);
    }
  };

  const handleAddSubtask = async (taskId: string, text: string) => {
    if (!currentEntry || !currentEntry.tasks) return;
    const newTasks = currentEntry.tasks.map(t => {
      if (t.id === taskId) {
        const subtasks = t.subtasks || [];
        const newSubtask = {
          id: `subtask-manual-${Date.now()}`,
          text,
          completed: false,
          deadline: new Date().toISOString()
        };
        return { ...t, subtasks: [...subtasks, newSubtask] };
      }
      return t;
    });
    setCurrentEntry({ ...currentEntry, tasks: newTasks });
    await updateTasks(selectedDate, newTasks);
  };

  const handleUpdateSubtask = async (taskId: string, subtaskId: string, text: string) => {
    if (!currentEntry || !currentEntry.tasks) return;
    const newTasks = currentEntry.tasks.map(t => {
      if (t.id === taskId && t.subtasks) {
        return { ...t, subtasks: t.subtasks.map(st => st.id === subtaskId ? { ...st, text } : st) };
      }
      return t;
    });
    setCurrentEntry({ ...currentEntry, tasks: newTasks });
    await updateTasks(selectedDate, newTasks);
  };

  const handleDeleteSubtask = async (taskId: string, subtaskId: string) => {
    if (!currentEntry || !currentEntry.tasks) return;
    const newTasks = currentEntry.tasks.map(t => {
      if (t.id === taskId && t.subtasks) {
        return { ...t, subtasks: t.subtasks.filter(st => st.id !== subtaskId) };
      }
      return t;
    });
    setCurrentEntry({ ...currentEntry, tasks: newTasks });
    await updateTasks(selectedDate, newTasks);
  };

  const handleGenerateMoreMicroTasks = async (taskId: string, entryDate?: string) => {
    const targetDate = entryDate || selectedDate;
    const entry = targetDate === selectedDate ? currentEntry : await fetchEntry(targetDate);
    if (!entry || !entry.tasks) return;

    const task = entry.tasks.find(t => t.id === taskId);
    if (!task) return;

    const matchingTemplate = findMatchingTemplate(task.text, templates);
    const templateContext = matchingTemplate
      ? [matchingTemplate.instructions, matchingTemplate.pdf_text].filter(Boolean).join("\n\n")
      : "";
    const newMicroTasks = await generateAllMicroTasks(task, 5, templateContext || undefined);
    const allMicroTasks = [...(task.microTasks || []), ...newMicroTasks];
    const nextMicroTask = allMicroTasks.find(m => !m.completed) || newMicroTasks[0];
    const newTasks = entry.tasks.map(t =>
      t.id === taskId ? { ...t, currentMicroTask: nextMicroTask, microTasks: allMicroTasks } : t
    );

    if (targetDate === selectedDate) {
      setCurrentEntry({ ...entry, tasks: newTasks });
    }
    await updateTasks(targetDate, newTasks);
  };

  const handleRegenerateMicroTasks = async (taskId: string) => {
    if (!currentEntry || !currentEntry.tasks) return;
    const task = currentEntry.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Check if a recurring template matches this task
    const matchingTemplate = findMatchingTemplate(task.text, templates);
    const templateContext = matchingTemplate
      ? [matchingTemplate.instructions, matchingTemplate.pdf_text].filter(Boolean).join("\n\n")
      : "";

    console.log("[Regenerate]", { taskText: task.text, templatesCount: templates.length, templateNames: templates.map(t => t.name), matchingTemplate: matchingTemplate?.name || "NONE", contextLength: templateContext.length });

    // Clear existing subtasks, microtasks and show regenerating state
    const cleared = currentEntry.tasks.map(t =>
      t.id === taskId ? { ...t, subtasks: [], microTasks: [], currentMicroTask: undefined, progress: 0 } : t
    );
    setCurrentEntry({ ...currentEntry, tasks: cleared });

    // Always regenerate subtasks (with template context if available)
    const subtasksRaw = templateContext
      ? await generateSubtasksWithContext(task.text, templateContext)
      : await generateSubtasks(task.text);

    const subtasks = subtasksRaw.map((st, i) => ({
      id: `subtask-regen-${Date.now()}-${i}`,
      text: st.text,
      completed: false,
      deadline: st.deadline,
    }));

    const updatedTask = { ...task, subtasks };

    // Show subtasks while microtasks generate
    const withSubtasks = cleared.map(t =>
      t.id === taskId ? { ...t, subtasks } : t
    );
    setCurrentEntry(prev => prev ? { ...prev, tasks: withSubtasks } : prev);

    // Generate new microtasks based on the new subtasks + template context
    const microTasks = await generateAllMicroTasks(updatedTask, 5, templateContext || undefined);
    const finalTasks = withSubtasks.map(t =>
      t.id === taskId ? { ...t, microTasks, currentMicroTask: microTasks[0], progress: 0 } : t
    );
    setCurrentEntry(prev => prev ? { ...prev, tasks: finalTasks } : prev);
    await updateTasks(selectedDate, finalTasks);
  };

  const handleAddTaskContext = async (taskId: string, entryDate: string, contextText: string, pdfFile?: File) => {
    // Upload context to server (extracts PDF text, stores it)
    const result = await uploadTaskContext(taskId, entryDate, contextText, pdfFile);
    const combinedContext = result.context;

    // Find the task
    const targetDate = entryDate || selectedDate;
    const entry = targetDate === selectedDate ? currentEntry : await fetchEntry(targetDate);
    if (!entry?.tasks) return;

    const task = entry.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Regenerate subtasks with context
    const subtasksRaw = await generateSubtasksWithContext(task.text, combinedContext);
    const subtasks = subtasksRaw.map((st, i) => ({
      id: `subtask-ctx-${Date.now()}-${i}`,
      text: st.text,
      completed: false,
      deadline: st.deadline,
    }));

    // Regenerate microtasks with the new subtasks + context
    const updatedTask = { ...task, subtasks };
    const microTasks = await generateAllMicroTasks(updatedTask, 5, combinedContext);

    const newTasks = entry.tasks.map(t =>
      t.id === taskId
        ? { ...t, subtasks, microTasks, currentMicroTask: microTasks[0], progress: 0, accepted: true }
        : t
    );

    if (targetDate === selectedDate) {
      setCurrentEntry(prev => prev ? { ...prev, tasks: newTasks } : prev);
    }
    await updateTasks(targetDate, newTasks);
  };

  const handleAcceptTask = async (taskId: string) => {
    if (!currentEntry || !currentEntry.tasks) return;

    const task = currentEntry.tasks.find(t => t.id === taskId);
    if (!task) return;

    const isAccepting = !task.accepted;

    // Immediately show accepted state
    const immediateUpdate = currentEntry.tasks.map(t =>
      t.id === taskId ? { ...t, accepted: isAccepting, entryDate: selectedDate, progress: 0 } : t
    );
    setCurrentEntry({ ...currentEntry, tasks: immediateUpdate });

    // Generate micro-tasks in background if accepting
    if (isAccepting && (!task.microTasks || task.microTasks.length === 0)) {
      const matchingTemplate = findMatchingTemplate(task.text, templates);
      const templateContext = matchingTemplate
        ? [matchingTemplate.instructions, matchingTemplate.pdf_text].filter(Boolean).join("\n\n")
        : "";
      const microTasks = await generateAllMicroTasks(task, 5, templateContext || undefined);
      const withMicro = immediateUpdate.map(t =>
        t.id === taskId ? { ...t, microTasks, currentMicroTask: microTasks[0] } : t
      );
      setCurrentEntry(prev => prev ? { ...prev, tasks: withMicro } : prev);
      await updateTasks(selectedDate, withMicro);
    } else {
      await updateTasks(selectedDate, immediateUpdate);
    }
  };

  const handleUpdateDeadline = async (taskId: string, deadline: string, entryDate?: string) => {
    const targetDate = entryDate || selectedDate;
    const entry = targetDate === selectedDate ? currentEntry : await fetchEntry(targetDate);
    if (!entry || !entry.tasks) return;
    const newTasks = entry.tasks.map(t =>
      t.id === taskId ? { ...t, deadline } : t
    );
    if (targetDate === selectedDate) {
      setCurrentEntry({ ...entry, tasks: newTasks });
    }
    await updateTasks(targetDate, newTasks);
  };

  const handleBookmarkIdea = async (ideaId: string) => {
    if (!currentEntry || !currentEntry.content_ideas) return;
    const newIdeas = currentEntry.content_ideas.map(idea =>
      idea.id === ideaId ? { ...idea, isBookmarked: !idea.isBookmarked } : idea
    );
    setCurrentEntry({ ...currentEntry, content_ideas: newIdeas });
    await updateIdeas(currentEntry.date, newIdeas);
    await loadBookmarkedIdeas();
  };

  const handleIdeaStatusChange = async (ideaId: string, entryDate: string, status: 'idea' | 'in_progress' | 'finished') => {
    await updateIdea(entryDate, ideaId, { status });
    setAllBookmarkedIdeas(prev => prev.map(i => i.id === ideaId ? { ...i, status } : i));
    if (currentEntry?.content_ideas) {
      setCurrentEntry({
        ...currentEntry,
        content_ideas: currentEntry.content_ideas.map(i => i.id === ideaId ? { ...i, status } : i)
      });
    }
  };

  const handleConvertIdeaToTasks = async (ideaId: string, type: 'long' | 'short' | 'substack') => {
    if (!currentEntry || !currentEntry.content_ideas || !currentEntry.tasks) return;
    const idea = currentEntry.content_ideas.find(i => i.id === ideaId);
    if (!idea) return;

    const newTasks: Task[] = [];
    const now = new Date();

    if (type === 'long') {
      const d1 = new Date(now); d1.setDate(d1.getDate() + 1);
      const d2 = new Date(now); d2.setDate(d2.getDate() + 2);
      const d3 = new Date(now); d3.setDate(d3.getDate() + 3);

      newTasks.push({
        id: `task-gen-${Date.now()}-1`,
        text: `Script: ${idea.title}`,
        category: 'Content',
        completed: false,
        deadline: d1.toISOString(),
        created_at: now.toISOString()
      });
      newTasks.push({
        id: `task-gen-${Date.now()}-2`,
        text: `Record: ${idea.title}`,
        category: 'Content',
        completed: false,
        deadline: d2.toISOString(),
        created_at: now.toISOString()
      });
      newTasks.push({
        id: `task-gen-${Date.now()}-3`,
        text: `Edit: ${idea.title}`,
        category: 'Content',
        completed: false,
        deadline: d3.toISOString(),
        created_at: now.toISOString()
      });
    } else if (type === 'short') {
      const d1 = new Date(now); d1.setDate(d1.getDate() + 1);
      newTasks.push({
        id: `task-gen-${Date.now()}-1`,
        text: `Create short-form: ${idea.title}`,
        category: 'Content',
        completed: false,
        deadline: d1.toISOString(),
        created_at: now.toISOString()
      });
    } else {
      const d1 = new Date(now); d1.setDate(d1.getDate() + 1);
      newTasks.push({
        id: `task-gen-${Date.now()}-1`,
        text: `Write Substack: ${idea.title}`,
        category: 'Content',
        completed: false,
        deadline: d1.toISOString(),
        created_at: now.toISOString()
      });
    }

    const updatedTasks = [...currentEntry.tasks, ...newTasks];
    setCurrentEntry({ ...currentEntry, tasks: updatedTasks });
    await updateTasks(selectedDate, updatedTasks);
    setActiveTab('tasks');
  };

  const isToday = selectedDate === formatDate(new Date());

  const navItems = [
    { id: 'dashboard' as const, icon: Home, label: 'Dashboard' },
    { id: 'ideas' as const, icon: Lightbulb, label: 'Ideas Board', badge: allBookmarkedIdeas.length || undefined },
    { id: 'settings' as const, icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="flex h-screen bg-paper overflow-hidden print:h-auto print:overflow-visible">
      {/* Mobile backdrop */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar Toggle */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="fixed top-4 left-4 z-50 p-2.5 bg-surface rounded-lg shadow-sm hover:shadow-md transition-shadow print:hidden"
      >
        {isSidebarOpen ? <X className="w-5 h-5 text-ink" /> : <Menu className="w-5 h-5 text-ink" />}
      </button>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-80 bg-white/80 backdrop-blur-xl border-r border-border transform transition-all duration-300 ease-in-out lg:relative lg:z-auto print:hidden",
        isSidebarOpen ? 'translate-x-0 lg:ml-0' : '-translate-x-full lg:-ml-80'
      )}>
        <div className="h-full flex flex-col">
          <div className="p-6 pb-5 border-b border-border">
            {/* Streak Display */}
            <div className="bg-surface rounded-lg p-3.5 flex items-center gap-3.5 shadow-sm">
              <div className="w-10 h-10 rounded-md bg-accent/10 flex items-center justify-center">
                <Flame className={streak > 0 ? "text-accent w-5 h-5 fill-accent" : "text-ink-secondary/30 w-5 h-5"} />
              </div>
              <div>
                <div className="text-xl font-serif leading-none">{streak} Day Streak</div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-secondary mt-1">Keep it up!</div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <Calendar
              selectedDate={selectedDate}
              onSelectDate={(date) => {
                setSelectedDate(date);
                setIsEditingPast(false);
                setIsSidebarOpen(false);
                setView('journal');
              }}
              entries={allEntries}
              onDeleteEntry={handleDeleteEntry}
              onEditEntry={handleEditEntry}
            />
          </div>

          <div className="p-3 border-t border-border space-y-1">
            {navItems.map(item => {
              const isActive = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setView(view === item.id && item.id !== 'settings' ? 'journal' : item.id);
                    setIsSidebarOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm font-medium",
                    isActive
                      ? "bg-accent/10 text-accent"
                      : "text-ink-secondary hover:bg-surface hover:text-ink"
                  )}
                >
                  <item.icon className="w-4.5 h-4.5" />
                  {item.label}
                  {item.badge && (
                    <span className={cn(
                      "ml-auto text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center",
                      isActive ? "bg-white/20 text-white" : "bg-accent/10 text-accent"
                    )}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden print:overflow-visible print:h-auto">
        <AnimatePresence mode="wait">
          {view === 'dashboard' ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="flex-1 h-full overflow-hidden"
            >
              <Dashboard
                onToggleTask={handleToggleTask}
                onGenerateMicroTask={handleGenerateMoreMicroTasks}
                onUpdateDeadline={handleUpdateDeadline}
                onDeleteTask={handleDeleteTask}
                onClearAllTasks={handleClearAllAcceptedTasks}
                onAddTask={handleAddTask}
              />
            </motion.div>
          ) : view === 'ideas' ? (
            <motion.div
              key="ideas"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="flex-1 h-full overflow-hidden"
            >
              <IdeasBoard
                ideas={allBookmarkedIdeas}
                onStatusChange={handleIdeaStatusChange}
              />
            </motion.div>
          ) : view === 'settings' ? (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="flex-1 h-full overflow-y-auto"
            >
              <div className="max-w-2xl mx-auto p-8 md:p-12 space-y-10">
                <header>
                  <h1 className="text-3xl font-serif">Settings</h1>
                  <p className="text-sm text-ink-secondary mt-1">Customize your experience</p>
                </header>

                {/* Profile */}
                <section className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold">Your Profile</h2>
                    <p className="text-xs text-ink-secondary mt-1">Helps the AI give you more personalized coaching and tasks</p>
                  </div>
                  {[
                    { key: 'name', label: 'What should I call you?', placeholder: 'Your name' },
                    { key: 'role', label: 'What do you do?', placeholder: 'e.g. College student, software engineer, freelance designer...' },
                    { key: 'goals', label: 'What are your current goals?', placeholder: 'e.g. Launch my app, get a 3.8 GPA, grow my YouTube channel...', multiline: true },
                    { key: 'obstacles', label: 'What\'s holding you back right now?', placeholder: 'e.g. Procrastination, too many commitments, fear of failure...', multiline: true },
                    { key: 'context', label: 'Anything else the AI should know?', placeholder: 'e.g. I have ADHD, I\'m a night owl, I work best under pressure...', multiline: true },
                  ].map(field => (
                    <div key={field.key} className="space-y-1.5">
                      <label className="text-sm font-medium text-ink">{field.label}</label>
                      {field.multiline ? (
                        <textarea
                          value={userProfile[field.key] || ''}
                          onChange={(e) => setUserProfile((prev: Record<string, string>) => ({ ...prev, [field.key]: e.target.value }))}
                          placeholder={field.placeholder}
                          rows={2}
                          className="w-full bg-surface/60 border border-border rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent placeholder:text-ink-secondary/30 text-ink resize-none"
                        />
                      ) : (
                        <input
                          type="text"
                          value={userProfile[field.key] || ''}
                          onChange={(e) => setUserProfile((prev: Record<string, string>) => ({ ...prev, [field.key]: e.target.value }))}
                          placeholder={field.placeholder}
                          className="w-full bg-surface/60 border border-border rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent placeholder:text-ink-secondary/30 text-ink"
                        />
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      localStorage.setItem('userProfile', JSON.stringify(userProfile));
                      setProfileSaved(true);
                      setTimeout(() => setProfileSaved(false), 2000);
                    }}
                    className={cn(
                      "flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-serif italic transition-all",
                      profileSaved
                        ? "bg-accent/10 text-accent"
                        : "bg-gradient-to-r from-accent/20 to-accent/10 text-ink hover:shadow-[0_2px_12px_rgba(233,30,144,0.25)]"
                    )}
                  >
                    {profileSaved ? (
                      <><Check className="w-4 h-4" /> Saved!</>
                    ) : (
                      'Save Profile'
                    )}
                  </button>
                </section>

                {/* About You — Insight Pills */}
                <section className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold">About You</h2>
                    <p className="text-xs text-ink-secondary mt-1">Things the AI knows about you — from your journals, profile, and notes you add. Delete anything you don't want it to use.</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {insights.map(insight => (
                      <div
                        key={insight.id}
                        className="group flex items-center gap-2 px-4 py-2.5 rounded-full bg-accent/5 border border-accent/10 text-sm text-ink transition-all hover:bg-accent/10"
                      >
                        <span>{insight.text}</span>
                        <button
                          onClick={async () => {
                            await deleteInsight(insight.id);
                            setInsights(prev => prev.filter(i => i.id !== insight.id));
                          }}
                          className="text-ink-secondary/30 hover:text-red-400 transition-colors -mr-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    {showAddInsight ? (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-border">
                        <input
                          autoFocus
                          type="text"
                          value={newInsightText}
                          onChange={(e) => setNewInsightText(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter' && newInsightText.trim()) {
                              const result = await addInsight(newInsightText.trim(), 'manual');
                              if (result) setInsights(prev => [result, ...prev]);
                              setNewInsightText("");
                              setShowAddInsight(false);
                            }
                            if (e.key === 'Escape') {
                              setShowAddInsight(false);
                              setNewInsightText("");
                            }
                          }}
                          placeholder="Anything you want the app to know?"
                          className="bg-transparent text-sm outline-none placeholder:text-ink-secondary/30 text-ink w-64"
                        />
                        <button
                          onClick={() => { setShowAddInsight(false); setNewInsightText(""); }}
                          className="text-ink-secondary/30 hover:text-ink"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowAddInsight(true)}
                        className="flex items-center justify-center w-10 h-10 rounded-full bg-accent/80 text-white hover:bg-accent transition-colors shadow-sm"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    )}
                  </div>

                  {insights.length === 0 && !showAddInsight && (
                    <p className="text-xs text-ink-secondary/40 italic">No insights yet. Journal a few times and the AI will start learning about you, or add notes manually.</p>
                  )}
                </section>

                {/* Candidate Insights — pending confirmation */}
                {candidates.length > 0 && (
                  <section className="space-y-4">
                    <div>
                      <h2 className="text-lg font-semibold">Pending Observations</h2>
                      <p className="text-xs text-ink-secondary mt-1">Things the AI noticed once in your journal. They'll be promoted automatically if they come up again — or you can confirm or reject them now.</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {candidates.map(candidate => (
                        <div
                          key={candidate.id}
                          className="group flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface border border-dashed border-accent/30 text-sm text-ink-secondary transition-all hover:border-accent/50"
                        >
                          <span>{candidate.text}</span>
                          {candidate.mention_count > 1 && (
                            <span className="text-[10px] text-ink-secondary/50">×{candidate.mention_count}</span>
                          )}
                          <button
                            title="Confirm — add to your profile"
                            onClick={async () => {
                              const insight = await promoteInsightCandidate(candidate.id);
                              setCandidates(prev => prev.filter(c => c.id !== candidate.id));
                              if (insight) setInsights(prev => [insight, ...prev.filter(i => i.id !== insight.id)]);
                            }}
                            className="text-ink-secondary/40 hover:text-green-500 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            title="Reject — don't remember this"
                            onClick={async () => {
                              await deleteInsightCandidate(candidate.id);
                              setCandidates(prev => prev.filter(c => c.id !== candidate.id));
                            }}
                            className="text-ink-secondary/40 hover:text-red-400 transition-colors -mr-1"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Recurring Task Templates */}
                <section className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold">Recurring Task Templates</h2>
                    <p className="text-xs text-ink-secondary mt-1">Save instructions for tasks you do regularly. When the AI sees a matching task, it'll auto-apply these instructions to generate better subtasks.</p>
                  </div>

                  {templates.map(template => (
                    <div key={template.id} className="p-4 bg-accent/5 border border-accent/10 rounded-lg space-y-2">
                      {editingTemplate?.id === template.id ? (
                        <div className="space-y-3">
                          <input
                            type="text"
                            value={editingTemplate.name}
                            onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                            className="w-full bg-paper border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent text-ink"
                            placeholder="Task name (e.g. Statistics notes)"
                          />
                          <textarea
                            value={editingTemplate.instructions || ""}
                            onChange={(e) => setEditingTemplate({ ...editingTemplate, instructions: e.target.value })}
                            rows={3}
                            maxLength={10000}
                            className="w-full bg-paper border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent placeholder:text-ink-secondary/30 text-ink resize-none"
                            placeholder="Describe what this task always involves..."
                          />
                          {editingTemplate.pdf_filename && !newTemplatePdf && (
                            <div className="flex items-center gap-2 text-xs text-ink-secondary">
                              <FileText className="w-3 h-3" />
                              <span>{editingTemplate.pdf_filename}</span>
                              <button onClick={() => setEditingTemplate({ ...editingTemplate, pdf_filename: null, pdf_text: null })} className="text-red-400 hover:text-red-500">Remove</button>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-secondary/50 hover:text-accent transition-colors px-3 py-1.5 rounded-md bg-paper border border-border hover:border-accent/30 cursor-pointer">
                              <Upload className="w-3 h-3" />
                              {newTemplatePdf ? newTemplatePdf.name : "Upload PDF"}
                              <input
                                type="file"
                                accept=".pdf"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file && file.type === "application/pdf" && file.size <= 10 * 1024 * 1024) {
                                    setNewTemplatePdf(file);
                                  }
                                }}
                              />
                            </label>
                            <div className="flex-1" />
                            <button
                              onClick={() => { setEditingTemplate(null); setNewTemplatePdf(null); }}
                              className="text-xs text-ink-secondary hover:text-ink"
                            >Cancel</button>
                            <button
                              disabled={templateSaving || !editingTemplate.name.trim()}
                              onClick={async () => {
                                setTemplateSaving(true);
                                try {
                                  await updateTemplate(
                                    editingTemplate.id,
                                    editingTemplate.name,
                                    editingTemplate.instructions || "",
                                    newTemplatePdf || undefined,
                                    !editingTemplate.pdf_filename && !newTemplatePdf ? true : false
                                  );
                                  await loadTemplates();
                                  setEditingTemplate(null);
                                  setNewTemplatePdf(null);
                                } finally { setTemplateSaving(false); }
                              }}
                              className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-4 py-1.5 rounded-md bg-accent text-white disabled:opacity-50 hover:brightness-110 transition-all"
                            >
                              {templateSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-serif font-medium text-ink">{template.name}</h4>
                            {template.instructions && (
                              <p className="text-xs text-ink-secondary/60 mt-1 line-clamp-2">{template.instructions}</p>
                            )}
                            {template.pdf_filename && (
                              <div className="flex items-center gap-1 mt-1 text-[10px] text-ink-secondary/40">
                                <FileText className="w-3 h-3" />
                                {template.pdf_filename}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => { setEditingTemplate({ ...template }); setNewTemplatePdf(null); }}
                              className="p-1.5 rounded-lg text-ink-secondary/40 hover:text-ink hover:bg-paper-muted transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={async () => {
                                if (confirm(`Delete template "${template.name}"?`)) {
                                  await deleteTemplate(template.id);
                                  await loadTemplates();
                                }
                              }}
                              className="p-1.5 rounded-lg text-ink-secondary/40 hover:text-red-500 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {showAddTemplate ? (
                    <div className="p-4 bg-surface/60 border border-border rounded-lg space-y-3">
                      <input
                        type="text"
                        value={newTemplateName}
                        onChange={(e) => setNewTemplateName(e.target.value)}
                        className="w-full bg-paper border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent text-ink"
                        placeholder="Task name (e.g. Statistics notes, OS Project)"
                        maxLength={200}
                      />
                      <textarea
                        value={newTemplateInstructions}
                        onChange={(e) => setNewTemplateInstructions(e.target.value)}
                        rows={3}
                        maxLength={10000}
                        className="w-full bg-paper border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent placeholder:text-ink-secondary/30 text-ink resize-none"
                        placeholder="Describe what this task always involves... (e.g. Read chapter, take notes on key formulas, do practice problems 1-10)"
                      />
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-secondary/50 hover:text-accent transition-colors px-3 py-1.5 rounded-md bg-paper border border-border hover:border-accent/30 cursor-pointer">
                          <Upload className="w-3 h-3" />
                          {newTemplatePdf ? newTemplatePdf.name : "Upload PDF"}
                          <input
                            type="file"
                            accept=".pdf"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file && file.type === "application/pdf" && file.size <= 10 * 1024 * 1024) {
                                setNewTemplatePdf(file);
                              }
                            }}
                          />
                        </label>
                        {newTemplatePdf && (
                          <button onClick={() => setNewTemplatePdf(null)} className="text-[10px] text-red-400 hover:text-red-500">Remove</button>
                        )}
                        <div className="flex-1" />
                        <button
                          onClick={() => { setShowAddTemplate(false); setNewTemplateName(""); setNewTemplateInstructions(""); setNewTemplatePdf(null); }}
                          className="text-xs text-ink-secondary hover:text-ink"
                        >Cancel</button>
                        <button
                          disabled={templateSaving || !newTemplateName.trim()}
                          onClick={async () => {
                            setTemplateSaving(true);
                            try {
                              await createTemplate(newTemplateName, newTemplateInstructions, newTemplatePdf || undefined);
                              await loadTemplates();
                              setShowAddTemplate(false);
                              setNewTemplateName("");
                              setNewTemplateInstructions("");
                              setNewTemplatePdf(null);
                            } finally { setTemplateSaving(false); }
                          }}
                          className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-4 py-1.5 rounded-md bg-accent text-white disabled:opacity-50 hover:brightness-110 transition-all"
                        >
                          {templateSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                          Create
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAddTemplate(true)}
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-serif italic bg-surface/60 text-ink-secondary hover:bg-surface hover:shadow-sm transition-all border border-border"
                    >
                      <Plus className="w-4 h-4" /> Add Template
                    </button>
                  )}
                </section>

                {/* Accent Color */}
                <section className="space-y-4">
                  <h2 className="text-lg font-semibold">Accent Color</h2>
                  <div className="grid grid-cols-3 gap-2">
                    {ACCENT_COLORS.map(c => (
                      <button
                        key={c.color}
                        onClick={() => setAccentColor(c.color)}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg transition-all",
                          accentColor === c.color
                            ? "bg-surface shadow-sm ring-2 ring-accent/40"
                            : "bg-surface/60 hover:bg-surface hover:shadow-sm"
                        )}
                      >
                        <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                        <span className="text-sm">{c.name}</span>
                      </button>
                    ))}
                  </div>
                </section>

                {/* Writing Font Size */}
                <section className="space-y-4">
                  <h2 className="text-lg font-semibold">Writing Font Size</h2>
                  <div className="flex gap-2">
                    {FONT_SIZES.map(fs => (
                      <button
                        key={fs.value}
                        onClick={() => setWritingFontSize(fs.value)}
                        className={cn(
                          "px-6 py-2.5 rounded-lg text-sm font-medium transition-all",
                          writingFontSize === fs.value
                            ? "bg-accent text-white shadow-sm"
                            : "bg-surface text-ink-secondary hover:bg-surface hover:shadow-sm"
                        )}
                      >
                        {fs.label}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Writing Font */}
                <section className="space-y-4">
                  <h2 className="text-lg font-semibold">Writing Font</h2>
                  <div className="grid grid-cols-1 gap-2">
                    {WRITING_FONTS.map(f => (
                      <button
                        key={f.value}
                        onClick={() => setWritingFont(f.value)}
                        className={cn(
                          "flex items-center justify-between px-4 py-3 rounded-lg transition-all text-left",
                          writingFont === f.value
                            ? "bg-surface shadow-sm ring-2 ring-accent/40"
                            : "bg-surface/60 hover:bg-surface hover:shadow-sm"
                        )}
                      >
                        <span className="text-base italic" style={{ fontFamily: f.value }}>{f.label}</span>
                        <span className="text-xs text-ink-secondary">{f.preview}</span>
                      </button>
                    ))}
                  </div>
                </section>

                {/* Writing Lines */}
                <section className="space-y-4">
                  <h2 className="text-lg font-semibold">Writing Lines</h2>
                  <button
                    onClick={() => setShowWritingLines(!showWritingLines)}
                    className={cn(
                      "flex items-center gap-3 p-3.5 rounded-lg transition-all",
                      showWritingLines
                        ? "bg-surface shadow-sm ring-2 ring-accent/40"
                        : "bg-surface/60 hover:bg-surface hover:shadow-sm"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-6 rounded-full transition-all relative",
                      showWritingLines ? "bg-accent" : "bg-ink-secondary/20"
                    )}>
                      <div className={cn(
                        "w-4 h-4 rounded-full bg-white absolute top-1 transition-all shadow-sm",
                        showWritingLines ? "left-5" : "left-1"
                      )} />
                    </div>
                    <span className="text-sm font-medium">
                      {showWritingLines ? "Lines visible" : "Lines hidden"}
                    </span>
                  </button>
                </section>

                {/* AI Harshness */}
                <section className="space-y-4">
                  <h2 className="text-lg font-semibold">Coach Style</h2>
                  <p className="text-xs text-ink-secondary">Controls the tone of AI coaching, impact analysis, and reality checks</p>
                  <div className="grid grid-cols-2 gap-2">
                    {AI_HARSHNESS.map(h => (
                      <button
                        key={h.value}
                        onClick={() => setAiHarshness(h.value)}
                        className={cn(
                          "flex flex-col items-start px-4 py-3 rounded-lg transition-all text-left",
                          aiHarshness === h.value
                            ? "bg-surface shadow-sm ring-2 ring-accent/40"
                            : "bg-surface/60 hover:bg-surface hover:shadow-sm"
                        )}
                      >
                        <span className="text-sm font-medium">{h.label}</span>
                        <span className="text-[10px] text-ink-secondary">{h.description}</span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="journal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 flex flex-col overflow-hidden print:overflow-visible print:h-auto"
            >
              {/* Tab Bar */}
              <div className="flex gap-2 p-2 shrink-0 print:hidden">
                <button
                  onClick={() => setActiveTab('write')}
                  className={cn(
                    "flex-1 py-2.5 text-sm font-serif italic rounded-lg transition-all",
                    activeTab === 'write'
                      ? 'bg-gradient-to-r from-accent/20 to-accent/10 text-ink shadow-[0_2px_12px_rgba(233,30,144,0.25)]'
                      : 'bg-gradient-to-r from-accent/12 to-accent/6 text-ink'
                  )}
                >
                  Writing
                </button>
                <button
                  onClick={() => setActiveTab('tasks')}
                  className={cn(
                    "flex-1 py-2.5 text-sm font-serif italic rounded-lg transition-all",
                    activeTab === 'tasks'
                      ? 'bg-gradient-to-r from-accent/20 to-accent/10 text-ink shadow-[0_2px_12px_rgba(233,30,144,0.25)]'
                      : 'bg-gradient-to-r from-accent/12 to-accent/6 text-ink'
                  )}
                >
                  Tasks & Coach
                </button>
              </div>

              <div className="flex-1 flex overflow-hidden print:overflow-visible print:h-auto">
                {/* Editor Section */}
                <div className={cn(
                  "flex-1 h-full overflow-y-auto border-r border-border/50 flex flex-col print:hidden",
                  activeTab === 'write' ? 'flex' : 'hidden'
                )}>

                  <div className="flex-1">
                    {currentEntry && (
                      <Editor
                        date={selectedDate}
                        initialContent={currentEntry.content}
                        initialSpotifyUrl={currentEntry.spotify_url}
                        onSave={handleEntrySave}
                        isReadOnly={!isToday && !isEditingPast}
                        tasks={currentEntry.tasks || []}
                        contentIdeas={currentEntry.content_ideas || []}
                        showWritingLines={showWritingLines}
                        writingFont={writingFont}
                        onWritingFontChange={setWritingFont}
                        aiHarshness={aiHarshness}
                        userProfile={userProfile}
                        recurringTemplates={templates.map(t => ({ name: t.name, instructions: t.instructions, pdf_text: t.pdf_text }))}
                        userInsights={insights.map(i => i.text)}
                      />
                    )}
                  </div>
                </div>

                {/* Tasks Section */}
                <div className={cn(
                  "flex-1 h-full bg-paper border-l border-border/50 print:!block print:h-auto print:overflow-visible",
                  activeTab === 'tasks' ? 'block' : 'hidden'
                )}>
                  {currentEntry && (
                    <TodoList
                      tasks={currentEntry.tasks || []}
                      contentIdeas={currentEntry.content_ideas || []}
                      coachingAdvice={currentEntry.coaching_advice}
                      onToggle={handleToggleTask}
                      onDelete={handleDeleteTask}
                      onAccept={handleAcceptTask}
                      onUpdateTask={handleUpdateTask}
                      onAddTask={handleAddTask}
                      onAddTaskContext={handleAddTaskContext}
                      isRegeneratingCoaching={isRegeneratingCoaching}
                      onUpdateDeadline={handleUpdateDeadline}
                      onAddSubtask={handleAddSubtask}
                      onDeleteSubtask={handleDeleteSubtask}
                      onUpdateSubtask={handleUpdateSubtask}
                      onBookmarkIdea={handleBookmarkIdea}
                      onConvertIdea={handleConvertIdeaToTasks}
                      onGenerateMicroTask={handleGenerateMoreMicroTasks}
                      onRegenerateMicroTasks={handleRegenerateMicroTasks}
                      aiHarshness={aiHarshness}
                      entryDate={selectedDate}
                      userProfile={userProfile}
                      originalHarshness={generatedHarshness}
                    />
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
