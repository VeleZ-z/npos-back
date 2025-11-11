Migración: productos.activo -> productos.estado_id (FK a estados)

1) Crear estados para productos (tipo = 2)

INSERT INTO estados (nombre, tipo, created_at, updated_at)
SELECT * FROM (
  SELECT 'ACTIVO' AS nombre, 2 AS tipo, NOW(), NOW()
) s
WHERE NOT EXISTS (
  SELECT 1 FROM estados e WHERE e.nombre = 'ACTIVO' AND e.tipo = 2
);

INSERT INTO estados (nombre, tipo, created_at, updated_at)
SELECT * FROM (
  SELECT 'INACTIVO' AS nombre, 2 AS tipo, NOW(), NOW()
) s
WHERE NOT EXISTS (
  SELECT 1 FROM estados e WHERE e.nombre = 'INACTIVO' AND e.tipo = 2
);

2) Agregar columna estado_id a productos

ALTER TABLE productos ADD COLUMN estado_id BIGINT UNSIGNED NULL AFTER categoria_id;

3) Backfill según activo

UPDATE productos p
JOIN estados e ON e.nombre = 'ACTIVO' AND e.tipo = 2
SET p.estado_id = e.id
WHERE p.activo = 1;

UPDATE productos p
JOIN estados e ON e.nombre = 'INACTIVO' AND e.tipo = 2
SET p.estado_id = e.id
WHERE p.activo = 0 OR p.activo IS NULL;

4) Crear FK e índice

ALTER TABLE productos ADD CONSTRAINT productos_estado_id_fk
  FOREIGN KEY (estado_id) REFERENCES estados(id) ON DELETE SET NULL;

CREATE INDEX idx_productos_estado_id ON productos(estado_id);

5) Quitar columna antigua (opcional una vez verificado)

ALTER TABLE productos DROP COLUMN activo;

Notas
- El backend ya mapea el booleano "active" a estados 'ACTIVO'/'INACTIVO' (tipo=2) por compatibilidad.
- Al crear o actualizar sin "estadoId", se usa 'ACTIVO' por defecto al crear, y se puede resolver desde "active" (booleano) en updates.

