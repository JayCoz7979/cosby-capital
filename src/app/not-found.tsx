import Link from "next/link";

/**
 * Custom 404 page.
 * Returns no information about admin routes or internal structure.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-bold text-[#0A1628] mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-[#0A1628] mb-4">
          Page Not Found
        </h2>
        <p className="text-gray-600 mb-8">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/dashboard"
          className="inline-block bg-[#0A1628] text-white px-6 py-3 rounded-lg hover:bg-[#1a2d4a] transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
