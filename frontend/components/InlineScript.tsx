/**
 * A script that must run while the browser parses the HTML — before React
 * exists. On the client it is rendered inert (`text/plain`): scripts inserted
 * through DOM updates never execute, and marking it as such keeps React from
 * warning about a script tag inside a component.
 */
export default function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
