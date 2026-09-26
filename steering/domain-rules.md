# Domain Rules & Mathematical Specification

## Task Classification & System Taxonomies

### 1. Task Categories (Generalized & Extensible)
- `SD`  : Skill Development
- `WK`  : Work Organizing
- `T`   : General Task
- `PJT` : Project / Core Task
- `RSC` : Research & Analysis
- `QAC` : Quality & Testing
- `MKT` : Marketing & Outreach
- `ACC` : Accounting & Finance
- `ITH` : InfoTech & Systems
- `OFM` : Office / Facilities Management
- `MG`  : Management & Strategy
- `AD`  : Admin & Operations
- `OT`  : Other / Off-Hours

### 2. Task Priorities
- `Focus` : Highest priority, requires immediate execution focus.
- `High`  : Major deliverable with strict deadline dependencies.
- `Medium`: Standard priority level (Default).
- `Low`   : Low impact or secondary task.
- `No`    : Backlog or un-prioritized item.

### 3. Task Statuses
- `Not Started` : Initial creation state.
- `In Progress` : Active work or logs recorded.
- `Done`        : Task scale and deliverables fully completed.
- `Discarded`   : Cancelled or archived without impact on completion score.

### 4. Task Freshness States
- `Fresh`  : Updated within the last 7 days or actively logged.
- `Stale`  : No activity or updates logged for 7–14 days.
- `Rotten` : Inactive for over 14 days without reaching completion.

---

## Core Mathematical Models & Calculations

### 1. Task Progress Metrics

#### Scaled Progress
measures the actual work completed based on the assigned task weight.
$$\text{Scaled Progress} = \text{Task Scale} \times \left(\frac{\text{Progress Percentage}}{100}\right)$$

#### Task Productivity (Progress per Hour)
$$\text{Task Productivity} = \frac{\text{Scaled Progress}}{\text{Total Hours Worked}}$$

---

### 2. Team Performance & Median Differentials

All team evaluations compare an individual's output against the **Team Median** calculated across all active members for the active tracking period (e.g., current month).

#### A. Team Median Productivity
1. Collect individual productivity rates $P_i = \frac{\sum \text{Scaled Progress}_i}{\sum \text{Hours Logged}_i}$ for all active members.
2. Find the median value $M_P = \text{Median}(P_1, P_2, \dots, P_n)$.
3. Calculate Productivity Differential:
$$\text{Productivity Diff} = P_i - M_P$$

#### B. Priority Loading & Allocation Percentage
Measures the share of total team workload assigned to an individual member.
$$\text{Task Allocation \%}_i = \left( \frac{\sum \text{Task Scale}_i}{\sum \text{Total Team Task Scale}} \right) \times 100$$
$$\text{Loading Diff} = \text{Task Allocation \%}_i - \text{Median Task Allocation \%}$$

#### C. Criticality Score & Deviations
Each priority level carries a numerical weight:
- `Focus` = 4.0 | `High` = 3.0 | `Medium` = 2.0 | `Low` = 1.0 | `No` = 0.0

$$\text{Criticality Score}_i = \text{Average Priority Weight of Assigned Tasks}_i$$
$$\text{Criticality Diff} = \text{Criticality Score}_i - \text{Median Criticality Score}$$

---

### 3. Star Performer Selection Algorithm

The **Star Performer of the Month** is determined by calculating a composite performance score $S_i$ across all valid metric-bearing tasks:

$$S_i = w_1 \cdot (\text{Productivity Diff}_i) + w_2 \cdot (\text{Total Scaled Progress}_i) + w_3 \cdot (\text{Freshness Score}_i) - w_4 \cdot (\text{Rotten Tasks Count}_i)$$

*(Where standard weights are $w_1 = 0.4$, $w_2 = 0.3$, $w_3 = 0.2$, $w_4 = 0.1$)*

---

### 4. Metrics Eligibility Rules
To maintain dataset integrity:
- A task is marked `valid_for_metrics = true` **ONLY IF** `Hours Logged > 0` and `Task Scale > 0`.
- Placeholder tasks, off-hours placeholders (`OT`), and zero-scale administrative entries are excluded from team median calculations.