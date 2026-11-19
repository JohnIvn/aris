CREATE UNIQUE INDEX uq_ar_user_period_active
ON accomplishment_reports (user_id, period_start, period_end)
WHERE submission_status NOT IN ('rejected', 'returned');
