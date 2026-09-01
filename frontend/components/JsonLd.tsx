/**
 * Renders schema.org structured data. One <script> per call; pass an array to
 * emit a @graph-less list of independent entities.
 */
export default function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      // Escaping "<" keeps content text from closing the script tag early.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
