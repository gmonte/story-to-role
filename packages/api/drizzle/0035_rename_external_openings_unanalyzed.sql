-- Openings registered with an external application were never analyzed:
-- they become openings registered without analysis.
UPDATE "openings" SET "status" = 'unanalyzed' WHERE "status" = 'external';
