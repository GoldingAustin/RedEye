/* This is a mk-gql generated file, don't modify it manually */
/* eslint-disable */
/* tslint:disable */
// @ts-nocheck

import { types, prop, tProp, Model, Ref, idProp } from 'mobx-keystone';
import { QueryBuilder } from 'mk-gql';

/**
 * ParsingProgressBase
 * auto generated base class for the model ParsingProgressModel.
 */
export class ParsingProgressModelBase extends Model({
	__typename: tProp('ParsingProgress'),
	currentTask: prop<string>().withSetter(),
	date: prop<any>().withSetter(),
	progress: prop<number>().withSetter(),
}) {}

export class ParsingProgressModelSelector extends QueryBuilder {
	get currentTask() {
		return this.__attr(`currentTask`);
	}
	get date() {
		return this.__attr(`date`);
	}
	get progress() {
		return this.__attr(`progress`);
	}
}
export function selectFromParsingProgress() {
	return new ParsingProgressModelSelector();
}

export const parsingProgressModelPrimitives = selectFromParsingProgress().currentTask.date.progress;
