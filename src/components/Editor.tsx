import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Save, Loader2, Bold, Italic, List, ListOrdered, Heading1, Heading2, Download, Quote as QuoteIcon, Music, X, Type } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { getWordCount, parseDate } from '../lib/utils';
import { analyzeMorningPages, RecurringTemplateInfo } from '../services/ai';
import { saveEntry, fetchRecentEntries } from '../services/api';
import { ContentIdea, Task } from '../services/ai';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

const WRITING_FONTS = [
  { value: '"Instrument Serif", serif', label: 'Instrument Serif' },
  { value: '"Playfair Display", serif', label: 'Playfair Display' },
  { value: '"Lora", serif', label: 'Lora' },
  { value: '"DM Sans", sans-serif', label: 'DM Sans' },
  { value: '"JetBrains Mono", monospace', label: 'JetBrains Mono' },
];

interface EditorProps {
  date: string;
  initialContent: string;
  initialSpotifyUrl?: string | null;
  onSave: (content: string, tasks?: Task[], spotifyUrl?: string | null, contentIdeas?: ContentIdea[], coachingAdvice?: string | null) => void;
  isReadOnly?: boolean;
  tasks?: Task[];
  contentIdeas?: ContentIdea[];
  showWritingLines?: boolean;
  writingFont?: string;
  onWritingFontChange?: (font: string) => void;
  aiHarshness?: string;
  userProfile?: Record<string, string>;
  recurringTemplates?: RecurringTemplateInfo[];
  userInsights?: string[];
}

export const Editor: React.FC<EditorProps> = ({ date, initialContent, initialSpotifyUrl, onSave, isReadOnly, tasks = [], contentIdeas = [], showWritingLines = true, writingFont, onWritingFontChange, aiHarshness = 'balanced', userProfile, recurringTemplates, userInsights }) => {
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isIdle, setIsIdle] = useState(true);
  const [wordCount, setWordCount] = useState(() => getWordCount(initialContent));
  const [isMouseInBottomThird, setIsMouseInBottomThird] = useState(false);
  const [spotifyUrl, setSpotifyUrl] = useState(initialSpotifyUrl || '');
  const [showSpotifyInput, setShowSpotifyInput] = useState(false);

  const lastTypedAt = useRef<number>(Date.now());
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'What\'s on your mind?',
      }),
    ],
    content: initialContent,
    editable: !isReadOnly,
    onUpdate: ({ editor }) => {
      lastTypedAt.current = Date.now();
      setIsIdle(false);
      setWordCount(getWordCount(editor.getText()));
    },
  });


  useEffect(() => {
    if (editor && initialContent !== editor.getHTML()) {
      editor.commands.setContent(initialContent);
      setWordCount(getWordCount(editor.getText()));
    }
  }, [initialContent, editor]);

  useEffect(() => {
    setSpotifyUrl(initialSpotifyUrl || '');
  }, [initialSpotifyUrl]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!isReadOnly);
    }
  }, [isReadOnly, editor]);

  useEffect(() => {
    if (isReadOnly) return;

    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastTypedAt.current > 3000) {
        setIsIdle(true);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isReadOnly]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const threshold = rect.height * (2 / 3);
    setIsMouseInBottomThird(relativeY > threshold);
  };

  const handleSave = async () => {
    if (!editor) return;
    setIsSaving(true);
    try {
      const content = editor.getHTML();
      await saveEntry({ date, content, word_count: wordCount, spotify_url: spotifyUrl });
      onSave(content, undefined, spotifyUrl);
    } finally {
      setIsSaving(false);
    }
  };

  // Autosave
  useEffect(() => {
    if (isReadOnly || !editor) return;
    const timer = setTimeout(() => {
      const content = editor.getHTML();
      saveEntry({ date, content, word_count: getWordCount(editor.getText()), spotify_url: spotifyUrl });
    }, 2000);
    return () => clearTimeout(timer);
  }, [editor?.getHTML(), spotifyUrl]);

  const handleAnalyze = async () => {
    if (!editor) return;
    const contentText = editor.getText();
    setIsAnalyzing(true);
    try {
      const recentEntries = await fetchRecentEntries(7, date);
      const { tasks, contentIdeas, coachingAdvice } = await analyzeMorningPages(contentText, aiHarshness, userProfile, recurringTemplates, userInsights, recentEntries);
      await saveEntry({
        date,
        content: editor.getHTML(),
        word_count: wordCount,
        tasks,
        content_ideas: contentIdeas,
        spotify_url: spotifyUrl,
        coaching_advice: coachingAdvice
      });
      onSave(editor.getHTML(), tasks, spotifyUrl, contentIdeas, coachingAdvice);
    } catch (error) {
      console.error(error);
      alert("AI analysis failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!pdfRef.current) return;
    setIsDownloading(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      await html2pdf()
        .from(pdfRef.current)
        .set({
          margin: 0,
          filename: `Thoughtpad-${date}.pdf`,
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all', 'css'] },
        })
        .save();
    } catch (error) {
      console.error('PDF generation error:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const getSpotifyEmbedUrl = (url: string) => {
    if (!url) return '';
    try {
      const spotifyId = url.split('/').pop()?.split('?')[0];
      if (url.includes('track')) return `https://open.spotify.com/embed/track/${spotifyId}`;
      if (url.includes('album')) return `https://open.spotify.com/embed/album/${spotifyId}`;
      if (url.includes('playlist')) return `https://open.spotify.com/embed/playlist/${spotifyId}`;
      return '';
    } catch (e) {
      return '';
    }
  };

  const showButtons = isIdle || isMouseInBottomThird || isSaving || isAnalyzing || isDownloading;

  if (!editor) return null;

  const embedUrl = getSpotifyEmbedUrl(spotifyUrl);


  return (
    <motion.div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col h-full max-w-4xl mx-auto px-4 md:px-8 pt-4 md:pt-8 relative"
    >
      {/* Header Section */}
      <div className="mb-5 flex justify-between items-end shrink-0">
        <div>
          <h2 className="text-3xl font-serif italic">{format(parseDate(date), 'EEEE, MMMM do')}</h2>
          <p className="text-xs text-ink/50 uppercase tracking-wider mt-1">Journal Entry</p>
        </div>
        <span className="text-sm text-ink/40">{wordCount} words</span>
      </div>

      {/* Toolbar */}
      {!isReadOnly && (
        <div className="flex flex-wrap items-center gap-1 mb-4 px-2 py-1.5 bg-accent/5 border border-accent/10 rounded-lg shrink-0">
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={cn("p-2 rounded-lg transition-colors", editor.isActive('bold') ? "bg-accent/15 text-accent" : "text-ink-secondary hover:bg-white/60 hover:text-ink")}
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={cn("p-2 rounded-lg transition-colors", editor.isActive('italic') ? "bg-accent/15 text-accent" : "text-ink-secondary hover:bg-white/60 hover:text-ink")}
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              className={cn("p-2 rounded-lg transition-colors", editor.isActive('blockquote') ? "bg-accent/15 text-accent" : "text-ink-secondary hover:bg-white/60 hover:text-ink")}
            >
              <QuoteIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="w-px h-5 bg-accent/10 mx-1" />
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              className={cn("p-2 rounded-lg transition-colors", editor.isActive('heading', { level: 1 }) ? "bg-accent/15 text-accent" : "text-ink-secondary hover:bg-white/60 hover:text-ink")}
            >
              <Heading1 className="w-4 h-4" />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              className={cn("p-2 rounded-lg transition-colors", editor.isActive('heading', { level: 2 }) ? "bg-accent/15 text-accent" : "text-ink-secondary hover:bg-white/60 hover:text-ink")}
            >
              <Heading2 className="w-4 h-4" />
            </button>
          </div>
          <div className="w-px h-5 bg-accent/10 mx-1" />
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              className={cn("p-2 rounded-lg transition-colors", editor.isActive('bulletList') ? "bg-accent/15 text-accent" : "text-ink-secondary hover:bg-white/60 hover:text-ink")}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              className={cn("p-2 rounded-lg transition-colors", editor.isActive('orderedList') ? "bg-accent/15 text-accent" : "text-ink-secondary hover:bg-white/60 hover:text-ink")}
            >
              <ListOrdered className="w-4 h-4" />
            </button>
          </div>
          <div className="w-px h-5 bg-accent/10 mx-1" />
          <div className="relative">
            <button
              onClick={() => setShowFontPicker(!showFontPicker)}
              className={cn(
                "p-2 rounded-lg transition-colors flex items-center gap-2",
                showFontPicker ? "bg-accent/10 text-accent" : "text-ink-secondary hover:bg-paper hover:text-ink"
              )}
            >
              <Type className="w-4 h-4" />
              <span className="text-xs font-medium hidden sm:inline">Font</span>
            </button>
            {showFontPicker && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-accent/10 rounded-lg shadow-lg py-1 z-50 min-w-[180px]">
                {WRITING_FONTS.map(f => (
                  <button
                    key={f.value}
                    onClick={() => {
                      onWritingFontChange?.(f.value);
                      setShowFontPicker(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm transition-colors",
                      writingFont === f.value ? "bg-accent/10 text-accent" : "hover:bg-paper-muted text-ink"
                    )}
                    style={{ fontFamily: f.value }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="w-px h-5 bg-accent/10 mx-1" />
          <button
            onClick={() => setShowSpotifyInput(!showSpotifyInput)}
            className={cn(
              "p-2 rounded-lg transition-colors flex items-center gap-2",
              spotifyUrl ? "bg-accent/10 text-accent" : "text-ink-secondary hover:bg-paper hover:text-ink"
            )}
          >
            <Music className="w-4 h-4" />
            <span className="text-xs font-medium hidden sm:inline">Song of the Day</span>
          </button>
        </div>
      )}

      {/* Spotify Input */}
      <AnimatePresence>
        {showSpotifyInput && !isReadOnly && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            className="mb-4 overflow-hidden"
          >
            <div className="p-4 bg-accent/5 border border-accent/10 rounded-xl">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Spotify Song URL</label>
                <button onClick={() => setShowSpotifyInput(false)} className="text-ink-secondary hover:text-ink">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={spotifyUrl}
                  onChange={(e) => setSpotifyUrl(e.target.value)}
                  placeholder="https://open.spotify.com/track/..."
                  className="flex-1 bg-accent/5 border border-accent/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
                {spotifyUrl && (
                  <button
                    onClick={() => setSpotifyUrl('')}
                    className="px-3 py-2 text-xs font-medium text-ink-secondary hover:text-accent transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              <p className="text-[10px] text-ink-secondary/60 mt-2">Paste a Spotify track, album, or playlist link to embed it.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spotify Embed Display */}
      {embedUrl && (
        <div className="mb-6 shrink-0">
          <iframe
            src={embedUrl}
            width="100%"
            height="80"
            frameBorder="0"
            allowTransparency={true}
            allow="encrypted-media"
            className="rounded-xl border border-accent/10"
          ></iframe>
        </div>
      )}

      {/* Writing Area */}
      <div className={cn("flex-1 flex flex-col relative min-h-0", showWritingLines && "writing-lines")}>
        <EditorContent editor={editor} className="flex-1 overflow-y-auto" />

        {/* Fixed Footer Dock */}
        <div className="absolute bottom-0 left-0 right-0 p-6 pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            {/* Action Buttons */}
            <motion.div
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="flex gap-2 p-1.5 rounded-xl pointer-events-auto"
            >
              {!isReadOnly && (
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-accent/15 to-accent/8 hover:from-accent/20 hover:to-accent/12 transition-all text-sm font-serif italic text-ink disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Get Insights
                </button>
              )}
              <button
                onClick={handleDownloadPDF}
                disabled={isDownloading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-accent/15 to-accent/8 hover:from-accent/20 hover:to-accent/12 transition-colors text-sm font-serif italic text-ink"
              >
                {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                PDF
              </button>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Hidden PDF content */}
      <div className="fixed -left-[9999px] top-0">
        <div
          ref={pdfRef}
          className="journal-entry bg-white text-black"
          style={{
            width: '210mm',
            padding: '25mm 20mm',
            minHeight: '297mm',
            fontFamily: '"DM Sans", sans-serif',
            fontSize: '12pt',
            lineHeight: '1.8',
          }}
        >
          <h1 style={{ fontFamily: '"Instrument Serif", serif', fontSize: '28pt', fontStyle: 'italic', marginBottom: '8px' }}>
            {format(parseDate(date), 'EEEE, MMMM do')}
          </h1>
          <p style={{ fontSize: '9pt', textTransform: 'uppercase', letterSpacing: '3px', color: '#C47A8E', marginBottom: '24px' }}>
            Journal Entry
          </p>

          {spotifyUrl && (
            <div style={{ marginBottom: '24px', padding: '12px 16px', background: '#FFF5F7', borderRadius: '8px', border: '1px solid #F0E0E4', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Music className="w-5 h-5" style={{ color: '#C47A8E' }} />
              <div>
                <p style={{ fontSize: '8pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.4, marginBottom: '2px' }}>Song of the Day</p>
                <p style={{ fontSize: '10pt', fontStyle: 'italic' }}>{spotifyUrl}</p>
              </div>
            </div>
          )}

          <div
            style={{ fontSize: '12pt', lineHeight: '2', marginBottom: '32px' }}
            dangerouslySetInnerHTML={{ __html: editor.getHTML() }}
          />

          {tasks.length > 0 && (
            <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #F0E0E4' }}>
              <h2 style={{ fontFamily: '"Instrument Serif", serif', fontSize: '20pt', fontStyle: 'italic', marginBottom: '16px' }}>Extracted Actions</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {tasks.map(task => (
                  <div key={task.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: task.completed ? '2px solid #C47A8E' : '2px solid #D4C4C8', background: task.completed ? '#C47A8E' : 'transparent', marginTop: '4px', flexShrink: 0 }} />
                    <span style={{ textDecoration: task.completed ? 'line-through' : 'none', opacity: task.completed ? 0.5 : 1 }}>{task.text}</span>
                    <span style={{ fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.4, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{task.category}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: '40px', fontSize: '8pt', opacity: 0.3, textAlign: 'center' }}>
            {wordCount} words
          </div>
        </div>
      </div>
    </motion.div>
  );
};
