# MLX fakes

Fake versions of `mlx`, `mlx_audio` and `mlx_whisper`, so the tests can run the Python scripts on any machine without the real models. The type checker uses them too.

Keep their function signatures matching the real libraries. Nothing else catches it when they drift.

The test input picks what the fake does:

- `mlx_audio.tts` returns 10 ms of audio per character. Text with `[raise]` fails, `[rate]` returns 22050 Hz audio, and `[silent]` returns nothing.
- `mlx_whisper` "hears" the words in `<wav>.txt`, half a second each. A wav with `echo` in its name hears only `Thanks.`, like real whisper does when it repeats the prompt.
