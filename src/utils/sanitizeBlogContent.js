import sanitizeHtml from "sanitize-html";

/**
 * Sanitizes TinyMCE-generated HTML content before saving to the database.
 * Strips <script>, on* event attributes, javascript: URLs, and other XSS vectors
 * while preserving all rich-text formatting tags that TinyMCE produces.
 */
export function sanitizeBlogContent(content) {
  if (!content) return "";

  return sanitizeHtml(content, {
    allowedTags: [
      // Text structure
      "p", "br", "hr", "div", "span",
      // Headings
      "h1", "h2", "h3", "h4", "h5", "h6",
      // Inline formatting
      "strong", "b", "em", "i", "u", "s", "mark", "sup", "sub", "small",
      // Links & media
      "a", "img", "figure", "figcaption",
      // Lists
      "ul", "ol", "li",
      // Blockquotes & code
      "blockquote", "pre", "code",
      // Tables
      "table", "thead", "tbody", "tfoot", "tr", "th", "td",
    ],
    allowedAttributes: {
      "*": ["class", "style", "id"],
      "a": ["href", "target", "rel", "title"],
      "img": ["src", "alt", "title", "width", "height", "loading"],
      "td": ["colspan", "rowspan"],
      "th": ["colspan", "rowspan", "scope"],
    },
    allowedSchemes: ["http", "https", "mailto", "data"],
    // Strip data: URIs from non-image elements
    allowedSchemesByTag: {
      img: ["http", "https", "data"],
    },
    // Enforce safe rel on links
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          // Force external links to open safely
          ...(attribs.href && !attribs.href.startsWith("/")
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {}),
        },
      }),
    },
  });
}
