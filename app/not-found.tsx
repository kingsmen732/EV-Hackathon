import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto grid min-h-[60dvh] max-w-md place-items-center p-6 text-center">
      <div>
        <p className="font-mono text-5xl font-semibold text-volt-400">404</p>
        <h1 className="mt-2 text-lg font-semibold">Page not found</h1>
        <Link href="/" className="btn-primary mt-4">ChargeMesh</Link>
      </div>
    </div>
  );
}
