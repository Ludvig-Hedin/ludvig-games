'use client';

import { useId, type CSSProperties } from 'react';
import { Check, Monitor, Moon, Sun, Volume2, VolumeX } from 'lucide-react';
import type { Preferences } from '../lib/preferences';
import './settings.css';

export interface SettingsProps {
  preferences: Preferences;
  onChange: (preferences: Preferences) => void;
}

type BooleanPreference = 'coordinates' | 'legal' | 'animations' | 'autoQueen' | 'confirmResign' | 'reducedMotion' | 'premoves' | 'bestArrow';
const BOARDS: { value: Preferences['board']; name: string; light: string; dark: string }[] = [
  { value: 'sage', name: 'Sage', light: '#eeeee2', dark: '#819780' },
  { value: 'walnut', name: 'Walnut', light: '#f0dcc0', dark: '#a7805c' },
  { value: 'slate', name: 'Slate', light: '#dedee0', dark: '#81858e' },
  { value: 'blue', name: 'Blue', light: '#e2e8ec', dark: '#7c9daf' },
];

export default function Settings({ preferences, onChange }: SettingsProps) {
  const id = useId();
  function set<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    onChange({ ...preferences, [key]: value });
  }
  function toggle(key: BooleanPreference, label: string, description?: string) {
    return <label className="settings-toggle-row" key={key}>
      <span className="settings-toggle-text"><span>{label}</span>{description && <small>{description}</small>}</span>
      <span className="settings-switch-wrap">
        <input type="checkbox" role="switch" checked={preferences[key]} onChange={event => set(key, event.target.checked)} aria-label={label} />
        <span className="settings-switch-track" aria-hidden="true" />
      </span>
    </label>;
  }

  return <div className="chess-settings">
    <section className="settings-section" aria-labelledby={`${id}-appearance`}>
      <h3 id={`${id}-appearance`}>Appearance</h3>
      <div className="settings-theme-control" role="radiogroup" aria-label="App appearance">
        {([
          { value: 'light', label: 'Light', icon: Sun },
          { value: 'dark', label: 'Dark', icon: Moon },
          { value: 'system', label: 'System', icon: Monitor },
        ] as const).map(({ value, label, icon: Icon }) => <label className={`settings-theme-option${preferences.theme === value ? ' is-selected' : ''}`} key={value}>
          <input className="settings-radio-input" type="radio" name={`${id}-theme`} value={value} checked={preferences.theme === value} onChange={() => set('theme', value)} />
          <Icon size={16} strokeWidth={1.6} aria-hidden="true" /><span>{label}</span>
        </label>)}
      </div>
      <div className="settings-field-heading" id={`${id}-board`}>Board color</div>
      <div className="settings-board-options" role="radiogroup" aria-labelledby={`${id}-board`}>
        {BOARDS.map(board => <label className={`settings-board-option${preferences.board === board.value ? ' is-selected' : ''}`} key={board.value}>
          <input className="settings-radio-input" type="radio" name={`${id}-board-theme`} value={board.value} checked={preferences.board === board.value} onChange={() => set('board', board.value)} />
          <span className="settings-board-preview" style={{ '--preview-light': board.light, '--preview-dark': board.dark } as CSSProperties} aria-hidden="true">
            {Array.from({ length: 16 }, (_, index) => <span key={index} className={(Math.floor(index / 4) + index % 4) % 2 ? 'preview-dark' : 'preview-light'} />)}
          </span>
          <span className="settings-board-label">{board.name}{preferences.board === board.value && <Check size={12} strokeWidth={2.5} aria-hidden="true" />}</span>
        </label>)}
      </div>
      <div className="settings-field-heading" id={`${id}-pieces`}>Pieces</div>
      <div className="settings-piece-options" role="radiogroup" aria-labelledby={`${id}-pieces`}>
        {(['classic', 'modern'] as const).map(style => <label className={`settings-piece-option${preferences.pieces === style ? ' is-selected' : ''}`} key={style}>
          <input className="settings-radio-input" type="radio" name={`${id}-pieces-style`} value={style} checked={preferences.pieces === style} onChange={() => set('pieces', style)} />
          <span className="settings-piece-preview" aria-hidden="true"><img src={`/pieces/${style}/wN.svg`} alt="" /><img src={`/pieces/${style}/bN.svg`} alt="" /></span>
          <span>{style === 'classic' ? 'Classic' : 'Modern'}</span>
          {preferences.pieces === style && <Check className="settings-piece-check" size={14} strokeWidth={2} aria-hidden="true" />}
        </label>)}
      </div>
    </section>

    <section className="settings-section" aria-labelledby={`${id}-play`}>
      <h3 id={`${id}-play`}>Playing</h3>
      {toggle('coordinates', 'Board coordinates')}
      {toggle('legal', 'Show legal moves')}
      {toggle('premoves', 'Premoves', 'Queue your next move while your opponent thinks.')}
      {toggle('autoQueen', 'Auto-queen', 'Promote pawns to a queen without asking.')}
      {toggle('confirmResign', 'Confirm resignation')}
      {toggle('bestArrow', 'Best-move arrow', 'Show the engine’s suggestion in analysis.')}
    </section>

    <section className="settings-section" aria-labelledby={`${id}-sound`}>
      <h3 id={`${id}-sound`}>Motion & sound</h3>
      {toggle('animations', 'Animate pieces')}
      {toggle('reducedMotion', 'Reduce motion')}
      <div className="settings-volume-row">
        <label htmlFor={`${id}-volume`}>Sound volume</label>
        <output htmlFor={`${id}-volume`}>{Math.round(preferences.volume * 100)}%</output>
      </div>
      <div className="settings-volume-control">
        <button className={`settings-mute${preferences.muted ? ' is-muted' : ''}`} type="button" aria-label={preferences.muted ? 'Unmute sounds' : 'Mute sounds'} aria-pressed={preferences.muted} onClick={() => set('muted', !preferences.muted)} title={preferences.muted ? 'Unmute sounds' : 'Mute sounds'}>
          {preferences.muted ? <VolumeX size={19} strokeWidth={1.7} /> : <Volume2 size={19} strokeWidth={1.7} />}
        </button>
        <input id={`${id}-volume`} type="range" min="0" max="100" step="5" value={Math.round(preferences.volume * 100)} onChange={event => set('volume', Number(event.target.value) / 100)} aria-valuetext={`${Math.round(preferences.volume * 100)} percent${preferences.muted ? ', muted' : ''}`} />
      </div>
      {preferences.muted && <p className="settings-muted-note">Sounds are muted. Press M while playing to unmute.</p>}
    </section>
  </div>;
}
