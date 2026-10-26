export default function MockBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return <div className="mock-badge">샘플 데이터(모킹)</div>;
}
