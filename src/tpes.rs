use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Tpes {
    pub raw: u32,
}

#[wasm_bindgen]
impl Tpes {
    #[wasm_bindgen(constructor)]
    pub fn new(tier: u8, positrons: u16, electrons: u16, structure: u8) -> Self {
        let raw = (((tier as u32) & 0xF) << 28)
            | (((positrons as u32) & 0xFFF) << 16)
            | (((electrons as u32) & 0xFFF) << 4)
            | ((structure as u32) & 0xF);
        Self { raw }
    }

    pub fn from_u32(raw: u32) -> Self {
        Self { raw }
    }

    pub fn as_u32(&self) -> u32 {
        self.raw
    }

    pub fn tier(&self) -> u8 {
        ((self.raw >> 28) & 0xF) as u8
    }

    pub fn set_tier(&mut self, tier: u8) {
        self.raw = (self.raw & !(0xF << 28)) | (((tier as u32) & 0xF) << 28);
    }

    pub fn positrons(&self) -> u16 {
        ((self.raw >> 16) & 0xFFF) as u16
    }

    pub fn set_positrons(&mut self, positrons: u16) {
        self.raw = (self.raw & !(0xFFF << 16)) | (((positrons as u32) & 0xFFF) << 16);
    }

    pub fn electrons(&self) -> u16 {
        ((self.raw >> 4) & 0xFFF) as u16
    }

    pub fn set_electrons(&mut self, electrons: u16) {
        self.raw = (self.raw & !(0xFFF << 4)) | (((electrons as u32) & 0xFFF) << 4);
    }

    pub fn structure(&self) -> u8 {
        (self.raw & 0xF) as u8
    }

    pub fn set_structure(&mut self, structure: u8) {
        self.raw = (self.raw & !0xF) | ((structure as u32) & 0xF);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_and_getters() {
        let tpes = Tpes::new(0xF, 0xFFF, 0xFFF, 0xF);
        assert_eq!(tpes.tier(), 15);
        assert_eq!(tpes.positrons(), 4095);
        assert_eq!(tpes.electrons(), 4095);
        assert_eq!(tpes.structure(), 15);
        assert_eq!(tpes.as_u32(), 0xFFFFFFFF);

        let tpes_zero = Tpes::new(0, 0, 0, 0);
        assert_eq!(tpes_zero.tier(), 0);
        assert_eq!(tpes_zero.positrons(), 0);
        assert_eq!(tpes_zero.electrons(), 0);
        assert_eq!(tpes_zero.structure(), 0);
        assert_eq!(tpes_zero.as_u32(), 0);

        let tpes_custom = Tpes::new(0xA, 0b101010101010, 0b010101010101, 0x5);
        assert_eq!(tpes_custom.tier(), 0xA);
        assert_eq!(tpes_custom.positrons(), 0b101010101010);
        assert_eq!(tpes_custom.electrons(), 0b010101010101);
        assert_eq!(tpes_custom.structure(), 0x5);
    }

    #[test]
    fn test_overflow_masking() {
        // Values larger than bit limits should be masked with & 0xF or & 0xFFF
        let tpes = Tpes::new(0xFF, 0xFFFF, 0xFFFF, 0xFF);
        assert_eq!(tpes.tier(), 0xF);
        assert_eq!(tpes.positrons(), 0xFFF);
        assert_eq!(tpes.electrons(), 0xFFF);
        assert_eq!(tpes.structure(), 0xF);
        assert_eq!(tpes.as_u32(), 0xFFFFFFFF);
    }

    #[test]
    fn test_setters() {
        let mut tpes = Tpes::new(0, 0, 0, 0);

        tpes.set_tier(0xB);
        assert_eq!(tpes.tier(), 0xB);
        assert_eq!(tpes.positrons(), 0);
        assert_eq!(tpes.electrons(), 0);
        assert_eq!(tpes.structure(), 0);

        tpes.set_positrons(0x123);
        assert_eq!(tpes.tier(), 0xB);
        assert_eq!(tpes.positrons(), 0x123);
        assert_eq!(tpes.electrons(), 0);
        assert_eq!(tpes.structure(), 0);

        tpes.set_electrons(0x456);
        assert_eq!(tpes.tier(), 0xB);
        assert_eq!(tpes.positrons(), 0x123);
        assert_eq!(tpes.electrons(), 0x456);
        assert_eq!(tpes.structure(), 0);

        tpes.set_structure(0x7);
        assert_eq!(tpes.tier(), 0xB);
        assert_eq!(tpes.positrons(), 0x123);
        assert_eq!(tpes.electrons(), 0x456);
        assert_eq!(tpes.structure(), 0x7);

        // Test masking in setters
        tpes.set_tier(0xFF);
        assert_eq!(tpes.tier(), 0xF);
    }

    #[test]
    fn test_from_u32_and_as_u32() {
        let raw_val: u32 = (0x9 << 28) | (0xABC << 16) | (0xDEF << 4) | 0x3;
        let tpes = Tpes::from_u32(raw_val);

        assert_eq!(tpes.as_u32(), raw_val);
        assert_eq!(tpes.tier(), 0x9);
        assert_eq!(tpes.positrons(), 0xABC);
        assert_eq!(tpes.electrons(), 0xDEF);
        assert_eq!(tpes.structure(), 0x3);
    }
}
