# Welcome portrait

`brandon-model-welcome.jpg` is a direct Three.js render of the project's exported `public/models/fullstack-brandon.glb`, with a small procedural pickle prop. It uses the actual in-game character rather than a generated replacement.

Editable studio source: `lab/welcome-portrait.js`.

Recreate the studio bundle with:

```
node_modules/.bin/esbuild lab/welcome-portrait.js --bundle --format=esm --outfile=evidence/ui-cleanup/portrait-studio/portrait.js
```

The studio's HTML and copied source model are in `evidence/ui-cleanup/portrait-studio/`. Serve that directory on loopback and capture its 1024 x 1024 canvas.
