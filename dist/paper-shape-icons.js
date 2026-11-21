// Small static Word-like shape previews, never user-generated SVG markup.
const art={
 rect:'<rect x="4" y="4" width="24" height="16"/>',
 roundRect:'<rect x="4" y="4" width="24" height="16" rx="5"/>',
 square:'<rect x="8" y="2" width="16" height="20"/>',
 ellipse:'<ellipse cx="16" cy="12" rx="12" ry="8"/>',
 circle:'<circle cx="16" cy="12" r="10"/>',
 triangle:'<path d="M16 2 29 22H3Z"/>',
 diamond:'<path d="M16 2 29 12 16 22 3 12Z"/>',
 pentagon:'<path d="M16 2 29 10 24 22H8L3 10Z"/>',
 hexagon:'<path d="M10 2H22L30 12 22 22H10L2 12Z"/>',
 star:'<path d="M16 2 20 9 29 10 22 16 24 23 16 19 8 23 10 16 3 10 12 9Z"/>',
 line:'<path d="M4 20 28 4"/>',
 arrow:'<path d="M4 20 28 4M17 4H28V15"/>',
 doubleArrow:'<path d="M4 20 28 4M4 9V20H15M17 4H28V15"/>',
 branch3:'<path d="M3 20V12H29V20 M16 4V20"/>',
 connector:'<path d="M3 19H13V5H29"/>'
};
export function shapeIcon(kind){
 return '<svg class="paper-shape-icon" width="32" height="24" viewBox="0 0 32 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(art[kind]||art.rect)+'</svg>';
}
