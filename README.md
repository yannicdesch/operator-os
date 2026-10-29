# Operator OS

**The context layer every operator needs before AI becomes useful.**

Five markdown files. Any AI tool. Runs on your machine.

Every time you start a new AI conversation, you start from zero. You explain your role, your company, your priorities, your voice. You do it again the next day.

Operator OS fixes that. Your AI reads the same five files at the start of every session — and arrives already knowing your business.

Full guide: [yannicdesch.com/toolkit/operator-os](https://yannicdesch.com/toolkit/operator-os)

## The files

```
operator-os/
├── me.md           # Who you are, your role, your priorities
├── company.md      # Your company, product, strategy, numbers
├── style.md        # How you communicate
├── decisions.md    # Current open decisions
└── people.md       # Key stakeholders and relationships
```

| File | What it tells your AI | What you get |
|---|---|---|
| `me.md` | Your role, priorities, what you care about | Output in your voice, aimed at your actual goals |
| `company.md` | Your company, product, strategy, numbers | Analysis against your real situation, not a generic one |
| `style.md` | How you communicate — tone, format, rules | Drafts that match your style. No rewriting from scratch. |
| `decisions.md` | Open decisions and their context | AI tracks what's live, stops reopening closed questions |
| `people.md` | Key stakeholders and relationship context | Meeting prep and comms that are personal, not generic |

## What this adds to a bare AI

A capable model can do all of this if you brief it carefully every time. Operator OS makes the briefing a file instead of a ritual.

| | Bare AI | With Operator OS |
|---|---|---|
| Starting point | Your prompt, from zero | Your role, company, priorities and voice, already loaded |
| Output | Generic, then you edit | Calibrated to your situation on the first draft |
| Strategic work | AI guesses what's open and what's settled | Reads your live decision log; doesn't reopen closed questions |
| Meeting prep | Generic agenda | Knows who's in the room and what they care about |
| Switching tools | Re-explain everything | Same five files in Claude, ChatGPT, Cursor, anywhere |
| Handoff to a person or agent | Lives in your head | Lives in the repo; onboarding takes minutes |

## Operator OS for coding agents: `opos`

The five files are the memory. `opos` is what a coding agent does with it.

Coding agents build fast. Keeping them pointed at the right problem takes work: explaining the goal, challenging assumptions, checking the result, and picking up the thread in the next session. Product harnesses solve part of that by turning the work into a spec the agent builds against. What they cannot know is *why* the work matters to you: which priority it serves, which decision it feeds, which decision is already closed, and who will push back.

`opos` adds exactly that. Every workflow reads your five files first, and every spec is checked against them.

```
npm install -g operator-os
cd /path/to/your/project
opos init          # context files, config, agent workflows, a suggested first move
opos doctor
```

Then talk to your coding agent the way you already do, and name a workflow:

```
/opos-spec New customers need three calls before they can use the product. Find what we can cut.
```

### How it works

```
  SIGNAL                      SHAPE                          BUILD + PROVE
  ──────                      ─────                          ─────────────
  an idea or request  ──▶  /opos-interview-me           ──▶  /opos-build
  customer material   ──▶  /opos-discovery    ┐              tasks.yaml stays honest
  public research     ──▶  /opos-research     ├──▶ spec       │
  "should we?"        ──▶  /opos-pitch        ┘   [you agree] ▼
                           /opos-roast, /opos-preview      opos reconcile --git-diff
                                                           drift or proof ──▶ [you approve]
          ▲                                        │
          └──────── me.md · company.md · decisions.md · people.md · style.md ─┘
                    read by every step, checked by `opos spec check`
```

A spec is three plain files in `specs/<slug>/`, so the next agent (or person) continues from the recorded state:

| File | What it keeps |
|---|---|
| `spec.md` | Problem, context, scope in and out, decisions, open questions, acceptance. Frontmatter links the **priority** from `me.md`, the **decision** from `decisions.md` and the **stakeholders** from `people.md`. |
| `tasks.yaml` | Tasks with status, `files` they may touch, acceptance `checks` and `evidence`. Each task is `agreed`, `proposed` (waits for your call) or `discovered` (found while building). |
| `events.jsonl` | The record of what happened. |

### What the context adds

| | Bare coding agent | Product harness | `opos` |
|---|---|---|---|
| Starting point | Your prompt | An agreed spec | An agreed spec tied to a current priority and an open decision |
| "Should we build this?" | Whatever you ask it to consider | A GO / NO-GO case | The case in your company's numbers, with a kill criterion |
| Closed decisions | Reopened whenever the prompt drifts | Not known | Flagged when a spec touches one |
| Stakeholders | Unknown | Unknown | Named from `people.md`; unknown names are flagged |
| "Done" | Tests pass | Checked against the spec | Checked against the spec, with drift and missing proof surfaced for you |

### Commands

| When you want to… | Use |
|---|---|
| Set up a project and get a first move | `opos init` |
| Check your setup and how fresh your context is | `opos doctor` |
| Print the context an agent reads | `opos context` |
| Start a spec | `opos spec new "<title>" --priority "…" --decision "…" --stakeholder "…"` |
| Validate a spec against structure and context | `opos spec check <slug>` (or `--all`) |
| Track work | `opos task add`, `opos task set <slug> T1 --status done --evidence test:"npm test"` |
| Compare the build with the agreement | `opos reconcile <slug> --git-diff [--base main] [--strict]` |
| See where every spec stands | `opos status` |
| Install workflows for an agent | `opos setup claude`, `opos setup cursor`, `opos setup codex` |

Agent workflows: `interview-me`, `spec`, `roast`, `pitch`, `ideate`, `research`, `discovery`, `preview`, `build`, `reconcile`. In Claude Code they are skills (`/opos-spec`), in Cursor rules, for Codex and other agents a block in `AGENTS.md` that points to `.operator-os/skills/`.

`opos` runs locally and needs no account. Your coding agent and model provider still see what you give them; keep confidential numbers in a private copy of the context files. The checks help you review agent work. They are not a sandbox and cannot guarantee what an agent does.

## Getting started with the five files

1. Fork this repo (or download it — it's just five text files).
2. Open `me.md`. Delete the comments. Write the first section: your role and what you own. 20 minutes.
3. Do `style.md` next. Include 3–5 real examples of your writing. This is the file that stops AI drafts from sounding generic.
4. Fill the other three over the next week. Budget two hours total for a first version that's actually useful.

Start with `me.md` and `style.md` only if you want. That alone removes most of the re-briefing overhead. Add the rest when you hit friction.

## Connecting it to your AI

**Option A — Claude Projects (5 minutes).**
claude.ai → New Project → Project Knowledge. Paste all five files. Add a system prompt:

> You are my AI executive assistant. You have full context about me and my company in your knowledge. Start every response aware of this context.

Every conversation inside the Project arrives pre-loaded.

**Option B — Cursor Rules (for builders).**
Drop the files into `.cursor/rules/` in any project. Cursor reads them for every AI interaction in that workspace.

**Option C — System prompt / custom instructions (any tool).**
Works in ChatGPT, Gemini, Perplexity and any API-based tool. Paste a compressed version:

```
I am [your name], [your title] at [company].

ROLE: [2 sentences on what you own]
COMPANY: [2 sentences on what the company does, scale, and stage]
VOICE: [2 sentences on how you communicate]
PRIORITIES THIS QUARTER: [3 bullet points]
DO NOT: [What you never want the AI to do — hedge, use filler phrases, etc.]

Always respond with my priorities, context, and communication style in mind.
Be direct. Be concrete. If you're uncertain, say so.
```

## Keeping it current

- `decisions.md` — weekly. It goes stale fast.
- `me.md` — when something structural changes: new role, new quarter, major strategic shift.
- `company.md`, `people.md` — as events warrant.
- `style.md` — rarely. Add an example when you write something you'd want copied.

The files should reflect how you work now, not how you worked six months ago.

## Teams

A shared `company.md` that everyone pulls from is one of the highest-leverage things a leadership team can do. Every AI interaction across the team starts from the same factual base. Add team-specific files (`team.md`, `process.md`) as needed.

## The operating principle

Operator OS doesn't change how your AI works. It changes what your AI knows. A capable model with the right context consistently outperforms a better model without it. The bottleneck was never the model.

## Roadmap

- **Operator workflows.** `board-prep`, `weekly-review`, `decision-memo` and a 100-day plan, built on the same context, for work that is not a code change.
- **Decision loop.** `opos` proposes the exact `decisions.md` entry when a pitch or spec closes a decision; the next step is applying it with your approval.
- **Team layout.** A documented pattern for one shared `company.md` plus private per-person files.

## Acknowledgments

`opos` is inspired by [productfoo](https://github.com/rwo572/productfoo) by Rachel Wolan, an agentic product management harness for coding agents. The spec-plus-reconcile shape comes from there; the code and workflows here are written independently, and the context layer is what Operator OS adds.

## Status

Operator OS is a personal open-source project, shared because it's useful. It is unaffiliated with, and not endorsed by, any current or former employer. Maintenance is best effort. Treat the files as what they are: text your AI reads. Keep anything confidential in a private copy, and review your AI tool's data settings before pasting company numbers into it.

---

Built by [Yannic Desch](https://yannicdesch.com). MIT licensed. Questions and feedback: open an issue or [email me](mailto:yannic.desch@gmail.com?subject=Operator%20OS).
