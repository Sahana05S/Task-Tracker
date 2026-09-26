import type {
  MilestoneStatus,
  TaskCategory,
  TaskFreshness,
  TaskPriority,
  TaskStatus,
  UserRole,
} from './tracker';

/**
 * Database shape for the Supabase client, mirroring
 * `supabase/migrations/01_init_schema.sql` and `04_milestones_and_vision.sql`.
 *
 * This is the snake_case wire format. `@/types/tracker` holds the camelCase
 * domain models the app works with, and `@/lib/supabase/mappers` converts
 * between them.
 *
 * Parameterising the client with this type is what keeps query results off
 * `any`. Without it `supabase.from(...)` degrades to `SupabaseClient<any>` and
 * every `data` value becomes untyped.
 *
 * Enum unions are imported from `./tracker` rather than redeclared, so the two
 * layers cannot drift apart. Replaceable wholesale by
 * `supabase gen types typescript` once the project is linked.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          employee_id: string;
          full_name: string;
          email: string;
          role: UserRole;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          employee_id: string;
          full_name: string;
          email: string;
          role?: UserRole;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          employee_id?: string;
          full_name?: string;
          email?: string;
          role?: UserRole;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
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
          /** GENERATED ALWAYS ... STORED — read-only, absent from Insert/Update. */
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
        };
        Insert: {
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
        };
        Update: {
          id?: string;
          task_tag?: string;
          title?: string;
          category?: TaskCategory;
          description?: string | null;
          comments?: string | null;
          assignee_id?: string;
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
        };
        Relationships: [
          {
            foreignKeyName: 'tasks_assignee_id_fkey';
            columns: ['assignee_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
            isOneToOne: false;
          },
          {
            foreignKeyName: 'tasks_reviewer_id_fkey';
            columns: ['reviewer_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
            isOneToOne: false;
          },
        ];
      };
      daily_task_logs: {
        Row: {
          id: string;
          task_id: string;
          user_id: string;
          log_date: string;
          hours_worked: number;
          progress_delta: number | null;
          update_notes: string | null;
          raw_links: string[] | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          user_id: string;
          log_date?: string;
          hours_worked: number;
          progress_delta?: number | null;
          update_notes?: string | null;
          raw_links?: string[] | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          user_id?: string;
          log_date?: string;
          hours_worked?: number;
          progress_delta?: number | null;
          update_notes?: string | null;
          raw_links?: string[] | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'daily_task_logs_task_id_fkey';
            columns: ['task_id'];
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
            isOneToOne: false;
          },
          {
            foreignKeyName: 'daily_task_logs_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
            isOneToOne: false;
          },
        ];
      };
      monthly_performance_snapshots: {
        Row: {
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
          is_star_performer: boolean | null;
          created_at: string;
        };
        Insert: {
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
          is_star_performer?: boolean | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          snapshot_month?: number;
          snapshot_year?: number;
          total_logged_hours?: number | null;
          total_progress?: number | null;
          productivity_score?: number | null;
          loading_percentage_diff?: number | null;
          criticality_score?: number | null;
          freshness_score?: number | null;
          is_star_performer?: boolean | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'monthly_performance_snapshots_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
            isOneToOne: false;
          },
        ];
      };
      company_statements: {
        Row: {
          id: string;
          key_name: string;
          title: string;
          statement: string;
          subtext: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          key_name: string;
          title: string;
          statement: string;
          subtext?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          key_name?: string;
          title?: string;
          statement?: string;
          subtext?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'company_statements_updated_by_fkey';
            columns: ['updated_by'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
            isOneToOne: false;
          },
        ];
      };
      company_milestones: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          status: MilestoneStatus;
          owner_id: string | null;
          delivered_count: number;
          target_count: number | null;
          due_date: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          status?: MilestoneStatus;
          owner_id?: string | null;
          delivered_count?: number;
          target_count?: number | null;
          due_date?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          status?: MilestoneStatus;
          owner_id?: string | null;
          delivered_count?: number;
          target_count?: number | null;
          due_date?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'company_milestones_owner_id_fkey';
            columns: ['owner_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
            isOneToOne: false;
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      get_user_role: {
        Args: Record<never, never>;
        Returns: UserRole;
      };
    };
    Enums: {
      user_role: UserRole;
      task_category: TaskCategory;
      task_priority: TaskPriority;
      task_status: TaskStatus;
      task_freshness: TaskFreshness;
      milestone_status: MilestoneStatus;
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
