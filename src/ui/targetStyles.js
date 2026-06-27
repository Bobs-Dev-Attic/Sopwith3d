// Shared visual language for objective types, used by both the off-screen
// edge arrows (DOM) and the radar minimap (canvas) so a colour/glyph means the
// same thing in both places.
//   color  — CSS colour string
//   glyph  — single-character label for the edge arrow
//   shape  — minimap marker: 'dot' | 'circle' | 'square' | 'triangle' | 'diamond' | 'rect'
export const TARGET_STYLE = {
  mgnest:   { color: '#e0913a', glyph: 'N', shape: 'dot',      label: 'Nest' },
  bunker:   { color: '#c8682f', glyph: 'B', shape: 'square',   label: 'Bunker' },
  balloon:  { color: '#e6cc56', glyph: 'O', shape: 'circle',   label: 'Balloon' },
  battery:  { color: '#e0556a', glyph: 'A', shape: 'triangle', label: 'Battery' },
  tank:     { color: '#73c24a', glyph: 'T', shape: 'square',   label: 'Tank' },
  truck:    { color: '#c2b24a', glyph: 'K', shape: 'diamond',  label: 'Truck' },
  barracks: { color: '#46c2a8', glyph: 'H', shape: 'square',   label: 'Barracks' },
  train:    { color: '#a583e0', glyph: 'R', shape: 'rect',     label: 'Train' },
  plane:    { color: '#e0483a', glyph: '✕', shape: 'triangle', label: 'Aircraft' },
  default:  { color: '#e8c46a', glyph: '◎', shape: 'dot',  label: 'Target' },
};

export function styleFor(type) {
  return TARGET_STYLE[type] || TARGET_STYLE.default;
}
