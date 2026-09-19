import { NotificationType } from './types';

export interface Notification {
  id: string;
  user_id: string | null;
  type: NotificationType;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_id: string | null;
  is_read: boolean;
  created_at: string;
}
