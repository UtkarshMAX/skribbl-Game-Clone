// Characters that are always shown to guessers and are never "revealed" as hints.
const ALWAYS_VISIBLE = new Set([" ", "-", "+"]);

export default class HintManager {

    static isLetter(char) {
        return !ALWAYS_VISIBLE.has(char);
    }

    // Number of hideable letters in the word (spaces, hyphens and "+" excluded).
    static letterCount(word = "") {
        return [...word].filter((char) => this.isLetter(char)).length;
    }

    // ---------- GET VALID INDEXES ----------

    static getAvailableIndexes(actualWord, revealedIndexes = []) {
        const availableIndexes = [];
        for (let i = 0; i < actualWord.length; i++) {
            const char = actualWord[i];
            if (this.isLetter(char) && !revealedIndexes.includes(i)) {
                availableIndexes.push(i);
            }
        }

        return availableIndexes;
    }

    // ---------- PICK RANDOM INDEX ----------

    static getRandomIndex(actualWord, revealedIndexes = []) {
        const availableIndexes = this.getAvailableIndexes(actualWord, revealedIndexes);
        if (availableIndexes.length === 0) {
            return null;
        }
        return availableIndexes[Math.floor(Math.random() * availableIndexes.length)];
    }

    // ---------- REVEAL LETTER ----------

    static revealLetter(actualWord, displayWord,revealedIndexes = []) {
        const index = this.getRandomIndex(actualWord, revealedIndexes);
        if (index === null) {
            return {displayWord, revealedIndexes, revealedIndex: null};
        }

        const displayArray = displayWord.split("");

        displayArray[index] = actualWord[index];

        return {
            displayWord: displayArray.join(""),

            revealedIndexes: [...revealedIndexes,index],
            revealedIndex: index
        };
    }

    // ---------- CAN REVEAL ? ----------

    // A hint may be revealed while under the room's hint limit AND while fewer than half
    // of the word's letters are visible (a 3-letter word gets at most 1 hint).
    static canReveal(revealedIndexes, maxHints = 2, word = "") {
        const halfLetters = Math.floor(this.letterCount(word) / 2);
        return revealedIndexes.length < maxHints && revealedIndexes.length < halfLetters;
    }

}