export const PERMISSION_ACTION_REGEX = /^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/;

// Common past-tense words prohibited in permission naming
export const PROHIBITED_EVENT_ACTION_SUFFIXES = [
  'created',
  'updated',
  'deleted',
  'archived',
  'approved',
  'rejected',
  'deactivated',
  'activated',
  'synced',
  'requested',
  'viewed',
];
