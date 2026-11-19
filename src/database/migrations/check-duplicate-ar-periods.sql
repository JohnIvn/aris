SELECT user_id, period_start, period_end, COUNT(*)
FROM accomplishment_reports
WHERE submission_status NOT IN ('rejected', 'returned')
GROUP BY user_id, period_start, period_end
HAVING COUNT(*) > 1;
