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

## Temporary Sunken Bell palette

Bell's recordings are a working sound palette, explicitly intended for later
replacement by Justin's externally created music. Their stable imports live
in `src/audio/soundscapes.ts`; no music filename is stored in a saved journey.
Replace `bell-theme.mp3` and `bell-clear-theme.mp3` at the same paths, rebuild,
and verify the loop boundary and mix. Different durations are supported; the
current recordings are96seconds. Keep replacement provenance/licenses here.
There is no need to regenerate or replace environmental/action sounds when
replacing a score. Update this note and retain originals in version history.

`scripts/render-bell-audio.mjs` creates only the eight Bell recordings below
using original deterministic synthesis, seed148307. No source recordings,
third-party composition, soundfont or voice is used. The temporary musical
themes use sparse softened plucked notes related to the home's D/E/A motif,
with widely spaced reflections rather than a sustained humming pad.

- `bell-theme.mp3`:96-second submerged exploration theme.
- `bell-clear-theme.mp3`:96-second warmer aftermath/free-Aurland theme.
- `bell-water.mp3`:22-second muffled underwater wash; not surface rain/drips.
- `bell-masonry.mp3`:22-second sparse non-periodic submerged masonry texture.
- `bell-lantern`, `bell-latch`, `bell-rubble`, `bell-release`:3-second material
  cues for actual completed lantern, quiet doorway, forced doorway and binding
  actions. These contain no spoken/sung chant or recurring bell toll.

During rhythm practice and fights the music/masonry stop, leaving low water
under the existing beat instructions and feedback. After taking the clapper,
only water remains through the aftermath and that branch's revisit; a restored
held response does not replay an action cue. The original owned pause, mute,
load-failure and shutdown behavior applies. Voices still come last.

Regenerate Bell only with `node scripts/render-bell-audio.mjs` and ffmpeg/LAME.
`bell-render-report.json` contains the pre-encode technical measurements.
Physical listening and final musical/artistic approval remain separate.
