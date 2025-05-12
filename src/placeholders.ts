interface ProcessResult {
    cleanedText: string;
    placeholders: Record<string, string>;
    formattingMarkers: Array<{ original: string, cleaned: string, type: string }>;
    leadingWhitespace: string;
    trailingWhitespace: string;
}

export function processDocument(text: string): ProcessResult {
    const placeholders: Record<string, string> = {};
    const formattingMarkers: Array<{ original: string, cleaned: string, type: string }> = [];
    let counter = 1;

    // Capture leading/trailing whitespace
    const leadingMatch = text.match(/^\s*/) || [''];
    const trailingMatch = text.match(/\s*$/) || [''];
    const leadingWhitespace = leadingMatch[0];
    const trailingWhitespace = trailingMatch[0];
    let processedText = text.slice(leadingWhitespace.length, text.length - trailingWhitespace.length);

    // Capture leading formatting markers
    const leadingFormattingRegex = /^(#{1,6}\s+|[-*+]\s*(?:\[ \]\s*)?|\\item\s*|\d+\.\s*|===+|\.\.\.)/;
    const leadingFormattingMatch = processedText.match(leadingFormattingRegex);
    if (leadingFormattingMatch) {
        const leadingFormatting = leadingFormattingMatch[0];
        formattingMarkers.push({
            original: leadingFormatting,
            cleaned: '',
            type: 'leading'
        });
        processedText = processedText.slice(leadingFormatting.length);
    }

    // Capture trailing formatting markers
    const trailingFormattingRegex = /(===+|---+|\.\.\.|\\end\{.*?}|\\\])$/;
    const trailingFormattingMatch = processedText.match(trailingFormattingRegex);
    if (trailingFormattingMatch) {
        const trailingFormatting = trailingFormattingMatch[0];
        formattingMarkers.push({
            original: trailingFormatting,
            cleaned: '',
            type: 'trailing'
        });
        processedText = processedText.slice(0, -trailingFormatting.length);
    }

    // Processing steps for code blocks, formulas, etc.
    const processingSteps = [
        {
            name: 'code-blocks',
            regex: /(```[\s\S]*?```|\\begin{verbatim}[\s\S]*?\\end{verbatim}|\\begin{lstlisting}[\s\S]*?\\end{lstlisting})/g,
            replacement: (match: string) => {
                const placeholder = `<code-${counter++}>`;
                placeholders[placeholder] = match;
                return placeholder;
            }
        },
        {
            name: 'block-formulas',
            regex: /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\begin{equation\*?}[\s\S]*?\\end{equation\*?})/g,
            replacement: (match: string) => {
                const placeholder = `<formula-${counter++}>`;
                placeholders[placeholder] = match;
                return placeholder;
            }
        },
        {
            name: 'inline-code',
            regex: /(`[^`]+`|\\verb\*?.(.*?)\1|\\texttt\{[^}]+\})/g,
            replacement: (match: string) => {
                const placeholder = `<code-${counter++}>`;
                placeholders[placeholder] = match;
                return placeholder;
            }
        },
        {
            name: 'inline-formulas',
            regex: /(\$[^$\n]+\$|\\\([\s\S]*?\\\)|#[\w]+\([^)]*\))/g,
            replacement: (match: string) => {
                const placeholder = `<formula-${counter++}>`;
                placeholders[placeholder] = match;
                return placeholder;
            }
        },
        {
            name: 'latex-formatting',
            regex: /(\\textbf\{([^}]+)\}|\\textit\{([^}]+)\}|\\emph\{([^}]+)\})/g,
            replacement: (match: string, p1: string, p2: string, p3: string, p4: string) => {
                const content = p2 || p3 || p4;
                const type = match.startsWith('\\textbf') ? 'bold' : 
                            match.startsWith('\\textit') ? 'italic' : 'emphasis';
                formattingMarkers.push({ original: match, cleaned: content, type });
                return content;
            }
        },
        {
            name: 'markdown-formatting',
            regex: /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_)/g,
            replacement: (match: string, p1: string, p2: string, p3: string, p4: string, p5: string) => {
                const content = p2 || p3 || p4 || p5;
                const type = match.startsWith('**') || match.startsWith('__') ? 'bold' : 'italic';
                formattingMarkers.push({ original: match, cleaned: content, type });
                return content;
            }
        }
    ];

    processingSteps.forEach(step => {
        processedText = processedText.replace(step.regex, step.replacement);
    });

    return {
        cleanedText: processedText,
        placeholders,
        formattingMarkers,
        leadingWhitespace,
        trailingWhitespace
    };
}

export function restoreDocument({ cleanedText, formattingMarkers, leadingWhitespace, placeholders, trailingWhitespace }: ProcessResult): string {
    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let restoredText = cleanedText;

    // Restore placeholders
    Object.entries(placeholders)
        .sort(([a], [b]) => b.length - a.length)
        .forEach(([placeholder, original]) => {
            restoredText = restoredText.replace(new RegExp(escapeRegExp(placeholder), 'g'), original);
        });

    // Extract leading and trailing formatting
    let leadingFormatting = '';
    let trailingFormatting = '';
    const otherMarkers = formattingMarkers.filter(marker => {
        if (marker.type === 'leading') {
            leadingFormatting = marker.original;
            return false;
        } else if (marker.type === 'trailing') {
            trailingFormatting = marker.original;
            return false;
        }
        return true;
    });

    // Restore other formatting markers
    otherMarkers.reverse().forEach(marker => {
        const patterns = [
            { regex: new RegExp(`\\b${escapeRegExp(marker.cleaned)}\\b`, 'g'), priority: 1 },
            { regex: new RegExp(escapeRegExp(marker.cleaned), 'g'), priority: 2 }
        ];
        for (const pattern of patterns) {
            if (restoredText.match(pattern.regex)) {
                restoredText = restoredText.replace(pattern.regex, marker.original);
                break;
            }
        }
    });

    return leadingWhitespace + leadingFormatting + restoredText + trailingFormatting + trailingWhitespace;
}