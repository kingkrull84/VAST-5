//! D3Q27 Lattice & Physics Engine Loop (Compton Tick)

use crate::barrier::DimensionalBarrier;
use crate::tpes::Tpes;
use wasm_bindgen::prelude::*;

pub const GRID_SIZE: usize = 32;
pub const TOTAL_CELLS: usize = GRID_SIZE * GRID_SIZE * GRID_SIZE; // 32,768

// D3Q27 27 directional vectors
pub const D3Q27_OFFSETS: [(i32, i32, i32); 27] = [
    (0, 0, 0),
    (1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1),
    (1, 1, 0), (-1, 1, 0), (1, -1, 0), (-1, -1, 0),
    (1, 0, 1), (-1, 0, 1), (1, 0, -1), (-1, 0, -1),
    (0, 1, 1), (0, -1, 1), (0, 1, -1), (0, -1, -1),
    (1, 1, 1), (-1, 1, 1), (1, -1, 1), (-1, -1, 1),
    (1, 1, -1), (-1, 1, -1), (1, -1, -1), (-1, -1, -1),
];

#[wasm_bindgen]
pub struct Engine {
    barrier: DimensionalBarrier,
    pressure: Vec<u8>, // Local Z9 modulo 9 integer pressure (0..8)
    dna: Vec<u32>,      // 32-bit TPES DNA for each voxel
    temp_pressure: Vec<i32>,
}

#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            barrier: DimensionalBarrier::new(),
            pressure: vec![0; TOTAL_CELLS],
            dna: vec![0; TOTAL_CELLS],
            temp_pressure: vec![0; TOTAL_CELLS],
        }
    }

    pub fn get_pressure_ptr(&self) -> *const u8 {
        self.pressure.as_ptr()
    }

    pub fn get_dna_ptr(&self) -> *const u32 {
        self.dna.as_ptr()
    }

    pub fn get_source_bus(&self) -> u64 {
        self.barrier.global_source_bus
    }

    pub fn get_sink_bus(&self) -> u64 {
        self.barrier.global_sink_bus
    }

    pub fn set_cell_dna(&mut self, x: usize, y: usize, z: usize, dna_val: u32) {
        if x < GRID_SIZE && y < GRID_SIZE && z < GRID_SIZE {
            let idx = Self::get_index(x, y, z);
            self.dna[idx] = dna_val;
        }
    }

    pub fn get_cell_dna(&self, x: usize, y: usize, z: usize) -> u32 {
        if x < GRID_SIZE && y < GRID_SIZE && z < GRID_SIZE {
            let idx = Self::get_index(x, y, z);
            self.dna[idx]
        } else {
            0
        }
    }

    pub fn get_cell_pressure(&self, x: usize, y: usize, z: usize) -> u8 {
        if x < GRID_SIZE && y < GRID_SIZE && z < GRID_SIZE {
            let idx = Self::get_index(x, y, z);
            self.pressure[idx]
        } else {
            0
        }
    }

    pub fn set_cell_pressure(&mut self, x: usize, y: usize, z: usize, press: u8) {
        if x < GRID_SIZE && y < GRID_SIZE && z < GRID_SIZE {
            let idx = Self::get_index(x, y, z);
            self.pressure[idx] = press % 9;
        }
    }

    pub fn reset(&mut self) {
        self.barrier.reset();
        self.pressure.fill(0);
        self.dna.fill(0);
    }

    /// Performs one Compton Tick physics iteration
    pub fn step(&mut self) {
        // Phase 1: Dimensional Barrier Injection
        self.phase1_barrier_injection();

        // Phase 2: D3Q27 Hydrodynamic Advection
        self.phase2_advection();

        // Phase 3: Tensegrity Boundary Evaluation
        self.phase3_tensegrity_eval();
    }

    fn phase1_barrier_injection(&mut self) {
        for idx in 0..TOTAL_CELLS {
            let packed_dna = self.dna[idx];
            if packed_dna != 0 {
                let tpes = Tpes::unpack(packed_dna);
                let p = tpes.positrons as u64;
                let e = tpes.electrons as u64;

                if p > 0 {
                    self.barrier.inject_source(p);
                    let current = self.pressure[idx] as u64;
                    self.pressure[idx] = ((current + p) % 9) as u8;
                }

                if e > 0 {
                    self.barrier.vent_sink(e);
                    let current = self.pressure[idx] as u64;
                    // Modulo 9 subtraction
                    let p_val = (current + 9 - (e % 9)) % 9;
                    self.pressure[idx] = p_val as u8;
                }
            }
        }
    }

    fn phase2_advection(&mut self) {
        // Copy current pressure into temp signed buffer
        for i in 0..TOTAL_CELLS {
            self.temp_pressure[i] = self.pressure[i] as i32;
        }

        // Advect integer units modulo 9 to neighbors along steepest gradients
        for z in 0..GRID_SIZE {
            for y in 0..GRID_SIZE {
                for x in 0..GRID_SIZE {
                    let idx = Self::get_index(x, y, z);
                    let p_curr = self.temp_pressure[idx];

                    if p_curr <= 0 {
                        continue;
                    }

                    // Find neighbor with lowest pressure
                    let mut min_p = p_curr;
                    let mut min_idx = idx;

                    for (dx, dy, dz) in D3Q27_OFFSETS.iter().skip(1) {
                        let nx = (x as i32 + dx).rem_euclid(GRID_SIZE as i32) as usize;
                        let ny = (y as i32 + dy).rem_euclid(GRID_SIZE as i32) as usize;
                        let nz = (z as i32 + dz).rem_euclid(GRID_SIZE as i32) as usize;
                        let n_idx = Self::get_index(nx, ny, nz);
                        let n_p = self.temp_pressure[n_idx];

                        if n_p < min_p {
                            min_p = n_p;
                            min_idx = n_idx;
                        }
                    }

                    if min_idx != idx && (p_curr - min_p) >= 2 {
                        // Transfer 1 integer fluid pressure unit down gradient
                        self.temp_pressure[idx] -= 1;
                        self.temp_pressure[min_idx] += 1;
                    }
                }
            }
        }

        // Re-apply modulo 9 to pressure array
        for i in 0..TOTAL_CELLS {
            let p = self.temp_pressure[i].rem_euclid(9) as u8;
            self.pressure[i] = p;
        }
    }

    fn phase3_tensegrity_eval(&mut self) {
        let positron_dna = Tpes::new(1, 1, 0, 1).pack();
        let electron_dna = Tpes::new(1, 0, 1, 2).pack();

        let mut newly_shattered: Vec<(usize, u16, u16)> = Vec::new();

        for z in 0..GRID_SIZE {
            for y in 0..GRID_SIZE {
                for x in 0..GRID_SIZE {
                    let idx = Self::get_index(x, y, z);
                    let dna_val = self.dna[idx];
                    if dna_val == 0 {
                        continue;
                    }

                    let tpes = Tpes::unpack(dna_val);
                    // Only S3 (Core) / S4 (Whole Atom) can shatter if delta pressure > 6
                    if tpes.structure >= 3 {
                        let cell_p = self.pressure[idx] as i32;
                        let mut neighbor_sum = 0i32;

                        for (dx, dy, dz) in D3Q27_OFFSETS.iter().skip(1) {
                            let nx = (x as i32 + dx).rem_euclid(GRID_SIZE as i32) as usize;
                            let ny = (y as i32 + dy).rem_euclid(GRID_SIZE as i32) as usize;
                            let nz = (z as i32 + dz).rem_euclid(GRID_SIZE as i32) as usize;
                            let n_idx = Self::get_index(nx, ny, nz);
                            neighbor_sum += self.pressure[n_idx] as i32;
                        }

                        let avg_neighbor = neighbor_sum / 26;
                        let delta_p = (cell_p - avg_neighbor).abs();

                        if delta_p > 6 {
                            // Shatter core!
                            newly_shattered.push((idx, tpes.positrons, tpes.electrons));
                        }
                    }
                }
            }
        }

        // Apply shatter mechanics
        for (idx, positrons, electrons) in newly_shattered {
            // Zero out original cell
            self.dna[idx] = 0;

            let (cx, cy, cz) = Self::get_coords_internal(idx);

            // Distribute Positron apertures to adjacent vector cells
            for i in 0..(positrons as usize) {
                let offset = D3Q27_OFFSETS[(i % 26) + 1];
                let nx = (cx as i32 + offset.0).rem_euclid(GRID_SIZE as i32) as usize;
                let ny = (cy as i32 + offset.1).rem_euclid(GRID_SIZE as i32) as usize;
                let nz = (cz as i32 + offset.2).rem_euclid(GRID_SIZE as i32) as usize;
                let n_idx = Self::get_index(nx, ny, nz);
                if self.dna[n_idx] == 0 {
                    self.dna[n_idx] = positron_dna;
                }
            }

            // Distribute Electron apertures to adjacent vector cells
            for i in 0..(electrons as usize) {
                let offset = D3Q27_OFFSETS[((i + 13) % 26) + 1];
                let nx = (cx as i32 + offset.0).rem_euclid(GRID_SIZE as i32) as usize;
                let ny = (cy as i32 + offset.1).rem_euclid(GRID_SIZE as i32) as usize;
                let nz = (cz as i32 + offset.2).rem_euclid(GRID_SIZE as i32) as usize;
                let n_idx = Self::get_index(nx, ny, nz);
                if self.dna[n_idx] == 0 {
                    self.dna[n_idx] = electron_dna;
                }
            }
        }
    }

    pub fn get_index(x: usize, y: usize, z: usize) -> usize {
        x + y * GRID_SIZE + z * GRID_SIZE * GRID_SIZE
    }

    pub fn get_coords(&self, index: usize) -> Vec<usize> {
        let (x, y, z) = Self::get_coords_internal(index);
        vec![x, y, z]
    }
}

impl Engine {
    #[inline]
    pub fn get_coords_internal(index: usize) -> (usize, usize, usize) {
        let z = index / (GRID_SIZE * GRID_SIZE);
        let rem = index % (GRID_SIZE * GRID_SIZE);
        let y = rem / GRID_SIZE;
        let x = rem % GRID_SIZE;
        (x, y, z)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_engine_initialization() {
        let engine = Engine::new();
        assert_eq!(engine.get_source_bus(), 0);
        assert_eq!(engine.get_sink_bus(), 0);
        assert_eq!(engine.get_cell_pressure(0, 0, 0), 0);
        assert_eq!(engine.get_cell_dna(0, 0, 0), 0);
    }

    #[test]
    fn test_phase1_injection() {
        let mut engine = Engine::new();
        let c12_dna = Tpes::new(2, 24, 24, 4).pack();
        engine.set_cell_dna(16, 16, 16, c12_dna);

        engine.step();

        assert_eq!(engine.get_source_bus(), 24);
        assert_eq!(engine.get_sink_bus(), 24);
    }

    #[test]
    fn test_periodic_advection() {
        let mut engine = Engine::new();
        // Fill all non-wrapped neighbors of (0,0,0) with pressure 8 except (31,0,0)
        // Set (0,0,0) with pressure 8 and wrap to (31,0,0)
        for x in 0..32 {
            for y in 0..32 {
                for z in 0..32 {
                    if (x, y, z) != (31, 0, 0) {
                        engine.set_cell_pressure(x, y, z, 8);
                    }
                }
            }
        }

        engine.phase2_advection();
        // Pressure from neighbors around (31,0,0) transfers into (31,0,0) via periodic wrapping
        let p_wrapped = engine.get_cell_pressure(31, 0, 0);
        assert!(p_wrapped > 0);
    }

    #[test]
    fn test_shatter_mechanics() {
        let mut engine = Engine::new();
        let proton_dna = Tpes::new(2, 2, 1, 3).pack(); // S3 core
        engine.set_cell_dna(10, 10, 10, proton_dna);
        engine.set_cell_pressure(10, 10, 10, 8); // High pressure 8, surrounded by 0 (delta 8 > 6)

        engine.phase3_tensegrity_eval();

        // Target cell DNA should be zeroed
        assert_eq!(engine.get_cell_dna(10, 10, 10), 0);
        // Surrounding cells should receive shattered positron/electron DNA
        let mut non_zero_count = 0;
        for (dx, dy, dz) in D3Q27_OFFSETS.iter().skip(1) {
            let nx = (10i32 + dx).rem_euclid(32) as usize;
            let ny = (10i32 + dy).rem_euclid(32) as usize;
            let nz = (10i32 + dz).rem_euclid(32) as usize;
            if engine.get_cell_dna(nx, ny, nz) != 0 {
                non_zero_count += 1;
            }
        }
        assert!(non_zero_count >= 2);
    }
}
