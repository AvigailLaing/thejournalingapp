import { GoogleGenAI, Type } from "@google/genai";

export interface UserProfile {
  name?: string;
  role?: string;
  goals?: string;
  obstacles?: string;
  context?: string;
}

export interface RecentEntrySnippet {
  date: string;
  content: string;
}

// Build the context blocks for coaching prompts. Each bucket has a clearly distinct role
// so the model doesn't conflate them — today's entry is primary, recent entries are for
// short-term continuity, and profile/insights are stakes-only (the "why this matters").
const buildCoachingContext = (
  profile?: UserProfile,
  userInsights?: string[],
  recentEntries?: RecentEntrySnippet[]
): string => {
  const blocks: string[] = [];

  const profileGoals: string[] = [];
  if (profile) {
    if (profile.name) profileGoals.push(`Name: ${profile.name}`);
    if (profile.role) profileGoals.push(`Role: ${profile.role}`);
    if (profile.goals) profileGoals.push(`Declared long-term goals: ${profile.goals}`);
    if (profile.obstacles) profileGoals.push(`Known obstacles: ${profile.obstacles}`);
    if (profile.context) profileGoals.push(`Additional context: ${profile.context}`);
  }
  if (profileGoals.length > 0) {
    blocks.push(
      `USER PROFILE (long-term goals, self-declared). Use ONLY as the "why this short-term push matters" — never name-drop as extra stressors, never cite unless it connects naturally to today's plan:\n${profileGoals.join('\n')}`
    );
  }

  if (userInsights && userInsights.length > 0) {
    blocks.push(
      `CONFIRMED DURABLE PATTERNS (stable facts the user has shown repeatedly). Reference AT MOST ONE, and only if it directly reinforces today's plan (e.g. "you work best with momentum" to justify "start now"). Do NOT list them as decoration. Do NOT reference patterns unrelated to today's entry:\n${userInsights.map(i => `• ${i}`).join('\n')}`
    );
  }

  if (recentEntries && recentEntries.length > 0) {
    const snippets = recentEntries
      .slice(0, 7)
      .map((e) => `[${e.date}]\n${(e.content || '').replace(/<[^>]*>/g, ' ').slice(0, 600)}`)
      .join('\n\n---\n\n');
    blocks.push(
      `RECENT ENTRIES (last 7 days, oldest→newest). Use ONLY for natural continuity — e.g. if the user did something yesterday that proves they can do today's task, cite it. Do NOT pull specific people, one-off events, or unrelated details from these. Do NOT reach back if there is no natural thread:\n${snippets}`
    );
  }

  if (blocks.length === 0) return '';
  return `\n\n${blocks.join('\n\n')}\n`;
};

// Back-compat wrapper for non-coaching callers (impact analysis, etc.)
const buildProfileContext = (profile?: UserProfile, userInsights?: string[]): string => {
  return buildCoachingContext(profile, userInsights, undefined);
};

export interface SubTask {
  id: string;
  text: string;
  completed: boolean;
  deadline?: string;
  accepted?: boolean;
}

export interface MicroTask {
  id: string;
  text: string;
  completed: boolean;
  completedAt?: string;
}

export interface Task {
  id: string;
  text: string;
  completed: boolean;
  category: string;
  deadline?: string;
  subtasks?: SubTask[];
  microTasks?: MicroTask[];
  currentMicroTask?: MicroTask;
  progress?: number;
  created_at?: string;
  isRollover?: boolean;
  daysOld?: number;
  accepted?: boolean;
  entryDate?: string;
  impactAnalysis?: {
    ifDone: string;
    ifNotDone: string;
  };
}

export interface ContentIdea {
  id: string;
  title: string;
  description: string;
  isBookmarked?: boolean;
  status?: 'idea' | 'in_progress' | 'finished';
  entryDate?: string;
  youtubePodcast: { title: string; description: string };
  shortFormVideo: {
    textOnScreen: string;
    tips: string;
    passionateMessage: string;
  };
  substackMedium: { title: string; description: string };
}

export interface Entry {
  date: string;
  content: string;
  word_count: number;
  tasks: Task[] | null;
  content_ideas?: ContentIdea[] | null;
  spotify_url?: string | null;
  coaching_advice?: string | null;
}

export interface RecurringTemplateInfo {
  name: string;
  instructions: string | null;
  pdf_text: string | null;
}

export const analyzeMorningPages = async (content: string, harshness: string = 'balanced', profile?: UserProfile, recurringTemplates?: RecurringTemplateInfo[], userInsights?: string[], recentEntries?: RecentEntrySnippet[]): Promise<{ tasks: Task[], contentIdeas: ContentIdea[], coachingAdvice: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const todayISO = new Date().toISOString().split('T')[0];
  const maxDeadlineISO = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Today's date is ${todayStr} (${todayISO}). Use this as the reference for ALL deadlines.
${buildCoachingContext(profile, userInsights, recentEntries)}
TONE/HARSHNESS LEVEL: "${harshness}"
${harshness === 'gentle' ? `- Be warm, encouraging, and soft. Frame setbacks as gentle possibilities, not scary outcomes. Focus on positive reinforcement.
- The "current path" should be honest but not alarming. Impact analysis should motivate through hope, not fear.
- Still reference SPECIFIC details from their writing (names, projects, apps, classes, people, dollar amounts). Never be generic.` : ''}${harshness === 'hype' ? `- Be DELUSIONALLY motivational. You are their biggest hype-man. Every task they do could be THE thing that changes their life. Exaggerate the positive outcomes massively.
- Use specific numbers and bold predictions: "at LEAST 500 people will see this tonight", "you're practically guaranteed to gain 1,000 followers if you keep this up", "this one video could literally go viral".
- Frame every small action as the domino that starts an avalanche. Doing OS notes on time? That means they'll have time to create content. Creating content? That means they're building an empire. One reel? That's the start of a brand.
- The "current path" should still be honest but brief — spend 80% of the energy on the INSANELY exciting "taking action" path. Paint a picture so exciting they can't NOT do the task.
- Reference SPECIFIC details from their writing — project names, dollar amounts, follower counts, app names. But inflate the upside dramatically.
- Use energy words: "LITERALLY", "genuinely", "this is your moment", "you're so close", "imagine when", "this is exactly how [successful person] started".
- Impact analysis "ifDone" should read like a movie montage of their success. "ifNotDone" should be brief and more like "you'd be leaving SO much on the table" rather than doom.
- The coaching advice should make them feel like they're one productive day away from everything clicking into place.` : ''}${harshness === 'balanced' ? `- Be honest and direct but kind. State consequences clearly without being dramatic. Mix encouragement with real talk.
- Reference SPECIFIC details from their writing (names, projects, apps, classes, people, dollar amounts). Never be generic.
- Impact analysis should be realistic — neither sugarcoated nor catastrophizing.` : ''}${harshness === 'tough' ? `- Be blunt and direct. No fluff. State hard truths plainly. Make inaction feel costly.
- Reference SPECIFIC details from their writing (names, projects, apps, classes, people, dollar amounts, social media handles). Use their own words against them.
- The "current path" should be uncomfortably specific — paint a picture of their actual life deteriorating with real details from what they wrote.
- The "taking action" path should be equally specific — reference their actual goals, projects, and dollar amounts.` : ''}${harshness === 'brutal' ? `- Be brutally honest. No sugarcoating. Be the coach that says what nobody else will.
- Reference SPECIFIC details from their writing — use exact names, projects, apps, dollar amounts, social media handles, class names, company names. Quote their own words back at them. The more specific, the harder it hits.
- The "general" coaching paragraph should call out their EXACT behavior pattern by name. If they're procrastinating, name the specific thing they're avoiding and the specific distraction they're using. Use phrases like "you are acting like a ___", "stop treating ___ like ___".
- The "current path" should paint a vivid, SPECIFIC picture: reference their actual GPA, their actual internship, their actual business revenue, their actual app name. Make them see the exact future where nothing changes.
- The "taking action" path should be equally vivid with specific outcomes: exact revenue numbers, exact project names launched, exact habits changed.
- Impact analysis should be a wake-up call with specific consequences. Don't say "you might fall behind" — say exactly what falls apart and what succeeds, with names and numbers.
- Swear if it fits the energy. Be the friend who grabs them by the shoulders.` : ''}

Analyze the following morning pages entry.
    1. Identify recurring themes, worries, or desires that can be translated into actionable to-do items.
    2. IMPORTANT: Separate unrelated tasks into distinct items. NEVER group multiple assignments, projects, or distinct items together in one task or subtask. Each assignment, each project, each errand gets its OWN task. (e.g., "Contact psychiatrist and pick up prescription at Walgreens" MUST be two separate tasks. "Assignments 1 and 2" MUST be two separate tasks: "Assignment 1" and "Assignment 2". NEVER create a subtask like "Complete assignments 1 & 2" — always split them.)
    3. Assign realistic deadlines for each task (relative to today, ${todayISO}).
       - If the user's text mentions a specific date or day (e.g. "midterm is Thursday", "due Friday"), USE that date but cap it at 7 days from today (no later than ${maxDeadlineISO}).
       - Otherwise, default to "Today" for quick tasks or "Tomorrow" for tasks that need more prep.
       - ALL deadlines are hard-capped at 7 days from today (no later than ${maxDeadlineISO}). Deadlines should be URGENT — assume the user needs to act NOW.
    3b. SUBTASKS: Every task MUST have at least 2 subtasks that break it down into concrete steps. Larger or multi-step tasks should have 3-5 subtasks. Each subtask should be a specific, actionable step — not vague. Give each subtask its own deadline (same day or before the parent task deadline). NEVER skip subtasks.
    4. IMPACT ANALYSIS — THIS IS CRITICAL. For EACH task, write a DETAILED impact analysis. Each "ifDone" and "ifNotDone" field MUST be MINIMUM 3 sentences long (4-5 preferred). ONE-SENTENCE RESPONSES ARE A FAILURE. Describe in HYPER-SPECIFIC detail how the user's life/feelings/reality will change if they DO vs DON'T do this task. Reference specific details from their writing — project names, dollar amounts, deadlines, people, classes. Match the tone/harshness level above. For brutal mode, be ruthless — use language like "you're just another mediocre loser", "pathetic excuses", "finish the damn work". Make it sting. Each impact analysis should cover: the immediate consequence, the emotional/psychological effect, and the downstream ripple effect on their other goals.
    5. Generate creative content ideas based on the writing.
    5b. BONUS TASKS: If the user has a profile with goals, generate 2-3 EXTRA tasks based on their profile goals that they should be working on even if they didn't mention them in today's journal entry. These are recurring high-priority goals they need constant nudges on (e.g., "Post on @coachingwithavigail", "Complete 1 web security lesson for MongoDB internship prep"). Give these tasks the same impact analysis treatment. Categorize them appropriately (e.g., "Business", "Career").
    6. Provide structured "coaching advice". Match the tone/harshness level above.
       - "general" (THE NOTE FOR YOU — 3-5 sentences, personal-letter voice). STRICT CONSTRUCTION RULES:
           a) OPEN with today's plan using words and specifics from TODAY'S journal entry — the actual tasks, deadlines, people, or classes they wrote about today. The first sentence must make it obvious you read today's entry.
           b) If (and only if) a RECENT ENTRY (last 7 days) contains a natural proof-point or thread — e.g. they did a similar task yesterday, or they flagged this same stressor recently — weave it in as momentum/continuity. If there's no natural thread, SKIP this and do not force it.
           c) Use the USER PROFILE's declared long-term goals as the "why this short-term push matters" — tie today's work to their long-term aim as stakes. Example: "clear this stats final well and you actually have time to prep for [long-term goal]." Only do this if today's plan plausibly connects to the long-term goal.
           d) You MAY reference at most ONE CONFIRMED DURABLE PATTERN, and only if it directly reinforces the action in today's plan (e.g. "you work best with momentum, so start with X now"). Never list patterns as decoration.
           e) HARD BAN: do not name-drop specific people, projects, classes, or events that are NOT in today's entry (even if they appear in past entries or insights). Do not list stressors the user didn't write about today. The goal is grounded, not comprehensive.
           f) End with a concrete first action drawn from today's entry.
       - "currentPath" (days/months/year): What happens if they CONTINUE on their current trajectory. Use specifics from TODAY's entry primarily; long-term goals from profile are fine to reference as stakes. Each timeframe should escalate.
       - "newPath" (days/months/year): What happens if they TAKE ACTION right now. Same specificity rules — anchored in today's plan, long-term goals as the payoff.
       - The magic is in the connection between today's work and long-term stakes, NOT in how many facts you can cram in. A note that references ONE long-term goal tied tightly to today's plan beats a note that name-drops five insights.

${recurringTemplates && recurringTemplates.length > 0 ? `
RECURRING TASK TEMPLATES — The user has saved these instructions for tasks they do regularly. If ANY task you generate matches one of these templates (by name or topic), use the template's instructions to create MORE SPECIFIC and ACCURATE subtasks:
${recurringTemplates.map(t => `- "${t.name}": ${[t.instructions, t.pdf_text ? '(PDF instructions provided)' : ''].filter(Boolean).join(' ')}`).join('\n')}
` : ''}
    Morning Pages:
    ${content}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          coachingAdvice: {
            type: Type.OBJECT,
            properties: {
              general: { type: Type.STRING },
              currentPath: {
                type: Type.OBJECT,
                properties: {
                  days: { type: Type.STRING },
                  months: { type: Type.STRING },
                  year: { type: Type.STRING },
                },
                required: ["days", "months", "year"],
              },
              newPath: {
                type: Type.OBJECT,
                properties: {
                  days: { type: Type.STRING },
                  months: { type: Type.STRING },
                  year: { type: Type.STRING },
                },
                required: ["days", "months", "year"],
              },
            },
            required: ["general", "currentPath", "newPath"],
          },
          tasks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                category: { type: Type.STRING },
                deadline: { type: Type.STRING, description: "ISO date string for a realistic deadline" },
                impactAnalysis: {
                  type: Type.OBJECT,
                  properties: {
                    ifDone: { type: Type.STRING, description: "MINIMUM 3-5 sentences. Vivid, specific description of what happens if they complete this task. Cover the immediate win, emotional relief, and downstream momentum. Reference specific names, projects, and details from their writing. Never write just one sentence." },
                    ifNotDone: { type: Type.STRING, description: "MINIMUM 3-5 sentences. Vivid, specific description of what happens if they DON'T do this task. Cover the immediate consequence, emotional toll, and long-term trajectory. Reference specific names, projects, and details from their writing. Never write just one sentence." },
                  },
                  required: ["ifDone", "ifNotDone"],
                },
                subtasks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      text: { type: Type.STRING },
                      deadline: { type: Type.STRING, description: "ISO date string for an incremental deadline" },
                    },
                    required: ["text", "deadline"],
                  },
                },
              },
              required: ["text", "category", "deadline", "impactAnalysis"],
            },
          },
          contentIdeas: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                youtubePodcast: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                  },
                  required: ["title", "description"],
                },
                shortFormVideo: {
                  type: Type.OBJECT,
                  properties: {
                    textOnScreen: { type: Type.STRING },
                    tips: { type: Type.STRING },
                    passionateMessage: { type: Type.STRING },
                  },
                  required: ["textOnScreen", "tips", "passionateMessage"],
                },
                substackMedium: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                  },
                  required: ["title", "description"],
                },
              },
              required: ["title", "description", "youtubePodcast", "shortFormVideo", "substackMedium"],
            },
          },
        },
        required: ["tasks", "contentIdeas", "coachingAdvice"],
      },
    },
  });

  const result = JSON.parse(response.text || '{"tasks":[], "contentIdeas":[], "coachingAdvice": {}}');
  
  const tasks = result.tasks.map((t: any, index: number) => ({
    id: `task-${Date.now()}-${index}`,
    text: t.text,
    category: t.category,
    completed: false,
    deadline: t.deadline,
    impactAnalysis: t.impactAnalysis,
    created_at: new Date().toISOString(),
    subtasks: t.subtasks?.map((st: any, sIndex: number) => ({
      id: `subtask-${Date.now()}-${index}-${sIndex}`,
      text: st.text,
      completed: false,
      deadline: st.deadline,
    })),
  }));

  const contentIdeas = result.contentIdeas.map((idea: any, index: number) => ({
    ...idea,
    id: `idea-${Date.now()}-${index}`,
    isBookmarked: false,
  }));

  return { tasks, contentIdeas, coachingAdvice: JSON.stringify(result.coachingAdvice) };
};

export const getEncouragingMessage = async (streak: number): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate a short, cozy, and encouraging one-sentence message to motivate someone to write their morning pages today. 
    The user currently has a writing streak of ${streak} days. 
    Make it feel warm and supportive, like a gentle friend.`,
  });

  return response.text || "Your pages are waiting for you. Every word is a step toward clarity.";
};

export const generateMicroTask = async (task: Task, existingMicroTasks: MicroTask[] = []): Promise<MicroTask> => {
  const all = await generateAllMicroTasks(task, 1);
  return all[0];
};

export const generateAllMicroTasks = async (task: Task, count: number = 5, templateContext?: string): Promise<MicroTask[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

  const subtaskContext = task.subtasks && task.subtasks.length > 0
    ? `\nThe user has broken this task into the following subtasks:\n${task.subtasks.map((st, i) => `${i + 1}. "${st.text}"`).join('\n')}`
    : '';

  // When template context exists, use a completely different prompt that prioritizes the user's workflow
  const prompt = templateContext
    ? `The user has a main task: "${task.text}".

THE USER HAS PROVIDED EXACT INSTRUCTIONS FOR HOW THEY DO THIS TASK. You MUST follow these instructions step-by-step and convert each step into tiny micro-tasks. Do NOT invent your own steps. Do NOT add steps about textbooks, reading, or anything the user didn't mention.

USER'S INSTRUCTIONS:
${templateContext}
${subtaskContext}

Convert the above instructions into a COMPLETE list of micro-tasks. Each micro-task should be ONE tiny action (1-5 minutes). The user has ADHD — make starting effortless.

RULES:
- Follow the user's workflow EXACTLY in order. Every step they described should become 1-3 micro-tasks.
- Use the SPECIFIC tools/apps/websites they mentioned (Canvas, NotebookLM, etc). Do NOT substitute with generic alternatives.
- NEVER use vague verbs like "Complete", "Finish", "Do", or "Work on". Use: "Open", "Click", "Navigate to", "Download", "Upload", "Type", "Look at".
- Generate AS MANY micro-tasks as needed to cover the ENTIRE workflow. This could be 15, 30, or even 50+ tasks. Do not cut short.
- The first micro-task should be the very first physical/digital action to begin.`
    : `The user has a main task: "${task.text}".
    They have ADHD and find big tasks intimidating. The ENTIRE POINT of micro-tasks is to make starting effortless.
    Generate exactly ${count} EXTREMELY tiny, brain-dead easy "micro-tasks" in logical sequential order.

    CRITICAL RULES:
    - Each micro-task should take 1-5 minutes MAX. If it takes longer, break it down further.
    - The first micro-task should ALWAYS be a physical/digital action to BEGIN (e.g., "Open Canvas in your browser", "Open the textbook to chapter 3", "Pull up the Google Doc").
    - NEVER use vague verbs like "Complete", "Finish", "Do", or "Work on". Use specific actions: "Open", "Read", "Type", "Click", "Look at", "Write one sentence about".
    - Each micro-task = ONE small action, not a full task. "Complete the quiz and submit" is NOT a micro-task. "Open the quiz" IS a micro-task.
    - Think of it like giving instructions to someone who is paralyzed by overwhelm — tell them exactly what to click, open, read, or type.${subtaskContext}

    Example for "Complete Assignment 1: Quiz":
    1. "Open Canvas in your browser"
    2. "Navigate to the Assignment 1 Quiz page"
    3. "Read the first question carefully"
    4. "Answer the first 3 questions"
    5. "Answer the remaining questions and hit Submit"`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          microTasks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING, description: "The tiny micro-task text" }
              },
              required: ["text"]
            }
          }
        },
        required: ["microTasks"]
      }
    }
  });

  const result = JSON.parse(response.text || '{"microTasks": [{"text": "Take the first small step."}]}');
  return result.microTasks.map((m: any, i: number) => ({
    id: `micro-${Date.now()}-${i}`,
    text: m.text,
    completed: false
  }));
};

export const regenerateImpactAnalysis = async (taskText: string, harshness: string, profile?: UserProfile, userInsights?: string[]): Promise<{ ifDone: string; ifNotDone: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

  const toneGuide = {
    gentle: `Be warm, encouraging, and soft. Frame setbacks as gentle possibilities, not scary outcomes. Focus on positive reinforcement.
Still reference SPECIFIC details — if the user's profile mentions projects, goals, names, use them. Never be generic.`,
    hype: `Be DELUSIONALLY motivational. Exaggerate the positive outcomes massively. Use specific numbers and bold predictions.
"ifDone" should read like a movie montage of their success — inflate follower counts, revenue, impact. Make every small action sound like the start of an empire.
"ifNotDone" should be brief and more like "you'd be leaving SO much potential on the table" — not doom, just FOMO on their own greatness.
Reference SPECIFIC details from their profile — but inflate the upside dramatically. Use energy words: "LITERALLY", "genuinely", "this is your moment".`,
    balanced: `Be honest and direct but kind. State consequences clearly without being dramatic. Mix encouragement with real talk.
Reference SPECIFIC details from the user's profile — names, projects, goals, dollar amounts. Never be generic.
Impact analysis should be realistic — neither sugarcoated nor catastrophizing.`,
    tough: `Be blunt and direct. No fluff. State hard truths plainly. Make inaction feel costly.
Reference SPECIFIC details from the user's profile — names, projects, apps, dollar amounts, social media handles. Use their own goals against them.
Paint a picture of their actual life deteriorating with real details. The "taking action" path should be equally specific — reference their actual goals and projects.`,
    brutal: `Be brutally honest. No sugarcoating. Be the coach that says what nobody else will.
Reference SPECIFIC details — use exact names, projects, apps, dollar amounts, social media handles, class names, company names from their profile. The more specific, the harder it hits.
Call out their EXACT behavior pattern by name. If they're procrastinating, name the specific thing they're avoiding. Use phrases like "you are acting like a ___", "stop treating ___ like ___".
Paint a vivid, SPECIFIC picture: reference their actual GPA, internship, business revenue, app name. Make them see the exact future where nothing changes.
The "taking action" path should be equally vivid with specific outcomes: exact revenue numbers, project names launched, habits changed.
This should be a wake-up call with specific consequences. Don't say "you might fall behind" — say exactly what falls apart and what succeeds, with names and numbers.
Swear if it fits the energy. Be the friend who grabs them by the shoulders.`,
  }[harshness] || '';

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `The user has this task: "${taskText}".

TONE/HARSHNESS LEVEL: "${harshness}"
${toneGuide}
${buildProfileContext(profile, userInsights)}
Write an impact analysis for this task. CRITICAL LENGTH REQUIREMENT: Each field MUST be MINIMUM 3 sentences. Do NOT write just one sentence. One-sentence responses are UNACCEPTABLE and a failure. Write 3-5 detailed, vivid sentences for EACH field.

- "ifNotDone": What happens if they DON'T do this task? Be specific and vivid about consequences to their life, feelings, and reality. Paint a picture of what their day/week/month looks like if they keep avoiding this. MINIMUM 3 sentences. Describe the emotional toll, the practical fallout, and the long-term trajectory.
- "ifDone": What happens if they DO this task? Be specific and vivid about the positive outcome — how they'll feel, what changes, what doors open. MINIMUM 3 sentences. Describe the immediate relief, the momentum it creates, and the future it unlocks.

${harshness === 'brutal' ? `EXAMPLE of expected brutal output length and energy:
ifNotDone: "You keep stalling on this and you know exactly what happens — nothing. Another week goes by where you 'meant to' but didn't, and that guilt compounds into a weight you carry into every other task. Your goals aren't waiting for you to feel ready. They're expiring. And every day you don't act, someone else with half your talent but twice your discipline is eating your lunch."
ifDone: "You knock this out and suddenly you're not the person who talks about doing things — you're the person who does them. That shift in identity is worth more than the task itself. The momentum carries into tomorrow, and the day after that. You start trusting yourself again, and that trust is the foundation everything else gets built on."
` : ''}Match the tone exactly. Be detailed, descriptive, and LONG — not generic one-liners.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          ifDone: { type: Type.STRING, description: "MINIMUM 3-5 sentences. Vivid, specific description of what happens if they complete this task. Cover the immediate win, emotional relief, and downstream momentum. Never write just one sentence." },
          ifNotDone: { type: Type.STRING, description: "MINIMUM 3-5 sentences. Vivid, specific description of what happens if they DON'T do this task. Cover the immediate consequence, emotional toll, and long-term trajectory. Never write just one sentence." },
        },
        required: ["ifDone", "ifNotDone"],
      },
    },
  });

  return JSON.parse(response.text || '{"ifDone":"You\'ll feel great.","ifNotDone":"You might regret it."}');
};

export const generateSubtasksWithContext = async (taskText: string, context: string): Promise<{ text: string; deadline: string }[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  const todayISO = new Date().toISOString().split('T')[0];
  const maxDeadlineISO = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Break this task into HIGH-LEVEL subtasks (major phases or milestones) using the context provided.
Today is ${todayISO}. Deadlines must be between ${todayISO} and ${maxDeadlineISO}.

Task: "${taskText}"

USER-PROVIDED CONTEXT:
${context}

IMPORTANT: Subtasks should be HIGH-LEVEL groupings, NOT granular steps. Think of them as major phases, sections, or milestones — typically 3-7 subtasks total.

For example, if the task is "Complete OS Module 9 notes" with 3 lectures:
- GOOD subtasks: "Lecture 1 — setup, notes & quiz", "Lecture 2 — setup, notes & quiz", "Lecture 3 — setup, notes & quiz"
- BAD subtasks: "Open Canvas", "Download transcript 1", "Open NotebookLM" (these are too granular — they belong as micro-tasks, not subtasks)

The detailed step-by-step actions will be generated separately as micro-tasks. Subtasks are just the big picture.

Return subtasks with text and deadline (ISO date string).`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subtasks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                deadline: { type: Type.STRING, description: "ISO date string" },
              },
              required: ["text", "deadline"],
            },
          },
        },
        required: ["subtasks"],
      },
    },
  });

  const result = JSON.parse(response.text || '{"subtasks": []}');
  return result.subtasks || [];
};

export const generateSubtasks = async (taskText: string): Promise<{ text: string; deadline: string }[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  const todayISO = new Date().toISOString().split('T')[0];
  const maxDeadlineISO = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Break this task into 2-3 concrete subtasks (more if it's a big task). Each subtask should be a specific, actionable step — not vague.
Today is ${todayISO}. Deadlines must be between ${todayISO} and ${maxDeadlineISO}.

Task: "${taskText}"

Return subtasks with text and deadline (ISO date string).`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subtasks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                deadline: { type: Type.STRING, description: "ISO date string" },
              },
              required: ["text", "deadline"],
            },
          },
        },
        required: ["subtasks"],
      },
    },
  });

  const result = JSON.parse(response.text || '{"subtasks": []}');
  return result.subtasks || [];
};

export const regenerateCoachingAdvice = async (journalContent: string, harshness: string, profile?: UserProfile, userInsights?: string[], recentEntries?: RecentEntrySnippet[]): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

  const toneGuide: Record<string, string> = {
    gentle: `Be warm, encouraging, and soft. Frame setbacks as gentle possibilities, not scary outcomes. Focus on positive reinforcement. Still reference SPECIFIC details from their writing.`,
    hype: `Be DELUSIONALLY motivational. You are their biggest hype-man. Every task they do could be THE thing that changes their life. Exaggerate positive outcomes massively. Use specific numbers and bold predictions. Frame every small action as the domino that starts an avalanche. Paint a picture so exciting they can't NOT act. Use energy words: "LITERALLY", "genuinely", "this is your moment". The "current path" should be brief — spend 80% energy on the INSANELY exciting "taking action" path.`,
    balanced: `Be honest and direct but kind. State consequences clearly without being dramatic. Mix encouragement with real talk. Reference SPECIFIC details from their writing. Neither sugarcoated nor catastrophizing.`,
    tough: `Be blunt and direct. No fluff. State hard truths plainly. Make inaction feel costly. Reference SPECIFIC details — use their own words against them. Paint a picture of their actual life deteriorating with real details.`,
    brutal: `Be brutally honest. No sugarcoating. Be the coach that says what nobody else will. Reference SPECIFIC details — exact names, projects, apps, dollar amounts. Call out their EXACT behavior pattern. Paint a vivid, SPECIFIC picture of what happens if nothing changes. Swear if it fits the energy. Be the friend who grabs them by the shoulders.`,
  };

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are a journaling coach. Rewrite the coaching advice for this journal entry with a different tone.
${buildCoachingContext(profile, userInsights, recentEntries)}
TONE: ${harshness}. ${toneGuide[harshness] || toneGuide.balanced}

Provide structured coaching advice. STRICT CONSTRUCTION RULES for "general" (the note the user reads first):
  a) OPEN with today's plan using specifics from TODAY'S journal entry. First sentence must make it obvious you read what they wrote today.
  b) If a RECENT ENTRY contains a natural proof-point or thread, weave it in as continuity. If not, skip — don't force it.
  c) Use PROFILE long-term goals as the "why this push matters" — stakes only, only if naturally connected to today's plan.
  d) At most ONE CONFIRMED DURABLE PATTERN, only if it reinforces today's action. Never decoration.
  e) HARD BAN: do not name-drop people, projects, classes, or events that are NOT in today's entry.
  f) End with a concrete first action from today's entry.

- "general": 3-5 sentences following rules a-f above. Match the tone exactly.
- "currentPath" (days/months/year): What happens if they CONTINUE on current trajectory. Anchor in today's entry; profile goals as stakes.
- "newPath" (days/months/year): What happens if they TAKE ACTION now. Same anchoring rules.

TODAY'S JOURNAL ENTRY:
${journalContent}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          general: { type: Type.STRING },
          currentPath: {
            type: Type.OBJECT,
            properties: {
              days: { type: Type.STRING },
              months: { type: Type.STRING },
              year: { type: Type.STRING },
            },
            required: ["days", "months", "year"],
          },
          newPath: {
            type: Type.OBJECT,
            properties: {
              days: { type: Type.STRING },
              months: { type: Type.STRING },
              year: { type: Type.STRING },
            },
            required: ["days", "months", "year"],
          },
        },
        required: ["general", "currentPath", "newPath"],
      },
    },
  });

  return response.text || '{}';
};

export const extractInsightsFromJournal = async (content: string, existingInsights: string[]): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Extract DURABLE insights about the writer — short tags that would still be true six months from now. These go to a candidate pool and are only promoted into long-term memory on a 2nd mention in a future entry, so the bar here is HIGH quality over quantity. It is FINE — and often correct — to return an empty array.

HARD BAN — NEVER extract any of these:
- Specific people's names (friends, partners, family, coworkers, pets). "Misses Neil Bear" is banned. "Values long-distance relationships" is fine if it's a pattern.
- One-off events (yesterday's exam, tomorrow's quiz, tonight's meeting, this week's deadline)
- Today's tasks, plans, or to-dos
- Specific classes THIS semester (e.g. "Statistics Module 5")
- Project names / app names / company names mentioned once — wait for repetition
- Moods, feelings, or states ("feeling overwhelmed today", "excited about X")
- Anything containing a specific date, "today", "tomorrow", "this week"

EXTRACT ONLY (and only if clearly present in the text):
- Stable identity / role: "studying computer science", "freelance web designer", "college senior"
- Ongoing multi-month goals: "preparing for MongoDB internship", "wants 15k Instagram followers"
- Durable habits or patterns: "works best with momentum", "stays up past 2 AM", "procrastinates under stress"
- Long-term life facts: "has ADHD", "built a $65k business", "maintains a 4.0 GPA"
- Stable preferences: "loves morning coffee ritual", "prefers writing in the morning"

EXISTING INSIGHTS (do not duplicate, do not paraphrase):
${existingInsights.length > 0 ? existingInsights.map(i => `- ${i}`).join('\n') : '(none yet)'}

Return 0-3 candidates. If the entry is mostly about today's tasks with no durable signal, return an empty array. It is BETTER to return nothing than to return something borderline.

JOURNAL ENTRY:
${content}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          insights: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ["insights"],
      },
    },
  });

  const result = JSON.parse(response.text || '{"insights": []}');
  return (result.insights || []).slice(0, 5);
};

export const askCoach = async (question: string, context: string, harshness: string = 'balanced'): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

  const toneGuide = {
    gentle: 'Be warm, nurturing, and encouraging. Like a supportive best friend. Focus on what they\'re doing right and gently guide them.',
    hype: 'Be DELUSIONALLY motivational. Hype them up like their biggest fan. Every action they take is the start of something massive. Use bold predictions, inflated numbers, and make them feel unstoppable. "You do this and you\'re literally building an empire."',
    balanced: 'Be honest and direct but kind. Mix encouragement with real talk. No sugarcoating, no harshness.',
    tough: 'Be blunt and direct. No fluff, no hand-holding. State hard truths plainly. Push them to act.',
    brutal: 'Be brutally honest. No sugarcoating. Call out their excuses. Be the coach that says what nobody else will. Swear if it fits the energy. Be specific and harsh.',
  }[harshness] || '';

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are a journaling coach. The user has received the following coaching advice:

${context}

They now have a follow-up question: "${question}"

TONE: ${harshness}. ${toneGuide}

Answer in 2-4 sentences. Be practical and specific. Do not repeat the original advice verbatim.`,
  });
  return response.text || "Keep going — one small step at a time.";
};
