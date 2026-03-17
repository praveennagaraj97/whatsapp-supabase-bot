-- Remove old ecommerce demo rows inserted by previous generic migration.
-- Safe: only deletes rows that exactly match known seed markers.

DELETE FROM project_data_tables
WHERE table_name = 'products'
  AND rows @> '[{"id":"p-100"}]'::jsonb
  AND rows @> '[{"id":"p-101"}]'::jsonb
  AND rows @> '[{"id":"p-102"}]'::jsonb;

DELETE FROM project_data_tables
WHERE table_name = 'orders'
  AND rows @> '[{"orderId":"ORD-9001"}]'::jsonb
  AND rows @> '[{"orderId":"ORD-9002"}]'::jsonb;
