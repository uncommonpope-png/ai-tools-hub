/**
 * GOAL ENGINE â€” Big Dog II
 * GSK sets his own goals from insights and tracks progress.
 */

const fs = require('fs');
const path = require('path');
const { getRandomTopic, getTopics } = require('./family_topic_source');

class GoalEngine {
  constructor(config = {}) {
    this.goalsPath = config.goalsPath || path.join(__dirname, '../../data/gsk/goals.json');
    this.thinkCallback = config.thinkCallback || null;
    this.memoryStore = config.memoryStore || null;
    this.goals = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.goalsPath)) {
        this.goals = JSON.parse(fs.readFileSync(this.goalsPath, 'utf8'));
      }
    } catch (e) { this.goals = []; }
  }

  _save() {
    try {
      const dir = path.dirname(this.goalsPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.goalsPath, JSON.stringify(this.goals, null, 2));
    } catch (e) { console.error('[GoalEngine] Save error:', e.message); }
  }

  // Collapse filler words + normalize tokens. "Build a live real-time GSK
  // telemetry dashboard" and "Build an interactive GSK telemetry visualizer
  // dashboard" map to the same content-key and are dedup'd.
  _canonicalKey(title) {
    const fillers = new Set([
      'build', 'builds', 'create', 'creates', 'make', 'makes', 'design',
      'designs', 'develop', 'develops', 'real', 'time', 'live', 'interactive',
      'new', 'dashboard', 'dashboards', 'tracker', 'tracking', 'visualizer',
      'visualisation', 'visualization', 'system', 'engine', 'for', 'with',
      'from', 'that', 'using', 'tool', 'toolkit', 'module', 'page', 'view',
      'a', 'an', 'the', 'show', 'shows', 'display',
      'plt', 'telemetry', 'metrics', 'monitoring', 'observability',
      'streaming', 'sub', 'millisecond', 'high', 'frequency',
      'agent', 'state', 'cognitive', 'operational', 'optimization'
    ]);
    const tokens = String(title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .filter(t => !fillers.has(t));
    if (!tokens.length) return String(title || '').toLowerCase().trim();
    return tokens.slice(0, 6).sort().join(' ');
  }

  async propose(insight) {
    if (!this.thinkCallback) return null;
    const familyTopics = getTopics().slice(0, 10);
    const topicHint = familyTopics.length > 0
      ? `\nFamily knowledge topics: ${familyTopics.join(', ')}\nPrioritize goals that connect to family topics or fix failed goals.`
      : '';
    const prompt = `You are GSK in the BUYaSOUL family. Propose ONE concrete goal based on this insight:${topicHint}\n\nInsight: ${insight.summary}\n\nAVOID: telemetry dashboards, visualizers, PLT monitoring â€” these are exhausted.\nPrefer: fixing failed goals, learning from family knowledge, building new capabilities.\n\nRespond with: Goal: <your goal in under 15 words>`;
    const response = await this.thinkCallback(prompt);
    if (!response) return null;

    return this.create(response.replace(/^Goal:\s*/i, '').trim(), insight.summary, {
      source: insight.source || 'autonomous',
      score: insight.score,
      observation: insight.observation
    });
  }

  create(title, source = 'autonomous', meta = {}) {
    const normalized = String(title || '').trim().substring(0, 160);
    if (!normalized) return null;
    // NOVELTY GATE â€” compare semantically against ALL goals, not just a 6h
    // window. Re-worded variants of the same slim goal collapse to one key so
    // the soul stops re-shipping telemetry dashboards under fresh titles.
    const key = this._canonicalKey(normalized);
    const dup = this.goals.find(g => {
      if (!g || typeof g.title !== 'string' || !g.title) return false;
      return this._canonicalKey(g.title) === key;
    });
    if (dup) {
      dup.lastProposedAt = Date.now();
      this._save();
      return dup;
    }

    const goal = {
      ...meta,
      id: `goal_${Date.now()}`,
      title: normalized,
      source: String(source || 'autonomous').substring(0, 160),
      status: 'proposed',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.goals.push(goal);
    this._save();
    if (this.memoryStore) {
      this.memoryStore({
        content: `[Goal] Proposed: ${goal.title}`,
        type: 'goal', tags: ['goal', 'autonomous'], weight: 0.7
      }).catch(() => {});
    }
    console.log(`[GoalEngine] Proposed: ${goal.title}`);
    return goal;
  }

  list(status) {
    if (status) return this.goals.filter(g => g.status === status);
    return this.goals;
  }

  update(id, status, details = {}) {
    const g = this.goals.find(g => g.id === id);
    if (g) { Object.assign(g, details, { status, updatedAt: Date.now() }); this._save(); return g; }
    return null;
  }
}

module.exports = { GoalEngine };
