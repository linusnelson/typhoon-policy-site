import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

// Renders policy markdown (GFM tables supported) with sanitisation, themed via
// the .prose-typhoon styles in globals.css.
export function PolicyMarkdown({ content }: { content: string }) {
  return (
    <article className="prose prose-typhoon prose-sm sm:prose-base">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
