# Read-aloud audio

Every post has a **Listen** control. When `/blog/audio/<slug>.json` exists, the page plays a pre-rendered MP3 and highlights the paragraph (or word) being read. Otherwise it falls back to the browser's speech synthesis, which highlights words from `boundary` events.

Audio generation runs **on a laptop, never in CI**, because the model is 3.9 GB and needs Apple Silicon.

**Pipeline** (`apps/tts/generate-audio.ts`, each post in `apps/tts/render.ts`):

1. Extract text from the built HTML with the same `speechBlocks()` the page uses, then normalize emoji, punctuation and long digit runs. Breeze loops on runs like `0.30000000000000004`, so `normalizeSpeechText` describes them instead of reading them out.
2. Synthesize sentence groups of at most 300 characters with Breeze TTS 2 ([mlx-community/Breeze-TTS-2-mlx-8bit](https://huggingface.co/mlx-community/Breeze-TTS-2-mlx-8bit) via [mlx-audio](https://github.com/Blaizzy/mlx-audio), `apps/tts/synth.py`), cloning `.voice/reference.wav` with no instruction prompt. Use the 8-bit build; bf16 swaps on a 24 GB machine.
3. Speed up each chunk (`atempo=1.08`), join with 0.15 s gaps inside a paragraph and 0.45 s between paragraphs, and normalize loudness (`loudnorm I=-16`).
4. Upload a 64 kbps MP3 and a `{blocks:[{text,start,end}]}` JSON to the R2 bucket `murugappan-dev-audio` (`infra/main.tf`, bound as `AUDIO`) under `blog/breeze/`. `apps/api/src/audio.ts` serves them with Range and ETag support.

The script skips posts whose spoken text hasn't changed. The `blog/<slug>.*` objects in R2 are unused and safe to delete.

The voice reference is a synthetic clip designed once from the persona prompt in `apps/tts/design-voice.py`, so every paragraph clones the same clean source. Breeze TTS 2 weights are under the BreezeBlue Research and Non-Commercial License, which this personal blog satisfies.

**One-time setup**

```bash
terraform -chdir=infra apply   # creates the R2 bucket
brew install ffmpeg
uv sync --locked --project apps/tts   # the venv, from pyproject.toml and uv.lock
bun run py python apps/tts/design-voice.py 3   # writes apps/tts/.voice/candidates/{0,1,2}.wav from the persona prompt
cp apps/tts/.voice/candidates/<k>.wav apps/tts/.voice/reference.wav
cp apps/tts/.voice/candidates/reference.txt apps/tts/.voice/reference.txt
bun run audio --upload-voice     # durable copy in R2
```

To reuse the current voice instead, skip the design step: `bun run audio` restores `apps/tts/.voice/` from `voice/breeze/` in R2 when it's missing. The voice reference and venv are gitignored, and the reference is never served.

**Publishing a post**

```bash
bun run build && bun run audio <slug>   # ~2.8 s of compute per second of audio on an M4 Pro
bun run audio:align <slug>             # word timings, ~5 s per post
```

Then push as usual. With no slug, `bun run audio` renders every changed post. `--force` re-renders, `--dry-run` only extracts and hashes, and `--local` writes to the local R2 state that `bun run preview` serves (`apps/api/.wrangler/state`).

For a small text fix, `bun run audio --patch <slug>` re-synthesizes only the paragraphs whose text changed and splices them into the MP3 already in R2, which takes minutes instead of a full render. It levels each new paragraph with the same loudnorm pass on its own, shifts the later timings, and keeps a copy of the old R2 objects in the logged `backup/` directory. It needs the same paragraph count as the stored timings, so a post that gained or lost a paragraph needs a full render (`bun run audio <slug> --force`). Run `bun run audio:align <slug> --force` afterwards: the patched paragraphs come back without word timings.

Every render stays in the `$TMPDIR/audio-<slug>-*` directory the script logs, about 370 MB for a 45-minute post, and nothing deletes it. Its `.pcm` files are headerless 16-bit mono audio; play one with `ffplay -f s16le -ar 24000 -ac 1 <file>`. If an upload fails, push the files from there instead of rendering again, MP3 first because the JSON's hash marks the post as done:

```bash
bunx wrangler r2 object put murugappan-dev-audio/blog/breeze/<slug>.mp3 --remote --file <dir>/<slug>.mp3 --content-type audio/mpeg
bunx wrangler r2 object put murugappan-dev-audio/blog/breeze/<slug>.json --remote --file <dir>/<slug>.json --content-type application/json
```

`bun run audio:align` (`apps/tts/align-audio.ts`) runs after synthesis, never at the same time. It slices each paragraph out of the MP3 in R2, gets word timestamps from [mlx-whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper) (`whisper-large-v3-turbo`, 1.6 GB, downloaded automatically), maps them onto the known text (`apps/tts/align-words.ts`) and rewrites the JSON as version 2 with a `words` array per paragraph.
