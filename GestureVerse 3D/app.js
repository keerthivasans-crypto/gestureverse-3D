import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* =========================================================================
   AETHER — Gesture-controlled holographic 3D interface
   Honest scope note (see README.md for full details):
   - The "24-model library" below is procedurally generated with Three.js
     PBR materials (MeshPhysicalMaterial: metalness/roughness/clearcoat/
     transmission) rather than downloaded photoreal GLB assets — this keeps
     the whole app dependency-free and instantly loadable with zero broken
     asset links. Swap in real GLTF/GLB files via loadCustomModel() or the
     Settings > Upload panel to reach true photoreal fidelity.
   - Gesture recognition is a heuristic landmark classifier (angles/
     distances from MediaPipe's 21 points), smoothed and debounced — not a
     trained ML gesture model. It's tuned for the 11 gestures in the brief.
   ========================================================================= */

/* ---------------------------------------------------------------------- */
/* 0. GLOBAL STATE                                                         */
/* ---------------------------------------------------------------------- */
const state = {
  cameraOn: false,
  handsDetected: 0,
  fps: 0,
  quality: 'medium',
  bloomStrength: 1.2,
  particleDensity: 1.0,
  sensitivity: 0.7,
  mirror: true,
  showSkeleton: true,
  sfxOn: true,
  physicsOn: true,
  theme: 'cyan',
  selectedLibId: 'rose',
  focusedObjectId: null,
  history: [],
  favorites: new Set(JSON.parse(localStorage.getItem('aether_favs') || '[]')),
};

const THEME_COLORS = {
  cyan:   { a: 0x4fe3ff, b: 0xa855f7 },
  violet: { a: 0xa855f7, b: 0x4fe3ff },
  rose:   { a: 0xff5470, b: 0x4fe3ff },
  mint:   { a: 0x4dffa8, b: 0xa855f7 },
  amber:  { a: 0xffb454, b: 0xa855f7 },
};

/* ---------------------------------------------------------------------- */
/* 1. OBJECT LIBRARY (24 procedurally-built PBR models across 6 categories)*/
/* ---------------------------------------------------------------------- */
const LIBRARY = [
  { id:'rose',        name:'Rose',            cat:'Nature', icon:'🌹', build:'rose',      color:0xe8375f },
  { id:'sunflower',   name:'Sunflower',       cat:'Nature', icon:'🌻', build:'sunflower', color:0xffc93c },
  { id:'bonsai',      name:'Bonsai Tree',     cat:'Nature', icon:'🌳', build:'bonsai',    color:0x4c8c4a },
  { id:'butterfly',   name:'Butterfly',       cat:'Nature', icon:'🦋', build:'butterfly', color:0x63d4ff },

  { id:'dragon',      name:'Dragon',          cat:'Fantasy', icon:'🐉', build:'dragon',      color:0x35c56a },
  { id:'crystalball', name:'Crystal Ball',    cat:'Fantasy', icon:'🔮', build:'crystalball', color:0x9b6bff },
  { id:'wand',        name:'Magic Wand',      cat:'Fantasy', icon:'🪄', build:'wand',        color:0xffd76a },
  { id:'sword',       name:'Ancient Sword',   cat:'Fantasy', icon:'⚔️', build:'sword',       color:0xc9d6e3 },

  { id:'earth',       name:'Earth',           cat:'Space', icon:'🌍', build:'earth',   color:0x2a6fd6 },
  { id:'saturn',      name:'Saturn',          cat:'Space', icon:'🪐', build:'saturn',  color:0xe0b97d },
  { id:'galaxy',      name:'Galaxy',          cat:'Space', icon:'🌌', build:'galaxy',  color:0x8a5fff },
  { id:'meteor',      name:'Meteor',          cat:'Space', icon:'☄️', build:'meteor',  color:0xff7a45 },

  { id:'dna',         name:'DNA Helix',       cat:'Science', icon:'🧬', build:'dna',    color:0x4fe3ff },
  { id:'atom',        name:'Atom',            cat:'Science', icon:'⚛️', build:'atom',   color:0x62e0ff },
  { id:'brain',       name:'Human Brain',     cat:'Science', icon:'🧠', build:'brain',  color:0xff8fb1 },
  { id:'heart',       name:'Heart',           cat:'Science', icon:'❤️', build:'heart',  color:0xff4d6a },

  { id:'fire',        name:'Fire',            cat:'Energy', icon:'🔥', build:'fire',    color:0xff6a2b },
  { id:'plasma',      name:'Plasma Ball',     cat:'Energy', icon:'🟣', build:'plasma',  color:0xc86bff },
  { id:'electricity', name:'Electricity',     cat:'Energy', icon:'⚡', build:'electricity', color:0x8fe8ff },
  { id:'ice',         name:'Ice Crystal',     cat:'Energy', icon:'❄️', build:'ice',     color:0xaee9ff },

  { id:'diamond',     name:'Diamond',         cat:'Luxury', icon:'💎', build:'diamond', color:0xdff6ff },
  { id:'crown',       name:'Gold Crown',      cat:'Luxury', icon:'👑', build:'crown',   color:0xffcf5c },
  { id:'car',         name:'Sports Car',      cat:'Luxury', icon:'🏎️', build:'car',     color:0xff3860 },
  { id:'watch',       name:'Luxury Watch',    cat:'Luxury', icon:'⌚', build:'watch',   color:0xd8c48c },
];

/* ---------------------------------------------------------------------- */
/* 2. GESTURE LEXICON (for modal + action map)                            */
/* ---------------------------------------------------------------------- */
const GESTURES = [
  { id:'open_palm',  icon:'✋', name:'OPEN PALM',    desc:'Spawn the currently selected object into the scene.' },
  { id:'fist',       icon:'✊', name:'CLOSED FIST',  desc:'Remove the focused object from the scene.' },
  { id:'thumb_up',   icon:'👍', name:'THUMB UP',     desc:'Grow the focused object.' },
  { id:'thumb_down', icon:'👎', name:'THUMB DOWN',   desc:'Shrink the focused object.' },
  { id:'two_finger', icon:'✌️', name:'TWO FINGERS',  desc:'Rotate the focused object by moving your hand left / right.' },
  { id:'three_finger', icon:'🤟', name:'THREE FINGERS', desc:'Open the object gallery.' },
  { id:'five_swipe', icon:'🖐️', name:'FIVE FINGER SWIPE', desc:'Fast open-hand swipe triggers a particle explosion.' },
  { id:'ok',         icon:'👌', name:'OK SIGN',      desc:'Cycle the focused object through neon colors.' },
  { id:'pinch',      icon:'🤏', name:'PINCH',        desc:'Grab the focused object and move it through space.' },
  { id:'two_hands',  icon:'🤲', name:'TWO HANDS',    desc:'Move both hands apart / together to scale naturally.' },
  { id:'clap',       icon:'👏', name:'CLAP',         desc:'Bring both hands together fast to reset the whole scene.' },
];

/* ---------------------------------------------------------------------- */
/* 3. THREE.JS SCENE SETUP                                                */
/* ---------------------------------------------------------------------- */
const canvas = document.getElementById('three-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05070d, 0.045);

const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 100);
camera.position.set(0, 1.4, 6.2);
camera.lookAt(0, 1.0, 0);

// PBR environment (procedural — no external HDR download required)
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// Lighting — JARVIS cyan/violet duotone
const ambient = new THREE.AmbientLight(0x25304a, 0.9);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0x4fe3ff, 2.2);
keyLight.position.set(4, 6, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -6; keyLight.shadow.camera.right = 6;
keyLight.shadow.camera.top = 6; keyLight.shadow.camera.bottom = -6;
keyLight.shadow.bias = -0.0015;
scene.add(keyLight);

const rimLight = new THREE.PointLight(0xa855f7, 3.5, 20);
rimLight.position.set(-4, 3, -3);
scene.add(rimLight);

const fillLight = new THREE.PointLight(0x4fe3ff, 1.6, 16);
fillLight.position.set(0, 2, 5);
scene.add(fillLight);

// Lens flare on the key light (cheap "cinematic optics" effect)
const flareTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.35,'rgba(140,220,255,0.6)'); g.addColorStop(1,'rgba(140,220,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
})();
const lensflare = new Lensflare();
lensflare.addElement(new LensflareElement(flareTex, 260, 0, keyLight.color));
lensflare.addElement(new LensflareElement(flareTex, 40, 0.3));
lensflare.addElement(new LensflareElement(flareTex, 70, 0.6));
keyLight.add(lensflare);

// Reflective floor (dynamic reflections)
const floorGeo = new THREE.CircleGeometry(9, 64);
const floor = new Reflector(floorGeo, {
  clipBias: 0.003, textureWidth: 1024, textureHeight: 1024, color: 0x0a0f1a,
});
floor.rotation.x = -Math.PI/2;
floor.position.y = -0.01;
scene.add(floor);

const floorGrid = new THREE.GridHelper(18, 36, 0x4fe3ff, 0x1a2540);
floorGrid.position.y = 0;
floorGrid.material.transparent = true;
floorGrid.material.opacity = 0.25;
scene.add(floorGrid);

// Ambient background star/dust field inside the 3D scene
const starGeo = new THREE.BufferGeometry();
const STAR_COUNT = 900;
const starPos = new Float32Array(STAR_COUNT*3);
for (let i=0;i<STAR_COUNT;i++){
  starPos[i*3]   = (Math.random()-0.5)*40;
  starPos[i*3+1] = Math.random()*20 - 2;
  starPos[i*3+2] = (Math.random()-0.5)*40;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos,3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color:0x9ecfff, size:0.03, transparent:true, opacity:0.55 }));
scene.add(stars);

/* ---- post-processing: bloom ---- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), state.bloomStrength, 0.5, 0.15);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

/* ---------------------------------------------------------------------- */
/* 4. MATERIAL HELPERS (PBR)                                              */
/* ---------------------------------------------------------------------- */
const glassMat = (color, extra={}) => new THREE.MeshPhysicalMaterial({
  color, transmission:0.9, roughness:0.05, thickness:1.2, ior:1.4,
  clearcoat:1, clearcoatRoughness:0.05, envMapIntensity:1.4, ...extra
});
const metalMat = (color, extra={}) => new THREE.MeshPhysicalMaterial({
  color, metalness:1, roughness:0.25, clearcoat:0.4, envMapIntensity:1.6, ...extra
});
const glowMat = (color, intensity=1.4) => new THREE.MeshStandardMaterial({
  color, emissive:color, emissiveIntensity:intensity, roughness:0.4, metalness:0.1
});
const softMat = (color, extra={}) => new THREE.MeshPhysicalMaterial({
  color, roughness:0.55, metalness:0.05, clearcoat:0.2, sheen:1, sheenColor:color, ...extra
});

function makePointCloud(count, radiusFn, color, size=0.03){
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count*3);
  for (let i=0;i<count;i++){
    const p = radiusFn(i);
    pos[i*3]=p.x; pos[i*3+1]=p.y; pos[i*3+2]=p.z;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent:true, opacity:0.85, blending:THREE.AdditiveBlending, depthWrite:false }));
}

/* ---------------------------------------------------------------------- */
/* 5. OBJECT FACTORY — 24 procedural builders                             */
/* ---------------------------------------------------------------------- */
const Factory = {
  rose(c){
    const g = new THREE.Group();
    const petalMat = softMat(c);
    for (let layer=0; layer<4; layer++){
      const n = 5 + layer;
      const r = 0.12 + layer*0.09;
      for (let i=0;i<n;i++){
        const a = (i/n)*Math.PI*2 + layer*0.4;
        const petal = new THREE.Mesh(new THREE.SphereGeometry(0.13-layer*0.012, 10, 8, 0,Math.PI), petalMat);
        petal.scale.set(1,1.4,0.4);
        petal.position.set(Math.cos(a)*r, layer*0.05, Math.sin(a)*r);
        petal.lookAt(0, layer*0.05+0.3, 0);
        petal.castShadow = true;
        g.add(petal);
      }
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.03,1.1,8), softMat(0x2f7a3f));
    stem.position.y = -0.65; stem.castShadow = true;
    g.add(stem);
    g.position.y = 0.6;
    return g;
  },
  sunflower(c){
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.2,20,20), glowMat(0x5a3a1a,0.3));
    g.add(core);
    const petalMat = softMat(c);
    for (let i=0;i<21;i++){
      const a = (i/21)*Math.PI*2;
      const p = new THREE.Mesh(new THREE.ConeGeometry(0.09,0.32,8), petalMat);
      p.position.set(Math.cos(a)*0.28, 0, Math.sin(a)*0.28);
      p.rotation.z = Math.PI/2; p.rotation.y = -a;
      p.castShadow = true;
      g.add(p);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.045,1.3,8), softMat(0x3a8a45));
    stem.position.y = -0.75;
    g.add(stem);
    g.position.y = 0.65;
    return g;
  },
  bonsai(c){
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.12,0.9,8), metalMat(0x5a4230,{metalness:0,roughness:0.9}));
    trunk.position.y = 0.1; trunk.castShadow = true;
    g.add(trunk);
    const foliageMat = softMat(c);
    for (let i=0;i<6;i++){
      const s = 0.32 + Math.random()*0.15;
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(s,1), foliageMat);
      f.position.set((Math.random()-0.5)*0.7, 0.55+Math.random()*0.35, (Math.random()-0.5)*0.6);
      f.castShadow = true;
      g.add(f);
    }
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.24,0.22,10), metalMat(0x8a3f2c,{metalness:0.2,roughness:0.6}));
    pot.position.y = -0.4;
    g.add(pot);
    g.position.y = 0.55;
    return g;
  },
  butterfly(c){
    const g = new THREE.Group();
    const wingMat = glassMat(c,{transmission:0.6, side:THREE.DoubleSide});
    [-1,1].forEach(side=>{
      const wingTop = new THREE.Mesh(new THREE.CircleGeometry(0.32,16,0,Math.PI), wingMat);
      wingTop.rotation.x = -Math.PI/2; wingTop.rotation.z = side>0?0:Math.PI;
      wingTop.position.set(side*0.05,0.08,0);
      wingTop.userData.flap = side;
      g.add(wingTop);
      const wingBottom = new THREE.Mesh(new THREE.CircleGeometry(0.2,16,0,Math.PI), wingMat);
      wingBottom.rotation.x = -Math.PI/2; wingBottom.rotation.z = side>0?0:Math.PI;
      wingBottom.position.set(side*0.05,-0.1,0);
      wingBottom.userData.flap = side;
      g.add(wingBottom);
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.025,0.3,4,8), glowMat(0x1a1a1a,0.2));
    body.rotation.z = Math.PI/2;
    g.add(body);
    g.userData.animType = 'flutter';
    g.position.y = 1.4;
    return g;
  },

  dragon(c){
    const g = new THREE.Group();
    const bodyMat = softMat(c,{clearcoat:0.6});
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22,0.9,6,12), bodyMat);
    body.rotation.z = Math.PI/2.2; body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.2,0.5,10), bodyMat);
    head.position.set(0.75,0.25,0); head.rotation.z = -Math.PI/2.4;
    head.castShadow = true; g.add(head);
    for (let i=0;i<2;i++){
      const wing = new THREE.Mesh(new THREE.CircleGeometry(0.5,3,0,Math.PI*1.3), glassMat(c,{transmission:0.5,side:THREE.DoubleSide}));
      wing.position.set(-0.1, 0.15, i===0?0.25:-0.25);
      wing.rotation.x = i===0? 0.6 : -0.6; wing.rotation.y = Math.PI/2;
      g.add(wing);
    }
    const spikes = new THREE.Group();
    for (let i=0;i<6;i++){
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05,0.16,6), glowMat(0xffd76a,0.6));
      sp.position.set(0.5-i*0.18, 0.28, 0);
      spikes.add(sp);
    }
    g.add(spikes);
    g.userData.animType = 'hover';
    g.position.y = 1.1;
    return g;
  },
  crystalball(c){
    const g = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.42,48,48), glassMat(c,{transmission:0.95, roughness:0.02}));
    ball.castShadow = true; g.add(ball);
    const swirl = makePointCloud(140, i=>{
      const t = i*0.15; const r = 0.15+0.1*Math.sin(t*0.5);
      return new THREE.Vector3(Math.cos(t)*r, Math.sin(t*1.3)*0.2, Math.sin(t)*r);
    }, 0xd8b8ff, 0.02);
    g.add(swirl);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.34,0.14,20), metalMat(0xffcf5c));
    base.position.y = -0.48; g.add(base);
    g.userData.animType = 'hover';
    g.position.y = 1.1;
    return g;
  },
  wand(c){
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.03,1.1,8), metalMat(0x4a2f1a,{metalness:0,roughness:0.7}));
    g.add(shaft);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.11,0), glassMat(c,{transmission:0.85}));
    gem.position.y = 0.62; g.add(gem);
    const sparkle = makePointCloud(40, ()=> new THREE.Vector3((Math.random()-0.5)*0.4, 0.62+(Math.random()-0.5)*0.4, (Math.random()-0.5)*0.4), 0xffe9a8, 0.02);
    g.add(sparkle);
    g.userData.animType = 'hover';
    g.position.y = 1.0;
    return g;
  },
  sword(c){
    const g = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09,1.1,0.02), metalMat(c,{roughness:0.15}));
    blade.position.y = 0.55; blade.castShadow = true; g.add(blade);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.34,0.06,0.06), metalMat(0xffcf5c));
    g.add(guard);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.28,10), metalMat(0x3a2a1a,{metalness:0.3,roughness:0.7}));
    grip.position.y = -0.17; g.add(grip);
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.06,10,10), metalMat(0xffcf5c));
    pommel.position.y = -0.33; g.add(pommel);
    g.userData.animType = 'hover';
    g.position.y = 1.0;
    return g;
  },

  earth(c){
    const g = new THREE.Group();
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.5,48,48), new THREE.MeshPhysicalMaterial({
      color:0x1c4f9c, roughness:0.6, clearcoat:0.6, clearcoatRoughness:0.4,
    }));
    // procedural "continents" via vertex color noise
    const geo = sphere.geometry; const posAttr = geo.attributes.position;
    const colors = [];
    for (let i=0;i<posAttr.count;i++){
      const v = new THREE.Vector3().fromBufferAttribute(posAttr,i).normalize();
      const n = Math.sin(v.x*5)+Math.sin(v.y*6)+Math.sin(v.z*4.5);
      const land = n>0.6;
      const col = land? new THREE.Color(0x3f8f4f) : new THREE.Color(0x1c4f9c);
      colors.push(col.r,col.g,col.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
    sphere.material.vertexColors = true;
    sphere.castShadow = true;
    g.add(sphere);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(0.53,32,32), new THREE.MeshBasicMaterial({ color:0x6fc5ff, transparent:true, opacity:0.18, side:THREE.BackSide }));
    g.add(atmo);
    g.userData.animType = 'spin';
    g.position.y = 1.1;
    return g;
  },
  saturn(c){
    const g = new THREE.Group();
    const planet = new THREE.Mesh(new THREE.SphereGeometry(0.38,40,40), softMat(c));
    planet.castShadow = true; g.add(planet);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55,0.95,64), new THREE.MeshStandardMaterial({ color:0xd8c9a0, side:THREE.DoubleSide, transparent:true, opacity:0.75, roughness:0.6 }));
    ring.rotation.x = Math.PI/2.3;
    g.add(ring);
    g.userData.animType = 'spin';
    g.position.y = 1.1;
    return g;
  },
  galaxy(c){
    const g = new THREE.Group();
    const arms = 4, perArm = 220;
    const cloud = makePointCloud(arms*perArm, i=>{
      const arm = i % arms; const t = (i/arms)/perArm;
      const angle = t*Math.PI*5 + arm*(Math.PI*2/arms);
      const r = t*0.9;
      const spread = (Math.random()-0.5)*0.12;
      return new THREE.Vector3(Math.cos(angle)*r+spread, (Math.random()-0.5)*0.05, Math.sin(angle)*r+spread);
    }, c, 0.025);
    g.add(cloud);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.12,20,20), glowMat(0xfff2c8,1.8));
    g.add(core);
    g.userData.animType = 'spin';
    g.position.y = 1.2;
    return g;
  },
  meteor(c){
    const g = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32,1), softMat(0x6b5a4a,{roughness:0.95}));
    const posAttr = rock.geometry.attributes.position;
    for (let i=0;i<posAttr.count;i++){
      const v = new THREE.Vector3().fromBufferAttribute(posAttr,i);
      v.multiplyScalar(1+Math.random()*0.18);
      posAttr.setXYZ(i,v.x,v.y,v.z);
    }
    rock.geometry.computeVertexNormals();
    rock.castShadow = true; g.add(rock);
    const trail = makePointCloud(80, i=> new THREE.Vector3(-0.4-i*0.01, (Math.random()-0.5)*0.15, (Math.random()-0.5)*0.15), c, 0.02);
    g.add(trail);
    g.userData.animType = 'tumble';
    g.position.y = 1.1;
    return g;
  },

  dna(c){
    const g = new THREE.Group();
    const mat1 = glowMat(c,0.7), mat2 = glowMat(0xa855f7,0.7);
    for (let i=0;i<24;i++){
      const t = i/24*Math.PI*4; const y = i*0.055-0.65;
      const p1 = new THREE.Vector3(Math.cos(t)*0.25, y, Math.sin(t)*0.25);
      const p2 = new THREE.Vector3(Math.cos(t+Math.PI)*0.25, y, Math.sin(t+Math.PI)*0.25);
      const s1 = new THREE.Mesh(new THREE.SphereGeometry(0.045,10,10), mat1); s1.position.copy(p1); g.add(s1);
      const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.045,10,10), mat2); s2.position.copy(p2); g.add(s2);
      if (i%2===0){
        const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,p1.distanceTo(p2),6), new THREE.MeshStandardMaterial({color:0xffffff, emissive:0x4fe3ff, emissiveIntensity:0.3}));
        rung.position.lerpVectors(p1,p2,0.5);
        rung.lookAt(p2); rung.rotateX(Math.PI/2);
        g.add(rung);
      }
    }
    g.userData.animType = 'spin';
    g.position.y = 1.1;
    return g;
  },
  atom(c){
    const g = new THREE.Group();
    const nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.14,20,20), glowMat(c,1.2));
    g.add(nucleus);
    for (let i=0;i<3;i++){
      const orbit = new THREE.Mesh(new THREE.TorusGeometry(0.42,0.008,8,64), glowMat(0x4fe3ff,0.6));
      orbit.rotation.x = i*1.05; orbit.rotation.y = i*0.7;
      const electron = new THREE.Mesh(new THREE.SphereGeometry(0.035,12,12), glowMat(0xffffff,1.5));
      electron.userData.orbitIndex = i;
      orbit.add(electron);
      electron.position.x = 0.42;
      g.add(orbit);
      g.userData['orbit'+i] = orbit;
    }
    g.userData.animType = 'atomSpin';
    g.position.y = 1.2;
    return g;
  },
  brain(c){
    const g = new THREE.Group();
    const brain = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36,3), softMat(c,{roughness:0.75, clearcoat:0.3}));
    const posAttr = brain.geometry.attributes.position;
    for (let i=0;i<posAttr.count;i++){
      const v = new THREE.Vector3().fromBufferAttribute(posAttr,i);
      const n = Math.sin(v.x*14)+Math.sin(v.y*14)+Math.sin(v.z*14);
      v.multiplyScalar(1+n*0.025);
      posAttr.setXYZ(i,v.x,v.y,v.z);
    }
    brain.geometry.computeVertexNormals();
    brain.scale.set(1,0.85,1.15);
    brain.castShadow = true;
    g.add(brain);
    g.userData.animType = 'hover';
    g.position.y = 1.1;
    return g;
  },
  heart(c){
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0,0.25);
    shape.bezierCurveTo(0,0.45,-0.3,0.55,-0.4,0.3);
    shape.bezierCurveTo(-0.5,0.05,-0.25,-0.15,0,-0.4);
    shape.bezierCurveTo(0.25,-0.15,0.5,0.05,0.4,0.3);
    shape.bezierCurveTo(0.3,0.55,0,0.45,0,0.25);
    const geo = new THREE.ExtrudeGeometry(shape, { depth:0.22, bevelEnabled:true, bevelSize:0.03, bevelThickness:0.03, bevelSegments:6, curveSegments:16 });
    geo.center();
    const heart = new THREE.Mesh(geo, softMat(c,{clearcoat:0.7}));
    heart.castShadow = true; g.add(heart);
    g.userData.animType = 'pulse';
    g.position.y = 1.1;
    return g;
  },

  fire(c){
    const g = new THREE.Group();
    const flame = makePointCloud(220, ()=> new THREE.Vector3((Math.random()-0.5)*0.28, Math.random()*0.7, (Math.random()-0.5)*0.28), c, 0.045);
    flame.material.blending = THREE.AdditiveBlending;
    g.add(flame);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.18,0.55,10), glowMat(0xffdd88,2));
    core.position.y = 0.25;
    g.add(core);
    g.userData.animType = 'fire';
    g.position.y = 0.9;
    return g;
  },
  plasma(c){
    const g = new THREE.Group();
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.34,32,32), glassMat(c,{transmission:0.8, emissive:c, emissiveIntensity:0.6}));
    g.add(orb);
    const arcs = makePointCloud(120, i=>{
      const t = i*0.3; const r = 0.34+Math.sin(t)*0.04;
      const th = t*2.4, ph = t*1.7;
      return new THREE.Vector3(Math.sin(ph)*Math.cos(th)*r, Math.cos(ph)*r, Math.sin(ph)*Math.sin(th)*r);
    }, 0xffffff, 0.02);
    g.add(arcs);
    g.userData.animType = 'plasma';
    g.position.y = 1.1;
    return g;
  },
  electricity(c){
    const g = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color:c, transparent:true, opacity:0.9 });
    for (let b=0;b<5;b++){
      const pts = [];
      let y = 0.55;
      for (let i=0;i<10;i++){ pts.push(new THREE.Vector3((Math.random()-0.5)*0.4, y, (Math.random()-0.5)*0.4)); y -= 0.12; }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const bolt = new THREE.Line(geo, mat);
      g.add(bolt);
    }
    g.userData.animType = 'electric';
    g.position.y = 0.9;
    return g;
  },
  ice(c){
    const g = new THREE.Group();
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.4,0), glassMat(c,{transmission:0.85,roughness:0.05}));
    shard.scale.set(0.7,1.3,0.7);
    shard.castShadow = true; g.add(shard);
    for (let i=0;i<4;i++){
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.09,0.35,6), glassMat(c,{transmission:0.7}));
      const a = i/4*Math.PI*2;
      s.position.set(Math.cos(a)*0.22, -0.1, Math.sin(a)*0.22);
      s.lookAt(0,-0.6,0);
      g.add(s);
    }
    g.userData.animType = 'hover';
    g.position.y = 1.1;
    return g;
  },

  diamond(c){
    const g = new THREE.Group();
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.38,0), glassMat(c,{transmission:0.95, roughness:0.01, ior:2.4}));
    gem.castShadow = true; g.add(gem);
    g.userData.animType = 'spin';
    g.position.y = 1.1;
    return g;
  },
  crown(c){
    const g = new THREE.Group();
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.36,0.4,0.22,20,1,true), metalMat(c));
    band.castShadow = true; g.add(band);
    for (let i=0;i<8;i++){
      const a = i/8*Math.PI*2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07,0.24,6), metalMat(c));
      spike.position.set(Math.cos(a)*0.38, 0.22, Math.sin(a)*0.38);
      g.add(spike);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.04,0), glassMat(0xff3860));
      gem.position.set(Math.cos(a)*0.38, 0.34, Math.sin(a)*0.38);
      g.add(gem);
    }
    g.userData.animType = 'hover';
    g.position.y = 1.2;
    return g;
  },
  car(c){
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1,0.22,0.5), metalMat(c,{roughness:0.15}));
    body.castShadow = true; g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.2,0.44), glassMat(0x0a1a2a,{transmission:0.6}));
    cabin.position.set(-0.05,0.2,0); g.add(cabin);
    [[0.4,0.25],[0.4,-0.25],[-0.4,0.25],[-0.4,-0.25]].forEach(([x,z])=>{
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.14,0.12,20), metalMat(0x111111,{metalness:0.6,roughness:0.5}));
      wheel.rotation.z = Math.PI/2; wheel.position.set(x,-0.15,z);
      g.add(wheel);
    });
    g.userData.animType = 'hover';
    g.position.y = 0.85;
    return g;
  },
  watch(c){
    const g = new THREE.Group();
    const case_ = new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.3,0.1,32), metalMat(c));
    case_.rotation.x = Math.PI/2; case_.castShadow = true; g.add(case_);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.25,32), new THREE.MeshPhysicalMaterial({ color:0x0c1420, clearcoat:1, clearcoatRoughness:0.05 }));
    face.position.z = 0.051; g.add(face);
    for (let i=0;i<2;i++){
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.55,0.05), softMat(0x1a1a1a,{roughness:0.8}));
      strap.position.set(0, i===0?0.5:-0.5, 0);
      g.add(strap);
    }
    g.userData.animType = 'hover';
    g.position.y = 1.1;
    return g;
  },
};

/* ---------------------------------------------------------------------- */
/* 6. SCENE OBJECT MANAGER                                                */
/* ---------------------------------------------------------------------- */
const activeObjects = []; // {id, uid, group, colorIdx, vel, grabbed, physicsY}
let uidCounter = 0;
const NEON_PALETTE = [0x4fe3ff, 0xa855f7, 0xff5470, 0x4dffa8, 0xffb454, 0xffffff];

function spawnObject(libId, worldPos=null){
  const def = LIBRARY.find(o=>o.id===libId);
  if (!def) return;
  const builder = Factory[def.build];
  const group = builder(def.color);
  group.traverse(o=>{ if(o.isMesh){ o.castShadow=true; } });
  const pos = worldPos || new THREE.Vector3((Math.random()-0.5)*2.4, group.position.y, (Math.random()-0.5)*1.2);
  const baseY = pos.y;
  group.position.set(pos.x, pos.y, pos.z);
  const targetScale = group.scale.x || 1;
  group.scale.setScalar(0.001);
  scene.add(group);
  const rec = { id: def.id, uid: ++uidCounter, def, group, colorIdx:-1, vel:new THREE.Vector3(), grabbed:false, baseY, spinSeed:Math.random()*10 };
  activeObjects.push(rec);
  state.focusedObjectId = rec.uid;
  gsap.to(group.scale, { x:1, y:1, z:1, duration:0.7, ease:'elastic.out(1,0.6)' });
  spawnPoofParticles(pos);
  playTone(660, 0.08);
  pushHistory(`Spawned ${def.name}`);
  toast(`${def.icon} ${def.name.toUpperCase()} SPAWNED`);
  updateHudObject();
  return rec;
}

function removeObject(rec){
  if (!rec) return;
  gsap.to(rec.group.scale, { x:0.001,y:0.001,z:0.001, duration:0.35, ease:'back.in(2)', onComplete:()=>{
    scene.remove(rec.group);
    const idx = activeObjects.indexOf(rec);
    if (idx>-1) activeObjects.splice(idx,1);
    if (state.focusedObjectId === rec.uid){
      state.focusedObjectId = activeObjects.length ? activeObjects[activeObjects.length-1].uid : null;
    }
    updateHudObject();
  }});
  spawnPoofParticles(rec.group.position, 0x99a8c0);
  playTone(220,0.1);
  pushHistory(`Removed ${rec.def.name}`);
  toast(`✊ ${rec.def.name.toUpperCase()} REMOVED`);
}

function getFocused(){
  return activeObjects.find(o=>o.uid===state.focusedObjectId) || activeObjects[activeObjects.length-1];
}

function resetScene(){
  [...activeObjects].forEach(removeObject);
  toast('👏 SCENE RESET');
  playTone(880,0.15);
  pushHistory('Scene reset');
}

function pushHistory(msg){
  state.history.unshift({ t: new Date().toLocaleTimeString(), msg });
  state.history = state.history.slice(0,40);
}

/* ---- transient particle fx (poof / explosion / trail) ---- */
const fxGroup = new THREE.Group(); scene.add(fxGroup);
function spawnPoofParticles(pos, color=0x4fe3ff, count=26, speed=1.4){
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(count*3);
  const vel = [];
  for (let i=0;i<count;i++){
    p[i*3]=pos.x; p[i*3+1]=pos.y; p[i*3+2]=pos.z;
    vel.push(new THREE.Vector3((Math.random()-0.5), (Math.random()-0.2), (Math.random()-0.5)).normalize().multiplyScalar(speed*(0.5+Math.random())));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p,3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size:0.05, transparent:true, opacity:1, blending:THREE.AdditiveBlending, depthWrite:false }));
  pts.userData = { vel, life:1 };
  fxGroup.add(pts);
}

function explosionBurst(pos){
  spawnPoofParticles(pos, 0xffffff, 90, 3.2);
  spawnPoofParticles(pos, 0x4fe3ff, 70, 2.4);
  spawnPoofParticles(pos, 0xa855f7, 70, 2.0);
  // shockwave ring
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.05,0.15,48), new THREE.MeshBasicMaterial({ color:0x9ecfff, transparent:true, opacity:0.9, side:THREE.DoubleSide }));
  ring.position.copy(pos); ring.rotation.x = -Math.PI/2;
  scene.add(ring);
  gsap.to(ring.scale, { x:14, y:14, z:14, duration:0.9, ease:'power2.out' });
  gsap.to(ring.material, { opacity:0, duration:0.9, ease:'power2.out', onComplete:()=>scene.remove(ring) });
  playTone(140,0.25); playTone(90,0.35);
  toast('🖐️ EXPLOSION!');
  pushHistory('Explosion triggered');
}

function updateFx(dt){
  fxGroup.children.slice().forEach(pts=>{
    const posAttr = pts.geometry.attributes.position;
    for (let i=0;i<pts.userData.vel.length;i++){
      posAttr.array[i*3]   += pts.userData.vel[i].x*dt;
      posAttr.array[i*3+1] += pts.userData.vel[i].y*dt - dt*0.6;
      posAttr.array[i*3+2] += pts.userData.vel[i].z*dt;
    }
    posAttr.needsUpdate = true;
    pts.userData.life -= dt*0.8;
    pts.material.opacity = Math.max(0,pts.userData.life);
    if (pts.userData.life<=0){ fxGroup.remove(pts); pts.geometry.dispose(); pts.material.dispose(); }
  });
}

/* ---- idle per-object animation ---- */
function updateObjectAnimations(t, dt){
  activeObjects.forEach(rec=>{
    const g = rec.group;
    const type = g.userData.animType;
    if (!rec.grabbed){
      g.position.y = rec.baseY + Math.sin(t*1.2 + rec.spinSeed)*0.06;
    }
    if (type==='spin') g.rotation.y += dt*0.35;
    else if (type==='hover') g.rotation.y += dt*0.2;
    else if (type==='tumble'){ g.rotation.x += dt*0.6; g.rotation.y += dt*0.4; }
    else if (type==='pulse'){ const s=1+Math.sin(t*3)*0.06; g.scale.setScalar(s*(g.userData.userScale||1)); }
    else if (type==='fire'){ g.rotation.y += dt*0.5; g.children[0].geometry.attributes.position.needsUpdate = true; }
    else if (type==='electric'){ g.rotation.y += dt*1.2; if (Math.random()<0.05) g.children.forEach(l=>l.visible=Math.random()>0.2); }
    else if (type==='atomSpin'){ ['orbit0','orbit1','orbit2'].forEach((k,i)=>{ if(g.userData[k]) g.userData[k].rotation.z += dt*(0.6+i*0.3); }); }
    else if (type==='flutter'){ g.children.forEach(w=>{ if(w.userData.flap){ w.rotation.y = Math.sin(t*10)*0.5*w.userData.flap; }}); g.position.x += Math.sin(t*0.6)*0.002; }
    else g.rotation.y += dt*0.15;
  });
}

/* ---------------------------------------------------------------------- */
/* 7. AMBIENT BACKGROUND CANVAS PARTICLES (2D, behind UI)                 */
/* ---------------------------------------------------------------------- */
const bgCanvas = document.getElementById('bg-particles');
const bgCtx = bgCanvas.getContext('2d');
let bgParticles = [];
function resizeBg(){ bgCanvas.width = innerWidth; bgCanvas.height = innerHeight; }
resizeBg(); addEventListener('resize', resizeBg);
function seedBgParticles(){
  const n = Math.floor(70*state.particleDensity);
  bgParticles = Array.from({length:n}, ()=>({
    x: Math.random()*innerWidth, y: Math.random()*innerHeight,
    r: 0.6+Math.random()*1.8, vy: 0.15+Math.random()*0.35, vx:(Math.random()-0.5)*0.15,
    hue: Math.random()>0.5? '79,227,255' : '168,85,247', a: 0.2+Math.random()*0.5,
  }));
}
seedBgParticles();
function drawBgParticles(){
  bgCtx.clearRect(0,0,innerWidth,innerHeight);
  bgParticles.forEach(p=>{
    p.y -= p.vy; p.x += p.vx;
    if (p.y < -10) p.y = innerHeight+10;
    if (p.x < -10) p.x = innerWidth+10; if (p.x > innerWidth+10) p.x = -10;
    bgCtx.beginPath();
    bgCtx.fillStyle = `rgba(${p.hue},${p.a})`;
    bgCtx.arc(p.x,p.y,p.r,0,Math.PI*2);
    bgCtx.fill();
  });
}

/* ---------------------------------------------------------------------- */
/* 8. AUDIO (synthesized SFX — no external audio files needed)            */
/* ---------------------------------------------------------------------- */
let actx;
function playTone(freq=440, dur=0.12, type='sine'){
  if (!state.sfxOn) return;
  try{
    actx = actx || new (window.AudioContext||window.webkitAudioContext)();
    const osc = actx.createOscillator(); const gain = actx.createGain();
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, actx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, actx.currentTime+0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime+dur);
    osc.connect(gain); gain.connect(actx.destination);
    osc.start(); osc.stop(actx.currentTime+dur+0.02);
  }catch(e){ /* audio not available */ }
}

/* ---------------------------------------------------------------------- */
/* 9. UI HELPERS (toast, panels, hud)                                     */
/* ---------------------------------------------------------------------- */
function toast(msg){
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.getElementById('toast-stack').appendChild(el);
  setTimeout(()=>el.remove(), 2600);
}
function openPanel(id){ document.getElementById(id).classList.add('open'); }
function closePanel(id){ document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click', ()=>closePanel(b.dataset.close)));

function updateHudObject(){
  const f = getFocused();
  document.getElementById('live-obj-icon').textContent = f? f.def.icon : '—';
  document.getElementById('live-obj-label').textContent = f? f.def.name.toUpperCase() : 'NONE';
  document.getElementById('live-obj-count').textContent = activeObjects.length;
}

/* build gallery grid */
const galleryGrid = document.getElementById('obj-grid');
const catsWrap = document.getElementById('gallery-cats');
const CATS = ['All', ...new Set(LIBRARY.map(o=>o.cat))];
let activeCat = 'All', searchQ = '';
CATS.forEach(cat=>{
  const chip = document.createElement('button');
  chip.className = 'cat-chip' + (cat==='All'?' active':'');
  chip.textContent = cat; chip.dataset.cat = cat;
  chip.addEventListener('click', ()=>{ activeCat = cat; document.querySelectorAll('.cat-chip').forEach(c=>c.classList.toggle('active', c===chip)); renderGallery(); });
  catsWrap.appendChild(chip);
});
document.getElementById('gallery-search').addEventListener('input', e=>{ searchQ = e.target.value.toLowerCase(); renderGallery(); });

function renderGallery(){
  galleryGrid.innerHTML = '';
  LIBRARY.filter(o=> (activeCat==='All'||o.cat===activeCat) && o.name.toLowerCase().includes(searchQ))
    .forEach(o=>{
      const card = document.createElement('div');
      card.className = 'obj-card' + (o.id===state.selectedLibId?' selected':'');
      card.innerHTML = `<button class="fav-btn ${state.favorites.has(o.id)?'active':''}" data-fav="${o.id}">★</button>
        <div class="obj-icon">${o.icon}</div><div class="obj-name">${o.name}</div><div class="obj-cat">${o.cat.toUpperCase()}</div>`;
      card.addEventListener('click', (e)=>{
        if (e.target.dataset.fav) return;
        state.selectedLibId = o.id;
        renderGallery();
        toast(`SELECTED: ${o.name.toUpperCase()} — SHOW OPEN PALM TO SPAWN`);
      });
      card.querySelector('.fav-btn').addEventListener('click', ()=>{
        state.favorites.has(o.id) ? state.favorites.delete(o.id) : state.favorites.add(o.id);
        localStorage.setItem('aether_favs', JSON.stringify([...state.favorites]));
        renderGallery();
      });
      galleryGrid.appendChild(card);
    });
}
renderGallery();

/* gesture lexicon modal */
const gestureGrid = document.getElementById('gesture-grid');
GESTURES.forEach(g=>{
  const c = document.createElement('div'); c.className = 'g-card';
  c.innerHTML = `<div class="g-emoji">${g.icon}</div><div class="g-name">${g.name}</div><div class="g-desc">${g.desc}</div>`;
  gestureGrid.appendChild(c);
});

/* ---------------------------------------------------------------------- */
/* 10. HAND TRACKING (MediaPipe Hands)                                    */
/* ---------------------------------------------------------------------- */
const videoEl = document.getElementById('video-feed');
const landmarkCanvas = document.getElementById('landmark-canvas');
const lmCtx = landmarkCanvas.getContext('2d');
function resizeLmCanvas(){ landmarkCanvas.width = innerWidth; landmarkCanvas.height = innerHeight; }
resizeLmCanvas(); addEventListener('resize', resizeLmCanvas);

let hands, mpCamera;
let lastHandResults = null;
const handTracks = { Left: null, Right: null }; // smoothed per-hand state

function initMediaPipe(){
  hands = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}` });
  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });
  hands.onResults(onHandResults);
}

async function startCamera(){
  const btn1 = document.getElementById('btn-start-camera');
  try{
    const res = parseInt(document.getElementById('set-camres').value);
    const stream = await navigator.mediaDevices.getUserMedia({ video:{ width:res, height: Math.round(res*9/16) }, audio:false });
    videoEl.srcObject = stream;
    await videoEl.play();
    videoEl.classList.add('live'); landmarkCanvas.classList.add('live');
    if (!hands) initMediaPipe();
    mpCamera = new Camera(videoEl, {
      onFrame: async () => { await hands.send({ image: videoEl }); },
      width: res, height: Math.round(res*9/16),
    });
    mpCamera.start();
    state.cameraOn = true;
    setCamStatus(true);
    document.getElementById('hero').classList.add('hidden');
    document.getElementById('live-hud').classList.remove('hidden');
    toast('📷 CAMERA ONLINE — AI TRACKING ACTIVE');
  }catch(err){
    console.error(err);
    toast('⚠ CAMERA ACCESS DENIED OR UNAVAILABLE');
    setCamStatus(false, true);
  }
}
function stopCamera(){
  if (videoEl.srcObject){ videoEl.srcObject.getTracks().forEach(t=>t.stop()); }
  videoEl.classList.remove('live'); landmarkCanvas.classList.remove('live');
  state.cameraOn = false; setCamStatus(false);
  document.getElementById('live-hud').classList.add('hidden');
  lmCtx.clearRect(0,0,landmarkCanvas.width, landmarkCanvas.height);
  setHandStatus(0);
}
function setCamStatus(on, warn=false){
  document.getElementById('dot-cam').className = 'dot' + (on?' on':warn?' warn':'');
  document.getElementById('cam-state').textContent = on?'LIVE':'OFFLINE';
}
function setHandStatus(n){
  state.handsDetected = n;
  document.getElementById('dot-hand').className = 'dot' + (n>0?' on':'');
  document.getElementById('hand-state').textContent = n;
}

/* ---- landmark utility math ---- */
const V = (a,b)=>({x:a.x-b.x,y:a.y-b.y,z:(a.z||0)-(b.z||0)});
const len = v=>Math.hypot(v.x,v.y,v.z||0);
const dist = (a,b)=>len(V(a,b));

function fingerExtended(lm, tip, pip, mcp, wrist){
  const dTip = dist(lm[tip], lm[wrist]);
  const dPip = dist(lm[pip], lm[wrist]);
  return dTip > dPip*1.12;
}
function thumbExtended(lm){
  // thumb tip far from pinky-mcp relative to thumb ip
  const dTip = dist(lm[4], lm[17]);
  const dIp  = dist(lm[3], lm[17]);
  return dTip > dIp*1.05;
}
function classifyHand(lm, handedness){
  const wrist=0;
  const ext = {
    thumb: thumbExtended(lm),
    index: fingerExtended(lm,8,6,5,wrist),
    middle: fingerExtended(lm,12,10,9,wrist),
    ring: fingerExtended(lm,16,14,13,wrist),
    pinky: fingerExtended(lm,20,18,17,wrist),
  };
  const extCount = Object.values(ext).filter(Boolean).length;
  const pinchDist = dist(lm[4], lm[8]);
  const handSpan = dist(lm[0], lm[9]); // wrist->middle mcp, scale reference
  const pinchNorm = pinchDist / (handSpan||0.001);

  let gesture = 'none';
  if (pinchNorm < 0.45 && !ext.middle && !ext.ring){
    gesture = 'pinch';
  } else if (pinchNorm < 0.5 && ext.middle && ext.ring && ext.pinky){
    gesture = 'ok';
  } else if (extCount>=4 && ext.index && ext.middle && ext.ring && ext.pinky){
    gesture = 'open_palm';
  } else if (extCount===0){
    gesture = 'fist';
  } else if (ext.thumb && !ext.index && !ext.middle && !ext.ring && !ext.pinky){
    gesture = lm[4].y < lm[0].y - 0.05 ? 'thumb_up' : (lm[4].y > lm[0].y + 0.03 ? 'thumb_down' : 'none');
  } else if (ext.index && ext.middle && !ext.ring && !ext.pinky){
    gesture = 'two_finger';
  } else if (ext.index && ext.middle && ext.ring && !ext.pinky){
    gesture = 'three_finger';
  }

  return {
    gesture, ext, extCount,
    palm: lm[9], wrist: lm[0],
    pinchPoint: { x:(lm[4].x+lm[8].x)/2, y:(lm[4].y+lm[8].y)/2, z:(lm[4].z+lm[8].z)/2 },
    handSpan,
  };
}

/* ---- gesture debounce/state machine per hand ---- */
function makeHandTrack(){
  return {
    gesture:'none', gestureFrames:0, lastFiredGesture:null,
    palmSmoothed:null, prevPalm:null, velocity:0,
    rotBaseX:null, lastActionTime:0,
  };
}
handTracks.Left = makeHandTrack(); handTracks.Right = makeHandTrack();

const DISCRETE = new Set(['open_palm','fist','three_finger','ok']);
const HOLD_FRAMES = 4; // frames a gesture must be stable before firing discretely
const COOLDOWN_MS = 550;

function projectToWorld(nx, ny, depthHint=0){
  // nx, ny in [0,1] mediapipe image space (already mirrored via canvas transform, use raw)
  const x = (nx - 0.5) * 5.6;
  const y = (0.5 - ny) * 3.2 + 1.0;
  const z = depthHint;
  return new THREE.Vector3(x,y,z);
}

function onHandResults(results){
  lastHandResults = results;
  const n = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;
  setHandStatus(n);

  lmCtx.clearRect(0,0,landmarkCanvas.width, landmarkCanvas.height);

  const seenHands = { Left:false, Right:false };

  if (n>0){
    results.multiHandLandmarks.forEach((lm, i)=>{
      const handedness = results.multiHandedness[i].label; // 'Left' | 'Right'
      seenHands[handedness] = true;
      const track = handTracks[handedness];
      const info = classifyHand(lm, handedness);

      if (state.showSkeleton && window.drawConnectors){
        lmCtx.save();
        lmCtx.scale(landmarkCanvas.width, landmarkCanvas.height);
        drawConnectors(lmCtx, lm, HAND_CONNECTIONS, { color: handedness==='Left'?'#4fe3ff':'#a855f7', lineWidth: 0.006 });
        drawLandmarks(lmCtx, lm, { color:'#ffffff', lineWidth:0.002, radius:0.008 });
        lmCtx.restore();
      }

      // smoothing
      const smoothF = 1 - state.sensitivity*0.5; // higher sensitivity => less smoothing lag
      if (!track.palmSmoothed) track.palmSmoothed = {...info.palm};
      track.palmSmoothed.x += (info.palm.x - track.palmSmoothed.x)*(1-smoothF);
      track.palmSmoothed.y += (info.palm.y - track.palmSmoothed.y)*(1-smoothF);

      // gesture stability counting
      if (info.gesture === track.gesture) track.gestureFrames++;
      else { track.gesture = info.gesture; track.gestureFrames = 1; }

      applyGestureAction(handedness, track, info, lm);

      if (handedness === 'Right' || (handedness==='Left' && n===1)){
        updateLiveHud(info.gesture, Math.min(1, track.gestureFrames/HOLD_FRAMES));
      }
    });
  } else {
    updateLiveHud('none', 0);
  }

  // two-hand combo gestures
  if (n===2){
    handleTwoHandGestures(results);
  } else {
    twoHandState.active = false;
  }

  if (!seenHands.Left) handTracks.Left = makeHandTrack();
  if (!seenHands.Right) handTracks.Right = makeHandTrack();
}

function updateLiveHud(gesture, conf){
  const meta = GESTURES.find(g=>g.id===gesture);
  document.getElementById('live-g-icon').textContent = meta? meta.icon : '—';
  document.getElementById('live-g-label').textContent = meta? meta.name : 'NONE';
  document.getElementById('live-g-conf').style.width = (conf*100)+'%';
}

function applyGestureAction(handedness, track, info, lm){
  const now = performance.now();
  const stable = track.gestureFrames >= HOLD_FRAMES;

  // continuous actions (every frame while held)
  if (info.gesture === 'pinch'){
    const focused = getFocused();
    if (focused){
      focused.grabbed = true;
      const world = projectToWorld(info.pinchPoint.x, info.pinchPoint.y, focused.group.position.z);
      focused.group.position.x += (world.x - focused.group.position.x)*0.35;
      focused.group.position.y += (world.y - focused.group.position.y)*0.35;
      focused.baseY = focused.group.position.y;
    }
  } else {
    const focused = getFocused();
    if (focused && focused.grabbed) focused.grabbed = false;
  }

  if (info.gesture === 'two_finger'){
    const focused = getFocused();
    if (focused){
      if (track.rotBaseX===null) track.rotBaseX = info.palm.x;
      const delta = info.palm.x - track.rotBaseX;
      focused.group.rotation.y += delta * 6.0;
      track.rotBaseX = info.palm.x;
    }
  } else {
    track.rotBaseX = null;
  }

  if (info.gesture === 'thumb_up' && stable){
    const focused = getFocused();
    if (focused && now-track.lastActionTime>90){
      const s = focused.group.scale.x;
      const ns = Math.min(3.2, s*1.035);
      focused.group.scale.setScalar(ns);
      track.lastActionTime = now;
    }
  }
  if (info.gesture === 'thumb_down' && stable){
    const focused = getFocused();
    if (focused && now-track.lastActionTime>90){
      const s = focused.group.scale.x;
      const ns = Math.max(0.15, s*0.965);
      focused.group.scale.setScalar(ns);
      track.lastActionTime = now;
    }
  }

  // fast open-hand swipe -> explosion (velocity based)
  if (info.gesture === 'open_palm'){
    if (track.prevPalm){
      const vx = (info.palm.x - track.prevPalm.x);
      const vy = (info.palm.y - track.prevPalm.y);
      track.velocity = Math.hypot(vx,vy);
    }
  }
  track.prevPalm = { x:info.palm.x, y:info.palm.y };

  // discrete, debounced, edge-triggered actions
  if (!DISCRETE.has(info.gesture)) { if(info.gesture!=='open_palm') track.lastFiredGesture = null; }
  if (stable && info.gesture !== track.lastFiredGesture && now - track.lastActionTime > COOLDOWN_MS){
    if (info.gesture === 'open_palm'){
      if (track.velocity > 0.045 * (1.6-state.sensitivity)){
        const focused = getFocused();
        explosionBurst(focused ? focused.group.position.clone() : projectToWorld(info.palm.x, info.palm.y));
      } else {
        const pos = projectToWorld(info.palm.x, info.palm.y, (Math.random()-0.5)*0.6);
        spawnObject(state.selectedLibId, pos);
      }
      track.lastFiredGesture = info.gesture; track.lastActionTime = now;
    } else if (info.gesture === 'fist'){
      removeObject(getFocused());
      track.lastFiredGesture = info.gesture; track.lastActionTime = now;
    } else if (info.gesture === 'three_finger'){
      openPanel('panel-gallery');
      toast('🤟 GALLERY OPENED');
      track.lastFiredGesture = info.gesture; track.lastActionTime = now;
    } else if (info.gesture === 'ok'){
      const focused = getFocused();
      if (focused){
        focused.colorIdx = (focused.colorIdx+1) % NEON_PALETTE.length;
        const col = NEON_PALETTE[focused.colorIdx];
        focused.group.traverse(o=>{
          if (o.isMesh && o.material && 'color' in o.material){
            o.material.color.set(col);
            if ('emissive' in o.material) o.material.emissive.set(col);
          }
        });
        toast('👌 COLOR CHANGED');
        playTone(520,0.08);
      }
      track.lastFiredGesture = info.gesture; track.lastActionTime = now;
    }
  }
}

/* two-hand: scale + clap */
const twoHandState = { active:false, prevDist:null, clapCooldown:0 };
function handleTwoHandGestures(results){
  const lmA = results.multiHandLandmarks[0], lmB = results.multiHandLandmarks[1];
  const wristA = lmA[9], wristB = lmB[9];
  const d = dist(wristA, wristB);

  const now = performance.now();
  if (twoHandState.prevDist !== null){
    const closingSpeed = twoHandState.prevDist - d;
    if (d < 0.09 && closingSpeed > 0.02 && now - twoHandState.clapCooldown > 900){
      resetScene();
      twoHandState.clapCooldown = now;
    } else if (d > 0.14) {
      const focused = getFocused();
      if (focused){
        const delta = (d - twoHandState.prevDist) * 3.4;
        const ns = THREE.MathUtils.clamp(focused.group.scale.x + delta, 0.15, 3.2);
        focused.group.scale.setScalar(ns);
      }
    }
  }
  twoHandState.prevDist = d;
  twoHandState.active = true;
}

/* ---------------------------------------------------------------------- */
/* 11. PHYSICS (simple gravity/bounce for non-grabbed, non-hovering objs) */
/* ---------------------------------------------------------------------- */
function updatePhysics(dt){
  if (!state.physicsOn) return;
  activeObjects.forEach(rec=>{
    if (rec.grabbed) return;
    // gentle drift toward baseY handled in updateObjectAnimations; here we just
    // keep objects within stage bounds (soft collision with invisible walls)
    const p = rec.group.position;
    const bound = 3.0;
    if (Math.abs(p.x) > bound) p.x = THREE.MathUtils.clamp(p.x, -bound, bound);
    if (p.y < 0.15) p.y = 0.15;
  });
}

/* ---------------------------------------------------------------------- */
/* 12. VOICE COMMANDS (Web Speech API, optional bonus feature)            */
/* ---------------------------------------------------------------------- */
let recognition, voiceOn = false;
function initVoice(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR){ toast('⚠ VOICE COMMANDS NOT SUPPORTED IN THIS BROWSER'); return; }
  recognition = new SR();
  recognition.continuous = true; recognition.interimResults = false; recognition.lang = 'en-US';
  recognition.onresult = (e)=>{
    const text = e.results[e.results.length-1][0].transcript.toLowerCase();
    handleVoiceCommand(text);
  };
  recognition.onerror = ()=>{};
  recognition.onend = ()=>{ if (voiceOn) recognition.start(); };
}
function handleVoiceCommand(text){
  if (text.includes('reset')){ resetScene(); return; }
  if (text.includes('remove') || text.includes('delete')){ removeObject(getFocused()); return; }
  if (text.includes('screenshot') || text.includes('capture')){ takeScreenshot(); return; }
  const found = LIBRARY.find(o=> text.includes(o.name.toLowerCase()) || text.includes(o.id));
  if (found){
    state.selectedLibId = found.id;
    spawnObject(found.id);
    toast(`🎙️ VOICE: SPAWNING ${found.name.toUpperCase()}`);
  }
}
document.getElementById('btn-voice').addEventListener('click', ()=>{
  if (!recognition) initVoice();
  if (!recognition) return;
  voiceOn = !voiceOn;
  document.getElementById('btn-voice').classList.toggle('active', voiceOn);
  if (voiceOn){ recognition.start(); toast('🎙️ VOICE COMMANDS ACTIVE — TRY "SPAWN DRAGON"'); }
  else { recognition.stop(); toast('🎙️ VOICE COMMANDS OFF'); }
});

/* ---------------------------------------------------------------------- */
/* 13. SCREENSHOT + CUSTOM MODEL UPLOAD                                   */
/* ---------------------------------------------------------------------- */
function takeScreenshot(){
  renderer.render(scene, camera); // ensure fresh frame (composer used for real render loop)
  const url = renderer.domElement.toDataURL('image/png');
  const flash = document.getElementById('flash');
  gsap.fromTo(flash, { opacity:0.9 }, { opacity:0, duration:0.4 });
  const strip = document.getElementById('shot-strip');
  const img = document.createElement('img');
  img.src = url; img.className = 'shot-thumb';
  strip.prepend(img);
  if (strip.children.length>5) strip.removeChild(strip.lastChild);
  const a = document.createElement('a');
  a.href = url; a.download = `aether-capture-${Date.now()}.png`; a.click();
  playTone(1200,0.06);
  toast('📸 SCREENSHOT SAVED');
}

const gltfLoader = new GLTFLoader();
document.getElementById('upload-glb').addEventListener('change', (e)=>{
  const file = e.target.files[0]; if (!file) return;
  const url = URL.createObjectURL(file);
  gltfLoader.load(url, (gltf)=>{
    const group = gltf.scene;
    group.traverse(o=>{ if (o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3()).length();
    const scaleF = size>0 ? 1.4/size : 1;
    group.scale.setScalar(scaleF*0.001);
    group.position.set((Math.random()-0.5)*2, 1.1, 0);
    scene.add(group);
    const rec = { id:'custom', uid:++uidCounter, def:{name:file.name, icon:'📦'}, group, colorIdx:-1, vel:new THREE.Vector3(), grabbed:false, baseY:1.1, spinSeed:Math.random()*10 };
    activeObjects.push(rec);
    state.focusedObjectId = rec.uid;
    gsap.to(group.scale, { x:scaleF, y:scaleF, z:scaleF, duration:0.8, ease:'elastic.out(1,0.6)' });
    toast(`📦 CUSTOM MODEL LOADED: ${file.name}`);
    updateHudObject();
  }, undefined, (err)=>{ console.error(err); toast('⚠ COULD NOT LOAD MODEL'); });
});

/* ---------------------------------------------------------------------- */
/* 14. UI WIRING                                                          */
/* ---------------------------------------------------------------------- */
document.getElementById('btn-start-camera').addEventListener('click', startCamera);
document.getElementById('btn-toggle-camera').addEventListener('click', ()=>{
  state.cameraOn ? stopCamera() : startCamera();
});
document.getElementById('btn-gallery').addEventListener('click', ()=>openPanel('panel-gallery'));
document.getElementById('btn-open-gallery-hero').addEventListener('click', ()=>openPanel('panel-gallery'));
document.getElementById('btn-settings').addEventListener('click', ()=>openPanel('panel-settings'));
document.getElementById('btn-shot').addEventListener('click', takeScreenshot);
document.getElementById('btn-gestures').addEventListener('click', ()=>document.getElementById('gesture-modal').classList.add('open'));
document.getElementById('close-gesture-modal').addEventListener('click', ()=>document.getElementById('gesture-modal').classList.remove('open'));
document.getElementById('btn-fullscreen').addEventListener('click', ()=>{
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{});
  else document.exitFullscreen();
});
document.getElementById('btn-reset-all').addEventListener('click', resetScene);

/* settings bindings */
const bind = (id, cb) => document.getElementById(id).addEventListener('input', cb);
bind('set-bloom', e=>{ state.bloomStrength = parseFloat(e.target.value); bloomPass.strength = state.bloomStrength; document.getElementById('val-bloom').textContent = state.bloomStrength.toFixed(1); });
bind('set-particles', e=>{ state.particleDensity = parseFloat(e.target.value); document.getElementById('val-particles').textContent = state.particleDensity.toFixed(1); seedBgParticles(); });
bind('set-sens', e=>{ state.sensitivity = parseFloat(e.target.value); document.getElementById('val-sens').textContent = state.sensitivity.toFixed(2); });
document.getElementById('set-shadow').addEventListener('change', e=>{
  const map = { low:512, medium:1024, high:2048 };
  keyLight.shadow.mapSize.set(map[e.target.value], map[e.target.value]);
  keyLight.shadow.map = null; // force regen
});
document.getElementById('set-quality').addEventListener('change', e=>{
  state.quality = e.target.value;
  const dpr = { low:1, medium:Math.min(devicePixelRatio,1.5), high:Math.min(devicePixelRatio,2) }[e.target.value];
  renderer.setPixelRatio(dpr);
});
document.getElementById('set-camres').addEventListener('change', ()=>{ if (state.cameraOn){ stopCamera(); startCamera(); }});
document.getElementById('set-bg').addEventListener('change', e=>{
  const modes = {
    void:  ()=>{ scene.fog.density=0.055; floorGrid.material.opacity=0.1; stars.visible=false; },
    nebula:()=>{ scene.fog.density=0.04; floorGrid.material.opacity=0.25; stars.visible=true; },
    grid:  ()=>{ scene.fog.density=0.02; floorGrid.material.opacity=0.55; stars.visible=false; },
    aurora:()=>{ scene.fog.density=0.03; floorGrid.material.opacity=0.2; stars.visible=true; },
  };
  modes[e.target.value]();
});
document.getElementById('set-mirror').addEventListener('change', e=>{
  state.mirror = e.target.checked;
  videoEl.style.transform = state.mirror? 'scaleX(-1)':'scaleX(1)';
  landmarkCanvas.style.transform = state.mirror? 'scaleX(-1)':'scaleX(1)';
});
document.getElementById('set-skeleton').addEventListener('change', e=> state.showSkeleton = e.target.checked);
document.getElementById('set-sfx').addEventListener('change', e=> state.sfxOn = e.target.checked);
document.getElementById('set-physics').addEventListener('change', e=> state.physicsOn = e.target.checked);
document.querySelectorAll('.color-dot').forEach(dot=>{
  dot.addEventListener('click', ()=>{
    document.querySelectorAll('.color-dot').forEach(d=>d.classList.remove('active'));
    dot.classList.add('active');
    state.theme = dot.dataset.theme;
    const c = THEME_COLORS[state.theme];
    keyLight.color.set(c.a); rimLight.color.set(c.b); fillLight.color.set(c.a);
    document.documentElement.style.setProperty('--cyan', '#'+c.a.toString(16).padStart(6,'0'));
    document.documentElement.style.setProperty('--violet', '#'+c.b.toString(16).padStart(6,'0'));
  });
});

/* ---------------------------------------------------------------------- */
/* 15. MAIN LOOP                                                          */
/* ---------------------------------------------------------------------- */
let lastT = performance.now(), frameCount = 0, fpsAccum = 0;
const clock = new THREE.Clock();

function loop(){
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  drawBgParticles();
  updateObjectAnimations(t, dt);
  updateFx(dt);
  updatePhysics(dt);

  floor.material.opacity = 1; // keep reflector crisp

  composer.render();

  // fps
  frameCount++;
  const now = performance.now();
  if (now - lastT >= 500){
    state.fps = Math.round((frameCount*1000)/(now-lastT));
    document.getElementById('fps-state').textContent = state.fps;
    frameCount = 0; lastT = now;
  }
}
loop();

/* seed one hero object so the scene never looks empty before camera starts */
spawnObject('crystalball', new THREE.Vector3(0, 1.1, -0.3));
spawnObject('dna', new THREE.Vector3(-1.8, 1.1, -1.2));
spawnObject('diamond', new THREE.Vector3(1.9, 1.1, -1));

toast('⚡ AETHER SYSTEM ONLINE');

/* PWA: register service worker for basic offline app-shell support */
if ('serviceWorker' in navigator){
  addEventListener('load', ()=>{ navigator.serviceWorker.register('./sw.js').catch(()=>{}); });
}
