import type { EntityManager } from '../../types';
import type { BeaconLineType, LogType, MitreTechniques, ServerType } from '@redeye/models';
import {
	Annotation,
	Beacon,
	BeaconMeta,
	BeaconType,
	Command,
	CommandGroup,
	GenerationType,
	Host,
	HostMeta,
	Link,
	LogEntry,
	mitreTechniques,
	Operator,
	Server,
	ServerMeta,
	Shapes,
} from '@redeye/models';
import type { ParserHost, ParserLogEntry, ParserOutput } from '@redeye/parser-core';
import { escapeFilePath } from '@redeye/parser-core';
import { invokeParser } from './invoke-parser';
import { wrap } from '@mikro-orm/core';

interface Created {
	servers: Record<string, Server>;
	hosts: Record<string, Host>;
	beacons: Record<string, Beacon>;
	operators: Record<string, Operator>;
}
export async function parseCampaignFolder(em: EntityManager, path: string, parserName: string) {
	const created: Created = {
		servers: {},
		hosts: {},
		beacons: {},
		operators: {},
	};

	const data = await invokeParser<ParserOutput>(parserName, ['parse-campaign', `--folder`, escapeFilePath(path)]);
	if (data.servers) {
		await saveServers(em, data.servers, created, path);
	}
	if (data.hosts) {
		await saveHosts(em, data.hosts, created);
	}
	if (data.beacons) {
		await saveBeacons(em, data.beacons, created);
	}

	if (data.operators) {
		await saveOperators(em, data.operators, created);
	}

	if (data.links) {
		await saveLinks(em, data.links, created);
	}

	if (data.commands) {
		await saveCommands(em, data.commands, created);
	}
	await em.flush();
}

async function saveOperators(em: EntityManager, operators: ParserOutput['operators'], created: Created) {
	for (const operator of Object.values(operators)) {
		const previousOperator = await em.findOne(Operator, { id: operator.name });
		if (previousOperator) {
			created.operators[operator.name] = previousOperator;
		} else {
			created.operators[operator.name] = new Operator({ id: operator.name });
			em.persist(created.operators[operator.name]);
		}
	}
}

async function saveLinks(em: EntityManager, links: ParserOutput['links'], created: Created) {
	for (const link of Object.values(links)) {
		const previousLink = await em.findOne(Link, {
			origin: created.beacons[link.from],
			destination: created.beacons[link.to],
		});
		const fromBeacon =
			link.from in created.beacons
				? created.beacons[link.from]
				: await em.findOne(Beacon, { beaconName: link.from }, { populate: ['meta', 'meta.startTime', 'meta.endTime'] });
		const toBeacon =
			link.to in created.beacons
				? created.beacons[link.to]
				: await em.findOne(Beacon, { beaconName: link.to }, { populate: ['meta', 'meta.startTime', 'meta.endTime'] });
		const fromBeaconMeta = fromBeacon?.meta?.getItems().at(0);
		const toBeaconMeta = toBeacon?.meta?.getItems().at(0);
		if (previousLink) {
			previousLink.startTime = fromBeaconMeta?.startTime
				? compareDates(fromBeaconMeta?.startTime, previousLink.startTime)
				: previousLink.startTime;
			previousLink.endTime = toBeaconMeta?.endTime
				? compareDates(toBeaconMeta?.endTime, previousLink.endTime, true)
				: previousLink.endTime;
			em.persist(previousLink);
		} else {
			const newLink = new Link({
				origin: created.beacons[link.from],
				destination: created.beacons[link.to],
				manual: false,
				startTime: fromBeaconMeta?.startTime,
				endTime: toBeaconMeta?.endTime,
			});
			em.persist(newLink);
		}
	}
}

async function saveCommands(em: EntityManager, commands: ParserOutput['commands'], created: Created) {
	const createInput = (command: ParserOutput['commands'][string], beacon: Beacon) => {
		return {
			...command.input,
			logType: command.input.logType as LogType,
			lineType: command.input.lineType as BeaconLineType,
			lineNumber: command.input.lineNumber || 0,
			beacon,
			blob: command.input.blob || '',
		};
	};
	const createOutput = (commandOutput: ParserLogEntry, beacon: Beacon, updatedCommand: Command) => {
		return {
			...commandOutput,
			logType: commandOutput.logType as LogType,
			lineType: commandOutput.lineType as BeaconLineType,
			lineNumber: commandOutput.lineNumber || 0,
			beacon,
			blob: commandOutput.blob || '',
			command: updatedCommand,
		};
	};
	for (const [commandId, command] of Object.entries(commands)) {
		let operator = command.operator
			? command.operator in created.operators
				? created.operators[command.operator]
				: (await em.findOne(Operator, { id: command.operator })) || undefined
			: undefined;
		if (!operator && command.operator) {
			operator = created.operators[command.operator] = new Operator({ id: command.operator });
			em.persist(created.operators[command.operator]);
		}
		if (operator && command.input.dateTime) {
			operator.startTime = compareDates(command.input.dateTime, operator.startTime);
			operator.endTime = compareDates(command.input.dateTime, operator.endTime, true);
		}
		const beacon = created.beacons[command.beacon];
		operator?.beacons.add(beacon);
		const previousCommand = await em.findOne(Command, { id: commandId }, { populate: true });
		let updatedCommand: undefined | Command;
		if (previousCommand) {
			updatedCommand = wrap(previousCommand).assign(
				{
					operator,
					beacon,
					attackIds: command.attackIds,
					inputText: command.input.blob,
				},
				{ mergeObjects: true, em }
			);
			updatedCommand.input = wrap(updatedCommand.input).assign(createInput(command, beacon), {
				mergeObjects: true,
				em,
			});
			const commandOutput = updatedCommand.output.getItems().at(0);
			if (commandOutput && command.output) {
				updatedCommand.output.set([
					wrap(commandOutput).assign(createOutput(command.output, beacon, updatedCommand), { mergeObjects: true, em }),
				]);
			}
		} else {
			updatedCommand = new Command({
				id: commandId,
				operator,
				beacon,
				attackIds: command.attackIds,
				inputText: command.input.blob,
				input: new LogEntry(createInput(command, beacon)),
				output: [],
			});

			if (command.output) {
				const newOutput = new LogEntry(createOutput(command.output, beacon, updatedCommand));
				em.persist(newOutput);
				updatedCommand!.output.add(newOutput);
			}
		}
		if (updatedCommand.attackIds) {
			await createTechniqueComment(em, updatedCommand.attackIds, updatedCommand);
		}
		em.persist(updatedCommand);
	}
}

async function saveBeacons(em: EntityManager, beacons: ParserOutput['beacons'], created: Created) {
	const getBeaconMeta = (beacon: ParserOutput['beacons'][string]) => {
		return {
			beacon: created.beacons[beacon.name],
			port: beacon.port,
			process: beacon.process,
			pid: beacon.processId,
			startTime: beacon.startTime,
			endTime: beacon.endTime,
			shape: Shapes.circle,
			type: (beacon.type || BeaconType.http) as BeaconType,
		};
	};
	for (const beacon of Object.values(beacons)) {
		const previousBeacon = await em.findOne(Beacon, { beaconName: beacon.name }, { populate: true });
		if (previousBeacon) {
			created.beacons[beacon.name] = previousBeacon;
			let beaconMeta = created.beacons[beacon.name].meta.getItems().at(0);
			if (beaconMeta) {
				beaconMeta = wrap(beaconMeta).assign(getBeaconMeta(beacon), { mergeObjects: true, em });
				em.persist(beaconMeta);
			}
		} else {
			created.beacons[beacon.name] = new Beacon({
				id: `${beacon.host}-${beacon.name}`,
				beaconName: beacon.name,
				server: created.servers[beacon.server],
				host: created.hosts[beacon.host],
			});
			const beaconMeta = new BeaconMeta(getBeaconMeta(beacon));
			created.beacons[beacon.name].meta.add(beaconMeta);
			em.persist([created.beacons[beacon.name], beaconMeta]);
		}
	}
}

async function saveHosts(em: EntityManager, hosts: ParserOutput['hosts'], created: Created) {
	const getHostMeta = (host: ParserHost) => {
		return {
			host: created.hosts[host.name],
			ip: host.ip,
			os: host.os,
			osVersion: host.osVersion,
			shape: Shapes.circle,
			type: host.type,
		};
	};
	for (const host of Object.values(hosts)) {
		const previousHost = await em.findOne(Host, { hostName: host.name }, { populate: true });
		if (previousHost) {
			created.hosts[host.name] = previousHost;
			let hostMeta = created.hosts[host.name].meta.getItems().at(0);
			if (hostMeta) {
				hostMeta = wrap(hostMeta).assign(getHostMeta(host), { mergeObjects: true, em });
				em.persist(hostMeta);
			}
		} else {
			created.hosts[host.name] = new Host({ hostName: host.name, cobaltStrikeServer: false });
			const hostMeta = new HostMeta(getHostMeta(host));
			created.hosts[host.name].meta.add(hostMeta);
			em.persist([created.hosts[host.name], hostMeta]);
		}
	}
}

async function saveServers(em: EntityManager, servers: ParserOutput['servers'], created: Created, path: string) {
	for (const parsedServer of Object.values(servers)) {
		const previousServer = await em.findOne(Server, { name: parsedServer.name }, { populate: true });
		if (previousServer) {
			created.servers[parsedServer.name] = previousServer;
		} else {
			created.servers[parsedServer.name] = new Server({
				name: parsedServer.name,
				parsingPath: path,
			});
			created.hosts[parsedServer.name] = new Host({
				hostName: parsedServer.name,
				displayName: created.servers[parsedServer.name].displayName,
				cobaltStrikeServer: true,
			});
			created.beacons[parsedServer.name] = new Beacon({
				beaconName: parsedServer.name,
				host: created.hosts[parsedServer.name],
				server: created.servers[parsedServer.name],
			});
			const serverMeta = created.servers[parsedServer.name].meta ?? new ServerMeta(created.servers[parsedServer.name]);
			serverMeta.type = (parsedServer.type ?? serverMeta.type) as ServerType;
			created.servers[parsedServer.name].meta = serverMeta;
			em.persist([
				created.servers[parsedServer.name],
				created.hosts[parsedServer.name],
				created.beacons[parsedServer.name],
				serverMeta,
			]);
		}
	}
}

async function createTechniqueComment(em: EntityManager, attackIds: string[], command: Command) {
	const mitreTechnique = new Set<MitreTechniques>();
	attackIds?.forEach((attackId: string) => {
		Object.entries(mitreTechniques).forEach(([technique, attackIds]: [string, string[]]) => {
			if (attackIds.some((atkId: string) => attackId.startsWith(atkId))) {
				mitreTechnique.add(technique as MitreTechniques);
			}
		});
	});

	if (mitreTechnique.size) {
		const commandGroup = new CommandGroup({
			commands: command,
			id: command.id + '-group',
			generation: GenerationType.PROCEDURAL,
		});
		const annotation = await Annotation.createAnnotation(em, command.inputText || '', '', {
			favorite: false,
			generation: GenerationType.PROCEDURAL,
			tags: Array.from(mitreTechnique.values()),
			commandGroup,
		});
		em.persist([commandGroup, annotation]);
		command.commandGroups.add(commandGroup);
	}
}

const compareDates = (newDate: Date, date?: Date, max?: boolean) => {
	if (max) {
		return !date || newDate > date ? newDate : date;
	} else {
		return !date || newDate < date ? newDate : date;
	}
};
