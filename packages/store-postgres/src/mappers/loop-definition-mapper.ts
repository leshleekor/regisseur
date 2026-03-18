import type { LoopDefinition } from "@regisseur/core";

import { parseJsonValue, toIsoTimestamp } from "./shared.js";
import type { LoopDefinitionRow, LoopDefinitionRowInput } from "../types.js";

export function mapLoopDefinitionToRowInput(
  loopDefinition: LoopDefinition,
): LoopDefinitionRowInput {
  return {
    loop_definition_id: loopDefinition.loopDefinitionId,
    workflow_definition_id: loopDefinition.workflowDefinitionId,
    name: loopDefinition.name,
    controller_task_template_id: loopDefinition.controllerTaskTemplateId,
    entry_task_template_ids: JSON.stringify(
      loopDefinition.entryTaskTemplateIds,
    ),
    body_task_template_ids: JSON.stringify(loopDefinition.bodyTaskTemplateIds),
    max_iterations: loopDefinition.maxIterations,
    created_at: loopDefinition.createdAt,
    updated_at: loopDefinition.updatedAt,
  };
}

export function mapLoopDefinitionRowToDomain(
  row: LoopDefinitionRow,
): LoopDefinition {
  return {
    loopDefinitionId: row.loop_definition_id,
    workflowDefinitionId: row.workflow_definition_id,
    name: row.name,
    controllerTaskTemplateId: row.controller_task_template_id,
    entryTaskTemplateIds: parseJsonValue<string[]>(
      row.entry_task_template_ids,
      [],
    ),
    bodyTaskTemplateIds: parseJsonValue<string[]>(
      row.body_task_template_ids,
      [],
    ),
    maxIterations: row.max_iterations,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}
