// The motion system's shared springs. One physics for everything that moves — tabs, menus, sheets,
// accordions, lists — so the whole app feels like one object. Kept in their own (component-free)
// module so importing a token never drags a React component into a hot-reload boundary.

// The default spring: snappy with a touch of settle. The SlidingTabs feel, reused everywhere.
export const SPRING = { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.8 };

// Softer, for size/height changes (accordions, drawers) where bounce reads as jank.
export const SPRING_SOFT = { type: "spring" as const, stiffness: 300, damping: 30 };
