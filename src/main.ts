import * as THREE from 'three';
import initWasm, { Engine, get_manifest_json } from '../pkg/vast5.js';

interface ManifestItem {
  name: string;
  symbol: string;
  tier: number;
  positrons: number;
  electrons: number;
  structure: number;
  dna: number;
}

const GRID_SIZE = 32;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE * GRID_SIZE;

let engine: Engine;
let wasmMemory: WebAssembly.Memory;
let manifestItems: ManifestItem[] = [];
let selectedManifestItem: ManifestItem | null = null;

// Three.js elements
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let instancedMesh: THREE.InstancedMesh;
let boundingBoxMesh: THREE.Mesh;
let raycaster: THREE.Raycaster;
let mouse: THREE.Vector2;

// Simulation state
let isRunning = false;
let tickCount = 0;
let lastStepTime = 0;
const STEP_INTERVAL_MS = 50; // 20 Ticks/sec

async function main() {
  // Initialize WASM
  const wasm = await initWasm();
  wasmMemory = wasm.memory;
  engine = new Engine();

  // Load Manifest JSON
  const jsonStr = get_manifest_json();
  manifestItems = JSON.parse(jsonStr);
  selectedManifestItem = manifestItems.find(i => i.name === 'Carbon-12') || manifestItems[0];

  // Setup UI
  setupManifestUI();
  setupHUDControls();

  // Setup Three.js
  setupThreeJS();

  // Inject initial Carbon-12 at center (16, 16, 16)
  if (selectedManifestItem) {
    engine.set_cell_dna(16, 16, 16, selectedManifestItem.dna);
  }

  // Start render loop
  requestAnimationFrame(animate);
}

function setupManifestUI() {
  const container = document.getElementById('manifest-list');
  if (!container) return;
  container.innerHTML = '';

  manifestItems.forEach(item => {
    const card = document.createElement('div');
    card.className = `manifest-card ${item.name === selectedManifestItem?.name ? 'selected' : ''}`;

    card.innerHTML = `
      <div class="manifest-symbol">${item.symbol}</div>
      <div class="manifest-info">
        <div class="manifest-name">${item.name}</div>
        <div class="manifest-tpes">T${item.tier} : P${item.positrons} : E${item.electrons} : S${item.structure}</div>
      </div>
      ${item.name === selectedManifestItem?.name ? '<span class="selected-indicator">ACTIVE</span>' : ''}
    `;

    card.addEventListener('click', () => {
      selectedManifestItem = item;
      document.querySelectorAll('.manifest-card').forEach(c => c.classList.remove('selected'));
      document.querySelectorAll('.selected-indicator').forEach(i => i.remove());
      card.classList.add('selected');
      const badge = document.createElement('span');
      badge.className = 'selected-indicator';
      badge.textContent = 'ACTIVE';
      card.appendChild(badge);

      const selVal = document.getElementById('selected-element-val');
      if (selVal) selVal.textContent = item.name;
    });

    container.appendChild(card);
  });
}

function setupHUDControls() {
  const btnToggle = document.getElementById('btn-toggle');
  const btnStep = document.getElementById('btn-step');
  const btnReset = document.getElementById('btn-reset');

  if (btnToggle) {
    btnToggle.addEventListener('click', () => {
      isRunning = !isRunning;
      btnToggle.textContent = isRunning ? 'Pause' : 'Play';
      btnToggle.classList.toggle('active', isRunning);
    });
  }

  if (btnStep) {
    btnStep.addEventListener('click', () => {
      stepSimulation();
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      isRunning = false;
      tickCount = 0;
      if (btnToggle) {
        btnToggle.textContent = 'Play';
        btnToggle.classList.remove('active');
      }
      engine.reset();
      updateSceneVisuals();
      updateHUD();
    });
  }
}

function setupThreeJS() {
  const container = document.getElementById('viewport-container');
  const canvas = document.getElementById('canvas3d') as HTMLCanvasElement;
  if (!container || !canvas) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080a0f);

  camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  // Position camera to view 32x32x32 lattice centered at origin
  camera.position.set(48, 48, 64);
  camera.lookAt(0, 0, 0);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 1.2);
  dirLight1.position.set(50, 80, 50);
  scene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0xf87171, 0.6);
  dirLight2.position.set(-50, -30, -50);
  scene.add(dirLight2);

  // Bounding box for raycasting & visual framing (32x32x32 centered at 0,0,0)
  const boxGeo = new THREE.BoxGeometry(GRID_SIZE, GRID_SIZE, GRID_SIZE);
  const boxWire = new THREE.WireframeGeometry(boxGeo);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.5 });
  const boundingWireframe = new THREE.LineSegments(boxWire, lineMat);
  scene.add(boundingWireframe);

  // Invisible mesh for raycast intersection
  const boxMat = new THREE.MeshBasicMaterial({ visible: false });
  boundingBoxMesh = new THREE.Mesh(boxGeo, boxMat);
  scene.add(boundingBoxMesh);

  // InstancedMesh for voxels (max 32,768 instances)
  const voxelGeo = new THREE.BoxGeometry(0.85, 0.85, 0.85);
  const voxelMat = new THREE.MeshStandardMaterial({
    roughness: 0.2,
    metalness: 0.8,
    transparent: true,
    opacity: 0.9,
  });

  instancedMesh = new THREE.InstancedMesh(voxelGeo, voxelMat, TOTAL_CELLS);
  instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(instancedMesh);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Raycaster & Mouse setup
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Mouse interaction for rotation & injection
  let isDragging = false;
  let prevMousePos = { x: 0, y: 0 };

  canvas.addEventListener('mousedown', (e) => {
    isDragging = false;
    prevMousePos = { x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener('mousemove', (e) => {
    const dx = e.clientX - prevMousePos.x;
    const dy = e.clientY - prevMousePos.y;
    if (e.buttons === 1) { // Left click drag rotates camera
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        isDragging = true;
      }
      rotateCamera(dx, dy);
      prevMousePos = { x: e.clientX, y: e.clientY };
    }
  });

  canvas.addEventListener('click', (e) => {
    if (isDragging) return; // Don't inject if user was dragging camera

    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(boundingBoxMesh);

    if (intersects.length > 0) {
      const point = intersects[0].point;
      // Convert 3D world coordinates [-16..16] to lattice grid indices [0..31]
      const gx = Math.min(Math.max(Math.floor(point.x + GRID_SIZE / 2), 0), GRID_SIZE - 1);
      const gy = Math.min(Math.max(Math.floor(point.y + GRID_SIZE / 2), 0), GRID_SIZE - 1);
      const gz = Math.min(Math.max(Math.floor(point.z + GRID_SIZE / 2), 0), GRID_SIZE - 1);

      if (selectedManifestItem) {
        engine.set_cell_dna(gx, gy, gz, selectedManifestItem.dna);
        showInjectionTooltip(e.clientX, e.clientY, `Injected ${selectedManifestItem.name} @ [${gx}, ${gy}, ${gz}]`);
        updateSceneVisuals();
        updateHUD();
      }
    }
  });

  window.addEventListener('resize', () => {
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
}

function rotateCamera(dx: number, dy: number) {
  const radius = camera.position.length();
  let theta = Math.atan2(camera.position.x, camera.position.z);
  let phi = Math.acos(Math.min(Math.max(camera.position.y / radius, -1), 1));

  theta -= dx * 0.008;
  phi -= dy * 0.008;
  phi = Math.min(Math.max(phi, 0.1), Math.PI - 0.1);

  camera.position.x = radius * Math.sin(phi) * Math.sin(theta);
  camera.position.y = radius * Math.cos(phi);
  camera.position.z = radius * Math.sin(phi) * Math.cos(theta);
  camera.lookAt(0, 0, 0);
}

function showInjectionTooltip(x: number, y: number, text: string) {
  const tooltip = document.getElementById('click-tooltip');
  if (!tooltip) return;
  tooltip.textContent = text;
  tooltip.style.left = `${x + 12}px`;
  tooltip.style.top = `${y + 12}px`;
  tooltip.style.display = 'block';

  setTimeout(() => {
    tooltip.style.display = 'none';
  }, 1800);
}

function stepSimulation() {
  engine.step();
  tickCount++;
  updateSceneVisuals();
  updateHUD();
}

function updateSceneVisuals() {
  const pressurePtr = engine.get_pressure_ptr();
  const dnaPtr = engine.get_dna_ptr();

  const pressureArray = new Uint8Array(wasmMemory.buffer, pressurePtr, TOTAL_CELLS);
  const dnaArray = new Uint32Array(wasmMemory.buffer, dnaPtr, TOTAL_CELLS);

  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();

  let activeCount = 0;

  for (let z = 0; z < GRID_SIZE; z++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const idx = x + y * GRID_SIZE + z * GRID_SIZE * GRID_SIZE;
        const dna = dnaArray[idx];
        const pressure = pressureArray[idx];

        if (dna === 0 && pressure === 0) {
          // Scale to zero to hide inactive cells
          matrix.makeScale(0, 0, 0);
          instancedMesh.setMatrixAt(idx, matrix);
          continue;
        }

        activeCount++;

        // Map lattice indices [0..31] to 32x32x32 world space centered at 0,0,0
        const wx = x - GRID_SIZE / 2 + 0.5;
        const wy = y - GRID_SIZE / 2 + 0.5;
        const wz = z - GRID_SIZE / 2 + 0.5;

        matrix.makeTranslation(wx, wy, wz);
        instancedMesh.setMatrixAt(idx, matrix);

        // Color coding based on TPES Structure & Pressure
        if (dna !== 0) {
          const structure = dna & 0x0f;
          if (structure === 1) {
            color.setHex(0x4ade80); // Positron: Green
          } else if (structure === 2) {
            color.setHex(0xf87171); // Electron: Red
          } else if (structure === 3) {
            color.setHex(0xfacc15); // Proton/Neutron Core: Yellow
          } else {
            color.setHex(0x38bdf8); // Whole Atom S4: Cyan
          }
        } else {
          // Pure pressure wave flux (Z9 modulo 9)
          const hue = (pressure / 9.0) * 0.7; // Color spectrum gradient
          color.setHSL(hue, 0.9, 0.5);
        }

        instancedMesh.setColorAt(idx, color);
      }
    }
  }

  instancedMesh.instanceMatrix.needsUpdate = true;
  if (instancedMesh.instanceColor) {
    instancedMesh.instanceColor.needsUpdate = true;
  }

  const activeVal = document.getElementById('active-voxels-val');
  if (activeVal) activeVal.textContent = activeCount.toLocaleString();
}

function updateHUD() {
  const sourceVal = document.getElementById('source-bus-val');
  const sinkVal = document.getElementById('sink-bus-val');
  const tickVal = document.getElementById('tick-val');

  if (sourceVal) sourceVal.textContent = engine.get_source_bus().toString();
  if (sinkVal) sinkVal.textContent = engine.get_sink_bus().toString();
  if (tickVal) tickVal.textContent = tickCount.toString();
}

function animate(time: number) {
  requestAnimationFrame(animate);

  if (isRunning && time - lastStepTime >= STEP_INTERVAL_MS) {
    stepSimulation();
    lastStepTime = time;
  }

  renderer.render(scene, camera);
}

main().catch(err => {
  console.error('Failed to initialize V.A.S.T. 5 application:', err);
});
