import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import fs from "fs";
import { PDFParse } from "pdf-parse";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_PATH || "morning_pages.db";
const db = new Database(dbPath);

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    date TEXT PRIMARY KEY,
    content TEXT,
    word_count INTEGER,
    tasks TEXT,
    content_ideas TEXT,
    spotify_url TEXT,
    coaching_advice TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Task context table
db.exec(`
  CREATE TABLE IF NOT EXISTS task_context (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    entry_date TEXT NOT NULL,
    context_text TEXT,
    pdf_text TEXT,
    pdf_filename TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Recurring task templates table
db.exec(`
  CREATE TABLE IF NOT EXISTS recurring_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    instructions TEXT,
    pdf_text TEXT,
    pdf_filename TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// User insights table (pills)
db.exec(`
  CREATE TABLE IF NOT EXISTS user_insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Candidate insights — first-mention holding area. Promoted to user_insights on 2nd mention.
db.exec(`
  CREATE TABLE IF NOT EXISTS insight_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL UNIQUE,
    mention_count INTEGER NOT NULL DEFAULT 1,
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Upload directory for PDFs
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config with security
const ALLOWED_MIME_TYPES = ["application/pdf"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new Error("Only PDF files are allowed"));
      return;
    }
    // Sanitize filename — strip path traversal
    file.originalname = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, true);
  },
});

// Helper: extract text from PDF with validation
async function extractPdfText(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  // Verify PDF magic bytes
  if (buffer[0] !== 0x25 || buffer[1] !== 0x50 || buffer[2] !== 0x44 || buffer[3] !== 0x46) {
    throw new Error("Invalid PDF file");
  }
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  await parser.load();
  const numPages = parser.doc?.numPages || 0;
  const pages: string[] = [];
  for (let i = 1; i <= numPages; i++) {
    const text = await parser.getPageText(i);
    pages.push(text);
  }
  return pages.join("\n").slice(0, 50000); // Cap extracted text at 50k chars
}

// Helper: sanitize user text input
function sanitizeText(input: string): string {
  if (typeof input !== "string") return "";
  return input.slice(0, 10000).trim(); // Cap at 10k chars
}

// Ensure coaching_advice, content_ideas, and spotify_url columns exist
try {
  db.prepare("ALTER TABLE entries ADD COLUMN coaching_advice TEXT").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE entries ADD COLUMN content_ideas TEXT").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE entries ADD COLUMN spotify_url TEXT").run();
} catch (e) {}

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = parseInt(process.env.PORT || "3000");

  // API Routes
  app.get("/api/entries", (req, res) => {
    try {
      const entries = db.prepare("SELECT date, word_count, spotify_url FROM entries ORDER BY date DESC").all();
      res.json(entries);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch entries" });
    }
  });

  app.get("/api/entries/:date", (req, res) => {
    try {
      const entry = db.prepare("SELECT * FROM entries WHERE date = ?").get(req.params.date);
      res.json(entry || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch entry" });
    }
  });

  // Recent entry content — used by AI for continuity across the last N days.
  app.get("/api/entries/recent/content", (req, res) => {
    try {
      const days = Math.max(1, Math.min(30, parseInt((req.query.days as string) || "7")));
      const excludeDate = typeof req.query.exclude === "string" ? req.query.exclude : "";
      const rows = db
        .prepare(
          `SELECT date, content FROM entries
             WHERE date >= date('now', ?) AND date != ?
             ORDER BY date DESC`
        )
        .all(`-${days} days`, excludeDate);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recent entries" });
    }
  });

  app.post("/api/entries", (req, res) => {
    const { date, content, word_count, tasks, content_ideas, spotify_url, coaching_advice } = req.body;
    try {
      const upsert = db.prepare(`
        INSERT INTO entries (date, content, word_count, tasks, content_ideas, spotify_url, coaching_advice)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
          content = excluded.content,
          word_count = excluded.word_count,
          tasks = COALESCE(excluded.tasks, entries.tasks),
          content_ideas = COALESCE(excluded.content_ideas, entries.content_ideas),
          spotify_url = excluded.spotify_url,
          coaching_advice = COALESCE(excluded.coaching_advice, entries.coaching_advice)
      `);
      upsert.run(
        date, 
        content, 
        word_count, 
        tasks ? JSON.stringify(tasks) : null, 
        content_ideas ? JSON.stringify(content_ideas) : null,
        spotify_url || null,
        coaching_advice || null
      );
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to save entry" });
    }
  });

  app.delete("/api/entries/:date", (req, res) => {
    try {
      db.prepare("DELETE FROM entries WHERE date = ?").run(req.params.date);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete entry" });
    }
  });

  app.post("/api/entries/:date/tasks", (req, res) => {
    const { tasks } = req.body;
    try {
      const update = db.prepare("UPDATE entries SET tasks = ? WHERE date = ?");
      update.run(JSON.stringify(tasks), req.params.date);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update tasks" });
    }
  });

  app.get("/api/tasks/accepted", (req, res) => {
    try {
      const entries = db.prepare("SELECT tasks FROM entries WHERE tasks IS NOT NULL").all();
      const acceptedTasks: any[] = [];
      entries.forEach((entry: any) => {
        const tasks = JSON.parse(entry.tasks);
        if (Array.isArray(tasks)) {
          tasks.forEach((task: any) => {
            if (task.accepted) {
              acceptedTasks.push(task);
            }
          });
        }
      });
      res.json(acceptedTasks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch accepted tasks" });
    }
  });

  app.get("/api/ideas/bookmarked", (req, res) => {
    try {
      const entries = db.prepare("SELECT date, content_ideas FROM entries WHERE content_ideas IS NOT NULL").all() as any[];
      const bookmarked: any[] = [];
      entries.forEach((entry) => {
        try {
          const ideas = JSON.parse(entry.content_ideas);
          if (Array.isArray(ideas)) {
            ideas.filter((i: any) => i.isBookmarked).forEach((idea: any) => {
              bookmarked.push({ ...idea, entryDate: entry.date });
            });
          }
        } catch (_) {}
      });
      res.json(bookmarked);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bookmarked ideas" });
    }
  });

  app.post("/api/entries/:date/ideas", (req, res) => {
    const { ideas } = req.body;
    try {
      db.prepare("UPDATE entries SET content_ideas = ? WHERE date = ?").run(JSON.stringify(ideas), req.params.date);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update ideas" });
    }
  });

  app.patch("/api/entries/:date/ideas/:id", (req, res) => {
    const { date, id } = req.params;
    const updates = req.body;
    try {
      const entry = db.prepare("SELECT content_ideas FROM entries WHERE date = ?").get(date) as any;
      if (!entry?.content_ideas) return res.status(404).json({ error: "Not found" });
      const ideas = JSON.parse(entry.content_ideas);
      const newIdeas = ideas.map((idea: any) => idea.id === id ? { ...idea, ...updates } : idea);
      db.prepare("UPDATE entries SET content_ideas = ? WHERE date = ?").run(JSON.stringify(newIdeas), date);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update idea" });
    }
  });

  // --- Task Context API ---

  // Upload context (text and/or PDF) for a task
  app.post("/api/tasks/:taskId/context", upload.single("pdf"), async (req, res) => {
    try {
      const { taskId } = req.params;
      const entryDate = sanitizeText(req.body.entry_date || "");
      const contextText = sanitizeText(req.body.context_text || "");

      let pdfText = "";
      let pdfFilename = "";

      if (req.file) {
        try {
          pdfText = await extractPdfText(req.file.path);
          pdfFilename = req.file.originalname;
        } finally {
          // Always clean up uploaded file after extraction
          fs.unlinkSync(req.file.path);
        }
      }

      if (!contextText && !pdfText) {
        return res.status(400).json({ error: "Provide either text context or a PDF" });
      }

      // Upsert context for this task
      const existing = db.prepare("SELECT id FROM task_context WHERE task_id = ? AND entry_date = ?").get(taskId, entryDate) as any;
      if (existing) {
        db.prepare(`UPDATE task_context SET context_text = ?, pdf_text = ?, pdf_filename = ? WHERE id = ?`)
          .run(contextText || null, pdfText || null, pdfFilename || null, existing.id);
      } else {
        db.prepare(`INSERT INTO task_context (task_id, entry_date, context_text, pdf_text, pdf_filename) VALUES (?, ?, ?, ?, ?)`)
          .run(taskId, entryDate, contextText || null, pdfText || null, pdfFilename || null);
      }

      // Return the combined context for AI use
      res.json({ success: true, context: [contextText, pdfText].filter(Boolean).join("\n\n") });
    } catch (error: any) {
      console.error("Task context error:", error);
      res.status(error.message === "Only PDF files are allowed" ? 400 : 500)
        .json({ error: error.message || "Failed to save task context" });
    }
  });

  // Get context for a task
  app.get("/api/tasks/:taskId/context", (req, res) => {
    try {
      const { taskId } = req.params;
      const entryDate = req.query.entry_date as string || "";
      const ctx = db.prepare("SELECT * FROM task_context WHERE task_id = ? AND entry_date = ?").get(taskId, entryDate);
      res.json(ctx || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch task context" });
    }
  });

  // --- Recurring Templates API ---

  // List all templates
  app.get("/api/templates", (_req, res) => {
    try {
      const templates = db.prepare("SELECT * FROM recurring_templates ORDER BY updated_at DESC").all();
      res.json(templates);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  // Create a template
  app.post("/api/templates", upload.single("pdf"), async (req, res) => {
    try {
      const name = sanitizeText(req.body.name || "");
      const instructions = sanitizeText(req.body.instructions || "");

      if (!name) {
        return res.status(400).json({ error: "Template name is required" });
      }

      let pdfText = "";
      let pdfFilename = "";

      if (req.file) {
        try {
          pdfText = await extractPdfText(req.file.path);
          pdfFilename = req.file.originalname;
        } finally {
          fs.unlinkSync(req.file.path);
        }
      }

      const result = db.prepare(
        `INSERT INTO recurring_templates (name, instructions, pdf_text, pdf_filename) VALUES (?, ?, ?, ?)`
      ).run(name, instructions || null, pdfText || null, pdfFilename || null);

      const template = db.prepare("SELECT * FROM recurring_templates WHERE id = ?").get(result.lastInsertRowid);
      res.json(template);
    } catch (error: any) {
      console.error("Template creation error:", error);
      res.status(500).json({ error: error.message || "Failed to create template" });
    }
  });

  // Update a template
  app.put("/api/templates/:id", upload.single("pdf"), async (req, res) => {
    try {
      const { id } = req.params;
      const name = sanitizeText(req.body.name || "");
      const instructions = sanitizeText(req.body.instructions || "");
      const clearPdf = req.body.clear_pdf === "true";

      if (!name) {
        return res.status(400).json({ error: "Template name is required" });
      }

      let pdfText: string | null = null;
      let pdfFilename: string | null = null;

      if (req.file) {
        try {
          pdfText = await extractPdfText(req.file.path);
          pdfFilename = req.file.originalname;
        } finally {
          fs.unlinkSync(req.file.path);
        }
      } else if (!clearPdf) {
        // Keep existing PDF data
        const existing = db.prepare("SELECT pdf_text, pdf_filename FROM recurring_templates WHERE id = ?").get(id) as any;
        if (existing) {
          pdfText = existing.pdf_text;
          pdfFilename = existing.pdf_filename;
        }
      }

      db.prepare(
        `UPDATE recurring_templates SET name = ?, instructions = ?, pdf_text = ?, pdf_filename = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(name, instructions || null, pdfText, pdfFilename, id);

      const template = db.prepare("SELECT * FROM recurring_templates WHERE id = ?").get(id);
      res.json(template);
    } catch (error: any) {
      console.error("Template update error:", error);
      res.status(500).json({ error: error.message || "Failed to update template" });
    }
  });

  // Delete a template
  app.delete("/api/templates/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM recurring_templates WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  // --- User Insights API ---

  // Get all insights
  app.get("/api/insights", (_req, res) => {
    try {
      const insights = db.prepare("SELECT * FROM user_insights ORDER BY created_at DESC").all();
      res.json(insights);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch insights" });
    }
  });

  // Add a manual insight
  app.post("/api/insights", (req, res) => {
    try {
      const text = sanitizeText(req.body.text || "");
      if (!text) return res.status(400).json({ error: "Text is required" });
      const source = req.body.source === "journal" ? "journal" : req.body.source === "onboarding" ? "onboarding" : "manual";
      try {
        const result = db.prepare("INSERT INTO user_insights (text, source) VALUES (?, ?)").run(text, source);
        const insight = db.prepare("SELECT * FROM user_insights WHERE id = ?").get(result.lastInsertRowid);
        res.json(insight);
      } catch (e: any) {
        if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
          return res.json({ duplicate: true });
        }
        throw e;
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to add insight" });
    }
  });

  // Bulk add insights (from AI extraction)
  app.post("/api/insights/bulk", (req, res) => {
    try {
      const items: { text: string; source: string }[] = req.body.insights || [];
      const insert = db.prepare("INSERT OR IGNORE INTO user_insights (text, source) VALUES (?, ?)");
      const added: any[] = [];
      for (const item of items.slice(0, 20)) {
        const text = sanitizeText(item.text);
        if (!text) continue;
        const source = item.source === "journal" ? "journal" : item.source === "onboarding" ? "onboarding" : "manual";
        const result = insert.run(text, source);
        if (result.changes > 0) {
          added.push(db.prepare("SELECT * FROM user_insights WHERE id = ?").get(result.lastInsertRowid));
        }
      }
      res.json({ added });
    } catch (error) {
      res.status(500).json({ error: "Failed to add insights" });
    }
  });

  // Delete an insight
  app.delete("/api/insights/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM user_insights WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete insight" });
    }
  });

  // --- Insight Candidates API ---
  // First-mention insights live here until mentioned a 2nd time, then promote to user_insights.

  app.get("/api/insights/candidates", (_req, res) => {
    try {
      const rows = db
        .prepare("SELECT * FROM insight_candidates ORDER BY mention_count DESC, last_seen DESC")
        .all();
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch candidates" });
    }
  });

  // Bulk upsert candidates. On 2nd mention, promote to user_insights and remove from candidates.
  // Returns { promoted: [...confirmed insights], candidates: [...updated candidate rows] }.
  app.post("/api/insights/candidates/bulk", (req, res) => {
    try {
      const items: { text: string }[] = req.body.insights || [];
      const promoted: any[] = [];
      const candidates: any[] = [];

      const getCandidate = db.prepare("SELECT * FROM insight_candidates WHERE text = ?");
      const getConfirmed = db.prepare("SELECT id FROM user_insights WHERE text = ?");
      const insertCandidate = db.prepare("INSERT INTO insight_candidates (text) VALUES (?)");
      const bumpCandidate = db.prepare(
        "UPDATE insight_candidates SET mention_count = mention_count + 1, last_seen = CURRENT_TIMESTAMP WHERE id = ?"
      );
      const deleteCandidate = db.prepare("DELETE FROM insight_candidates WHERE id = ?");
      const promoteToInsight = db.prepare(
        "INSERT OR IGNORE INTO user_insights (text, source) VALUES (?, 'journal')"
      );
      const getInsight = db.prepare("SELECT * FROM user_insights WHERE id = ?");

      for (const item of items.slice(0, 20)) {
        const text = sanitizeText(item.text);
        if (!text) continue;

        // Skip if already a confirmed insight
        if (getConfirmed.get(text)) continue;

        const existing: any = getCandidate.get(text);
        if (!existing) {
          const result = insertCandidate.run(text);
          candidates.push(getCandidate.get(text));
          continue;
        }

        // Second+ mention — promote and remove from candidates
        const result = promoteToInsight.run(text);
        if (result.changes > 0) {
          promoted.push(getInsight.get(result.lastInsertRowid));
        }
        deleteCandidate.run(existing.id);
      }

      res.json({ promoted, candidates });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to process candidates" });
    }
  });

  // Manually promote a candidate to a confirmed insight.
  app.post("/api/insights/candidates/:id/promote", (req, res) => {
    try {
      const candidate: any = db
        .prepare("SELECT * FROM insight_candidates WHERE id = ?")
        .get(req.params.id);
      if (!candidate) {
        return res.status(404).json({ error: "Candidate not found" });
      }
      const result = db
        .prepare("INSERT OR IGNORE INTO user_insights (text, source) VALUES (?, 'journal')")
        .run(candidate.text);
      db.prepare("DELETE FROM insight_candidates WHERE id = ?").run(candidate.id);
      const insight =
        result.changes > 0
          ? db.prepare("SELECT * FROM user_insights WHERE id = ?").get(result.lastInsertRowid)
          : db.prepare("SELECT * FROM user_insights WHERE text = ?").get(candidate.text);
      res.json({ insight });
    } catch (error) {
      res.status(500).json({ error: "Failed to promote candidate" });
    }
  });

  app.delete("/api/insights/candidates/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM insight_candidates WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete candidate" });
    }
  });

  // Handle multer errors
  app.use((err: any, _req: any, res: any, next: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File too large. Maximum size is 10MB." });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err.message === "Only PDF files are allowed") {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
