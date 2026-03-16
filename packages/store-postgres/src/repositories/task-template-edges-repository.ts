import type { TaskTemplateEdge } from "@regisseur/core";

import {
  mapTaskTemplateEdgeRowToDomain,
  mapTaskTemplateEdgeToRowInput,
} from "../mappers/task-template-edge-mapper.js";
import type { Queryable, TaskTemplateEdgeRow } from "../types.js";

export class PostgresTaskTemplateEdgesRepository {
  constructor(private readonly db: Queryable) {}

  async insert(edge: TaskTemplateEdge): Promise<void> {
    const row = mapTaskTemplateEdgeToRowInput(edge);

    await this.db.query(
      `
        INSERT INTO task_template_edges (
          from_task_template_id,
          to_task_template_id,
          type
        ) VALUES ($1, $2, $3)
      `,
      [row.from_task_template_id, row.to_task_template_id, row.type],
    );
  }

  async insertMany(edges: readonly TaskTemplateEdge[]): Promise<void> {
    if (edges.length === 0) {
      return;
    }

    const values: unknown[] = [];
    const placeholders = edges.map((edge, index) => {
      const row = mapTaskTemplateEdgeToRowInput(edge);
      const offset = index * 3;

      values.push(row.from_task_template_id, row.to_task_template_id, row.type);

      return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
    });

    await this.db.query(
      `
        INSERT INTO task_template_edges (
          from_task_template_id,
          to_task_template_id,
          type
        ) VALUES ${placeholders.join(", ")}
      `,
      values,
    );
  }

  async findAllByWorkflowDefinitionTaskTemplates(
    taskTemplateIds: readonly string[],
  ): Promise<TaskTemplateEdge[]> {
    if (taskTemplateIds.length === 0) {
      return [];
    }

    const result = await this.db.query<TaskTemplateEdgeRow>(
      `
        SELECT * FROM task_template_edges
        WHERE from_task_template_id = ANY($1::text[])
          AND to_task_template_id = ANY($1::text[])
        ORDER BY from_task_template_id ASC, to_task_template_id ASC, type ASC
      `,
      [taskTemplateIds],
    );

    return result.rows.map(mapTaskTemplateEdgeRowToDomain);
  }

  async findByFromTaskTemplateId(
    taskTemplateId: string,
  ): Promise<TaskTemplateEdge[]> {
    const result = await this.db.query<TaskTemplateEdgeRow>(
      `
        SELECT * FROM task_template_edges
        WHERE from_task_template_id = $1
        ORDER BY from_task_template_id ASC, to_task_template_id ASC, type ASC
      `,
      [taskTemplateId],
    );

    return result.rows.map(mapTaskTemplateEdgeRowToDomain);
  }

  async findByToTaskTemplateId(
    taskTemplateId: string,
  ): Promise<TaskTemplateEdge[]> {
    const result = await this.db.query<TaskTemplateEdgeRow>(
      `
        SELECT * FROM task_template_edges
        WHERE to_task_template_id = $1
        ORDER BY from_task_template_id ASC, to_task_template_id ASC, type ASC
      `,
      [taskTemplateId],
    );

    return result.rows.map(mapTaskTemplateEdgeRowToDomain);
  }

  async deleteByTaskTemplateId(taskTemplateId: string): Promise<void> {
    await this.db.query(
      `
        DELETE FROM task_template_edges
        WHERE from_task_template_id = $1 OR to_task_template_id = $1
      `,
      [taskTemplateId],
    );
  }

  async deleteEdge(
    fromTaskTemplateId: string,
    toTaskTemplateId: string,
    type: TaskTemplateEdge["type"] = "depends_on",
  ): Promise<void> {
    await this.db.query(
      `
        DELETE FROM task_template_edges
        WHERE from_task_template_id = $1
          AND to_task_template_id = $2
          AND type = $3
      `,
      [fromTaskTemplateId, toTaskTemplateId, type],
    );
  }
}
