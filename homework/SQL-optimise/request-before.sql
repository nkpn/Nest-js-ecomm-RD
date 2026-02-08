SELECT
  o.id,
  o.status,
  o.created_at,
  SUM(oi.quantity * oi.price_snapshot) AS total_amount
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.status = 'CREATED'
  AND o.created_at >= '2026-02-01'
  AND o.created_at < '2026-03-01'
GROUP BY o.id, o.status, o.created_at
HAVING SUM(oi.quantity * oi.price_snapshot) > 20
ORDER BY o.created_at DESC;