# LLM Writing Tool  

After Grammarly disabled its API, no equivalent grammar-checking tool exists for VSCode. While [LTeX](https://marketplace.visualstudio.com/items?itemName=valentjn.vscode-ltex) catches spelling mistakes and some grammatical errors, it lacks the deeper linguistic understanding that Grammarly provides.  

This extension bridges the gap by leveraging large language models (LLMs). It chunks text into paragraphs, asks an LLM to proofread each paragraph, and highlights potential errors. Users can then click on highlighted errors to view and apply suggested corrections.  

## Features  

![LLM-based grammar checking](resources/demo.gif)  

- **LLM-powered grammar checking** in American English  
- **Inline corrections** via quick fixes  
- **Choice of models**: Use a local `llama3.2:3b` model via [Ollama](https://ollama.com/) or `gpt-40-mini` through the [VSCode LM API](https://code.visualstudio.com/api/extension-guides/language-model)  
- **Rewrite suggestions** to improve clarity  
- **Synonym recommendations** for better word choices  
- **Configurable system prompts** to customize language variant, writing style, and behavior
- **Configurable Ollama models** to use any local model that fits your needs and hardware  

## Commands  

When the first command is executed, a dialog appears allowing users to select either a local Ollama model or the GitHub Copilot model.  

- **Local Model**: Requires installing and running a local [Ollama server](https://ollama.com/).  
- **Online Model**: Requires a [GitHub Copilot](https://github.com/features/copilot) subscription.  

### Available Commands  

- **"LLM Writing Tool: Start Text Check for Current Document"**  
  Continuously checks the text in the current document. Prompts the user to select an LLM model.  
- **"LLM Writing Tool: Stop Text Check for Current Document"**  
  Stops real-time grammar checking.  
- **"LLM writing tool: Rewrite current selection"**
  Rewrites the selected text for clarity.
- **"LLM writing tool: Get synonyms for selection"**
  Suggests synonyms for the selected expression.
- **"LLM writing tool: Select model"**
  Selects the LLM model to use for grammar checking. Stops real-time grammar checking if it is running.
- **"LLM writing tool: Reset prompts to defaults"**
  Resets all customized system prompts back to their default values.
- **"LLM writing tool: Reset all settings to defaults"**
  Resets all extension settings (prompts and Ollama model) back to their default values.

## Configuration

The extension now supports configurable system prompts and Ollama model selection, allowing you to customize how the LLM interacts with your text. This enables you to:

- **Change the language variant** (e.g., British English instead of American English)
- **Adjust the writing style** (e.g., formal vs. casual tone)
- **Use different Ollama models** (e.g., faster or higher-quality models)
- **Modify the number of synonyms** returned
- **Customize the behavior** for specific use cases

### Accessing Settings

1. Open VS Code Settings (`Cmd+,` on macOS, `Ctrl+,` on Windows/Linux)
2. Search for "LLM Writing Tool"
3. Configure the three available prompt settings:

### Available Settings

**Prompt Configuration:**

- **`lmWritingTool.prompts.proofreading`**  
  Controls how the extension checks for grammar and spelling errors.  
  *Default*: Checks for American English grammar and spelling mistakes.

- **`lmWritingTool.prompts.rewrite`**  
  Controls how the extension rewrites text for clarity.  
  *Default*: Rewrites text for clarity in American English.

- **`lmWritingTool.prompts.synonyms`**  
  Controls how the extension finds synonyms for selected expressions.  
  *Default*: Provides up to 5 synonyms.

**Ollama Configuration:**

- **`lmWritingTool.ollama.model`**  
  Specifies which Ollama model to use for local text processing.  
  *Default*: `llama3.2:3b`  
  *Examples*: `llama3.2:1b`, `llama3.1:8b`, `codellama:7b`, `mistral:7b`

### Placeholders

When customizing prompts, use these placeholders:

- `{text}` - The text to be processed (for proofreading and rewrite prompts)
- `{expression}` - The selected expression (for synonyms prompt)

### Example Customizations

**British English proofreading:**

```text
Proofread the following message in British English. If it is grammatically correct, just respond with the word "Correct". If it is grammatically incorrect or has spelling mistakes, respond with "Correction: ", followed by the corrected version. Use British spelling and grammar conventions.\n{text}
```

**Formal writing style:**

```text
Rewrite the following text in a formal, academic tone using British English. Maintain the original meaning while improving clarity and formality:\n{text}
```

**More synonyms:**

```text
Give up to 10 synonyms for the expression "{expression}". Provide varied alternatives including formal and informal options. Just respond with the synonyms, separated by newlines.
```

**Using a different Ollama model:**

Set `lmWritingTool.ollama.model` to `llama3.1:8b` for better quality (but slower) processing, or `llama3.2:1b` for faster (but lower quality) processing.

### Resetting Settings

**Reset prompts only:**

1. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Type "LLM writing tool: Reset prompts to defaults"
3. Press Enter

**Reset all settings (prompts + Ollama model):**

1. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Type "LLM writing tool: Reset all settings to defaults"
3. Press Enter

## Installation  

1. Install the extension from the [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=OlePetersen.lm-writing-tool).  
2. Choose your LLM backend:
   - **Local (Ollama)**: Install [Ollama](https://ollama.com/) and pull `llama3.2:3b` by running:
     ```bash
     ollama pull llama3.2:3b
     ```
     Ensure Ollama is running with:
     ```bash
     ollama list
     ```
     If Ollama isn't already running, start it with:
     ```bash
     ollama serve
     ```
     
   - **Remote (GitHub Copilot)**: Subscribe to [GitHub Copilot](https://github.com/features/copilot) for online LLM access.


## How It Works  

1. The extension **splits the text into sections** and sends them to the selected LLM for proofreading.  
2. It then **compares the LLM’s suggestions** with the original text to detect changes.  
3. **Detected errors are highlighted**, and users can apply quick fixes with a click.  
4. **Responses are cached** to minimize repeated API calls.  
5. Every **5 seconds,** the extension checks for text changes and reprocesses modified sections.  

## Roadmap  

- [ ] **On-disk caching** to improve startup times and reduce redundant API requests.  
- [ ] **Smarter text chunking** to ensure uniform section sizes (e.g., ~2 full lines per section instead of splitting by line).  
- [ ] **Support for additional languages**, starting with British English. Future versions may support any language available in the LLM.  
- [ ] **Evaluation of alternative models** for improved results, with prompt adjustments as needed.  

## Contributing  

Contributions are welcome! Feel free to:  

- Open an issue  
- Submit a pull request  
- Contact me directly: [peteole2707@gmail.com](mailto:peteole2707@gmail.com)
