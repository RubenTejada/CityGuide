/**
 * Renders schema.org structured data. One <script> per call; an array is wrapped
 * in a "@graph" node, because a bare top-level array carries no "@context" and
 * consumers that read it (crawlers, SEO extensions) break on the missing key.
 */
export default function JsonLd({ data }: { data: object | object[] }) {
  const graph = Array.isArray(data)
    ? { "@context": "https://schema.org", "@graph": data }
    : data;

  return (
    <script
      type="application/ld+json"
      // Escaping "<" keeps content text from closing the script tag early.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replace(/</g, "\\u003c"),
      }}
    />
  );
}
