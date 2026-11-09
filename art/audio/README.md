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

## Temporary Clockwork Forge palette

The Forge score is provisional too. Replace `forge-theme.mp3` and
`forge-clear-theme.mp3` at these stable paths, rebuild and check transitions,
loop boundaries and listening levels. Durations may change; audio filenames
are never saved in a journey. Keep replacement provenance/licenses here.
Environmental loops and action cues can stay when the score is replaced.

`scripts/render-forge-audio.mjs` creates eight original deterministic recordings
without third-party samples, soundfonts, compositions or voices:

- `forge-theme.mp3`:96-second restrained struck-metal/string exploration theme,
  related to the home's D/A/E motif with room for reading and typing feedback.
- `forge-clear-theme.mp3`:96-second warmer aftermath theme.
- `forge-furnace.mp3`:22-second filtered heat/air texture.
- `forge-mechanism.mp3`:22-second sparse irregular bearing/pipe friction,
  without a periodic hammer beat or an independent gameplay timing signal.
- `forge-wheel`, `forge-lock`, `forge-gear`, `forge-flame`:3-second material
  cues tied to native catwalk, valve, repair and peaceful-order completions.

Combat lowers the score. The apprentices' valve action lowers the furnace and
machinery after it actually completes, including checkpoint restoration.
The peaceful order removes machinery from the aftermath; completed revisits
retain both known outcomes. Restoring a response never replays its action cue.
All layers use the existing owned pause, mute, interruption and shutdown path.

Regenerate Forge only with `node scripts/render-forge-audio.mjs` and ffmpeg/LAME.
`forge-render-report.json` records the synthesis and decode measurements.
Physical listening and artistic approval remain separate; voices remain last.

## Temporary Sky Island palette

Sky's score is a provisional open-air companion to the existing home motif.
Replace `sky-theme.mp3` and `sky-clear-theme.mp3` at these stable paths, rebuild
and check the loop, transitions and listening levels. Durations may change;
audio filenames are never saved in a journey. Keep replacement provenance and
licenses here. The environmental loops and action cues can remain unchanged
when the music is replaced.

`scripts/render-sky-audio.mjs` creates eight original deterministic recordings,
seed 387241, without source samples, soundfonts, third-party compositions,
provider calls or voices:

- `sky-theme.mp3`: 96-second sparse airy plucked-string exploration theme,
  with unequal rests and the established D/A/E family in a higher register.
- `sky-clear-theme.mp3`: 96-second warmer aftermath theme, retaining the
  same instrumental color while opening the harmony.
- `sky-wind.mp3`: 22-second soft stereo open-air texture with slow swells.
- `sky-paper.mp3`: 22-second sparse irregular paper-lantern/page flutter,
  without a periodic beat or another gameplay timing signal.
- `sky-stone`, `sky-lantern`, `sky-book`, `sky-tether`: 3-second material
  cues for completed traversal, light, book-handling and fiber-release actions.

The scene lowers the score during moving-scroll and riddle encounters. Etta's
book/beacon work, a taken flame, a kind answer and freed tethered wind have
distinct layer levels after the actual action completes; checkpoint and revisit
reconstruction retain those consequences without replaying action sounds.
All layers use the shared owned pause, mute, interruption and shutdown path.

Regenerate Sky only with `node scripts/render-sky-audio.mjs` and ffmpeg/LAME.
`sky-render-report.json` records the synthesis and MP3 decode measurements.
These are technical checks, not physical listening or artistic acceptance.
Voices remain last.

## Temporary Whispering Wood, finale and homecoming palette

These scores complete the provisional instrumental palette and remain intended
for replacement by Justin's final music. Replace `wood-theme.mp3`,
`wood-clear-theme.mp3`, `finale-theme.mp3` or `homecoming-theme.mp3` independently
at the same paths, rebuild, and check loop boundaries, scene transitions and
listening levels. Different durations are supported; filenames and playheads
are not saved in a journey. Retain replacement provenance and licenses here.

`scripts/render-wood-finale-audio.mjs` creates eleven original deterministic
recordings, seed 592813, without source samples, soundfonts, third-party
compositions, voices or provider calls:

- `wood-theme.mp3`: 96-second restrained wooden/string exploration theme,
  with lower-register responses to the established D/A/E musical family.
- `wood-clear-theme.mp3`: 96-second warmer forest aftermath theme.
- `wood-air.mp3`: 22-second sheltered canopy-air loop.
- `wood-leaves.mp3`: 22-second sparse irregular leaf movement. Neither loop
  contains voices, literal ghost whispers, animal calls or periodic footsteps.
- `wood-root`, `wood-stone`, `wood-lantern`, `wood-seal`: 3-second material
  cues for authored completed traversal, shrine/light and sealing actions.
  The stolen bone-flute remains silent as the story says; it gains no melody.
- `finale-theme.mp3`: 96-second sparse low-string confrontation theme,
  without drums or an independent beat signal beneath the original feedback.
- `finale-air.mp3`: 22-second quiet castle/courtyard air texture.
- `homecoming-theme.mp3`: 96-second resolving instrumental reprise of the
  home musical family, shared by the reunion and credits. The existing
  `hearth.mp3` supplies the room/fire texture and is not regenerated here.

The Wood's completed actions and remembered branches select different layer
levels; restoring a response does not replay its material cue. Finale mixes
lower during the duel. Its final phrase without companions remains silent;
the companion route has low instrumental support. Music and air stop around
the period seal. Existing chimes, damage sounds and the period-snap sting
retain their roles; this palette adds no extra generic victory hit. Homecoming
and credits share their score's playhead. All playback uses the existing owned
pause, mute, interruption and scene-shutdown path.

Regenerate only these eleven recordings with
`node scripts/render-wood-finale-audio.mjs` and ffmpeg/LAME.
`wood-finale-render-report.json` records pre-encode and decoded measurements.
Numeric headroom and boundary checks do not establish physical listening,
musical acceptance or a whole-game clipping guarantee. Voices remain last.
