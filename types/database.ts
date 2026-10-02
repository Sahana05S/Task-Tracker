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
          task_tag: string;
          title: string;
          category: TaskCategory;
          description: string | null;
          comments: string | null;
          assignee_id: string;
          reviewer_id: string | null;
          task_scale: number | null;
          progress_percentage: number | null;
          scaled_progress: number | null;
          task_productivity: number | null;
          priority: TaskPriority;
          status: TaskStatus;
          freshness: TaskFreshness;
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
          update_notes: string | null;
          raw_links: string[] | null;
          log_source: TaskLogSource;
          source_timer_id: string | null;
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
          assignment_role: TaskAssignmentRole;
          is_primary: boolean;
          assigned_by: string | null;
          assigned_at: string;
          created_at: string;
        },
        OptionalId & {
          task_id: string;
          user_id: string;
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
          sort_order: number;
          estimated_minutes: number | null;
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
          started_at: string;
          stopped_at: string | null;
          elapsed_seconds: number;
          generated_log_id: string | null;
          notes: string | null;
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
      get_user_role: {
        Args: Record<never, never>;
        Returns: UserRole;
      };
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
      task_freshness: TaskFreshness;
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
