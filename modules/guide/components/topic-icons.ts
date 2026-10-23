import {
  BarChart3Icon,
  CalendarCheckIcon,
  ClockIcon,
  FileTextIcon,
  ListChecksIcon,
  ListTodoIcon,
  RocketIcon,
  ScrollTextIcon,
  TrophyIcon,
  type LucideIcon,
} from 'lucide-react';

import type { GuideTopic } from '@/shared/tracker/labels';

/** One icon per guide topic, shared by the home cards, the flow and the topic pages. */
export const TOPIC_ICON: Record<GuideTopic, LucideIcon> = {
  missions: ListChecksIcon,
  checklist: ListTodoIcon,
  time: ClockIcon,
  records: CalendarCheckIcon,
  recognition: TrophyIcon,
  waypoints: RocketIcon,
  policies: ScrollTextIcon,
  reports: FileTextIcon,
  analytics: BarChart3Icon,
};
