/* Color Eights — render: Three.js scene graph, semantic entity views, camera, lighting, VFX, quality. */
(function (global) {
  'use strict';

  const THREE = global.THREE;
  if (!THREE) throw new Error('three not loaded');

  // Card dimensions in world units
  const CARD_W = 1.0, CARD_H = 1.5, CARD_D = 0.06;

  let renderer = null;
  let scene = null;
  let camera = null;
  let clock = { last: 0 };
  let qualityTier = 'auto'; // auto | low | medium | high
  let renderScale = 1;
  let reducedMotion = false;
  let postFx = true;

  const cardGeo = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_D);
  const tableGeo = new THREE.CylinderGeometry(4.2, 4.6, 0.5, 48);
  const floorGeo = new THREE.PlaneGeometry(30, 30);

  let cardMeshes = []; // { mesh }
  let drawPileGroup = null;
  let discardTop = null;
  let tableLightColor = '#e1483c';

  function makeCardMaterial(colorHex) {
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), roughness: 0.5, metalness: 0.0 });
    return m;
  }

  function init(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#160a0c');
    camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
    camera.position.set(0, 4.5, 9);

    const amb = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(amb);
    const dir = new THREE.DirectionalLight(0xfff2e0, 1.4);
    dir.position.set(-6, 8, -3);
    scene.add(dir);
    keyLight = dir;

    // table + floor
    tableMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#5a2320'), roughness: 0.9 });
    const tableMesh = new THREE.Mesh(tableGeo, tableMat);
    tableMesh.position.y = -1.4;
    scene.add(tableMesh);

    // card meshes (pool)
    for (let i = 0; i < 64; i++) {
      const mesh = new THREE.Mesh(cardGeo, makeCardMaterial('#ffffff'));
      mesh.visible = false;
      scene.add(mesh);
      cardMeshes.push({ mesh, color: '#ffffff' });
    }

    resize();
    return renderer;
  }

  let keyLight = null;
  let tableMat = null;

  // Apply a content theme (CEContent.THEMES entry) to the scene.
  function applyTheme(theme) {
    if (!theme || !scene) return;
    scene.background = new THREE.Color(theme.fog || '#160a0c');
    if (tableMat && theme.felt) tableMat.color.set(theme.felt);
    if (keyLight && theme.key) keyLight.color.set(theme.key);
  }

  /* ---------------- render loop ---------------- */
  let rafId = null;
  function frame() {
    rafId = global.requestAnimationFrame(frame);
    if (!renderer || !scene || !camera) return;
    if (global.document && global.document.hidden) return; // hidden tabs idle
    renderer.render(scene, camera);
  }
  function start() { if (rafId == null && renderer) rafId = global.requestAnimationFrame(frame); }
  function stop() {
    if (rafId != null && global.cancelAnimationFrame) global.cancelAnimationFrame(rafId);
    rafId = null;
  }

  function setQuality(tier) { qualityTier = tier || 'auto'; }
  function getRenderScale() { return renderScale; }
  function isReducedMotion() { return reducedMotion; }
  function hasPostFx() { return postFx; }

  function resize(width, height) {
    if (!renderer) return;
    const w = width || (global.innerWidth || 800);
    const h = height || (global.innerHeight || 600);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // frame the table: pull back on narrow viewports
    if (w < 720) { camera.position.z = 13.5; } else { camera.position.z = 9; }
    camera.lookAt(0, -0.6, 0);
  }

  function setTableLight(hex) { tableLightColor = hex || '#e1483c'; }

  // positions: x,y,z for each card index (i), count n
  function layoutPositions(n, baseX, baseY, spacing) {
    const out = [];
    if (!n) return out;
    const s = spacing != null ? spacing : CARD_W * 0.95;
    const total = (n - 1) * s;
    for (let i = 0; i < n; i++) {
      out.push([baseX + (i - (n - 1) / 2) * s, baseY]);
    }
    return out;
  }

  function placeCards(cards, x, y, z, colorHexes) {
    const n = cards.length;
    if (!n || !cardMeshes.length) return;
    for (let i = 0; i < n; i++) {
      const m = cardMeshes[i];
      m.mesh.visible = true;
      m.mesh.position.set(x + i * CARD_W, y, z);
      if (!m.color || m.color !== colorHexes) { m.material.dispose(); }
      m.material = makeCardMaterial(colorHexes != null ? colorHexes : '#ffffff');
      m.color = colorHexes;
    }
  }

  function clearCards() {
    for (const c of cardMeshes) { if (c.mesh.visible) { c.mesh.visible = false; } }
  }

  function setMeshColor(entry, hex) {
    if (entry.color === hex) return;
    entry.mesh.material.dispose();
    entry.mesh.material = makeCardMaterial(hex || '#ffffff');
    entry.color = hex || '#ffffff';
  }

  // Sync the 3D table to a rules snapshot: discard top at center, human hand
  // fanned along the front edge. colorFor(card) -> hex string.
  function syncState(state, colorFor) {
    clearCards();
    if (!state) return;
    let i = 0;
    const top = state.discardPile[state.discardPile.length - 1];
    if (top && cardMeshes[0]) {
      const m = cardMeshes[i++];
      m.mesh.visible = true;
      m.mesh.position.set(0, -0.4, 0);
      m.mesh.rotation.set(0, 0, 0);
      setMeshColor(m, colorFor ? colorFor(top) : '#ffffff');
    }
    const hand = (state.players[0] && state.players[0].hand) || [];
    const positions = layoutPositions(hand.length, 0, -2.4, CARD_W * 1.05);
    for (let k = 0; k < positions.length && i < cardMeshes.length; k++, i++) {
      const m = cardMeshes[i];
      m.mesh.visible = true;
      m.mesh.position.set(positions[k][0], positions[k][1], 0.5);
      m.mesh.rotation.set(0, 0, 0);
      setMeshColor(m, colorFor ? colorFor(hand[k]) : '#ffffff');
    }
  }

  global.CERender = {
    init, setQuality, getRenderScale, isReducedMotion, hasPostFx, resize,
    setTableLight, layoutPositions, placeCards, clearCards, syncState, applyTheme,
    start, stop,
    CARD_W, CARD_H,
    _three: THREE, _renderer: () => renderer, _scene: () => scene, _camera: () => camera,
  };
})(typeof window !== 'undefined' ? window : globalThis);
