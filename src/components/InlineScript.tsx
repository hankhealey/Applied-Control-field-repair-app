/**
 * An inline <script> that runs during the server's HTML parse (before first
 * paint) but stays inert on the client.
 *
 * React 19 warns in development whenever a component renders a <script> tag,
 * because scripts inserted by React on the client never execute. For a
 * run-once script (theme no-flash, etc.) that already did its job server-side,
 * the warning is noise. Setting the type to text/plain on the client makes
 * React treat the element as inert data rather than a script, silencing the
 * warning; text/javascript on the server keeps it executable during SSR.
 * suppressHydrationWarning covers the type attribute differing between the two.
 *
 * Pattern taken from the Next 16 guide
 * node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
