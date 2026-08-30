# Telemetry & Metrics Contract: Scheduled Authorization Reconciliation

**Feature**: `026-scheduled-authz-reconciliation`
**Status**: Completed

## 1. Prometheus Metrics

The scheduled reconciliation scanner exposes dedicated metrics to track sweep execution, entity discovery, and multi-pod lock contention.

| Metric Name | Type | Labels | Description |
|---|---|---|---|
| `authz_scheduled_reconciliation_sweep_duration_seconds` | Histogram | None | Total duration of the scheduled dirty entity scan and enqueue cycle in seconds. |
| `authz_scheduled_reconciliation_dirty_entities_discovered_total` | Counter | `source_type` (`USER_GROUP`, `ROLE`) | Total count of dirty entities (`version <> projection_version`) discovered during scheduled sweeps. |
| `authz_scheduled_reconciliation_tenants_scanned_total` | Counter | None | Total count of active tenants evaluated during scheduled sweeps. |
| `authz_scheduled_reconciliation_lock_acquisitions_total` | Counter | `status` (`acquired`, `contended_skipped`, `failed`) | Count of distributed lock acquisition attempts by the scheduled scanner. |

---

## 2. Structured Log Contract

On each scheduled sweep completion or skip, the scanner outputs a structured JSON log entry:

```json
{
  "timestamp": "2026-08-31T00:00:02.150Z",
  "level": "INFO",
  "context": "ScheduledReconciliationScanner",
  "message": "Scheduled authorization reconciliation sweep completed",
  "sweepDurationMs": 2150,
  "tenantsScanned": 48,
  "dirtyEntitiesFound": {
    "userGroups": 12,
    "roles": 0
  },
  "jobsEnqueued": 12,
  "lockStatus": "acquired"
}
```
