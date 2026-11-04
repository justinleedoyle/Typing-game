# Opening and Winter sound palette

These ten recordings are original project audio, authored as deterministic
digital synthesis by `scripts/render-opening-winter-audio.mjs`. No third-party
recordings, soundfonts, melodies, models or voices were used. No additional
attribution or sample license is required for these assets. Retain this source
and the generator with the game's production provenance.

- `hearth-theme.mp3`: 96-second, three-phrase instrumental study/home theme.
  Soft dispersive plucked strings, open D harmony, a returning D–A–E motif,
  irregular broken chords and room reflections. The third phrase varies the
  melody; rests leave room for reading and existing typewriter sounds.
- `winter-theme.mp3`: 96-second cooler response to the same motif, minor/open
  harmony and lightly struck glass-like upper notes. No continuous drone.
- `hearth.mp3`: soft room/fire texture and sparse crackles, 22-second loop.
- `wind.mp3`: filtered, slowly swelling stereo mountain/pine air, 22 seconds.
- `stream.mp3`: sheltered running-water texture, 22 seconds; used only on the
  painted stream trail and return, not behind the glade's frozen waterfall.
- `snow`, `wood`, `stone`, `bough`, `flame`: short material sounds for completed
  authored actions. Restoring a checkpoint does not replay them.

Music tails wrap into the next phrase/loop. Environment loops overlap and trim
their boundary. MP3 files include encoder delay/padding metadata and are decoded
to reusable Web Audio buffers. All playback passes through the saved Sound
preference; per-scene sources pause with gameplay and never resume on focus
return alone. The calm theme returns after the Pack-Leader and on the way home;
threat passages lower the melody beneath existing combat feedback.

Regenerate from the repository root with Node and an installed ffmpeg/LAME:

```sh
node scripts/render-opening-winter-audio.mjs
```

`render-report.json` records duration, peak, RMS level (average signal energy),
sample rate and channel count before encoding. This proves signal headroom,
not artistic acceptance or the volume of a listener's physical speakers.
Voices remain a separate, final production pass.
