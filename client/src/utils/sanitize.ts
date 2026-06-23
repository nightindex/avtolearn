import DOMPurify from "dompurify";

export function sanitizeTopicHtml(html: string) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "a",
      "b",
      "blockquote",
      "br",
      "div",
      "em",
      "h1",
      "h2",
      "h3",
      "h4",
      "hr",
      "i",
      "li",
      "ol",
      "p",
      "span",
      "strong",
      "table",
      "tbody",
      "td",
      "th",
      "thead",
      "tr",
      "u",
      "ul",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "title", "colspan", "rowspan"],
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ["style"],
  });
}
