# Read-aloud audio

Every post has a **Listen** control. When `/blog/audio/<slug>.json` exists, the page plays a pre-rendered MP3 and highlights the paragraph (or word) being read. Otherwise it falls back to the browser's speech synthesis, which highlights words from `boundary` events.

Audio generation runs **on a laptop, never in CI**, because the model is 3.9 GB and needs Apple Silicon.

**Pipeline** (`scripts/site/generate-audio.ts`):

1. Extract text from the built HTML with the same `speechBlocks()` the page uses, then normalize emoji, punctuation and long digit runs. Breeze loops on runs like `0.30000000000000004`, so `normalizeSpeechText` describes them instead of reading them out.
2. Synthesize sentence groups of at most 300 characters with Breeze TTS 2 ([mlx-community/Breeze-TTS-2-mlx-8bit](https://huggingface.co/mlx-community/Breeze-TTS-2-mlx-8bit) via [mlx-audio](https://github.com/Blaizzy/mlx-audio), `scripts/site/tts/synth.py`), cloning `.voice/reference.wav` with no instruction prompt. Use the 8-bit build; bf16 swaps on a 24 GB machine.
3. Speed up each chunk (`atempo=1.08`), join with 0.15 s gaps inside a paragraph and 0.45 s between paragraphs, and normalize loudness (`loudnorm I=-16`).
4. Upload a 64 kbps MP3 and a `{blocks:[{text,start,end}]}` JSON to the R2 bucket `murugappan-dev-audio` (`infra/main.tf`, bound as `AUDIO`) under `blog/breeze/`. `worker/audio.ts` serves them with Range and ETag support.

The script skips posts whose spoken text hasn't changed. The `blog/<slug>.*` objects in R2 are unused and safe to delete.

The voice reference is a synthetic clip designed once from the persona prompt in `scripts/site/tts/design-voice.py`, so every paragraph clones the same clean source. Breeze TTS 2 weights are under the BreezeBlue Research and Non-Commercial License, which this personal blog satisfies.

**One-time setup**

```bash
terraform -chdir=infra apply   # creates the R2 bucket
brew install ffmpeg
python3.13 -m venv .venv-tts && .venv-tts/bin/pip install -r scripts/site/tts/requirements.txt
.venv-tts/bin/python scripts/site/tts/design-voice.py 3   # writes .voice/candidates/{0,1,2}.wav from the persona prompt
cp .voice/candidates/<k>.wav .voice/reference.wav && cp .voice/candidates/reference.txt .voice/reference.txt
bun run audio --upload-voice     # durable copy in R2
```

To reuse the current voice instead, skip the design step: `bun run audio` restores `.voice/` from `voice/breeze/` in R2 when it's missing. The voice reference and venv are gitignored, and the reference is never served.

**Publishing a post**

```bash
bun run build && bun run audio <slug>   # ~2.8 s of compute per second of audio on an M4 Pro
bun run audio:align <slug>             # word timings, ~5 s per post
```

Then push as usual. With no slug, `bun run audio` renders every changed post. `--force` re-renders, `--dry-run` only extracts and hashes, and `--local` writes to the local R2 state that `bun run dev` serves (`.cloudflare/state`).

Every render stays in the `$TMPDIR/audio-<slug>-*` directory the script logs, about 370 MB for a 45-minute post, and nothing deletes it. If an upload fails, push the files from there instead of rendering again, MP3 first because the JSON's hash marks the post as done:

```bash
bunx cf r2 objects put blog/breeze/<slug>.mp3 --bucket-name murugappan-dev-audio --file <dir>/<slug>.mp3 --content-type audio/mpeg
bunx cf r2 objects put blog/breeze/<slug>.json --bucket-name murugappan-dev-audio --file <dir>/<slug>.json --content-type application/json
```

`bun run audio:align` (`scripts/site/align-audio.ts`) runs after synthesis, never at the same time. It slices each paragraph out of the MP3 in R2, gets word timestamps from [mlx-whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper) (`whisper-large-v3-turbo`, 1.6 GB, downloaded automatically), maps them onto the known text (`src/lib/blog/audio-words.ts`) and rewrites the JSON as version 2 with a `words` array per paragraph.
