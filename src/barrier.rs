//! Dimensional Barrier Buses: GlobalSourceBus and GlobalSinkBus

#[derive(Debug, Default, Clone, Copy)]
pub struct DimensionalBarrier {
    pub global_source_bus: u64, // Total fluid pulled into observable universe
    pub global_sink_bus: u64,   // Total fluid vented out of observable universe
}

impl DimensionalBarrier {
    pub fn new() -> Self {
        Self {
            global_source_bus: 0,
            global_sink_bus: 0,
        }
    }

    pub fn inject_source(&mut self, amount: u64) {
        self.global_source_bus = self.global_source_bus.wrapping_add(amount);
    }

    pub fn vent_sink(&mut self, amount: u64) {
        self.global_sink_bus = self.global_sink_bus.wrapping_add(amount);
    }

    pub fn reset(&mut self) {
        self.global_source_bus = 0;
        self.global_sink_bus = 0;
    }
}
