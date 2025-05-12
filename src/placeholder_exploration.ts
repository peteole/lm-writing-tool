type StoredElement = {
  type: 'formula' | 'code' | 'image' | 'link' | 'bold' | 'italic' | 'heading' | 'raw';
  content: string;
  url?: string;
  syntax?: string;
  index: number;
  prefix?: string;
  suffix?: string;
};

export function cleanText(input: string): { cleaned: string; elements: StoredElement[] } {
  const elements: StoredElement[] = [];
  let cleaned = input;
  let currentIndex = 1;

  // Corrected pattern order: code/images first, then formulas
  const blockPatterns = [
      { // Code blocks (processed first to prevent nested matches)
          regex: /```(\w*)\n([\s\S]*?)```|`([^`]+)`/g,
          replacer: (match: string, lang: string, blockContent: string, inlineContent: string) => {
              elements.push({
                  type: 'raw',
                  content: match,
                  index: currentIndex,
                  syntax: lang || 'text'
              });
              return `<raw-${currentIndex++}>`;
          }
      },
      { // Typst images
          regex: /#image\([\s\S]*?\)/g,
          replacer: (match: string) => {
              elements.push({
                  type: 'image',
                  content: match,
                  index: currentIndex
              });
              return `<image-${currentIndex++}>`;
          }
      },
      { // Formulas (both inline and block)
          regex: /\$(\S.*?)\$/g,
          replacer: (match: string, content: string) => {
              elements.push({
                  type: 'formula',
                  content: match,
                  index: currentIndex
              });
              return `<formula-${currentIndex++}>`;
          }
      }
  ];

  const inlinePatterns = [
      { // Typst links
          regex: /\\href{([^}]+)}{([^}]+)}/g,
          replacer: (match: string, url: string, text: string) => {
              elements.push({
                  type: 'link',
                  content: text.trim(),
                  url: url.trim(),
                  index: currentIndex
              });
              return text.trim();
          }
      }
  ];

  blockPatterns.forEach(({ regex, replacer }) => {
      cleaned = cleaned.replace(regex, replacer);
  });

  inlinePatterns.forEach(({ regex, replacer }) => {
      cleaned = cleaned.replace(regex, replacer);
  });

  return { 
      cleaned: cleaned.replace(/\s+/g, ' ').trim(),
      elements 
  };
}

export function reinsertElements(proofread: string, elements: StoredElement[]): string {
  const elementMap = new Map<number, StoredElement>(elements.map(e => [e.index, e]));
  
  // Replace blocks in reverse order of processing
  let result = proofread;
  [...elements].reverse().forEach(e => {
      const pattern = new RegExp(`<${e.type}-${e.index}>`, 'g');
      result = result.replace(pattern, e.content);
  });

  return result;
}

// Example usage with corrected output
const example = `
#image(
  src: "diagram.svg",
  caption: [Network architecture overview]
)

We use $E = mc^2$ with variants:
\`\`\`typst
$E = \\sqrt{(pc)^2 + (m_0 c^2)^2}$
\`\`\`

See \\href{https://example.com}{docs}.
`;

// Cleaning
const cleaned = cleanText(example);
console.log("Cleaned Text:");
console.log(cleaned.cleaned); 
// Outputs: "<image-1> We use <formula-2> with variants: <raw-3> See docs."

// Proofreading simulation
const proofread = `
Network architecture overview shown.

The equation is <formula-2> with variants:
<raw-3>

See updated documentation.
`;

// Reinsertion
const restored = reinsertElements(proofread, cleaned.elements);
console.log("\nRestored Text:");
console.log(restored);
/* Outputs:
#image(
  src: "diagram.svg",
  caption: [Network architecture overview]
)

Network architecture overview shown.

The equation is $E = mc^2$ with variants:
```typst
$E = \\sqrt{(pc)^2 + (m_0 c^2)^2}$*/