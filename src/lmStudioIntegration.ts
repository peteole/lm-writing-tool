import * as vscode from 'vscode';

function llmMessageToString(message: vscode.LanguageModelChatMessage): string {
    let str = '';
    for (const part of message.content) {
        if (part instanceof vscode.LanguageModelTextPart) {
            str += part.value;
        }
    }
    return str;
}

type OpenAIChatMessage = { role: string; content: string };

function getBaseUrl(): string {
    const config = vscode.workspace.getConfiguration('lmWritingTool.lmStudio');
    const raw = config.get<string>('baseUrl') || 'http://localhost:1234/v1';
    return raw.replace(/\/+$/, '');
}

function getConfiguredModel(): string {
    const config = vscode.workspace.getConfiguration('lmWritingTool.lmStudio');
    return config.get<string>('model') || '';
}

/**
 * LanguageModelChat implementation backed by a local LM Studio server.
 * LM Studio exposes an OpenAI-compatible API (default http://localhost:1234/v1).
 */
export class LMStudioLLM implements vscode.LanguageModelChat {
    name: string;
    id: string;
    vendor: string;
    family: string;
    version: string;
    maxInputTokens: number;

    constructor(family: string) {
        this.name = 'lmstudio';
        this.id = 'lmstudio';
        this.vendor = 'lmstudio';
        this.family = family;
        this.version = '';
        this.maxInputTokens = 1024;
    }

    static async create(): Promise<LMStudioLLM | undefined> {
        const baseUrl = getBaseUrl();
        let availableModels: string[] = [];
        try {
            const response = await fetch(`${baseUrl}/models`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const body = await response.json() as { data?: { id: string }[] };
            availableModels = (body.data || []).map(m => m.id);
        } catch (error) {
            console.warn('Could not reach LM Studio server.', error);
            return;
        }

        if (availableModels.length === 0) {
            vscode.window.showWarningMessage('LM Studio is reachable but has no model loaded. Load a model in LM Studio and try again.');
            return;
        }

        const configuredModel = getConfiguredModel();
        if (configuredModel && !availableModels.includes(configuredModel)) {
            vscode.window.showWarningMessage(`LM Studio model '${configuredModel}' is not loaded. Available: ${availableModels.join(', ')}.`);
            return;
        }

        const model = configuredModel || availableModels[0];
        return new LMStudioLLM(model);
    }

    sendRequest(messages: vscode.LanguageModelChatMessage[], options?: vscode.LanguageModelChatRequestOptions, token?: vscode.CancellationToken): Thenable<vscode.LanguageModelChatResponse> {
        return new Promise(async (resolve, reject) => {
            const ROLE_TO_STRING = new Map([
                [vscode.LanguageModelChatMessageRole.User, 'user'],
                [vscode.LanguageModelChatMessageRole.Assistant, 'assistant'],
            ]);
            const stringMessages: OpenAIChatMessage[] = messages.map(message => ({
                role: ROLE_TO_STRING.get(message.role) || 'user',
                content: llmMessageToString(message),
            }));

            const baseUrl = getBaseUrl();
            const abortController = new AbortController();
            token?.onCancellationRequested(() => abortController.abort());

            const isAbort = (error: unknown) =>
                abortController.signal.aborted || (error instanceof Error && error.name === 'AbortError');

            async function* empty(): AsyncGenerator<never> { /* nothing to yield */ }

            let response: Response;
            try {
                response = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        // Re-read the setting on each request so model changes take effect without reselecting.
                        model: getConfiguredModel() || this.family,
                        messages: stringMessages,
                        temperature: 0,
                        top_p: 0.5,
                        stream: true,
                    }),
                    signal: abortController.signal,
                });
            } catch (error) {
                if (isAbort(error)) {
                    // Cancellation is expected (e.g. the document changed); end quietly.
                    resolve({ text: empty(), stream: empty() });
                    return;
                }
                reject(`Could not reach LM Studio: ${error}\n                    Is the LM Studio server running with a model loaded?\n                    Start it from the "Developer" tab in LM Studio.`);
                return;
            }

            if (!response.ok || !response.body) {
                const detail = await response.text().catch(() => '');
                reject(`LM Studio returned an error: HTTP ${response.status}${detail ? ` - ${detail}` : ''}`);
                return;
            }

            const body = response.body;
            function parseLine(line: string): string | undefined {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) {
                    return;
                }
                const data = trimmed.slice('data:'.length).trim();
                if (data === '[DONE]') {
                    return;
                }
                let parsed: { choices?: { delta?: { content?: string } }[]; error?: { message?: string } | string };
                try {
                    parsed = JSON.parse(data);
                } catch (error) {
                    console.warn('Could not parse LM Studio stream chunk', data, error);
                    return;
                }
                if (parsed.error) {
                    const message = typeof parsed.error === 'string' ? parsed.error : parsed.error.message;
                    throw new Error(`LM Studio error: ${message || 'unknown error'}`);
                }
                return parsed.choices?.[0]?.delta?.content || undefined;
            }
            async function* deltas(): AsyncGenerator<string> {
                const reader = body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) {
                            break;
                        }
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';
                        for (const line of lines) {
                            const content = parseLine(line);
                            if (content) {
                                yield content;
                            }
                        }
                    }
                } catch (error) {
                    if (isAbort(error)) {
                        return;
                    }
                    throw error;
                }
                // Flush any final line that arrived without a trailing newline.
                const tail = (buffer + decoder.decode()).trim();
                if (tail.length > 0) {
                    const content = parseLine(tail);
                    if (content) {
                        yield content;
                    }
                }
            }

            async function* responseTextGenerator(): AsyncGenerator<string> {
                yield* deltas();
            }
            async function* responseStreamGenerator(): AsyncGenerator<vscode.LanguageModelTextPart> {
                for await (const delta of deltas()) {
                    yield new vscode.LanguageModelTextPart(delta);
                }
            }

            resolve({
                text: responseTextGenerator(),
                stream: responseStreamGenerator(),
            });
        });
    }

    countTokens(text: string | vscode.LanguageModelChatMessage): Thenable<number> {
        return Promise.resolve(text.toString().split(' ').length);
    }
}
