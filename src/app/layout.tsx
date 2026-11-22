/**
 * Root layout — intentionally minimal.
 * The <html>/<body> shell (with per-locale lang/dir, fonts and metadata)
 * lives in src/app/[locale]/layout.tsx, per the App Router i18n pattern.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
