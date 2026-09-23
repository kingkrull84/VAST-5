use std::sync::atomic::{AtomicI64, Ordering};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct GlobalSourceBus {
    value: AtomicI64,
}

#[wasm_bindgen]
impl GlobalSourceBus {
    #[wasm_bindgen(constructor)]
    pub fn new(initial: i64) -> Self {
        Self {
            value: AtomicI64::new(initial),
        }
    }

    pub fn get(&self) -> i64 {
        self.value.load(Ordering::Relaxed)
    }

    pub fn set(&self, val: i64) {
        self.value.store(val, Ordering::Relaxed);
    }

    pub fn add(&self, delta: i64) -> i64 {
        self.value.fetch_add(delta, Ordering::Relaxed) + delta
    }
}

#[wasm_bindgen]
pub struct GlobalSinkBus {
    value: AtomicI64,
}

#[wasm_bindgen]
impl GlobalSinkBus {
    #[wasm_bindgen(constructor)]
    pub fn new(initial: i64) -> Self {
        Self {
            value: AtomicI64::new(initial),
        }
    }

    pub fn get(&self) -> i64 {
        self.value.load(Ordering::Relaxed)
    }

    pub fn set(&self, val: i64) {
        self.value.store(val, Ordering::Relaxed);
    }

    pub fn add(&self, delta: i64) -> i64 {
        self.value.fetch_add(delta, Ordering::Relaxed) + delta
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_global_source_bus() {
        let source = GlobalSourceBus::new(100);
        assert_eq!(source.get(), 100);

        let new_val = source.add(50);
        assert_eq!(new_val, 150);
        assert_eq!(source.get(), 150);

        source.set(500);
        assert_eq!(source.get(), 500);
    }

    #[test]
    fn test_global_sink_bus() {
        let sink = GlobalSinkBus::new(0);
        assert_eq!(sink.get(), 0);

        let new_val = sink.add(25);
        assert_eq!(new_val, 25);
        assert_eq!(sink.get(), 25);

        sink.set(1000);
        assert_eq!(sink.get(), 1000);
    }
}
