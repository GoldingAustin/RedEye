import type { Command } from 'commander';
import { Option } from 'commander';
import { createLoggerInstance } from '../shared/logging';
import type { SharedCommandOptions } from '../shared/commandOptions';
import { addSharedCommandOptions } from '../shared/commandOptions';
import { interpret } from 'xstate';
import { hrtime } from 'process';
import { mainBeaconMachine } from './main.machine';

type BeaconCallbackOptions = {
	databasePath: string;
	beaconId: string;
} & SharedCommandOptions;

export const registerBeaconCommand = (program: Command) => {
	const beaconCommand = program.command('beacon');
	beaconCommand
		.addOption(new Option('-d, --databasePath </absolute/path/to/database>').makeOptionMandatory(true).argParser(value => value?.replaceAll('"', '')))
		.addOption(new Option('-b, --beaconId <string>').makeOptionMandatory(true));

	addSharedCommandOptions(beaconCommand);

	beaconCommand.action(beaconCommandAction);
};

const beaconCommandAction = (options: BeaconCallbackOptions) => {
	const logger = createLoggerInstance(options.loggingFolderPath);
	logger('command invocation', { payload: options, tags: ['BEACON_SCRIPT_INVOCATION'], level: 'debug' });
	const start = hrtime.bigint();

	const { databasePath, beaconId } = options;

	const parsingService = interpret(
		mainBeaconMachine.withContext({
			databasePath,
			beaconId,
			logger,
		})
	);

	parsingService.start();
	parsingService.onStop(() => {
		logger('Completed beacon parser script', { tags: [beaconId], level: 'debug' });

		const end = hrtime.bigint();
		const seconds = Number(end - start) / 1e9;
		logger(`totalExecutionTime: ${seconds} seconds`, { tags: [beaconId], level: 'debug' });
	});
};
