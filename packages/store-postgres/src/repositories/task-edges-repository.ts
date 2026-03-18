import type { TaskEdge } from "@regisseur/core";

import {
  mapTaskEdgeRowToDomain,
  mapTaskEdgeToRowInput,
} from "../mappers/task-edge-mapper.js";
import type { Queryable, TaskEdgeRow } from "../types.js";

export class PostgresTaskEdgesRepository {
  constructor(private readonly db: Queryable) {}

  async insert(edge: TaskEdge): Promise<void> {
    const row = mapTaskEdgeToRowInput(edge);

    await this.db.query(
      `
        INSERT INTO task_edges (
          from_task_id,
          to_task_id,
          type,
          inject_output,
          output_merge_key
        ) VALUES ($1, $2, $3, $4, $5)
      `,
      [
        row.from_task_id,
        row.to_task_id,
        row.type,
        row.inject_output,
        row.output_merge_key,
      ],
    );
  }

  async insertMany(edges: readonly TaskEdge[]): Promise<void> {
    if (edges.length === 0) {
      return;
    }

    const values: unknown[] = [];
    const placeholders = edges.map((edge, index) => {
      const row = mapTaskEdgeToRowInput(edge);
      const offset = index * 5;

      values.push(
        row.from_task_id,
        row.to_task_id,
        row.type,
        row.inject_output,
        row.output_merge_key,
      );

      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
    });

    await this.db.query(
      `
        INSERT INTO task_edges (
          from_task_id,
          to_task_id,
          type,
          inject_output,
          output_merge_key
        ) VALUES ${placeholders.join(", ")}
      `,
      values,
    );
  }

  async findByFromTaskId(taskId: string): Promise<TaskEdge[]> {
    const result = await this.db.query<TaskEdgeRow>(
      `
        SELECT * FROM task_edges
        WHERE from_task_id = $1
        ORDER BY from_task_id ASC, to_task_id ASC, type ASC
      `,
      [taskId],
    );

    return result.rows.map(mapTaskEdgeRowToDomain);
  }

  async findByToTaskId(taskId: string): Promise<TaskEdge[]> {
    const result = await this.db.query<TaskEdgeRow>(
      `
        SELECT * FROM task_edges
        WHERE to_task_id = $1
        ORDER BY from_task_id ASC, to_task_id ASC, type ASC
      `,
      [taskId],
    );

    return result.rows.map(mapTaskEdgeRowToDomain);
  }

  async findAllByWorkflowTasks(
    taskIds: readonly string[],
  ): Promise<TaskEdge[]> {
    if (taskIds.length === 0) {
      return [];
    }

    const result = await this.db.query<TaskEdgeRow>(
      `
        SELECT * FROM task_edges
        WHERE from_task_id = ANY($1::text[])
          AND to_task_id = ANY($1::text[])
        ORDER BY from_task_id ASC, to_task_id ASC, type ASC
      `,
      [taskIds],
    );

    return result.rows.map(mapTaskEdgeRowToDomain);
  }

  async deleteByTaskId(taskId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM task_edges WHERE from_task_id = $1 OR to_task_id = $1`,
      [taskId],
    );
  }

  async deleteEdge(
    fromTaskId: string,
    toTaskId: string,
    type: TaskEdge["type"] = "depends_on",
  ): Promise<void> {
    await this.db.query(
      `
        DELETE FROM task_edges
        WHERE from_task_id = $1
          AND to_task_id = $2
          AND type = $3
      `,
      [fromTaskId, toTaskId, type],
    );
  }
}
