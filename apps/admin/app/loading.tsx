export default function AdminLoading() {
  return (
    <main className="admin-loading-state" aria-label="Loading admin workspace">
      <div className="admin-loading-shell">
        <div className="admin-skeleton admin-skeleton--title" />
        <div className="admin-skeleton admin-skeleton--line" />
        <div className="admin-skeleton admin-skeleton--line" />
        <div className="admin-skeleton admin-skeleton--panel" />
      </div>
    </main>
  );
}
