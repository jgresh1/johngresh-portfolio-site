// Achievements: small goals that give the game replay value. Unlocks are kept across games in localStorage.
import { SPECIES } from './data.js';

const KEY = 'descent.ach.v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
const save = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* private mode */ } };

export const ACHIEVEMENTS = [
  { id: 'first_bite',   name: 'First Bite',            text: 'Eat your first fish.' },
  { id: 'plankton',     name: 'Filter Feeder',         text: 'Eat 100 plankton.' },
  { id: 'escape',       name: 'Close Call',            text: 'Shake off a hunter that was chasing you.' },
  { id: 'dodge',        name: 'Too Slow!',             text: 'Get away from an ambusher before it strikes.' },
  { id: 'combo6',       name: 'Feeding Frenzy',        text: 'Chain six meals in a row.' },
  { id: 'big_bite',     name: 'Bigger Than Your Eyes', text: 'Swallow a fish more than half your own length.' },
  { id: 'golden',      name: 'Golden Touch',          text: 'Catch a golden fish.' },
  { id: 'spa',          name: 'Spa Day',               text: 'Get cleaned at a cleaning station.' },
  { id: 'lv5',          name: 'Growing Up',            text: 'Reach level 5.' },
  { id: 'untouched',    name: 'Untouchable',           text: 'Reach level 4 without being bitten.' },
  { id: 'naturalist',   name: 'Naturalist',            text: 'Find 20 species.' },
  { id: 'completionist', name: 'Completionist',        text: 'Find every species in the Bestiary.' },
  { id: 'apex',         name: 'Apex',                  text: 'Finish the game.' },
  { id: 'clean_run',    name: 'Never Eaten',           text: 'Finish the game without being eaten.' },
  { id: 'hard',         name: 'Brave Little Fish',     text: 'Finish the game on Hard.' },
];

export class Achievements {
  constructor(game) { this.g = game; this.done = load(); this.run = { plankton: 0, bitten: 0 }; }
  resetRun() { this.run = { plankton: 0, bitten: 0 }; }

  unlock(id) {
    if (this.done[id]) return;
    this.done[id] = Date.now(); save(this.done);
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    this.g.hud.toast(`<b>Achievement:</b> ${a.name}`, 'disc', 4200); this.g.audio.levelup();
  }

  // feed it game events
  onEat(e) {
    const pl = this.g.player;
    if (e.speck) { if (e.key === 'plankton') { this.run.plankton++; if (this.run.plankton >= 100) this.unlock('plankton'); } }
    else this.unlock('first_bite');
    if (!e.speck && e.len >= pl.len * 0.5) this.unlock('big_bite');
    if (pl.combo >= 6) this.unlock('combo6');
    const n = Object.keys(pl.discovered).length;
    if (n >= 20) this.unlock('naturalist');
    if (n >= Object.keys(SPECIES).length) this.unlock('completionist');
  }
  onBitten() { this.run.bitten++; }
  onLevel(level) { if (level >= 5) this.unlock('lv5'); if (level >= 4 && this.run.bitten === 0) this.unlock('untouched'); }
  onEscaped() { this.unlock('escape'); }
  onDodged() { this.unlock('dodge'); }
  onCleaned() { this.unlock('spa'); }
  onGolden() { this.unlock('golden'); }
  onFinish() {
    const pl = this.g.player; this.unlock('apex');
    if (pl.deaths === 0) this.unlock('clean_run');
    if (pl.difficulty === 'hard') this.unlock('hard');
  }
  count() { return ACHIEVEMENTS.filter((a) => this.done[a.id]).length; }
}
