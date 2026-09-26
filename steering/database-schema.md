# Database Schema & Security Specification

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