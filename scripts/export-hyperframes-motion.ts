import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire, stripTypeScriptTypes } from "node:module";
import { dirname, join, resolve } from "node:path";

// Run after `hyperframes init` and `hyperframes add code-particle-assemble` in this dedicated preview directory.
const output = resolve(process.argv[2] ?? "out/hyperframes-motion");
const manifest = JSON.parse(await readFile(join(output, "package.json"), "utf8"));
if (manifest.name !== "hyperframes-motion") throw new Error("Use the dedicated hyperframes-motion scaffold; this exporter replaces its demo compositions.");
await readFile(join(output, "compositions/code-particle-assemble.html"));
const assets = join(output, "assets");
await mkdir(assets, { recursive: true });
const requireVideo = createRequire(new URL("../packages/video/package.json", import.meta.url));
const build = dirname(requireVideo.resolve("three"));
for (const file of ["three.module.js", "three.core.js"]) await copyFile(join(build, file), join(assets, file));
await copyFile(requireVideo.resolve("gsap/dist/gsap.min.js"), join(assets, "gsap.min.js"));
const model = await readFile(new URL("../packages/video/src/scene3d.ts", import.meta.url), "utf8");
const compiled = stripTypeScriptTypes(model);
await writeFile(join(assets, "scene3d.js"), compiled.replace('from "three"', 'from "./three.module.js"'));

// Share the pinned engine with the catalog block instead of shipping a second Three.js runtime.
const blockPath = join(output, "compositions/code-particle-assemble.html");
let block = await readFile(blockPath, "utf8");
block = block.replace(/\s*<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/(?:three|gsap)@[^"\n]+"><\/script>/g, "");
block = block.replace('if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go);\n        else go();',
  `window.__hf=window.__hf||{};window.__hf.buildReady=window.__hf.buildReady||{};
        window.__hf.buildReady.codeParticles=import('./assets/three.module.js').then(function(engine){window.THREE=engine;go();});`);
block = block.replace('data-engine="three.js r147"', 'data-engine="three.js"').replace('<canvas id="gl"', '<canvas data-layout-allow-overflow id="gl"');
await writeFile(blockPath, block);

await writeFile(join(output, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Scene Motion Lab</title>
<script src="assets/gsap.min.js"></script>
<style>*{box-sizing:border-box;margin:0}html,body{width:1920px;height:1080px;overflow:hidden;background:#091426}.clip{position:absolute;inset:0}</style>
</head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="12" data-width="1920" data-height="1080">
<div id="hero3d" class="clip" data-composition-id="hero3d" data-composition-src="compositions/hero3d.html" data-start="0" data-duration="4" data-track-index="0" data-track-kind="graphics" data-width="1920" data-height="1080"></div>
<div id="code-particle-assemble" class="clip" data-composition-id="code-particle-assemble" data-composition-src="compositions/code-particle-assemble.html" data-start="4" data-duration="8" data-track-index="0" data-track-kind="graphics" data-width="1920" data-height="1080"></div>
</div><script>window.__timelines=window.__timelines||{};window.__timelines.main=gsap.timeline({paused:true}).to({},{duration:12});</script></body></html>`);

await writeFile(join(output, "compositions/hero3d.html"), `<template>
<style>#root{position:absolute;inset:0;background:#091426;font-family:Inter;color:#f4f8ff}#hero-canvas{position:absolute;left:840px;top:80px;width:1000px;height:1000px}#hero-copy{position:absolute;left:150px;top:330px;width:660px}#hero-eyebrow{font-size:30px;letter-spacing:6px;color:#70d6ff}#hero-title{font-size:106px;line-height:1.02;letter-spacing:-5px;margin-top:34px}#hero-subtitle{font-size:32px;line-height:1.5;color:#d8e7f4;margin-top:40px}</style>
<div id="root" data-composition-id="hero3d" data-start="0" data-duration="4" data-width="1920" data-height="1080">
<canvas id="hero-canvas" width="1000" height="1000" data-layout-ignore></canvas>
<div id="hero-copy"><div id="hero-eyebrow">SCENE MOTION LAB</div><h1 id="hero-title">Ideas take<br>shape.</h1><p id="hero-subtitle">Editable 3D. Deliberate movement.<br>One frame at a time.</p></div>
</div>
<script>
window.__hf=window.__hf||{};window.__hf.buildReady=window.__hf.buildReady||{};
window.__hf.buildReady.hero3d=Promise.all([import('./assets/scene3d.js'),import('./assets/three.module.js')]).then(async function(modules){
  const model=modules[0].createScene3D({preset:'crystal',color:'#70d6ff',accent:'#ffd84d',camera:'push_in',wireframe:false});
  const renderer=new modules[1].WebGLRenderer({canvas:document.getElementById('hero-canvas'),alpha:true,antialias:true,preserveDrawingBuffer:true});
  renderer.setSize(1000,1000,false);renderer.setPixelRatio(1);renderer.setClearColor(0,0);
  await renderer.compileAsync(model.scene,model.camera);
  function renderAt(t){const time=Math.max(0,Math.min(4,t));model.sample(time,time/4);renderer.render(model.scene,model.camera);}
  window.addEventListener('hf-seek',function(event){renderAt(event.detail.time);});
  const tl=gsap.timeline({paused:true});
  tl.fromTo('#hero-title',{x:-50,opacity:0.2},{x:0,opacity:1,duration:0.7,ease:'power3.out'},0);
  tl.fromTo('#hero-subtitle',{y:20,opacity:0},{y:0,opacity:1,duration:0.55,ease:'power3.out'},0.55);
  tl.to({},{duration:4},0);renderAt(0);window.__timelines.hero3d=tl;
  window.addEventListener('beforeunload',function(){model.dispose();renderer.dispose();});
});
</script></template>`);
console.log(`Exported editable hosted 3D and registry scene to ${output}`);
