export type UserType = 'professor' | 'staff';
export type CredentialKind = 'biometric' | 'authenticator' | 'nfc' | 'rfid';
export type PunchAction =
  'time_in' | 'time_out' | 'duplicate' | 'already_completed';

export interface Owner {
  biometricsRowId: string; // dtr_biometrics.id
  professorId: string | null;
  staffId: string | null;
}

export interface PunchResult {
  action: PunchAction;
  recordId: string;
  shiftDate: string;
  timeIn: string | null;
  timeOut: string | null;
  totalHours: string;
  onSite: boolean;
  professorId: string | null;
  staffId: string | null;
}

/** Represents a raw row returned from the `dtr` table queries */
export interface DtrRow {
  id: string;
  time_in: string | null;
  time_out: string | null;
  total_hours: string;
  on_site: boolean;
  shift_date: string;
  too_soon?: boolean;
}

/** Represents a row returned from the `dtr_biometrics` lookup/registration queries */
export interface BiometricsRow {
  id: string;
  professor_id: string | null;
  staff_id: string | null;
  biometrics_id: string | null;
}

/** Registration status return shape */
export interface RegistrationStatus {
  registered: number;
  nextFreeSlot: number | null;
}
