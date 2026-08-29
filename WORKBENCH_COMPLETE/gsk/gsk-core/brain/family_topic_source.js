'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const GSK_DIR = path.join(DATA_DIR, 'gsk');

let _cache = null;
let _lastRefresh = 0;
const REFRESH_INTERVAL = 120000;

function _readJsonl(filePath, limit = 50) {
    try {
        if (!fs.existsSync(filePath)) return [];
        const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean).slice(-limit);
        return lines.map(l => {
            try { return JSON.parse(l); } catch { return null; }
        }).filter(Boolean);
    } catch { return []; }
}

function _readJson(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        const stats = fs.statSync(filePath);
        if (stats.size > 1048576) {
            const fd = fs.openSync(filePath, 'r');
            const startPos = stats.size - 1048576;
            const buf = Buffer.alloc(1048576);
            fs.readSync(fd, buf, 0, 1048576, startPos);
            fs.closeSync(fd);
            let content = buf.toString('utf8');
            const openBr = content.indexOf('[');
            const closeBr = content.lastIndexOf(']');
            if (openBr >= 0 && closeBr > openBr) {
                content = '[' + content.substring(openBr + 1, closeBr) + ']';
            }
            return JSON.parse(content);
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch { return null; }
}

function _extractTopics() {
    const topics = new Set();

    const knowledge = _readJsonl(path.join(DATA_DIR, 'knowledge.jsonl'), 30);
    for (const e of knowledge) {
        if (e.topic) topics.add(e.topic);
        if (e.summary) {
            const words = e.summary.split(/\s+/).slice(0, 5).join(' ');
            if (words.length > 10) topics.add(words);
        }
    }

    const webIntel = _readJsonl(path.join(DATA_DIR, 'web-intel.jsonl'), 20);
    for (const e of webIntel) {
        if (e.topic) topics.add(e.topic);
    }

    const scribeLog = _readJsonl(path.join(GSK_DIR, 'scribe_stream_log.jsonl'), 30);
    for (const e of scribeLog) {
        if (e.summary) {
            const short = e.summary.substring(0, 80);
            if (short.length > 15) topics.add(short);
        }
    }

    const goals = _readJson(path.join(GSK_DIR, 'goals.json'));
    if (goals && Array.isArray(goals)) {
        const failed = goals.filter(g => g.status === 'failed').slice(-10);
        for (const g of failed) {
            if (g.title) topics.add('fix: ' + g.title.substring(0, 60));
        }
        const completed = goals.filter(g => g.status === 'completed').slice(-5);
        for (const g of completed) {
            if (g.title) topics.add('extend: ' + g.title.substring(0, 60));
        }
    }

    const events = _readJson(path.join(GSK_DIR, 'family_event_log.json'));
    if (events && Array.isArray(events)) {
        const cutoff = Date.now() - 1800000;
        const recent = events.filter(e => e.timestamp > cutoff);
        for (const e of recent) {
            if (e.event === 'agent.chat' && e.payload?.message) {
                const msg = e.payload.message;
                if (msg.length > 10) topics.add('family_request: ' + msg.substring(0, 80));
            }
            if (e.event === 'knowledge.learn' && e.payload?.topic) {
                topics.add('web_research: ' + e.payload.topic);
            }
        }
    }

    try {
        const journalPath = path.join(DATA_DIR, 'journal.jsonl');
        const journal = _readJsonl(journalPath, 20);
        for (const e of journal) {
            if (e.topic) topics.add('journal: ' + e.topic);
            if (e.summary) {
                const short = e.summary.substring(0, 60);
                if (short.length > 10) topics.add('journal: ' + short);
            }
        }
    } catch {}

    return [...topics];
}

function _extractKeywords() {
    const keywords = new Set();
    const topics = _extractTopics();
    for (const t of topics) {
        const words = t.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
        for (const w of words) keywords.add(w);
    }
    return [...keywords];
}

function _extractGitHubTopics() {
    const githubTopics = new Set();
    const knowledge = _readJsonl(path.join(DATA_DIR, 'knowledge.jsonl'), 30);
    for (const e of knowledge) {
        if (e.topic && e.topic.includes('github')) {
            const parts = e.topic.split('/');
            if (parts.length >= 2) githubTopics.add(parts[1]);
        }
    }
    const webIntel = _readJsonl(path.join(DATA_DIR, 'web-intel.jsonl'), 20);
    for (const e of webIntel) {
        if (e.topic) {
            const words = e.topic.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
            for (const w of words) githubTopics.add(w);
        }
    }
    return [...githubTopics].slice(0, 30);
}

function getTopics() {
    if (_cache && Date.now() - _lastRefresh < REFRESH_INTERVAL) return _cache;
    _cache = _extractTopics();
    _lastRefresh = Date.now();
    return _cache;
}

function getKeywords() {
    return _extractKeywords();
}

function getGitHubTopics() {
    return _extractGitHubTopics();
}

function getRandomTopic(prefix = '') {
    const topics = getTopics();
    if (topics.length === 0) return null;
    const t = topics[Math.floor(Math.random() * topics.length)];
    return prefix ? prefix + ': ' + t : t;
}

function getRandomTopics(count = 5, prefix = '') {
    const all = getTopics();
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map(t => prefix ? prefix + ': ' + t : t);
}

function getNovelKeywords() {
    const existing = new Set(_extractKeywords());
    const novel = [];
    const potentialNovel = [
        'quantum', 'bio', 'swarm', 'federated', 'adversarial', 'neuro',
        'genetic', 'evolutionary', 'topology', 'manifold', 'bayesian',
        'causal', 'counterfactual', 'metamorphic', 'holographic', 'fractal',
        'reservoir', 'spiking', 'morphogenetic', 'morphological', 'allostatic',
        'homeostatic', 'cybernetic', 'autopoietic', 'enactivism', 'umwelt',
        'affordance', 'stigmergy', 'superorganism', 'holobiont', 'symbiogenesis'
    ];
    for (const w of potentialNovel) {
        if (!existing.has(w)) novel.push(w);
    }
    return novel.length > 0 ? novel : potentialNovel;
}

module.exports = {
    getTopics,
    getKeywords,
    getGitHubTopics,
    getRandomTopic,
    getRandomTopics,
    getNovelKeywords,
    _readJsonl,
    _readJson,
};
