// Option lists and defaults for room settings (mirrors server/utils/roomSettings.js).
// Kept separate from RoomSettingsForm.jsx so that file only exports components.

export const GAME_MODES = [
    ['normal', 'Normal'],
    ['hidden', 'Hidden'],
    ['combination', 'Combination'],
];

export const CATEGORIES = [
    ['all', 'All categories'],
    ['animal', 'Animals'],
    ['objects', 'Objects'],
    ['food', 'Food'],
    ['places', 'Places'],
    ['actions', 'Actions'],
    ['countries', 'Countries'],
    ['movieCharacters', 'Movie characters'],
];

export const LANGUAGES = [
    ['en', 'English'],
    ['hi', 'Hindi (romanized)'],
];

export const DEFAULT_SETTINGS = {
    maxPlayers: 8,
    drawTime: 75,
    maxRounds: 3,
    wordCount: 3,
    hintCount: 2,
    gameMode: 'normal',
    category: 'all',
    language: 'en',
    isPrivate: true,
    customWords: '',          // comma-separated in the form; the server cleans it up
    onlyCustomWords: false,
};
