# Read-aloud audio

Every blog post has a Listen button. If the post has recorded audio, it plays that and highlights each word as it's read. If not, it falls back to the browser's built-in voice.

The audio is made on a Mac with an AI voice model (Breeze TTS 2) and uploaded to R2. It never runs in CI. You need an Apple Silicon Mac.

## Set up once

```bash
terraform -chdir=infra apply           # creates the R2 bucket
brew install ffmpeg
uv sync --locked --project apps/tts    # Python environment
```

`bun run audio` downloads the current voice from R2 the first time. To design a new voice instead:

```bash
bun run py python apps/tts/design-voice.py 3   # writes 3 candidates to apps/tts/.voice/candidates/
cp apps/tts/.voice/candidates/<k>.wav apps/tts/.voice/reference.wav
cp apps/tts/.voice/candidates/reference.txt apps/tts/.voice/reference.txt
bun run audio --upload-voice                   # saves it to R2
```

## Add audio to a post

```bash
bun run build && bun run audio <slug>   # about 3 s of work per second of audio
bun run audio:align <slug>              # adds word timings, about 5 s
```

Then push as usual. Run the two commands one after the other, never at the same time.

- With no slug, `bun run audio` does every post whose text changed.
- `--force` redoes a post, `--dry-run` only checks what would change, and `--local` writes to your local `preview` instead of R2.
- For a small text fix, `bun run audio --patch <slug>` redoes only the changed paragraphs. Then run `bun run audio:align <slug> --force`. If a paragraph was added or removed, use `--force` instead of `--patch`.

## If an upload fails

The rendered files stay in the `$TMPDIR/audio-<slug>-*` folder the script prints. Upload them from there instead of rendering again. Upload the MP3 first, because the JSON marks the post as done.

```bash
bunx wrangler r2 object put murugappan-dev-audio/blog/breeze/<slug>.mp3 --remote --file <dir>/<slug>.mp3 --content-type audio/mpeg
bunx wrangler r2 object put murugappan-dev-audio/blog/breeze/<slug>.json --remote --file <dir>/<slug>.json --content-type application/json
```
