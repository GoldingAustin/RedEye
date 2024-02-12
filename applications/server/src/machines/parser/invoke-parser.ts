import * as readline from 'node:readline';
import path from 'path';
import { getRuntimeDir } from '../../util';
import { createLoggerInstance, getParserPrefixAndMessage, ParserMessageTypes } from '@redeye/parser-core';
import type { ChildProcess } from 'child_process';
import { exec, execFile } from 'child_process';

export const invokeParser = <T>(parserName: string, args: string[], loggingFolderPath?: string) =>
	new Promise<T>((resolve, reject) => {
		try {
			const logger = loggingFolderPath ? createLoggerInstance(loggingFolderPath) : undefined;
			let parserProcess: ChildProcess | undefined;
			if (process.pkg) {
				const baseCommand = path.resolve(getRuntimeDir(), 'parsers', parserName);
				parserProcess = execFile(baseCommand, args);
			} else {
				parserProcess = exec(`${parserName} ${args.join(' ')}`);
			}

			parserProcess.stderr?.on('data', (d) => {
				console.error('ERROR: stderr', { parserName, d });
				reject(d);
			});

			const rl = readline.createInterface({ input: parserProcess.stdout } as any);
			rl.on('line', (data) => {
				if (typeof data === 'string') {
					const [prefix, message] = getParserPrefixAndMessage(data);
					if (prefix === ParserMessageTypes.Data) {
						resolve(JSON.parse(message));
					} else if (prefix === ParserMessageTypes.Progress) {
						console.log({ parserName, prefix, message }); // TODO: Update campaign progress
					} else if (prefix === ParserMessageTypes.Log) {
						if (logger) {
							logger(JSON.parse(message));
						} else {
							console.log({ parserName, message });
						}
					} else if (prefix === ParserMessageTypes.Debug) {
						console.log({ parserName, message });
					} else {
						console.log({ parserName, data });
					}
				} else {
					console.log('ERROR: invalid stdout', { parserName, data });
				}
			});

			parserProcess.on('close', () => {
				rl.close();
			});
		} catch (error) {
			console.log('ERROR: throw in exec', error);
			reject(error);
		}
	});
