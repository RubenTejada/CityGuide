import Image from "next/image";
import Link from "next/link";

// Minimal markdown renderer for article bodies: paragraphs, "## " headings,
// "- " bullet lists, "![alt](url)" image figures, **bold** and [text](url)
// links. Internal links (paths starting with "/") navigate client-side via
// next/link; external links open in a new tab. Kept deliberately small —
// article bodies are authored by the seeder/editors with only these constructs.

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const key = `${keyPrefix}-${index}`;
    if (match[1]) {
      const href = match[2];
      nodes.push(
        href.startsWith("/") ? (
          <Link key={key} href={href} className="font-medium text-brand-600 hover:underline">
            {match[1]}
          </Link>
        ) : (
          <a
            key={key}
            href={href}
            className="font-medium text-brand-600 hover:underline"
            rel="noopener noreferrer"
            target="_blank"
          >
            {match[1]}
          </a>
        ),
      );
    } else {
      nodes.push(<strong key={key}>{match[3]}</strong>);
    }
    last = pattern.lastIndex;
    index += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export default function ArticleBody({ markdown }: { markdown: string }) {
  const blocks = markdown
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="max-w-3xl space-y-4 text-neutral-700">
      {blocks.map((block, blockIndex) => {
        const key = `b${blockIndex}`;
        const image = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(block);
        if (image) {
          return (
            <figure key={key} className="py-2">
              <div className="relative aspect-video overflow-hidden rounded-xl bg-neutral-200">
                <Image
                  src={image[2]}
                  alt={image[1]}
                  fill
                  className="object-cover"
                  sizes="(min-width: 768px) 48rem, 100vw"
                />
              </div>
              {image[1] && (
                <figcaption className="mt-2 text-center text-sm text-neutral-500">
                  {image[1]}
                </figcaption>
              )}
            </figure>
          );
        }
        if (block.startsWith("## ")) {
          return (
            <h2 key={key} className="pt-2 text-xl font-semibold text-neutral-900">
              {renderInline(block.slice(3), key)}
            </h2>
          );
        }
        const lines = block.split("\n").map((line) => line.trim());
        if (lines.every((line) => line.startsWith("- "))) {
          return (
            <ul key={key} className="list-disc space-y-1 pl-5">
              {lines.map((line, lineIndex) => (
                <li key={`${key}-${lineIndex}`}>
                  {renderInline(line.slice(2), `${key}-${lineIndex}`)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={key} className="leading-relaxed">
            {renderInline(lines.join(" "), key)}
          </p>
        );
      })}
    </div>
  );
}
