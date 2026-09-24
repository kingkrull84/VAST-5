import init, { Tpes, get_tpes_by_id, GlobalSourceBus, GlobalSinkBus, D3Q27Lattice } from 'vast_5';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const MANIFEST_ITEMS = [
  { id: 0, name: 'Positron', desc: 'T1 : P1 : E0 : S1' },
  { id: 1, name: 'Electron', desc: 'T1 : P0 : E1 : S2' },
  { id: 2, name: 'Element Zero', desc: 'T0 : P1 : E1 : S0' }
];

const NEIGHBORS_3D = [
  [-1, -1, -1], [0, -1, -1], [1, -1, -1],
  [-1,  0, -1], [0,  0, -1], [1,  0, -1],
  [-1,  1, -1], [0,  1, -1], [1,  1, -1],
  [-1, -1,  0], [0, -1,  0], [1, -1,  0],
  [-1,  0,  0],              [1,  0,  0],
  [-1,  1,  0], [0,  1,  0], [1,  1,  0],
  [-1, -1,  1], [0, -1,  1], [1, -1,  1],
  [-1,  0,  1], [0,  0,  1], [1,  0,  1],
  [-1,  1,  1], [0,  1,  1], [1,  1,  1],
];

async function run() {
  const wasm = await init();

  // WASM memory buffer reference
  const memory = wasm.memory;

  // Global Buses and 3D Lattice
  const sourceBus = new GlobalSourceBus(0n);
  const sinkBus = new GlobalSinkBus(0n);
  const lattice = new D3Q27Lattice();

  const totalCells = lattice.size();
  const elemZeroRaw = get_tpes_by_id(2).as_u32();
  const electronRaw = get_tpes_by_id(1).as_u32();

  // State
  let selectedId = 1; // Default Electron
  let isPlaying = false;
  let spacetimeWarp = true;
  let targetTicksPerSecond = 60;

  // DOM Elements
  const container = document.getElementById('canvas-container');
  const btnPlayPause = document.getElementById('btn-play-pause');
  const btnStep = document.getElementById('btn-step');
  const btnWireframe = document.getElementById('btn-wireframe');
  const btnToggleWarp = document.getElementById('btn-toggle-warp');
  const rangeComptonRate = document.getElementById('range-compton-rate');
  const comptonRateVal = document.getElementById('compton-rate-val');
  const chkSliceZ = document.getElementById('chk-slice-z');
  const selectedLabel = document.getElementById('selected-label');
  const statSource = document.getElementById('stat-source');
  const statSink = document.getElementById('stat-sink');
  const statActive = document.getElementById('stat-active');
  const manifestList = document.getElementById('manifest-list');

  // Render Manifest Panel List
  MANIFEST_ITEMS.forEach(item => {
    const div = document.createElement('div');
    div.className = `manifest-item ${item.id === selectedId ? 'selected' : ''}`;
    div.dataset.id = item.id;
    div.innerHTML = `
      <div class="item-title">${item.name} (ID ${item.id})</div>
      <div class="item-desc">${item.desc}</div>
    `;
    div.addEventListener('click', () => {
      document.querySelectorAll('.manifest-item').forEach(el => el.classList.remove('selected'));
      div.classList.add('selected');
      selectedId = item.id;
      selectedLabel.textContent = `${item.name} (ID ${item.id})`;
    });
    manifestList.appendChild(div);
  });
  selectedLabel.textContent = `Electron (ID 1)`;

  // Three.js Scene Setup
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e14);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(48, 48, 64);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(15.5, 15.5, 15.5);
  controls.update();

  // Ambient & Directional Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(50, 100, 50);
  scene.add(dirLight);

  // Grid Boundary Box Wireframe Helper
  const boxGeo = new THREE.BoxGeometry(32, 32, 32);
  const boxEdges = new THREE.EdgesGeometry(boxGeo);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x30363d });
  const wireframeBox = new THREE.LineSegments(boxEdges, lineMat);
  wireframeBox.position.set(15.5, 15.5, 15.5);
  scene.add(wireframeBox);

  // Invisible Raycast Target Box enclosing 32x32x32 volume
  const raycastBoxMat = new THREE.MeshBasicMaterial({ visible: false });
  const raycastBoxMesh = new THREE.Mesh(boxGeo, raycastBoxMat);
  raycastBoxMesh.position.set(15.5, 15.5, 15.5);
  scene.add(raycastBoxMesh);

  // --- PART 2: Contiguous Rubber Grid (THREE.LineSegments) ---
  // Create vertex positions array for 32,768 lattice nodes
  const vertexPositions = new Float32Array(totalCells * 3);
  for (let z = 0; z < 32; z++) {
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const idx = x + y * 32 + z * 1024;
        vertexPositions[idx * 3 + 0] = x;
        vertexPositions[idx * 3 + 1] = y;
        vertexPositions[idx * 3 + 2] = z;
      }
    }
  }

  // Pre-calculate line segment endpoint index pairs
  const lineSegmentIndices = [];
  for (let z = 0; z < 32; z++) {
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const idx = x + y * 32 + z * 1024;
        if (x < 31) lineSegmentIndices.push(idx, idx + 1);
        if (y < 31) lineSegmentIndices.push(idx, idx + 32);
        if (z < 31) lineSegmentIndices.push(idx, idx + 1024);
      }
    }
  }

  const numSegments = lineSegmentIndices.length / 2; // 95,232 segments
  const segmentPositions = new Float32Array(numSegments * 2 * 3);
  const segmentLineDistances = new Float32Array(numSegments * 2);

  // Initialize segment line distances (0.0 for start, 1.0 for end of each segment)
  for (let s = 0; s < numSegments; s++) {
    segmentLineDistances[s * 2 + 0] = 0.0;
    segmentLineDistances[s * 2 + 1] = 1.0;
  }

  const gridGeometry = new THREE.BufferGeometry();
  const segmentPosAttr = new THREE.BufferAttribute(segmentPositions, 3);
  const lineDistAttr = new THREE.BufferAttribute(segmentLineDistances, 1);
  gridGeometry.setAttribute('position', segmentPosAttr);
  gridGeometry.setAttribute('lineDistance', lineDistAttr);

  const wireframeMaterial = new THREE.LineDashedMaterial({
    color: 0x00aaff,
    dashSize: 0.3,
    gapSize: 0.2,
    scale: 1.0,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const rubberGridMesh = new THREE.LineSegments(gridGeometry, wireframeMaterial);
  scene.add(rubberGridMesh);

  // --- Particle Entity Markers Pool (Sphere + ArrowHelper) ---
  const sphereGeo = new THREE.SphereGeometry(0.5, 16, 16);
  const markerGroup = new THREE.Group();
  scene.add(markerGroup);

  const markerPool = [];

  function getParticleMarker(index) {
    if (index < markerPool.length) {
      markerPool[index].group.visible = true;
      return markerPool[index];
    }

    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0.8 });
    const sphere = new THREE.Mesh(sphereGeo, mat);
    group.add(sphere);

    const dir = new THREE.Vector3(1, 0, 0);
    const origin = new THREE.Vector3(0, 0, 0);
    const arrow = new THREE.ArrowHelper(dir, origin, 1.5, 0xffff00, 0.5, 0.3);
    group.add(arrow);

    markerGroup.add(group);

    const markerObj = { group, sphere, arrow, mat };
    markerPool.push(markerObj);
    return markerObj;
  }

  function hideUnusedMarkers(activeCount) {
    for (let i = activeCount; i < markerPool.length; i++) {
      markerPool[i].group.visible = false;
    }
  }

  const vPos = new THREE.Vector3();
  const dirToElectron = new THREE.Vector3();
  const totalDisplacement = new THREE.Vector3();
  const arrowDir = new THREE.Vector3();

  // Array to hold displaced 3D positions for all 32,768 lattice vertices
  const displacedVertices = Array.from({ length: totalCells }, () => new THREE.Vector3());

  function getMarkerColor(dnaVal) {
    const tpes = Tpes.from_u32(dnaVal);
    const struct = tpes.structure();
    if (struct === 1) return 0xff3366; // Positron aperture
    if (struct === 2) return 0x3399ff; // Electron aperture
    if (struct === 3) return 0xffaa00; // Proton / Neutron S3 core
    if (struct === 4) return 0x00ff88; // S4 Atom
    return 0xaa55ff;
  }

  function updateMeshState() {
    const pressurePtr = lattice.current_pressure_ptr();
    const dnaPtr = lattice.dna_ptr();
    const orientationPtr = lattice.orientation_ptr();

    const pressureArray = new Uint8Array(memory.buffer, pressurePtr, totalCells);
    const dnaArray = new Uint32Array(memory.buffer, dnaPtr, totalCells);
    const orientationArray = new Uint8Array(memory.buffer, orientationPtr, totalCells);

    const isSliced = chkSliceZ && chkSliceZ.checked;

    // Collect active Electrons for Gabriel's Horn Venturi displacement
    const activeElectrons = [];
    for (let i = 0; i < totalCells; i++) {
      if (dnaArray[i] === electronRaw) {
        const ex = i % 32;
        const ey = Math.floor(i / 32) % 32;
        const ez = Math.floor(i / 1024);
        const oIdx = orientationArray[i] % 26;
        const oOffset = NEIGHBORS_3D[oIdx];
        const oDir = new THREE.Vector3(oOffset[0], oOffset[1], oOffset[2]).normalize();
        activeElectrons.push({ pos: new THREE.Vector3(ex, ey, ez), dir: oDir });
      }
    }

    let markerIndex = 0;
    let totalActiveParticles = 0;

    // 1. Calculate displaced 3D positions for all 32,768 lattice nodes
    for (let i = 0; i < totalCells; i++) {
      const x = i % 32;
      const y = Math.floor(i / 32) % 32;
      const z = Math.floor(i / 1024);
      const dna = dnaArray[i];
      const orientIdx = orientationArray[i] % 26;

      vPos.set(x, y, z);
      totalDisplacement.set(0, 0, 0);

      if (spacetimeWarp && activeElectrons.length > 0) {
        for (let e = 0; e < activeElectrons.length; e++) {
          const electron = activeElectrons[e];
          dirToElectron.subVectors(electron.pos, vPos);
          const rawDist = dirToElectron.length();
          const r = Math.max(1.0, rawDist);

          if (r <= 8.0) {
            dirToElectron.normalize();
            // Scale warp magnitude by alignment cosine with Electron's orientation vector
            const dot = dirToElectron.dot(electron.dir);
            const alignmentFactor = Math.max(0.2, (dot + 1.0) / 2.0);

            const warpMag = 0.5 * (1.0 - r / 8.0) * (1.0 / r) * alignmentFactor;
            totalDisplacement.addScaledVector(dirToElectron, warpMag);
          }
        }

        if (totalDisplacement.length() > 1.5) {
          totalDisplacement.setLength(1.5);
        }
      }

      displacedVertices[i].copy(vPos).add(totalDisplacement);

      // Render non-Element Zero entities as distinct visual markers
      if (dna !== elemZeroRaw) {
        if (!isSliced || z <= 15) {
          totalActiveParticles++;
          const marker = getParticleMarker(markerIndex++);
          marker.group.position.copy(displacedVertices[i]);
          marker.mat.color.setHex(getMarkerColor(dna));

          const oOffset = NEIGHBORS_3D[orientIdx];
          arrowDir.set(oOffset[0], oOffset[1], oOffset[2]).normalize();
          marker.arrow.setDirection(arrowDir);
        }
      }
    }

    // 2. Populate line segment positions attribute from displaced vertices
    const posArr = segmentPosAttr.array;
    for (let s = 0; s < numSegments; s++) {
      const u = lineSegmentIndices[s * 2 + 0];
      const v = lineSegmentIndices[s * 2 + 1];

      const uPos = displacedVertices[u];
      const vPos2 = displacedVertices[v];

      posArr[s * 6 + 0] = uPos.x;
      posArr[s * 6 + 1] = uPos.y;
      posArr[s * 6 + 2] = uPos.z;

      posArr[s * 6 + 3] = vPos2.x;
      posArr[s * 6 + 4] = vPos2.y;
      posArr[s * 6 + 5] = vPos2.z;
    }

    segmentPosAttr.needsUpdate = true;
    hideUnusedMarkers(markerIndex);

    statSource.textContent = sourceBus.get().toString();
    statSink.textContent = sinkBus.get().toString();
    statActive.textContent = `${totalActiveParticles} / 32768`;
  }

  // Initial State Update
  updateMeshState();

  // Play / Pause / Step Controls
  btnPlayPause.addEventListener('click', () => {
    isPlaying = !isPlaying;
    btnPlayPause.textContent = isPlaying ? 'Pause' : 'Play';
  });

  btnStep.addEventListener('click', () => {
    lattice.step(sourceBus, sinkBus);
    updateMeshState();
  });

  if (btnWireframe) {
    btnWireframe.addEventListener('click', () => {
      wireframeMaterial.visible = !wireframeMaterial.visible;
    });
  }

  if (btnToggleWarp) {
    btnToggleWarp.addEventListener('click', () => {
      spacetimeWarp = !spacetimeWarp;
      btnToggleWarp.classList.toggle('secondary', !spacetimeWarp);
      updateMeshState();
    });
  }

  if (rangeComptonRate && comptonRateVal) {
    rangeComptonRate.addEventListener('input', (e) => {
      targetTicksPerSecond = parseInt(e.target.value, 10) || 60;
      comptonRateVal.textContent = targetTicksPerSecond;
    });
  }

  // Raycasting for Cell Selection and Element Injection
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const slicePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -15.5);
  const planePoint = new THREE.Vector3();

  window.addEventListener('click', (event) => {
    // Only raycast if click was on canvas
    if (event.target.tagName !== 'CANVAS') return;

    const rect = event.target.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const selectedTpes = get_tpes_by_id(selectedId);
    if (!selectedTpes) return;

    // 1. If chkSliceZ is checked, raycast against Z slice plane
    if (chkSliceZ && chkSliceZ.checked) {
      if (raycaster.ray.intersectPlane(slicePlane, planePoint)) {
        if (planePoint.x >= -0.5 && planePoint.x <= 31.5 && planePoint.y >= -0.5 && planePoint.y <= 31.5) {
          const gx = Math.min(31, Math.max(0, Math.round(planePoint.x)));
          const gy = Math.min(31, Math.max(0, Math.round(planePoint.y)));
          const gz = 15;

          const idx = D3Q27Lattice.get_index(gx, gy, gz);
          lattice.set_dna(idx, selectedTpes.as_u32());
          lattice.set_orientation(idx, 0);
          updateMeshState();
          return;
        }
      }
    }

    // 2. Raycast against invisible 32x32x32 target box
    const boxIntersects = raycaster.intersectObject(raycastBoxMesh);
    if (boxIntersects.length > 0) {
      const localPt = raycastBoxMesh.worldToLocal(boxIntersects[0].point.clone());
      const gx = Math.min(31, Math.max(0, Math.round(localPt.x + 15.5)));
      const gy = Math.min(31, Math.max(0, Math.round(localPt.y + 15.5)));
      const gz = Math.min(31, Math.max(0, Math.round(localPt.z + 15.5)));

      const idx = D3Q27Lattice.get_index(gx, gy, gz);
      lattice.set_dna(idx, selectedTpes.as_u32());
      lattice.set_orientation(idx, 0);
      updateMeshState();
    }
  });

  // Resize Handler
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Render Loop with DeltaTime Compton Tick Accumulator and Continuous Dash Flow Animation
  let lastTime = performance.now();
  let timeAccumulator = 0;

  function animate(now = performance.now()) {
    requestAnimationFrame(animate);

    const delta = now - lastTime;
    lastTime = now;

    if (isPlaying) {
      timeAccumulator += delta;
      const stepInterval = 1000 / targetTicksPerSecond;

      while (timeAccumulator >= stepInterval) {
        lattice.step(sourceBus, sinkBus);
        timeAccumulator -= stepInterval;
      }

      // Continuously scroll dashed lines to simulate continuous fluid ocean flow
      wireframeMaterial.dashOffset -= 0.05;
    } else {
      timeAccumulator = 0;
    }

    updateMeshState();

    renderer.render(scene, camera);
  }

  animate();
}

run();
