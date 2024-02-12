import type { OptionProps } from '@blueprintjs/core';
import {
	Button,
	ButtonGroup,
	Card,
	CardList,
	ControlGroup,
	Divider,
	FormGroup,
	HTMLSelect,
	InputGroup,
	Intent,
	Section,
	SectionCard,
	Tab,
} from '@blueprintjs/core';
import { css } from '@emotion/react';
import {
	CarbonIcon,
	createState,
	DialogBodyEx,
	DialogEx,
	DialogFooterEx,
	ErrorFallback,
} from '@redeye/client/components';
import { RedEyeDbUploadForm } from './RedEyeDbUploadForm';
import { CoreTokens, Header, TabsStyled, Txt } from '@redeye/ui-styles';
import { observer } from 'mobx-react-lite';
import type { ChangeEvent, ComponentProps, FormEvent } from 'react';
import { useMemo } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { CampaignType } from '@redeye/client/store/graphql/CampaignTypeEnum';
import { Add16, Download16 } from '@carbon/icons-react';
import { getSnapshot } from 'mobx-keystone';
import { ParserUploadForm, ParserConfig } from './ParserUploadForm';
import { useStore, ValidationMode } from '../../../store';
import type { ParserInfoModel, Servers } from '../../../store';
import { observable } from 'mobx';
import { DirectoryFile } from '@redeye/client/types';

type NewCampaignDialogProps = ComponentProps<'div'> & {
	open: boolean;
	onClose: (...args: any) => void;
};

const UploadType = [
	{ label: 'C2 Parser', value: 'C2 Parser' },
	{ label: 'RedEye File', value: 'RedEye File' },
] as const;
const SOURCE_UNSET = { name: 'Select Source', id: 'source-unset' } as const;
const campaignTypeOptions = Object.values(CampaignType).map((value) => ({ label: value, value }));

type Parsers = Record<string, ParserConfig>;
export const NewCampaignDialog = observer<NewCampaignDialogProps>(({ ...props }) => {
	const store = useStore();
	const state = createState({
		uploadType: UploadType[0].value,
		campaignName: '' as string,
		campaignId: undefined as undefined | number,
		nameTaken: false as boolean,
		campaignType: CampaignType.STATIC as CampaignType,
		loading: false,
		uploading: false,
		tab: SOURCE_UNSET.id as string,
		selectedParsers: [SOURCE_UNSET] as (ParserInfoModel | typeof SOURCE_UNSET)[],
		parsers: {} as Parsers,
		get submitDisabled() {
			return (
				state.uploading ||
				state.selectedParsers.some(
					(parserInfo) =>
						parserInfo.id !== SOURCE_UNSET.id &&
						parserInfo.uploadForm?.fileUpload?.validate !== ValidationMode.None &&
						!state?.parsers?.[parserInfo.id]?.servers?.length
				) ||
				!state.campaignName ||
				state.nameTaken
			);
		},
		setCampaignName(e: ChangeEvent<HTMLInputElement>) {
			this.nameTaken = Array.from(store.graphqlStore.campaigns.values()).some(
				(d) => d?.name.toLowerCase() === e.target.value.trim().toLowerCase()
			);
			this.campaignName = e.target.value;
		},
		*submitData(e: FormEvent<HTMLFormElement>) {
			e.preventDefault();
			this.uploading = true;
			const campaign: Awaited<ReturnType<typeof store.graphqlStore.mutateCreateCampaign>> =
				yield store.graphqlStore.mutateCreateCampaign({
					creatorName: store.auth.userName!,
					name: this.campaignName,
					parsers: Object.keys(this.parsers),
				});
			for (const [parserId, { files, servers }] of Object.entries(this.parsers)) {
				const campaignBody = new FormData();
				campaignBody.set('parserId', parserId);
				for (const file of files) {
					campaignBody.append(
						'file',
						new File([file.blob], file.webkitRelativePath.replace(/\//g, ':').split(':').slice(1).join(':'), {
							type: file.type,
						})
					);
				}
				campaignBody.append('servers', JSON.stringify(servers));
				try {
					const res: Response = yield store.auth.protectedFetch(
						`${store.auth.serverUrl}/api/campaign/${campaign.createCampaign.id}/upload`,
						{
							mode: 'cors',
							cache: 'no-cache',
							credentials: 'include',
							method: 'POST',
							body: campaignBody,
						}
					);
					if (res.status !== 200) {
						window.console.error('Error Uploading Logs');
						// this should provide some UI feedback in the form as to the reason
					} else {
						// server.isParsingFiles = true;
					}
				} catch (error) {
					window.console.warn('Error Uploading Logs', error);
				}
			}
			yield store.graphqlStore.mutateServersParse({ campaignId: campaign.createCampaign.id });

			campaign.createCampaign?.processServers?.();
			this.uploading = false;
			props.onClose();
		},
	});

	const uploadOptions = useMemo(() => {
		const options: (OptionProps & {
			parserInfo?: ParserInfoModel;
		})[] = [
			{
				label: SOURCE_UNSET.name,
				value: SOURCE_UNSET.id,
				disabled: true,
			},
		];

		options.push(
			...Array.from(store.graphqlStore.parserInfos.values())
				.sort((a) => (a.name.includes('Cobalt') ? -1 : 1))
				.map((parserInfo) => ({
					label: parserInfo?.uploadForm?.tabTitle,
					value: parserInfo.id,
					parserInfo,
				}))
		);

		return options;
	}, [store.graphqlStore.parserInfos.values()]);

	return (
		<DialogEx
			wide
			isOpen={props.open}
			onClose={props.onClose}
			canOutsideClickClose={false}
			css={{ padding: 0, minHeight: 300 }}
		>
			<ErrorBoundary FallbackComponent={ErrorFallback}>
				<div>
					<Header large css={{ margin: '2rem 1.5rem 1rem' }}>
						Add a Campaign
					</Header>
					<Divider css={{ margin: '0 1.5rem' }} />
					<FormGroup label="Upload Data Type">
						<HTMLSelect
							cy-test="campaign-data-upload-type"
							value={state.uploadType}
							options={UploadType}
							onChange={(e) => state.update('uploadType', e.target.value as CampaignType)}
							fill
							large
						/>
					</FormGroup>

					{state.uploadType === UploadType[0].value ? (
						<form onSubmit={state.submitData}>
							<DialogBodyEx css={dialogBodyStyle}>
								<FormGroup label="Campaign Name">
									<InputGroup
										cy-test="new-camp-name"
										placeholder="..."
										intent={state.nameTaken ? Intent.DANGER : Intent.NONE}
										value={state.campaignName}
										onChange={state.setCampaignName}
										large
										autoFocus
									/>
								</FormGroup>
								<FormGroup label="Campaign Data Source Type">
									<HTMLSelect
										cy-test="campaign-data-source-type"
										value={state.campaignType}
										options={campaignTypeOptions}
										onChange={(e) => state.update('campaignType', e.target.value as CampaignType)}
										fill
										large
									/>
								</FormGroup>
								<TabsStyled
									selectedTabId={state.tab}
									onChange={(newTab) => state.update('tab', newTab)}
									id="c2-parsers-or-redeye-file"
									renderActiveTabPanelOnly
								>
									{state.selectedParsers.map((parserInfo, index) => {
										const parserId = parserInfo.id;
										return (
											<Tab
												cy-test={`create-new-camp-${parserId}`}
												id={parserId}
												key={parserId}
												title={parserInfo.id === SOURCE_UNSET.id ? parserInfo.name : parserInfo?.uploadForm?.tabTitle}
												panel={
													<>
														<FormGroup css={{ padding: '1rem 0 1.5rem 0', margin: 0 }} label="Source">
															<HTMLSelect
																cy-test="create-new-camp"
																value={parserId}
																minimal={parserId !== SOURCE_UNSET.id}
																css={parserId === SOURCE_UNSET.id && htmlSelectPlaceholderStyle}
																options={uploadOptions.filter(
																	(option) => option.value === parserId || !(option.value in state.parsers)
																)}
																onChange={(e) =>
																	state.update(undefined, (s) => {
																		const newId = e.target.value as any;
																		s.selectedParsers[index] = getSnapshot(store.graphqlStore.parserInfos.get(newId));
																		s.parsers[newId] = {
																			servers: observable.array<Servers>(),
																			originalFiles: observable.array<File>(),
																			files: observable.array<DirectoryFile>(),
																			invalidFiles: observable.array<DirectoryFile>(),
																		};
																		s.tab = e.target.value as any;
																	})
																}
																fill
																large
															/>
														</FormGroup>
														{parserInfo.id === SOURCE_UNSET.id ? (
															<div css={{ padding: '1.5rem' }}>
																<Txt italic muted>
																	Select an import source to continue
																</Txt>
															</div>
														) : (
															<ParserUploadForm
																parserConfig={state.parsers[parserInfo.id]}
																parserInfo={parserInfo}
																onClose={props.onClose}
																setParserServersAndFiles={(servers, files) => {
																	state.parsers[parserInfo.id] = { servers, files };
																}}
															/>
														)}
													</>
												}
											/>
										);
									})}
									{state.selectedParsers.length > 1 || state.selectedParsers.at(0)?.id !== SOURCE_UNSET.id ? (
										<Button
											icon={<Add16 />}
											onClick={() => {
												state.update('selectedParsers', (s) => {
													s.selectedParsers.push(SOURCE_UNSET);
													s.tab = SOURCE_UNSET.id;
												});
											}}
										/>
									) : null}
								</TabsStyled>
							</DialogBodyEx>
							<DialogFooterEx
								actions={
									<>
										<Button text="Cancel" onClick={props.onClose} />
										<Button
											loading={state.loading || state.uploading}
											type="submit"
											disabled={state.submitDisabled}
											text="Import Logs"
											intent={Intent.PRIMARY}
											rightIcon={<CarbonIcon icon={Download16} />}
											large
										/>
									</>
								}
							/>
						</form>
					) : (
						<RedEyeDbUploadForm onClose={props.onClose} />
					)}
				</div>
			</ErrorBoundary>
		</DialogEx>
	);
});

// TODO: Add back in
// : !selectedUploadOption?.parserInfo?.uploadForm?.enabledInBlueTeam && store.appMeta.blueTeam ? (
// 	<div css={{ padding: '1.5rem' }}>
// 		<Txt cy-test="bt-warning" running>
// 			This upload source is not available in BlueTeam mode.
// 			<br />
// 			<ExternalLink href="https://github.com/cisagov/redeye#red-team--blue-team-modes">
// 				Learn more
// 			</ExternalLink>
// 		</Txt>
// 	</div>
// )

const htmlSelectPlaceholderStyle = css`
	select {
		color: ${CoreTokens.TextDisabled};
	}
`;

const hideSelectArrow = css`
	& > .bp5-icon {
		display: none;
	}
`;

const dialogBodyStyle = css`
	padding: 1.5rem;
	display: flex;
	flex-direction: column;
	gap: 1.5rem;
	& > * {
		margin: 0;
	}
`;
