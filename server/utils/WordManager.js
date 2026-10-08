import words from "../data/words.js";
import hindiWords from "../data/words.hi.js";

// Word lists by language. Both use the same category keys.
export const WORD_LISTS = { en: words, hi: hindiWords };

class WordManager {

    // ---------- WORD POOL ----------

    /** Built-in words for a language + category ("all" = every category). */
    static builtInWords(language = "en", category = "all") {
        const list = WORD_LISTS[language] ?? words;
        if (category !== "all" && list[category]) return [...list[category]];
        return Object.values(list).flat();
    }

    /**
     * The words a room draws from: the built-in list for its language/category,
     * plus its custom words — or ONLY the custom words when `onlyCustomWords` is on.
     */
    static buildPool({ language = "en", category = "all", customWords = [], onlyCustomWords = false } = {}) {
        if (onlyCustomWords && customWords.length) return [...customWords];
        const pool = this.builtInWords(language, category);
        const seen = new Set(pool.map((w) => w.toLowerCase()));
        for (const word of customWords) {
            if (!seen.has(word.toLowerCase())) {
                seen.add(word.toLowerCase());
                pool.push(word);
            }
        }
        return pool;
    }

    // ---------- RANDOM WORDS ----------

    /** `source` is either a category name (English list) or a ready-made word pool (array). */
    static getRandomWords(count = 3, source = "all") {
        const wordPool = Array.isArray(source) ? source : this.builtInWords("en", source);
        const selectedWords = [];
        while (selectedWords.length < count && selectedWords.length < wordPool.length) {
            const word = wordPool[Math.floor(Math.random() * wordPool.length)];
            if (!selectedWords.includes(word)) {
                selectedWords.push(word);
            }
        }
        return selectedWords;
    }

    // ---------- COMBINATION WORD ----------

    static getCombinationWord(source = "all") {
        const wordsList = this.getRandomWords(2, source);
        return `${wordsList[0]} + ${wordsList[1]}`;
    }

    // ---------- WORD DISPLAY ----------

    static createDisplayWord(word) {
        return word.split("").map(char => {
            // Spaces, hyphens and the combination "+" are always visible to guessers.
            if (char === " ") return " ";
            if (char === "-") return "-";
            if (char === "+") return "+";
            return "_";
        })
            .join("");
    }

    // ---------- REVEAL LETTER ----------

    static revealLetter(actualWord, currentDisplay, revealedIndexes = []) {
        const availableIndexes = [];
        for (let i = 0; i < actualWord.length; i++) {
            const char = actualWord[i];
            if (char !== " " && char !== "+" && !revealedIndexes.includes(i)) {
                availableIndexes.push(i);
            }
        }
        if (availableIndexes.length === 0) {
            return {
                displayWord: currentDisplay,
                revealedIndexes
            };
        }

        const randomIndex = availableIndexes[
            Math.floor(Math.random() * availableIndexes.length)];

        const displayArray = currentDisplay.split("");
        displayArray[randomIndex] = actualWord[randomIndex];

        return {
            displayWord: displayArray.join(""),
            revealedIndexes: [...revealedIndexes, randomIndex]
        };
    }

    // ---------- NORMALIZE ----------

    static normalizeWord(word) {
        return word.toLowerCase().replaceAll(" ", "").trim();
    }
}

export default WordManager;