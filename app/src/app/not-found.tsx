import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mx-auto max-w-md px-6 py-12 text-center">
      <p className="eyebrow">404</p>
      <p className="h2 mt-2">Böyle bir sayfa yok.</p>
      <p className="mt-1.5 text-[13px] text-muted">Bağlantı eskimiş ya da yanlış yazılmış olabilir.</p>
      <Link href="/" className="btn-secondary mt-5">
        Ana sayfaya dön →
      </Link>
    </div>
  );
}
