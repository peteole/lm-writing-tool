import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { applyCorrections, calculateCorrections } from '../correctionDiffing';
import { processDocument, restoreDocument } from '../placeholders';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Word diffing', () => {

		const original = "\n  This is a tes of wrds dffng.";
		const corrected = " \n  This is a test of words diffing.";
		const corrections = calculateCorrections(original, corrected);
		assert.strictEqual(corrections.length, 4, corrections.map(c => c.toInsert).join(", "));
		const applied = applyCorrections(original, corrections);
		assert.strictEqual(applied, corrected);

	});

	test('placeholders', ()=>{
		function testPlaceholderSample(text: string, expectedCleanedText: string){
			const processed=processDocument(text);
			assert.strictEqual(processed.cleanedText, expectedCleanedText);
			const restored = restoreDocument(processed);
			assert.strictEqual(restored, text);
		}
		testPlaceholderSample(
			"	\\textbf{This is a test} of \\textit{word} diffing.",
			"This is a test of word diffing."
		);
		testPlaceholderSample(
			"== This is a heading",
			"This is a heading"
		);
	});
});
