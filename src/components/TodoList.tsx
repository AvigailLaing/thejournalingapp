import React from 'react';
import {
  CheckCircle2,
  Circle,
  ListTodo,
  Lightbulb,
  Youtube,
  Video,
  PenTool,
  MessageSquare,
  Trash2,
  Star,
  Plus,
  Clock,
  History,
  Smartphone,
  FileText,
  Info,
  Edit2,
  Check,
  X as CloseIcon,
  ArrowRight,
  RefreshCcw,
  Loader2,
  Send,
  Download,
  Upload,
  BookOpen
} from 'lucide-react';
import { Task, ContentIdea, SubTask, askCoach, regenerateImpactAnalysis } from '../services/ai';
import { uploadTaskContext } from '../services/api';
import { cn } from '../lib/utils';
import { format, isPast, isToday } from 'date-fns';

interface TodoListProps {
  tasks: Task[];
  contentIdeas?: ContentIdea[];
  coachingAdvice?: string | null;
  onToggle: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onAccept: (taskId: string) => void;
  onUpdateTask: (taskId: string, text: string) => void;
  onUpdateDeadline: (taskId: string, deadline: string) => void;
  onAddSubtask: (taskId: string, text: string) => void;
  onDeleteSubtask: (taskId: string, subtaskId: string) => void;
  onUpdateSubtask?: (taskId: string, subtaskId: string, text: string) => void;
  onBookmarkIdea: (ideaId: string) => void;
  onConvertIdea: (ideaId: string, type: 'long' | 'short' | 'substack') => void;
  onGenerateMicroTask: (taskId: string) => void;
  onRegenerateMicroTasks?: (taskId: string) => Promise<void>;
  onAddTaskContext?: (taskId: string, entryDate: string, contextText: string, pdfFile?: File) => Promise<void>;
  onAddTask?: (text: string, category?: string) => void;
  aiHarshness?: string;
  entryDate?: string;
  isRegeneratingCoaching?: boolean;
  userProfile?: Record<string, string>;
  originalHarshness?: string;
}

export const TodoList: React.FC<TodoListProps> = ({
  tasks,
  contentIdeas = [],
  coachingAdvice,
  onToggle,
  onDelete,
  onAccept,
  onUpdateTask,
  onUpdateDeadline,
  onAddSubtask,
  onDeleteSubtask,
  onUpdateSubtask,
  onBookmarkIdea,
  onConvertIdea,
  onGenerateMicroTask,
  onRegenerateMicroTasks,
  onAddTaskContext,
  onAddTask,
  aiHarshness = 'balanced',
  entryDate = '',
  isRegeneratingCoaching = false,
  userProfile,
  originalHarshness
}) => {
  const [editingTaskId, setEditingTaskId] = React.useState<string | null>(null);
  const [editingText, setEditingText] = React.useState("");
  const [editingDeadlineId, setEditingDeadlineId] = React.useState<string | null>(null);
  const [showImpactId, setShowImpactId] = React.useState<string | null>(null);
  const [newSubtaskText, setNewSubtaskText] = React.useState<{ [key: string]: string }>({});
  const [filterToday, setFilterToday] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<'categories' | 'microtasks'>('categories');
  const [coachQuestion, setCoachQuestion] = React.useState("");
  const [coachAnswer, setCoachAnswer] = React.useState<string | null>(null);
  const [isAskingCoach, setIsAskingCoach] = React.useState(false);
  const [regeneratingTaskId, setRegeneratingTaskId] = React.useState<string | null>(null);
  const [impactCache, setImpactCache] = React.useState<Record<string, { ifDone: string; ifNotDone: string }>>({});
  const [impactHarshness, setImpactHarshness] = React.useState<Record<string, string>>({});
  const [loadingImpactId, setLoadingImpactId] = React.useState<string | null>(null);
  const [newTaskText, setNewTaskText] = React.useState("");
  const [editingSubtaskId, setEditingSubtaskId] = React.useState<string | null>(null);
  const [editingSubtaskText, setEditingSubtaskText] = React.useState("");
  const [contextTaskId, setContextTaskId] = React.useState<string | null>(null);
  const [contextText, setContextText] = React.useState("");
  const [contextPdf, setContextPdf] = React.useState<File | null>(null);
  const [isUploadingContext, setIsUploadingContext] = React.useState(false);
  const [contextError, setContextError] = React.useState<string | null>(null);
  const pdfInputRef = React.useRef<HTMLInputElement>(null);
  const handleDownloadPDF = () => window.print();

  const handleAskCoach = async () => {
    if (!coachQuestion.trim() || isAskingCoach || !coachingAdvice) return;
    setIsAskingCoach(true);
    try {
      const answer = await askCoach(coachQuestion, coachingAdvice, aiHarshness);
      setCoachAnswer(answer);
      setCoachQuestion("");
    } finally {
      setIsAskingCoach(false);
    }
  };

  // Reset coach Q&A when insights are regenerated
  React.useEffect(() => {
    setCoachAnswer(null);
    setCoachQuestion("");
  }, [coachingAdvice]);

  const filteredTasks = filterToday
    ? tasks.filter(t => t.deadline && isToday(new Date(t.deadline)))
    : tasks;

  if (tasks.length === 0 && contentIdeas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <ListTodo className="w-12 h-12 mb-4 text-ink-secondary/30" />
        <p className="text-lg font-semibold text-ink-secondary/50">No actions extracted yet.</p>
        <p className="text-sm mt-2 text-ink-secondary/40 max-w-xs">Finish your pages and click "Get Insights" to see AI-generated tasks and content ideas.</p>
      </div>
    );
  }

  const categories = Array.from(new Set(filteredTasks.map(t => t.category)));

  return (
    <div className="p-6 md:p-8 h-full overflow-y-auto space-y-10 print:h-auto print:overflow-visible">
      {/* Coaching Advice Section */}
      {coachingAdvice && (() => {
        let advice;
        try {
          advice = JSON.parse(coachingAdvice);
        } catch (e) {
          advice = { general: coachingAdvice };
        }

        return (
          <section className="bg-accent/5 rounded-xl p-6 md:p-8 border border-accent/15 animate-fade-in print-card relative">
            {isRegeneratingCoaching && (
              <div className="absolute inset-0 bg-accent/5 backdrop-blur-[2px] rounded-xl z-10 flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 text-accent animate-spin" />
                <span className="text-sm text-ink-secondary font-medium">Adjusting tone...</span>
              </div>
            )}

            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <h3 className="text-2xl font-serif italic text-ink">A Note for You</h3>
                  <button
                    onClick={handleDownloadPDF}
                    className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent/60 hover:text-accent transition-colors print:hidden"
                    title="Print / Save PDF"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Print / Save PDF
                  </button>
                </div>
                <p className="text-lg text-ink leading-relaxed">
                  {advice.general || advice}
                </p>
              </div>

              {advice.currentPath && advice.newPath && (
                <div className="grid md:grid-cols-2 gap-8 pt-6 border-t border-border">
                  <div className="space-y-3">
                    <h4 className="text-lg font-serif italic text-ink">The Current Path</h4>
                    <div className="grid gap-2">
                      {[
                        { label: 'DAYS', text: advice.currentPath.days },
                        { label: 'MONTHS', text: advice.currentPath.months },
                        { label: 'YEAR', text: advice.currentPath.year }
                      ].map((item, i) => (
                        <div key={i} className="p-3.5 rounded-md bg-white/60">
                          <span className="text-sm font-semibold text-ink tracking-wide mr-2">{item.label}:</span>
                          <span className="text-sm text-ink/80">{item.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-lg font-serif italic text-ink">Taking Action</h4>
                    <div className="grid gap-2">
                      {[
                        { label: 'DAYS', text: advice.newPath.days },
                        { label: 'MONTHS', text: advice.newPath.months },
                        { label: 'YEAR', text: advice.newPath.year }
                      ].map((item, i) => (
                        <div key={i} className="p-3.5 rounded-md bg-white/60">
                          <span className="text-sm font-semibold text-ink tracking-wide mr-2">{item.label}:</span>
                          <span className="text-sm text-ink/80">{item.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-border space-y-3 print:hidden">
                <span className="text-lg font-serif italic text-ink">Ask Your Coach</span>
                {coachAnswer && (
                  <div className="p-4 bg-paper/60 rounded-lg">
                    <p className="text-sm font-sans text-ink leading-relaxed">{coachAnswer}</p>
                  </div>
                )}
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={coachQuestion}
                    onChange={(e) => setCoachQuestion(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAskCoach(); }}
                    placeholder="Ask a follow-up question..."
                    className="flex-1 bg-paper border border-border rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent placeholder:text-ink-secondary/30 text-ink"
                    disabled={isAskingCoach}
                  />
                  <button
                    onClick={handleAskCoach}
                    disabled={isAskingCoach || !coachQuestion.trim()}
                    className="flex items-center justify-center w-10 h-10 bg-accent text-white rounded-lg disabled:opacity-50 hover:brightness-110 transition-all shrink-0"
                  >
                    {isAskingCoach ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </section>
        );
      })()}

      {/* Action Items Section */}
      {(tasks.length > 0 || onAddTask) && (
        <section>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-serif mb-1">Action Items</h3>
              <p className="text-xs text-ink-secondary uppercase tracking-wider">Derived from your thoughts</p>
            </div>
            <div className="flex items-center gap-2 print:hidden">
              <button
                onClick={() => setViewMode(viewMode === 'categories' ? 'microtasks' : 'categories')}
                className={cn(
                  "text-[10px] font-medium uppercase tracking-wider px-3.5 py-2 rounded-md transition-all",
                  viewMode === 'microtasks' ? "bg-accent text-white" : "bg-surface text-ink-secondary shadow-sm hover:shadow"
                )}
              >
                {viewMode === 'categories' ? "Micro-tasks" : "Categories"}
              </button>
              <button
                onClick={() => setFilterToday(!filterToday)}
                className={cn(
                  "text-[10px] font-medium uppercase tracking-wider px-3.5 py-2 rounded-md transition-all",
                  filterToday ? "bg-accent text-white" : "bg-surface text-ink-secondary shadow-sm hover:shadow"
                )}
              >
                {filterToday ? "Showing Today" : "Filter: Today"}
              </button>
            </div>
          </div>

          {onAddTask && (
            <div className="flex items-center gap-2 mb-4 print:hidden">
              <Plus className="w-4 h-4 text-ink-secondary/30" />
              <input
                type="text"
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTaskText.trim()) {
                    onAddTask(newTaskText.trim());
                    setNewTaskText("");
                  }
                }}
                placeholder="Add a task..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-secondary/30 text-ink font-serif border-b border-border/50 pb-1 focus:border-accent/30"
              />
            </div>
          )}

          <div className="space-y-6">
            {viewMode === 'microtasks' ? (
              <div className="space-y-3">
                {filteredTasks
                  .filter(t => t.currentMicroTask)
                  .map(task => (
                    <div
                      key={task.currentMicroTask!.id}
                      className="p-4 bg-accent/5 border border-accent/10 rounded-lg flex items-center gap-3 animate-slide-up"
                    >
                      <button onClick={() => onToggle(task.currentMicroTask!.id)}>
                        {task.currentMicroTask!.completed ? (
                          <CheckCircle2 className="w-5 h-5 text-accent" />
                        ) : (
                          <Circle className="w-5 h-5 text-ink-secondary/30" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-base font-serif",
                          task.currentMicroTask!.completed && "line-through text-ink-secondary/50"
                        )}>{task.currentMicroTask!.text}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-accent/60">
                          Part of: {task.text}
                        </p>
                      </div>
                    </div>
                  ))}
                {filteredTasks.filter(t => t.currentMicroTask).length === 0 && (
                  <div className="text-center py-12 text-ink-secondary/40 font-sans">No micro-tasks found. Accept some tasks first!</div>
                )}
              </div>
            ) : categories.length === 0 ? (
              <div className="text-center py-12 text-ink-secondary/40 font-sans">No tasks matching your filter.</div>
            ) : (
              categories.map(category => (
                <div key={category}>
                  <h4 className="text-sm font-sans font-semibold text-ink tracking-wide mb-3 pb-2 border-b border-border uppercase">
                    {category}
                  </h4>
                  <div className="space-y-2">
                    {filteredTasks.filter(t => t.category === category).map((task, taskIdx) => (
                    <div
                      key={task.id}
                      className={cn(
                        "group flex flex-col gap-2 p-4 rounded-lg transition-all bg-accent/5 border border-accent/10 print-card",
                        task.completed ? "opacity-50" : "hover:shadow-sm"
                      )}
                      style={{ animationDelay: `${taskIdx * 50}ms` }}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => onToggle(task.id)}
                          className="mt-0.5 shrink-0"
                        >
                          {task.completed ? (
                            <CheckCircle2 className="w-5 h-5 text-accent" />
                          ) : (
                            <Circle className="w-5 h-5 text-ink-secondary/30 group-hover:text-ink-secondary/50 transition-colors" />
                          )}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            {editingTaskId === task.id ? (
                              <div className="flex-1 flex items-center gap-2">
                                <input
                                  autoFocus
                                  value={editingText}
                                  onChange={(e) => setEditingText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      onUpdateTask(task.id, editingText);
                                      setEditingTaskId(null);
                                    }
                                  }}
                                  className="flex-1 bg-paper border border-border rounded-lg px-3 py-1.5 text-base outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                                />
                                <button onClick={() => {
                                  onUpdateTask(task.id, editingText);
                                  setEditingTaskId(null);
                                }} className="p-1 text-emerald-600">
                                  <Check className="w-4 h-4" />
                                </button>
                                <button onClick={() => setEditingTaskId(null)} className="p-1 text-red-500">
                                  <CloseIcon className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <span className={cn(
                                "text-base font-serif leading-tight break-words text-ink",
                                task.completed && "line-through text-ink-secondary"
                              )}>
                                {task.text}
                              </span>
                            )}

                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 print:hidden">
                              {onAddTaskContext && (
                                <button
                                  onClick={() => {
                                    if (contextTaskId === task.id) {
                                      setContextTaskId(null);
                                      setContextText("");
                                      setContextPdf(null);
                                      setContextError(null);
                                    } else {
                                      setContextTaskId(task.id);
                                      setContextText("");
                                      setContextPdf(null);
                                      setContextError(null);
                                    }
                                  }}
                                  className={cn(
                                    "p-1.5 rounded-lg transition-colors",
                                    contextTaskId === task.id ? "text-accent bg-accent/10" : "text-ink-secondary/40 hover:text-accent hover:bg-accent/5"
                                  )}
                                  title="Add Context"
                                >
                                  <BookOpen className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {task.impactAnalysis && (
                                <button
                                  onClick={async () => {
                                    if (showImpactId === task.id) {
                                      setShowImpactId(null);
                                      return;
                                    }
                                    setShowImpactId(task.id);
                                    // Already cached for this harshness, or harshness hasn't changed from original
                                    const cachedFor = impactHarshness[task.id];
                                    if (cachedFor === aiHarshness) return;
                                    if (!cachedFor && aiHarshness === (originalHarshness || 'balanced')) return;
                                    // Harshness changed — regenerate
                                    setLoadingImpactId(task.id);
                                    const result = await regenerateImpactAnalysis(task.text, aiHarshness, userProfile, undefined);
                                    setImpactCache(prev => ({ ...prev, [task.id]: result }));
                                    setImpactHarshness(prev => ({ ...prev, [task.id]: aiHarshness }));
                                    setLoadingImpactId(null);
                                  }}
                                  className={cn(
                                    "p-1.5 rounded-lg transition-colors",
                                    showImpactId === task.id ? "text-accent bg-accent/10" : "text-ink-secondary/40 hover:text-accent hover:bg-accent/5"
                                  )}
                                  title="Impact Analysis"
                                >
                                  <Info className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setEditingTaskId(task.id);
                                  setEditingText(task.text);
                                }}
                                className="p-1.5 rounded-lg text-ink-secondary/40 hover:text-ink hover:bg-paper-muted transition-colors"
                                title="Edit Task"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => onAccept(task.id)}
                                className={cn(
                                  "p-1.5 rounded-lg transition-colors",
                                  task.accepted ? "text-emerald-600 bg-emerald-50" : "text-ink-secondary/40 hover:text-emerald-600 hover:bg-emerald-50"
                                )}
                                title={task.accepted ? "Accepted" : "Accept for Dashboard"}
                              >
                                {task.accepted ? <CheckCircle2 className="w-3.5 h-3.5 fill-emerald-600/10" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                              </button>
                              {task.accepted && onRegenerateMicroTasks && (
                                <button
                                  onClick={async () => {
                                    setRegeneratingTaskId(task.id);
                                    await onRegenerateMicroTasks(task.id);
                                    setRegeneratingTaskId(null);
                                  }}
                                  disabled={regeneratingTaskId === task.id}
                                  className={cn(
                                    "p-1.5 rounded-lg transition-colors",
                                    regeneratingTaskId === task.id
                                      ? "text-accent bg-accent/5"
                                      : "text-ink-secondary/40 hover:text-accent hover:bg-accent/5"
                                  )}
                                  title="Regenerate subtasks and micro-tasks"
                                >
                                  <RefreshCcw className={cn("w-3.5 h-3.5", regeneratingTaskId === task.id && "animate-spin")} />
                                </button>
                              )}
                              <button
                                onClick={() => onDelete(task.id)}
                                className="p-1.5 rounded-lg text-ink-secondary/40 hover:text-red-500 hover:bg-red-50 transition-colors"
                                title="Delete Task"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Impact Analysis */}
                          {showImpactId === task.id && task.impactAnalysis && (() => {
                            const impact = impactCache[task.id] || task.impactAnalysis;
                            const isLoading = loadingImpactId === task.id;

                            return (
                              <div className="mt-3 space-y-2 animate-scale-in">
                                {isLoading ? (
                                  <div className="p-4 bg-accent/5 border border-accent/10 rounded-lg flex items-center justify-center gap-2">
                                    <Loader2 className="w-4 h-4 text-accent animate-spin" />
                                    <span className="text-xs text-ink-secondary">Adjusting tone...</span>
                                  </div>
                                ) : (
                                  <>
                                    <div className="p-3.5 bg-accent/5 border border-accent/10 rounded-lg">
                                      <p className="text-[9px] font-semibold uppercase tracking-wider text-accent/60 mb-1">If you don't complete this task...</p>
                                      <p className="text-sm font-serif text-ink leading-relaxed">{impact.ifNotDone}</p>
                                    </div>
                                    <div className="p-3.5 bg-accent/5 border border-accent/10 rounded-lg">
                                      <p className="text-[9px] font-semibold uppercase tracking-wider text-accent/60 mb-1">If you do complete this task...</p>
                                      <p className="text-sm font-serif text-ink leading-relaxed">{impact.ifDone}</p>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })()}

                          {/* Add Context Panel */}
                          {contextTaskId === task.id && onAddTaskContext && (
                            <div className="mt-3 p-4 bg-accent/5 border border-accent/10 rounded-lg space-y-3 animate-scale-in">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-accent/60">Add Context</span>
                                <span className="text-[9px] text-ink-secondary/40">Regenerates subtasks & micro-tasks</span>
                              </div>
                              <textarea
                                value={contextText}
                                onChange={(e) => setContextText(e.target.value)}
                                placeholder="Describe what this task involves... (e.g. project requirements, specific steps, assignment details)"
                                rows={3}
                                maxLength={10000}
                                className="w-full bg-paper border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent placeholder:text-ink-secondary/30 text-ink resize-none"
                              />
                              <div className="flex items-center gap-3">
                                <input
                                  ref={pdfInputRef}
                                  type="file"
                                  accept=".pdf"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      if (file.type !== "application/pdf") {
                                        setContextError("Only PDF files are allowed");
                                        return;
                                      }
                                      if (file.size > 10 * 1024 * 1024) {
                                        setContextError("File too large (max 10MB)");
                                        return;
                                      }
                                      setContextPdf(file);
                                      setContextError(null);
                                    }
                                  }}
                                />
                                <button
                                  onClick={() => pdfInputRef.current?.click()}
                                  className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-secondary/50 hover:text-accent transition-colors px-3 py-1.5 rounded-md bg-paper border border-border hover:border-accent/30"
                                >
                                  <Upload className="w-3 h-3" />
                                  {contextPdf ? contextPdf.name : "Upload PDF"}
                                </button>
                                {contextPdf && (
                                  <button
                                    onClick={() => { setContextPdf(null); if (pdfInputRef.current) pdfInputRef.current.value = ""; }}
                                    className="text-[10px] text-red-400 hover:text-red-500"
                                  >
                                    Remove
                                  </button>
                                )}
                                <div className="flex-1" />
                                <button
                                  disabled={isUploadingContext || (!contextText.trim() && !contextPdf)}
                                  onClick={async () => {
                                    setIsUploadingContext(true);
                                    setContextError(null);
                                    try {
                                      await onAddTaskContext(task.id, entryDate, contextText, contextPdf || undefined);
                                      setContextTaskId(null);
                                      setContextText("");
                                      setContextPdf(null);
                                    } catch (err: any) {
                                      setContextError(err.message || "Failed to add context");
                                    } finally {
                                      setIsUploadingContext(false);
                                    }
                                  }}
                                  className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-4 py-1.5 rounded-md bg-accent text-white disabled:opacity-50 hover:brightness-110 transition-all"
                                >
                                  {isUploadingContext ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
                                  Regenerate
                                </button>
                              </div>
                              {contextError && (
                                <p className="text-xs text-red-500">{contextError}</p>
                              )}
                            </div>
                          )}

                          {/* Progress Bar */}
                          {task.accepted && (
                            <div className="mt-3 space-y-1.5">
                              <div className="flex justify-between items-center text-[9px] font-semibold uppercase tracking-wider text-ink-secondary/50">
                                <span>Task Completion</span>
                                <span>{Math.round(task.progress ?? 0)}%</span>
                              </div>
                              <div className="h-1 w-full bg-accent/10 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-accent rounded-full transition-all duration-500"
                                  style={{ width: `${task.progress ?? 0}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Current Micro-task */}
                          {task.accepted && task.currentMicroTask && (
                            <div className="mt-3 p-3 bg-accent/5 rounded-lg border border-accent/10">
                              <div className="flex items-center gap-2">
                                <button onClick={() => onToggle(task.currentMicroTask!.id)}>
                                  {task.currentMicroTask.completed ? (
                                    <CheckCircle2 className="w-4 h-4 text-accent" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-ink-secondary/30" />
                                  )}
                                </button>
                                <span className={cn(
                                  "text-xs font-sans",
                                  task.currentMicroTask.completed && "line-through text-ink-secondary/50"
                                )}>{task.currentMicroTask.text}</span>
                              </div>
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {editingDeadlineId === task.id ? (
                              <input
                                type="date"
                                defaultValue={task.deadline ? format(new Date(task.deadline), 'yyyy-MM-dd') : ''}
                                onChange={(e) => {
                                  if (e.target.value) {
                                    onUpdateDeadline(task.id, new Date(e.target.value).toISOString());
                                    setEditingDeadlineId(null);
                                  }
                                }}
                                onBlur={() => setEditingDeadlineId(null)}
                                className="text-[10px] font-semibold bg-paper border border-border rounded-lg px-2 py-1 text-ink-secondary"
                                autoFocus
                              />
                            ) : (
                              task.deadline && (
                                <button
                                  onClick={() => setEditingDeadlineId(task.id)}
                                  className={cn(
                                    "flex items-center gap-1 text-[10px] font-semibold uppercase tracking-tight hover:text-accent transition-colors",
                                    isPast(new Date(task.deadline)) && !isToday(new Date(task.deadline)) && !task.completed ? "text-accent font-bold" : "text-ink-secondary/50"
                                  )}
                                >
                                  <Clock className="w-3 h-3" />
                                  {format(new Date(task.deadline), 'MMM d')}
                                </button>
                              )
                            )}
                            {task.isRollover && (
                              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-tight text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                                <History className="w-3 h-3" />
                                {task.daysOld}d Rollover
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Subtasks */}
                      <div className="ml-8 mt-1 space-y-1.5 border-l-2 border-border pl-4">
                        {task.subtasks && task.subtasks.map(subtask => (
                          <div key={subtask.id} className="flex items-center justify-between gap-2 group/sub py-0.5">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <button onClick={() => onToggle(subtask.id)} className="shrink-0">
                                {subtask.completed ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                                ) : (
                                  <Circle className="w-3.5 h-3.5 text-ink-secondary/30 group-hover/sub:text-ink-secondary/50" />
                                )}
                              </button>
                              {editingSubtaskId === subtask.id ? (
                                <div className="flex items-center gap-1.5 flex-1">
                                  <input
                                    autoFocus
                                    value={editingSubtaskText}
                                    onChange={(e) => setEditingSubtaskText(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && editingSubtaskText.trim() && onUpdateSubtask) {
                                        onUpdateSubtask(task.id, subtask.id, editingSubtaskText.trim());
                                        setEditingSubtaskId(null);
                                      }
                                      if (e.key === 'Escape') setEditingSubtaskId(null);
                                    }}
                                    className="flex-1 bg-paper border border-border rounded px-2 py-0.5 text-sm outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                                  />
                                  <button onClick={() => {
                                    if (editingSubtaskText.trim() && onUpdateSubtask) onUpdateSubtask(task.id, subtask.id, editingSubtaskText.trim());
                                    setEditingSubtaskId(null);
                                  }} className="p-0.5 text-emerald-600"><Check className="w-3 h-3" /></button>
                                  <button onClick={() => setEditingSubtaskId(null)} className="p-0.5 text-red-500"><CloseIcon className="w-3 h-3" /></button>
                                </div>
                              ) : (
                                <span className={cn(
                                  "text-sm",
                                  subtask.completed && "line-through text-ink-secondary/50"
                                )}>
                                  {subtask.text}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {subtask.deadline && (
                                <span className="text-[9px] font-semibold text-ink-secondary/40">
                                  {format(new Date(subtask.deadline), 'MMM d')}
                                </span>
                              )}
                              {editingSubtaskId !== subtask.id && (
                                <>
                                  <button
                                    onClick={() => { setEditingSubtaskId(subtask.id); setEditingSubtaskText(subtask.text); }}
                                    className="opacity-0 group-hover/sub:opacity-100 p-0.5 text-ink-secondary/30 hover:text-ink transition-all"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => onDeleteSubtask(task.id, subtask.id)}
                                    className="opacity-0 group-hover/sub:opacity-100 p-0.5 text-ink-secondary/30 hover:text-red-500 transition-all"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}

                        <div className="flex items-center gap-2 pt-0.5 print:hidden">
                          <Plus className="w-3 h-3 text-ink-secondary/30" />
                          <input
                            placeholder="Add subtask..."
                            value={newSubtaskText[task.id] || ""}
                            onChange={(e) => setNewSubtaskText(prev => ({ ...prev, [task.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && newSubtaskText[task.id]) {
                                onAddSubtask(task.id, newSubtaskText[task.id]);
                                setNewSubtaskText(prev => ({ ...prev, [task.id]: "" }));
                              }
                            }}
                            className="bg-transparent text-xs outline-none placeholder:text-ink-secondary/25 w-full focus:placeholder:text-ink-secondary/40"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    )}

      {/* Content Ideas Section */}
      {contentIdeas.length > 0 && (
        <section>
          <div className="mb-6">
            <h3 className="text-2xl font-serif mb-1">Content Ideas</h3>
            <p className="text-xs text-ink/50 uppercase tracking-wider">Turn your reflections into creation</p>
          </div>

          <div className="space-y-4">
            {contentIdeas.map((idea, idx) => (
              <div
                key={idea.id || idx}
                className="group/idea space-y-5 p-5 bg-accent/5 border border-accent/10 rounded-lg transition-all animate-slide-up"
                style={{ animationDelay: `${idx * 80}ms` }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h4 className="text-lg font-serif italic text-ink mb-1.5">{idea.title}</h4>
                    <p className="text-sm text-ink/70 leading-relaxed">{idea.description}</p>
                  </div>
                  <button
                    onClick={() => onBookmarkIdea(idea.id)}
                    className="p-1 transition-colors"
                  >
                    <Star className={cn("w-4 h-4 transition-colors", idea.isBookmarked ? "text-ink fill-ink" : "text-ink/30 hover:text-ink/60")} />
                  </button>
                </div>

                <div className="grid gap-5">
                  {/* Long Form */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-serif italic text-ink">Long-Form / Podcast</span>
                      <button
                        onClick={() => onConvertIdea(idea.id, 'long')}
                        className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-tight text-ink/40 hover:text-accent transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Add to Tasks
                      </button>
                    </div>
                    <div className="pl-4 border-l-2 border-accent/15">
                      <p className="text-sm font-medium">{idea.youtubePodcast.title}</p>
                      <p className="text-xs text-ink/60 mt-0.5">{idea.youtubePodcast.description}</p>
                    </div>
                  </div>

                  {/* Short Form */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-serif italic text-ink">Short-Form Video</span>
                      <button
                        onClick={() => onConvertIdea(idea.id, 'short')}
                        className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-tight text-ink/40 hover:text-accent transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Add to Tasks
                      </button>
                    </div>
                    <div className="pl-4 border-l-2 border-accent/15 space-y-2">
                      <div>
                        <span className="text-[9px] font-semibold text-ink/40 uppercase mr-1.5">Text on Screen:</span>
                        <p className="text-xs text-ink/60 inline italic">"{idea.shortFormVideo.textOnScreen}"</p>
                      </div>
                      <div>
                        <span className="text-[9px] font-semibold text-ink/40 uppercase mr-1.5">Tips:</span>
                        <p className="text-xs text-ink/60 inline">{idea.shortFormVideo.tips}</p>
                      </div>
                      <div>
                        <span className="text-[9px] font-semibold text-ink/40 uppercase mr-1.5">1-Min Message:</span>
                        <p className="text-xs text-ink/60 inline leading-relaxed">{idea.shortFormVideo.passionateMessage}</p>
                      </div>
                    </div>
                  </div>

                  {/* Writing */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-serif italic text-ink">Substack / Medium</span>
                      <button
                        onClick={() => onConvertIdea(idea.id, 'substack')}
                        className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-tight text-ink/40 hover:text-accent transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Add to Tasks
                      </button>
                    </div>
                    <div className="pl-4 border-l-2 border-accent/15">
                      <p className="text-sm font-medium">{idea.substackMedium.title}</p>
                      <p className="text-xs text-ink/60 mt-0.5">{idea.substackMedium.description}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
