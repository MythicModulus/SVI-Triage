export function Card({ className = "", ...props }) {
  return (
    <div
      className={`rounded-lg border shadow-sm ${className}`}
      {...props}
    />
  );
}
