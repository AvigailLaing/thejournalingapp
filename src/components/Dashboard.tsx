import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Calendar as CalendarIcon, CheckCircle2, Circle, Clock, ArrowRight, Zap, ListChecks, Calendar, Loader2, Trash2, Plus } from 'lucide-react';
import { Task, MicroTask } from '../services/ai';
import { fetchAcceptedTasks } from '../services/api';
import { format, isToday, isTomorrow, isPast, addDays } from 'date-fns';
import { cn } from '../lib/utils';

interface DashboardProps {
  onToggleTask: (taskId: string, entryDate?: string) => void;
  onGenerateMicroTask: (taskId: string, entryDate?: string) => void;
  onUpdateDeadline: (taskId: string, deadline: string, entryDate?: string) => void;
  onDeleteTask?: (taskId: string, entryDate?: string) => void;
  onClearAllTasks?: () => void;
  onAddTask?: (text: string, category?: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onToggleTask, onGenerateMicroTask, onUpdateDeadline, onDeleteTask, onClearAllTasks, onAddTask }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [momentumTask, setMomentumTask] = useState<MicroTask | null>(null);
  const [completedMomentumText, setCompletedMomentumText] = useState<string | null>(null);
  const [microTaskView, setMicroTaskView] = useState<'today' | 'all'>('today');
  const [showMicroTasks, setShowMicroTasks] = useState(false);
  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null);
  const [newTaskText, setNewTaskText] = useState("");

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    setLoading(true);
    const data = await fetchAcceptedTasks();
    const sorted = data.sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });
    setTasks(sorted);
    setLoading(false);
  };

  const refreshTasks = async () => {
    const data = await fetchAcceptedTasks();
    const sorted = data.sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });
    setTasks(sorted);
  };

  const handleEasyMomentum = () => {
    const incompleteMicroTasks = tasks
      .filter(t => t.currentMicroTask && !t.currentMicroTask.completed)
      .map(t => t.currentMicroTask!);

    if (incompleteMicroTasks.length > 0) {
      const random = incompleteMicroTasks[Math.floor(Math.random() * incompleteMicroTasks.length)];
      setMomentumTask(random);
    } else {
      alert("No active micro-tasks found! Accept some big tasks first.");
    }
  };

  const groupedTasks = tasks.reduce((acc, task) => {
    if (!task.deadline) {
      const key = 'No Deadline';
      if (!acc[key]) acc[key] = [];
      acc[key].push(task);
      return acc;
    }

    const date = new Date(task.deadline);
    let key = format(date, 'EEEE, MMM d');
    if (isToday(date)) key = 'Today';
    else if (isTomorrow(date)) key = 'Tomorrow';
    else if (isPast(date) && !isToday(date)) key = 'Overdue';

    if (!acc[key]) acc[key] = [];
    acc[key].push(task);
    return acc;
  }, {} as Record<string, Task[]>);

  const sortedKeys = Object.keys(groupedTasks).sort((a, b) => {
    const order = ['Overdue', 'Today', 'Tomorrow'];
    const indexA = order.indexOf(a);
    const indexB = order.indexOf(b);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    if (a === 'No Deadline') return 1;
    if (b === 'No Deadline') return -1;
    return 0;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-ink-secondary font-medium">Loading your dashboard...</div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 h-full overflow-y-auto space-y-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif">Your Dashboard</h1>
          <p className="text-sm text-ink-secondary mt-1">Focus on what matters today</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMicroTasks(!showMicroTasks)}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 rounded-md text-[10px] font-medium uppercase tracking-wider transition-all",
              showMicroTasks ? "bg-accent text-white" : "bg-surface text-ink-secondary shadow-sm hover:shadow"
            )}
          >
            <ListChecks className="w-4 h-4" />
            {showMicroTasks ? "Main Tasks" : "Micro-tasks"}
          </button>
          <button
            onClick={handleEasyMomentum}
            className="flex items-center gap-2 px-3.5 py-2 rounded-md bg-accent/10 text-accent text-[10px] font-medium uppercase tracking-wider hover:bg-accent/15 transition-all"
          >
            <Zap className="w-4 h-4" />
            Easy Momentum
          </button>
        </div>
      </header>

      {/* Add Task */}
      {onAddTask && (
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-ink-secondary/30" />
          <input
            type="text"
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && newTaskText.trim()) {
                onAddTask(newTaskText.trim());
                setNewTaskText("");
                setTimeout(refreshTasks, 500);
              }
            }}
            placeholder="Add a task..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-secondary/30 text-ink font-serif border-b border-border/50 pb-1 focus:border-accent/30"
          />
        </div>
      )}

      {/* Momentum Builder */}
      {momentumTask && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-8 bg-accent/10 rounded-lg relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-4">
            <button onClick={() => setMomentumTask(null)} className="text-accent/40 hover:text-accent transition-colors">
              <Zap className="w-6 h-6" />
            </button>
          </div>
          <div className="relative z-10 space-y-4">
            <h3 className="text-xl font-serif italic">Momentum Builder</h3>
            <div className="flex items-center gap-4">
              <button
                onClick={async () => {
                  setCompletedMomentumText(momentumTask.text);
                  await onToggleTask(momentumTask.id, tasks.find(t => t.currentMicroTask?.id === momentumTask.id)?.entryDate);
                  await refreshTasks();
                  setTimeout(() => {
                    setCompletedMomentumText(null);
                    handleEasyMomentum();
                  }, 800);
                }}
                className="shrink-0"
              >
                {completedMomentumText ? (
                  <CheckCircle2 className="w-5 h-5 text-accent" />
                ) : (
                  <Circle className="w-5 h-5 text-ink-secondary/30 hover:text-accent transition-colors" />
                )}
              </button>
              <p className={cn(
                "text-base font-serif transition-all duration-300",
                completedMomentumText ? "line-through text-ink/40" : "text-ink"
              )}>
                {completedMomentumText || momentumTask.text}
              </p>
            </div>
            {(() => {
              const allSubtasks = tasks.flatMap(t => t.subtasks || []);
              const completedSubtasks = allSubtasks.filter(s => s.completed);
              const total = allSubtasks.length;
              const done = completedSubtasks.length;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between items-center text-[9px] font-semibold uppercase tracking-wider text-ink-secondary/40">
                    <span>Overall Progress</span>
                    <span>{done}/{total} micro-tasks · {pct}%</span>
                  </div>
                  <div className="h-1 w-full bg-accent/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-accent rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              );
            })()}
          </div>
        </motion.div>
      )}

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CheckCircle2 className="w-14 h-14 mb-4 text-ink-secondary/20" />
          <p className="text-xl font-semibold text-ink-secondary/40">Your dashboard is clear.</p>
          <p className="text-sm mt-2 max-w-xs text-ink-secondary/30">Accept tasks from your daily action items to see them here.</p>
        </div>
      ) : showMicroTasks ? (
        <div className="space-y-6">
          <div className="flex items-center gap-4 border-b border-border pb-3">
            <button
              onClick={() => setMicroTaskView('today')}
              className={cn(
                "text-[10px] font-semibold uppercase tracking-wider transition-all pb-1",
                microTaskView === 'today' ? "text-accent border-b-2 border-accent" : "text-ink-secondary/40 hover:text-ink-secondary"
              )}
            >
              Today's Wins
            </button>
            <button
              onClick={() => setMicroTaskView('all')}
              className={cn(
                "text-[10px] font-semibold uppercase tracking-wider transition-all pb-1",
                microTaskView === 'all' ? "text-accent border-b-2 border-accent" : "text-ink-secondary/40 hover:text-ink-secondary"
              )}
            >
              All Micro-tasks
            </button>
          </div>

          <div className="grid gap-3">
            {tasks
              .filter(t => t.currentMicroTask)
              .filter(t => microTaskView === 'all' || (t.deadline && isToday(new Date(t.deadline))))
              .map((task, idx) => (
                <motion.div
                  key={task.currentMicroTask!.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="p-5 bg-accent/5 border border-accent/10 rounded-lg flex items-center justify-between gap-4 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-4">
                    <button onClick={async () => {
                      await onToggleTask(task.currentMicroTask!.id, task.entryDate);
                      await refreshTasks();
                    }}>
                      {task.currentMicroTask!.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-accent" />
                      ) : (
                        <Circle className="w-5 h-5 text-ink-secondary/30" />
                      )}
                    </button>
                    <div>
                      <p className={cn(
                        "text-lg font-sans text-ink",
                        task.currentMicroTask!.completed && "line-through opacity-50"
                      )}>
                        {task.currentMicroTask!.text}
                      </p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary/40 mt-0.5">
                        Part of: {task.text}
                      </p>
                    </div>
                  </div>
                  {task.currentMicroTask!.completed && (
                    <span className="text-xs text-accent font-medium">
                      Done!
                    </span>
                  )}
                </motion.div>
              ))}
          </div>
        </div>
      ) : (
        <div className="space-y-10">
          {sortedKeys.map((group, groupIdx) => (
            <section key={group} className="space-y-3">
              <h2 className={cn(
                "text-lg font-serif italic pb-2 border-b flex items-center gap-2",
                group === 'Overdue' ? "text-ink border-accent/20" : "text-ink border-border"
              )}>
                {group === 'Overdue' && <Clock className="w-3 h-3" />}
                {group}
                <div className="flex-1" />
                <span className="text-ink-secondary/30 font-normal text-sm">{groupedTasks[group].length}</span>
                {groupIdx === 0 && onClearAllTasks && tasks.length > 0 && (
                  <button
                    onClick={async () => { if (confirm('Clear all accepted tasks?')) { onClearAllTasks(); await refreshTasks(); } }}
                    className="text-[10px] font-medium text-ink-secondary/40 hover:text-red-500 transition-colors ml-2"
                  >
                    Clear all
                  </button>
                )}
              </h2>
              <div className="grid gap-3">
                {groupedTasks[group].map((task, taskIdx) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: taskIdx * 0.05 }}
                    className={cn(
                      "group p-5 bg-accent/5 border border-accent/10 rounded-lg hover:shadow-sm transition-all flex flex-col gap-3",
                      task.completed && "opacity-50"
                    )}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <button className="shrink-0" onClick={async () => {
                          await onToggleTask(task.id, task.entryDate);
                          await refreshTasks();
                        }}>
                          {task.completed ? (
                            <CheckCircle2 className="w-5 h-5 text-accent" />
                          ) : (
                            <Circle className="w-5 h-5 text-ink-secondary/30" />
                          )}
                        </button>
                        <div>
                          <h3 className={cn(
                            "text-base leading-tight",
                            task.completed && "line-through text-ink-secondary"
                          )}>
                            {task.text}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-semibold uppercase tracking-tight text-ink-secondary bg-accent/5 px-2 py-0.5 rounded-md border border-border">
                              {task.category}
                            </span>
                            {editingDeadlineId === task.id ? (
                              <input
                                type="date"
                                autoFocus
                                defaultValue={task.deadline ? format(new Date(task.deadline), 'yyyy-MM-dd') : ''}
                                onChange={(e) => {
                                  if (e.target.value) {
                                    const newDeadline = new Date(e.target.value).toISOString();
                                    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, deadline: newDeadline } : t));
                                    onUpdateDeadline(task.id, newDeadline, task.entryDate);
                                    setEditingDeadlineId(null);
                                  }
                                }}
                                onBlur={() => setEditingDeadlineId(null)}
                                className="text-[10px] font-semibold bg-paper border border-border rounded-md px-2 py-0.5 text-ink-secondary"
                              />
                            ) : task.deadline ? (
                              <button
                                onClick={() => setEditingDeadlineId(task.id)}
                                className={cn(
                                  "text-[10px] font-semibold uppercase tracking-tight flex items-center gap-1 hover:text-accent transition-colors",
                                  isPast(new Date(task.deadline)) && !isToday(new Date(task.deadline)) && !task.completed
                                    ? "text-accent font-bold"
                                    : "text-ink-secondary/50"
                                )}
                              >
                                <Clock className="w-3 h-3" />
                                {format(new Date(task.deadline), 'MMM d')}
                              </button>
                            ) : (
                              <button
                                onClick={() => setEditingDeadlineId(task.id)}
                                className="text-[10px] font-semibold uppercase tracking-tight text-ink-secondary/25 hover:text-ink-secondary/50 transition-colors flex items-center gap-1"
                              >
                                <Clock className="w-3 h-3" />
                                Set deadline
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {task.subtasks && task.subtasks.length > 0 && (
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary/30">
                            {task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}
                          </div>
                        )}
                        {onDeleteTask && (
                          <button
                            onClick={async () => { onDeleteTask(task.id, task.entryDate); await refreshTasks(); }}
                            className="p-1 rounded text-ink-secondary/20 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                            title="Remove task"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <ArrowRight className="w-4 h-4 text-ink-secondary/20 group-hover:text-accent transition-colors" />
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {task.accepted !== false && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-[9px] font-semibold uppercase tracking-wider text-ink-secondary/40">
                          <span>Progress</span>
                          <span>{Math.round(task.progress ?? 0)}%</span>
                        </div>
                        <div className="h-1 w-full bg-accent/10 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-accent rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${task.progress ?? 0}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Current Micro-task */}
                    {task.currentMicroTask && !task.completed && (
                      <div className="p-3.5 bg-accent/5 rounded-xl border border-border flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <button onClick={async () => {
                            await onToggleTask(task.currentMicroTask!.id, task.entryDate);
                            await refreshTasks();
                          }}>
                            {task.currentMicroTask.completed ? (
                              <CheckCircle2 className="w-4 h-4 text-accent" />
                            ) : (
                              <Circle className="w-4 h-4 text-ink-secondary/30" />
                            )}
                          </button>
                          <span className="text-sm font-sans text-ink">
                            {task.currentMicroTask.text}
                          </span>
                        </div>
                        {task.currentMicroTask.completed && (
                          <span className="text-xs text-accent font-medium">
                            Done!
                          </span>
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
