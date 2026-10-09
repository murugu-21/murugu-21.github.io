// Blog read-aloud audio in R2. apps/tts/generate-audio.ts writes `<prefix>/<slug>.mp3`
// and `.json`, and apps/api/src/audio.ts serves them at /blog/audio/<slug>.{mp3,json}.

// Namespaced per voice so a new one never overwrites the last.
export const AUDIO_PREFIX = "blog/breeze";
