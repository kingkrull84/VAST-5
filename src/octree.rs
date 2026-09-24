use crate::barrier::{GlobalSinkBus, GlobalSourceBus};
use crate::manifest::get_tpes_by_id;
use crate::tpes::Tpes;
use wasm_bindgen::prelude::*;

pub const LATTICE_SIZE: usize = 32;
pub const TOTAL_CELLS: usize = LATTICE_SIZE * LATTICE_SIZE * LATTICE_SIZE; // 32,768

// 26 neighbor direction offsets in 3D (excluding center (0,0,0))
pub const NEIGHBORS_3D: [(i32, i32, i32); 26] = [
    (-1, -1, -1), (0, -1, -1), (1, -1, -1),
    (-1,  0, -1), (0,  0, -1), (1,  0, -1),
    (-1,  1, -1), (0,  1, -1), (1,  1, -1),
    (-1, -1,  0), (0, -1,  0), (1, -1,  0),
    (-1,  0,  0),              (1,  0,  0),
    (-1,  1,  0), (0,  1,  0), (1,  1,  0),
    (-1, -1,  1), (0, -1,  1), (1, -1,  1),
    (-1,  0,  1), (0,  0,  1), (1,  0,  1),
    (-1,  1,  1), (0,  1,  1), (1,  1,  1),
];

#[wasm_bindgen]
pub struct D3Q27Lattice {
    current_pressure: Box<[u8; TOTAL_CELLS]>,
    next_pressure: Box<[u8; TOTAL_CELLS]>,
    dna: Box<[u32; TOTAL_CELLS]>,
    orientation: Box<[u8; TOTAL_CELLS]>,
}

#[wasm_bindgen]
impl D3Q27Lattice {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let elem_zero_dna = get_tpes_by_id(2)
            .expect("Element Zero (ID 2) must exist in manifest")
            .as_u32();

        let current_pressure = Box::new([1u8; TOTAL_CELLS]);
        let next_pressure = Box::new([1u8; TOTAL_CELLS]);
        let dna = Box::new([elem_zero_dna; TOTAL_CELLS]);
        let orientation = Box::new([0u8; TOTAL_CELLS]);

        Self {
            current_pressure,
            next_pressure,
            dna,
            orientation,
        }
    }

    pub fn current_pressure_ptr(&self) -> *const u8 {
        self.current_pressure.as_ptr()
    }

    pub fn dna_ptr(&self) -> *const u32 {
        self.dna.as_ptr()
    }

    pub fn orientation_ptr(&self) -> *const u8 {
        self.orientation.as_ptr()
    }

    pub fn size(&self) -> usize {
        TOTAL_CELLS
    }

    pub fn get_index(x: usize, y: usize, z: usize) -> usize {
        x + y * LATTICE_SIZE + z * LATTICE_SIZE * LATTICE_SIZE
    }

    pub fn get_coord_x(index: usize) -> usize {
        index % LATTICE_SIZE
    }

    pub fn get_coord_y(index: usize) -> usize {
        (index / LATTICE_SIZE) % LATTICE_SIZE
    }

    pub fn get_coord_z(index: usize) -> usize {
        index / (LATTICE_SIZE * LATTICE_SIZE)
    }

    pub fn get_neighbor_index(x: usize, y: usize, z: usize, dx: i32, dy: i32, dz: i32) -> Option<usize> {
        let nx = x as i32 + dx;
        let ny = y as i32 + dy;
        let nz = z as i32 + dz;

        if nx < 0 || nx >= LATTICE_SIZE as i32 || ny < 0 || ny >= LATTICE_SIZE as i32 || nz < 0 || nz >= LATTICE_SIZE as i32 {
            None
        } else {
            Some(Self::get_index(nx as usize, ny as usize, nz as usize))
        }
    }

    pub fn get_dna(&self, index: usize) -> u32 {
        self.dna[index]
    }

    pub fn set_dna(&mut self, index: usize, val: u32) {
        self.dna[index] = val;
    }

    pub fn get_current_pressure(&self, index: usize) -> u8 {
        self.current_pressure[index]
    }

    pub fn set_current_pressure(&mut self, index: usize, val: u8) {
        self.current_pressure[index] = val;
    }

    pub fn get_next_pressure(&self, index: usize) -> u8 {
        self.next_pressure[index]
    }

    pub fn set_next_pressure(&mut self, index: usize, val: u8) {
        self.next_pressure[index] = val;
    }

    pub fn get_orientation(&self, index: usize) -> u8 {
        self.orientation[index]
    }

    pub fn set_orientation(&mut self, index: usize, val: u8) {
        self.orientation[index] = val % 26;
    }

    pub fn inject_ray(&mut self, x: usize, y: usize, z: usize, energy: u8) {
        if x < LATTICE_SIZE && y < LATTICE_SIZE && z < LATTICE_SIZE {
            let idx = Self::get_index(x, y, z);
            let cur_p = self.current_pressure[idx] as u16;
            let new_p = (cur_p + energy as u16).min(8) as u8;
            self.current_pressure[idx] = new_p;
        }
    }

    pub fn step(&mut self, source_bus: &GlobalSourceBus, sink_bus: &GlobalSinkBus) {
        let elem_zero_raw = get_tpes_by_id(2)
            .expect("Element Zero (ID 2) must exist")
            .as_u32();

        let positron_raw = get_tpes_by_id(0)
            .expect("Positron (ID 0) must exist")
            .as_u32();

        let electron_raw = get_tpes_by_id(1)
            .expect("Electron (ID 1) must exist")
            .as_u32();

        // --- Phase 1: Barrier Injection & Event Horizon Consumption ---
        // 1a. Non-Electron particles process standard barrier injection
        for i in 0..TOTAL_CELLS {
            let cell_dna_raw = self.dna[i];
            if cell_dna_raw == positron_raw {
                // Positron (ID 0) no longer injects omnidirectionally.
                // It injects 1 pressure unit strictly into the neighbor pointed to by its orientation index.
                let x = Self::get_coord_x(i);
                let y = Self::get_coord_y(i);
                let z = Self::get_coord_z(i);
                let orient_idx = (self.orientation[i] as usize) % 26;
                let (dx, dy, dz) = NEIGHBORS_3D[orient_idx];

                source_bus.add(-1);

                if let Some(n_idx) = Self::get_neighbor_index(x, y, z, dx, dy, dz) {
                    let cur_p = self.current_pressure[n_idx] as u16;
                    let new_p = (cur_p + 1).min(8) as u8;
                    self.current_pressure[n_idx] = new_p;
                }
            } else if cell_dna_raw != elem_zero_raw && cell_dna_raw != electron_raw {
                let cell_tpes = Tpes::from_u32(cell_dna_raw);
                let p = cell_tpes.positrons() as i64;
                let e = cell_tpes.electrons() as i64;

                source_bus.add(-p);
                sink_bus.add(e);

                let cur_p = self.current_pressure[i] as i64;
                let new_p = (cur_p + p - e).clamp(0, 8) as u8;
                self.current_pressure[i] = new_p;
            } else if cell_dna_raw == electron_raw {
                // Electron cell pressure is pinned at 0 as Schwarzschild aperture
                self.current_pressure[i] = 0;
            }
        }

        // 1b. Event Horizon Consumption for Electron cells (ID 1) BEFORE Phase 2 Advection
        for i in 0..TOTAL_CELLS {
            if self.dna[i] == electron_raw {
                let x = Self::get_coord_x(i);
                let y = Self::get_coord_y(i);
                let z = Self::get_coord_z(i);
                let orient_idx = (self.orientation[i] as usize) % 26;
                let (dx, dy, dz) = NEIGHBORS_3D[orient_idx];

                if let Some(n_idx) = Self::get_neighbor_index(x, y, z, dx, dy, dz) {
                    if self.current_pressure[n_idx] > 0 {
                        // Immediately mutate neighbor's pressure to avoid double-spending
                        self.current_pressure[n_idx] -= 1;
                        sink_bus.add(1);
                    }
                }
            }
        }

        // --- Phase 2: Advection / Lock-Free Gather & Phase 3: Tensegrity Shatter ---
        for i in 0..TOTAL_CELLS {
            let x = Self::get_coord_x(i);
            let y = Self::get_coord_y(i);
            let z = Self::get_coord_z(i);
            let p_center = self.current_pressure[i];
            let cell_dna_raw = self.dna[i];
            let cell_tpes = Tpes::from_u32(cell_dna_raw);

            if cell_dna_raw != elem_zero_raw {
                // Non-Element Zero particle cells skip advection and pin pressure
                self.next_pressure[i] = p_center;

                // Structure 3 cores evaluate neighbor delta for Tensegrity Shatter
                if cell_tpes.structure() == 3 {
                    let mut max_delta: u8 = 0;
                    for &(dx, dy, dz) in &NEIGHBORS_3D {
                        if let Some(n_idx) = Self::get_neighbor_index(x, y, z, dx, dy, dz) {
                            let p_neighbor = self.current_pressure[n_idx];
                            let delta = if p_neighbor > p_center {
                                p_neighbor - p_center
                            } else {
                                p_center - p_neighbor
                            };
                            if delta > max_delta {
                                max_delta = delta;
                            }
                        }
                    }

                    if max_delta > 6 {
                        let p_apertures = cell_tpes.positrons() as usize;
                        let e_apertures = cell_tpes.electrons() as usize;

                        // Revert core to Element Zero
                        self.dna[i] = elem_zero_raw;

                        let mut valid_neighbors = Vec::with_capacity(26);
                        for &(dx, dy, dz) in &NEIGHBORS_3D {
                            if let Some(n_idx) = Self::get_neighbor_index(x, y, z, dx, dy, dz) {
                                valid_neighbors.push(n_idx);
                            }
                        }

                        let mut placed_p = 0;
                        let mut placed_e = 0;

                        for &n_idx in &valid_neighbors {
                            if placed_p < p_apertures {
                                self.dna[n_idx] = positron_raw;
                                placed_p += 1;
                            } else {
                                break;
                            }
                        }

                        for &n_idx in valid_neighbors.iter().skip(placed_p) {
                            if placed_e < e_apertures {
                                self.dna[n_idx] = electron_raw;
                                placed_e += 1;
                            } else {
                                break;
                            }
                        }

                        let excess_p = (p_apertures - placed_p) as i64;
                        let excess_e = (e_apertures - placed_e) as i64;

                        if excess_p > 0 {
                            source_bus.add(excess_p);
                        }
                        if excess_e > 0 {
                            sink_bus.add(excess_e);
                        }
                    }
                }
            } else {
                // Zero-Overhead Static State Optimization:
                // Skip advection for Element Zero cells ONLY if P=1 AND all 26 immediate neighbors are also P=1.
                let mut is_flat = p_center == 1;
                if is_flat {
                    for &(dx, dy, dz) in &NEIGHBORS_3D {
                        if let Some(n_idx) = Self::get_neighbor_index(x, y, z, dx, dy, dz) {
                            if self.current_pressure[n_idx] != 1 {
                                is_flat = false;
                                break;
                            }
                        }
                    }
                }

                if is_flat {
                    self.next_pressure[i] = 1;
                } else {
                    let mut higher_count: i16 = 0;
                    let mut lower_count: i16 = 0;

                    for &(dx, dy, dz) in &NEIGHBORS_3D {
                        if let Some(n_idx) = Self::get_neighbor_index(x, y, z, dx, dy, dz) {
                            let p_neighbor = self.current_pressure[n_idx];

                            if p_neighbor > p_center {
                                higher_count += 1;
                            } else if p_neighbor < p_center {
                                lower_count += 1;
                            }
                        }
                    }

                    let next_p = (p_center as i16 + higher_count - lower_count).clamp(0, 8) as u8;
                    self.next_pressure[i] = next_p;
                }
            }
        }

        // --- Phase 4: Boundary Absorption (Infinite Sink) ---
        for i in 0..TOTAL_CELLS {
            let x = Self::get_coord_x(i);
            let y = Self::get_coord_y(i);
            let z = Self::get_coord_z(i);

            if (x == 0 || x == LATTICE_SIZE - 1 || y == 0 || y == LATTICE_SIZE - 1 || z == 0 || z == LATTICE_SIZE - 1)
                && self.dna[i] == elem_zero_raw
            {
                self.next_pressure[i] = 1;
            }
        }

        // --- Buffer Swap ---
        std::mem::swap(&mut self.current_pressure, &mut self.next_pressure);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_d3q27_lattice_initialization() {
        let lattice = D3Q27Lattice::new();
        assert_eq!(lattice.size(), 32768);

        let elem_zero = get_tpes_by_id(2).unwrap();

        // Verify all 32,768 cells are initialized to Element Zero and pressure 1
        for i in 0..TOTAL_CELLS {
            assert_eq!(lattice.get_current_pressure(i), 1);
            assert_eq!(lattice.get_next_pressure(i), 1);

            let dna_val = lattice.get_dna(i);
            assert_eq!(dna_val, elem_zero.as_u32());

            let unpacked = Tpes::from_u32(dna_val);
            assert_eq!(unpacked.tier(), 0);
            assert_eq!(unpacked.positrons(), 1);
            assert_eq!(unpacked.electrons(), 1);
            assert_eq!(unpacked.structure(), 0);
        }
    }

    #[test]
    fn test_pointers() {
        let lattice = D3Q27Lattice::new();
        assert!(!lattice.current_pressure_ptr().is_null());
        assert!(!lattice.dna_ptr().is_null());
    }

    #[test]
    fn test_index_mapping_and_mutations() {
        let mut lattice = D3Q27Lattice::new();
        let idx = D3Q27Lattice::get_index(10, 15, 20);
        assert_eq!(idx, 10 + 15 * 32 + 20 * 32 * 32);

        lattice.set_current_pressure(idx, 42);
        lattice.set_next_pressure(idx, 99);
        lattice.set_dna(idx, 0x12345678);

        assert_eq!(lattice.get_current_pressure(idx), 42);
        assert_eq!(lattice.get_next_pressure(idx), 99);
        assert_eq!(lattice.get_dna(idx), 0x12345678);
    }

    #[test]
    fn test_step_phase_1_injection() {
        let mut lattice = D3Q27Lattice::new();
        let source_bus = GlobalSourceBus::new(100);
        let sink_bus = GlobalSinkBus::new(0);

        // Place Proton (ID 100): T2 : P2 : E1 : S3 at cell (5,5,5)
        let proton = get_tpes_by_id(100).unwrap();
        let idx = D3Q27Lattice::get_index(5, 5, 5);
        lattice.set_dna(idx, proton.as_u32());

        // Initial cell pressure is 1
        assert_eq!(lattice.get_current_pressure(idx), 1);

        lattice.step(&source_bus, &sink_bus);

        // Phase 1 Injection:
        // P=2 subtracted from source (100 -> 98)
        // E=1 added to sink (0 -> 1)
        // Cell pressure delta = +2 -1 = +1 => new current_pressure = 1 + 1 = 2
        assert_eq!(source_bus.get(), 98);
        assert_eq!(sink_bus.get(), 1);
    }

    #[test]
    fn test_step_phase_2_advection() {
        let mut lattice = D3Q27Lattice::new();
        let source_bus = GlobalSourceBus::new(100);
        let sink_bus = GlobalSinkBus::new(0);

        let center_idx = D3Q27Lattice::get_index(10, 10, 10);
        // Set higher pressure on center cell
        lattice.set_current_pressure(center_idx, 5);

        // All other cells have default pressure 1
        // Center cell (10,10,10) has 26 neighbors with lower pressure (1 < 5)
        // For center cell: higher_count = 0, lower_count = 26 => next_p = (5 + 0 - 26).clamp(0, 8) = 0
        // For each neighbor cell: has 1 higher neighbor (center cell) => higher_count = 1, lower_count = 0 => next_p = (1 + 1 - 0) = 2

        lattice.step(&source_bus, &sink_bus);

        // After step & buffer swap, current_pressure reflects new values
        assert_eq!(lattice.get_current_pressure(center_idx), 0);

        // Verify one neighbor cell
        let neighbor_idx = D3Q27Lattice::get_index(11, 10, 10);
        assert_eq!(lattice.get_current_pressure(neighbor_idx), 2);
    }

    #[test]
    fn test_step_phase_3_tensegrity_shatter() {
        let mut lattice = D3Q27Lattice::new();
        let source_bus = GlobalSourceBus::new(100);
        let sink_bus = GlobalSinkBus::new(0);

        // Place Proton (ID 100 with S3, P=2, E=1) at cell (15,15,15)
        let proton = get_tpes_by_id(100).unwrap();
        let idx = D3Q27Lattice::get_index(15, 15, 15);
        lattice.set_dna(idx, proton.as_u32());
        // Set initial pressure of center cell to 0, so after Phase 1 injection (+2 - 1 = +1) pressure is 1
        lattice.set_current_pressure(idx, 0);

        // Set high pressure 8 on neighbor cell (16,15,15) so delta = 8 - 1 = 7 (> 6)
        let neighbor_idx = D3Q27Lattice::get_index(16, 15, 15);
        lattice.set_current_pressure(neighbor_idx, 8);

        lattice.step(&source_bus, &sink_bus);

        // Cell DNA should revert to Element Zero (ID 2)
        let elem_zero = get_tpes_by_id(2).unwrap();
        assert_eq!(lattice.get_dna(idx), elem_zero.as_u32());

        // Neighbors should receive Positron and Electron apertures
        let positron = get_tpes_by_id(0).unwrap();
        let electron = get_tpes_by_id(1).unwrap();

        // First 2 neighbors get Positrons, 3rd gets Electron
        let n0 = D3Q27Lattice::get_neighbor_index(15, 15, 15, NEIGHBORS_3D[0].0, NEIGHBORS_3D[0].1, NEIGHBORS_3D[0].2).unwrap();
        let n1 = D3Q27Lattice::get_neighbor_index(15, 15, 15, NEIGHBORS_3D[1].0, NEIGHBORS_3D[1].1, NEIGHBORS_3D[1].2).unwrap();
        let n2 = D3Q27Lattice::get_neighbor_index(15, 15, 15, NEIGHBORS_3D[2].0, NEIGHBORS_3D[2].1, NEIGHBORS_3D[2].2).unwrap();

        assert_eq!(lattice.get_dna(n0), positron.as_u32());
        assert_eq!(lattice.get_dna(n1), positron.as_u32());
        assert_eq!(lattice.get_dna(n2), electron.as_u32());
    }

    #[test]
    fn test_neighbor_index_out_of_bounds() {
        assert_eq!(D3Q27Lattice::get_neighbor_index(0, 0, 0, -1, 0, 0), None);
        assert_eq!(D3Q27Lattice::get_neighbor_index(31, 31, 31, 1, 0, 0), None);
        assert!(D3Q27Lattice::get_neighbor_index(10, 10, 10, 1, 0, 0).is_some());
    }

    #[test]
    fn test_particle_pressure_pinning() {
        let mut lattice = D3Q27Lattice::new();
        let source_bus = GlobalSourceBus::new(100);
        let sink_bus = GlobalSinkBus::new(0);

        // Place Positron (ID 0) at cell (10, 10, 10)
        let positron = get_tpes_by_id(0).unwrap(); // Positron P:1, E:0
        let idx = D3Q27Lattice::get_index(10, 10, 10);
        lattice.set_dna(idx, positron.as_u32());
        lattice.set_current_pressure(idx, 3);

        // Neighbor cells have pressure 1
        lattice.step(&source_bus, &sink_bus);

        // Positron injects into neighbor (not itself).
        // Phase 2 advection: because dna != elem_zero_raw, next_p is pinned to cur_p (3).
        // After buffer swap, current_pressure remains 3.
        assert_eq!(lattice.get_current_pressure(idx), 3);
    }

    #[test]
    fn test_inject_ray() {
        let mut lattice = D3Q27Lattice::new();
        let idx = D3Q27Lattice::get_index(5, 5, 5);
        assert_eq!(lattice.get_current_pressure(idx), 1);

        lattice.inject_ray(5, 5, 5, 3);
        assert_eq!(lattice.get_current_pressure(idx), 4);

        // Clamp at max pressure 8
        lattice.inject_ray(5, 5, 5, 10);
        assert_eq!(lattice.get_current_pressure(idx), 8);
    }

    #[test]
    fn test_electron_event_horizon_consumption() {
        let mut lattice = D3Q27Lattice::new();
        let source_bus = GlobalSourceBus::new(0);
        let sink_bus = GlobalSinkBus::new(0);

        let electron = get_tpes_by_id(1).unwrap();
        let e_idx = D3Q27Lattice::get_index(10, 10, 10);
        lattice.set_dna(e_idx, electron.as_u32());
        // Default orientation is 0 => NEIGHBORS_3D[0] is (-1, -1, -1)

        let n0_idx = D3Q27Lattice::get_neighbor_index(10, 10, 10, -1, -1, -1).unwrap();
        lattice.set_current_pressure(n0_idx, 3);

        lattice.step(&source_bus, &sink_bus);

        // Electron cell pressure should be pinned at 0
        assert_eq!(lattice.get_current_pressure(e_idx), 0);
        // sink_bus incremented by 1
        assert_eq!(sink_bus.get(), 1);
    }

    #[test]
    fn test_positron_oriented_injection() {
        let mut lattice = D3Q27Lattice::new();
        let source_bus = GlobalSourceBus::new(100);
        let sink_bus = GlobalSinkBus::new(0);

        let positron = get_tpes_by_id(0).unwrap();
        let p_idx = D3Q27Lattice::get_index(10, 10, 10);
        lattice.set_dna(p_idx, positron.as_u32());

        // Set orientation to 13 => (1, 0, 0)
        let orient_idx_13 = 13; // NEIGHBORS_3D[13] is (1, 0, 0)
        lattice.set_orientation(p_idx, orient_idx_13 as u8);

        let target_n_idx = D3Q27Lattice::get_neighbor_index(10, 10, 10, 1, 0, 0).unwrap();
        assert_eq!(lattice.get_current_pressure(target_n_idx), 1);

        lattice.step(&source_bus, &sink_bus);

        // Positron injected 1 pressure into target neighbor and decremented source_bus
        assert_eq!(source_bus.get(), 99);
    }

    #[test]
    fn test_phase_4_infinite_sink() {
        let mut lattice = D3Q27Lattice::new();
        let source_bus = GlobalSourceBus::new(0);
        let sink_bus = GlobalSinkBus::new(0);

        let corner_idx = D3Q27Lattice::get_index(0, 0, 0);
        lattice.set_current_pressure(corner_idx, 5); // Set pressure high on edge cell

        lattice.step(&source_bus, &sink_bus);

        // Edge cell (0,0,0) with Element Zero DNA should be forced to next_pressure = 1 (and after swap current_pressure = 1)
        assert_eq!(lattice.get_current_pressure(corner_idx), 1);

        // Edge cell with non-Element Zero particle should NOT be forced to 1
        let proton = get_tpes_by_id(100).unwrap();
        lattice.set_dna(corner_idx, proton.as_u32());
        lattice.set_current_pressure(corner_idx, 5);

        lattice.step(&source_bus, &sink_bus);
        // Phase 1 injection for proton: cur_p = 5 + 2 - 1 = 6
        // Advection: outer boundary cell, next_p calculated normally, not forced to 1
        assert_ne!(lattice.get_dna(corner_idx), get_tpes_by_id(2).unwrap().as_u32());
        // Since it's not element zero, it won't be overridden by Phase 4
    }
}
