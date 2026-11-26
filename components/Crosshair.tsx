/** Registration mark. Marks the corners of a plate, exactly as a plate section
 *  registers its images. Structural, not ornamental: it is how a plate's extent
 *  is declared without drawing a box around it. */
export function Crosshair({ className }: { className?: string }) {
  return (
    <svg className={className} width="9" height="9" viewBox="0 0 9 9" aria-hidden="true" focusable="false">
      <path d="M4.5 0v9M0 4.5h9" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
