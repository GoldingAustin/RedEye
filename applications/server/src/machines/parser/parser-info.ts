import type { ParserInfo } from '@redeye/parser-core';
import type { EndpointContext } from '../../types';
import { invokeParser } from './invoke-parser';

export async function getParserInfo(parserName: string): Promise<ParserInfo> {
	return await invokeParser<ParserInfo>(parserName, ['info']);
}

export async function parserInfo(parsers: string[] | undefined): Promise<EndpointContext['parserInfo']> {
	if (!parsers) return {};
	return Object.fromEntries(await Promise.all(parsers.map(async (parser) => [parser, await getParserInfo(parser)])));
}
