import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

// Renders policy markdown (GFM tables supported) with sanitisation, themed via
// the .prose-genbays styles in globals.css.
export function PolicyMarkdown({ content }: { content: string }) {
  return (
    <article className="prose prose-genbays prose-sm sm:prose-base">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
