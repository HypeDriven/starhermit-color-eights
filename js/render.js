/* Color Eights — render: Three.js lounge table (felt, wood rim, pendant key light), card piles and
 * opponent fans mirroring the rules state, ambient VFX, graphics quality + post-processing. */
(function (global) {
  'use strict';

  const THREE = global.THREE;
  if (!THREE) throw new Error('three not loaded');
  const G = global.CEGfx;

  // Card dimensions in world units (cards lie flat on the felt).
  const CARD_W = 1.0, CARD_H = 1.5, CARD_D = 0.02;
  const TY = -1.15;            // table-top height
  const FELT_R = 3.85, RIM_R = 4.05;
  const POOL = 72;
  const SHAPE_GLYPH = { diamond: '◆', wave: '≈', leaf: '♣', sun: '☀' };
  const KIND_MARK = { skip: '⊘', reverse: '⇄', draw2: '+2', wild: '★', wild4: '+4' };

  let renderer = null, scene = null, camera = null, canvasEl = null;
  let keyLight = null, hemi = null, rimLight = null;
  let tableMat = null, feltMat = null, rimMat = null, floorMat = null;
  let glow = null, motes = null, bokeh = [];
  let drawStack = null;
  let theme = null;
  let lastState = null, lastColorFor = null;
  let cardMeshes = [];

  // Graphics state
  let saved = {};
  let q = null;               // resolved quality
  let gpu = '', detected = 'balanced';
  let composer = null, gradePass = null, postKey = null, postFailed = false;
  let pmrem = null, envTex = null;
  let pixelRatio = 1, adaptiveScale = 1, frames = [], fps = 0;
  let size = [0, 0];
  let reducedSetting = false;
  let dirty = true;
  let animUntil = 0;
  let time = 0, lastNow = 0;
  let topCardId = null, dropStart = 0;

  // Legacy quality API (kept for callers): tier maps onto a preset.
  let qualityTier = 'auto';

  /* ---------------- procedural textures ---------------- */
  function canvasTex(w, h, draw, srgb) {
    const c = global.document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  // Seeded value noise so textures are identical every load.
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  let feltTex = null, woodTex = null, backTex = null, glowTex = null, dotTex = null;
  function feltTexture() {
    if (feltTex) return feltTex;
    feltTex = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      const r = rng(7);
      // fibres: short light/dark strokes
      for (let i = 0; i < 9000; i++) {
        const x = r() * w, y = r() * h, a = r() * Math.PI, l = 2 + r() * 5;
        g.strokeStyle = r() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)';
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      // printed ring around the discard spot + darker edge
      g.strokeStyle = 'rgba(255,236,200,0.22)'; g.lineWidth = 3;
      g.beginPath(); g.arc(w / 2, h / 2, w * 0.2, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 1.5; g.beginPath(); g.arc(w / 2, h / 2, w * 0.215, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(255,236,200,0.12)'; g.lineWidth = 2;
      g.beginPath(); g.arc(w / 2, h / 2, w * 0.46, 0, Math.PI * 2); g.stroke();
      const vg = g.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.5);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
      g.fillStyle = vg; g.fillRect(0, 0, w, h);
    });
    return feltTex;
  }
  function woodTexture() {
    if (woodTex) return woodTex;
    woodTex = canvasTex(512, 64, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      const r = rng(11);
      for (let i = 0; i < 70; i++) {
        const y = r() * h, a = 0.05 + r() * 0.12;
        g.strokeStyle = 'rgba(40,20,10,' + a.toFixed(3) + ')'; g.lineWidth = 0.6 + r() * 2;
        g.beginPath(); g.moveTo(0, y);
        for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 2.5);
        g.stroke();
      }
    });
    woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
    woodTex.repeat.set(6, 1);
    return woodTex;
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function backTexture() {
    if (backTex) return backTex;
    backTex = canvasTex(128, 192, (g, w, h) => {
      g.fillStyle = '#241c2c'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ff7a4d'; g.lineWidth = 3; roundRect(g, 8, 8, w - 16, h - 16, 10); g.stroke();
      g.strokeStyle = 'rgba(255,122,77,0.28)'; g.lineWidth = 1.2;
      for (let i = -h; i < w + h; i += 12) { g.beginPath(); g.moveTo(i, 14); g.lineTo(i + h, h - 14 + 0); g.stroke(); g.beginPath(); g.moveTo(i + h, 14); g.lineTo(i, h - 14); g.stroke(); }
      g.fillStyle = '#241c2c'; g.beginPath(); g.ellipse(w / 2, h / 2, 30, 38, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ffcf4d'; g.lineWidth = 2.5; g.stroke();
      g.fillStyle = '#ffcf4d'; g.font = 'bold 44px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('8', w / 2, h / 2 + 2);
    });
    return backTex;
  }
  function radialTexture(stops) {
    return canvasTex(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      for (const [o, c] of stops) gr.addColorStop(o, c);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
  }

  const faceTexCache = new Map();
  function faceTexture(card, hex) {
    const mark = card.kind === 'number' ? String(card.rank) : KIND_MARK[card.kind] || '';
    const glyph = card.color ? SHAPE_GLYPH[global.CERules.COLOR_INFO[card.color].shape] || '' : '★';
    const key = hex + '|' + mark + '|' + glyph + '|' + (card.color ? '' : 'wild');
    if (faceTexCache.has(key)) return faceTexCache.get(key);
    const tex = canvasTex(128, 192, (g, w, h) => {
      g.fillStyle = '#e6dccb'; g.fillRect(0, 0, w, h);
      if (card.color) {
        g.fillStyle = hex; roundRect(g, 7, 7, w - 14, h - 14, 12); g.fill();
      } else {
        const cols = ['#e1483c', '#2f7fe0', '#37a24a', '#e8b32a'];
        for (let i = 0; i < 4; i++) { g.fillStyle = cols[i]; g.fillRect(7 + (i % 2) * (w - 14) / 2, 7 + (i >> 1) * (h - 14) / 2, (w - 14) / 2, (h - 14) / 2); }
      }
      const sheen = g.createLinearGradient(0, 0, w, h);
      sheen.addColorStop(0, 'rgba(255,255,255,0.22)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,0.18)');
      g.fillStyle = sheen; roundRect(g, 7, 7, w - 14, h - 14, 12); g.fill();
      g.fillStyle = 'rgba(238,230,218,0.9)'; g.beginPath(); g.ellipse(w / 2, h / 2, 38, 54, -0.45, 0, Math.PI * 2); g.fill();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = card.color ? hex : '#2c2433';
      g.font = 'bold 50px system-ui, sans-serif'; g.fillText(mark || glyph, w / 2, h / 2 + 2);
      g.fillStyle = '#ffffff'; g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 3;
      g.font = 'bold 22px system-ui, sans-serif'; g.fillText(mark, 22, 24); g.fillText(glyph, 22, 46);
      g.save(); g.translate(w - 22, h - 24); g.rotate(Math.PI); g.fillText(mark, 0, 0); g.fillText(glyph, 0, -22); g.restore();
    });
    faceTexCache.set(key, tex);
    return tex;
  }

  /* ---------------- card geometry + materials ---------------- */
  let geoPlain = null, geoRound = null;
  function cardGeometries() {
    geoPlain = new THREE.BoxGeometry(CARD_W, CARD_D, CARD_H);
    // group order for BoxGeometry: +x,-x,+y,-y,+z,-z → make it [sides=1, top=0] like the extrude.
    const idx = [1, 1, 0, 1, 1, 1];
    geoPlain.groups.forEach((gr, i) => { gr.materialIndex = idx[i]; });
    const r = 0.09, w = CARD_W / 2, h = CARD_H / 2;
    const s = new THREE.Shape();
    s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r);
    s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h); s.lineTo(-w + r, h);
    s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
    geoRound = new THREE.ExtrudeGeometry(s, { depth: CARD_D * 0.6, bevelEnabled: true, bevelThickness: CARD_D * 0.2, bevelSize: 0.008, bevelSegments: 2, curveSegments: 4 });
    const pos = geoRound.attributes.position, uv = geoRound.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w) / CARD_W, (pos.getY(i) + h) / CARD_H);
    geoRound.rotateX(-Math.PI / 2);
    geoRound.translate(0, -CARD_D * 0.5, 0);
  }
  const edgeMat = new THREE.MeshStandardMaterial({ color: '#cfc5b4', roughness: 0.8 });
  const matCache = new Map();
  function faceMaterial(card, hex) {
    const detailed = q && q.detail === 'detailed';
    const key = detailed ? 'd|' + (card ? card.kind + '|' + card.rank + '|' + card.color : 'back') + '|' + hex : 'p|' + hex;
    if (matCache.has(key)) return matCache.get(key);
    let m;
    if (detailed) {
      m = new THREE.MeshPhysicalMaterial({ map: card ? faceTexture(card, hex) : backTexture(), roughness: 0.42, metalness: 0 });
    } else {
      m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.5 });
    }
    tuneGloss(m);
    matCache.set(key, m);
    return m;
  }
  function tuneGloss(m) {
    const refl = q && q.reflections === 'on';
    m.envMapIntensity = refl ? 0.35 : 0;
    if (m.isMeshPhysicalMaterial) { m.clearcoat = refl ? 0.7 : 0; m.clearcoatRoughness = 0.12; }
    m.needsUpdate = true;
  }
  function clearMatCache() { for (const m of matCache.values()) m.dispose(); matCache.clear(); }

  /* ---------------- scene ---------------- */
  function init(canvas) {
    canvasEl = canvas;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    detectGpu();

    scene = new THREE.Scene();
    scene.background = new THREE.Color('#160a0c');
    scene.fog = new THREE.Fog('#160a0c', 16, 34);
    camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
    camera.position.set(0, 4.5, 9);

    hemi = new THREE.HemisphereLight(0x7040a0, 0x1a0c0e, 0.4);
    scene.add(hemi);
    // Pendant-lamp key light: a soft spot pool over the table; its shadow frustum is the cone,
    // fitted to the felt (angle + near/far from the lamp height).
    keyLight = new THREE.SpotLight(0xffb28a, 85, 0, 0.53, 0.45, 2);
    keyLight.position.set(0, TY + 7.5, 0.4);
    keyLight.target.position.set(0, TY, 0);
    keyLight.shadow.camera.near = 4;
    keyLight.shadow.camera.far = 11;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight, keyLight.target);
    rimLight = new THREE.DirectionalLight(0xfff2e0, 0.5);
    rimLight.position.set(-6, 8, -3);
    scene.add(rimLight);

    // table: felt disc, wood rim torus, body
    tableMat = new THREE.MeshStandardMaterial({ color: '#3a1a16', roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(RIM_R, RIM_R + 0.35, 0.7, 64), tableMat);
    body.position.y = TY - 0.38;
    body.receiveShadow = true;
    scene.add(body);
    feltMat = new THREE.MeshStandardMaterial({ color: '#5a2320', roughness: 0.95 });
    const felt = new THREE.Mesh(new THREE.CircleGeometry(FELT_R + 0.05, 64), feltMat);
    felt.rotation.x = -Math.PI / 2;
    felt.position.y = TY;
    felt.receiveShadow = true;
    scene.add(felt);
    rimMat = new THREE.MeshPhysicalMaterial({ color: '#6b3a26', roughness: 0.45, clearcoat: 0, clearcoatRoughness: 0.2 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM_R - 0.06, 0.2, 16, 96), rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = TY + 0.02;
    rim.castShadow = true; rim.receiveShadow = true;
    scene.add(rim);
    floorMat = new THREE.MeshStandardMaterial({ color: '#1a0c0e', roughness: 0.9 });
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = TY - 2.6;
    floor.receiveShadow = true;
    scene.add(floor);

    // current-colour glow under the discard pile (bright enough to bloom)
    glowTex = radialTexture([[0, 'rgba(255,255,255,0.0)'], [0.42, 'rgba(255,255,255,0.0)'], [0.55, 'rgba(255,255,255,0.9)'], [0.68, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
    glow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xe1483c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0, TY + 0.004, 0.1);
    glow.userData.noAO = true;
    glow.renderOrder = 1;
    scene.add(glow);

    // distant lounge lamps (bokeh) at the far wall
    dotTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.8)'], [0.6, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]);
    const lampSpots = [[-14, -1.6, -16], [-8, -1.2, -19], [-2.5, -1.8, -21], [3.5, -1.3, -20], [9, -1.7, -18], [14.5, -1.2, -16]];
    for (let i = 0; i < lampSpots.length; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: dotTex, color: new THREE.Color(0xffb070).multiplyScalar(1.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      m.position.set(lampSpots[i][0], lampSpots[i][1], lampSpots[i][2]);
      m.userData.noAO = true;
      m.userData.phase = i * 1.7;
      bokeh.push(m);
      scene.add(m);
    }

    // draw-pile body (scaled to the pile size)
    drawStack = new THREE.Mesh(new THREE.BoxGeometry(CARD_W * 0.98, 1, CARD_H * 0.98), edgeMat);
    drawStack.castShadow = true; drawStack.receiveShadow = true;
    drawStack.visible = false;
    scene.add(drawStack);

    cardGeometries();
    for (let i = 0; i < POOL; i++) {
      const mesh = new THREE.Mesh(geoPlain, [edgeMat, edgeMat]);
      mesh.visible = false;
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
      cardMeshes.push({ mesh, key: '' });
    }

    setGraphics(saved);
    resize();
    return renderer;
  }

  function detectGpu() {
    try {
      const gl = renderer.getContext();
      let name = gl.getParameter(gl.RENDERER) || '';
      if (!name || /^webkit|^mozilla/i.test(name)) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) name = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || name;
      }
      gpu = String(name);
    } catch (e) { gpu = ''; }
    const touch = !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches) || (global.navigator && global.navigator.maxTouchPoints > 0 && !(global.matchMedia && global.matchMedia('(pointer: fine)').matches));
    detected = G.detectPreset(gpu, touch);
  }

  // Apply a content theme (CEContent.THEMES entry) to the scene.
  function applyTheme(t) {
    if (!t || !scene) return;
    theme = t;
    const fog = new THREE.Color(t.fog || '#160a0c');
    scene.background = fog;
    scene.fog.color.copy(fog);
    if (t.felt) feltMat.color.set(t.felt);
    if (t.table) tableMat.color.set(t.table);
    if (t.table) rimMat.color.set(t.table).lerp(new THREE.Color('#9a6040'), 0.45);
    if (t.floor) floorMat.color.set(t.floor).multiplyScalar(0.5);
    if (t.key != null) keyLight.color.set(t.key);
    if (t.fill != null) { hemi.color.set(t.fill); hemi.groundColor.set(t.floor || '#1a0c0e'); }
    if (!lastState && t.accent) glow.material.color.set(t.accent);
    for (const b of bokeh) b.material.color.set(t.key != null ? t.key : 0xffb070).multiplyScalar(1.2);
    dirty = true;
  }

  /* ---------------- motes (dust in the lamp light) ---------------- */
  function buildMotes(count) {
    if (motes) { scene.remove(motes); motes.geometry.dispose(); motes.material.dispose(); motes = null; }
    if (!count) return;
    const r = rng(3);
    const pos = new Float32Array(count * 3), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // inside the lamp's light cone: narrower towards the lamp
      const hgt = r() * 5, a = r() * Math.PI * 2, d = Math.sqrt(r()) * 3.0 * (1 - hgt / 7.5);
      pos[i * 3] = Math.cos(a) * d; pos[i * 3 + 1] = TY + 0.3 + hgt; pos[i * 3 + 2] = 0.4 + Math.sin(a) * d;
      seed[i] = r() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.userData.base = pos.slice();
    geo.userData.seed = seed;
    motes = new THREE.Points(geo, new THREE.PointsMaterial({ map: dotTex, color: 0xffd8b0, size: 0.05, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    scene.add(motes);
  }
  function animateMotes(t) {
    if (!motes) return;
    const geo = motes.geometry, p = geo.attributes.position.array, b = geo.userData.base, s = geo.userData.seed;
    for (let i = 0; i < s.length; i++) {
      const k = s[i];
      p[i * 3] = b[i * 3] + Math.sin(t * 0.21 + k) * 0.35;
      p[i * 3 + 1] = TY + 0.3 + ((b[i * 3 + 1] - TY - 0.3 + t * 0.08 + k * 0.01) % 5);
      p[i * 3 + 2] = b[i * 3 + 2] + Math.cos(t * 0.17 + k * 1.3) * 0.35;
    }
    geo.attributes.position.needsUpdate = true;
  }

  /* ---------------- graphics settings ---------------- */
  function motionAllowed() {
    const mq = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return !reducedSetting && !mq;
  }

  /** Apply saved graphics settings ({preset, render_scale, adaptive, show_fps, <category>}). */
  function setGraphics(s) {
    saved = Object.assign({}, s || {});
    const prevDetail = q && q.detail;
    q = G.resolve(saved, detected);
    if (!renderer) return q;
    const mapSize = G.SHADOW_MAP[q.shadows];
    renderer.shadowMap.enabled = mapSize > 0;
    keyLight.castShadow = mapSize > 0;
    if (mapSize > 0 && keyLight.shadow.mapSize.x !== mapSize) {
      keyLight.shadow.mapSize.set(mapSize, mapSize);
      if (keyLight.shadow.map) { keyLight.shadow.map.dispose(); keyLight.shadow.map = null; }
    }
    // Image-based lighting for glossy cards and the lacquered rim.
    if (q.reflections === 'on' && global.CEPost && !envTex) {
      try {
        pmrem = pmrem || new THREE.PMREMGenerator(renderer);
        envTex = pmrem.fromScene(new global.CEPost.RoomEnvironment(renderer), 0.04).texture;
      } catch (e) { envTex = null; }
    }
    scene.environment = q.reflections === 'on' ? envTex : null;
    // Without image-based fill the hemisphere carries more of the ambient light.
    hemi.intensity = scene.environment ? 0.4 : 0.9;
    rimMat.clearcoat = q.reflections === 'on' ? 0.8 : 0;
    // The studio environment is far brighter than a dim lounge: keep its fill subtle so it adds
    // sheen and highlights without greying the room.
    rimMat.envMapIntensity = 0.3;
    feltMat.envMapIntensity = 0.06;
    tableMat.envMapIntensity = 0.12;
    floorMat.envMapIntensity = 0.02;
    edgeMat.envMapIntensity = 0.15;
    // Surface detail: procedural felt fibres + wood grain, rounded textured cards.
    const detailed = q.detail === 'detailed';
    feltMat.map = detailed ? feltTexture() : null;
    rimMat.map = detailed ? woodTexture() : null;
    if (prevDetail !== q.detail) { clearMatCache(); for (const c of cardMeshes) c.key = ''; }
    for (const m of matCache.values()) tuneGloss(m);
    for (const m of [feltMat, rimMat, tableMat, floorMat, edgeMat]) m.needsUpdate = true;
    for (const b of bokeh) b.visible = detailed;
    buildMotes(G.PARTICLE_COUNT[q.particles]);
    adaptiveScale = 1;
    frames = [];
    postKey = null;
    fpsVisible(q.showFps);
    if (global.document && global.document.body) {
      const b = global.document.body;
      b.dataset.gfxPreset = q.preset;
      b.dataset.gfxAuto = q.auto ? 'true' : 'false';
      b.classList.toggle('ce-gfx-detailed', detailed);
    }
    if (lastState !== undefined) syncState(lastState, lastColorFor);
    dirty = true;
    return q;
  }

  function setReducedMotion(on) { reducedSetting = !!on; dirty = true; }

  function graphicsInfo() {
    const px = [Math.round(size[0] * pixelRatio), Math.round(size[1] * pixelRatio)];
    return { gpu: gpu || 'unknown GPU', detected, resolved: q, pixels: px, fps: Math.round(fps), adaptiveScale: Math.round(adaptiveScale * 100) / 100, postFailed: postFailed || !global.CEPost };
  }
  function getGraphics() { return Object.assign({}, saved); }

  function fpsVisible(on) {
    const d = global.document; if (!d || !d.body) return;
    let el = d.getElementById('ce-fps');
    if (on && !el) {
      el = d.createElement('div');
      el.id = 'ce-fps';
      el.setAttribute('aria-hidden', 'true');
      el.textContent = '… fps';
      d.body.appendChild(el);
    }
    if (el) el.hidden = !on;
  }

  /* ---------------- post-processing ---------------- */
  const GradeShader = {
    uniforms: { tDiffuse: { value: null }, uAmount: { value: 1.0 }, uVignette: { value: 0.3 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float uAmount; uniform float uVignette; varying vec2 vUv;',
      'void main() {',
      '  vec4 src = texture2D(tDiffuse, vUv); vec3 c = clamp(src.rgb, 0.0, 1.0);',
      // gentle S-curve, a touch more saturation, warm highlights / cool shadows (lounge look)
      '  vec3 s = mix(c, c * c * (3.0 - 2.0 * c), 0.22);',
      '  float l = dot(s, vec3(0.299, 0.587, 0.114));',
      '  s = mix(vec3(l), s, 1.1);',
      '  s *= mix(vec3(0.95, 0.97, 1.05), vec3(1.05, 1.0, 0.94), smoothstep(0.15, 0.8, l));',
      '  c = mix(c, s, uAmount);',
      '  float d = length((vUv - 0.5) * vec2(1.1, 1.0));',
      '  c *= 1.0 - uVignette * smoothstep(0.32, 0.85, d);',
      '  gl_FragColor = vec4(c, src.a);',
      '}',
    ].join('\n'),
  };

  function buildPost(w, h) {
    if (composer) { try { composer.dispose(); } catch (e) {} }
    composer = null; gradePass = null;
    if (!q.post || !global.CEPost) return;
    const P = global.CEPost;
    try {
      const pw = Math.max(1, Math.round(w * pixelRatio)), ph = Math.max(1, Math.round(h * pixelRatio));
      const target = new THREE.WebGLRenderTarget(pw, ph, { type: THREE.HalfFloatType, samples: q.antialias === 'msaa' ? 4 : 0 });
      const c = new P.EffectComposer(renderer, target);
      c.setPixelRatio(pixelRatio);
      c.setSize(w, h);
      c.addPass(new P.RenderPass(scene, camera));
      if (q.ao !== 'off') {
        const ao = new P.GTAOPass(scene, camera, pw, ph);
        ao.output = P.GTAOPass.OUTPUT.Default;
        ao.blendIntensity = 0.75;
        ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1.0, scale: 1.0, samples: q.ao === 'high' ? 16 : 8 });
        ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: q.ao === 'high' ? 6 : 4, rings: 2, samples: q.ao === 'high' ? 16 : 8 });
        // Additive glows and bokeh must not write into the AO depth/normal pass.
        const base = ao.overrideVisibility.bind(ao);
        ao.overrideVisibility = function () { base(); scene.traverse((o) => { if (o.userData.noAO) o.visible = false; }); };
        c.addPass(ao);
      }
      if (q.bloom === 'on') c.addPass(new P.UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.45, 0.92));
      c.addPass(new P.OutputPass());
      if (q.grade === 'on') { gradePass = new P.ShaderPass(GradeShader); c.addPass(gradePass); }
      if (q.antialias === 'smaa') c.addPass(new P.SMAAPass(pw, ph));
      if (q.antialias === 'fxaa') {
        const fxaa = new P.ShaderPass(P.FXAAShader);
        fxaa.material.uniforms.resolution.value.set(1 / pw, 1 / ph);
        c.addPass(fxaa);
      }
      composer = c;
      postFailed = false;
    } catch (e) {
      // Post-processing is an enhancement: render directly (the Graphics panel shows a note).
      postFailed = true;
      composer = null;
    }
  }

  // Adaptive resolution: average ~90 frames, step down when slow, back up when fast.
  function adapt(dt) {
    frames.push(dt);
    if (frames.length < 90) return false;
    const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
    frames.length = 0;
    fps = 1000 / avg;
    const el = global.document.getElementById('ce-fps');
    if (el && !el.hidden) el.textContent = Math.round(fps) + ' fps · ' + (Math.round(pixelRatio * 100) / 100) + '×';
    if (!q.adaptive) return false;
    const before = adaptiveScale;
    if (avg > 26) adaptiveScale = Math.max(0.6, adaptiveScale - 0.1);
    else if (avg < 14 && adaptiveScale < 1) adaptiveScale = Math.min(1, adaptiveScale + 0.05);
    return before !== adaptiveScale;
  }

  /* ---------------- render loop ---------------- */
  let rafId = null;
  function frame() {
    rafId = global.requestAnimationFrame(frame);
    if (!renderer || !scene || !camera) return;
    if (global.document && global.document.hidden) { lastNow = 0; return; }
    const now = global.performance.now();
    const dt = lastNow ? Math.min(250, now - lastNow) : 16;
    lastNow = now;
    const moving = motionAllowed();
    const ambient = (moving && (q.background === 'animated' || q.particles !== 'off')) || q.showFps;
    const animating = moving && now < animUntil;
    // Static scenes render only when something changed (cheaper than the pre-upgrade loop).
    if (!ambient && !animating && !dirty) return;
    dirty = false;
    if (moving) time += dt / 1000;

    if (moving && q.background === 'animated') {
      const pulse = 0.5 + 0.5 * Math.sin(time * 1.6);
      glow.material.opacity = 0.8 + 0.2 * pulse;
      keyLight.intensity = 85 * (1 + 0.025 * Math.sin(time * 2.3) + 0.012 * Math.sin(time * 7.1));
      for (const b of bokeh) b.material.opacity = 0.75 + 0.25 * Math.sin(time * 1.1 + b.userData.phase);
    } else {
      glow.material.opacity = 0.9; keyLight.intensity = 85;
      for (const b of bokeh) b.material.opacity = 0.9;
    }
    if (moving) animateMotes(time);
    animateDrop(now, moving);

    const rescale = adapt(dt);
    const w = global.innerWidth || 800, h = global.innerHeight || 600;
    const dpr = global.devicePixelRatio || 1;
    const ratio = Math.min(dpr, q.cap) * q.scale * adaptiveScale;
    if (w !== size[0] || h !== size[1] || ratio !== pixelRatio || rescale) {
      pixelRatio = ratio;
      renderer.setPixelRatio(ratio);
      applySize(w, h);
    }
    const key = q.post && global.CEPost ? [q.ao, q.bloom, q.grade, q.antialias, w, h, pixelRatio].join('|') : 'none';
    if (key !== postKey) { postKey = key; buildPost(w, h); }
    if (gradePass) gradePass.uniforms.uAmount.value = 1;
    if (composer) composer.render(dt / 1000);
    else renderer.render(scene, camera);
  }
  function start() { if (rafId == null && renderer) rafId = global.requestAnimationFrame(frame); }
  function stop() {
    if (rafId != null && global.cancelAnimationFrame) global.cancelAnimationFrame(rafId);
    rafId = null;
  }

  function setQuality(tier) {
    // Legacy tier setting: only honoured when no graphics preset has been chosen yet.
    qualityTier = tier || 'auto';
  }
  function getRenderScale() { return q ? q.scale : 1; }
  function isReducedMotion() { return !motionAllowed(); }
  function hasPostFx() { return !!composer; }

  function applySize(w, h) {
    size = [w, h];
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // frame the table: pull back on narrow viewports
    // A higher, more top-down view keeps the opponents' fans visible above the DOM piles.
    if (w < 720) camera.position.set(0, 10.5, 11.5); else camera.position.set(0, 7.4, 7.6);
    camera.lookAt(0, -1.4, 0.35);
  }
  function resize(width, height) {
    if (!renderer) return;
    const w = width || (global.innerWidth || 800);
    const h = height || (global.innerHeight || 600);
    if (!q) return;
    pixelRatio = Math.min(global.devicePixelRatio || 1, q.cap) * q.scale * adaptiveScale;
    renderer.setPixelRatio(pixelRatio);
    applySize(w, h);
    dirty = true;
  }

  function setTableLight(hex) { if (hex) glow.material.color.set(hex); dirty = true; }

  // positions: x,y for each card index (i), count n
  function layoutPositions(n, baseX, baseY, spacing) {
    const out = [];
    if (!n) return out;
    const s = spacing != null ? spacing : CARD_W * 0.95;
    for (let i = 0; i < n; i++) out.push([baseX + (i - (n - 1) / 2) * s, baseY]);
    return out;
  }

  /* ---------------- state → table ---------------- */
  function hash(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h / 4294967296; }

  let used = 0;
  function put(card, hex, x, y, z, rotY) {
    if (used >= cardMeshes.length) return null;
    const e = cardMeshes[used++];
    const detailed = q && q.detail === 'detailed';
    const key = (detailed ? 'd' : 'p') + (card ? card.id + hex : 'back');
    if (e.key !== key) {
      e.mesh.geometry = detailed ? geoRound : geoPlain;
      e.mesh.material = [faceMaterial(card, card ? hex : '#241c2c'), edgeMat];
      e.key = key;
    }
    e.mesh.visible = true;
    e.mesh.position.set(x, TY + CARD_D / 2 + y, z);
    e.mesh.rotation.set(0, rotY || 0, 0);
    return e.mesh;
  }

  function clearCards() {
    used = 0;
    for (const c of cardMeshes) c.mesh.visible = false;
    drawStack.visible = false;
    dirty = true;
  }
  function placeCards(cards, x, y, z, colorHex) {
    for (let i = 0; i < cards.length; i++) put(cards[i], colorHex || '#ffffff', x + i * CARD_W, y, z, 0);
    dirty = true;
  }

  function fan(seatX, seatZ, facing, count) {
    const m = Math.min(count, 14);
    const spacing = Math.min(0.26, 2.4 / Math.max(1, m));
    const cos = Math.cos(facing), sin = Math.sin(facing);
    for (let j = 0; j < m; j++) {
      const off = (j - (m - 1) / 2);
      const lx = off * spacing, lz = -Math.abs(off) * 0.03;
      put(null, null, seatX + lx * cos + lz * sin, j * 0.004, seatZ - lx * sin + lz * cos, facing + off * 0.05);
    }
  }

  function drawPile(n) {
    if (n <= 0) return;
    const hgt = Math.min(0.36, Math.max(0.02, n * 0.0035));
    drawStack.visible = true;
    drawStack.scale.y = hgt;
    drawStack.position.set(-1.6, TY + hgt / 2, 0.15);
    drawStack.rotation.y = 0.06;
    put(null, null, -1.6, hgt, 0.15, 0.06);
  }

  // Sync the 3D table to a rules snapshot: discard pile at centre (last few cards scattered),
  // draw pile stack to its left, face-down fans at each opponent's seat. colorFor(card) -> hex.
  function syncState(state, colorFor) {
    lastState = state || null;
    lastColorFor = colorFor || null;
    if (!scene) return;
    clearCards();
    if (!state) { decorativeSpread(); return; }
    const pile = state.discardPile || [];
    const shown = pile.slice(-4);
    let top = null;
    shown.forEach((c, i) => {
      const r1 = hash(c.id), r2 = hash(c.id + 'z');
      const isTop = i === shown.length - 1;
      const mesh = put(c, colorFor ? colorFor(c) : '#ffffff', isTop ? 0 : (r1 - 0.5) * 0.3, i * 0.006, 0.1 + (isTop ? 0 : (r2 - 0.5) * 0.25), isTop ? (r1 - 0.5) * 0.12 : (r2 - 0.5) * 0.8);
      if (isTop && mesh) { mesh.userData.restY = mesh.position.y; top = { card: c, mesh }; }
    });
    drawPile((state.drawPile || []).length);
    const opps = state.players.slice(1);
    const seats = opps.length === 1 ? [[0, -2.55, 0]]
      : opps.length === 2 ? [[-2.2, -1.85, -0.75], [2.2, -1.85, 0.75]]
      : [[-2.75, -0.35, -1.35], [0, -2.6, 0], [2.75, -0.35, 1.35]];
    opps.forEach((p, i) => { if (seats[i]) fan(seats[i][0], seats[i][1], seats[i][2], p.hand.length); });
    const cc = state.currentColor;
    const hex = cc && global.CERules && global.CERules.COLOR_INFO[cc]
      ? (colorFor ? colorFor({ color: cc, kind: 'number', id: '_' }) : global.CERules.COLOR_INFO[cc].hex)
      : '#9a93a3';
    glow.material.color.set(hex).multiplyScalar(q && q.bloom === 'on' ? 1.3 : 0.9);
    // Newly played card drops onto the pile (skipped with reduced motion).
    if (top && top.card.id !== topCardId) {
      if (topCardId !== null && motionAllowed()) { dropStart = global.performance.now(); animUntil = dropStart + 340; dropMesh = top.mesh; }
      topCardId = top.card.id;
    } else dropMesh = null;
    dirty = true;
  }
  let dropMesh = null;
  function animateDrop(now, moving) {
    if (!dropMesh || !moving) return;
    const k = Math.min(1, (now - dropStart) / 320);
    const e = 1 - Math.pow(1 - k, 3);
    dropMesh.position.y = dropMesh.userData.restY + (1 - e) * 0.9;
    dropMesh.rotation.z = (1 - e) * 0.25;
    if (k >= 1) dropMesh = null;
  }

  // Title / no round: the four eights fanned on the felt, a draw pile beside them.
  function decorativeSpread() {
    const R = global.CERules;
    if (!R) return;
    R.COLORS.forEach((c, i) => {
      const off = i - 1.5;
      put({ id: 'deco-' + c, kind: 'number', color: c, rank: 8 }, R.COLOR_INFO[c].hex, off * 0.62, i * 0.006, 0.25 + Math.abs(off) * 0.12, -off * 0.18);
    });
    drawPile(40);
    glow.material.color.set(theme && theme.accent ? theme.accent : '#ff7a4d').multiplyScalar(q && q.bloom === 'on' ? 1.4 : 0.9);
    dirty = true;
  }

  global.CERender = {
    init, setQuality, getRenderScale, isReducedMotion, hasPostFx, resize,
    setTableLight, layoutPositions, placeCards, clearCards, syncState, applyTheme,
    setGraphics, getGraphics, graphicsInfo, setReducedMotion,
    start, stop,
    CARD_W, CARD_H,
    _three: THREE, _renderer: () => renderer, _scene: () => scene, _camera: () => camera,
  };
})(typeof window !== 'undefined' ? window : globalThis);
