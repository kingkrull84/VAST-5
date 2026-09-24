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
  const electronRaw = get_tpes_by_id(1).as_u32();

  // State
  let selectedId = 100; // Default Proton
  let isPlaying = false;
  let vectorMode = false;
  let spacetimeWarp = true;
  let emSpectralLens = false;
  let targetTicksPerSecond = 60;

  // DOM Elements
  const container = document.getElementById('canvas-container');
  const btnPlayPause = document.getElementById('btn-play-pause');
  const btnStep = document.getElementById('btn-step');
  const btnWireframe = document.getElementById('btn-wireframe');
  const btnVectorMode = document.getElementById('btn-vector-mode');
  const btnToggleWarp = document.getElementById('btn-toggle-warp');
  const btnEmLens = document.getElementById('btn-em-lens');
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
  // Guardrail 3: transparent, depthWrite: false, AdditiveBlending to prevent WebGL depth-sorting artifacts
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.3,
    metalness: 0.1,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const instancedMesh = new THREE.InstancedMesh(geometry, material, totalCells);

  // InstancedMesh Setup for Vector Flow Cones
  const coneGeometry = new THREE.ConeGeometry(0.2, 0.8, 4);
  coneGeometry.translate(0, 0.4, 0);
  const vectorMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.3,
    metalness: 0.1,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const vectorInstancedMesh = new THREE.InstancedMesh(coneGeometry, vectorMaterial, totalCells);

  // ADD INSTANCE MESHES TO SCENE
  scene.add(instancedMesh);
  scene.add(vectorInstancedMesh);

  const dummy = new THREE.Object3D();
  const vectorDummy = new THREE.Object3D();
  const color = new THREE.Color();
  const upVector = new THREE.Vector3(0, 1, 0);
  const flowVector = new THREE.Vector3();
  const cellPos = new THREE.Vector3();
  const totalDisplacement = new THREE.Vector3();
  const dirToElectron = new THREE.Vector3();

  // Helper colors for DNA / pressure visualization
  function getCellColor(dnaVal, pressure, gradMag = 0) {
    if (dnaVal === elemZeroRaw) {
      if (emSpectralLens) {
        // EM Spectrum Mapping based on flow acceleration |∇P|:
        // gradMag 0: Invisible (0.0)
        // low (<1.5): Radio/Infrared (Dark Red)
        // mid (1.5-3.5): Optical (Yellow/Green)
        // high (3.5-5.5): UV/X-Ray (Blue/Violet)
        // max (>5.5): Event Horizon Gamma (Magenta)
        const opacityScale = 0.15; // Prevent additive blow-out

        if (gradMag < 0.1) {
          color.setHex(0x000000); // Static clear
        } else if (gradMag < 1.5) {
          color.setRGB(0.6 * opacityScale, 0.05 * opacityScale, 0.05 * opacityScale); // Infrared
        } else if (gradMag < 3.5) {
          color.setRGB(0.7 * opacityScale, 0.8 * opacityScale, 0.1 * opacityScale); // Optical
        } else if (gradMag < 5.5) {
          color.setRGB(0.3 * opacityScale, 0.2 * opacityScale, 0.9 * opacityScale); // UV/Violet
        } else {
          color.setRGB(1.0 * opacityScale, 0.1 * opacityScale, 0.9 * opacityScale); // Gamma Magenta
        }
        return color;
      } else {
        // Default pressure gradient from dark blue (0) to bright cyan/white (8)
        const t = pressure / 8.0;
        return color.setHSL(0.55 + t * 0.1, 0.8, 0.2 + t * 0.6);
      }
    }
    const tpes = Tpes.from_u32(dnaVal);
    const struct = tpes.structure();
    if (struct === 1) return color.setHex(0xff3366); // Positron aperture
    if (struct === 2) return color.setHex(0x3399ff); // Electron aperture
    if (struct === 3) return color.setHex(0xffaa00); // Proton / Neutron S3 core
    if (struct === 4) return color.setHex(0x00ff88); // S4 Atom
    return color.setHex(0xaa55ff);
  }

  function getVectorColor(p) {
    if (p > 1) return color.setHex(0xff5522);
    if (p < 1) return color.setHex(0x00aaff);
    return color.setHex(0x00ff88);
  }

  function getP(x, y, z, pressureArray) {
    if (x < 0 || x >= 32 || y < 0 || y >= 32 || z < 0 || z >= 32) {
      return 1;
    }
    return pressureArray[x + y * 32 + z * 1024];
  }

  function updateMeshState() {
    const pressurePtr = lattice.current_pressure_ptr();
    const dnaPtr = lattice.dna_ptr();

    const pressureArray = new Uint8Array(memory.buffer, pressurePtr, totalCells);
    const dnaArray = new Uint32Array(memory.buffer, dnaPtr, totalCells);

    let activeCount = 0;

    const isSliced = chkSliceZ && chkSliceZ.checked;

    // Collect all active Electron positions for Gravity Superposition
    const electronPositions = [];
    for (let i = 0; i < totalCells; i++) {
      if (dnaArray[i] === electronRaw) {
        electronPositions.push(new THREE.Vector3(i % 32, Math.floor(i / 32) % 32, Math.floor(i / 1024)));
      }
    }

    for (let i = 0; i < totalCells; i++) {
      const p = pressureArray[i];
      const dna = dnaArray[i];

      const x = i % 32;
      const y = Math.floor(i / 32) % 32;
      const z = Math.floor(i / 1024);

      cellPos.set(x, y, z);
      totalDisplacement.set(0, 0, 0);

      if (spacetimeWarp && dna === elemZeroRaw && electronPositions.length > 0) {
        let maxScaleStretch = 1.0;

        for (let e = 0; e < electronPositions.length; e++) {
          const ePos = electronPositions[e];
          dirToElectron.subVectors(ePos, cellPos);
          const rawDist = dirToElectron.length();

          // Guardrail 2: Clamp distance r to minimum of 1.0 before dividing to prevent NaN
          const r = Math.max(1.0, rawDist);

          if (r <= 8.0) {
            dirToElectron.normalize();
            // Venturi asymptotic warp magnitude k = 0.5
            const warpMag = 0.5 * (1.0 - r / 8.0) * (1.0 / r);
            totalDisplacement.addScaledVector(dirToElectron, warpMag);

            const stretchFactor = 1.0 + (1.0 - r / 8.0) * 0.8;
            if (stretchFactor > maxScaleStretch) {
              maxScaleStretch = stretchFactor;
            }
          }
        }

        // Clamp combined displacement to prevent grid cells flying out of bounds
        if (totalDisplacement.length() > 1.5) {
          totalDisplacement.setLength(1.5);
        }

        dummy.position.copy(cellPos).add(totalDisplacement);
        vectorDummy.position.copy(dummy.position);
      } else {
        dummy.position.set(x, y, z);
        vectorDummy.position.set(x, y, z);
      }

      if (vectorMode) {
        if (dna !== elemZeroRaw) {
          vectorDummy.scale.set(0, 0, 0);
          if (isSliced && z > 15) {
            dummy.scale.set(0, 0, 0);
          } else {
            dummy.scale.set(1, 1, 1);
            activeCount++;
          }
        } else {
          dummy.scale.set(0, 0, 0);
          if (isSliced && z > 15) {
            vectorDummy.scale.set(0, 0, 0);
          } else {
            const flowX = getP(x - 1, y, z, pressureArray) - getP(x + 1, y, z, pressureArray);
            const flowY = getP(x, y - 1, z, pressureArray) - getP(x, y + 1, z, pressureArray);
            const flowZ = getP(x, y, z - 1, pressureArray) - getP(x, y, z + 1, pressureArray);

            flowVector.set(flowX, flowY, flowZ);
            const flowMag = flowVector.length();

            if (flowMag > 0) {
              flowVector.divideScalar(flowMag); // Normalize flow direction
              vectorDummy.quaternion.setFromUnitVectors(upVector, flowVector);
              const s = Math.min(1.0, flowMag * 0.3);
              vectorDummy.scale.set(s, s, s);
              activeCount++;
            } else {
              vectorDummy.scale.set(0, 0, 0);
            }
          }
        }
      } else {
        vectorDummy.scale.set(0, 0, 0);
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
      }

      // Calculate local pressure gradient magnitude |∇P|
      const flowX = getP(x - 1, y, z, pressureArray) - getP(x + 1, y, z, pressureArray);
      const flowY = getP(x, y - 1, z, pressureArray) - getP(x, y + 1, z, pressureArray);
      const flowZ = getP(x, y, z - 1, pressureArray) - getP(x, y, z + 1, pressureArray);
      const gradMag = Math.sqrt(flowX * flowX + flowY * flowY + flowZ * flowZ);

      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      instancedMesh.setColorAt(i, getCellColor(dna, p, gradMag));

      vectorDummy.updateMatrix();
      vectorInstancedMesh.setMatrixAt(i, vectorDummy.matrix);
      if (dna === elemZeroRaw) {
        vectorInstancedMesh.setColorAt(i, getVectorColor(p));
      } else {
        vectorInstancedMesh.setColorAt(i, getCellColor(dna, p, gradMag));
      }
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;

    vectorInstancedMesh.instanceMatrix.needsUpdate = true;
    if (vectorInstancedMesh.instanceColor) vectorInstancedMesh.instanceColor.needsUpdate = true;

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
    vectorMaterial.wireframe = !vectorMaterial.wireframe;
  });

  if (btnVectorMode) {
    btnVectorMode.addEventListener('click', () => {
      vectorMode = !vectorMode;
      updateMeshState();
    });
  }

  if (btnToggleWarp) {
    btnToggleWarp.addEventListener('click', () => {
      spacetimeWarp = !spacetimeWarp;
      btnToggleWarp.classList.toggle('secondary', !spacetimeWarp);
      updateMeshState();
    });
  }

  if (btnEmLens) {
    btnEmLens.addEventListener('click', () => {
      emSpectralLens = !emSpectralLens;
      btnEmLens.classList.toggle('secondary', !emSpectralLens);
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
  const tempMatrix = new THREE.Matrix4();
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

    // 1. Raycast against instancedMesh and vectorInstancedMesh
    const instanceIntersects = raycaster.intersectObjects([instancedMesh, vectorInstancedMesh]);
    for (let i = 0; i < instanceIntersects.length; i++) {
      const hit = instanceIntersects[i];
      if (hit.instanceId !== undefined) {
        hit.object.getMatrixAt(hit.instanceId, tempMatrix);
        if (tempMatrix.getMaxScaleOnAxis() > 0) {
          lattice.set_dna(hit.instanceId, selectedTpes.as_u32());
          updateMeshState();
          return;
        }
      }
    }

    // 2. If no visible instance hit AND chkSliceZ is checked, raycast against Z slice plane
    if (chkSliceZ && chkSliceZ.checked) {
      if (raycaster.ray.intersectPlane(slicePlane, planePoint)) {
        if (planePoint.x >= -0.5 && planePoint.x <= 31.5 && planePoint.y >= -0.5 && planePoint.y <= 31.5) {
          const gx = Math.min(31, Math.max(0, Math.round(planePoint.x)));
          const gy = Math.min(31, Math.max(0, Math.round(planePoint.y)));
          const gz = 15;

          const idx = D3Q27Lattice.get_index(gx, gy, gz);
          lattice.set_dna(idx, selectedTpes.as_u32());
          updateMeshState();
          return;
        }
      }
    }

    // 3. Fallback to raycastBoxMesh
    const boxIntersects = raycaster.intersectObject(raycastBoxMesh);
    if (boxIntersects.length > 0) {
      const localPt = raycastBoxMesh.worldToLocal(boxIntersects[0].point.clone());
      const gx = Math.min(31, Math.max(0, Math.round(localPt.x + 15.5)));
      const gy = Math.min(31, Math.max(0, Math.round(localPt.y + 15.5)));
      const gz = Math.min(31, Math.max(0, Math.round(localPt.z + 15.5)));

      const idx = D3Q27Lattice.get_index(gx, gy, gz);
      lattice.set_dna(idx, selectedTpes.as_u32());
      updateMeshState();
    }
  });

  // Resize Handler
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Render Loop with DeltaTime Compton Tick Accumulator (Guardrail 4)
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
    } else {
      timeAccumulator = 0;
    }

    updateMeshState();

    renderer.render(scene, camera);
  }

  animate();
}

run();
