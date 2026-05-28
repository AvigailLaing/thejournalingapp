import React from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Trash2, Edit2 } from 'lucide-react';
import { cn, parseDate } from '../lib/utils';

interface CalendarProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  entries: { date: string; word_count: number }[];
  onDeleteEntry?: (date: string) => void;
  onEditEntry?: (date: string) => void;
}

export const Calendar: React.FC<CalendarProps> = ({ selectedDate, onSelectDate, entries, onDeleteEntry, onEditEntry }) => {
  const [currentMonth, setCurrentMonth] = React.useState(new Date(selectedDate));

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const hasEntry = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    if (!Array.isArray(entries)) return null;
    return entries.find(e => e.date === dateStr);
  };

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-semibold text-ink">{format(currentMonth, 'MMMM yyyy')}</h3>
        <div className="flex gap-1">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-1.5 hover:bg-paper rounded-lg transition-colors text-ink-secondary hover:text-ink"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-1.5 hover:bg-paper rounded-lg transition-colors text-ink-secondary hover:text-ink"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center mb-2">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
          <div key={`${day}-${i}`} className="text-[10px] font-semibold text-ink-secondary/50 uppercase">{day}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startOfMonth(currentMonth).getDay() }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}

        {days.map(day => {
          const entry = hasEntry(day);
          const isSelected = isSameDay(day, parseDate(selectedDate));
          const isCurrent = isToday(day);

          return (
            <button
              key={day.toString()}
              onClick={() => onSelectDate(format(day, 'yyyy-MM-dd'))}
              className={cn(
                "aspect-square flex flex-col items-center justify-center rounded-lg transition-all relative text-sm",
                isSelected
                  ? "bg-accent text-white font-semibold shadow-sm"
                  : "hover:bg-paper text-ink",
                isCurrent && !isSelected && "ring-1 ring-accent/30 font-semibold"
              )}
            >
              <span>{format(day, 'd')}</span>
              {entry && (
                <div className={cn(
                  "w-1 h-1 rounded-full mt-0.5",
                  isSelected ? "bg-white/60" : "bg-accent/50"
                )} />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-8 pt-5 border-t border-border">
        <div className="flex items-center gap-2 text-ink-secondary mb-3">
          <CalendarIcon className="w-3.5 h-3.5" />
          <span className="text-[10px] font-semibold uppercase tracking-wider">Recent Entries</span>
        </div>
        <div className="space-y-1">
          {Array.isArray(entries) && entries.slice(0, 5).map(entry => (
            <div
              key={entry.date}
              className="group flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-paper transition-colors"
            >
              <button
                onClick={() => onSelectDate(entry.date)}
                className="flex-1 text-left min-w-0"
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-ink group-hover:text-accent transition-colors">
                    {format(new Date(entry.date), 'MMM d, yyyy')}
                  </span>
                  <span className="text-[10px] font-mono text-ink-secondary/50">{entry.word_count} words</span>
                </div>
              </button>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {onEditEntry && (
                  <button
                    onClick={() => onEditEntry(entry.date)}
                    className="p-1 rounded text-ink-secondary/40 hover:text-accent transition-colors"
                    title="Edit entry"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                )}
                {onDeleteEntry && (
                  <button
                    onClick={() => onDeleteEntry(entry.date)}
                    className="p-1 rounded text-ink-secondary/40 hover:text-red-500 transition-colors"
                    title="Delete entry"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
