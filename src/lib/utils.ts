import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatDate = (date: Date) => {
  return format(date, 'yyyy-MM-dd');
};

export const getWordCount = (text: string) => {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
};

export const parseDate = (dateStr: string) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const calculateStreak = (entries: { date: string; word_count: number }[]) => {
  if (entries.length === 0) return 0;
  
  const sortedDates = entries
    .map(e => e.date)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  let currentStreak = 0;
  let lastDate = today;

  // If they haven't written today and didn't write yesterday, streak is broken
  if (sortedDates[0] !== today && sortedDates[0] !== yesterday) {
    return 0;
  }

  // Start from the most recent entry
  let checkDate = new Date(sortedDates[0]);
  
  for (let i = 0; i < sortedDates.length; i++) {
    const entryDate = sortedDates[i];
    const expectedDate = format(checkDate, 'yyyy-MM-dd');
    
    if (entryDate === expectedDate) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  
  return currentStreak;
};

import { format } from 'date-fns';
