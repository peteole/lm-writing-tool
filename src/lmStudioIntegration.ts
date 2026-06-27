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

            let response: Response;
            try {
                response = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: this.family,
                        messages: stringMessages,
                        temperature: 0,
                        top_p: 0.5,
                        stream: true,
                    }),
                    signal: abortController.signal,
                });
            } catch (error) {
                reject(`Could not reach LM Studio: ${error}\n                    Is the LM Studio server running with a model loaded?\n                    Start it from the "Developer" tab in LM Studio.`);
                return;
            }

            if (!response.ok || !response.body) {
                reject(`LM Studio returned an error: HTTP ${response.status}`);
                return;
            }

            const body = response.body;
            async function* deltas(): AsyncGenerator<string> {
                const reader = body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        break;
                    }
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith('data:')) {
                            continue;
                        }
                        const data = trimmed.slice('data:'.length).trim();
                        if (data === '[DONE]') {
                            return;
                        }
                        try {
                            const parsed = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
                            const content = parsed.choices?.[0]?.delta?.content;
                            if (content) {
                                yield content;
                            }
                        } catch (error) {
                            console.warn('Could not parse LM Studio stream chunk', data, error);
                        }
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
