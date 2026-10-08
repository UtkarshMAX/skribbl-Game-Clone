import { useState } from 'react';
import PropTypes from 'prop-types';
import { Select, labelClass } from '../ui';
import { CATEGORIES, GAME_MODES, LANGUAGES } from './roomSettingsOptions.js';

// Shared by the Create Room dialog and the lobby settings panel.
// Ranges mirror server/utils/roomSettings.js (the server re-validates everything).

const range = (from, to, step = 1) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

const NUMBER_FIELDS = [
    { key: 'maxPlayers', label: 'Players', values: range(2, 20) },
    { key: 'drawTime', label: 'Draw time (seconds)', values: range(15, 240, 15) },
    { key: 'maxRounds', label: 'Rounds', values: range(2, 10) },
    { key: 'wordCount', label: 'Word choices', values: range(1, 5) },
    { key: 'hintCount', label: 'Hints', values: range(0, 5), format: (v) => (v === 0 ? 'Off' : v) },
];

// Custom words textarea with its own draft. `live` = report every change (Create dialog);
// otherwise the text is committed on blur (lobby, so the server isn't hit on every keystroke).
function CustomWordsField({ value, onCommit, live, count }) {
    const [draft, setDraft] = useState(value);
    const [lastValue, setLastValue] = useState(value);
    if (value !== lastValue) { setLastValue(value); setDraft(value); }

    return (
        <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={labelClass}>
                Custom words <span className="font-semibold text-slate-400">— comma separated{typeof count === 'number' ? ` · ${count} saved` : ''}</span>
            </span>
            <textarea rows={2} value={draft} maxLength={6000} placeholder="e.g. Taj Mahal, Chai, Cricket bat, Auto rickshaw"
                onChange={(e) => { setDraft(e.target.value); if (live) onCommit(e.target.value); }}
                onBlur={() => { if (!live && draft !== value) onCommit(draft); }}
                className="w-full resize-y rounded-control bg-slate-100 px-4 py-3 font-bold text-ink ring-1 ring-transparent placeholder:font-semibold placeholder:text-slate-400 hover:bg-slate-200/60 focus:bg-white focus:ring-slate-200 transition-all duration-150" />
        </label>
    );
}

const labelFor = (pairs, value) => pairs.find(([v]) => v === value)?.[1] ?? value;

// Two-option switch (Private / Public) built from the shared control styles.
function PrivacyToggle({ isPrivate, onChange, disabled }) {
    const option = (value, text, hint) => (
        <button type="button" role="radio" aria-checked={isPrivate === value} disabled={disabled}
            onClick={() => onChange(value)}
            className={`flex-1 rounded-[10px] px-3 py-2 text-left transition-all duration-150 cursor-pointer disabled:cursor-default
                ${isPrivate === value ? 'bg-white text-ink shadow-soft' : 'text-slate-500 hover:text-ink'}`}>
            <span className="block text-sm font-extrabold">{text}</span>
            <span className="block text-xs font-semibold text-slate-400">{hint}</span>
        </button>
    );
    return (
        <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={labelClass} id="privacy-label">Room type</span>
            <div role="radiogroup" aria-labelledby="privacy-label" className="flex gap-1 rounded-control bg-slate-100 p-1">
                {option(true, 'Private', 'Code or invite link only')}
                {option(false, 'Public', 'Open to Quick Play')}
            </div>
        </div>
    );
}

/**
 * `customWordsText` / `onCustomWordsCommit`: the host's custom word list as text
 * (non-hosts never receive the list — read-only view shows only `settings.customWordCount`).
 * `liveCustomWords`: commit on every keystroke (Create dialog) instead of on blur (lobby).
 */
export default function RoomSettingsForm({ settings, onChange, readOnly = false, showPrivacy = true, autoFocus = false,
    customWordsText = '', onCustomWordsCommit, liveCustomWords = false }) {

    if (readOnly) {
        const customCount = settings.customWordCount ?? 0;
        const rows = [
            ...NUMBER_FIELDS.map(({ key, label, format }) => [label, format ? format(settings[key]) : settings[key]]),
            ['Game mode', labelFor(GAME_MODES, settings.gameMode)],
            ['Category', labelFor(CATEGORIES, settings.category)],
            ['Language', labelFor(LANGUAGES, settings.language ?? 'en')],
            ['Custom words', customCount ? `${customCount}${settings.onlyCustomWords ? ' (only these)' : ''}` : 'None'],
        ];
        return (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {rows.map(([label, value]) => (
                    <div key={label} className="rounded-control bg-slate-50 px-3 py-2">
                        <dt className="text-[11px] font-black uppercase tracking-wider text-slate-400">{label.replace(' (seconds)', '')}</dt>
                        <dd className="text-sm font-extrabold text-ink">{value}{label.startsWith('Draw time') ? 's' : ''}</dd>
                    </div>
                ))}
            </dl>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {showPrivacy && <PrivacyToggle isPrivate={settings.isPrivate} onChange={(isPrivate) => onChange({ isPrivate })} />}

            {NUMBER_FIELDS.map(({ key, label, values, format }, i) => (
                <Select key={key} label={label} autoFocus={autoFocus && i === 0} value={settings[key]}
                    onChange={(event) => onChange({ [key]: Number(event.target.value) })}>
                    {values.map((v) => <option key={v} value={v}>{format ? format(v) : v}</option>)}
                </Select>
            ))}

            <Select label="Game mode" value={settings.gameMode} onChange={(event) => onChange({ gameMode: event.target.value })}>
                {GAME_MODES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </Select>

            <Select label="Word category" value={settings.category} onChange={(event) => onChange({ category: event.target.value })}>
                {CATEGORIES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </Select>

            <Select label="Language" value={settings.language ?? 'en'} onChange={(event) => onChange({ language: event.target.value })}>
                {LANGUAGES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </Select>

            <CustomWordsField value={customWordsText} live={liveCustomWords}
                count={liveCustomWords ? undefined : settings.customWordCount}
                onCommit={(text) => onCustomWordsCommit?.(text)} />

            <label className="flex min-h-10 cursor-pointer items-center gap-3 sm:col-span-2">
                <input type="checkbox" checked={!!settings.onlyCustomWords}
                    onChange={(event) => onChange({ onlyCustomWords: event.target.checked })}
                    className="size-5 cursor-pointer accent-blue-600" />
                <span className="text-sm font-extrabold text-slate-600">
                    Use only custom words <span className="font-semibold text-slate-400">(needs at least 10)</span>
                </span>
            </label>
        </div>
    );
}

CustomWordsField.propTypes = {
    value: PropTypes.string,
    onCommit: PropTypes.func.isRequired,
    live: PropTypes.bool,
    count: PropTypes.number,
};

PrivacyToggle.propTypes = {
    isPrivate: PropTypes.bool,
    onChange: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
};

RoomSettingsForm.propTypes = {
    settings: PropTypes.object.isRequired,
    onChange: PropTypes.func,
    readOnly: PropTypes.bool,
    showPrivacy: PropTypes.bool,
    autoFocus: PropTypes.bool,
    customWordsText: PropTypes.string,
    onCustomWordsCommit: PropTypes.func,
    liveCustomWords: PropTypes.bool,
};
