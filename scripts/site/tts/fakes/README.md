# MLX fakes

Stand-ins for `mlx`, `mlx_audio` and `mlx_whisper`, put first on `PYTHONPATH` by the contract tests (`synth.test.ts`, `align.test.ts`). They let `synth.py` and `whisper.py` run on any machine, with no model, while the tests drive them through the real TypeScript clients.

basedpyright resolves the MLX imports to these fakes too (`extraPaths` in `pyproject.toml`), so a fake's signatures are what `check:py` checks the scripts against. Keep them matching the real call signatures: only a real render or alignment catches a drift.

The scenario comes from the input, so each test shows what it sets up:

- `mlx_audio.tts`: every character of text is 10 ms of audio at 0.5 amplitude, in two pieces. Text containing `[raise]` fails, `[rate]` comes back at 22050 Hz, and `[silent]` yields nothing. Loading and generating print to stdout, as the real library does.
- `mlx_whisper`: hears the words in `<wav>.txt`, half a second each. A wav whose name contains `echo` hears only `Thanks.` when prompted, as whisper does when it takes the prompt as already spoken.
