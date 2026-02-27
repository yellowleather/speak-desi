import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';
import axios from 'axios';
import FormData from 'form-data';

let recordingProcess: ChildProcess | null = null;
let recordingFile: string | null = null;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    console.log('Sarvam Voice to Text extension activated');

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'sarvam-voice-to-text.record';
    statusBarItem.text = '$(unmute) Speak Claude Sarvam';
    statusBarItem.tooltip = 'Click to start voice recording (Cmd+Shift+Space)';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register command
    const disposable = vscode.commands.registerCommand('sarvam-voice-to-text.record', async () => {
        if (recordingProcess) {
            await stopRecording();
        } else {
            await startRecording();
        }
    });

    context.subscriptions.push(disposable);
}

async function startRecording() {
    try {
        // Check if sox is installed
        const soxCheck = spawn('which', ['sox']);
        await new Promise<void>((resolve, reject) => {
            soxCheck.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error('sox not found'));
                } else {
                    resolve();
                }
            });
        });

        // Create temporary file for recording
        recordingFile = path.join(os.tmpdir(), `sarvam-voice-${Date.now()}.wav`);

        // Start recording with sox (16kHz mono 16-bit WAV — suitable for Sarvam)
        recordingProcess = spawn('sox', [
            '-d',           // Default audio device
            '-r', '16000',  // Sample rate 16kHz
            '-c', '1',      // Mono
            '-b', '16',     // 16-bit
            recordingFile
        ]);

        statusBarItem.text = '$(mic) Recording...';
        statusBarItem.tooltip = 'Click to stop recording (Cmd+Shift+Space)';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');

        vscode.window.showInformationMessage('🎤 Recording... Press Cmd+Shift+Space again to stop');

        recordingProcess.on('error', (err) => {
            vscode.window.showErrorMessage(`Recording failed: ${err.message}`);
            resetRecordingState();
        });

    } catch (error: any) {
        if (error.message === 'sox not found') {
            const answer = await vscode.window.showErrorMessage(
                'SoX is required for audio recording. Install it to use voice input.',
                'Install via Homebrew',
                'Cancel'
            );
            if (answer === 'Install via Homebrew') {
                vscode.env.openExternal(vscode.Uri.parse('https://formulae.brew.sh/formula/sox'));
            }
        } else {
            vscode.window.showErrorMessage(`Failed to start recording: ${error.message}`);
        }
        resetRecordingState();
    }
}

async function stopRecording() {
    if (!recordingProcess || !recordingFile) {
        return;
    }

    // Stop recording
    recordingProcess.kill('SIGINT');
    recordingProcess = null;

    statusBarItem.text = '$(loading~spin) Transcribing...';
    statusBarItem.tooltip = 'Processing audio with Sarvam AI...';

    try {
        // Wait for file to be flushed
        await new Promise(resolve => setTimeout(resolve, 500));

        if (!fs.existsSync(recordingFile) || fs.statSync(recordingFile).size === 0) {
            throw new Error('No audio was recorded');
        }

        // Read config
        const config = vscode.workspace.getConfiguration('sarvamVoiceToText');
        const serviceUrl = config.get<string>('serviceUrl', 'http://localhost:48002');
        const language = config.get<string>('language', 'unknown');

        // Build multipart form
        const formData = new FormData();
        formData.append('file', fs.createReadStream(recordingFile), {
            filename: 'recording.wav',
            contentType: 'audio/wav',
        });
        formData.append('language', language);

        const response = await axios.post(`${serviceUrl}/transcribe`, formData, {
            headers: formData.getHeaders(),
            timeout: 60000,
        });

        const transcript: string = response.data.transcript;

        if (!transcript || transcript.trim().length === 0) {
            throw new Error('No speech detected in recording');
        }

        await insertText(transcript.trim());

        vscode.window.showInformationMessage(
            `✅ Transcribed: "${transcript.substring(0, 50)}${transcript.length > 50 ? '...' : ''}"`
        );

    } catch (error: any) {
        if (error.code === 'ECONNREFUSED') {
            vscode.window.showErrorMessage(
                'Sarvam service is not running. Start it with: cd sarvam-service && uvicorn main:app --port 48002'
            );
        } else {
            vscode.window.showErrorMessage(`Transcription failed: ${error.message}`);
        }
    } finally {
        if (recordingFile && fs.existsSync(recordingFile)) {
            fs.unlinkSync(recordingFile);
        }
        resetRecordingState();
    }
}

async function insertText(text: string) {
    // Try to insert into active text editor
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        await editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, text);
        });
        return;
    }

    // Webview input (e.g. Claude Code chat) or terminal — clipboard + simulate paste
    await vscode.env.clipboard.writeText(text);
    if (process.platform === 'darwin') {
        spawn('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down']);
    } else {
        vscode.window.showInformationMessage('Text copied to clipboard — press Ctrl+V to paste.');
    }
}

function resetRecordingState() {
    recordingProcess = null;
    recordingFile = null;
    statusBarItem.text = '$(unmute) Speak Claude Sarvam';
    statusBarItem.tooltip = 'Click to start voice recording (Cmd+Shift+Space)';
    statusBarItem.backgroundColor = undefined;
}

export function deactivate() {
    if (recordingProcess) {
        recordingProcess.kill();
    }
    if (recordingFile && fs.existsSync(recordingFile)) {
        fs.unlinkSync(recordingFile);
    }
}
