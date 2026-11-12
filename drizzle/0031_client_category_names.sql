-- The clinic page lists the services under their categories ("Mãos", "Pés"),
-- so app_client reads the category's name and order too. Both are public:
-- the page shows them. The row policy of 0013 (one clinic per transaction)
-- is unchanged.
--
-- Compatible with the code still running when this applies: it only adds
-- column privileges.
GRANT SELECT (name, sort_order) ON service_categories TO app_client;
