/**
 * English lip-sync processor for TalkingHead.
 * Converts English words to Oculus LipSync viseme sequences.
 *
 * Oculus visemes used by TalkingHead:
 *   sil, PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, I, O, U
 *
 * Reference: https://github.com/met4citizen/TalkingHead
 */

export class LipsyncEn {
  constructor() {
    // Ordered list of [pattern, viseme] pairs — longer patterns first so digraphs
    // are matched before their component letters.
    this.rules = [
      // Silent / special digraphs
      ['igh', 'aa'],   // night, light → /aɪ/
      ['igh', 'aa'],

      // Three-letter clusters
      ['tch', 'CH'],   // watch, catch

      // Digraphs — vowels
      ['ee',  'I'],    // see, meet
      ['ea',  'I'],    // eat, beach (long E context)
      ['oo',  'U'],    // moon, book
      ['ou',  'aa'],   // out, sound (simplified to open /aʊ/)
      ['ow',  'O'],    // low, snow (and "cow" simplified)
      ['oi',  'O'],    // coin, boy
      ['oy',  'O'],    // toy
      ['ai',  'E'],    // rain, mail
      ['ay',  'E'],    // say, play
      ['au',  'aa'],   // cause
      ['aw',  'aa'],   // saw
      ['ei',  'E'],    // eight, vein
      ['ey',  'E'],    // they, hey
      ['ie',  'I'],    // field, piece
      ['ue',  'U'],    // blue, clue
      ['ui',  'U'],    // fruit, suit
      ['oa',  'O'],    // boat, coat
      ['oe',  'O'],    // toe, foe

      // Digraphs — consonants
      ['th',  'TH'],
      ['ch',  'CH'],
      ['sh',  'CH'],
      ['ph',  'FF'],
      ['gh',  'FF'],   // rough, enough
      ['ng',  'kk'],   // sing, long
      ['wh',  'RR'],   // what, where
      ['ck',  'kk'],   // back, lock
      ['qu',  'kk'],   // queen (simplified)
      ['dg',  'CH'],   // edge, judge
      ['nk',  'kk'],   // think, bank (simplified)
      ['sc',  'SS'],   // science (simplified)
      ['wr',  'RR'],   // write (w is silent)
      ['kn',  'nn'],   // know, knife (k is silent)
      ['gn',  'nn'],   // gnat (g is silent)
      ['ps',  'SS'],   // psychology (p is silent)

      // Single vowels
      ['a',   'aa'],
      ['e',   'E'],
      ['i',   'I'],
      ['o',   'O'],
      ['u',   'U'],
      ['y',   'I'],    // gym, funny (vowel context)

      // Single consonants
      ['b',   'PP'],
      ['c',   'kk'],
      ['d',   'DD'],
      ['f',   'FF'],
      ['g',   'kk'],
      ['h',   'kk'],
      ['j',   'CH'],
      ['k',   'kk'],
      ['l',   'DD'],
      ['m',   'PP'],
      ['n',   'nn'],
      ['p',   'PP'],
      ['q',   'kk'],
      ['r',   'RR'],
      ['s',   'SS'],
      ['t',   'DD'],
      ['v',   'FF'],
      ['w',   'RR'],
      ['x',   'kk'],   // simplified (/ks/)
      ['z',   'SS'],
    ];

    // Number words
    this._ones  = ['', 'one', 'two', 'three', 'four', 'five',
                   'six', 'seven', 'eight', 'nine', 'ten',
                   'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
                   'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    this._tens  = ['', '', 'twenty', 'thirty', 'forty', 'fifty',
                   'sixty', 'seventy', 'eighty', 'ninety'];
  }

  /**
   * Pre-process a single word/token for TTS & lipsync.
   * - Expands digits to letter sounds (single digit per call, as TalkingHead
   *   passes one token at a time).
   * - Strips non-alphabetic characters that shouldn't affect pronunciation.
   * @param {string} s Word token
   * @returns {string} Cleaned word
   */
  preProcessText(s) {
    if (!s) return s;

    // Expand numeric tokens to spoken form
    s = s.replace(/\d+/g, (match) => {
      const n = parseInt(match, 10);
      return isNaN(n) ? match : this._numberToWords(n);
    });

    // Remove remaining non-alphabetic, non-apostrophe characters
    s = s.replace(/[^a-zA-Z']/g, '').toLowerCase();

    return s;
  }

  /**
   * Convert a word to a sequence of Oculus visemes with timing.
   * @param {string} word A single lower-case word
   * @returns {{ visemes: string[], times: number[], durations: number[] }}
   */
  wordsToVisemes(word) {
    if (!word) return { visemes: [], times: [], durations: [] };

    const w = word.toLowerCase();
    const visemes = [];

    let i = 0;
    while (i < w.length) {
      let matched = false;

      for (const [pattern, viseme] of this.rules) {
        const len = pattern.length;
        if (w.slice(i, i + len) === pattern) {
          // Merge consecutive identical non-vowel visemes to avoid jaw flicker
          const isVowel = ['aa', 'E', 'I', 'O', 'U'].includes(viseme);
          if (
            visemes.length === 0 ||
            isVowel ||
            visemes[visemes.length - 1] !== viseme
          ) {
            visemes.push(viseme);
          }
          i += len;
          matched = true;
          break;
        }
      }

      if (!matched) {
        i++;
      }
    }

    // Assign equal timing to each viseme
    const dt = 100; // ms per viseme
    const times     = visemes.map((_, j) => j * dt);
    const durations = visemes.map(() => dt);

    return { visemes, times, durations };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  _numberToWords(n) {
    if (n === 0) return 'zero';
    if (n < 0)   return 'minus ' + this._numberToWords(-n);
    if (n < 20)  return this._ones[n];
    if (n < 100) {
      const t = this._tens[Math.floor(n / 10)];
      const o = this._ones[n % 10];
      return o ? t + ' ' + o : t;
    }
    if (n < 1000) {
      const rest = n % 100;
      return this._ones[Math.floor(n / 100)] + ' hundred' +
             (rest ? ' ' + this._numberToWords(rest) : '');
    }
    if (n < 1_000_000) {
      const rest = n % 1000;
      return this._numberToWords(Math.floor(n / 1000)) + ' thousand' +
             (rest ? ' ' + this._numberToWords(rest) : '');
    }
    return n.toString();
  }
}
