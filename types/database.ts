import type {
  AttendanceStatus,
  ChecklistNodeType,
  MilestoneStatus,
  ReportStatus,
  TaskAssignmentRole,
  TaskCategory,
  TaskFreshness,
  TaskLinkType,
  TaskLogSource,
  TaskPriority,
  TaskRelationType,
  TaskReviewerRole,
  TaskStatus,
  TaskTimerStatus,
  UserRole,
} from './tracker';

/**
 * Supabase database shape in snake_case wire format.
 *
 * This mirrors the SQL migrations and keeps Supabase query results typed. The
 * camelCase application/domain models live in `types/tracker.ts`.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type TableDefinition<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type TimestampColumns = {
  created_at: string;
  updated_at: string;
};

type OptionalId = {
  id?: string;
};

export interface Database {
  public: {
    Tables: {
      users: TableDefinition<
        {
          id: string;
          employee_id: string;
          full_name: string;
          email: string;
          role: UserRole;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id: string;
          employee_id: string;
          full_name: string;
          email: string;
          role?: UserRole;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        }
      >;
      tasks: TableDefinition<
        {
          id: string;
          participant_credit_mode: "legacy" | "configured";
          participant_version: number;
          metric_version: number;
          task_tag: string;
          title: string;
          category: TaskCategory;
          description: string | null;
          comments: string | null;
          assignee_id: string;
          reviewer_id: string | null;
          task_scale: number | null;
          progress_percentage: number | null;
          progress_owner?: 'manual'|'checklist';
          scaled_progress: number | null;
          task_productivity: number | null;
          priority: TaskPriority;
          status: TaskStatus;
          freshness: TaskFreshness | null;
          productivity_available?: boolean;
          lifecycle_version?: number;
          work_revision?: number;
          started_date?: string | null;
          eligibility_reasons?: string[];
          freshness_reason?: string | null;
          scale_mode?: string;
          scale_inputs?: Json;
          scale_override?: number | null;
          scale_provenance?: string;
          scale_version?: number;
          archived_effective_date?:string|null;
          archive_reason?:string|null;
          handoff_successor_id?:string|null;
          valid_for_metrics: boolean;
          assigned_date: string;
          due_date: string | null;
          completed_date: string | null;
          met_deadline: boolean | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          task_tag: string;
          title: string;
          category?: TaskCategory;
          description?: string | null;
          comments?: string | null;
          assignee_id: string;
          reviewer_id?: string | null;
          task_scale?: number | null;
          progress_percentage?: number | null;
          task_productivity?: number | null;
          priority?: TaskPriority;
          status?: TaskStatus;
          freshness?: TaskFreshness;
          valid_for_metrics?: boolean;
          assigned_date?: string;
          due_date?: string | null;
          completed_date?: string | null;
          met_deadline?: boolean | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      daily_task_logs: TableDefinition<
        {
          id: string;
          task_id: string;
          user_id: string;
          log_date: string;
          hours_worked: number;
          progress_delta: number | null;
          requested_progress_delta?: number | null;
          timer_segment_number?: number | null;
          timer_duration_seconds?: number | null;
          effective_progress_delta?: number | null;
          execution_version?: number;
          reversed_at?: string | null;
          participant_version?: number | null;
          credit_shares?: Json | null;
          credit_scale?: number | null;
          effect_contract?: string | null;
          update_notes: string | null;
          raw_links: string[] | null;
          log_source: TaskLogSource;
          source_timer_id: string | null;
          checklist_node_id?: string | null;
          created_at: string;
        },
        {
          id?: string;
          task_id: string;
          user_id: string;
          log_date?: string;
          hours_worked: number;
          progress_delta?: number | null;
          update_notes?: string | null;
          raw_links?: string[] | null;
          log_source?: TaskLogSource;
          source_timer_id?: string | null;
          created_at?: string;
        }
      >;
      monthly_performance_snapshots: TableDefinition<
        {
          calculation_rule_version?:string;
          calculation_context?:Json|null;
          factor_components?:Json|null;
          id: string;
          user_id: string;
          snapshot_month: number;
          snapshot_year: number;
          total_logged_hours: number | null;
          total_progress: number | null;
          productivity_score: number | null;
          loading_percentage_diff: number | null;
          criticality_score: number | null;
          freshness_score: number | null;
          attendance_hours: number | null;
          payable_days: number | null;
          absent_days: number | null;
          leave_days: number | null;
          is_star_performer: boolean | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          snapshot_month: number;
          snapshot_year: number;
          total_logged_hours?: number | null;
          calculation_rule_version?:string;
          calculation_context?:Json|null;
          factor_components?:Json|null;
          total_progress?: number | null;
          productivity_score?: number | null;
          loading_percentage_diff?: number | null;
          criticality_score?: number | null;
          freshness_score?: number | null;
          attendance_hours?: number | null;
          payable_days?: number | null;
          absent_days?: number | null;
          leave_days?: number | null;
          is_star_performer?: boolean | null;
          created_at?: string;
        }
      >;
      company_statements: TableDefinition<
        {
          id: string;
          key_name: string;
          title: string;
          statement: string;
          subtext: string | null;
          updated_at: string;
          updated_by: string | null;
        },
        {
          id?: string;
          key_name: string;
          title: string;
          statement: string;
          subtext?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        }
      >;
      company_milestones: TableDefinition<
        {
          id: string;
          title: string;
          description: string | null;
          status: MilestoneStatus;
          owner_id: string | null;
          delivered_count: number;
          target_count: number | null;
          due_date: string | null;
          created_at: string;
        },
        {
          id?: string;
          title: string;
          description?: string | null;
          status?: MilestoneStatus;
          owner_id?: string | null;
          delivered_count?: number;
          target_count?: number | null;
          due_date?: string | null;
          created_at?: string;
        }
      >;
      task_assignees: TableDefinition<
        {
          id: string;
          task_id: string;
          user_id: string;
          share_units: number | null;
          assignment_role: TaskAssignmentRole;
          is_primary: boolean;
          assigned_by: string | null;
          assigned_at: string;
          created_at: string;
        },
        OptionalId & {
          task_id: string;
          user_id: string;
          share_units?: number | null;
          assignment_role?: TaskAssignmentRole;
          is_primary?: boolean;
          assigned_by?: string | null;
          assigned_at?: string;
          created_at?: string;
        }
      >;
      task_reviewers: TableDefinition<
        {
          id: string;
          task_id: string;
          user_id: string;
          reviewer_role: TaskReviewerRole;
          is_primary: boolean;
          assigned_by: string | null;
          review_due_at: string | null;
          review_approved: boolean | null;
          reviewed_at: string | null;
          created_at: string;
        },
        OptionalId & {
          task_id: string;
          user_id: string;
          reviewer_role?: TaskReviewerRole;
          is_primary?: boolean;
          assigned_by?: string | null;
          review_due_at?: string | null;
          review_approved?: boolean | null;
          reviewed_at?: string | null;
          created_at?: string;
        }
      >;
      task_dependencies: TableDefinition<
        {
          id: string;
          predecessor_task_id: string;
          successor_task_id: string;
          relation_type: TaskRelationType;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        },
        OptionalId & {
          predecessor_task_id: string;
          successor_task_id: string;
          relation_type?: TaskRelationType;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        }
      >;
      task_detail_fields: TableDefinition<{key_name:string;title:string;group_name:string},{key_name:string;title:string;group_name:string}>;
      task_detail_templates: TableDefinition<{id:string;name:string;created_by:string|null;created_at:string},{name:string;id?:string;created_by?:string|null}>;
      task_detail_template_versions: TableDefinition<{id:string;template_id:string;version:number;payload:Json;requires_review:boolean;created_by:string|null;created_at:string},{template_id:string;version:number;payload:Json;id?:string}>;
      task_detail_instances: TableDefinition<{task_id:string;template_version_id:string;instructions:Json;initialized_at:string;initialized_by:string|null;provider_state:'not_requested'|'pending'|'failed'|'succeeded'},{task_id:string;template_version_id:string;instructions:Json}>;
      task_detail_review_flags: TableDefinition<{id:string;task_id:string;source_section_id:string|null;reason:string},{task_id:string;reason:string;source_section_id?:string|null}>;
      task_detail_sections: TableDefinition<
        {
          id: string;
          task_id: string;
          key_name: string;
          title: string;
          content: string | null;
          updated_by: string | null;
        } & TimestampColumns,
        OptionalId & {
          task_id: string;
          key_name: string;
          title: string;
          content?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      task_links: TableDefinition<
        {
          id: string;
          task_id: string;
          ipo_role: 'input'|'process'|'output'|'reference'|null;
          related_employee_id:string|null;
          related_report_id:string|null;
          link_type: TaskLinkType;
          label: string;
          url: string | null;
          storage_path: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        },
        OptionalId & {
          task_id: string;
          ipo_role?: 'input'|'process'|'output'|'reference'|null;
          related_employee_id?:string|null;
          related_report_id?:string|null;
          link_type?: TaskLinkType;
          label: string;
          url?: string | null;
          storage_path?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        }
      >;
      checklist_templates: TableDefinition<
        {
          id: string;
          name: string;
          description: string | null;
          created_by: string | null;
        } & TimestampColumns,
        OptionalId & {
          name: string;
          description?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      checklist_template_nodes: TableDefinition<
        {
          id: string;
          template_id: string;
          parent_node_id: string | null;
          node_type: ChecklistNodeType;
          title: string;
          description: string | null;
          sort_order: number;
          created_at: string;
        },
        OptionalId & {
          template_id: string;
          parent_node_id?: string | null;
          node_type?: ChecklistNodeType;
          title: string;
          description?: string | null;
          sort_order?: number;
          created_at?: string;
        }
      >;
      task_checklists: TableDefinition<
        {
          id: string;
          task_id: string;
          template_id: string | null;
          title: string;
          sync_progress_to_task: boolean;
          created_by: string | null;
        } & TimestampColumns,
        OptionalId & {
          task_id: string;
          template_id?: string | null;
          title: string;
          sync_progress_to_task?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      checklist_nodes: TableDefinition<
        {
          id: string;
          checklist_id: string;
          parent_node_id: string | null;
          linked_task_id: string | null;
          node_type: ChecklistNodeType;
          title: string;
          description: string | null;
          is_complete: boolean;
          detail_section?: 'setup'|'activity'|'closure'|null;
          completion_state?: 'Yes'|'No'|'N/A';
          sort_order: number;
          estimated_minutes: number | null;
          links?: string[];
          elapsed_seconds: number;
          completed_by: string | null;
          completed_at: string | null;
        } & TimestampColumns,
        OptionalId & {
          checklist_id: string;
          parent_node_id?: string | null;
          linked_task_id?: string | null;
          node_type?: ChecklistNodeType;
          title: string;
          description?: string | null;
          is_complete?: boolean;
          sort_order?: number;
          estimated_minutes?: number | null;
          elapsed_seconds?: number;
          completed_by?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      task_timers: TableDefinition<
        {
          id: string;
          task_id: string;
          user_id: string;
          status: TaskTimerStatus;
          execution_version?: number;
          started_at: string;
          stopped_at: string | null;
          elapsed_seconds: number;
          generated_log_id: string | null;
          notes: string | null;
          checklist_node_id?: string | null;
        } & TimestampColumns,
        OptionalId & {
          task_id: string;
          user_id: string;
          status?: TaskTimerStatus;
          started_at?: string;
          stopped_at?: string | null;
          elapsed_seconds?: number;
          generated_log_id?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      attendance_records: TableDefinition<
        {
          id: string;
          user_id: string;
          attendance_date: string;
          status: AttendanceStatus;
          check_in_at: string | null;
          check_out_at: string | null;
          attendance_hours: number;
          off_hours: number;
          holiday_name: string | null;
          notes: string | null;
          recorded_by: string | null;
          record_version?:number;
          hours_confirmed?:boolean;
          record_state?:'active'|'withdrawn';
        } & TimestampColumns,
        OptionalId & {
          user_id: string;
          attendance_date?: string;
          status?: AttendanceStatus;
          check_in_at?: string | null;
          check_out_at?: string | null;
          attendance_hours?: number;
          off_hours?: number;
          holiday_name?: string | null;
          notes?: string | null;
          recorded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      daily_star_records: TableDefinition<
        {
          id: string;
          star_date: string;
          user_id: string;
          score: number;
          productivity_component: number;
          progress_component: number;
          checklist_component: number;
          freshness_component: number;
          attendance_component: number;
          reason: string | null;
          is_override: boolean;
          override_by: string | null;
        } & TimestampColumns,
        OptionalId & {
          star_date?: string;
          user_id: string;
          score?: number;
          productivity_component?: number;
          progress_component?: number;
          checklist_component?: number;
          freshness_component?: number;
          attendance_component?: number;
          reason?: string | null;
          is_override?: boolean;
          override_by?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      performance_score_components: TableDefinition<
        {
          id: string;
          user_id: string;
          score_date: string;
          metric_key: string;
          metric_value: number;
          source_table: string | null;
          source_id: string | null;
          created_at: string;
        },
        OptionalId & {
          user_id: string;
          score_date?: string;
          metric_key: string;
          metric_value?: number;
          source_table?: string | null;
          source_id?: string | null;
          created_at?: string;
        }
      >;
      meeting_points: TableDefinition<
        {
          id: string;
          meeting_date: string;
          meeting_type: string | null;
          posted_by: string | null;
          point: string;
          folder_url: string | null;
          record_version?:number;
          validation_state?:'legacy_unvalidated'|'pending'|'validated'|'rejected'|'withdrawn';
          validation_at?:string|null;
          validation_reason?:string|null;
          related_task_id?:string|null;
          validated_by?:string|null;
          owner_id?:string|null;
          point_type?:string|null;
          resolution?:string|null;
          comments?:string|null;
          resolution_status?:string|null;
          resolution_due?:string|null;
          resolved_on?:string|null;
        } & TimestampColumns,
        OptionalId & {
          meeting_date?: string;
          meeting_type?: string | null;
          posted_by?: string | null;
          point: string;
          folder_url?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      daily_facts: TableDefinition<
        {
          id: string;
          fact_date: string;
          posted_by: string | null;
          fact: string;
          folder_url: string | null;
          is_validated: boolean;
          validated_by: string | null;
          record_version?:number;
          validation_state?:'legacy_unvalidated'|'pending'|'validated'|'rejected'|'withdrawn';
          validation_at?:string|null;
          validation_reason?:string|null;
          related_task_id?:string|null;
        } & TimestampColumns,
        OptionalId & {
          fact_date?: string;
          posted_by?: string | null;
          fact: string;
          folder_url?: string | null;
          is_validated?: boolean;
          validated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      ideas: TableDefinition<
        {
          id: string;
          idea_date: string;
          posted_by: string | null;
          idea: string;
          folder_url: string | null;
          is_validated: boolean;
          validated_by: string | null;
          record_version?:number;
          validation_state?:'legacy_unvalidated'|'pending'|'validated'|'rejected'|'withdrawn';
          validation_at?:string|null;
          validation_reason?:string|null;
          related_task_id?:string|null;
        } & TimestampColumns,
        OptionalId & {
          idea_date?: string;
          posted_by?: string | null;
          idea: string;
          folder_url?: string | null;
          is_validated?: boolean;
          validated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      suggestions: TableDefinition<
        {
          id: string;
          suggestion_date: string;
          posted_by: string | null;
          suggestion: string;
          folder_url: string | null;
          is_validated: boolean;
          validated_by: string | null;
          record_version?:number;
          validation_state?:'legacy_unvalidated'|'pending'|'validated'|'rejected'|'withdrawn';
          validation_at?:string|null;
          validation_reason?:string|null;
          related_task_id?:string|null;
        } & TimestampColumns,
        OptionalId & {
          suggestion_date?: string;
          posted_by?: string | null;
          suggestion: string;
          folder_url?: string | null;
          is_validated?: boolean;
          validated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      sales_logs: TableDefinition<
        {
          id: string;
          sale_date: string;
          sales_by: string | null;
          project_built_up_area: string | null;
          project_location: string | null;
          client_name: string | null;
          project_folder_url: string | null;
          is_new_project: boolean;
          basement_payment_received: boolean;
          notes: string | null;
          record_version?:number;
          validation_state?:'legacy_unvalidated'|'pending'|'validated'|'rejected'|'withdrawn';
          validation_at?:string|null;
          validation_reason?:string|null;
          related_task_id?:string|null;
          validated_by?:string|null;
        } & TimestampColumns,
        OptionalId & {
          sale_date?: string;
          sales_by?: string | null;
          project_built_up_area?: string | null;
          project_location?: string | null;
          client_name?: string | null;
          project_folder_url?: string | null;
          is_new_project?: boolean;
          basement_payment_received?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      report_snapshots: TableDefinition<
        {
          calculation_rule_version?:string;
          id: string;
          report_type: string;
          title: string;
          status: ReportStatus;
          period_start: string | null;
          period_end: string | null;
          employee_id: string | null;
          payload: Json;
          created_by: string | null;
        } & TimestampColumns,
        OptionalId & {
          report_type: string;
          title: string;
          status?: ReportStatus;
          calculation_rule_version?:string;
          period_start?: string | null;
          period_end?: string | null;
          employee_id?: string | null;
          payload?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
    };
    Views: Record<never, never>;
    Functions: {
      month_archive_command:{Args:{p_command:string;p_period:string;p_payload:Json;p_operation:string;p_expected_version?:number|null};Returns:Json};
      month_archive_read:{Args:{p_period:string;p_revision?:number|null;p_employee?:string|null};Returns:Json};
      month_archive_history:{Args:{p_period:string};Returns:Json};
      live_presentation_context:{Args:{p_from:string;p_to_exclusive:string;p_as_of:string;p_employee?:string|null};Returns:Json};
      drive_command:{Args:{p_task:string;p_command:string;p_payload:Json;p_expected_version:number;p_operation:string};Returns:Json};
      drive_read_model:{Args:Record<string,never>;Returns:Json};
      claim_drive_jobs:{Args:{p_limit?:number};Returns:Json};
      drive_job_context:{Args:{p_job:string;p_lease:string};Returns:Json};
      drive_job_plan:{Args:{p_job:string;p_lease:string;p_steps:Json};Returns:undefined};
      drive_asset_checkpoint:{Args:{p_job:string;p_lease:string;p_key:string;p_state?:Json|null};Returns:Json};
      finish_drive_job:{Args:{p_job:string;p_lease:string;p_error?:string|null};Returns:undefined};
      task_tools_preview:{Args:{p_command:string;p_payload:Json};Returns:Json};
      task_tools_command:{Args:{p_preview:string;p_operation:string};Returns:Json};
      award_command:{Args:{p_command:string;p_payload:Json;p_operation:string};Returns:Json};
      claim_award_jobs:{Args:{p_limit?:number};Returns:Json};
      queue_due_awards:{Args:{p_from:string;p_through:string;p_operation:string};Returns:Json};
      award_policy_context:{Args:Record<string,never>;Returns:Json};
      observation_clock:{Args:Record<string,never>;Returns:string};
      award_read_model:{Args:{p_from:string;p_to_exclusive:string;p_employee?:string|null};Returns:Json};
      performance_source_context:{Args:{p_from:string;p_to_exclusive:string;p_as_of:string};Returns:Json};
      claim_performance_jobs:{Args:{p_limit?:number};Returns:Json};
      finish_performance_job:{Args:{p_job:string;p_lease:string;p_result:Json|null;p_error?:string|null};Returns:undefined};
      dated_record_command:{Args:{p_kind:string;p_id:string|null;p_command:string;p_payload:Json;p_expected_version:number;p_operation:string};Returns:Json};
      dated_record_history:{Args:{p_kind:string;p_id:string};Returns:Json};
      attendance_input_context:{Args:{p_user:string;p_from:string;p_to_exclusive:string;p_as_of:string};Returns:Json};
      contribution_input_context:{Args:{p_from:string;p_to_exclusive:string;p_as_of:string};Returns:Json};
      checklist_command: {Args:{p_task:string;p_command:string;p_payload:Json;p_expected_version:number;p_operation:string};Returns:Json};
      checklist_rollups: {Args:{p_task_ids:string[]};Returns:Json};
      task_details_command: {Args:{p_task:string;p_command:string;p_payload:Json;p_expected_version:number;p_operation:string};Returns:Json};
      publish_task_detail_template: {Args:{p_template:string|null;p_name:string;p_payload:Json;p_expected_version:number;p_operation:string};Returns:Json};
      team_task_effort_totals: { Args: Record<string, never>; Returns: {task_id: string; hours_logged: number; log_count: number}[] };
      task_credit_summary: { Args: Record<string, never>; Returns: Json };
      create_task_log: { Args: { p_task_id: string; p_payload: Json; p_operation_id: string; }; Returns: Json };
      correct_task_log: { Args: { p_log_id: string; p_payload: Json; p_operation_id: string; p_expected_version: number; }; Returns: Json };
      reverse_task_log: { Args: { p_log_id: string; p_payload: Json; p_operation_id: string; p_expected_version: number; }; Returns: Json };
      start_task_timer: { Args: { p_task_id: string; p_payload: Json; p_operation_id: string; }; Returns: Json };
      start_checklist_item_timer: { Args: { p_node_id: string; p_payload: Json; p_operation_id: string; }; Returns: Json };
      stop_task_timer: { Args: { p_timer_id: string; p_payload: Json; p_operation_id: string; p_expected_version: number; }; Returns: Json };
      discard_task_timer: { Args: { p_timer_id: string; p_payload: Json; p_operation_id: string; p_expected_version: number; }; Returns: Json };
      set_task_participants: { Args: { p_task_id: string; p_assignees: string[]; p_reviewers: string[]; p_share_units: number[] | null; p_expected_version: number; p_accept_legacy?: boolean }; Returns: number };
      save_task_with_participants: { Args: { p_task_id: string | null; p_fields: Json; p_assignees: string[]; p_reviewers: string[]; p_share_units: number[] | null; p_expected_version: number | null; p_accept_legacy: boolean; p_operation_id: string }; Returns: string };
      participant_reconciliation: { Args: Record<never, never>; Returns: Json };
      record_task_review: { Args: { p_task_id: string; p_approved: boolean }; Returns: undefined };
      recalculate_task_metrics: { Args: { p_task_id: string; p_progress_delta: number }; Returns: undefined };
      task_effort_summary: { Args: { p_task_id: string }; Returns: { hours_logged: number; log_count: number }[] };
      task_effort_breakdown: { Args: { p_task_id: string }; Returns: Json };
      team_holiday_dates: { Args: { p_from: string; p_to: string }; Returns: string[] };
      team_summary_inputs: { Args: { p_year: number; p_month: number }; Returns: Json };
      is_task_assignee: { Args: { p_task_id: string }; Returns: boolean };
      can_read_employee_details: { Args: { p_user_id: string | null }; Returns: boolean };
      get_user_role: {
        Args: Record<never, never>;
        Returns: UserRole | null;
      };
      task_lifecycle_command: { Args: { p_task_id: string; p_command: string; p_payload: Json; p_expected_version: number; p_operation_id: string }; Returns: Json };
      decay_task_freshness: {
        Args: Record<never, never>;
        Returns: {
          updated_count: number;
          rotten_count: number;
          stale_count: number;
        }[];
      };
    };
    Enums: {
      user_role: UserRole;
      task_category: TaskCategory;
      task_priority: TaskPriority;
      task_status: TaskStatus;
      task_freshness: TaskFreshness | null;
          productivity_available?: boolean;
          lifecycle_version?: number;
          work_revision?: number;
          started_date?: string | null;
          eligibility_reasons?: string[];
          freshness_reason?: string | null;
          scale_mode?: string;
          scale_inputs?: Json;
          scale_override?: number | null;
          scale_provenance?: string;
          scale_version?: number;
      milestone_status: MilestoneStatus;
      task_assignment_role: TaskAssignmentRole;
      task_reviewer_role: TaskReviewerRole;
      task_relation_type: TaskRelationType;
      task_link_type: TaskLinkType;
      checklist_node_type: ChecklistNodeType;
      task_timer_status: TaskTimerStatus;
      task_log_source: TaskLogSource;
      attendance_status: AttendanceStatus;
      report_status: ReportStatus;
    };
    CompositeTypes: Record<never, never>;
  };
}

/** Convenience aliases for the snake_case row shapes. */
export type UserRow = Database['public']['Tables']['users']['Row'];
export type TaskRow = Database['public']['Tables']['tasks']['Row'];
export type DailyTaskLogRow =
  Database['public']['Tables']['daily_task_logs']['Row'];
export type MonthlyPerformanceSnapshotRow =
  Database['public']['Tables']['monthly_performance_snapshots']['Row'];
export type CompanyStatementRow =
  Database['public']['Tables']['company_statements']['Row'];
export type CompanyMilestoneRow =
  Database['public']['Tables']['company_milestones']['Row'];
export type TaskAssigneeRow =
  Database['public']['Tables']['task_assignees']['Row'];
export type TaskReviewerRow =
  Database['public']['Tables']['task_reviewers']['Row'];
export type TaskDependencyRow =
  Database['public']['Tables']['task_dependencies']['Row'];
export type TaskDetailSectionRow =
  Database['public']['Tables']['task_detail_sections']['Row'];
export type TaskLinkRow = Database['public']['Tables']['task_links']['Row'];
export type ChecklistTemplateRow =
  Database['public']['Tables']['checklist_templates']['Row'];
export type ChecklistTemplateNodeRow =
  Database['public']['Tables']['checklist_template_nodes']['Row'];
export type TaskChecklistRow =
  Database['public']['Tables']['task_checklists']['Row'];
export type ChecklistNodeRow =
  Database['public']['Tables']['checklist_nodes']['Row'];
export type TaskTimerRow = Database['public']['Tables']['task_timers']['Row'];
export type AttendanceRecordRow =
  Database['public']['Tables']['attendance_records']['Row'];
export type DailyStarRecordRow =
  Database['public']['Tables']['daily_star_records']['Row'];
export type PerformanceScoreComponentRow =
  Database['public']['Tables']['performance_score_components']['Row'];
export type MeetingPointRow =
  Database['public']['Tables']['meeting_points']['Row'];
export type DailyFactRow = Database['public']['Tables']['daily_facts']['Row'];
export type IdeaRow = Database['public']['Tables']['ideas']['Row'];
export type SuggestionRow =
  Database['public']['Tables']['suggestions']['Row'];
export type SalesLogRow = Database['public']['Tables']['sales_logs']['Row'];
export type ReportSnapshotRow =
  Database['public']['Tables']['report_snapshots']['Row'];
