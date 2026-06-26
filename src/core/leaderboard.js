// Persistent best score per mission (localStorage).
const KEY = 'sop-highscores';

class Leaderboard {
  constructor() {
    this.scores = {};
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === 'object') this.scores = s;
    } catch (e) { /* ignore */ }
  }

  best(missionIndex) { return this.scores[missionIndex] || 0; }

  // returns true if this beats the stored best
  submit(missionIndex, score) {
    if (score > (this.scores[missionIndex] || 0)) {
      this.scores[missionIndex] = score;
      this._save();
      return true;
    }
    return false;
  }

  _save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.scores)); } catch (e) { /* ignore */ }
  }
}

export default new Leaderboard();
