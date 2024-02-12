import { MikroORM } from '@mikro-orm/core';
import { getProjectMikroOrmConfig } from '@redeye/models';

import { parseCampaignFolder } from './parse-campaign-folder';

export async function parserService({
	projectDatabasePath,
	parserName,
	parsingPaths,
}: {
	projectDatabasePath: string;
	parserName: string;
	parsingPaths: string;
}) {
	const orm = await MikroORM.init(getProjectMikroOrmConfig(projectDatabasePath));
	const em = orm.em.fork();

	await parseCampaignFolder(em, parsingPaths, parserName);
}
