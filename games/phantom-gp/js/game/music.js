// music.js — the score: "Vanguard" by Scott Buckley (www.scottbuckley.com.au), used under CC BY 4.0 and edited for
// the game by tools/build_score.py (cut to the film, joined, a camera shutter on each still, a sub-bass layer under
// two hits, level raised through a limiter). Two files:
//   film.mp3   64 beats + a tail: the piece's own opening, its break and pickup, then its biggest entry on beat 16
//   race.mp3   the 96 beats that follow that entry, as a loop; after the film it is entered 48 beats in
// The piece runs at a locked 133.33 beats a minute, so one beat is exactly 0.45 s: that is the grid intro.js cuts on.
// Move nothing here without rebuilding the files.
export const BEAT = 0.45, BPM = 60 / BEAT, SR = 44100;
export const SCORE = {
  film: { url: 'assets/audio/film.mp3', samples: 1340640 },
  race: { url: 'assets/audio/race.mp3', samples: 1905120, entry: 48 * BEAT },
  credit: '“Vanguard” by Scott Buckley · CC BY 4.0 · scottbuckley.com.au',
};

// An MP3 holds 1105 samples of nothing before the audio starts. Most browsers drop them when decoding; one that does
// not returns a longer buffer, and a film cut to the beat (or a loop) would then run 25 ms late. Each file's true
// length is known, so the decoded buffer is trimmed to it.
const MP3_LEAD = 1105;
async function decodeExact({ url, samples }) {
  const res = await fetch(url); if (!res.ok) throw new Error(url + ' ' + res.status);
  const data = await res.arrayBuffer();
  const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext, ctx = new OC(2, 2, SR);
  const buf = await new Promise((ok, no) => { const p = ctx.decodeAudioData(data, ok, no); if (p && p.catch) p.catch(no); });
  const want = Math.round(samples * buf.sampleRate / SR), extra = buf.length - want;
  if (extra === 0) return buf;
  const lead = extra > 600 ? Math.min(extra, Math.round(MP3_LEAD * buf.sampleRate / SR)) : 0;
  const out = ctx.createBuffer(buf.numberOfChannels, want, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) out.getChannelData(c).set(buf.getChannelData(c).subarray(lead, Math.min(buf.length, lead + want)));
  return out;
}

// -> { film, race } as AudioBuffers (needs no user gesture: decoding runs on an offline context)
export function loadScore() {
  return Promise.all([decodeExact(SCORE.film), decodeExact(SCORE.race)]).then(([film, race]) => ({ film, race }));
}
