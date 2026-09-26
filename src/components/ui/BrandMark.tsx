/** The Recktube "R": a bold R whose bowl holds a play button. Inherits text colour. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="15 11 35 42" className={className} aria-hidden="true" fill="currentColor">
      <path fillRule="evenodd" d="M17 13h18.5C43 13 47.5 17.8 47.5 24.5c0 5.2-3 9-7.6 10.4L48.5 51h-9.6L31.3 36H26v15h-9zM26 19.5v11l9.5-5.5z" />
    </svg>
  );
}
