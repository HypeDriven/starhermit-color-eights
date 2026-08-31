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
    camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);

    const amb = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(amb);
    const dir = new THREE.DirectionalLight(0xfff2e0, 1.4);
    dir.position.set(-6, 8, -3);
    scene.add(dir);

    // table + floor
    const tableMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#5a2320'), roughness: 0.9 });
    const tableMesh = new THREE.Mesh(tableGeo, tableMat);
    tableMesh.position.y = -1.4;
    scene.add(tableMesh);

    // card meshes (pool)
    for (let i = 0; i < 64; i++) {
      const mesh = new THREE.Mesh(cardGeo, makeCardMaterial('#ffffff'));
      mesh.visible = false;
      scene.add(mesh);
      cardMeshes.push({ mesh });
    }

    resize();
    return renderer;
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

  global.CERender = {
    init, setQuality, getRenderScale, isReducedMotion, hasPostFx, resize,
    setTableLight, layoutPositions, placeCards, clearCards,
    CARD_W, CARD_H,
    _three: THREE, _renderer: () => renderer, _scene: () => scene, _camera: () => camera,
  };
})(typeof window !== 'undefined' ? window : globalThis);
