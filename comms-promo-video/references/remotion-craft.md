# Remotion craft and render QA

Use this reference when building or debugging a promo video in Remotion.

## Project and timeline discipline

- Derive every duration and offset from `fps` via `useVideoConfig()`. Do not scatter raw frame numbers across components.
- Put palette, fonts, spring presets, easing curves, and beat timings in one theme module (for example `src/theme.ts`). Never inline magic hex colors or curves inside scenes.
- Wrap each scene in `<Sequence>` so its internal timeline starts at local frame `0`.
- Validate composition props with a schema (such as Zod) so landscape (`1920x1080`) and portrait (`1080x1920`) compositions share one data contract.
- Never use CSS `transition` or CSS `@keyframes` animations. They ignore Remotion's frame clock and cause stutter or desync during rendering.

## Motion craft

- Avoid linear easing on UI and typography. Use `spring()` for entrances and `interpolate()` with explicit easing curves (`Easing.out(...)`, `Easing.bezier(...)`) and both `extrapolateLeft: "clamp"` and `extrapolateRight: "clamp"`.
- Combine 2 to 3 properties on entrances (for example opacity, short `translateY`, and slight scale). Do not rely on lone opacity fades.
- Stagger sibling items (words, cards, chips) by 2 to 6 frames at 30fps so elements do not arrive as one block.
- Make exits faster than entrances, roughly half the entrance duration.
- Do not CSS-scale or zoom a parent container that holds crisp UI text, because resampling makes type shimmer. Transform individual elements inside the frame on `transform` and `opacity` instead.
- Check for abrupt state teleports (ternary conditionals on `background`, `border`, `color`, or `opacity`) and scene components that omit `useCurrentFrame()`. Drive transitions continuously and use `color-mix(in oklab, ...)` so color blends avoid grey midpoints.
- Give still photos subtle Ken Burns motion (slow scale from `1` to `1.08` with a gentle pan) so they do not feel static.
- Preview fast transitions at 0.25x speed in Remotion Studio. Easing flaws hidden at 1x stand out at quarter speed.

## Media, fonts, and headless Chromium

- Load display and body fonts explicitly (through `@remotion/google-fonts` or bundled `@font-face`) and block frame capture until loaded so headless Chromium never falls back to system fonts.
- Place local media in `public/` and reference it with `staticFile()`.
- Prefer `<OffthreadVideo>` over `<Video>` for embedded clips. If Remotion's compositor binary crashes on an older OS, extract the clip 1:1 into a gitignored stills folder with FFmpeg and sequence the stills per frame.
- Run `npx remotion browser ensure` so Remotion uses its own Headless Shell. Pointing `CHROME_PATH` at an already-running desktop Chrome causes the second process to hand off and exit without opening a debug port, which surfaces as a 25-second connection timeout with an empty log.

## Render settings and debugging

- Keep output dimensions divisible by 16 (for example `1920x1080`, `1080x1920`, or `1536x960` rather than `1600x1000`) to avoid partial macroblock rows.
- Render upload masters with headroom because social platforms re-compress:
  ```bash
  npx remotion render src/index.ts <CompId> out/video.mp4 --codec h264 --crf 16
  ```
- Add `--image-format png` when scenes stack heavy blur or alpha transparency.
- For web embeds that autoplay, remux with `-movflags +faststart` so playback starts before the full file downloads:
  ```bash
  npx remotion ffmpeg -y -i out/video.mp4 -c copy -movflags +faststart out/video-web.mp4
  ```
- Never fade a scene out onto blank white between cuts. Keep a shared ground or cross-dissolve to prevent full-frame luminance flashes.
- If a rendered MP4 shows tiled frames, render that exact frame with `npx remotion still` to isolate rendering from encoding, then re-render with `--concurrency=1`.
- Back up a known-good MP4 before re-rendering because `out/` is gitignored and re-renders overwrite in place.

## Visual QA loop

Extract inspection frames from the actual rendered MP4 (not only Remotion Studio) using Remotion's bundled FFmpeg:

```bash
mkdir -p out/qa
npx remotion ffmpeg -y -i out/video.mp4 -vf fps=1 out/qa/frame-%03d.png
```

Also render key transition midpoints and the first and last frames (for loop seams) with `npx remotion still`. Inspect every extracted PNG directly before delivering the video, fix any clipping, misalignment, fallback font, or luminance jump, and re-verify after re-rendering.
