import {
	Button,
	Callout,
	Classes,
	Collapse,
	ControlGroup,
	Divider,
	FileInput,
	FormGroup,
	InputGroup,
	Intent,
	Popover,
	Position,
} from '@blueprintjs/core';
import {
	ChevronDown16,
	ChevronRight16,
	Download16,
	Folder16,
	FolderOff16,
	TrashCan16,
	Warning20,
} from '@carbon/icons-react';
import { css } from '@emotion/react';
import {
	CarbonIcon,
	DialogBodyEx,
	DialogFooterEx,
	HoverButton,
	ScrollBox,
	ScrollChild,
} from '@redeye/client/components';
import { createState } from '@redeye/client/components/mobx-create-state';
import type { Servers, ParserInfoModel } from '@redeye/client/store';
import { ServerDelineationTypes, UploadType, useStore, ValidationMode } from '@redeye/client/store';
import type { DirectoryFile, DirectoryInput } from '@redeye/client/types/directory';
import { Txt } from '@redeye/ui-styles';
import { observable, IObservableArray } from 'mobx';
import { observer } from 'mobx-react-lite';
import type { ChangeEvent, ComponentProps, FormEvent } from 'react';

export type ParserConfig = {
	servers: IObservableArray<Servers>;
	originalFiles: IObservableArray<File>;
	files: IObservableArray<DirectoryFile>;
	invalidFiles: IObservableArray<DirectoryFile>;
};

type ParserUploadFormProps = ComponentProps<'form'> & {
	onClose: (...args: any) => void;
	parserInfo: ParserInfoModel;
	setParserServersAndFiles: (servers: Servers[], files: DirectoryFile[]) => void;
	parserConfig: ParserConfig;
};

const createDirectoryFile = (file: File) =>
	({
		...file,
		webkitRelativePath: file.webkitRelativePath,
		name: file.name,
		blob: file.slice(),
	} as DirectoryFile);

const defaultServer: Servers = {
	name: '',
	displayName: '',
	fileCount: 0,
	fileData: undefined,
	completed: 0,
	totalTasks: 0,
	isParsingFiles: false,
};

// Typing for input element doesn't like the directory props
const inputProps: DirectoryInput = {
	webkitdirectory: 'true',
	directory: 'true',
	mozdirectory: 'true',
	type: 'file',
};

export const ParserUploadForm = observer<ParserUploadFormProps>(
	({ parserInfo, setParserServersAndFiles, parserConfig, ...props }) => {
		const store = useStore();
		const state = createState({
			uploadError: undefined as undefined | string,
			multiServerUpload: undefined as undefined | boolean,
			loading: false,
			showExample: false,
			createServers(serverName: string, fileCount: number) {
				const server = { ...defaultServer, displayName: serverName, name: serverName, fileCount };
				parserConfig.servers.push(server);
			},
			*fileSelect() {
				parserConfig.files.clear();
				parserConfig.invalidFiles.clear();
				this.uploadError = undefined;
				if (parserConfig.originalFiles.length) {
					this.loading = true;
					if (parserInfo.uploadForm.fileUpload.validate === ValidationMode.None) {
						for (const file of parserConfig.originalFiles) parserConfig.files.push(createDirectoryFile(file));
						this.loading = false;
					} else if (parserInfo.uploadForm.fileUpload.validate === ValidationMode.FileExtensions) {
						const fileExtension = new Set(parserInfo.uploadForm.fileUpload.acceptedExtensions!);
						for (const file of parserConfig.originalFiles) {
							// eslint-disable-next-line no-bitwise
							if (fileExtension.has(file.name.slice(((file.name.lastIndexOf('.') - 1) >>> 0) + 2))) {
								parserConfig.files.push(createDirectoryFile(file));
							} else {
								parserConfig.invalidFiles.push(createDirectoryFile(file));
							}
						}
						this.loading = false;
					} else if (parserInfo.uploadForm.fileUpload.validate === ValidationMode.Parser) {
						try {
							const fileValidationFormData = new FormData();
							const allFiles = {};
							for (const file of parserConfig.originalFiles) {
								allFiles[file.webkitRelativePath] = createDirectoryFile(file);
								fileValidationFormData.append(
									'file',
									new File([file.slice()], file.webkitRelativePath.replace(/\//g, ':'), {
										type: file.type,
									})
								);
							}
							const res: Response = yield store.auth.protectedFetch(
								`${store.auth.serverUrl}/api/parser/${parserInfo.id}/validate-files`,
								{
									mode: 'cors',
									cache: 'no-cache',
									credentials: 'include',
									method: 'POST',
									body: fileValidationFormData,
								}
							);
							if (res.status !== 200) {
								window.console.error('Error Uploading Logs');
								this.uploadError = yield res.text();
								// this should provide some UI feedback in the form as to the reason
							} else {
								const {
									valid,
									invalid,
									servers,
								}: { servers: { fileCount?: number; name: string }[]; valid: string[]; invalid: string[] } =
									yield res.json();
								servers.forEach((server) => {
									this.createServers(server.name, server.fileCount || 0);
								});
								invalid.forEach((invalidFilename) => {
									if (allFiles[invalidFilename]) parserConfig.invalidFiles.push(allFiles[invalidFilename]);
								});
								valid.forEach((validFilename) => {
									if (allFiles[validFilename]) parserConfig.files.push(allFiles[validFilename]);
								});
								setParserServersAndFiles(parserConfig.servers, parserConfig.files);
							}
							this.loading = false;
						} catch (error) {
							window.console.warn('Error Uploading Logs', error);
						}
					} else {
						// return this.fileError('No Valid Files Found'); // not sure this is an error?
					}
				}
			},
			onFileInputChange(e: ChangeEvent<HTMLInputElement>) {
				parserConfig.originalFiles.replace(e.target.files ? Array.from(e.target.files) : []);
				parserConfig.servers.clear();
				this.fileSelect();
				this.showExample = false;
				e.target.value = '';
			},
		});

		return (
			<>
				<FormGroup
					label={
						<Txt tagName="div" large>
							{/* eslint-disable-next-line react/no-danger */}
							<span dangerouslySetInnerHTML={{ __html: parserInfo.uploadForm.fileUpload.description }} />
						</Txt>
					}
				>
					<FileInput
						cy-test="upload-folder"
						// not a huge fan of this blueprint file input
						// TODO: there is no focus state? fix in blueprint-styler
						aria-errormessage={state.uploadError}
						aria-invalid={!!state.uploadError}
						onInputChange={state.onFileInputChange}
						inputProps={
							parserInfo.uploadForm.fileUpload.type === UploadType.Directory ? (inputProps as any) : undefined
						}
						text={`${parserConfig.files.length} files selected`}
						large
						fill
					/>
					{parserInfo.uploadForm.fileUpload.example ? (
						<>
							<Button
								minimal
								small
								intent={Intent.PRIMARY}
								text="Show an example"
								icon={<CarbonIcon icon={state.showExample ? ChevronDown16 : ChevronRight16} />}
								onClick={() => state.update('showExample', !state.showExample)}
								css={css`
									margin: 2px -0.5rem;
								`}
							/>
							<Collapse isOpen={state.showExample}>
								<Txt
									monospace
									muted
									tagName="pre"
									css={css`
										margin: 0 0.5rem;
									`}
									children={parserInfo.uploadForm.fileUpload.example}
								/>
							</Collapse>
						</>
					) : null}
				</FormGroup>

				<FormGroup
					label="Servers"
					helperText={parserConfig.servers.length > 0 && 'Servers can be renamed before upload'}
				>
					{parserConfig.servers.length === 0 && !state.uploadError && (
						<Txt disabled italic>
							No servers selected
						</Txt>
					)}
					{!!state.uploadError && (
						<Callout intent={Intent.DANGER} icon={<CarbonIcon icon={Warning20} />} children={state.uploadError} />
					)}
					{parserConfig.servers.map((server: Servers, i) => (
						<ControlGroup
							/* eslint-disable-next-line react/no-array-index-key */
							key={i}
							css={css`
								margin: 0.25rem 0;
							`}
							fill
						>
							<InputGroup
								placeholder="server.name"
								value={server.displayName}
								onChange={(e) => (server.displayName = e.target.value)}
								intent={
									parserConfig.servers.some((s, x) => x !== i && s.name === server.displayName)
										? Intent.DANGER
										: Intent.NONE
								}
								leftIcon={<CarbonIcon icon={Folder16} />}
								rightElement={
									parserInfo.uploadForm.serverDelineation === ServerDelineationTypes.Folder ? (
										<Txt muted>{server.fileCount} log files</Txt>
									) : undefined
								}
								css={css`
									.${Classes.INPUT_ACTION} {
										display: flex;
										height: 100%;
										padding: 0 1rem;
										align-items: center;
									}
								`}
								large
								fill
							/>
							<HoverButton
								onClick={() => parserConfig.servers.remove(server)}
								icon={<CarbonIcon icon={TrashCan16} />}
								disabled={parserConfig.servers.length <= 1}
								large
								hoverProps={parserConfig.servers.length <= 1 ? undefined : { intent: 'danger' }}
							/>
						</ControlGroup>
					))}
					{!!parserConfig.invalidFiles?.length && (
						<Popover
							position={Position.TOP_LEFT}
							openOnTargetFocus={false}
							interactionKind="hover"
							hoverOpenDelay={300}
							minimal
							fill
							content={
								<ScrollBox
									css={css`
										max-height: 40rem;
										max-width: 40rem;
									`}
								>
									<ScrollChild>
										<Txt
											tagName="pre"
											css={css`
												padding: 1rem;
												overflow-x: scroll;
												margin: 0;
											`}
										>
											{parserConfig.invalidFiles.map((file) => (
												<span key={file.webkitRelativePath}>
													{file.webkitRelativePath}
													{'\n'}
												</span>
											))}
										</Txt>
									</ScrollChild>
								</ScrollBox>
							}
						>
							<Callout
								intent={Intent.WARNING}
								icon={<CarbonIcon icon={FolderOff16} />}
								children={`${parserConfig.invalidFiles.length} File${
									parserConfig.invalidFiles.length > 1 ? 's' : ''
								} Removed`}
							/>
						</Popover>
					)}
				</FormGroup>
			</>
		);
	}
);

const dialogBodyStyle = css`
	padding: 1.5rem;
	display: flex;
	flex-direction: column;
	gap: 1.5rem;
	& > * {
		margin: 0;
	}
`;
