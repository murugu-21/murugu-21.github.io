# MLX fakes

Fake versions of `mlx` and `mlx_audio`, so the tests can run the Python scripts on any machine without the real models. The type checker uses them too.

Keep their function signatures matching the real libraries. Nothing else catches it when they drift.

The test input picks what the fake does:

- `mlx_audio.tts` returns 10 ms of audio per character. Text with `[raise]` fails, `[rate]` returns 22050 Hz audio, and `[silent]` returns nothing.
- `mlx_audio.stt` aligns each word of the text, punctuation stripped like the real aligner, to half a second in turn. A wav that doesn't exist fails with `FileNotFoundError`.
