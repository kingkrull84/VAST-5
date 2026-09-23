use crate::tpes::Tpes;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn get_tpes_by_id(id: u32) -> Option<Tpes> {
    match id {
        0 => Some(Tpes::new(1, 1, 0, 1)),    // Positron
        1 => Some(Tpes::new(1, 0, 1, 2)),    // Electron
        2 => Some(Tpes::new(0, 1, 1, 0)),    // Element Zero
        100 => Some(Tpes::new(2, 2, 1, 3)),  // Proton
        101 => Some(Tpes::new(2, 2, 2, 3)),  // Neutron
        1001 => Some(Tpes::new(2, 2, 2, 4)), // Hydrogen-1
        1002 => Some(Tpes::new(2, 8, 8, 4)), // Helium-4
        1003 => Some(Tpes::new(2, 14, 14, 4)), // Lithium-7
        1004 => Some(Tpes::new(2, 18, 18, 4)), // Beryllium-9
        1005 => Some(Tpes::new(2, 22, 22, 4)), // Boron-11
        1006 => Some(Tpes::new(2, 24, 24, 4)), // Carbon-12
        1007 => Some(Tpes::new(2, 28, 28, 4)), // Nitrogen-14
        1008 => Some(Tpes::new(2, 32, 32, 4)), // Oxygen-16
        1009 => Some(Tpes::new(2, 38, 38, 4)), // Fluorine-19
        1010 => Some(Tpes::new(2, 40, 40, 4)), // Neon-20
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_manifest_carbon_12_and_element_zero() {
        // Test Element Zero (ID 2): T0 : P1 : E1 : S0
        let elem_zero = get_tpes_by_id(2).expect("Element Zero should be in manifest");
        assert_eq!(elem_zero.tier(), 0);
        assert_eq!(elem_zero.positrons(), 1);
        assert_eq!(elem_zero.electrons(), 1);
        assert_eq!(elem_zero.structure(), 0);

        // Test Carbon-12 (ID 1006): T2 : P24 : E24 : S4
        let carbon_12 = get_tpes_by_id(1006).expect("Carbon-12 should be in manifest");
        assert_eq!(carbon_12.tier(), 2);
        assert_eq!(carbon_12.positrons(), 24);
        assert_eq!(carbon_12.electrons(), 24);
        assert_eq!(carbon_12.structure(), 4);
    }

    #[test]
    fn test_manifest_all_entries() {
        assert!(get_tpes_by_id(0).is_some());
        assert!(get_tpes_by_id(1).is_some());
        assert!(get_tpes_by_id(2).is_some());
        assert!(get_tpes_by_id(100).is_some());
        assert!(get_tpes_by_id(101).is_some());
        assert!(get_tpes_by_id(1001).is_some());
        assert!(get_tpes_by_id(1002).is_some());
        assert!(get_tpes_by_id(1003).is_some());
        assert!(get_tpes_by_id(1004).is_some());
        assert!(get_tpes_by_id(1005).is_some());
        assert!(get_tpes_by_id(1006).is_some());
        assert!(get_tpes_by_id(1007).is_some());
        assert!(get_tpes_by_id(1008).is_some());
        assert!(get_tpes_by_id(1009).is_some());
        assert!(get_tpes_by_id(1010).is_some());

        assert!(get_tpes_by_id(9999).is_none());
    }
}
