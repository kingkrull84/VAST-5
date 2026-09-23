//! TPES (Quantum DNA) 32-bit bit-packing implementation
//! Bit format:
//! Tier [T]: 4 bits (31..28)
//! Positrons [P]: 12 bits (27..16)
//! Electrons [E]: 12 bits (15..4)
//! Structure [S]: 4 bits (3..0)

use std::collections::HashMap;
use lazy_static::lazy_static;
use wasm_bindgen::prelude::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Tpes {
    pub tier: u8,       // 4-bit (0..15)
    pub positrons: u16, // 12-bit (0..4095)
    pub electrons: u16, // 12-bit (0..4095)
    pub structure: u8,  // 4-bit (0..15: S0=Eq, S1=Positron, S2=Electron, S3=Core, S4=Orbital/Atom)
}

impl Tpes {
    pub fn new(tier: u8, positrons: u16, electrons: u16, structure: u8) -> Self {
        Self {
            tier: tier & 0x0F,
            positrons: positrons & 0x0FFF,
            electrons: electrons & 0x0FFF,
            structure: structure & 0x0F,
        }
    }

    /// Packs the TPES struct into a 32-bit unsigned integer.
    pub fn pack(&self) -> u32 {
        ((self.tier as u32 & 0x0F) << 28)
            | ((self.positrons as u32 & 0x0FFF) << 16)
            | ((self.electrons as u32 & 0x0FFF) << 4)
            | (self.structure as u32 & 0x0F)
    }

    /// Unpacks a 32-bit unsigned integer into a TPES struct.
    pub fn unpack(packed: u32) -> Self {
        let tier = ((packed >> 28) & 0x0F) as u8;
        let positrons = ((packed >> 16) & 0x0FFF) as u16;
        let electrons = ((packed >> 4) & 0x0FFF) as u16;
        let structure = (packed & 0x0F) as u8;
        Self {
            tier,
            positrons,
            electrons,
            structure,
        }
    }
}

pub struct ManifestEntry {
    pub name: &'static str,
    pub symbol: &'static str,
    pub tpes: Tpes,
    pub dna: u32,
}

pub static MANIFEST_LIST: &[(&str, &str, u8, u16, u16, u8)] = &[
    ("Element Zero", "Ez", 0, 1, 1, 0),
    ("Positron", "+e", 1, 1, 0, 1),
    ("Electron", "-e", 1, 0, 1, 2),
    ("Proton", "p+", 2, 2, 1, 3),
    ("Neutron", "n0", 2, 2, 2, 3),
    // Elements 1-10 (S4 Whole Atoms with P = 2A, E = 2A)
    ("Hydrogen-1", "H", 2, 2, 2, 4),       // A=1 -> P=2, E=2
    ("Helium-4", "He", 2, 8, 8, 4),        // A=4 -> P=8, E=8
    ("Lithium-7", "Li", 2, 14, 14, 4),    // A=7 -> P=14, E=14
    ("Beryllium-9", "Be", 2, 18, 18, 4),   // A=9 -> P=18, E=18
    ("Boron-11", "B", 2, 22, 22, 4),      // A=11 -> P=22, E=22
    ("Carbon-12", "C", 2, 24, 24, 4),      // A=12 -> P=24, E=24
    ("Nitrogen-14", "N", 2, 28, 28, 4),    // A=14 -> P=28, E=28
    ("Oxygen-16", "O", 2, 32, 32, 4),      // A=16 -> P=32, E=32
    ("Fluorine-19", "F", 2, 38, 38, 4),    // A=19 -> P=38, E=38
    ("Neon-20", "Ne", 2, 40, 40, 4),       // A=20 -> P=40, E=40
];

lazy_static! {
    pub static ref USS_MANIFEST: HashMap<&'static str, ManifestEntry> = {
        let mut m = HashMap::new();

        for &(name, symbol, tier, positrons, electrons, structure) in MANIFEST_LIST {
            let tpes = Tpes::new(tier, positrons, electrons, structure);
            let dna = tpes.pack();
            m.insert(name, ManifestEntry { name, symbol, tpes, dna });
        }

        m
    };
}

#[wasm_bindgen]
pub fn get_manifest_json() -> String {
    let mut items = Vec::new();
    for &(name, symbol, tier, positrons, electrons, structure) in MANIFEST_LIST {
        let tpes = Tpes::new(tier, positrons, electrons, structure);
        let dna = tpes.pack();
        items.push(format!(
            r#"{{"name":"{}","symbol":"{}","tier":{},"positrons":{},"electrons":{},"structure":{},"dna":{}}}"#,
            name, symbol, tier, positrons, electrons, structure, dna
        ));
    }
    format!("[{}]", items.join(","))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tpes_pack_unpack() {
        let original = Tpes::new(2, 24, 24, 4); // Carbon-12
        let packed = original.pack();
        let unpacked = Tpes::unpack(packed);
        assert_eq!(original, unpacked);
        assert_eq!(packed, (2 << 28) | (24 << 16) | (24 << 4) | 4);
    }

    #[test]
    fn test_all_manifest_entries_bitpacking() {
        for &(name, _symbol, tier, positrons, electrons, structure) in MANIFEST_LIST {
            let entry = USS_MANIFEST.get(name).expect("Manifest entry missing");
            assert_eq!(entry.tpes.tier, tier);
            assert_eq!(entry.tpes.positrons, positrons);
            assert_eq!(entry.tpes.electrons, electrons);
            assert_eq!(entry.tpes.structure, structure);

            let unpacked = Tpes::unpack(entry.dna);
            assert_eq!(unpacked, entry.tpes);
        }
    }
}
