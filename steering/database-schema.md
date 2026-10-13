# Database Schema & Security Specification

> M00 note (10 October 2026): This document describes historical or provisional
> behavior. Conflicting business rules and completion claims are superseded by
> [RULES](../docs/plans/RULES.md), [DECISIONS](../docs/plans/DECISIONS.md) and
> the [M00 conflict ledger](../docs/plans/M00-evidence.md#older-documentation-conflicts).
> Retain unrelated architecture notes. Named missing script handlers do not
> establish implemented parity. M01 has not started.

## Database Engine: PostgreSQL via Supabase

### 1. Custom Types & Enums
```sql
CREATE TYPE user_role AS ENUM (
    'managing_director', 
    'project_engineer', 
    'data_manager', 
    'team_member'
);

CREATE TYPE task_category AS ENUM (
    'SD',  -- Skill Development
    'WK',  -- Work Organizing
    'T',   -- General Task
    'PJT', -- Project Task
    'RSC', -- Research
    'QAC', -- Quality & Testing
    'MKT', -- Marketing
    'ACC', -- Accounting
    'ITH', -- InfoTech
    'OFM', -- Office Maintenance
    'MG',  -- Management
    'AD',  -- Admin
    'OT'   -- Other / Off-Hours
);

CREATE TYPE task_priority AS ENUM ('Low', 'Medium', 'High', 'Focus', 'No');
CREATE TYPE task_status AS ENUM ('Not Started', 'In Progress', 'Discarded', 'Done');
CREATE TYPE task_freshness AS ENUM ('Fresh', 'Stale', 'Rotten');