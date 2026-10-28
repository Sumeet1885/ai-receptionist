// Original floral vine inspired by the user's folk-art reference.
// A narrow trim keeps the artwork away from navigation labels and controls.
const vine = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="12" viewBox="0 0 192 12">
  <path d="M0 6Q12 0 24 6T48 6T72 6T96 6T120 6T144 6T168 6T192 6" fill="none" stroke="#24695c" stroke-width=".8" opacity=".55"/>
  <g fill="#24695c" opacity=".55"><path d="M9 5Q8 0 15 1Q15 5 9 5ZM37 7Q38 12 44 11Q44 7 37 7ZM105 5Q104 0 111 1Q111 5 105 5ZM133 7Q134 12 140 11Q140 7 133 7Z"/></g>
  <g fill="#c46a47" opacity=".65"><circle cx="65" cy="3" r="2"/><circle cx="62" cy="6" r="2"/><circle cx="68" cy="6" r="2"/><circle cx="65" cy="9" r="2"/></g>
  <g fill="#b18b37" opacity=".65"><circle cx="161" cy="3" r="2"/><circle cx="158" cy="6" r="2"/><circle cx="164" cy="6" r="2"/><circle cx="161" cy="9" r="2"/></g>
  <g fill="#f6f4eb"><circle cx="65" cy="6" r="1.2"/><circle cx="161" cy="6" r="1.2"/></g>
</svg>`;

const backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(vine)}")`;

export function FolkNavBorder() {
  return <span aria-hidden="true" style={{
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 9,
    display: 'block', pointerEvents: 'none', backgroundImage,
    backgroundRepeat: 'repeat-x', backgroundPosition: 'center', backgroundSize: '192px 9px',
  }} />;
}
