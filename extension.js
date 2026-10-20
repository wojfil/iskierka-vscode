const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

let decorationRule;
let decorationInput;
let decorationOutput;
let decorationNothing;


function makeColor(html) {
    return vscode.window.createTextEditorDecorationType({
        color: html
    });
}


function setColors() {
    const theme = vscode.window.activeColorTheme.kind;
    const isLight = theme === vscode.ColorThemeKind.Light
                 || theme === vscode.ColorThemeKind.HighContrastLight;

    decorationRule = makeColor(
        isLight ? "#B88600" : "#FFD700"
    );
    decorationInput = makeColor(
        isLight ? "#00A854" : "#00E676"
    );
    decorationOutput = makeColor(
        isLight ? "#0099CC" : "#00CCFF"
    );
    decorationNothing = makeColor(
        isLight ? "#858585" : "#707070"
    );
}

// replicate the exact trim() function from Iskierka
function iskierkaTrim(value) {
    return value.replace(/^[ \t-\r]+|[ \t-\r]+$/g, '');
}

function activate(context) {
    setColors();

    function updateDecorations(editor) {
        if (!editor) {
            return;
        }

        const document = editor.document;

        if (document.languageId.toLowerCase() !== "iskierka") {
            return;
        }

        const linesRule = [];
        const linesInput = [];
        const linesOutput = [];
        const linesNothing = [];

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i).text;
            const trimmed = iskierkaTrim(line);

            if (trimmed.startsWith("#") && ! trimmed.startsWith("##")) {
                linesRule.push(new vscode.Range(i, 0, i, line.length));

                if (i + 1 < document.lineCount) {
                    const nextLine = document.lineAt(i + 1).text;
                    const nextLineTrim = iskierkaTrim(nextLine);

                    if (nextLineTrim !== "") {
                        i++;

                        if (nextLineTrim === "__nothing") {
                            linesNothing.push(new vscode.Range(i, 0, i, nextLine.length));
                        }
                        else {
                            linesInput.push(new vscode.Range(i, 0, i, nextLine.length));
                        }
                        
                        if (i + 1 < document.lineCount) {
                            const lineAfterNext = document.lineAt(i + 1).text;
                            const lineAfterNextTrim = iskierkaTrim(lineAfterNext);

                            if (lineAfterNextTrim !== "") {
                                i++;

                                if (lineAfterNextTrim === "__nothing") {
                                    linesNothing.push(new vscode.Range(i, 0, i, lineAfterNext.length));
                                }
                                else {
                                    linesOutput.push(new vscode.Range(i, 0, i, lineAfterNext.length));
                                }
                            }
                        }
                    }
                }
            }
        }

        editor.setDecorations(
            decorationRule,
            linesRule
        );

        editor.setDecorations(
            decorationInput,
            linesInput
        );

        editor.setDecorations(
            decorationOutput,
            linesOutput
        );

        editor.setDecorations(
            decorationNothing,
            linesNothing
        );
    }

    if (vscode.window.activeTextEditor) {
        updateDecorations(
            vscode.window.activeTextEditor
        );
    }

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            const editor =
                vscode.window.activeTextEditor;

            if (
                editor &&
                editor.document === event.document
            ) {
                updateDecorations(editor);
            }
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                updateDecorations(editor);
            }
        })
    );

    context.subscriptions.push(
        decorationRule,
        decorationInput,
        decorationOutput,
        decorationNothing
    );

    context.subscriptions.push(
        vscode.workspace.onDidCreateFiles(async event => {

            for (const file of event.files) {
                try {
                    const document = await vscode.workspace.openTextDocument(file);
                    await fillTemplate(document);
                } 
                catch (error) {
                    console.error("The file could not be processed:", error);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(
            async document => {
                await fillTemplate(document);
            }
        )
    );


    const definitionProvider = vscode.languages.registerDefinitionProvider({ language: "iskierka" },
        {
            provideDefinition(document, position) {
                const range =
                    document.getWordRangeAtPosition(
                        position,
                        /_[a-zA-Z0-9_]+/
                    );

                if (!range) {
                    return undefined;
                }

                const name = document.getText(range);

                const directory = path.dirname(document.uri.fsPath);

                const targetPath =
                    path.join(
                        directory,
                        `${name.substring(1)}.iski`
                    );

                if (!fs.existsSync(targetPath)) {
                    return undefined;
                }

                return new vscode.Location(
                    vscode.Uri.file(targetPath),
                    new vscode.Position(0, 0)
                );
            }
        }
    );

    context.subscriptions.push(
        definitionProvider
    );

    for (const document of vscode.workspace.textDocuments) {
        fillTemplate(document);
    }

    context.subscriptions.push(
        vscode.window.onDidChangeActiveColorTheme(() => {
            decorationRule.dispose();
            decorationInput.dispose();
            decorationOutput.dispose();
            decorationNothing.dispose();
            setColors();
            updateDecorations(vscode.window.activeTextEditor);
        })
    );
}


function startsWithPrefixWord(fileName, word) {
    if (word.length >= fileName.length) {
        return false;
    }

    if (! fileName.startsWith(word)) {
        return false;
    }

    const ch = fileName[word.length];
    return ch === ch.toUpperCase() && ch !== ch.toLowerCase();
}


function linesToString(lines) {
    let result = '';

    for (let i = 0; i < lines.length; i++) {
        if (i !== 0) {
            result += '\n';
        }

        result += lines[i];
    }

    return result;
}


function getTemplateForEmptyFile(fileName) {
    if (/^[A-Za-z]$/.test(fileName[0])) {
        const name = fileName.split('.')[0];
        
        return linesToString([
            '',
            `#${name}`,
            ''
        ]);
    }

    return null;
}

async function fillTemplate(document) {
    if (document.languageId.toLowerCase() !== "iski") {
        return;
    }

    if (document.getText() !== "") {
        return;
    }

    const fileName = document.fileName.split(/[\\/]/).pop();

    if (! fileName.endsWith(".iski")) {
        return;
    }

    const template = getTemplateForEmptyFile(fileName);

    if (template === null) {
        return;
    }

    const edit = new vscode.WorkspaceEdit();

    edit.insert(
        document.uri,
        new vscode.Position(0, 0),
        template
    );

    const success = await vscode.workspace.applyEdit(edit);

    if (! success) {
        return;
    }

    const editor = await vscode.window.showTextDocument(
        document,
        {
            preview: false
        }
    );

    const end = editor.document.positionAt(
        editor.document.getText().length
    );

    editor.selection = new vscode.Selection(
        end,
        end
    );

    editor.revealRange(
        new vscode.Range(end, end),
        vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
}


function deactivate() {
    // nothing as expected
}


module.exports = {
    activate,
    deactivate
};
