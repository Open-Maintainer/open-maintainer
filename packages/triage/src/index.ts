import {
  DefaultIssueTriageLabelMappings,
  type IssueTriageLabelIntent,
  IssueTriageLabelIntentSchema,
  type IssueTriageModelResult,
  IssueTriageModelResultSchema,
} from "@open-maintainer/shared";
import type { z } from "zod";

export type IssueTriageLabelMapping = Partial<
  Record<IssueTriageLabelIntent, string>
>;

export type MappedIssueTriageLabel = {
  intent: IssueTriageLabelIntent;
  label: string;
};

export function parseIssueTriageModelResult(
  value: unknown,
): IssueTriageModelResult {
  return IssueTriageModelResultSchema.parse(value);
}

export function safeParseIssueTriageModelResult(
  value: unknown,
): z.SafeParseReturnType<unknown, IssueTriageModelResult> {
  return IssueTriageModelResultSchema.safeParse(value);
}

export function mapIssueTriageLabelIntents(
  intents: readonly IssueTriageLabelIntent[],
  mappings: IssueTriageLabelMapping = {},
): MappedIssueTriageLabel[] {
  return intents.map((intent) => {
    const parsedIntent = IssueTriageLabelIntentSchema.parse(intent);
    return {
      intent: parsedIntent,
      label:
        mappings[parsedIntent] ?? DefaultIssueTriageLabelMappings[parsedIntent],
    };
  });
}
