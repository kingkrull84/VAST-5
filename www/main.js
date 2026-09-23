import init, { Tpes, get_tpes_by_id, GlobalSourceBus, GlobalSinkBus, D3Q27Lattice } from 'vast_5';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const MANIFEST_ITEMS = [
  { id: 0, name: 'Positron', desc: 'T1 : P1 : E0 : S1' },
  { id: 1, name: 'Electron', desc: 'T1 : P0 : E1 : S2' },
  { id: 2, name: 'Element Zero', desc: 'T0 : P1 : E1 : S0' },
  { id: 100, name: 'Proton', desc: 'T2 : P2 : E1 : S3' },
  { id: 101, name: 'Neutron', desc: 'T2 : P2 : E2 : S3' },
  { id: 1001, name: 'Hydrogen-1', desc: 'T2 : P2 : E2 : S4' },
  { id: 1002, name: 'Helium-4', desc: 'T2 : P8 : E8 : S4' },
  { id: 1003, name: 'Lithium-7', desc: 'T2 : P14 : E14 : S4' },
  { id: 1004, name: 'Beryllium-9', desc: 'T2 : P18 : E18 : S4' },
  { id: 1005, name: 'Boron-11', desc: 'T2 : P22 : E22 : S4' },
  { id: 1006, name: 'Carbon-12', desc: 'T2 : P24 : E24 : S4' },
  { id: 1007, name: 'Nitrogen-14', desc: 'T2 : P28 : E28 : S4' },
  { id: 1008, name: 'Oxygen-16', desc: 'T2 : P32 : E32 : S4' },
  { id: 1009, name: 'Fluorine-19', desc: 'T2 : P38 : E38 : S4' },
  { id: 1010, name: 'Neon-20', desc: 'T2 : P40 : E40 : S4' }
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

  // State
  let selectedId = 100; // Default Proton
  let isPlaying = false;

  // DOM Elements
  const container = document.getElementById('canvas-container');
  const btnPlayPause = document.getElementById('btn-play-pause');
  const btnStep = document.getElementById('btn-step');
  const btnWireframe = document.getElementById('btn-wireframe');
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
  selectedLabel.textContent = `Proton (ID 100)`;

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

  // InstancedMesh Setup for 32x32x32 Grid
  const geometry = new THREE.BoxGeometry(0.85, 0.85, 0.85);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.1 });
  const instancedMesh = new THREE.InstancedMesh(geometry, material, totalCells);

  // ADD INSTANCE MESH TO SCENE
  scene.add(instancedMesh);

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // Helper colors for DNA / pressure visualization
  function getCellColor(dnaVal, pressure) {
    if (dnaVal === elemZeroRaw) {
      // Color pressure gradient from dark blue (0) to bright cyan/white (8)
      const t = pressure / 8.0;
      return color.setHSL(0.55 + t * 0.1, 0.8, 0.2 + t * 0.6);
    }
    const tpes = Tpes.from_u32(dnaVal);
    const struct = tpes.structure();
    if (struct === 1) return color.setHex(0xff3366); // Positron aperture
    if (struct === 2) return color.setHex(0x3399ff); // Electron aperture
    if (struct === 3) return color.setHex(0xffaa00); // Proton / Neutron S3 core
    if (struct === 4) return color.setHex(0x00ff88); // S4 Atom
    return color.setHex(0xaa55ff);
  }

  function updateMeshState() {
    const pressurePtr = lattice.current_pressure_ptr();
    const dnaPtr = lattice.dna_ptr();

    const pressureArray = new Uint8Array(memory.buffer, pressurePtr, totalCells);
    const dnaArray = new Uint32Array(memory.buffer, dnaPtr, totalCells);

    let activeCount = 0;

    const isSliced = chkSliceZ && chkSliceZ.checked;

    for (let i = 0; i < totalCells; i++) {
      const p = pressureArray[i];
      const dna = dnaArray[i];

      const x = i % 32;
      const y = Math.floor(i / 32) % 32;
      const z = Math.floor(i / 1024);

      dummy.position.set(x, y, z);

      if (isSliced && z > 15) {
        dummy.scale.set(0, 0, 0);
      } else if (dna !== elemZeroRaw) {
        dummy.scale.set(1, 1, 1);
        activeCount++;
      } else if (p === 1) {
        dummy.scale.set(0, 0, 0);
      } else {
        const intensity = Math.min(1.0, Math.abs(p - 1) * 0.33);
        dummy.scale.set(intensity, intensity, intensity);
        if (intensity > 0) {
          activeCount++;
        }
      }

      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      instancedMesh.setColorAt(i, getCellColor(dna, p));
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;

    statSource.textContent = sourceBus.get().toString();
    statSink.textContent = sinkBus.get().toString();
    statActive.textContent = `${activeCount} / 32768`;
  }

  // Pre-inject a center Proton atom so cells are active and rendered immediately
  const centerIdx = D3Q27Lattice.get_index(16, 16, 16);
  const protonTpes = get_tpes_by_id(100);
  if (protonTpes) {
    lattice.set_dna(centerIdx, protonTpes.as_u32());
  }

  // Initial Mesh State Update
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

  btnWireframe.addEventListener('click', () => {
    material.wireframe = !material.wireframe;
  });

  // Raycasting for Cell Selection and Element Injection
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  window.addEventListener('click', (event) => {
    // Only raycast if click was on canvas
    if (event.target.tagName !== 'CANVAS') return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Try raycasting instanced mesh first
    const instIntersects = raycaster.intersectObject(instancedMesh);
    if (instIntersects.length > 0 && instIntersects[0].instanceId !== undefined) {
      const selectedTpes = get_tpes_by_id(selectedId);
      if (selectedTpes) {
        lattice.set_dna(instIntersects[0].instanceId, selectedTpes.as_u32());
        updateMeshState();
        return;
      }
    }

    // Otherwise raycast the bounding box volume to get closest integer grid [x, y, z]
    const boxIntersects = raycaster.intersectObject(raycastBoxMesh);
    if (boxIntersects.length > 0) {
      const pt = boxIntersects[0].point;
      const gx = Math.min(31, Math.max(0, Math.round(pt.x)));
      const gy = Math.min(31, Math.max(0, Math.round(pt.y)));
      const gz = Math.min(31, Math.max(0, Math.round(pt.z)));

      const idx = D3Q27Lattice.get_index(gx, gy, gz);
      const selectedTpes = get_tpes_by_id(selectedId);
      if (selectedTpes) {
        lattice.set_dna(idx, selectedTpes.as_u32());
        updateMeshState();
      }
    }
  });

  // Resize Handler
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Render Loop
  function animate() {
    requestAnimationFrame(animate);

    if (isPlaying) {
      lattice.step(sourceBus, sinkBus);
    }

    updateMeshState();

    renderer.render(scene, camera);
  }

  animate();
}

run();
