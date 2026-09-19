import { NotificationType } from './types';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  entity_type: string;
  entity_id: string | null;
  actor_id: string | null;
  is_read: boolean;
  created_at: string;
}
