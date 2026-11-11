# Local style previews

Original procedural SVG/JSON fixtures rendered by this repository (MIT). No external video, artwork or paid generation is included. Each MP4 is an 8-second silent 1920x1080, 240-frame comparison of the same message-to-server sequence. Posters show the settled composition.

Regenerate and install from the repository root:

~~~powershell
pnpm.cmd motion:styles:preview out/style-craft --render
pnpm.cmd motion:styles:install out/style-craft
~~~

Installation verifies dimensions, duration and frame count before copying any previews, and updates cache-busting content hashes in src/lib/style-previews.ts. See docs/STYLE_CRAFT.md for native runtime limits and review evidence. These are technical material samples, not narrated episodes.
