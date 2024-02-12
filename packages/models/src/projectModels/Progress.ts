import { Field, ObjectType, Float } from 'type-graphql';

@ObjectType()
export class ParsingProgress {
	@Field(() => Float)
	progress: number = 0;

	@Field(() => String)
	currentTask: string = 'No Current Tasks';

	@Field(() => Date)
	date: Date = new Date();
}
