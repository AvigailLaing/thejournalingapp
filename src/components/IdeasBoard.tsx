import React, { useState } from 'react';
import { ContentIdea } from '../services/ai';
import { Youtube, Smartphone, FileText, Star, LayoutGrid, Columns3, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

type Status = 'idea' | 'in_progress' | 'finished';

interface IdeasBoardProps {
  ideas: ContentIdea[];
  onStatusChange: (ideaId: string, entryDate: string, status: Status) => void;
}

const COLUMNS: { id: Status; label: string; dotColor: string }[] = [
  { id: 'idea',        label: 'Just an Idea',  dotColor: 'bg-ink-secondary/40' },
  { id: 'in_progress', label: 'In Progress',   dotColor: 'bg-amber-400' },
  { id: 'finished',    label: 'Finished',      dotColor: 'bg-emerald-500' },
];

const IdeaCard: React.FC<{
  idea: ContentIdea;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}> = ({ idea, draggable, onDragStart }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      className={cn(
        "bg-accent/5 border border-accent/10 rounded-lg p-4 space-y-3 hover:shadow-sm transition-all",
        draggable && "cursor-grab active:cursor-grabbing active:scale-[1.02] active:shadow-lg active:opacity-80"
      )}
    >
      <div
        className="flex items-start gap-2 overflow-hidden cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="min-w-0 overflow-hidden flex-1">
          <h3 className="text-lg font-serif italic leading-tight break-words text-ink">{idea.title}</h3>
          <p className="text-xs text-ink/60 mt-1 leading-relaxed line-clamp-2 break-words">{idea.description}</p>
        </div>
        <ChevronDown className={cn(
          "w-4 h-4 text-ink/30 shrink-0 mt-1 transition-transform",
          expanded && "rotate-180"
        )} />
      </div>

      {idea.entryDate && (
        <div className="text-[9px] font-semibold uppercase tracking-wider text-ink/30">
          From {idea.entryDate}
        </div>
      )}

      {!expanded && (
        <div className="grid gap-1.5 pt-2 border-t border-border overflow-hidden">
          <div className="flex items-center gap-1.5 text-[10px] text-ink/50 overflow-hidden">
            <Youtube className="w-3 h-3 shrink-0 text-accent-warm" />
            <span className="truncate block">{idea.youtubePodcast.title}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-ink/50 overflow-hidden">
            <Smartphone className="w-3 h-3 shrink-0 text-accent-soft" />
            <span className="truncate block">{idea.shortFormVideo.textOnScreen}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-ink/50 overflow-hidden">
            <FileText className="w-3 h-3 shrink-0 text-accent-cool" />
            <span className="truncate block">{idea.substackMedium.title}</span>
          </div>
        </div>
      )}

      {expanded && (
        <div className="grid gap-5 pt-2 border-t border-border animate-fade-in">
          {/* Long Form */}
          <div className="space-y-2">
            <span className="text-sm font-serif italic text-ink">Long-Form / Podcast</span>
            <div className="pl-4 border-l-2 border-accent/15">
              <p className="text-sm font-medium">{idea.youtubePodcast.title}</p>
              <p className="text-xs text-ink/60 mt-0.5">{idea.youtubePodcast.description}</p>
            </div>
          </div>

          {/* Short Form */}
          <div className="space-y-2">
            <span className="text-sm font-serif italic text-ink">Short-Form Video</span>
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
            <span className="text-sm font-serif italic text-ink">Substack / Medium</span>
            <div className="pl-4 border-l-2 border-accent/15">
              <p className="text-sm font-medium">{idea.substackMedium.title}</p>
              <p className="text-xs text-ink/60 mt-0.5">{idea.substackMedium.description}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const IdeasBoard: React.FC<IdeasBoardProps> = ({ ideas, onStatusChange }) => {
  const [viewMode, setViewMode] = useState<'grid' | 'board'>('grid');
  const [dragOverCol, setDragOverCol] = useState<Status | null>(null);

  const handleDragStart = (e: React.DragEvent, ideaId: string) => {
    e.dataTransfer.setData('ideaId', ideaId);
  };

  const handleDrop = (e: React.DragEvent, status: Status) => {
    e.preventDefault();
    const ideaId = e.dataTransfer.getData('ideaId');
    const idea = ideas.find(i => i.id === ideaId);
    if (idea?.entryDate) onStatusChange(ideaId, idea.entryDate, status);
    setDragOverCol(null);
  };

  const byStatus = (status: Status) => ideas.filter(i => (i.status || 'idea') === status);

  if (ideas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <Star className="w-12 h-12 mb-4 text-ink-secondary/20" />
        <p className="text-lg font-semibold text-ink-secondary/40">No starred ideas yet.</p>
        <p className="text-sm mt-2 text-ink-secondary/30">Star content ideas from your entries to track them here.</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 h-full overflow-y-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif">Ideas Board</h2>
          <p className="text-sm text-ink/50 mt-1">
            {ideas.length} starred idea{ideas.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              "p-2.5 rounded-lg border transition-all",
              viewMode === 'grid'
                ? "bg-accent text-white border-accent"
                : "bg-surface border-border text-ink/40 hover:border-ink/20 hover:text-ink/60"
            )}
            title="Grid View"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('board')}
            className={cn(
              "p-2.5 rounded-lg border transition-all",
              viewMode === 'board'
                ? "bg-accent text-white border-accent"
                : "bg-surface border-border text-ink/40 hover:border-ink/20 hover:text-ink/60"
            )}
            title="Board View"
          >
            <Columns3 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ideas.map((idea, idx) => (
            <div key={idea.id} className="animate-slide-up" style={{ animationDelay: `${idx * 60}ms` }}>
              <IdeaCard idea={idea} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map(col => (
            <div
              key={col.id}
              onDrop={(e) => handleDrop(e, col.id)}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id); }}
              onDragLeave={() => setDragOverCol(null)}
              className={cn(
                "rounded-xl p-4 border transition-all min-h-64",
                dragOverCol === col.id
                  ? "border-accent bg-accent/5 border-solid"
                  : "border-border border-dashed bg-paper-muted"
              )}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className={cn("w-2 h-2 rounded-full", col.dotColor)} />
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
                  {col.label}
                </h3>
                <span className="text-[9px] bg-border text-ink-secondary rounded-full px-2 py-0.5 font-semibold ml-auto">
                  {byStatus(col.id).length}
                </span>
              </div>

              <div className="space-y-3">
                {byStatus(col.id).map(idea => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idea.id)}
                  />
                ))}
                {byStatus(col.id).length === 0 && (
                  <div className="text-center py-10 text-ink-secondary/25 text-xs">
                    Drop ideas here
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
