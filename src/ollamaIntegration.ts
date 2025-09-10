import ollama, { ChatResponse } from 'ollama';
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

export class OllamaLLM implements vscode.LanguageModelChat {
    name: string;
    id: string;
    vendor: string;
    family: string;
    version: string;
    maxInputTokens: number;

    private getConfiguredModel(): string {
        const config = vscode.workspace.getConfiguration('lmWritingTool.ollama');
        return config.get<string>('model') || 'llama3.2:3b';
    }

    constructor(familiy: string, version: string) {
        this.name = 'ollama';
        this.id = 'ollama';
        this.vendor = 'ollama';
        this.family = familiy;
        this.version = version;
        this.maxInputTokens = 1024;
    }

    static async create() {
        try {
            await ollama.list();
        } catch (error) {
            console.warn('Could not reach ollama server. Select a copilot model.', error);
            vscode.window.showWarningMessage('Error creating OllamaLLM instance: ' + error);
            return;
        }

        // Get the configured model
        const config = vscode.workspace.getConfiguration('lmWritingTool.ollama');
        const configuredModel = config.get<string>('model') || 'llama3.2:3b';

        const availableModels = await ollama.list();
        if (availableModels.models.filter(model => model.model === configuredModel).length !== 1) {
            const res = await vscode.window.showQuickPick([`pull ${configuredModel} model`, 'cancel'], { placeHolder: `ollama model '${configuredModel}' not found. Do you want to pull it?` });
            if (res === `pull ${configuredModel} model`) {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Pulling ${configuredModel} model`,
                    cancellable: true
                }, async (progress, token) => {
                    const downloadResp = await ollama.pull({ model: configuredModel, stream: true });
                    token.onCancellationRequested(() => {
                        downloadResp.abort();

                    });
                    let previous = 0;
                    for await (const chunk of downloadResp) {
                        console.log(chunk);
                        if (chunk.total && chunk.completed !== undefined) {
                            progress.report({ increment: (chunk.completed - previous) / chunk.total * 100 });
                            previous = chunk.completed;
                        }
                    }
                    progress.report({ increment: 100 - previous });
                });
                vscode.window.showInformationMessage(`${configuredModel} model pulled successfully.`);
            }
            else {
                vscode.window.showInformationMessage(`ollama model '${configuredModel}' not found. Please pull it before using it or change the model in settings.`);
                return;
            }
        }
        const parts = configuredModel.split(':');
        if (parts.length !== 2) {

            return new OllamaLLM(configuredModel, "");
        }
        return new OllamaLLM(parts[0], parts[1]);
    }

    sendRequest(messages: vscode.LanguageModelChatMessage[], options?: vscode.LanguageModelChatRequestOptions, token?: vscode.CancellationToken): Thenable<vscode.LanguageModelChatResponse> {
        return new Promise(async (resolve, reject) => {
            vscode.LanguageModelChatMessageRole.User;
            const ROLE_TO_STRING = new Map([
                [vscode.LanguageModelChatMessageRole.User, 'user'],
                [vscode.LanguageModelChatMessageRole.Assistant, 'assistant'],
            ]);
            const stringMessages = messages.map(message => {
                return {
                    role: ROLE_TO_STRING.get(message.role) || 'user',
                    content: llmMessageToString(message),
                };
            });
            const defaultOptions = {
                temperature: 0,
                top_p: 0.5,
                top_k: 40
            };
            const lmOptions = Object.assign({}, defaultOptions, options);
            try {
                const configuredModel = this.getConfiguredModel();
                const response = await ollama.chat({
                    model: configuredModel,
                    messages: stringMessages,
                    stream: true,
                    options: lmOptions
                });
                const abortPromise = new Promise<void>((resolve, reject) => {
                    token?.onCancellationRequested(() => {
                        resolve();
                    });
                });
                async function* responseTextGenerator() {
                    for await (const chunk of response) {
                        const result = await Promise.race([chunk, abortPromise]);
                        if (result) {
                            yield result.message.content;
                        } else {
                            break;
                        }
                    }
                }
                async function* responseStreamGenerator() {
                    for await (const chunk of response) {
                        const result = await Promise.race([chunk, abortPromise]);
                        if (result) {
                            yield new vscode.LanguageModelTextPart(chunk.message.content);
                        } else {
                            break;
                        }
                    }
                }
                resolve(({
                    text: responseTextGenerator(),
                    stream: responseStreamGenerator(),
                }));
            } catch (error) {
                reject(`Could not reach ollama: ${error}
                    Have you installed and started the ollama server?
                    Find the instructions here: https://ollama.com/`);
                return;
            }
        });
    }
    countTokens(text: string | vscode.LanguageModelChatMessage, token?: vscode.CancellationToken): Thenable<number> {
        return Promise.resolve(text.toString().split(' ').length);
    }

}